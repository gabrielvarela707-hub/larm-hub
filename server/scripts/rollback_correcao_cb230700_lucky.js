#!/usr/bin/env node
'use strict'

require('dotenv').config()

const fs = require('fs')
const { pool, connectDB } = require('../src/config/database')
const { PLAN, allParcelEntries, stableHash } = require('./cb230700_lucky_plan')

const EXECUTE = process.argv.includes('--execute')
const args = new Map(
  process.argv.slice(2)
    .filter(arg => arg.startsWith('--') && arg.includes('='))
    .map(arg => {
      const [key, ...rest] = arg.slice(2).split('=')
      return [key, rest.join('=')]
    }),
)
const CONFIRMAR = args.has('confirmar') ? Number(args.get('confirmar')) : null
const BACKUP_PATH = args.get('backup') || null

function cents(value) { return Math.round(Number(value || 0) * 100) }
function dateOnly(value) { return value == null ? null : String(value).slice(0, 10) }

function readBackup() {
  if (!BACKUP_PATH) throw new Error('Informe o backup: --backup=/caminho/arquivo-antes.json')
  if (!fs.existsSync(BACKUP_PATH)) throw new Error(`Backup não encontrado: ${BACKUP_PATH}`)
  const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'))
  if (backup.schema !== 'larmhub-cb230700-lucky-backup-v1') throw new Error('Formato de backup inválido.')
  if (backup.batch !== PLAN.batch) throw new Error(`Lote do backup diverge: ${backup.batch}.`)
  if (backup.planHash !== stableHash(PLAN)) throw new Error('Plano do backup diverge do pacote 0.5.9.')
  if (!Array.isArray(backup.parcels) || backup.parcels.length !== PLAN.expectedMovements) throw new Error('Backup não contém as 11 parcelas originais.')
  if (!Array.isArray(backup.returnItems) || backup.returnItems.length !== PLAN.targets.length) throw new Error('Backup não contém os itens originais do retorno.')
  return backup
}

function proposedMatches(row, entry, movementIds) {
  const p = entry.parcel.proposed
  return String(row.documento_legado || '').trim() === p.document &&
    Number(row.parcela_numero_legado) === p.number &&
    Number(row.parcela_total_legado) === p.total &&
    dateOnly(row.vencimento) === p.dueDate &&
    cents(row.valor_nominal) === p.nominalCents &&
    cents(row.valor_desconto) === p.discountCents &&
    cents(row.valor_juros_mora) === p.interestCents &&
    cents(row.valor_pago) === p.paidCents &&
    dateOnly(row.pago_em) === PLAN.receiptDate &&
    String(row.status || '').toLowerCase() === 'paga' &&
    movementIds.has(String(row.movimento_id)) &&
    String(row.origem_baixa || '') === 'retorno_bradesco'
}

async function restoreParcel(client, original) {
  const { rowCount } = await client.query(
    `UPDATE com_parcelas
        SET documento_legado=$1,
            parcela_numero_legado=$2,
            parcela_total_legado=$3,
            valor_nominal=$4,
            valor_convertido=$5,
            valor_total_relatorio=$6,
            valor_juros_mora=$7,
            valor_desconto=$8,
            valor_recalculado=$9,
            status=$10,
            pago_em=$11,
            valor_pago=$12,
            forma_pagamento=$13,
            observacoes_baixa=$14,
            movimento_id=$15,
            origem_baixa=$16,
            conciliado_em=$17,
            conciliacao_dados=$18::jsonb,
            dados_adicionais=$19::jsonb,
            nosso_numero=$20,
            nosso_numero_dv=$21,
            controle_participante=$22,
            boleto_status=$23,
            updated_at=COALESCE($24::timestamp, NOW())
      WHERE id=$25::uuid AND tenant_id=$26::uuid`,
    [
      original.documento_legado,
      original.parcela_numero_legado,
      original.parcela_total_legado,
      original.valor_nominal,
      original.valor_convertido,
      original.valor_total_relatorio,
      original.valor_juros_mora,
      original.valor_desconto,
      original.valor_recalculado,
      original.status,
      original.pago_em,
      original.valor_pago,
      original.forma_pagamento,
      original.observacoes_baixa,
      original.movimento_id,
      original.origem_baixa,
      original.conciliado_em,
      JSON.stringify(original.conciliacao_dados || {}),
      JSON.stringify(original.dados_adicionais || {}),
      original.nosso_numero,
      original.nosso_numero_dv,
      original.controle_participante,
      original.boleto_status,
      original.updated_at,
      original.id,
      original.tenant_id,
    ],
  )
  if (rowCount !== 1) throw new Error(`Não foi possível restaurar a parcela ${original.id}.`)
}

async function restoreReturnItem(client, original) {
  const { rowCount } = await client.query(
    `UPDATE fin_retornos_cobranca_itens
        SET parcela_id=$1,
            nosso_numero=$2,
            nosso_numero_dv=$3,
            controle_participante=$4,
            valor_juros=$5,
            valor_desconto=$6,
            status_processamento=$7,
            dados=$8::jsonb,
            movimento_id=$9,
            metodo_conciliacao=$10,
            divergencia_valor=$11
      WHERE id=$12 AND retorno_id=$13::uuid AND tenant_id=$14::uuid`,
    [
      original.parcela_id,
      original.nosso_numero,
      original.nosso_numero_dv,
      original.controle_participante,
      original.valor_juros,
      original.valor_desconto,
      original.status_processamento,
      JSON.stringify(original.dados || {}),
      original.movimento_id,
      original.metodo_conciliacao,
      original.divergencia_valor,
      original.id,
      original.retorno_id,
      original.tenant_id,
    ],
  )
  if (rowCount !== 1) throw new Error(`Não foi possível restaurar o item ${original.id} do retorno.`)
}

async function restoreReturn(client, original) {
  const { rowCount } = await client.query(
    `UPDATE fin_retornos_cobranca
        SET quantidade_registros=$1,
            quantidade_conciliada=$2,
            quantidade_nao_localizada=$3,
            valor_liquidado=$4,
            dados=$5::jsonb
      WHERE id=$6::uuid AND tenant_id=$7::uuid`,
    [
      original.quantidade_registros,
      original.quantidade_conciliada,
      original.quantidade_nao_localizada,
      original.valor_liquidado,
      JSON.stringify(original.dados || {}),
      original.id,
      original.tenant_id,
    ],
  )
  if (rowCount !== 1) throw new Error('Não foi possível restaurar o resumo do retorno.')
}

async function main() {
  const backup = readBackup()
  await connectDB()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: movements } = await client.query(
      `SELECT id, to_char(data::date,'YYYY-MM-DD') AS data, entradas, saidas, lote_importacao
         FROM fin_movimento
        WHERE lote_importacao=$1
        ORDER BY id
        FOR UPDATE`,
      [PLAN.batch],
    )
    const movementIds = new Set(movements.map(row => String(row.id)))

    const parcelIds = allParcelEntries().map(entry => entry.parcel.id)
    const { rows: currentParcels } = await client.query(
      `SELECT id, documento_legado, parcela_numero_legado, parcela_total_legado,
              to_char(vencimento::date,'YYYY-MM-DD') AS vencimento, valor_nominal, valor_desconto, valor_juros_mora,
              valor_pago, to_char(pago_em::date,'YYYY-MM-DD') AS pago_em, status, movimento_id, origem_baixa
         FROM com_parcelas
        WHERE tenant_id=$1::uuid AND id=ANY($2::uuid[])
        ORDER BY id
        FOR UPDATE`,
      [PLAN.tenantId, parcelIds],
    )

    const originalById = new Map(backup.parcels.map(row => [String(row.id), row]))
    const currentById = new Map(currentParcels.map(row => [String(row.id), row]))
    const alreadyOriginal = currentParcels.every(row => {
      const original = originalById.get(String(row.id))
      return original &&
        String(row.documento_legado || '') === String(original.documento_legado || '') &&
        Number(row.parcela_numero_legado) === Number(original.parcela_numero_legado) &&
        Number(row.parcela_total_legado) === Number(original.parcela_total_legado) &&
        cents(row.valor_nominal) === cents(original.valor_nominal) &&
        row.movimento_id == null
    }) && movements.length === 0

    if (alreadyOriginal) {
      await client.query('ROLLBACK')
      console.log('O lote já está revertido. Nenhum dado foi alterado.')
      return
    }

    const errors = []
    for (const entry of allParcelEntries()) {
      const row = currentById.get(entry.parcel.id)
      if (!row || !proposedMatches(row, entry, movementIds)) errors.push(entry.parcel.stratoFraction)
    }
    if (movements.length !== PLAN.expectedMovements) errors.push(`movimentos=${movements.length}`)
    if (errors.length) throw new Error(`Estado atual diverge da execução 0.5.9 (${errors.join(', ')}). Rollback recusado para não sobrescrever alterações posteriores.`)

    console.log('ROLLBACK CB230700 LUCKY — 0.5.9')
    console.log(`Modo: ${EXECUTE ? 'EXECUÇÃO' : 'PRÉVIA'}`)
    console.log(`Backup: ${BACKUP_PATH}`)
    console.log(`Parcelas a restaurar: ${backup.parcels.length}`)
    console.log(`Movimentos a excluir: ${movements.length}`)
    console.log(`Itens de retorno a restaurar: ${backup.returnItems.length}`)

    if (!EXECUTE) {
      await client.query('ROLLBACK')
      console.log('Prévia concluída. Nenhum dado foi alterado.')
      console.log(`Para executar: npm run db:rollback:cb230700-lucky -- --backup="${BACKUP_PATH}" --execute --confirmar=${PLAN.expectedMovements}`)
      return
    }
    if (CONFIRMAR !== PLAN.expectedMovements) throw new Error(`Confirmação inválida. Use --confirmar=${PLAN.expectedMovements}.`)

    for (const original of backup.returnItems) await restoreReturnItem(client, original)
    for (const original of backup.parcels) await restoreParcel(client, original)
    await restoreReturn(client, backup.returnRow)

    const { rowCount: deleted } = await client.query(
      `DELETE FROM fin_movimento
        WHERE lote_importacao=$1 AND id=ANY($2::bigint[])`,
      [PLAN.batch, movements.map(row => row.id)],
    )
    if (deleted !== PLAN.expectedMovements) throw new Error(`Quantidade de movimentos excluídos diverge: ${deleted}/${PLAN.expectedMovements}.`)

    await client.query('COMMIT')
    console.log('Rollback concluído com sucesso.')
    console.log(`Parcelas restauradas: ${backup.parcels.length}`)
    console.log(`Movimentos excluídos: ${deleted}`)
    console.log('O retorno voltou ao estado anterior à aplicação 0.5.9.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`\nERRO: ${error.message}`)
    console.error('Nada foi alterado.')
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\nERRO: ${error.message}`)
  process.exitCode = 1
})
