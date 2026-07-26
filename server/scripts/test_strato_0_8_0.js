const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

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

const boleto = '260000389743'
const candidates = [
  { id: 'A', parcela_numero_legado: 8, parcela_total_legado: 9, vencimento: '2026-06-23', valor_nominal: '364.37', nosso_numero: '26000038974', nosso_numero_dv: '3' },
  { id: 'B', parcela_numero_legado: 27, parcela_total_legado: 58, vencimento: '2026-06-23', valor_nominal: '1588.52', nosso_numero: null, nosso_numero_dv: null },
  { id: 'C', parcela_numero_legado: 14, parcela_total_legado: 15, vencimento: '2026-06-23', valor_nominal: '260.28', nosso_numero: null, nosso_numero_dv: null },
]
const reportRows = [
  { parcela: '008/009', vencimento: '2026-06-23', valor_a_pagar: 364.37, boleto },
  { parcela: '054/116', vencimento: '2026-06-23', valor_a_pagar: 1588.52, boleto },
  { parcela: '014/015', vencimento: '2026-06-23', valor_a_pagar: 260.28, boleto },
]

const used = new Set()
const matched = reportRows.map(row => {
  const available = candidates.filter(candidate => !used.has(candidate.id))
  const result = analyzer.selectParcel(row, available, { multiparcelas: true })
  assert(result.parcel, `Parcela não encontrada para ${row.parcela}`)
  used.add(result.parcel.id)
  return result.parcel.id
})
assert.deepStrictEqual(matched, ['A', 'B', 'C'])

const directSource = apply.chooseDirectFinancialSource({
  parcelas: [
    { parcela: { id: 'A' }, relatorio: { parcela: '008/009' } },
    { parcela: { id: 'B' }, relatorio: { parcela: '054/116' } },
    { parcela: { id: 'C' }, relatorio: { parcela: '014/015' } },
  ],
}, { parcelIndex: 1, parcelId: 'A' }, null)
assert.strictEqual(directSource.parcelAnalysis.parcela.id, 'B')
assert.strictEqual(directSource.order, 2)

const applySource = fs.readFileSync(path.join(root, 'src/services/stratoIntelligentApplyService.js'), 'utf8')
assert(applySource.includes('AND (ordem=$2 OR ($3::uuid IS NOT NULL AND parcela_id=$3::uuid))'))
assert(applySource.includes('const effectiveParcelId = sourceParcelId || directSelection.parcelId'))

const frontFile = path.join(root, 'frontend/src/components/financeiro/StratoIntelligentReview.tsx')
if (fs.existsSync(frontFile)) {
  const frontSource = fs.readFileSync(frontFile, 'utf8')
  assert(frontSource.includes('parcela_id: parcel.parcela?.id || undefined'))
  assert(frontSource.includes('row.indice_relatorio ?? parcelIndex'))
}

console.log('OK 0.8.0 — multiparcelas distintas:', matched.join(', '))
