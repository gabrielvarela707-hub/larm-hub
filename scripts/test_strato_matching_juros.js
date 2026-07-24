#!/usr/bin/env node
const assert = require('assert')
const {
  scoreParcelForReport,
  equivalentParcelFraction,
  fullReturnBoleto,
  explicitFinancialComposition,
} = require('../src/services/bradescoReturnProcessor')
const {
  groupReportRows,
  selectGroupForReturn,
  fractionsEquivalent,
} = require('../src/services/stratoMultiParcelAnalysisService')

function candidateParcel({
  clientCode,
  clientName,
  contract,
  unit,
  obra,
  fractionNumber,
  fractionTotal,
  dueDate,
  nominal,
  current,
  nossoNumero,
  nossoNumeroDv,
}) {
  return {
    id: 'parcel-test',
    cliente_codigo: String(clientCode),
    cliente_codigo_legado: String(clientCode),
    cliente_nome: clientName,
    contrato_numero: contract,
    contrato_unidade_codigo: unit,
    unidade_codigo_legado: unit,
    contrato_obra_codigo: Number(obra),
    obra_codigo_legado: Number(obra),
    parcela_numero_legado: fractionNumber,
    parcela_total_legado: fractionTotal,
    vencimento: dueDate,
    valor_nominal: nominal,
    valor_atual: current,
    nosso_numero: nossoNumero || null,
    nosso_numero_dv: nossoNumeroDv || null,
    controle_participante: null,
    documento_legado: `${contract.replace(/^STR-/, '')} ${fractionNumber}/${fractionTotal}`,
  }
}

const joseItem = {
  occurrence: '06',
  occurrenceDate: '2026-07-06',
  dueDate: '2026-05-06',
  titleAmount: 1497.69,
  paidAmount: 1561.09,
  nossoNumero: '26000039217',
  nossoNumeroDv: '5',
  documentNumber: 'P 050/120',
}
const joseReport = {
  cliente_codigo: '1340',
  cliente_nome: 'JOSE REINALDO SOUSA ROCHA',
  obra: '7698',
  unidade: 'B-20',
  parcela: '050/120',
  parcela_numero: 50,
  parcela_total: 120,
  vencimento: '2026-05-06',
  data_pagamento: '2026-07-06',
  valor_titulo: 1497.69,
  valor_pago: 1561.09,
  valor_a_pagar: 1497.69,
  moras_pago: 63.40,
  valor_desconto: 0,
  boleto: '260000392175',
  ocorrencia: '06',
}
const joseParcel = candidateParcel({
  clientCode: 1340,
  clientName: 'JOSE REINALDO SOUSA ROCHA',
  contract: 'STR-1340-B-20',
  unit: 'B-20',
  obra: 7698,
  fractionNumber: 5,
  fractionTotal: 12,
  dueDate: '2026-05-06',
  nominal: 1466.24,
  current: 1466.24,
  nossoNumero: '26000038779',
  nossoNumeroDv: '1',
})
const joseScore = scoreParcelForReport(joseParcel, joseItem, joseReport)
assert.strictEqual(fullReturnBoleto(joseItem), '260000392175')
assert.strictEqual(equivalentParcelFraction({ number: 50, total: 120 }, { number: 5, total: 12 }), true)
assert.strictEqual(fractionsEquivalent({ number: 42, total: 120 }, { number: 7, total: 20 }), true)
assert(joseScore.score >= 100, `Score insuficiente: ${joseScore.score}`)
assert.strictEqual(joseScore.identityEvidence, true)
assert(joseScore.financialEvidence >= 2, `Evidências financeiras insuficientes: ${joseScore.financialEvidence}`)
assert(joseScore.evidence.includes('FRACAO_EQUIVALENTE'))
assert(joseScore.evidence.includes('DIFERENCA_EXPLICADA_PELO_RELATORIO'))

const composition = explicitFinancialComposition(joseReport)
assert.strictEqual(composition.explicit, true)
assert.strictEqual(composition.additions, 63.40)
assert.strictEqual(composition.discount, 0)

const marianaScore = scoreParcelForReport(candidateParcel({
  clientCode: 1368,
  clientName: 'MARIANA ANTUNES GONCALVES PEDROSA',
  contract: 'STR-1368-X-17',
  unit: 'X-17',
  obra: 7698,
  fractionNumber: 7,
  fractionTotal: 20,
  dueDate: '2026-06-16',
  nominal: 1348.30,
  current: 1348.30,
}), {
  occurrence: '06',
  occurrenceDate: '2026-07-06',
  dueDate: '2026-06-16',
  titleAmount: 1348.30,
  paidAmount: 1384.26,
  nossoNumero: '26000038985',
  nossoNumeroDv: '9',
  documentNumber: 'P 042/120',
}, {
  cliente_codigo: '1368',
  cliente_nome: 'MARIANA ANTUNES GONCALVES PEDROSA',
  obra: '7698',
  unidade: 'X-17',
  parcela: '042/120',
  vencimento: '2026-06-16',
  data_pagamento: '2026-07-06',
  valor_titulo: 1348.30,
  valor_pago: 1384.26,
  valor_a_pagar: 1348.30,
  moras_pago: 35.96,
  valor_desconto: 0,
  boleto: '260000389859',
  ocorrencia: '06',
})
assert(marianaScore.score >= 100)
assert(marianaScore.financialEvidence >= 2)
assert(marianaScore.evidence.includes('FRACAO_EQUIVALENTE'))

const reports = [{
  nome_arquivo_relatorio: 'RET 07072026 LUCKY.pdf',
  titulos: [
    {
      boleto: '260000392175',
      ocorrencia: '02',
      data_pagamento: '2026-07-06',
      parcela: '050/120',
      vencimento: '2026-07-06',
      valor_titulo: 0,
      valor_pago: 0,
    },
    joseReport,
  ],
}]
const groups = groupReportRows(reports)
assert.strictEqual(groups.length, 2, 'Ocorrências 02 e 06 do mesmo boleto precisam de grupos separados.')
const used = new Set()
const occurrence02 = selectGroupForReturn({
  nossoNumero: '26000039217',
  nossoNumeroDv: '5',
  occurrence: '02',
  occurrenceDate: '2026-07-06',
  documentNumber: '050/120-pa',
  dueDate: '2026-07-06',
  titleAmount: 0,
}, groups, used)
assert(occurrence02)
assert.strictEqual(occurrence02.ocorrencia, '02')
const occurrence06 = selectGroupForReturn(joseItem, groups, used)
assert(occurrence06)
assert.strictEqual(occurrence06.ocorrencia, '06')
assert.strictEqual(occurrence06.rows[0].cliente_codigo, '1340')

const applySource = require('fs').readFileSync(require('path').join(__dirname, '../src/services/stratoIntelligentApplyService.js'), 'utf8')
assert(applySource.includes('identificador_bancario_anterior'))
assert(applySource.includes('nosso_numero=CASE WHEN $18::boolean THEN $19 ELSE nosso_numero END'))
assert(applySource.includes("analise_inteligente_strato_0_6_6"))

console.log('Conciliação Strato 0.6.6: DV, boleto reemitido, frações equivalentes, juros/moras e seleção persistente conferidos.')
