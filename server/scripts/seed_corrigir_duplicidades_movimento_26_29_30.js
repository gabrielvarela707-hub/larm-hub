/**
 * v0.3.86 — Remove somente os lotes incrementais duplicados de 26, 29 e 30/06/2026.
 *
 * Mantém como fonte oficial o lote:
 *   MOV-2026-ATE-0107-20260702020021
 *
 * Prévia:
 *   node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js
 *
 * Execução:
 *   node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js --execute --confirmar=N
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { pool, connectDB } = require('../src/config/database')

const RELEASE = '0.3.86'
const KEEP_LOT = 'MOV-2026-ATE-0107-20260702020021'
const DUPLICATE_LOTS = [
  'MOV-2026-20260629-30-0379',
  'MOV-2026-20260629-30-0383',
  'MOV-2026-20260626-30-0384',
  'MOV-2026-20260629-30-0385',
]
const EXPECTED_COUNTS = {
  'MOV-2026-20260629-30-0379': 20,
  'MOV-2026-20260629-30-0383': 20,
  'MOV-2026-20260626-30-0384': 31,
  'MOV-2026-20260629-30-0385': 20,
}
const EXPECTED_KEEP = { total: 31, dia26: 11, dia29: 13, dia30: 7 }

function arg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find(item => item.startsWith(prefix))
  return found ? found.slice(prefix.length) : undefined
}
function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4,
  })
}
async function tableColumnExists(client, tableName, columnName) {
  const { rows } = await client.query(`
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     LIMIT 1`, [tableName, columnName])
  return rows.length > 0
}
async function countReferences(client, ids) {
  const checks = [
    ['com_parcelas', 'movimento_id'],
    ['fin_bancos_lancamentos', 'movimento_id'],
    ['fin_parcelas_cp', 'movimento_id'],
  ]
  const result = []
  if (!ids.length) return result
  for (const [table, column] of checks) {
    if (!(await tableColumnExists(client, table, column))) continue
    const { rows: [row] } = await client.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column}=ANY($1::bigint[])`,
      [ids],
    )
    result.push({ table, column, count: Number(row.count) })
  }
  return result
}
async function loadState(client) {
  const { rows: keep } = await client.query(`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE data=DATE '2026-06-26')::int AS dia26,
           COUNT(*) FILTER (WHERE data=DATE '2026-06-29')::int AS dia29,
           COUNT(*) FILTER (WHERE data=DATE '2026-06-30')::int AS dia30,
           COALESCE(SUM(entradas),0)::numeric AS entradas,
           COALESCE(SUM(saidas),0)::numeric AS saidas
      FROM fin_movimento
     WHERE lote_importacao=$1
       AND data BETWEEN DATE '2026-06-26' AND DATE '2026-06-30'`, [KEEP_LOT])

  const { rows: duplicateSummary } = await client.query(`
    SELECT lote_importacao,
           COUNT(*)::int AS registros,
           COUNT(*) FILTER (WHERE data=DATE '2026-06-26')::int AS dia26,
           COUNT(*) FILTER (WHERE data=DATE '2026-06-29')::int AS dia29,
           COUNT(*) FILTER (WHERE data=DATE '2026-06-30')::int AS dia30,
           COALESCE(SUM(entradas),0)::numeric AS entradas,
           COALESCE(SUM(saidas),0)::numeric AS saidas
      FROM fin_movimento
     WHERE lote_importacao=ANY($1::text[])
       AND data BETWEEN DATE '2026-06-26' AND DATE '2026-06-30'
     GROUP BY lote_importacao
     ORDER BY lote_importacao`, [DUPLICATE_LOTS])

  const { rows: duplicateRows } = await client.query(`
    SELECT *
      FROM fin_movimento
     WHERE lote_importacao=ANY($1::text[])
       AND data BETWEEN DATE '2026-06-26' AND DATE '2026-06-30'
     ORDER BY lote_importacao, data, id`, [DUPLICATE_LOTS])

  return { keep, duplicateSummary, duplicateRows }
}
function validateState(state) {
  const keep = state.keep
  if (Number(keep.total) !== EXPECTED_KEEP.total ||
      Number(keep.dia26) !== EXPECTED_KEEP.dia26 ||
      Number(keep.dia29) !== EXPECTED_KEEP.dia29 ||
      Number(keep.dia30) !== EXPECTED_KEEP.dia30) {
    throw new Error(
      `O lote oficial está diferente do validado. Esperado 31 (11/13/7); encontrado ${keep.total} (${keep.dia26}/${keep.dia29}/${keep.dia30}). Nada será apagado.`
    )
  }
  for (const row of state.duplicateSummary) {
    const expected = EXPECTED_COUNTS[row.lote_importacao]
    if (!expected || Number(row.registros) !== expected) {
      throw new Error(
        `O lote ${row.lote_importacao} possui ${row.registros} registros; esperado ${expected || 0}. Nada será apagado.`
      )
    }
  }
}

async function main() {
  await connectDB()
  const execute = process.argv.includes('--execute')
  const client = await pool.connect()
  try {
    const state = await loadState(client)
    validateState(state)
    const duplicateIds = state.duplicateRows.map(row => Number(row.id))
    const references = await countReferences(client, duplicateIds)
    const referenced = references.reduce((sum, row) => sum + row.count, 0)

    console.log('\nMOVIMENTO BANCÁRIO — CORREÇÃO DE DUPLICIDADES DE 26, 29 E 30/06/2026')
    console.log(`Lote oficial preservado: ${KEEP_LOT}`)
    console.log(`Oficial: ${state.keep.total} registros | 26/06=${state.keep.dia26} | 29/06=${state.keep.dia29} | 30/06=${state.keep.dia30}`)
    console.log(`Totais oficiais: entradas ${money(state.keep.entradas)} | saídas ${money(state.keep.saidas)}`)
    console.table(state.duplicateSummary.map(row => ({
      lote: row.lote_importacao,
      registros: Number(row.registros),
      dia_26: Number(row.dia26),
      dia_29: Number(row.dia29),
      dia_30: Number(row.dia30),
      entradas: money(row.entradas),
      saidas: money(row.saidas),
    })))
    console.log(`Registros duplicados elegíveis para remoção: ${duplicateIds.length}`)
    console.table(references)

    if (referenced > 0) {
      throw new Error(`Foram encontradas ${referenced} referência(s) aos registros duplicados. Nada será apagado.`)
    }
    if (!execute) {
      console.log(`\nModo prévia: nada foi alterado. Para executar: --execute --confirmar=${duplicateIds.length}`)
      return
    }

    const confirmation = Number(arg('confirmar'))
    if (confirmation !== duplicateIds.length) {
      throw new Error(`Confirmação inválida. Use --confirmar=${duplicateIds.length}.`)
    }
    if (!duplicateIds.length) throw new Error('Nenhuma duplicidade elegível encontrada.')

    await client.query('BEGIN')
    await client.query('LOCK TABLE fin_movimento IN SHARE ROW EXCLUSIVE MODE')
    const locked = await loadState(client)
    validateState(locked)
    const lockedIds = locked.duplicateRows.map(row => Number(row.id))
    if (lockedIds.length !== duplicateIds.length || lockedIds.some((id, index) => id !== duplicateIds[index])) {
      throw new Error('Os registros mudaram entre a prévia e o bloqueio. Execute a prévia novamente.')
    }
    const lockedReferences = await countReferences(client, lockedIds)
    if (lockedReferences.reduce((sum, row) => sum + row.count, 0) > 0) {
      throw new Error('Uma referência foi criada após a prévia. Nada será apagado.')
    }

    const backupDir = path.join(__dirname, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const backupPath = path.join(backupDir, `duplicidades-movimento-26-29-30-antes-${stamp}.json.gz`)
    const backup = {
      release: RELEASE,
      generated_at: new Date().toISOString(),
      keep_lot: KEEP_LOT,
      duplicate_lots: DUPLICATE_LOTS,
      rows: locked.duplicateRows,
    }
    fs.writeFileSync(backupPath, zlib.gzipSync(JSON.stringify(backup, null, 2)))

    const { rowCount } = await client.query(`
      DELETE FROM fin_movimento
       WHERE id=ANY($1::bigint[])
         AND lote_importacao=ANY($2::text[])
         AND data BETWEEN DATE '2026-06-26' AND DATE '2026-06-30'`,
      [lockedIds, DUPLICATE_LOTS],
    )
    if (rowCount !== lockedIds.length) {
      throw new Error(`A exclusão removeu ${rowCount}, mas eram esperados ${lockedIds.length}.`)
    }

    const finalState = await loadState(client)
    validateState(finalState)
    if (finalState.duplicateRows.length !== 0) {
      throw new Error(`Ainda restaram ${finalState.duplicateRows.length} registros dos lotes duplicados.`)
    }

    await client.query('COMMIT')
    console.log(`\nConcluído: ${rowCount} duplicidade(s) removida(s).`)
    console.log(`Permanecem 31 registros oficiais: 11 em 26/06, 13 em 29/06 e 7 em 30/06.`)
    console.log(`Backup: ${backupPath}`)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch {}
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\nERRO: ${error.message}`)
  process.exit(1)
})
