/**
 * Extração do relatório Strato "Crítica Cobrança" — v0.4.9.
 *
 * Prioridade:
 * 1. PDF textual: leitura local e determinística, sem depender de modelo de IA.
 * 2. PDF escaneado/imagem: usa a mesma configuração de IA do sistema.
 *
 * A conciliação e a baixa continuam sendo decididas pelo backend financeiro.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let pdfParse = null;
try {
  // Usa pdf-parse apenas quando ele já estiver disponível. A ausência do módulo
  // não pode impedir a API inteira de iniciar.
  pdfParse = require('pdf-parse');
} catch (error) {
  pdfParse = null;
}

let aiModelService = {};
try {
  aiModelService = require('./aiModelService');
} catch (error) {
  // Compatibilidade com instalações anteriores: o PDF textual continua
  // funcionando mesmo que o serviço de listagem de modelos ainda não exista.
}

const DEFAULT_AI_MODELS = aiModelService.DEFAULT_AI_MODELS || {
  openai: 'gpt-4.1-mini',
  gemini: 'gemini-2.5-flash',
};
const normalizeModelId = aiModelService.normalizeModelId
  || (value => String(value || '').trim().replace(/^models\//i, ''));
const isRetiredAiModel = aiModelService.isRetiredAiModel
  || ((provider, value) => provider === 'gemini' && /^gemini-1\.(?:0|5)(?:-|$)/i.test(normalizeModelId(value)));
const isUnavailableModelError = aiModelService.isUnavailableModelError
  || ((status, json) => {
    const message = String(json?.error?.message || '').toLowerCase();
    return status === 404 || message.includes('not found') || message.includes('not supported for generatecontent');
  });
const resolveAiModel = aiModelService.resolveAiModel
  || (async () => ({ model: 'gemini-2.5-flash' }));

const STRATO_RETURN_REPORT_PROMPT = `
Voce e um extrator de dados do relatorio Strato 8.9 "CRITICA COBRANCA".
Leia o PDF ou imagem anexado e retorne somente JSON valido, sem markdown e sem comentarios.
Nao invente dados. Quando um campo nao estiver visivel, use null.

Formato obrigatorio:
{
  "arquivo_retorno": "CB100700.RET" | null,
  "empresa": string | null,
  "banco_codigo": string | null,
  "conta_bancaria": string | null,
  "titulos": [
    {
      "obra": string | null,
      "unidade": string | null,
      "parcela": string | null,
      "boleto": string | null,
      "vencimento": "YYYY-MM-DD" | null,
      "valor_titulo": number | null,
      "conta": string | null,
      "cliente_codigo": string | null,
      "cliente_nome": string | null,
      "data_pagamento": "YYYY-MM-DD" | null,
      "valor_pago": number | null,
      "ocorrencia": string | null,
      "motivo": string | null
    }
  ]
}

Regras de leitura:
- "BOLETO" deve manter todos os digitos, inclusive o digito verificador final.
- Em linhas como "1253-ALINE PEREIRA DA SILVA", cliente_codigo e 1253 e cliente_nome e ALINE PEREIRA DA SILVA.
- "PARCELA" deve preservar a fracao, por exemplo 073/120.
- Valores devem ser numeros em reais com ponto decimal.
- Datas devem estar em ISO YYYY-MM-DD.
- O nome do arquivo de retorno normalmente aparece no caminho ao lado de CRITICA COBRANCA.
- Cada titulo do corpo do relatorio deve gerar um item em titulos.
- Nao inclua as linhas TOTAL A PAGAR, TOTAL PAGO ou TOTAL DIFERENCAS como titulos.
`;

function extractTextFromOpenAIResponse(json) {
  if (json?.output_text) return json.output_text;
  const output = Array.isArray(json?.output) ? json.output : [];
  return output
    .flatMap(item => (Array.isArray(item?.content) ? item.content : []))
    .map(part => part?.text || part?.value || '')
    .filter(Boolean)
    .join('\n');
}

function extractTextFromGeminiResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts.map(part => part?.text || '').filter(Boolean).join('\n');
}

function parseAiJson(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) throw new Error('A IA não retornou conteúdo para o relatório Strato.');

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || cleaned;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error('A IA não retornou JSON válido para o relatório Strato.');
  }
}

function cleanText(value, maxLength = 240) {
  if (value === undefined || value === null) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeDate(value) {
  const text = cleanText(value, 20);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}

function normalizeMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const text = String(value).trim();
  if (!text) return null;
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function firstBrazilianMoney(value) {
  const match = String(value || '').match(/-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/);
  return match ? normalizeMoney(match[0]) : null;
}

function normalizeOccurrence(value) {
  const match = String(value || '').match(/\b(\d{1,2})\b/);
  return match ? match[1].padStart(2, '0') : null;
}

function normalizeFilename(value) {
  const text = cleanText(value, 260);
  if (!text) return null;
  const basename = text.split(/[\\/]/).pop() || text;
  const match = basename.match(/([A-Z0-9_-]+\.RET)\b/i);
  return (match?.[1] || basename).toUpperCase();
}

function parseParcelFraction(value) {
  const text = cleanText(value, 80);
  const match = text?.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
  return {
    parcela: text,
    parcela_numero: match ? Number(match[1]) : null,
    parcela_total: match ? Number(match[2]) : null,
  };
}

function normalizeStratoReport(raw, metadata = {}) {
  const titles = Array.isArray(raw?.titulos) ? raw.titulos : [];
  const normalizedTitles = titles
    .map((item, index) => {
      const fraction = parseParcelFraction(item?.parcela);
      const boleto = onlyDigits(item?.boleto) || null;
      return {
        indice_relatorio: index + 1,
        obra: cleanText(item?.obra, 30),
        unidade: cleanText(item?.unidade, 80),
        parcela: fraction.parcela,
        parcela_numero: fraction.parcela_numero,
        parcela_total: fraction.parcela_total,
        boleto,
        vencimento: normalizeDate(item?.vencimento),
        valor_titulo: normalizeMoney(item?.valor_titulo),
        conta: cleanText(item?.conta, 40),
        cliente_codigo: cleanText(item?.cliente_codigo, 40),
        cliente_nome: cleanText(item?.cliente_nome, 180),
        data_pagamento: normalizeDate(item?.data_pagamento),
        valor_pago: normalizeMoney(item?.valor_pago),
        ocorrencia: normalizeOccurrence(item?.ocorrencia),
        motivo: cleanText(item?.motivo, 180),
      };
    })
    .filter(item => item.boleto || item.parcela || item.cliente_nome || item.valor_titulo !== null || item.valor_pago !== null);

  return {
    nome_arquivo_relatorio: cleanText(metadata.filename, 160) || 'relatorio-strato.pdf',
    provider: metadata.provider || null,
    arquivo_retorno: normalizeFilename(raw?.arquivo_retorno),
    empresa: cleanText(raw?.empresa, 180),
    banco_codigo: onlyDigits(raw?.banco_codigo) || null,
    conta_bancaria: cleanText(raw?.conta_bancaria, 60),
    titulos: normalizedTitles,
  };
}

function parseStratoPdfText(text) {
  const source = String(text || '').replace(/\r/g, '');
  if (!/CR[IÍ]TICA\s+COBRAN[CÇ]A/i.test(source)) return null;

  const lines = source
    .split('\n')
    .map(line => line.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean);

  const arquivoRetorno = source.match(/([A-Z0-9_-]+\.RET)\b/i)?.[1] || null;
  const bancoCodigo = source.match(/Banco:\s*(\d+)/i)?.[1] || null;
  const contaBancaria = source.match(/Conta:\s*([0-9.-]+)/i)?.[1] || null;
  const contaDigits = onlyDigits(String(contaBancaria || '').split('-')[0]);
  const empresa = cleanText(lines.find(line => /Pag\s*\d+/i.test(line))?.replace(/Pag\s*\d+.*$/i, ''), 180);

  const titulos = [];
  const titlePattern = /^(\d{4})\s*([A-Z0-9]+(?:-[A-Z0-9]+)?)\s+(\d{1,3}\s*\/\s*\d{1,3})\s+(\d{10,20})\s*(\d{2}\/\d{2}\/\d{4})(.*)$/i;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^TOTAL\s+A\s+PAGAR/i.test(line)) break;

    const match = line.match(titlePattern);
    if (!match) continue;

    const item = {
      obra: match[1],
      unidade: match[2],
      parcela: match[3].replace(/\s+/g, ''),
      boleto: match[4],
      vencimento: match[5],
      valor_titulo: firstBrazilianMoney(match[6]),
      conta: contaBancaria,
      cliente_codigo: null,
      cliente_nome: null,
      data_pagamento: null,
      valor_pago: null,
      ocorrencia: null,
      motivo: null,
    };

    for (let offset = 1; offset <= 3 && index + offset < lines.length; offset += 1) {
      const detailLine = lines[index + offset];
      if (titlePattern.test(detailLine) || /^TOTAL\s+A\s+PAGAR/i.test(detailLine)) break;

      const occurrenceMatch = detailLine.match(/(?:^|\s)(\d{2})-Motivo\s+(.+)$/i);
      if (occurrenceMatch) {
        item.ocorrencia = occurrenceMatch[1];
        item.motivo = occurrenceMatch[2].replace(/\d+\s*$/, '').trim() || null;
        continue;
      }

      const withoutAccount = contaDigits && detailLine.startsWith(contaDigits)
        ? detailLine.slice(contaDigits.length).trim()
        : detailLine;
      const paymentMatch = withoutAccount.match(/^(\d+)-(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
      if (paymentMatch) {
        item.cliente_codigo = paymentMatch[1];
        item.cliente_nome = paymentMatch[2].trim();
        item.data_pagamento = paymentMatch[3];
        item.valor_pago = firstBrazilianMoney(paymentMatch[4]);
        continue;
      }

      const paymentWithoutClient = detailLine.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+)$/);
      if (paymentWithoutClient && !item.data_pagamento) {
        item.data_pagamento = paymentWithoutClient[1];
        item.valor_pago = firstBrazilianMoney(paymentWithoutClient[2]);
      }
    }

    titulos.push(item);
  }

  if (!titulos.length) return null;

  return {
    arquivo_retorno: arquivoRetorno,
    empresa,
    banco_codigo: bancoCodigo,
    conta_bancaria: contaBancaria,
    titulos,
  };
}

async function extractPdfTextWithoutDependency(buffer) {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'larmhub-strato-'));
  const inputPath = path.join(tempDir, 'relatorio.pdf');

  try {
    await fs.promises.writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', inputPath, '-'],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    return String(stdout || '');
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function analyzePdfLocally({ filename, base64 }) {
  const buffer = Buffer.from(String(base64 || ''), 'base64');
  if (!buffer.length) return null;

  let text = '';

  if (pdfParse) {
    try {
      const parsed = await pdfParse(buffer);
      text = String(parsed?.text || '');
    } catch (error) {
      text = '';
    }
  }

  if (!text.trim()) {
    try {
      text = await extractPdfTextWithoutDependency(buffer);
    } catch (error) {
      // Se pdftotext não estiver disponível ou o PDF não possuir texto,
      // retorna null e o fluxo existente poderá usar a IA como fallback.
      return null;
    }
  }

  const raw = parseStratoPdfText(text);
  return raw ? normalizeStratoReport(raw, { filename, provider: 'strato_pdf_local' }) : null;
}

async function analyzeWithOpenAI({ apiKey, model, filename, mimeType, base64 }) {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const filePart = mimeType === 'application/pdf'
    ? {
        type: 'input_file',
        filename: filename || 'relatorio-strato.pdf',
        file_data: dataUrl,
      }
    : { type: 'input_image', image_url: dataUrl };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: normalizeModelId(model) || process.env.OPENAI_VISION_MODEL || DEFAULT_AI_MODELS.openai,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: STRATO_RETURN_REPORT_PROMPT },
          filePart,
        ],
      }],
      temperature: 0.1,
      max_output_tokens: 3000,
    }),
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.error?.message || 'Erro ao consultar OpenAI para ler o relatório Strato.');
  return parseAiJson(extractTextFromOpenAIResponse(json));
}

function workingGeminiModel(configuredModel) {
  const candidates = [
    process.env.GEMINI_VISION_MODEL,
    configuredModel,
    DEFAULT_AI_MODELS.gemini,
    'gemini-2.5-flash',
  ];

  for (const candidate of candidates) {
    const model = normalizeModelId(candidate);
    if (model && !isRetiredAiModel('gemini', model)) return model;
  }
  return 'gemini-2.5-flash';
}

async function requestGemini({ apiKey, model, mimeType, base64 }) {
  const selectedModel = workingGeminiModel(model);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: STRATO_RETURN_REPORT_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json',
        },
      }),
    },
  );

  const json = await response.json().catch(() => ({}));
  return { response, json, selectedModel };
}

async function analyzeWithGemini({ apiKey, model, mimeType, base64 }) {
  let result = await requestGemini({ apiKey, model, mimeType, base64 });

  if (!result.response.ok && isUnavailableModelError(result.response.status, result.json)) {
    const refreshed = await resolveAiModel({
      provider: 'gemini',
      apiKey,
      configuredModel: null,
      forceRefresh: true,
    });

    if (refreshed.model && refreshed.model !== result.selectedModel) {
      result = await requestGemini({
        apiKey,
        model: refreshed.model,
        mimeType,
        base64,
      });
    }
  }

  if (!result.response.ok) {
    throw new Error(`${result.json?.error?.message || 'Erro ao consultar Gemini para ler o relatório Strato.'} [modelo=${result.selectedModel}]`);
  }
  return parseAiJson(extractTextFromGeminiResponse(result.json));
}

async function analyzeStratoReturnReport({ provider, apiKey, model, filename, mimeType, base64 }) {
  if (mimeType === 'application/pdf') {
    try {
      const localResult = await analyzePdfLocally({ filename, base64 });
      if (localResult?.titulos?.length) return localResult;
    } catch (error) {
      // PDF escaneado, protegido ou sem camada de texto: segue para a IA.
    }
  }

  if (!apiKey) throw new Error('Chave da IA não configurada para analisar relatório sem texto pesquisável.');
  const selectedProvider = provider === 'gemini' ? 'gemini' : 'openai';
  const raw = selectedProvider === 'gemini'
    ? await analyzeWithGemini({ apiKey, model, mimeType, base64 })
    : await analyzeWithOpenAI({ apiKey, model, filename, mimeType, base64 });
  return normalizeStratoReport(raw, { filename, provider: selectedProvider });
}

module.exports = {
  analyzeStratoReturnReport,
  analyzePdfLocally,
  parseStratoPdfText,
  normalizeStratoReport,
  normalizeFilename,
  parseParcelFraction,
};
