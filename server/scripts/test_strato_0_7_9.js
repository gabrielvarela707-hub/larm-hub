#!/usr/bin/env node
'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const root = path.resolve(__dirname, '..')
const servicePath = path.join(root, 'src/services/stratoIntelligentApplyService.js')
const source = fs.readFileSync(servicePath, 'utf8')

const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === './bradescoReturnProcessor' && parent?.filename === servicePath) {
    return {
      inferReturnContext: async () => ({}),
      expectedParcelType: () => 'parcela',
      roundMoney: value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100,
      loadPersistedReturnResult: async () => ({}),
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const { decideReturnIdentifierPersistence } = require(servicePath)
Module._load = originalLoad

assert.strictEqual(typeof decideReturnIdentifierPersistence, 'function')
assert(source.includes('uq_com_parcelas_nosso_numero'))
assert(source.includes('pg_advisory_xact_lock'))
assert(source.includes('Boolean(identifierDecision.persist)'))
assert(!source.includes('Boolean(storeIdentifier),\n      returnItem?.nossoNumero || null'))

async function run() {
  let ownerParcelId = null
  const client = {
    async query(sql, params) {
      if (String(sql).includes('pg_advisory_xact_lock')) return { rows: [{}] }
      if (String(sql).includes('FROM com_parcelas')) {
        return { rows: ownerParcelId ? [{ id: ownerParcelId }] : [] }
      }
      throw new Error(`Consulta inesperada no teste: ${sql}`)
    },
  }

  const first = await decideReturnIdentifierPersistence(client, {
    tenantId: 1,
    parcelId: '4591c9f7-0369-44de-a5fb-a4430384345d',
    returnItem: { nossoNumero: '26000038974', nossoNumeroDv: '3' },
    requested: true,
  })
  assert.deepStrictEqual(first, {
    persist: true,
    nossoNumero: '26000038974',
    ownerParcelId: null,
  })

  ownerParcelId = '4591c9f7-0369-44de-a5fb-a4430384345d'
  const second = await decideReturnIdentifierPersistence(client, {
    tenantId: 1,
    parcelId: '7c5ad339-27c6-48b2-b9ac-3b502c278260',
    returnItem: { nossoNumero: '26000038974', nossoNumeroDv: '3' },
    requested: true,
  })
  assert.deepStrictEqual(second, {
    persist: false,
    nossoNumero: '26000038974',
    ownerParcelId,
  })

  const disabled = await decideReturnIdentifierPersistence(client, {
    tenantId: 1,
    parcelId: 'x',
    returnItem: { nossoNumero: '26000038974' },
    requested: false,
  })
  assert.strictEqual(disabled.persist, false)

  const pkg = require(path.join(root, 'package.json'))
  assert.strictEqual(pkg.version, '0.7.9')
  const releases = require(path.join(root, 'src/data/system_releases_seed.js')).SYSTEM_RELEASES
  assert.strictEqual(releases[0].version, '0.7.9')

  console.log('OK 0.7.9: o mesmo nosso número fica somente na parcela principal; as demais não violam o índice único.')
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
