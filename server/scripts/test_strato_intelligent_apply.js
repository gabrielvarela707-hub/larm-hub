const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  stableSelectionKey,
  getAnalysisItems,
  normalizeFilename,
  normalizeSelectionDescriptor,
  analysisSelectionDescriptor,
  selectionMatchesParcel,
  resolveSelectionDescriptor,
  selectionBelongsToAnalysisItem,
  resolveReturnItemForSelection,
  chooseDirectFinancialSource,
  bankIdentifierEquivalent,
  fractionsEquivalent,
} = require('../src/services/stratoIntelligentApplyService')


assert.deepStrictEqual(
  getAnalysisItems({ itens: [{ linha: 3 }, { linha: 12 }] }).map(item => item.linha),
  [3, 12],
  'O aplicador deve consumir a propriedade real "itens" retornada pelo analisador.',
)
assert.deepStrictEqual(
  getAnalysisItems({ items: [{ linha: 7 }] }).map(item => item.linha),
  [7],
  'Compatibilidade com o nome antigo "items" deve ser preservada.',
)

const parcelId = '070d73e5-43ba-497c-8d4d-b5328f391168'
const item = {
  linha: 12,
  boleto: '260000388844',
}
const parcel = {
  relatorio: {
    obra: '7700',
    unidade: 'M-6',
    parcela: '009/150',
    boleto: '260000388844',
    cliente_nome: 'JOAO GABRIEL AMBROSIO',
  },
  cliente: { nome: 'JOAO GABRIEL AMBROSIO' },
  parcela: { id: parcelId },
}

assert.strictEqual(normalizeFilename('CB070700 (1)(1).RET'), 'cb070700.ret')
assert.strictEqual(normalizeFilename('CB070700 (1).RET'), 'cb070700.ret')
assert.strictEqual(bankIdentifierEquivalent('26000038884', '260000388844'), true)
assert.strictEqual(fractionsEquivalent({ number: 9, total: 150 }, { number: 3, total: 50 }), true)

const key = stableSelectionKey('CB070700 (1).RET', item, parcel)
const legacyDescriptor = normalizeSelectionDescriptor(key, 0)
const current = analysisSelectionDescriptor('CB070700 (1)(1).RET', { ...item, linha: 3 }, parcel)
assert.strictEqual(selectionMatchesParcel(legacyDescriptor, current), true, 'O ID da parcela deve sobreviver à mudança de linha/nome duplicado do arquivo.')

const structured = normalizeSelectionDescriptor({
  key: 'stale-key',
  arquivo: 'CB070700 (1).RET',
  parcela_id: '28d25ea5-feb6-4c13-a871-0b634057c81f',
  nosso_numero: '260000388844',
  cliente_nome: 'João Gabriel Ambrósio',
  parcela_nome: '003/050',
  obra: '7700',
  unidade: 'M-6',
}, 1)
assert.strictEqual(selectionMatchesParcel(structured, current), true, 'Nome + nosso número + fração equivalente devem reencontrar a parcela mesmo com ID antigo.')


const staleStringSelection = normalizeSelectionDescriptor(
  'v2|cb070700%20(1).ret|3|070d73e5-43ba-497c-8d4d-b5328f391168',
  3,
)
const recalculatedDifferentParcel = {
  relatorio: {
    obra: '7698',
    unidade: 'X-17',
    parcela: '042/120',
    boleto: '260000389859',
    cliente_nome: 'MARIANA ANTUNES GONÇALVES PEDROSA',
  },
  cliente: { nome: 'MARIANA ANTUNES GONÇALVES PEDROSA' },
  parcela: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
}
const resolvedStaleString = resolveSelectionDescriptor({
  descriptors: [staleStringSelection],
  consumedSelections: new Set(),
  filename: 'CB070700 (1)(1).RET',
  analysisItem: { linha: 3, boleto: '260000389859' },
  parcelAnalysis: recalculatedDifferentParcel,
})
assert.strictEqual(resolvedStaleString?.parcelId, '070d73e5-43ba-497c-8d4d-b5328f391168', 'A linha aprovada deve preservar o ID escolhido, mesmo que a reanálise aponte outra parcela equivalente.')

const wrongClient = normalizeSelectionDescriptor({
  arquivo: 'CB070700.RET',
  nosso_numero: '260000388844',
  cliente_nome: 'OUTRO CLIENTE',
  parcela_nome: '009/150',
}, 2)
assert.strictEqual(selectionMatchesParcel(wrongClient, current), false, 'Cliente diferente não pode ser aplicado.')

const serviceSource = fs.readFileSync(path.join(__dirname, '../src/services/stratoIntelligentApplyService.js'), 'utf8')
const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/recebiveis.js'), 'utf8')
assert(serviceSource.includes('valor_juros_total_ajustado'))
assert(serviceSource.includes('valor_desconto_ajustado'))
assert(serviceSource.includes('A linha indicada pela seleção não existe no RET enviado.'))
assert(!serviceSource.includes('A aplicação foi cancelada:'))
assert(serviceSource.includes("SET valor_juros_financiamento=$1"))
assert(!serviceSource.includes("SET documento_legado=$1"), 'A baixa de parcela existente não deve sobrescrever documento, vencimento ou nominal.')
assert(routeSource.includes("typeof value === 'string' || (value && typeof value === 'object')"))
assert(serviceSource.includes('matchedSelection?.parcelId || parcelAnalysis.parcela?.id'))
assert(serviceSource.includes('ID_DIRETO_E_INDICES_APROVADOS_NO_FRONTEND'))
assert(serviceSource.includes('sameLine.length === 1'))



const directSelection = normalizeSelectionDescriptor(
  'v2|cb070700%20(1).ret|3|070d73e5-43ba-497c-8d4d-b5328f391168',
  4,
)
assert.strictEqual(
  selectionBelongsToAnalysisItem(directSelection, 'CB070700 (1)(2).RET', { linha: 3 }),
  true,
  'A seleção deve continuar válida mesmo com novo sufixo de cópia do arquivo.',
)

const selectedDbParcel = {
  id: '070d73e5-43ba-497c-8d4d-b5328f391168',
  contrato_id: 'e7200c53-2c17-41ab-9d64-3290dcaab5d6',
  documento_legado: '1244 7/20',
  parcela_numero_legado: 7,
  parcela_total_legado: 20,
  valor_nominal: '1357.33',
  vencimento: '2026-06-15T22:00:00.000Z',
  cliente_nome: 'MARIANA ANTUNES GONÇALVES PEDROSA',
  obra_codigo_legado: 7698,
  unidade_codigo_legado: 'X-17',
}
const analysisWithoutCandidates = {
  linha: 3,
  boleto: '260000389859',
  documento: 'P 042/120',
  data_recebimento: '2026-07-06',
  data_credito: '2026-07-07',
  ocorrencia: '06',
  valor_titulo_retorno: 1348.30,
  valor_retorno: 1384.26,
  quantidade_parcelas: 0,
  parcelas: [],
  totais_relatorio: {
    valor_nominal: 1348.30,
    valor_juros_financeiro: 0,
    valor_seguro: 0,
    valor_moras: 35.96,
    valor_desconto: 0,
    valor_residuo: 0,
    valor_total: 1384.25,
    valor_pago: 1384.26,
    valor_diferenca: -0.01,
  },
}
const directSource = chooseDirectFinancialSource(analysisWithoutCandidates, directSelection, selectedDbParcel)
assert(directSource?.synthetic, 'Sem candidatos recalculados, a linha única deve fornecer os valores financeiros diretamente.')
assert.strictEqual(directSource.parcelAnalysis.parcela.id, selectedDbParcel.id)
assert.strictEqual(directSource.parcelAnalysis.valor_moras, 35.96)
assert.strictEqual(directSource.parcelAnalysis.valor_pago, 1384.26)
assert.strictEqual(directSource.parcelAnalysis.relatorio.parcela, '042/120')


const joseSelection = normalizeSelectionDescriptor(
  'v2|cb070700%20(1).ret|12|28d25ea5-feb6-4c13-a871-0b634057c81f',
  5,
)
const joseDbParcel = {
  id: '28d25ea5-feb6-4c13-a871-0b634057c81f',
  contrato_id: 'bcf52f45-0bfa-4936-8cf9-831cd73809cd',
  documento_legado: '1208 5/12',
  parcela_numero_legado: 5,
  parcela_total_legado: 12,
  valor_nominal: '1531.74',
  vencimento: '2026-05-05T22:00:00.000Z',
  cliente_nome: 'JOSE REINALDO SOUSA ROCHA',
  obra_codigo_legado: 7698,
  unidade_codigo_legado: 'B-20',
}
const joseLineWithoutCandidates = {
  linha: 12,
  boleto: '260000392175',
  documento: '050/120-pa',
  data_recebimento: '2026-07-06',
  data_credito: '2026-07-07',
  ocorrencia: '06',
  valor_titulo_retorno: 1561.09,
  valor_retorno: 1561.09,
  quantidade_parcelas: 0,
  parcelas: [],
  totais_relatorio: {
    valor_nominal: 1497.69,
    valor_juros_financeiro: 0,
    valor_seguro: 0,
    valor_moras: 63.40,
    valor_desconto: 0,
    valor_residuo: 0,
    valor_total: 1558.09,
    valor_pago: 1561.09,
    valor_diferenca: -3,
  },
}
const joseDirectSource = chooseDirectFinancialSource(joseLineWithoutCandidates, joseSelection, joseDbParcel)
assert(joseDirectSource?.synthetic)
assert.strictEqual(joseDirectSource.parcelAnalysis.parcela.id, joseDbParcel.id)
assert.strictEqual(joseDirectSource.parcelAnalysis.valor_moras, 63.4)
assert.strictEqual(joseDirectSource.parcelAnalysis.valor_pago, 1561.09)
assert.strictEqual(joseDirectSource.parcelAnalysis.relatorio.parcela, '050/120')

const parsedRealRet = {
  details: [
    { lineNumber: 2, nossoNumero: '26000039217', nossoNumeroDv: '5', occurrence: '02', documentNumber: '050/120-pa' },
    { lineNumber: 3, nossoNumero: '26000038985', nossoNumeroDv: '9', occurrence: '06', documentNumber: 'P 042/120' },
    { lineNumber: 12, nossoNumero: '26000039217', nossoNumeroDv: '5', occurrence: '06', documentNumber: '050/120-pa' },
  ],
}
assert.strictEqual(resolveReturnItemForSelection(parsedRealRet, directSelection)?.lineNumber, 3)
assert.strictEqual(resolveReturnItemForSelection(parsedRealRet, joseSelection)?.lineNumber, 12)
assert.strictEqual(
  selectionBelongsToAnalysisItem(
    joseSelection,
    'CB070700 (1)(3).RET',
    { linha: 99, boleto: '260000392175', ocorrencia: '06', documento: '050/120-pa', parcelas: [] },
    parsedRealRet,
  ),
  true,
  'Mesmo se a reanálise mudar o número da linha, boleto + ocorrência do RET devem manter a seleção aprovada.',
)
assert.strictEqual(
  selectionBelongsToAnalysisItem(
    joseSelection,
    'CB070700 (1)(3).RET',
    { linha: 2, boleto: '260000392175', ocorrencia: '02', documento: '050/120-pa', parcelas: [] },
    parsedRealRet,
  ),
  false,
  'O boleto duplicado de entrada confirmada não pode substituir a liquidação selecionada.',
)

const indexedSelection = normalizeSelectionDescriptor({
  key: 'v2|cb070700%20(1).ret|3|070d73e5-43ba-497c-8d4d-b5328f391168',
  arquivo: 'CB070700 (1).RET',
  item: 7,
  parcela: 1,
  parcela_id: parcelId,
  parcela_nome: '042/120',
  juros_ajustados: 35.96,
  desconto_ajustado: 0,
}, 6)
assert.strictEqual(indexedSelection.itemIndex, 7)
assert.strictEqual(indexedSelection.parcelIndex, 1)
assert.strictEqual(indexedSelection.jurosAjustados, 35.96)
const indexedCandidates = [
  { parcela: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, valor_pago: 1 },
  { parcela: { id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }, valor_pago: 1384.26 },
]
const indexedSource = chooseDirectFinancialSource({ parcelas: indexedCandidates }, indexedSelection, selectedDbParcel)
assert.strictEqual(indexedSource.parcelAnalysis, indexedCandidates[1])
assert.strictEqual(indexedSource.source, 'INDICE_APROVADO_NO_FRONTEND')

console.log('Aplicação inteligente Strato 0.7.3: UUID e índices aprovados no frontend, sem trava pela linha física do RET.')
