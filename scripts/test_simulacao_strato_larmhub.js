#!/usr/bin/env node
'use strict'

const assert = require('assert')
const {
  allocateProportionally,
  dateIso,
  resolveHashColumn,
  matchComponent,
  buildComponentProposal,
  buildAlreadySettledPlan,
  fullBankNumber,
} = require('./simular_sincronizacao_strato_larmhub')

assert.strictEqual(resolveHashColumn(['sha256']), 'sha256')
assert.strictEqual(resolveHashColumn(['hash_arquivo']), 'hash_arquivo')
assert.strictEqual(resolveHashColumn(['hash_arquivo', 'sha256']), 'sha256')
assert.strictEqual(resolveHashColumn([]), null)

const localDate = new Date(2026, 6, 26)
assert.strictEqual(dateIso(localDate), '2026-07-26')
assert.strictEqual(dateIso('2026-07-26T00:00:00.000Z'), '2026-07-26')
assert.strictEqual(dateIso('Sun Jul 26 2026 00:00:00 GMT+0000'), '2026-07-26')

const components = Array.from({ length: 10 }, (_, index) => ({
  parcela_strato: `${String(index + 18).padStart(3, '0')}/037`,
  valor_nominal_strato: 2073.21,
}))
const allocations = allocateProportionally(18474.79, components)
assert.strictEqual(allocations.length, 10)
assert.strictEqual(Math.round(allocations.reduce((sum, value) => sum + value, 0) * 100), 1847479)
assert.strictEqual(allocations.filter(value => value === 1847.48).length, 9)
assert.strictEqual(allocations.filter(value => value === 1847.47).length, 1)

const marciaComponent = {
  parcela_strato: '052/120',
  vencimento_strato: '2026-06-10',
  valor_nominal_strato: 1715.93,
}
const marciaParcel = {
  id: 'marcia-52',
  documento_legado: '1203 13/30',
  documento_base_legado: '1203',
  parcela_numero_legado: 13,
  parcela_total_legado: 30,
  vencimento: new Date(2026, 5, 10),
  valor_nominal: 1727.42,
  valor_convertido: 1727.42,
  valor_total_relatorio: 1727.42,
  valor_juros_mora: 0,
  valor_desconto: 0,
  valor_atual: 1727.42,
  status: 'atrasada',
  pago_em: null,
  valor_pago: null,
  movimento_id: null,
}
const marciaMatch = matchComponent(marciaComponent, [marciaParcel], {})
assert.strictEqual(marciaMatch.parcela.id, 'marcia-52')
assert.strictEqual(marciaMatch.metodo, 'vencimento_unico')
const marciaProposal = buildComponentProposal({
  data_credito: '2026-07-23',
  nosso_numero: '26000038978',
  nosso_numero_dv: '6',
  controle_participante: '101266',
}, marciaComponent, marciaParcel, 1774.18, 0)
assert.strictEqual(marciaProposal.proposto.parcela_numero_legado, 52)
assert.strictEqual(marciaProposal.proposto.parcela_total_legado, 120)
assert.strictEqual(marciaProposal.proposto.valor_nominal, 1715.93)
assert.strictEqual(marciaProposal.proposto.valor_juros_mora, 58.25)
assert.strictEqual(marciaProposal.proposto.valor_desconto, 0)
assert.ok(marciaProposal.alteracoes_previstas.includes('CORRIGIR_FRACAO'))
assert.ok(marciaProposal.alteracoes_previstas.includes('ATUALIZAR_VALOR_NOMINAL'))
assert.ok(marciaProposal.alteracoes_previstas.includes('BAIXAR_PARCELA'))

const brizaParcel = {
  ...marciaParcel,
  id: 'briza-18',
  documento_legado: '1366 18/37',
  documento_base_legado: '1366',
  parcela_numero_legado: 18,
  parcela_total_legado: 37,
  vencimento: '2027-06-15',
  valor_nominal: 2061.25,
  valor_convertido: 2061.25,
  valor_total_relatorio: 2061.25,
  valor_atual: 2061.25,
  status: 'aberta',
}
const brizaProposal = buildComponentProposal({
  data_credito: '2026-07-23',
  nosso_numero: '26000039218',
  nosso_numero_dv: '3',
}, components[0] = { ...components[0], vencimento_strato: '2027-06-15' }, brizaParcel, 1847.48, 0)
assert.strictEqual(brizaProposal.proposto.valor_nominal, 2073.21)
assert.strictEqual(brizaProposal.proposto.valor_desconto, 225.73)
assert.strictEqual(brizaProposal.proposto.valor_juros_mora, 0)

const settled = buildAlreadySettledPlan({
  boleto: '260000391535',
  cliente_strato: { nome: 'DAYANA APARECIDA RODRIGUES' },
  contrato_selecionado: { numero: 'STR-1372-E-1' },
  documento_retorno: 'E 007/009',
  componentes: [{ parcela_strato: '007/009' }],
}, {
  id: 92,
  status_processamento: 'ja_baixado',
  parcela_id: 'dayana-7',
  movimento_id: '102848',
  valor_pago: 1770.30,
}, {
  id: 'dayana-7',
  documento_legado: '1372 7/9',
  parcela_numero_legado: 7,
  parcela_total_legado: 9,
  vencimento: '2026-07-26',
  valor_nominal: 1770.30,
  valor_pago: 1770.30,
  status: 'paga',
  movimento_id: '102848',
})
assert.strictEqual(settled.seguro_para_ignorar, true)
assert.strictEqual(settled.classificacao, 'JA_CONCILIADO_SEM_ACAO')
assert.strictEqual(fullBankNumber({ nosso_numero: '26000039153', nosso_numero_dv: '5' }), '260000391535')

console.log('Simulação Strato x LarmHub: correspondências, centavos e proteções somente leitura OK.')
