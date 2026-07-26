#!/usr/bin/env node
'use strict'

const fs = require('fs')
const assert = require('assert/strict')
const { PLAN, allParcelEntries, centsToNumber, stableHash } = require('./cb230700_lucky_plan')

const entries = allParcelEntries()
assert.equal(PLAN.version, '0.5.9')
assert.equal(PLAN.returnSha256, 'c2d5b7958f67fb467a1ea0b79f1f0b7ac5806563160e0336945963310b52af75')
assert.equal(PLAN.returnSourceFileSha256, '185e23c6a7b003be8e20cfc9df98dd975a3d751359180b776b7c37edabdbfcba')
assert.equal(PLAN.receiptDate, '2026-07-22')
assert.equal(PLAN.creditDate, '2026-07-23')
assert.equal(PLAN.expectedMovements, 11)
assert.equal(entries.length, 11)
assert.equal(new Set(entries.map(entry => entry.parcel.id)).size, 11)
assert.equal(entries.filter(entry => entry.storeBankIdentifier).length, 2)

const marcia = entries.find(entry => entry.target.key === 'MARCIA-052-120')
assert.ok(marcia)
assert.equal(marcia.parcel.proposed.nominalCents, 171593)
assert.equal(marcia.parcel.proposed.interestCents, 5825)
assert.equal(marcia.parcel.proposed.discountCents, 0)
assert.equal(marcia.parcel.proposed.paidCents, 177418)
assert.equal(marcia.parcel.proposed.nominalCents + marcia.parcel.proposed.interestCents, marcia.parcel.proposed.paidCents)

const briza = entries.filter(entry => entry.target.key === 'BRIZA-018-027')
assert.equal(briza.length, 10)
assert.equal(briza.filter(entry => entry.parcel.proposed.discountCents === 22573).length, 9)
assert.equal(briza.filter(entry => entry.parcel.proposed.discountCents === 22574).length, 1)
assert.equal(briza.filter(entry => entry.parcel.proposed.paidCents === 184748).length, 9)
assert.equal(briza.filter(entry => entry.parcel.proposed.paidCents === 184747).length, 1)
for (const entry of briza) {
  const p = entry.parcel.proposed
  assert.equal(p.nominalCents - p.discountCents, p.paidCents)
  assert.equal(p.interestCents, 0)
}

const sums = entries.reduce((acc, entry) => {
  acc.nominal += entry.parcel.proposed.nominalCents
  acc.discount += entry.parcel.proposed.discountCents
  acc.interest += entry.parcel.proposed.interestCents
  acc.paid += entry.parcel.proposed.paidCents
  return acc
}, { nominal: 0, discount: 0, interest: 0, paid: 0 })
assert.deepEqual(sums, { nominal: 2244803, discount: 225731, interest: 5825, paid: 2024897 })
assert.equal(sums.nominal - sums.discount + sums.interest, sums.paid)
assert.equal(centsToNumber(sums.paid), 20248.97)
assert.equal(stableHash(PLAN).length, 64)

const applySource = fs.readFileSync(require.resolve('./aplicar_correcao_cb230700_lucky'), 'utf8')
assert.match(applySource, /--confirmar=/)
assert.match(applySource, /Movimentos bancários individuais/)
assert.match(applySource, /valor_desconto=/)
assert.match(applySource, /data_recebimento/)
assert.match(applySource, /BEGIN/)
assert.match(applySource, /COMMIT/)
assert.match(applySource, /ROLLBACK/)
assert.match(applySource, /lote_importacao/)
assert.doesNotMatch(applySource, /vincular_todas_as_parcelas_ao_mesmo_movimento\s*:\s*true/)

console.log('Correção CB230700 LUCKY 0.5.9: plano, descontos, juros, datas e 11 movimentos individuais conferidos.')
