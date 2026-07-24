const assert = require("assert");
const {
  normalizeModalidadePagamento,
  preparePaymentSnapshot,
  persistFornecedorPaymentDefaults,
} = require("../src/services/contasPagarPagamentoService");

function createClient(fornecedor = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: String(sql), params });
      if (/SELECT chave_pix/i.test(sql)) return { rows: [fornecedor], rowCount: 1 };
      if (/UPDATE fin_fornecedores/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`SQL inesperado no teste: ${sql}`);
    },
  };
}

(async () => {
  assert.strictEqual(normalizeModalidadePagamento(" transferência "), "TRANSFERENCIA");
  assert.strictEqual(normalizeModalidadePagamento("pix"), "PIX");
  assert.strictEqual(normalizeModalidadePagamento("invalida"), null);

  const fornecedor = {
    chave_pix: "pix-antiga",
    banco_nome: "Banco Antigo",
    codigo_banco: "001",
    agencia: "1234",
    conta: "56789",
    digito: "0",
    tipo_conta: "Corrente",
  };

  const fallbackClient = createClient(fornecedor);
  const fallback = await preparePaymentSnapshot(fallbackClient, {
    fornecedor_id: 10,
    modalidade_pagamento: "TED",
  });
  assert.strictEqual(fallback.banco_pagamento_nome, "Banco Antigo");
  assert.strictEqual(fallback.agencia_pagamento, "1234");
  assert.strictEqual(fallback.conta_pagamento, "56789");

  const transferClient = createClient(fornecedor);
  const transfer = await preparePaymentSnapshot(transferClient, {
    fornecedor_id: 10,
    modalidade_pagamento: "TRANSFERENCIA",
    banco_pagamento_nome: "Banco Novo",
    banco_pagamento_codigo: "999",
    agencia_pagamento: "0001",
    conta_pagamento: "22222",
    digito_pagamento: "3",
    tipo_conta_pagamento: "Corrente",
  });
  assert.strictEqual(transfer.banco_pagamento_nome, "Banco Novo");
  assert.strictEqual(transfer.agencia_pagamento, "0001");
  assert.strictEqual(transfer.conta_pagamento, "22222");
  assert.strictEqual(await persistFornecedorPaymentDefaults(transferClient, 10, transfer), true);
  const bankUpdate = transferClient.calls.find(call => /UPDATE fin_fornecedores/i.test(call.sql));
  assert(bankUpdate, "Transferência precisa atualizar o fornecedor");
  assert(/banco_nome/i.test(bankUpdate.sql));
  assert.deepStrictEqual(bankUpdate.params, ["Banco Novo", "999", "0001", "22222", "3", "Corrente", 10]);

  const pixClient = createClient(fornecedor);
  const pix = await preparePaymentSnapshot(pixClient, {
    fornecedor_id: 10,
    modalidade_pagamento: "PIX",
    chave_pix_pagamento: "nova-chave-pix",
  });
  assert.strictEqual(pix.chave_pix_pagamento, "nova-chave-pix");
  assert.strictEqual(await persistFornecedorPaymentDefaults(pixClient, 10, pix), true);
  const pixUpdate = pixClient.calls.find(call => /UPDATE fin_fornecedores/i.test(call.sql));
  assert(pixUpdate, "PIX precisa atualizar o fornecedor");
  assert(/SET chave_pix/i.test(pixUpdate.sql));
  assert.deepStrictEqual(pixUpdate.params, ["nova-chave-pix", 10]);

  const boletoClient = createClient(fornecedor);
  const boleto = await preparePaymentSnapshot(boletoClient, {
    fornecedor_id: 10,
    modalidade_pagamento: "BOLETO",
    linha_digitavel_boleto: "123 456",
  });
  assert.strictEqual(boleto.linha_digitavel_boleto, "123 456");
  assert.strictEqual(await persistFornecedorPaymentDefaults(boletoClient, 10, boleto), false);
  assert.strictEqual(boletoClient.calls.some(call => /UPDATE fin_fornecedores/i.test(call.sql)), false);

  console.log("Pagamento CP: TED, DOC, transferência, PIX e boleto conferidos.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
