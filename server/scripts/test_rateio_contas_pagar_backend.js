/**
 * Testes locais e sem banco para as regras matemáticas do rateio.
 * Rodar: node scripts/test_rateio_contas_pagar_backend.js
 */

const assert = require('assert')
const {
  moneyToCents,
  normalizeRateioItems,
  allocateCents,
  allocateMatrixCents,
  splitParcelasByRateio,
} = require('../src/services/contasPagarRateioService')

function expectError(fn, text) {
  let thrown = null
  try {
    fn()
  } catch (err) {
    thrown = err
  }
  assert(thrown, `Era esperado erro contendo: ${text}`)
  assert(
    String(thrown.message).includes(text),
    `Erro recebido: ${thrown.message}`,
  )
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0)
}

const items = normalizeRateioItems(
  [
    { banco_conta_id: 1, percentual: 33.3333, valor: 333.33 },
    { banco_conta_id: 2, percentual: 33.3333, valor: 333.33 },
    { banco_conta_id: 3, percentual: 33.3334, valor: 333.34 },
  ],
  1000,
)
assert.strictEqual(items.length, 3)
assert.strictEqual(sum(items.map((item) => item.valor_centavos)), 100000)

const roundedHalfItems = normalizeRateioItems(
  [
    { banco_conta_id: 1, percentual: 50, valor: 5.01 },
    { banco_conta_id: 2, percentual: 50, valor: 5.00 },
  ],
  10.01,
)
assert.strictEqual(sum(roundedHalfItems.map((item) => item.valor_centavos)), 1001)

expectError(
  () => normalizeRateioItems([{ banco_conta_id: 1, percentual: 100, valor: 100 }], 100),
  'pelo menos duas contas',
)
expectError(
  () => normalizeRateioItems([
    { banco_conta_id: 1, percentual: 50, valor: 50 },
    { banco_conta_id: 1, percentual: 50, valor: 50 },
  ], 100),
  'mesma conta bancária',
)
expectError(
  () => normalizeRateioItems([
    { banco_conta_id: 1, percentual: 60, valor: 50 },
    { banco_conta_id: 2, percentual: 40, valor: 40 },
  ], 100),
  'soma dos valores',
)
expectError(
  () => normalizeRateioItems([
    { banco_conta_id: 1, percentual: 60, valor: 60 },
    { banco_conta_id: 2, percentual: 39.9999, valor: 40 },
  ], 100),
  'exatamente 100%',
)
expectError(
  () => normalizeRateioItems([
    { banco_conta_id: 1, percentual: 50, valor: 60 },
    { banco_conta_id: 2, percentual: 50, valor: 40 },
  ], 100),
  'não correspondem entre si',
)

const allocated = allocateCents(1, [1, 1, 1])
assert.strictEqual(sum(allocated), 1)
assert.deepStrictEqual(allocated, [1, 0, 0])

const largeAllocation = allocateCents(742484100, [33333300, 33333300, 33333400])
assert.strictEqual(sum(largeAllocation), 742484100)
assert(largeAllocation.every(Number.isSafeInteger))

const matrix = allocateMatrixCents(
  [1001, 2002, 3003],
  [2000, 2000, 2006],
)
assert.deepStrictEqual(matrix.map((row) => sum(row)), [1001, 2002, 3003])
assert.deepStrictEqual(
  [0, 1, 2].map((column) => sum(matrix.map((row) => row[column]))),
  [2000, 2000, 2006],
)

const parcelas = [
  {
    numero: 1,
    valor: 333.33,
    vencimento: '2026-08-10',
    status: 'pendente',
    acrescimo: 1.01,
    desconto: 0.02,
    retencao_ipi: 0,
    retencao_iss: 0,
    retencao_icms: 0,
    retencao_pis: 0,
    retencao_cofins: 0,
    retencao_csll: 0,
    retencao_irrf: 0,
    retencao_inss: 0,
    juros: 0,
    multa: 0,
    valor_final: 334.32,
  },
  {
    numero: 2,
    valor: 666.67,
    vencimento: '2026-09-10',
    status: 'pendente',
    acrescimo: 0,
    desconto: 0,
    retencao_ipi: 0,
    retencao_iss: 0,
    retencao_icms: 0,
    retencao_pis: 0,
    retencao_cofins: 0,
    retencao_csll: 0,
    retencao_irrf: 0,
    retencao_inss: 0,
    juros: 0,
    multa: 0,
    valor_final: 666.67,
  },
]

const splits = splitParcelasByRateio(parcelas, items, 1000)
assert.strictEqual(splits.length, 3)
assert.deepStrictEqual(
  splits.map((partes) => sum(partes.map((parcela) => moneyToCents(parcela.valor)))),
  items.map((item) => item.valor_centavos),
)
assert.deepStrictEqual(
  [0, 1].map((parcelaIndex) =>
    sum(splits.map((partes) => moneyToCents(partes[parcelaIndex].valor))),
  ),
  [33333, 66667],
)
assert.strictEqual(
  sum(splits.map((partes) => moneyToCents(partes[0].acrescimo))),
  101,
)
assert(splits.flat().every((parcela) => parcela.status === 'pendente'))

expectError(
  () => splitParcelasByRateio([
    { ...parcelas[0], valor: 100 },
    { ...parcelas[1], valor: 100 },
  ], items, 1000),
  'soma dos valores das parcelas',
)

console.log('✅ Testes locais do rateio: OK')
console.log('- validação de contas, percentuais e valores: OK')
console.log('- preservação dos totais por parcela: OK')
console.log('- preservação dos totais por conta: OK')
console.log('- arredondamento em centavos e valores elevados: OK')
