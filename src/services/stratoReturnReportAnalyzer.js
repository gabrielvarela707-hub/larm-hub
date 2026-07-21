/**
 * Extracao assistida por IA do relatorio Strato "Critica Cobranca".
 *
 * A IA e usada somente para transformar PDF/imagem em dados estruturados.
 * A decisao de conciliar e baixar continua sendo deterministica no backend.
 */

const {
  DEFAULT_AI_MODELS,
  listAiModels,
  normalizeModelId,
  isUnavailableModelError,
} = require('./aiModelService');

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
  if (!cleaned) throw new Error('A IA nao retornou conteudo para o relatorio Strato.');

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || cleaned;
  try {
    return JSON.parse(candidate);
  } catch (_) {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error('A IA nao retornou JSON valido para o relatorio Strato.');
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
  if (!response.ok) throw new Error(json?.error?.message || 'Erro ao consultar OpenAI para ler o relatorio Strato.');
  return parseAiJson(extractTextFromOpenAIResponse(json));
}

async function requestGemini({ apiKey, model, mimeType, base64 }) {
  const selectedModel = normalizeModelId(model) || DEFAULT_AI_MODELS.gemini;
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
  const configuredModel = normalizeModelId(model)
    || normalizeModelId(process.env.GEMINI_VISION_MODEL)
    || DEFAULT_AI_MODELS.gemini;

  let result = await requestGemini({ apiKey, model: configuredModel, mimeType, base64 });

  if (!result.response.ok && isUnavailableModelError(result.response.status, result.json)) {
    const available = await listAiModels({ provider: 'gemini', apiKey, configuredModel });
    if (available.recommendedModel && available.recommendedModel !== result.selectedModel) {
      result = await requestGemini({
        apiKey,
        model: available.recommendedModel,
        mimeType,
        base64,
      });
    }
  }

  if (!result.response.ok) {
    throw new Error(result.json?.error?.message || 'Erro ao consultar Gemini para ler o relatorio Strato.');
  }
  return parseAiJson(extractTextFromGeminiResponse(result.json));
}

async function analyzeStratoReturnReport({ provider, apiKey, model, filename, mimeType, base64 }) {
  if (!apiKey) throw new Error('Chave da IA nao configurada.');
  const selectedProvider = provider === 'gemini' ? 'gemini' : 'openai';
  const raw = selectedProvider === 'gemini'
    ? await analyzeWithGemini({ apiKey, model, mimeType, base64 })
    : await analyzeWithOpenAI({ apiKey, model, filename, mimeType, base64 });
  return normalizeStratoReport(raw, { filename, provider: selectedProvider });
}

module.exports = {
  analyzeStratoReturnReport,
  normalizeStratoReport,
  normalizeFilename,
  parseParcelFraction,
};
