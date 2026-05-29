/**
 * server/src/routes/fornecedores_bancos.js
 * Fornecedores, Bancos/Contas, Plano de Contas, Lançamentos CP
 */

const express = require("express");
const { query, transaction } = require("../config/database");
const { authenticate } = require("../middleware/authenticate");
const logger = require("../config/logger");
const { PLANO_CONTAS_SEED } = require("../data/plano_contas_seed");

const router = express.Router();
router.use(authenticate);

const AI_JSON_SCHEMA_PROMPT = `
Você é um extrator de dados financeiros para Contas a Pagar no Brasil.
Leia o PDF/imagem anexado e retorne somente JSON válido, sem markdown e sem comentários.
Quando não encontrar um dado, use null.

Formato obrigatório:
{
  "fornecedor_nome": string|null,
  "fornecedor_cnpj": string|null,
  "tipo_documento": string|null,
  "numero_documento": string|null,
  "historico": string|null,
  "data_emissao": "YYYY-MM-DD"|null,
  "data_vencimento": "YYYY-MM-DD"|null,
  "valor_total": number|null,
  "parcelas": [
    { "numero": number, "valor": number, "vencimento": "YYYY-MM-DD" }
  ]
}

Regras:
- valor_total deve ser número em reais, usando ponto decimal.
- datas devem estar em ISO YYYY-MM-DD.
- Se houver apenas um vencimento, retorne uma parcela número 1.
- Não invente informações.
`;

function extractTextFromOpenAIResponse(json) {
  if (json.output_text) return json.output_text;
  const out = Array.isArray(json.output) ? json.output : [];
  return out
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => part.text || part.value || "")
    .filter(Boolean)
    .join("\n");
}

function extractTextFromGeminiResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p.text || "")
    .filter(Boolean)
    .join("\n");
}

function parseAiJson(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) throw new Error("A IA não retornou conteúdo");

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || cleaned;
  try {
    return JSON.parse(candidate);
  } catch {}

  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first >= 0 && last > first)
    return JSON.parse(candidate.slice(first, last + 1));

  throw new Error("A IA não retornou um JSON válido");
}

function normalizeAiResult(raw) {
  const toStringOrNull = (v) =>
    v === undefined || v === null || v === "" ? null : String(v);
  const toNumberOrNull = (v) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const n = Number(
      String(v)
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^0-9.-]/g, ""),
    );
    return Number.isFinite(n) ? n : null;
  };
  const isoDateOrNull = (v) => {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    return null;
  };

  const parcelas = Array.isArray(raw?.parcelas)
    ? raw.parcelas
        .map((p, idx) => ({
          numero: Number(p?.numero) || idx + 1,
          valor: toNumberOrNull(p?.valor),
          vencimento: isoDateOrNull(p?.vencimento),
        }))
        .filter((p) => p.valor !== null && p.vencimento)
    : [];

  return {
    fornecedor_nome: toStringOrNull(raw?.fornecedor_nome),
    fornecedor_cnpj: toStringOrNull(raw?.fornecedor_cnpj),
    tipo_documento: toStringOrNull(raw?.tipo_documento),
    numero_documento: toStringOrNull(raw?.numero_documento),
    historico: toStringOrNull(raw?.historico),
    data_emissao: isoDateOrNull(raw?.data_emissao),
    data_vencimento: isoDateOrNull(raw?.data_vencimento),
    valor_total: toNumberOrNull(raw?.valor_total),
    parcelas,
  };
}

function parseMoney(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fallback;

  const raw = String(value).trim();
  if (!raw) return fallback;

  // Aceita tanto formato decimal técnico (1500.00) quanto BR (1.500,00).
  // Antes todo ponto era removido, o que podia transformar 1500.00 em 150000.
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const n = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayDateOnly() {
  const dt = new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function dateOnly(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;

  if (typeof value === "string") {
    const raw = value.trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return fallback;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function splitDateParts(dateValue) {
  const iso = dateOnly(dateValue, todayDateOnly());
  const [ano, mes, dia] = iso.split("-").map(Number);
  return { dia, mes, ano };
}

function addMonthsDateOnly(baseDate, months) {
  const iso = dateOnly(baseDate, todayDateOnly());
  const [ano, mes, dia] = iso.split("-").map(Number);
  const dt = new Date(ano, mes - 1, dia);
  dt.setMonth(dt.getMonth() + months);
  return dateOnly(dt, iso);
}

function normalizeCpParcela(p, idx, fallbackDate, fallbackValue = 0) {
  const valor = parseMoney(p?.valor, fallbackValue);
  const acrescimo = parseMoney(p?.acrescimo, 0);
  const desconto = parseMoney(p?.desconto, 0);
  const juros = parseMoney(p?.juros, 0);
  const multa = parseMoney(p?.multa, 0);
  const valorFinal = parseMoney(
    p?.valor_final,
    Math.max(0, valor + acrescimo + juros + multa - desconto),
  );

  return {
    id: p?.id || null,
    numero: parseInt(p?.numero) || idx + 1,
    valor,
    vencimento: dateOnly(p?.vencimento, fallbackDate),
    status: p?.status || "pendente",
    acrescimo,
    desconto,
    juros,
    multa,
    valor_final: valorFinal,
  };
}

function bancoLancamentoLabel(tipo) {
  const labels = {
    saldo_inicial: "Saldo Inicial",
    taxa: "Taxa Bancária",
    rendimento: "Rendimento",
    aplicacao: "Aplicação",
  };
  return labels[tipo] || "Lançamento Bancário";
}

const BANCOS_SELECT_FIELDS = `
  id, empresa, banco_nome, codigo_banco, agencia, conta, digito, tipo_conta,
  saldo_inicial::float AS saldo_inicial,
  TO_CHAR(data_saldo_inicial, 'YYYY-MM-DD') AS data_saldo_inicial,
  ativo, obs, created_at
`;

async function inserirMovimentoBanco(
  client,
  { conta, tipo, descricao, valor, data, movimentoId = null },
) {
  const valorNum = parseMoney(valor);
  const dataMovimento = dateOnly(data, todayDateOnly());
  const partesData = splitDateParts(dataMovimento);
  const saida = tipo === "taxa" || valorNum < 0;
  const valorAbs = Math.abs(valorNum);
  const entradas = saida ? 0 : valorAbs;
  const saidas = saida ? valorAbs : 0;
  const label = bancoLancamentoLabel(tipo);
  const contaLabel = [conta?.banco_nome, conta?.agencia, conta?.conta]
    .filter(Boolean)
    .join(" / ");
  const historico = `${label}: ${descricao || contaLabel || ""}`.trim();

  const payload = [
    dataMovimento,
    conta?.empresa || null,
    conta?.banco_nome || null,
    entradas,
    saidas,
    null,
    historico,
    null,
    label,
    null,
    null,
    null,
    null,
    partesData.dia,
    partesData.mes,
    partesData.ano,
    null,
    "financeiro",
    null,
    null,
    conta?.id || null,
  ];

  if (movimentoId) {
    await client.query(
      `UPDATE fin_movimento
       SET data=$1, empresa=$2, banco=$3, entradas=$4, saidas=$5, fornecedor=$6,
           historico=$7, nf_doc=$8, conta_contabil=$9, centro_custo=$10, obra=$11,
           natureza_financeira=$12, n_cheque=$13, dia=$14, mes=$15, ano=$16,
           saldo=$17, tipo_lancamento=$18, vencimento=$19, fornecedor_id=$20, banco_conta_id=$21
       WHERE id=$22`,
      [...payload, movimentoId],
    );
    return movimentoId;
  }

  const { rows } = await client.query(
    `INSERT INTO fin_movimento
      (data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
       conta_contabil, centro_custo, obra, natureza_financeira, n_cheque,
       dia, mes, ano, saldo, tipo_lancamento, vencimento, fornecedor_id, banco_conta_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`,
    payload,
  );
  return rows[0]?.id || null;
}

async function analyzeWithOpenAI({
  apiKey,
  documento_nome,
  documento_mime,
  documento_base64,
}) {
  const dataUrl = `data:${documento_mime};base64,${documento_base64}`;
  const filePart =
    documento_mime === "application/pdf"
      ? {
          type: "input_file",
          filename: documento_nome || "documento.pdf",
          file_data: dataUrl,
        }
      : { type: "input_image", image_url: dataUrl };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: AI_JSON_SCHEMA_PROMPT },
            filePart,
          ],
        },
      ],
      temperature: 0.1,
      max_output_tokens: 1200,
    }),
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok)
    throw new Error(json?.error?.message || "Erro ao consultar OpenAI");
  return parseAiJson(extractTextFromOpenAIResponse(json));
}

async function analyzeWithGemini({ apiKey, documento_mime, documento_base64 }) {
  const model = process.env.GEMINI_VISION_MODEL || "gemini-1.5-flash";
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: AI_JSON_SCHEMA_PROMPT },
              {
                inline_data: {
                  mime_type: documento_mime,
                  data: documento_base64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: "application/json",
        },
      }),
    },
  );

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = json?.error?.message || "Erro ao consultar Gemini";
    throw new Error(msg);
  }
  return parseAiJson(extractTextFromGeminiResponse(json));
}

// ══════════════════════════════════════════════════════════════════════════════
// FORNECEDORES
// ══════════════════════════════════════════════════════════════════════════════

function cleanFornecedorImportText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function cleanFornecedorImportDigits(value, maxLength = null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return maxLength ? digits.slice(0, maxLength) : digits;
}

function normalizeFornecedorNameKey(value) {
  if (!value) return null;

  const stopWords = new Set([
    "LTDA",
    "SA",
    "ME",
    "EPP",
    "EIRELI",
    "DE",
    "DA",
    "DO",
    "DAS",
    "DOS",
    "E",
    "COM",
    "IND",
    "INDUSTRIA",
    "COMERCIO",
    "SERVICOS",
    "SERVICO",
    "CIA",
    "COMPANHIA",
  ]);

  const text = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\bLIMITADA\b/g, "LTDA")
    .replace(/\bLTD\b/g, "LTDA")
    .replace(/\bS\s*\/?\s*A\b/g, "SA")
    .replace(/\bS\.A\.?\b/g, "SA")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  const key = text
    .split(/\s+/)
    .filter((word) => word && !stopWords.has(word))
    .join(" ");

  return key || null;
}

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function parseFornecedorImportAtivo(value) {
  if (value === undefined || value === null || value === "") return true;
  const normalized = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return !["nao", "n", "0", "false", "falso", "inativo", "inativa"].includes(normalized);
}

function normalizeFornecedorImportPayload(row) {
  const docDigits = cleanFornecedorImportDigits(row.cnpj_cpf);
  const tipoPessoa = ["PF", "PJ"].includes(String(row.tipo_pessoa || "").toUpperCase())
    ? String(row.tipo_pessoa).toUpperCase()
    : docDigits && docDigits.length === 11
      ? "PF"
      : "PJ";
  const tipoConta = /poup/i.test(String(row.tipo_conta || "")) ? "Poupança" : "Corrente";

  return {
    razao_social: cleanFornecedorImportText(row.razao_social),
    nome_fantasia: cleanFornecedorImportText(row.nome_fantasia),
    cnpj_cpf: cleanFornecedorImportText(row.cnpj_cpf),
    cnpj_digits: docDigits,
    tipo_pessoa: tipoPessoa,
    categoria: cleanFornecedorImportText(row.categoria),
    email: cleanFornecedorImportText(row.email),
    telefone: cleanFornecedorImportText(row.telefone),
    empresa: cleanFornecedorImportText(row.empresa || "TODOS")?.toUpperCase() || "TODOS",
    cep: cleanFornecedorImportText(row.cep),
    endereco: cleanFornecedorImportText(row.endereco),
    cidade_uf: cleanFornecedorImportText(row.cidade_uf),
    banco_nome: cleanFornecedorImportText(row.banco_nome),
    codigo_banco: cleanFornecedorImportDigits(row.codigo_banco, 10),
    agencia: cleanFornecedorImportDigits(row.agencia, 10),
    conta: cleanFornecedorImportDigits(row.conta, 20),
    digito: cleanFornecedorImportDigits(row.digito, 2),
    tipo_conta: tipoConta,
    chave_pix: cleanFornecedorImportText(row.chave_pix),
    obs: cleanFornecedorImportText(row.obs),
    ativo: parseFornecedorImportAtivo(row.ativo),
  };
}

// GET /fornecedores — lista com filtros
router.get("/fornecedores", async (req, res) => {
  const {
    empresa,
    categoria,
    busca,
    ativo = "true",
    page = 1,
    limit = 50,
  } = req.query;
  const conditions = [];
  const params = [];

  if (ativo !== "all") {
    params.push(ativo === "true");
    conditions.push(`ativo = $${params.length}`);
  }
  if (empresa && empresa !== "TODOS") {
    params.push(empresa.toUpperCase());
    conditions.push(`(empresa = $${params.length} OR empresa = 'TODOS')`);
  }
  if (categoria) {
    params.push(categoria);
    conditions.push(`categoria = $${params.length}`);
  }
  if (busca) {
    params.push(`%${busca}%`);
    conditions.push(
      `(razao_social ILIKE $${params.length} OR nome_fantasia ILIKE $${params.length} OR cnpj_cpf ILIKE $${params.length})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await query(
      `SELECT * FROM fin_fornecedores ${where}
       ORDER BY razao_social
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const ct = await query(
      `SELECT COUNT(*) FROM fin_fornecedores ${where}`,
      params.slice(0, -2),
    );
    return res.json({
      ok: true,
      data: rows,
      total: parseInt(ct.rows[0].count),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /fornecedores/select — para dropdowns (id + nome)
router.get("/fornecedores/select", async (req, res) => {
  const { empresa } = req.query;
  const params = [];
  let where = "WHERE ativo = true";
  if (empresa && empresa !== "TODOS") {
    params.push(empresa.toUpperCase());
    where += ` AND (empresa = $${params.length} OR empresa = 'TODOS')`;
  }
  try {
    const { rows } = await query(
      `SELECT id, razao_social, nome_fantasia, cnpj_cpf, empresa FROM fin_fornecedores ${where} ORDER BY razao_social`,
      params,
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /fornecedores/exportar — exportação para Excel via CSV ou JSON
router.get("/fornecedores/exportar", async (req, res) => {
  const { empresa, ativo = "true", format = "csv" } = req.query;
  const params = [];
  const conditions = [];

  if (ativo !== "all") {
    params.push(ativo === "true");
    conditions.push(`ativo = $${params.length}`);
  }

  if (empresa && empresa !== "TODOS") {
    params.push(String(empresa).toUpperCase());
    conditions.push(`(empresa = $${params.length} OR empresa = 'TODOS')`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const fields = [
    "id",
    "razao_social",
    "nome_fantasia",
    "cnpj_cpf",
    "tipo_pessoa",
    "categoria",
    "email",
    "telefone",
    "empresa",
    "cep",
    "endereco",
    "cidade_uf",
    "banco_nome",
    "codigo_banco",
    "agencia",
    "conta",
    "digito",
    "tipo_conta",
    "chave_pix",
    "obs",
    "ativo",
  ];

  try {
    const { rows } = await query(
      `SELECT ${fields.join(", ")} FROM fin_fornecedores ${where} ORDER BY razao_social`,
      params,
    );

    if (String(format).toLowerCase() === "json") {
      return res.json({ ok: true, data: rows, total: rows.length });
    }

    const csv = [
      fields.join(";"),
      ...rows.map((row) => fields.map((field) => csvEscape(row[field])).join(";")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=fornecedores.csv");
    return res.send(`\ufeff${csv}`);
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /fornecedores/importar — importação em lote via planilha
router.post("/fornecedores/importar", async (req, res) => {
  const fornecedores = Array.isArray(req.body?.fornecedores) ? req.body.fornecedores : [];

  if (!fornecedores.length) {
    return res.status(400).json({ ok: false, message: "Nenhum fornecedor válido enviado para importação." });
  }

  if (fornecedores.length > 100) {
    return res.status(400).json({ ok: false, message: "Envie no máximo 100 fornecedores por ciclo de importação." });
  }

  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  try {
    await transaction(async (client) => {
      const existingNames = await client.query(
        `SELECT id, razao_social FROM fin_fornecedores WHERE razao_social IS NOT NULL`,
      );
      const existingNameKeys = new Map();
      existingNames.rows.forEach((row) => {
        const key = normalizeFornecedorNameKey(row.razao_social);
        if (key && !existingNameKeys.has(key)) existingNameKeys.set(key, row.id);
      });
      const importNameKeys = new Set();

      for (let index = 0; index < fornecedores.length; index += 1) {
        const rowNumber = index + 1;
        const fornecedor = normalizeFornecedorImportPayload(fornecedores[index]);
        const fornecedorNameKey = normalizeFornecedorNameKey(fornecedor.razao_social);

        if (!fornecedor.razao_social) {
          result.skipped += 1;
          result.errors.push(`Linha ${rowNumber}: Razão Social é obrigatória.`);
          continue;
        }

        if (!fornecedor.empresa) {
          result.skipped += 1;
          result.errors.push(`Linha ${rowNumber}: Empresa é obrigatória.`);
          continue;
        }

        if (!fornecedor.cnpj_digits && fornecedorNameKey && existingNameKeys.has(fornecedorNameKey)) {
          result.skipped += 1;
          result.errors.push(`Linha ${rowNumber}: fornecedor já cadastrado pelo nome normalizado.`);
          continue;
        }

        if (!fornecedor.cnpj_digits && fornecedorNameKey && importNameKeys.has(fornecedorNameKey)) {
          result.skipped += 1;
          result.errors.push(`Linha ${rowNumber}: fornecedor duplicado na planilha pelo nome normalizado.`);
          continue;
        }

        if (fornecedorNameKey) importNameKeys.add(fornecedorNameKey);

        const savepoint = `fornecedor_import_${index}`;
        await client.query(`SAVEPOINT ${savepoint}`);

        try {
          let existingId = null;
          if (fornecedor.cnpj_digits) {
            const existing = await client.query(
              `SELECT id FROM fin_fornecedores
               WHERE REGEXP_REPLACE(COALESCE(cnpj_cpf,''),'[^0-9]','','g') = $1
               LIMIT 1`,
              [fornecedor.cnpj_digits],
            );
            existingId = existing.rows[0]?.id || null;
          }

          const values = [
            fornecedor.razao_social,
            fornecedor.nome_fantasia,
            fornecedor.cnpj_cpf,
            fornecedor.tipo_pessoa,
            fornecedor.categoria,
            fornecedor.email,
            fornecedor.telefone,
            fornecedor.empresa,
            fornecedor.cep,
            fornecedor.endereco,
            fornecedor.cidade_uf,
            fornecedor.banco_nome,
            fornecedor.codigo_banco,
            fornecedor.agencia,
            fornecedor.conta,
            fornecedor.digito,
            fornecedor.tipo_conta,
            fornecedor.chave_pix,
            fornecedor.obs,
            fornecedor.ativo,
          ];

          if (existingId) {
            await client.query(
              `UPDATE fin_fornecedores SET
                 razao_social=$1, nome_fantasia=$2, cnpj_cpf=$3, tipo_pessoa=$4, categoria=$5,
                 email=$6, telefone=$7, empresa=$8, cep=$9, endereco=$10, cidade_uf=$11,
                 banco_nome=$12, codigo_banco=$13, agencia=$14, conta=$15, digito=$16,
                 tipo_conta=$17, chave_pix=$18, obs=$19, ativo=$20, updated_at=NOW()
               WHERE id=$21`,
              [...values, existingId],
            );
            result.updated += 1;
          } else {
            await client.query(
              `INSERT INTO fin_fornecedores
                 (razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
                  email, telefone, empresa, cep, endereco, cidade_uf,
                  banco_nome, codigo_banco, agencia, conta, digito, tipo_conta, chave_pix, obs, ativo)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
              values,
            );
            if (fornecedorNameKey) existingNameKeys.set(fornecedorNameKey, true);
            result.created += 1;
          }

          await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        } catch (err) {
          await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => {});
          result.skipped += 1;
          if (err.code === "23505") {
            result.errors.push(`Linha ${rowNumber}: CNPJ/CPF já cadastrado.`);
          } else {
            result.errors.push(`Linha ${rowNumber}: ${err.message}`);
          }
        }
      }
    });

    return res.json({ ok: true, data: result });
  } catch (err) {
    logger.error("Erro ao importar fornecedores", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /fornecedores/:id
router.get("/fornecedores/:id", async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM fin_fornecedores WHERE id = $1",
      [req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /fornecedores
router.post("/fornecedores", async (req, res) => {
  const {
    razao_social,
    nome_fantasia,
    cnpj_cpf,
    tipo_pessoa = "PJ",
    categoria,
    email,
    telefone,
    empresa = "TODOS",
    cep,
    endereco,
    cidade_uf,
    banco_nome,
    codigo_banco,
    agencia,
    conta,
    digito,
    tipo_conta = "Corrente",
    chave_pix,
    obs,
  } = req.body;

  if (!razao_social)
    return res
      .status(400)
      .json({ ok: false, message: "razao_social obrigatório" });
  if (!empresa)
    return res.status(400).json({ ok: false, message: "empresa obrigatória" });

  try {
    const { rows } = await query(
      `INSERT INTO fin_fornecedores
         (razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
          email, telefone, empresa, cep, endereco, cidade_uf,
          banco_nome, codigo_banco, agencia, conta, digito, tipo_conta, chave_pix, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        razao_social,
        nome_fantasia,
        cnpj_cpf,
        tipo_pessoa,
        categoria,
        email,
        telefone,
        empresa.toUpperCase(),
        cep,
        endereco,
        cidade_uf,
        banco_nome,
        codigo_banco,
        agencia,
        conta,
        digito,
        tipo_conta,
        chave_pix,
        obs,
      ],
    );
    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res
        .status(409)
        .json({ ok: false, message: "CNPJ/CPF já cadastrado" });
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /fornecedores/:id
router.put("/fornecedores/:id", async (req, res) => {
  const {
    razao_social,
    nome_fantasia,
    cnpj_cpf,
    tipo_pessoa,
    categoria,
    email,
    telefone,
    empresa,
    cep,
    endereco,
    cidade_uf,
    banco_nome,
    codigo_banco,
    agencia,
    conta,
    digito,
    tipo_conta,
    chave_pix,
    obs,
    ativo,
  } = req.body;
  try {
    const { rows } = await query(
      `UPDATE fin_fornecedores SET
         razao_social=$1, nome_fantasia=$2, cnpj_cpf=$3, tipo_pessoa=$4, categoria=$5,
         email=$6, telefone=$7, empresa=$8, cep=$9, endereco=$10, cidade_uf=$11,
         banco_nome=$12, codigo_banco=$13, agencia=$14, conta=$15, digito=$16, tipo_conta=$17, chave_pix=$18,
         obs=$19, ativo=$20, updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [
        razao_social,
        nome_fantasia,
        cnpj_cpf,
        tipo_pessoa,
        categoria,
        email,
        telefone,
        empresa?.toUpperCase(),
        cep,
        endereco,
        cidade_uf,
        banco_nome,
        codigo_banco,
        agencia,
        conta,
        digito,
        tipo_conta,
        chave_pix,
        obs,
        ativo ?? true,
        req.params.id,
      ],
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// DELETE /fornecedores/:id  (soft delete)
router.delete("/fornecedores/:id", async (req, res) => {
  try {
    await query(
      "UPDATE fin_fornecedores SET ativo=false, updated_at=NOW() WHERE id=$1",
      [req.params.id],
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BANCOS / CONTAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /bancos — lista todas as contas bancárias das empresas
router.get("/bancos", async (req, res) => {
  const { empresa, ativo } = req.query;
  const params = [];
  const whereParts = [];

  // Padrão preservado: se não informar status, lista apenas contas ativas.
  if (ativo === undefined || ativo === null || ativo === "") {
    whereParts.push("ativo = true");
  } else if (["true", "1", "ativo", "ativos", "ativas"].includes(String(ativo).toLowerCase())) {
    whereParts.push("ativo = true");
  } else if (["false", "0", "inativo", "inativos", "inativas"].includes(String(ativo).toLowerCase())) {
    whereParts.push("ativo = false");
  }

  if (empresa) {
    params.push(empresa.toUpperCase());
    whereParts.push(`empresa = $${params.length}`);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  try {
    const { rows } = await query(
      `SELECT ${BANCOS_SELECT_FIELDS} FROM fin_bancos_contas ${where} ORDER BY ativo DESC, empresa, banco_nome`,
      params,
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /bancos/select — para dropdowns
router.get("/bancos/select", async (req, res) => {
  const { empresa } = req.query;
  const params = [];
  let where = "WHERE ativo = true";
  if (empresa) {
    params.push(empresa.toUpperCase());
    where += ` AND empresa = $${params.length}`;
  }
  try {
    const { rows } = await query(
      `SELECT id, empresa, banco_nome, agencia, conta, saldo_inicial::float AS saldo_inicial FROM fin_bancos_contas ${where} ORDER BY empresa, banco_nome`,
      params,
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /bancos/:id
router.get("/bancos/:id", async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ${BANCOS_SELECT_FIELDS} FROM fin_bancos_contas WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /bancos
router.post("/bancos", async (req, res) => {
  const { tenant_id } = req.user;
  const {
    empresa,
    banco_nome,
    codigo_banco,
    agencia,
    conta,
    digito,
    tipo_conta = "Corrente",
    saldo_inicial = 0,
    data_saldo_inicial,
    obs,
  } = req.body;

  if (!empresa)
    return res.status(400).json({ ok: false, message: "empresa obrigatória" });
  if (!banco_nome)
    return res
      .status(400)
      .json({ ok: false, message: "banco_nome obrigatório" });

  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    const saldoNum = parseMoney(saldo_inicial);
    const dataSaldo = dateOnly(data_saldo_inicial, null);

    const { rows } = await client.query(
      `INSERT INTO fin_bancos_contas
         (empresa, banco_nome, codigo_banco, agencia, conta, digito, tipo_conta, saldo_inicial, data_saldo_inicial, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        empresa.toUpperCase(),
        banco_nome,
        codigo_banco,
        agencia,
        conta,
        digito,
        tipo_conta,
        saldoNum,
        dataSaldo,
        obs,
      ],
    );

    const banco = rows[0];
    if (saldoNum !== 0) {
      const dataMov = dataSaldo || todayDateOnly();
      const movimentoId = await inserirMovimentoBanco(client, {
        conta: banco,
        tipo: "saldo_inicial",
        descricao: "Saldo inicial da conta",
        valor: saldoNum,
        data: dataMov,
      });
      await client.query(
        `INSERT INTO fin_bancos_lancamentos (tenant_id, conta_id, tipo, descricao, valor, data, obs, movimento_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          tenant_id,
          banco.id,
          "saldo_inicial",
          "Saldo inicial da conta",
          saldoNum,
          dataMov,
          obs || null,
          movimentoId,
        ],
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ ok: true, data: banco });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
});

// PUT /bancos/:id
router.put("/bancos/:id", async (req, res) => {
  const {
    empresa,
    banco_nome,
    codigo_banco,
    agencia,
    conta,
    digito,
    tipo_conta,
    saldo_inicial,
    data_saldo_inicial,
    obs,
    ativo,
  } = req.body;
  try {
    const saldoNum = parseMoney(saldo_inicial);
    const dataSaldo = dateOnly(data_saldo_inicial, null);
    const { rows } = await query(
      `UPDATE fin_bancos_contas SET
         empresa=$1, banco_nome=$2, codigo_banco=$3, agencia=$4, conta=$5, digito=$6,
         tipo_conta=$7, saldo_inicial=$8, data_saldo_inicial=$9, obs=$10, ativo=$11
       WHERE id=$12
       RETURNING ${BANCOS_SELECT_FIELDS}`,
      [
        empresa?.toUpperCase(),
        banco_nome,
        codigo_banco,
        agencia,
        conta,
        digito,
        tipo_conta,
        saldoNum,
        dataSaldo,
        obs,
        ativo ?? true,
        req.params.id,
      ],
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// PATCH /bancos/:id/status — ativa/inativa conta bancária sem apagar histórico
router.patch("/bancos/:id/status", async (req, res) => {
  const { ativo } = req.body;
  if (typeof ativo !== "boolean") {
    return res
      .status(400)
      .json({ ok: false, message: "Campo ativo deve ser booleano" });
  }

  try {
    const { rows } = await query(
      `UPDATE fin_bancos_contas
       SET ativo=$1
       WHERE id=$2
       RETURNING ${BANCOS_SELECT_FIELDS}`,
      [ativo, req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    }

    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// DELETE /bancos/:id (soft delete: inativa a conta, não remove histórico)
router.delete("/bancos/:id", async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE fin_bancos_contas
       SET ativo=false
       WHERE id=$1
       RETURNING ${BANCOS_SELECT_FIELDS}`,
      [req.params.id],
    );

    if (!rows.length) {
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    }

    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PLANO DE CONTAS
// ══════════════════════════════════════════════════════════════════════════════

function sanitizePlanoTipo(tipo) {
  const t = String(tipo || "A")
    .trim()
    .toUpperCase();
  return ["T", "S", "A"].includes(t) ? t : "A";
}

async function resolvePlanoPaiId(paiId, codigoAtual = null) {
  if (!paiId) return null;

  const { rows } = await query(
    "SELECT id, codigo FROM fin_plano_contas WHERE id=$1 LIMIT 1",
    [parseInt(paiId)],
  );

  if (!rows.length) return null;
  if (codigoAtual && rows[0].codigo === codigoAtual) return null;
  return rows[0].id;
}

async function seedPlanoContasFromExcel() {
  let upserts = 0;

  for (const item of PLANO_CONTAS_SEED) {
    await query(
      `INSERT INTO fin_plano_contas (codigo, descricao, tipo, ativo)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (codigo) DO UPDATE
          SET descricao = EXCLUDED.descricao,
              tipo = EXCLUDED.tipo,
              ativo = true`,
      [item.codigo, item.descricao, sanitizePlanoTipo(item.tipo)],
    );
    upserts++;
  }

  for (const item of PLANO_CONTAS_SEED) {
    if (!item.pai_codigo) {
      await query("UPDATE fin_plano_contas SET pai_id=NULL WHERE codigo=$1", [
        item.codigo,
      ]);
      continue;
    }

    await query(
      `UPDATE fin_plano_contas filho
          SET pai_id = pai.id
         FROM fin_plano_contas pai
        WHERE filho.codigo = $1
          AND pai.codigo = $2
          AND filho.id <> pai.id`,
      [item.codigo, item.pai_codigo],
    );
  }

  return upserts;
}

// GET /plano-contas
router.get("/plano-contas", async (req, res) => {
  const { busca, tipo, ativo = "1" } = req.query;

  try {
    const conditions = [];
    const params = [];

    if (ativo !== "todos") {
      params.push(ativo === "0" ? false : true);
      conditions.push(`c.ativo = $${params.length}`);
    }

    if (tipo && tipo !== "todos") {
      params.push(sanitizePlanoTipo(tipo));
      conditions.push(`c.tipo = $${params.length}`);
    }

    if (busca) {
      params.push(`%${busca}%`);
      conditions.push(
        `(c.codigo ILIKE $${params.length} OR c.descricao ILIKE $${params.length})`,
      );
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await query(
      `SELECT
         c.id,
         c.codigo,
         c.descricao,
         c.tipo,
         c.pai_id,
         c.ativo,
         p.codigo AS pai_codigo,
         p.descricao AS pai_descricao
       FROM fin_plano_contas c
       LEFT JOIN fin_plano_contas p ON p.id = c.pai_id
       ${where}
       ORDER BY string_to_array(regexp_replace(c.codigo, '\\.$', ''), '.')::int[] NULLS LAST, c.codigo`,
      params,
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /plano-contas/seed
router.post("/plano-contas/seed", async (req, res) => {
  try {
    const total = await seedPlanoContasFromExcel();
    logger.info(`Plano de contas seed atualizado: ${total} contas`);
    return res.json({ ok: true, total });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /plano-contas
router.post("/plano-contas", async (req, res) => {
  const { codigo, descricao, tipo = "A", pai_id, ativo = true } = req.body;

  if (!String(codigo || "").trim()) {
    return res.status(400).json({ ok: false, message: "Código obrigatório" });
  }
  if (!String(descricao || "").trim()) {
    return res
      .status(400)
      .json({ ok: false, message: "Descrição obrigatória" });
  }

  try {
    const codigoLimpo = String(codigo).trim();
    const paiId = await resolvePlanoPaiId(pai_id, codigoLimpo);

    const { rows } = await query(
      `INSERT INTO fin_plano_contas (codigo, descricao, tipo, pai_id, ativo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, codigo, descricao, tipo, pai_id, ativo`,
      [
        codigoLimpo,
        String(descricao).trim(),
        sanitizePlanoTipo(tipo),
        paiId,
        ativo !== false,
      ],
    );

    return res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ ok: false, message: "Já existe uma conta com este código" });
    }
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /plano-contas/:id
router.put("/plano-contas/:id", async (req, res) => {
  const { codigo, descricao, tipo = "A", pai_id, ativo = true } = req.body;

  if (!String(codigo || "").trim()) {
    return res.status(400).json({ ok: false, message: "Código obrigatório" });
  }
  if (!String(descricao || "").trim()) {
    return res
      .status(400)
      .json({ ok: false, message: "Descrição obrigatória" });
  }

  try {
    const codigoLimpo = String(codigo).trim();
    const paiId = await resolvePlanoPaiId(pai_id, codigoLimpo);

    const { rows } = await query(
      `UPDATE fin_plano_contas
          SET codigo=$1,
              descricao=$2,
              tipo=$3,
              pai_id=$4,
              ativo=$5
        WHERE id=$6
        RETURNING id, codigo, descricao, tipo, pai_id, ativo`,
      [
        codigoLimpo,
        String(descricao).trim(),
        sanitizePlanoTipo(tipo),
        paiId,
        ativo !== false,
        req.params.id,
      ],
    );

    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ ok: false, message: "Já existe uma conta com este código" });
    }
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// DELETE /plano-contas/:id
router.delete("/plano-contas/:id", async (req, res) => {
  try {
    await query("UPDATE fin_plano_contas SET ativo=false WHERE id=$1", [
      req.params.id,
    ]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// LANÇAMENTOS CONTAS A PAGAR
// ══════════════════════════════════════════════════════════════════════════════

// GET /lancamentos-cp — lista com filtros
router.get("/lancamentos-cp", async (req, res) => {
  const {
    empresa,
    status,
    fornecedor_id,
    tipo_documento_id,
    busca,
    page = 1,
    limit = 50,
    dt_inicio,
    dt_fim,
    venc_inicio,
    venc_fim,
  } = req.query;
  const conditions = [];
  const params = [];

  if (empresa) {
    params.push(empresa.toUpperCase());
    conditions.push(`l.empresa = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (fornecedor_id) {
    params.push(parseInt(fornecedor_id));
    conditions.push(`l.fornecedor_id = $${params.length}`);
  }
  if (tipo_documento_id) {
    params.push(parseInt(tipo_documento_id));
    conditions.push(`l.tipo_documento_id = $${params.length}`);
  }
  if (busca) {
    params.push(`%${busca}%`);
    conditions.push(
      `(f.razao_social ILIKE $${params.length} OR l.historico ILIKE $${params.length} OR l.nf_doc ILIKE $${params.length} OR td.nome ILIKE $${params.length})`,
    );
  }
  if (dt_inicio) {
    params.push(dt_inicio);
    conditions.push(`l.dt_emissao >= $${params.length}`);
  }
  if (dt_fim) {
    params.push(dt_fim);
    conditions.push(`l.dt_emissao <= $${params.length}`);
  }
  if (venc_inicio) {
    params.push(venc_inicio);
    conditions.push(`p.vencimento >= $${params.length}`);
  }
  if (venc_fim) {
    params.push(venc_fim);
    conditions.push(`p.vencimento <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await query(
      `SELECT
         l.*,
         TO_CHAR(l.dt_emissao, 'YYYY-MM-DD') AS dt_emissao,
         f.razao_social AS fornecedor_nome,
         f.cnpj_cpf     AS fornecedor_cnpj,
         td.nome        AS tipo_documento_nome,
         b.banco_nome   AS banco_nome,
         b.agencia      AS banco_agencia,
         b.conta        AS banco_conta,
         p.id           AS parcela_id,
         p.numero       AS parcela_numero,
         p.valor        AS parcela_valor,
         TO_CHAR(p.vencimento, 'YYYY-MM-DD') AS parcela_vencimento,
         TO_CHAR(p.dt_pagamento, 'YYYY-MM-DD') AS parcela_dt_pagamento,
         p.status       AS parcela_status,
         p.motivo_baixa AS parcela_motivo_baixa,
         p.acrescimo    AS parcela_acrescimo,
         p.desconto     AS parcela_desconto,
         p.juros        AS parcela_juros,
         p.multa        AS parcela_multa,
         p.valor_final  AS parcela_valor_final,
         p.forma_pagamento AS parcela_forma_pagamento,
         p.baixa_acrescimo AS parcela_baixa_acrescimo,
         p.baixa_desconto AS parcela_baixa_desconto,
         p.baixa_juros AS parcela_baixa_juros,
         p.baixa_multa AS parcela_baixa_multa,
         p.baixa_valor_final AS parcela_baixa_valor_final,
         TO_CHAR((SELECT MIN(px.vencimento) FROM fin_parcelas_cp px WHERE px.lancamento_id = l.id AND px.status = 'pendente'), 'YYYY-MM-DD') AS proximo_venc
       FROM fin_lancamentos_cp l
       LEFT JOIN fin_fornecedores  f ON f.id = l.fornecedor_id
       LEFT JOIN fin_tipos_documento td ON td.id = l.tipo_documento_id
       LEFT JOIN fin_bancos_contas b ON b.id = l.banco_conta_id
       LEFT JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
       ${where}
       ORDER BY l.created_at DESC, p.numero ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const ct = await query(
      `SELECT COUNT(*), COALESCE(SUM(COALESCE(p.valor, l.valor_total)),0) AS total_valor
       FROM fin_lancamentos_cp l
       LEFT JOIN fin_fornecedores  f ON f.id = l.fornecedor_id
       LEFT JOIN fin_tipos_documento td ON td.id = l.tipo_documento_id
       LEFT JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
       ${where}`,
      params.slice(0, -2),
    );
    return res.json({
      ok: true,
      data: rows,
      total: parseInt(ct.rows[0].count),
      total_valor: parseFloat(ct.rows[0].total_valor),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// GET /lancamentos-cp/:id (com parcelas)
router.get("/lancamentos-cp/:id", async (req, res) => {
  try {
    const {
      rows: [lanc],
    } = await query(
      `SELECT l.*, TO_CHAR(l.dt_emissao, 'YYYY-MM-DD') AS dt_emissao, f.razao_social AS fornecedor_nome, td.nome AS tipo_documento_nome, b.banco_nome, b.agencia, b.conta
       FROM fin_lancamentos_cp l
       LEFT JOIN fin_fornecedores  f ON f.id = l.fornecedor_id
       LEFT JOIN fin_tipos_documento td ON td.id = l.tipo_documento_id
       LEFT JOIN fin_bancos_contas b ON b.id = l.banco_conta_id
       WHERE l.id = $1`,
      [req.params.id],
    );
    if (!lanc)
      return res.status(404).json({ ok: false, message: "Não encontrado" });

    const { rows: parcelas } = await query(
      `SELECT p.*, TO_CHAR(p.vencimento, 'YYYY-MM-DD') AS vencimento, TO_CHAR(p.dt_pagamento, 'YYYY-MM-DD') AS dt_pagamento FROM fin_parcelas_cp p WHERE lancamento_id = $1 ORDER BY numero`,
      [req.params.id],
    );
    return res.json({ ok: true, data: { ...lanc, parcelas } });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// POST /lancamentos-cp/analisar-documento — lê PDF/imagem com IA e sugere campos
router.post("/lancamentos-cp/analisar-documento", async (req, res) => {
  const { tenant_id } = req.user;
  const { documento_nome, documento_mime, documento_base64 } = req.body;

  if (!documento_base64 || !documento_mime) {
    return res
      .status(400)
      .json({
        ok: false,
        message: "Envie o documento em base64 e o mime type",
      });
  }

  const mimeOk =
    documento_mime === "application/pdf" ||
    String(documento_mime).startsWith("image/");
  if (!mimeOk) {
    return res
      .status(400)
      .json({ ok: false, message: "A IA aceita apenas PDF ou imagem" });
  }

  if (String(documento_base64).length > 7 * 1024 * 1024) {
    return res
      .status(413)
      .json({
        ok: false,
        message: "Arquivo muito grande para análise. Limite sugerido: 5MB",
      });
  }

  try {
    const { rows } = await query(
      `SELECT ai_provider, openai_api_key, gemini_api_key
       FROM hub_tenant_configs
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenant_id],
    );

    const cfg = rows[0] || {};
    const provider = ["openai", "gemini"].includes(cfg.ai_provider)
      ? cfg.ai_provider
      : "openai";
    const apiKey =
      provider === "gemini" ? cfg.gemini_api_key : cfg.openai_api_key;

    if (!apiKey) {
      return res.status(422).json({
        ok: false,
        message:
          provider === "gemini"
            ? "Configure a Gemini API Key em Configurações > Credenciais"
            : "Configure a OpenAI API Key em Configurações > Credenciais",
      });
    }

    const raw =
      provider === "gemini"
        ? await analyzeWithGemini({ apiKey, documento_mime, documento_base64 })
        : await analyzeWithOpenAI({
            apiKey,
            documento_nome,
            documento_mime,
            documento_base64,
          });

    return res.json({ ok: true, provider, data: normalizeAiResult(raw) });
  } catch (err) {
    return res
      .status(502)
      .json({
        ok: false,
        message: err.message || "Erro ao analisar documento com IA",
      });
  }
});

// POST /lancamentos-cp — cria lançamento + parcelas
router.post("/lancamentos-cp", async (req, res) => {
  const {
    empresa,
    fornecedor_id,
    banco_conta_id,
    conta_contabil,
    descricao_conta,
    historico,
    tipo_documento_id,
    produto_servico,
    nf_doc,
    documento_nome,
    documento_mime,
    documento_base64,
    dt_emissao,
    valor_total,
    qtd_parcelas = 1,
    centro_custo,
    obra,
    n_cheque,
    obs,
    parcelas, // array [{ vencimento, valor }] — opcional, gera automaticamente se omitido
  } = req.body;

  if (!empresa)
    return res.status(400).json({ ok: false, message: "empresa obrigatória" });
  if (!historico)
    return res
      .status(400)
      .json({ ok: false, message: "historico obrigatório" });
  if (!valor_total)
    return res
      .status(400)
      .json({ ok: false, message: "valor_total obrigatório" });

  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    // Insere lançamento
    const {
      rows: [lanc],
    } = await client.query(
      `INSERT INTO fin_lancamentos_cp
         (empresa, fornecedor_id, banco_conta_id, conta_contabil, descricao_conta,
          historico, tipo_documento_id, produto_servico, nf_doc, documento_nome, documento_mime, documento_base64,
          dt_emissao, valor_total, qtd_parcelas,
          centro_custo, obra, n_cheque, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        empresa.toUpperCase(),
        fornecedor_id || null,
        banco_conta_id || null,
        conta_contabil,
        descricao_conta,
        historico,
        tipo_documento_id || null,
        produto_servico,
        nf_doc,
        documento_nome || null,
        documento_mime || null,
        documento_base64 || null,
        dateOnly(dt_emissao, null),
        parseMoney(valor_total),
        qtd_parcelas,
        centro_custo,
        obra,
        n_cheque,
        obs,
      ],
    );

    // Gera parcelas
    const n = parseInt(qtd_parcelas) || 1;
    const vlr = parseMoney(valor_total);

    const rawParcs =
      Array.isArray(parcelas) && parcelas.length === n
        ? parcelas
        : Array.from({ length: n }, (_, i) => ({
            numero: i + 1,
            valor: parseFloat((vlr / n).toFixed(2)),
            vencimento: addMonthsDateOnly(dt_emissao || todayDateOnly(), i + 1),
          }));

    const parcs = rawParcs.map((p, idx) =>
      normalizeCpParcela(
        p,
        idx,
        addMonthsDateOnly(dt_emissao || todayDateOnly(), idx + 1),
        parseFloat((vlr / n).toFixed(2)),
      ),
    );

    for (const p of parcs) {
      await client.query(
        `INSERT INTO fin_parcelas_cp
          (lancamento_id, numero, valor, vencimento, status, acrescimo, desconto, juros, multa, valor_final)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          lanc.id,
          p.numero,
          p.valor,
          p.vencimento,
          p.status || "pendente",
          p.acrescimo,
          p.desconto,
          p.juros,
          p.multa,
          p.valor_final,
        ],
      );
    }

    await client.query("COMMIT");
    return res
      .status(201)
      .json({ ok: true, data: { ...lanc, parcelas: parcs } });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
});

// PUT /lancamentos-cp/:id — edita lançamento e parcelas
router.put("/lancamentos-cp/:id", async (req, res) => {
  const {
    empresa,
    fornecedor_id,
    banco_conta_id,
    conta_contabil,
    descricao_conta,
    historico,
    tipo_documento_id,
    produto_servico,
    nf_doc,
    documento_nome,
    documento_mime,
    documento_base64,
    dt_emissao,
    valor_total,
    qtd_parcelas = 1,
    centro_custo,
    obra,
    n_cheque,
    obs,
    parcelas = [],
  } = req.body;

  if (!empresa)
    return res.status(400).json({ ok: false, message: "empresa obrigatória" });
  if (!historico)
    return res
      .status(400)
      .json({ ok: false, message: "historico obrigatório" });
  if (valor_total === undefined || valor_total === null || valor_total === "") {
    return res
      .status(400)
      .json({ ok: false, message: "valor_total obrigatório" });
  }

  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: exists } = await client.query(
      "SELECT id FROM fin_lancamentos_cp WHERE id=$1 FOR UPDATE",
      [req.params.id],
    );
    if (!exists.length) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ ok: false, message: "Lançamento não encontrado" });
    }

    const { rows: paidRows } = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM fin_parcelas_cp
        WHERE lancamento_id=$1
          AND (LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL)`,
      [req.params.id],
    );
    const hasBaixa = Number(paidRows[0]?.total || 0) > 0;

    const {
      rows: [lanc],
    } = await client.query(
      `UPDATE fin_lancamentos_cp
          SET empresa=$1,
              fornecedor_id=$2,
              banco_conta_id=$3,
              conta_contabil=$4,
              descricao_conta=$5,
              historico=$6,
              tipo_documento_id=$7,
              produto_servico=$8,
              nf_doc=$9,
              documento_nome=COALESCE($10, documento_nome),
              documento_mime=COALESCE($11, documento_mime),
              documento_base64=COALESCE($12, documento_base64),
              dt_emissao=$13,
              valor_total=$14,
              qtd_parcelas=$15,
              centro_custo=$16,
              obra=$17,
              n_cheque=$18,
              obs=$19,
              updated_at=NOW()
        WHERE id=$20
        RETURNING *`,
      [
        String(empresa).toUpperCase(),
        fornecedor_id || null,
        banco_conta_id || null,
        conta_contabil || null,
        descricao_conta || null,
        historico,
        tipo_documento_id || null,
        produto_servico || null,
        nf_doc || null,
        documento_nome || null,
        documento_mime || null,
        documento_base64 || null,
        dateOnly(dt_emissao, null),
        parseMoney(valor_total),
        parseInt(qtd_parcelas) || 1,
        centro_custo || null,
        obra || null,
        n_cheque || null,
        obs || null,
        req.params.id,
      ],
    );

    const n = parseInt(qtd_parcelas) || 1;
    const vlr = parseMoney(valor_total);
    const rawParcs =
      Array.isArray(parcelas) && parcelas.length
        ? parcelas
        : Array.from({ length: n }, (_, i) => ({
            numero: i + 1,
            valor: parseFloat((vlr / n).toFixed(2)),
            vencimento: addMonthsDateOnly(dt_emissao || todayDateOnly(), i + 1),
            status: "pendente",
          }));

    const parcs = rawParcs.map((p, idx) =>
      normalizeCpParcela(
        p,
        idx,
        addMonthsDateOnly(dt_emissao || todayDateOnly(), idx + 1),
        parseFloat((vlr / n).toFixed(2)),
      ),
    );

    if (hasBaixa) {
      const { rows: countRows } = await client.query(
        "SELECT COUNT(*)::int AS total FROM fin_parcelas_cp WHERE lancamento_id=$1",
        [req.params.id],
      );
      if (Number(countRows[0]?.total || 0) !== parcs.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          message:
            "Não é possível alterar a quantidade de parcelas de um lançamento com baixa registrada.",
        });
      }

      for (const p of parcs) {
        await client.query(
          `UPDATE fin_parcelas_cp
              SET valor=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN valor
                    ELSE $1
                  END,
                  vencimento=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN vencimento
                    ELSE $2
                  END,
                  status=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN status
                    ELSE $3
                  END,
                  acrescimo=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN acrescimo
                    ELSE $4
                  END,
                  desconto=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN desconto
                    ELSE $5
                  END,
                  juros=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN juros
                    ELSE $6
                  END,
                  multa=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN multa
                    ELSE $7
                  END,
                  valor_final=CASE
                    WHEN LOWER(COALESCE(status, '')) = 'pago' OR movimento_id IS NOT NULL THEN valor_final
                    ELSE $8
                  END
            WHERE lancamento_id=$9 AND numero=$10`,
          [
            p.valor,
            p.vencimento,
            p.status || "pendente",
            p.acrescimo,
            p.desconto,
            p.juros,
            p.multa,
            p.valor_final,
            req.params.id,
            p.numero,
          ],
        );
      }
    } else {
      await client.query("DELETE FROM fin_parcelas_cp WHERE lancamento_id=$1", [
        req.params.id,
      ]);
      for (const p of parcs) {
        await client.query(
          `INSERT INTO fin_parcelas_cp
            (lancamento_id, numero, valor, vencimento, status, acrescimo, desconto, juros, multa, valor_final)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            req.params.id,
            p.numero,
            p.valor,
            p.vencimento,
            p.status || "pendente",
            p.acrescimo,
            p.desconto,
            p.juros,
            p.multa,
            p.valor_final,
          ],
        );
      }
    }

    const { rows: updatedParcelas } = await client.query(
      `SELECT p.*, TO_CHAR(p.vencimento, 'YYYY-MM-DD') AS vencimento, TO_CHAR(p.dt_pagamento, 'YYYY-MM-DD') AS dt_pagamento FROM fin_parcelas_cp p WHERE lancamento_id=$1 ORDER BY numero`,
      [req.params.id],
    );

    await client.query("COMMIT");
    return res.json({ ok: true, data: { ...lanc, parcelas: updatedParcelas } });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
});

// DELETE /lancamentos-cp/:id — exclui lançamento, parcelas e movimentos gerados por baixa
router.delete("/lancamentos-cp/:id", async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: exists } = await client.query(
      "SELECT id FROM fin_lancamentos_cp WHERE id=$1 FOR UPDATE",
      [req.params.id],
    );
    if (!exists.length) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ ok: false, message: "Lançamento não encontrado" });
    }

    const { rows: movs } = await client.query(
      `SELECT DISTINCT movimento_id
         FROM fin_parcelas_cp
        WHERE lancamento_id=$1 AND movimento_id IS NOT NULL`,
      [req.params.id],
    );
    const movimentoIds = movs.map((r) => r.movimento_id).filter(Boolean);

    if (movimentoIds.length) {
      await client.query(
        "UPDATE fin_parcelas_cp SET movimento_id=NULL WHERE lancamento_id=$1",
        [req.params.id],
      );
      await client.query(
        "DELETE FROM fin_movimento WHERE id = ANY($1::bigint[])",
        [movimentoIds],
      );
    }

    await client.query("DELETE FROM fin_lancamentos_cp WHERE id=$1", [
      req.params.id,
    ]);

    await client.query("COMMIT");
    return res.json({
      ok: true,
      deleted: true,
      movimentos_removidos: movimentoIds.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
});

// PUT /lancamentos-cp/:id/status — atualiza status
router.put("/lancamentos-cp/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!status)
    return res.status(400).json({ ok: false, message: "status obrigatório" });
  try {
    const { rows } = await query(
      `UPDATE fin_lancamentos_cp SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id],
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, message: "Não encontrado" });
    return res.json({ ok: true, data: rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// PUT /lancamentos-cp/:id/parcelas/:parcId/pagar — baixa parcela e gera movimento bancário
router.put("/lancamentos-cp/:id/parcelas/:parcId/pagar", async (req, res) => {
  const {
    dt_pagamento,
    motivo_baixa,
    acrescimo = 0,
    desconto = 0,
    juros = 0,
    multa = 0,
    valor_final,
    forma_pagamento,
  } = req.body;

  const dataPagamento = dateOnly(dt_pagamento, todayDateOnly());
  if (!forma_pagamento)
    return res
      .status(400)
      .json({ ok: false, message: "forma_pagamento obrigatório" });

  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT
         p.*,
         l.empresa, l.fornecedor_id, l.banco_conta_id, l.conta_contabil, l.descricao_conta,
         l.historico, l.nf_doc, l.centro_custo, l.obra, l.n_cheque,
         f.razao_social AS fornecedor_nome,
         b.banco_nome   AS banco_nome
       FROM fin_parcelas_cp p
       JOIN fin_lancamentos_cp l ON l.id = p.lancamento_id
       LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
       LEFT JOIN fin_bancos_contas b ON b.id = l.banco_conta_id
       WHERE l.id = $1 AND p.id = $2
       FOR UPDATE OF p`,
      [req.params.id, req.params.parcId],
    );

    const parc = rows[0];
    if (!parc) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ ok: false, message: "Parcela não encontrada" });
    }

    const valorParcela = parseMoney(parc.valor);
    const acrescimoNum = parseMoney(acrescimo);
    const descontoNum = parseMoney(desconto);
    const jurosNum = parseMoney(juros);
    const multaNum = parseMoney(multa);
    const valorFinalNum = parseMoney(
      valor_final,
      valorParcela + acrescimoNum + jurosNum + multaNum - descontoNum,
    );
    const partesData = splitDateParts(dataPagamento);

    let movimentoId = parc.movimento_id || null;
    const movimentoPayload = [
      dataPagamento,
      parc.empresa,
      parc.banco_nome || null,
      0,
      valorFinalNum,
      parc.fornecedor_nome || null,
      `Baixa CP ${parc.numero}/${parc.lancamento_id} - ${parc.historico || ""}`.trim(),
      parc.nf_doc || null,
      parc.descricao_conta || parc.conta_contabil || null,
      parc.centro_custo || null,
      parc.obra || null,
      parc.conta_contabil || null,
      parc.n_cheque || null,
      partesData.dia,
      partesData.mes,
      partesData.ano,
      "financeiro",
      parc.vencimento,
      parc.fornecedor_id || null,
      parc.banco_conta_id || null,
    ];

    if (movimentoId) {
      await client.query(
        `UPDATE fin_movimento
         SET data=$1, empresa=$2, banco=$3, entradas=$4, saidas=$5, fornecedor=$6,
             historico=$7, nf_doc=$8, conta_contabil=$9, centro_custo=$10, obra=$11,
             natureza_financeira=$12, n_cheque=$13, dia=$14, mes=$15, ano=$16,
             tipo_lancamento=$17, vencimento=$18, fornecedor_id=$19, banco_conta_id=$20
         WHERE id=$21`,
        [...movimentoPayload, movimentoId],
      );
    } else {
      const { rows: movRows } = await client.query(
        `INSERT INTO fin_movimento
          (data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
           conta_contabil, centro_custo, obra, natureza_financeira, n_cheque,
           dia, mes, ano, tipo_lancamento, vencimento, fornecedor_id, banco_conta_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        movimentoPayload,
      );
      movimentoId = movRows[0]?.id || null;
    }

    await client.query(
      `UPDATE fin_parcelas_cp
       SET status='pago', dt_pagamento=$1, motivo_baixa=$2,
           baixa_acrescimo=$3, baixa_desconto=$4, baixa_juros=$5, baixa_multa=$6,
           baixa_valor_final=$7, forma_pagamento=$8, movimento_id=$9
       WHERE id=$10`,
      [
        dataPagamento,
        motivo_baixa || null,
        acrescimoNum,
        descontoNum,
        jurosNum,
        multaNum,
        valorFinalNum,
        forma_pagamento,
        movimentoId,
        req.params.parcId,
      ],
    );

    // Se todas as parcelas estão pagas, marca o lançamento como pago. Caso contrário, mantém pendente.
    const { rows: pend } = await client.query(
      `SELECT COUNT(*) FROM fin_parcelas_cp WHERE lancamento_id=$1 AND status != 'pago'`,
      [req.params.id],
    );
    await client.query(
      `UPDATE fin_lancamentos_cp SET status=$1, updated_at=NOW() WHERE id=$2`,
      [parseInt(pend[0].count) === 0 ? "pago" : "pendente", req.params.id],
    );

    await client.query("COMMIT");
    return res.json({ ok: true, movimento_id: movimentoId });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
});


// PUT /lancamentos-cp/:id/parcelas/:parcId/cancelar-baixa — desfaz baixa e remove movimento gerado
router.put("/lancamentos-cp/:id/parcelas/:parcId/cancelar-baixa", async (req, res) => {
  const client = await require("../config/database").pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, lancamento_id, status, movimento_id
         FROM fin_parcelas_cp
        WHERE lancamento_id=$1 AND id=$2
        FOR UPDATE`,
      [req.params.id, req.params.parcId],
    );

    const parc = rows[0];
    if (!parc) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ ok: false, message: "Parcela não encontrada" });
    }

    const movimentoId = parc.movimento_id || null;

    await client.query(
      `UPDATE fin_parcelas_cp
          SET status='pendente',
              dt_pagamento=NULL,
              motivo_baixa=NULL,
              baixa_acrescimo=0,
              baixa_desconto=0,
              baixa_juros=0,
              baixa_multa=0,
              baixa_valor_final=NULL,
              forma_pagamento=NULL,
              movimento_id=NULL
        WHERE id=$1`,
      [req.params.parcId],
    );

    if (movimentoId) {
      await client.query("DELETE FROM fin_movimento WHERE id=$1", [movimentoId]);
    }

    const { rows: pend } = await client.query(
      `SELECT COUNT(*) FROM fin_parcelas_cp WHERE lancamento_id=$1 AND status != 'pago'`,
      [req.params.id],
    );

    await client.query(
      `UPDATE fin_lancamentos_cp SET status=$1, updated_at=NOW() WHERE id=$2`,
      [parseInt(pend[0].count) === 0 ? "pago" : "pendente", req.params.id],
    );

    await client.query("COMMIT");
    return res.json({ ok: true, movimento_removido: Boolean(movimentoId) });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(500).json({ ok: false, message: err.message });
  } finally {
    client.release();
  }
});

// ── GET /financeiro/fornecedores/check-cnpj — verifica unicidade ─────────────
router.get("/financeiro/fornecedores/check-cnpj", async (req, res) => {
  const { tenant_id } = req.user;
  const { cnpj, exclude_id } = req.query;
  if (!cnpj) return res.json({ ok: true, exists: false });
  const digits = cnpj.replace(/\D/g, "");
  try {
    const { rows } = await query(
      `SELECT id FROM fin_fornecedores
       WHERE tenant_id=$1
         AND REGEXP_REPLACE(cnpj_cpf,'[^0-9]','','g') = $2
         AND ($3::int IS NULL OR id != $3::int)`,
      [tenant_id, digits, exclude_id ? parseInt(exclude_id) : null],
    );
    return res.json({ ok: true, exists: rows.length > 0 });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ── GET /financeiro/fornecedores/:id/historico ────────────────────────────────
router.get("/financeiro/fornecedores/:id/historico", async (req, res) => {
  const { tenant_id } = req.user;
  try {
    // Busca lançamentos vinculados ao fornecedor
    const { rows: lancamentos } = await query(
      `SELECT
         l.id, l.descricao, l.empresa,
         p.id AS parcela_id,
         p.vencimento, p.valor, p.status, p.dt_pagamento AS pago_em
       FROM fin_lancamentos_cp l
       JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
       WHERE l.tenant_id = $1
         AND l.fornecedor_id = $2
       ORDER BY p.vencimento DESC
       LIMIT 200`,
      [tenant_id, req.params.id],
    );

    const total_contas = new Set(lancamentos.map((r) => r.id)).size;
    const total_pago = lancamentos
      .filter((r) => r.status === "pago")
      .reduce((s, r) => s + parseFloat(r.valor), 0);
    const total_aberto = lancamentos
      .filter((r) => r.status === "aberto")
      .reduce((s, r) => s + parseFloat(r.valor), 0);
    const total_vencido = lancamentos
      .filter((r) => r.status === "vencido")
      .reduce((s, r) => s + parseFloat(r.valor), 0);

    return res.json({
      ok: true,
      data: {
        total_contas,
        total_pago,
        total_aberto,
        total_vencido,
        itens: lancamentos.map((r) => ({
          id: r.parcela_id,
          descricao: r.descricao,
          vencimento: r.vencimento,
          valor: parseFloat(r.valor),
          status: r.status,
          pago_em: r.pago_em,
          empresa: r.empresa,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ── GET /financeiro/bancos/:id/lancamentos ─────────────────────────────────
router.get(
  ["/bancos/:id/lancamentos", "/financeiro/bancos/:id/lancamentos"],
  async (req, res) => {
    const { tenant_id } = req.user;
    try {
      const { rows } = await query(
        `SELECT id, tenant_id, conta_id, tipo, descricao, valor::float AS valor,
              TO_CHAR(data, 'YYYY-MM-DD') AS data, obs, movimento_id, created_at
         FROM fin_bancos_lancamentos
        WHERE conta_id = $1 AND tenant_id = $2
        ORDER BY data DESC, created_at DESC`,
        [req.params.id, tenant_id],
      );
      return res.json({ ok: true, data: rows });
    } catch (err) {
      return res.status(500).json({ ok: false, message: err.message });
    }
  },
);

// ── POST /financeiro/bancos/:id/lancamentos ────────────────────────────────
router.post(
  ["/bancos/:id/lancamentos", "/financeiro/bancos/:id/lancamentos"],
  async (req, res) => {
    const { tenant_id } = req.user;
    const { tipo, descricao, valor, data, obs } = req.body;

    const TIPOS_VALIDOS = ["saldo_inicial", "taxa", "rendimento", "aplicacao"];
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ ok: false, message: "Tipo inválido" });
    }
    if (!descricao?.trim())
      return res
        .status(400)
        .json({ ok: false, message: "Descrição obrigatória" });
    if (
      valor === undefined ||
      valor === null ||
      valor === "" ||
      Number.isNaN(Number(valor))
    ) {
      return res.status(400).json({ ok: false, message: "Valor obrigatório" });
    }
    if (!data)
      return res.status(400).json({ ok: false, message: "Data obrigatória" });

    const client = await require("../config/database").pool.connect();
    try {
      await client.query("BEGIN");

      const {
        rows: [contaBanco],
      } = await client.query(
        `SELECT * FROM fin_bancos_contas WHERE id = $1 FOR UPDATE`,
        [req.params.id],
      );
      if (!contaBanco) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ ok: false, message: "Conta bancária não encontrada" });
      }

      const valorNum = parseMoney(valor);
      const dataMovimento = dateOnly(data, todayDateOnly());
      const movimentoId = await inserirMovimentoBanco(client, {
        conta: contaBanco,
        tipo,
        descricao: descricao.trim(),
        valor: valorNum,
        data: dataMovimento,
      });

      const {
        rows: [lanc],
      } = await client.query(
        `INSERT INTO fin_bancos_lancamentos (tenant_id, conta_id, tipo, descricao, valor, data, obs, movimento_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, tenant_id, conta_id, tipo, descricao, valor::float AS valor, TO_CHAR(data, 'YYYY-MM-DD') AS data, obs, movimento_id, created_at`,
        [
          tenant_id,
          req.params.id,
          tipo,
          descricao.trim(),
          valorNum,
          dataMovimento,
          obs || null,
          movimentoId,
        ],
      );

      await client.query(
        `UPDATE fin_bancos_contas
       SET saldo_inicial = COALESCE(saldo_inicial, 0) + $1, updated_at = NOW()
       WHERE id = $2`,
        [valorNum, req.params.id],
      );

      await client.query("COMMIT");
      logger.info(
        `Lançamento bancário: conta=${req.params.id} tipo=${tipo} valor=${valorNum}`,
      );
      return res.status(201).json({ ok: true, data: lanc });
    } catch (err) {
      await client.query("ROLLBACK");
      return res.status(500).json({ ok: false, message: err.message });
    } finally {
      client.release();
    }
  },
);

// ── DELETE /financeiro/bancos/:id/lancamentos/:lancId ─────────────────────
router.delete(
  [
    "/bancos/:id/lancamentos/:lancId",
    "/financeiro/bancos/:id/lancamentos/:lancId",
  ],
  async (req, res) => {
    const { tenant_id } = req.user;
    const client = await require("../config/database").pool.connect();
    try {
      await client.query("BEGIN");

      const {
        rows: [lanc],
      } = await client.query(
        "SELECT valor, movimento_id FROM fin_bancos_lancamentos WHERE id=$1 AND tenant_id=$2",
        [req.params.lancId, tenant_id],
      );
      if (!lanc) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ ok: false, message: "Lançamento não encontrado" });
      }

      await client.query("DELETE FROM fin_bancos_lancamentos WHERE id=$1", [
        req.params.lancId,
      ]);
      if (lanc.movimento_id) {
        await client.query("DELETE FROM fin_movimento WHERE id=$1", [
          lanc.movimento_id,
        ]);
      }

      await client.query(
        `UPDATE fin_bancos_contas
       SET saldo_inicial = COALESCE(saldo_inicial, 0) - $1, updated_at = NOW()
       WHERE id = $2`,
        [parseMoney(lanc.valor), req.params.id],
      );

      await client.query("COMMIT");
      return res.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      return res.status(500).json({ ok: false, message: err.message });
    } finally {
      client.release();
    }
  },
);

module.exports = router;
