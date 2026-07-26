const assert = require('assert')
const { parseStratoPdfText, normalizeStratoReport } = require('../src/services/stratoReturnReportAnalyzer')
const { compareParcel, paidParcelCorrectionAction } = require('../src/services/stratoMultiParcelAnalysisService')
const { eligibleAction } = require('../src/services/stratoIntelligentApplyService')

const sample = `
EMPRESA TESTE LTDA                                                                                                           Pag 001
Strato 8.9                                                                                                           Data 21/07/2026
CRÍTICA COBRANÇA Banco: 237-BANCO BRADESCO S/A Conta: 33214-3 C:\\STRATO\\RETORNO\\CB210700.RET

  OBRA         UNID.       PARCELA    BOLETO              VENCTO       A PAGAR     J.FCT     SEGURO    MORAS         VL.DESC    RESIDUO      TOTAL
Conta                                                      PAGTO         PAGO                                                    TOTAL       VL.DIF
Motivo                                                   Ocorrências                                   Ocorrências

     7698       O-14       004/151    260000390229       30/06/2026     1.162,48      0,00      0,00      31,04          0,00        0,00     1.193,52
    33214          1334-CLIENTE DE TESTE                  20/07/2026     1.162,48      0,00      0,00      31,04                  1.193,52        0,00
- 06-Motivo não cadastrado                                                                                                                            0
TOTAL A PAGAR:
`

const raw = parseStratoPdfText(sample)
assert(raw && raw.titulos.length === 1, 'A linha tabular deve ser encontrada')
const normalized = normalizeStratoReport(raw, { filename: 'critica.pdf', provider: 'teste' })
const row = normalized.titulos[0]
assert.strictEqual(row.valor_a_pagar, 1162.48)
assert.strictEqual(row.moras_pago, 31.04)
assert.strictEqual(row.valor_pago, 1193.52)

const parcel = {
  parcela_numero_legado: 4,
  parcela_total_legado: 151,
  vencimento: '2026-06-30',
  valor_nominal: 1162.48,
  valor_desconto: 0,
  valor_juros_mora: 7.79,
  valor_seguro: 0,
  valor_residuo: 0,
  valor_pago: 1170.27,
  movimento_id: 123,
  origem_baixa: 'retorno_bradesco',
}
const comparison = compareParcel(row, parcel)
assert(comparison.divergencias.includes('VALOR_PAGO_DIVERGENTE'))
assert.strictEqual(paidParcelCorrectionAction(parcel, comparison), 'ATUALIZAR_RECEBIMENTO_EXISTENTE')
assert.strictEqual(eligibleAction({ acao_proposta: 'ATUALIZAR_RECEBIMENTO_EXISTENTE' }), true)

console.log('OK — parser tabular e correção de baixa existente 0.7.7')
