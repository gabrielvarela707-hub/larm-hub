#!/usr/bin/env node
'use strict'
const assert = require('assert')
const { allocateProportionally, groupReportTitles, classifyComponent, resolveReturnHashColumn, dateIso } = require('./auditar_sincronizacao_strato_larmhub')


assert.strictEqual(resolveReturnHashColumn(['sha256']), 'sha256')
assert.strictEqual(resolveReturnHashColumn(['hash_arquivo']), 'hash_arquivo')
assert.strictEqual(resolveReturnHashColumn(['hash_arquivo', 'sha256']), 'sha256')
assert.strictEqual(resolveReturnHashColumn([]), null)
assert.strictEqual(dateIso(new Date(2026, 6, 26)), '2026-07-26')
assert.strictEqual(dateIso('2026-07-26T00:00:00.000Z'), '2026-07-26')

const allocations = allocateProportionally(18474.79, Array.from({ length: 10 }, (_, i) => ({ valor_titulo: 2073.21, parcela_numero: i + 18 })))
assert.strictEqual(allocations.length, 10)
assert.strictEqual(Math.round(allocations.reduce((sum, value) => sum + value, 0) * 100), 1847479)
assert.strictEqual(allocations.filter(value => value === 1847.48).length, 9)
assert.strictEqual(allocations.filter(value => value === 1847.47).length, 1)

const grouped = groupReportTitles({ titulos: [
  { boleto: '260000392183', parcela_numero: 27 },
  { boleto: '260000392183', parcela_numero: 18 },
  { boleto: '260000389786', parcela_numero: 52 },
] })
assert.deepStrictEqual(grouped.get('260000392183').map(item => item.parcela_numero), [18, 27])
assert.strictEqual(grouped.get('260000389786').length, 1)

const corrupt = classifyComponent(
  { parcela_numero: 52, parcela_total: 120, parcela: '052/120', vencimento: '2026-06-10', valor_titulo: 1715.93 },
  [{ id: 'x', parcela_numero_legado: 13, parcela_total_legado: 30, vencimento: '2026-06-10', valor_atual: 1727.42, status: 'atrasada', movimento_id: null, pago_em: null }],
)
assert.strictEqual(corrupt.classificacao, 'PROVAVEL_FRACAO_CORROMPIDA_NA_IMPORTACAO')
assert.strictEqual(corrupt.bloqueado, false)

const paid = classifyComponent(
  { parcela_numero: 7, parcela_total: 37, parcela: '007/037', vencimento: '2026-07-15', valor_titulo: 2061.25 },
  [{ id: 'y', parcela_numero_legado: 7, parcela_total_legado: 37, vencimento: '2026-07-15', valor_atual: 2061.25, status: 'paga', movimento_id: 1, pago_em: '2026-07-15' }],
)
assert.strictEqual(paid.bloqueado, true)

console.log('Auditoria Strato x LarmHub: cálculos, agrupamento e proteções OK.')
