'use strict'

const crypto = require('crypto')

const PLAN = Object.freeze({
  version: '0.5.9',
  batch: 'CR-CB230700-LUCKY-20260722-059',
  tenantId: 'a1000000-0000-4000-8000-000000000001',
  returnId: '2b6dcf62-46d3-464c-a5fe-9ed7d8050e62',
  returnSha256: 'c2d5b7958f67fb467a1ea0b79f1f0b7ac5806563160e0336945963310b52af75',
  returnSourceFileSha256: '185e23c6a7b003be8e20cfc9df98dd975a3d751359180b776b7c37edabdbfcba',
  returnFile: 'CB230700 LUCKY .RET',
  stratoReport: 'RET 23072026 LUCKY.pdf',
  company: 'LUCKY',
  bankCode: '237',
  receiptDate: '2026-07-22',
  creditDate: '2026-07-23',
  expectedMovements: 11,
  sourceEvidence: {
    sqlServerDatabase: 'STRATO',
    sqlServerExecutedAt: '2026-07-23 21:51:07.477',
    sqlServerFiles: ['resultado.csv', 'result2.csv', 'result3.csv', 'result4.csv', 'result5.csv'],
    simulationVersion: '0.5.8',
    simulationSha256: '7dab4f1fc14fba5033bdeed63878d11542c87dae8bc289a4915dc4a6be44c524',
  },
  targets: [
    {
      key: 'MARCIA-052-120',
      returnItemId: 88,
      returnLine: 2,
      boleto: '260000389786',
      nossoNumero: '26000038978',
      nossoNumeroDv: '6',
      controleParticipante: '101266',
      client: 'MARCIA BEATRIZ DE OLIVEIRA SANTOS',
      contract: 'STR-1203-B-4',
      documentReturn: 'P 052/120',
      parcel: {
        id: '16f548e5-74eb-445c-9b61-61e5e81b800e',
        stratoFraction: '052/120',
        current: {
          document: '1203 13/30',
          number: 13,
          total: 30,
          dueDate: '2026-06-10',
          nominalCents: 172742,
          status: 'atrasada',
        },
        proposed: {
          document: '1203 52/120',
          number: 52,
          total: 120,
          dueDate: '2026-06-10',
          nominalCents: 171593,
          discountCents: 0,
          interestCents: 5825,
          paidCents: 177418,
        },
      },
    },
    {
      key: 'BRIZA-018-027',
      returnItemId: 93,
      returnLine: 7,
      boleto: '260000392183',
      nossoNumero: '26000039218',
      nossoNumeroDv: '3',
      controleParticipante: null,
      client: 'BRIZA LUCCI MAUSE',
      contract: 'STR-1366-F-1',
      documentReturn: '18a27-ANT',
      parcels: [
        ['c55a7505-fb9e-48a6-a5ec-a61e40fa4ef0', '018/037', '1366 18/37', 18, 37, '2027-06-15', 22573, 184748],
        ['a168b160-bd17-4173-9cb5-49964f132615', '019/037', '1366 19/37', 19, 37, '2027-07-15', 22573, 184748],
        ['ba1c506c-e84a-45c8-a653-bb5e8fb4b707', '020/037', '1366 20/37', 20, 37, '2027-08-15', 22573, 184748],
        ['fa2803bd-d7c1-49ca-b0d2-d29e1911e112', '021/037', '1366 21/37', 21, 37, '2027-09-15', 22573, 184748],
        ['9a9bbe59-fef8-4fe9-b23c-bb8c12189c55', '022/037', '1366 22/37', 22, 37, '2027-10-15', 22573, 184748],
        ['621756b2-ebf6-4b72-bce6-b2253d27c20d', '023/037', '1366 23/37', 23, 37, '2027-11-15', 22573, 184748],
        ['5af98c97-93da-4b84-87cc-6d5916b6741e', '024/037', '1366 24/37', 24, 37, '2027-12-15', 22573, 184748],
        ['38be5f40-0b33-407b-befb-9fd3e620edad', '025/037', '1366 25/37', 25, 37, '2028-01-15', 22573, 184748],
        ['4c871fb8-2a0d-4820-b958-af70f4a122c8', '026/037', '1366 26/37', 26, 37, '2028-02-15', 22573, 184748],
        ['f2dd0d70-d794-4cfd-a6f9-aac8b671d945', '027/037', '1366 27/37', 27, 37, '2028-03-15', 22574, 184747],
      ].map(([id, fraction, document, number, total, dueDate, discountCents, paidCents]) => ({
        id,
        stratoFraction: fraction,
        current: {
          document,
          number,
          total,
          dueDate,
          nominalCents: 206125,
          status: 'aberta',
        },
        proposed: {
          document,
          number,
          total,
          dueDate,
          nominalCents: 207321,
          discountCents,
          interestCents: 0,
          paidCents,
        },
      })),
    },
  ],
})

function allParcelEntries() {
  const entries = []
  for (const target of PLAN.targets) {
    const parcels = target.parcels || [target.parcel]
    parcels.forEach((parcel, index) => entries.push({
      target,
      parcel,
      targetParcelIndex: index,
      storeBankIdentifier: target.key.startsWith('MARCIA') || index === 0,
    }))
  }
  return entries
}

function centsToNumber(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2))
}

function moneyBrFromCents(cents) {
  return centsToNumber(cents).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

module.exports = { PLAN, allParcelEntries, centsToNumber, moneyBrFromCents, stableHash }
