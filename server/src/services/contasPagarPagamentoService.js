const CP_MODALIDADES_PAGAMENTO = new Set([
  "PIX",
  "BOLETO",
  "TED",
  "DOC",
  "TRANSFERENCIA",
  "DEBITO_AUTOMATICO",
  "DINHEIRO",
  "CARTAO",
  "OUTRO",
]);

const CP_MODALIDADES_BANCARIAS = new Set(["TED", "DOC", "TRANSFERENCIA"]);

function normalizeModalidadePagamento(value) {
  const normalized = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return CP_MODALIDADES_PAGAMENTO.has(normalized) ? normalized : null;
}

function nullableString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function paymentValue(body, field, fornecedor, fornecedorField) {
  if (hasOwn(body, field)) return nullableString(body[field]);
  return nullableString(fornecedor?.[fornecedorField]);
}

async function preparePaymentSnapshot(client, body = {}) {
  const modalidade = normalizeModalidadePagamento(body.modalidade_pagamento);
  let fornecedor = {};

  if (body.fornecedor_id) {
    const { rows } = await client.query(
      `SELECT chave_pix, banco_nome, codigo_banco, agencia, conta, digito, tipo_conta
         FROM fin_fornecedores
        WHERE id = $1`,
      [body.fornecedor_id],
    );
    fornecedor = rows[0] || {};
  }

  const modalidadeBancaria = CP_MODALIDADES_BANCARIAS.has(modalidade);

  return {
    modalidade_pagamento: modalidade,
    chave_pix_pagamento:
      modalidade === "PIX"
        ? paymentValue(body, "chave_pix_pagamento", fornecedor, "chave_pix")
        : null,
    banco_pagamento_nome:
      modalidadeBancaria
        ? paymentValue(body, "banco_pagamento_nome", fornecedor, "banco_nome")
        : null,
    banco_pagamento_codigo:
      modalidadeBancaria
        ? paymentValue(body, "banco_pagamento_codigo", fornecedor, "codigo_banco")
        : null,
    agencia_pagamento:
      modalidadeBancaria
        ? paymentValue(body, "agencia_pagamento", fornecedor, "agencia")
        : null,
    conta_pagamento:
      modalidadeBancaria
        ? paymentValue(body, "conta_pagamento", fornecedor, "conta")
        : null,
    digito_pagamento:
      modalidadeBancaria
        ? paymentValue(body, "digito_pagamento", fornecedor, "digito")
        : null,
    tipo_conta_pagamento:
      modalidadeBancaria
        ? paymentValue(body, "tipo_conta_pagamento", fornecedor, "tipo_conta")
        : null,
    linha_digitavel_boleto:
      modalidade === "BOLETO"
        ? nullableString(body.linha_digitavel_boleto)
        : null,
  };
}

async function persistFornecedorPaymentDefaults(client, fornecedorId, payment) {
  const id = Number(fornecedorId);
  if (!Number.isInteger(id) || id <= 0 || !payment) return false;

  if (payment.modalidade_pagamento === "PIX") {
    if (!payment.chave_pix_pagamento) return false;
    const result = await client.query(
      `UPDATE fin_fornecedores
          SET chave_pix = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [payment.chave_pix_pagamento, id],
    );
    return Number(result.rowCount || 0) > 0;
  }

  if (CP_MODALIDADES_BANCARIAS.has(payment.modalidade_pagamento)) {
    if (!payment.banco_pagamento_nome || !payment.agencia_pagamento || !payment.conta_pagamento) {
      return false;
    }
    const result = await client.query(
      `UPDATE fin_fornecedores
          SET banco_nome = $1,
              codigo_banco = $2,
              agencia = $3,
              conta = $4,
              digito = $5,
              tipo_conta = $6,
              updated_at = NOW()
        WHERE id = $7`,
      [
        payment.banco_pagamento_nome,
        payment.banco_pagamento_codigo,
        payment.agencia_pagamento,
        payment.conta_pagamento,
        payment.digito_pagamento,
        payment.tipo_conta_pagamento,
        id,
      ],
    );
    return Number(result.rowCount || 0) > 0;
  }

  return false;
}

module.exports = {
  CP_MODALIDADES_BANCARIAS,
  normalizeModalidadePagamento,
  preparePaymentSnapshot,
  persistFornecedorPaymentDefaults,
};
