const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

process.env.TZ = 'Europe/Paris'

const root = path.resolve(__dirname, '..')
const roundMoney = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
const onlyDigits = value => String(value || '').replace(/\D/g, '')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './bradescoCnab400') return { onlyDigits }
  if (request === './bradescoReturnProcessor') {
    return {
      normalizeCompany: value => String(value || '').trim().toUpperCase(),
      roundMoney,
      inferReturnContext: async () => ({}),
      expectedParcelType: () => null,
      loadPersistedReturnResult: async () => ({}),
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const analyzer = require(path.join(root, 'src/services/stratoMultiParcelAnalysisService.js'))
const apply = require(path.join(root, 'src/services/stratoIntelligentApplyService.js'))
Module._load = originalLoad

// Reproduz o valor retornado pelo node-postgres para DATE em servidor UTC+2:
// meia-noite local aparece como 22:00Z no JSON, mas o dia comercial é 23/06.
const businessDate = new Date(2026, 5, 23)
assert.strictEqual(businessDate.toISOString().slice(0, 10), '2026-06-22')
assert.strictEqual(analyzer.isoDate(businessDate), '2026-06-23')

const report008 = {
  parcela: '008/009',
  vencimento: '2026-06-23',
  valor_a_pagar: 364.37,
  boleto: '260000389743',
}
const candidates008 = [
  {
    id: '4591c9f7-0369-44de-a5fb-a4430384345d',
    parcela_numero_legado: 27,
    parcela_total_legado: 58,
    vencimento: businessDate,
    vencimento_data: '2026-06-23',
    valor_nominal: '1599.16',
    status: 'paga',
  },
  {
    id: '7c5ad339-27c6-48b2-b9ac-3b502c278260',
    parcela_numero_legado: 14,
    parcela_total_legado: 15,
    vencimento: businessDate,
    vencimento_data: '2026-06-23',
    valor_nominal: '262.03',
    status: 'paga',
  },
  {
    id: '805c61f7-9127-47c5-9e5b-9f5126df48e7',
    parcela_numero_legado: 8,
    parcela_total_legado: 9,
    vencimento: businessDate,
    vencimento_data: '2026-06-23',
    valor_nominal: '366.82',
    status: 'atrasada',
  },
  {
    id: 'f229c74b-9845-471e-9ce1-8bedc77c344b',
    parcela_numero_legado: 8,
    parcela_total_legado: 9,
    vencimento: new Date(2030, 7, 23),
    vencimento_data: '2030-08-23',
    valor_nominal: '2273.32',
    status: 'aberta',
  },
]
const selected008 = analyzer.selectParcel(report008, candidates008, { multiparcelas: true })
assert.strictEqual(selected008.ambiguous, false)
assert.strictEqual(selected008.parcel.id, '805c61f7-9127-47c5-9e5b-9f5126df48e7')

const paidParcel = { origem_baixa: 'retorno_bradesco', movimento_id: '102886' }
assert.strictEqual(
  analyzer.paidParcelCorrectionAction(paidParcel, { divergencias: ['VALOR_NOMINAL_DIVERGENTE', 'VENCIMENTO_DIVERGENTE'] }),
  'NENHUMA',
)
assert.strictEqual(
  analyzer.paidParcelCorrectionAction(paidParcel, { divergencias: ['JUROS_OU_MORAS_DIVERGENTES'] }),
  'ATUALIZAR_RECEBIMENTO_EXISTENTE',
)

const analyzerSource = fs.readFileSync(path.join(root, 'src/services/stratoMultiParcelAnalysisService.js'), 'utf8')
const applySource = fs.readFileSync(path.join(root, 'src/services/stratoIntelligentApplyService.js'), 'utf8')
assert(analyzerSource.includes("to_char(p.vencimento, 'YYYY-MM-DD') AS vencimento_data"))
assert(analyzerSource.includes('MUTABLE_RECEIPT_DIVERGENCES'))
assert(!analyzerSource.match(/MUTABLE_RECEIPT_DIVERGENCES = new Set\(\[\s*'VALOR_NOMINAL_DIVERGENTE'/))
assert(applySource.includes("'liquidado_corrigido', 'ja_baixada'"))
assert(applySource.includes("versao_aplicacao_strato: '0.8.2'"))

console.log('OK 0.8.2 — data comercial, idempotência e fechamento multiparcelas')
