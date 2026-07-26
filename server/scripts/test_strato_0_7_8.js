const assert = require('assert')
const {
  groupReportRows,
  selectGroupForReturn,
  reconcileGroupRounding,
} = require('../src/services/stratoMultiParcelAnalysisService')

const report = {
  nome_arquivo_relatorio: 'RET 21072026 LUCKY_.pdf',
  titulos: [
    {
      indice_relatorio: 1,
      boleto: '260000389743',
      parcela: '008/009',
      data_pagamento: '2026-07-20',
      ocorrencia: null,
      valor_a_pagar: 364.37,
      moras_pago: 10.58,
      valor_pago: 374.95,
    },
    {
      indice_relatorio: 2,
      boleto: '260000389743',
      parcela: '054/116',
      data_pagamento: '2026-07-20',
      ocorrencia: null,
      valor_a_pagar: 1588.52,
      moras_pago: 46.11,
      valor_pago: 1634.62,
    },
    {
      indice_relatorio: 3,
      boleto: '260000389743',
      parcela: '014/015',
      data_pagamento: '2026-07-20',
      ocorrencia: '06',
      valor_a_pagar: 260.28,
      moras_pago: 7.56,
      valor_pago: 267.83,
    },
  ],
}

const groups = groupReportRows([report])
const group = groups.find(item => item.boleto === '260000389743' && item.ocorrencia === '06')
assert(group, 'grupo multiparcelas não encontrado')
assert.strictEqual(group.rows.length, 3)
assert.deepStrictEqual(group.rows.map(row => row.parcela), ['008/009', '054/116', '014/015'])
assert.strictEqual(group.totais.valor_nominal, 2213.17)
assert.strictEqual(group.totais.valor_pago, 2277.4)

const returnItem = {
  nossoNumero: '26000038974',
  nossoNumeroDv: '3',
  occurrence: '06',
  occurrenceDate: '2026-07-20',
  documentNumber: 'A 008/009',
  titleAmount: 2213.17,
  paidAmount: 2277.41,
}
const selected = selectGroupForReturn(returnItem, groups, new Set())
assert(selected, 'grupo não selecionado para o RET')
assert.strictEqual(selected.rows.length, 3)

const rounding = reconcileGroupRounding(selected, returnItem.paidAmount)
assert.strictEqual(rounding.group.totais.valor_pago, 2277.41)
assert.strictEqual(rounding.difference, 0.01)

const mixed = groupReportRows([{ titulos: [
  { indice_relatorio: 1, boleto: '260000392175', data_pagamento: '2026-07-06', ocorrencia: '02', valor_pago: 0 },
  { indice_relatorio: 2, boleto: '260000392175', data_pagamento: '2026-07-06', ocorrencia: '06', valor_pago: 1561.09 },
] }]).filter(item => item.boleto === '260000392175')
assert.deepStrictEqual(mixed.map(item => item.ocorrencia).sort(), ['02', '06'])

console.log('OK — multiparcelas, arredondamento e separação 02/06 validados na versão 0.7.8')
