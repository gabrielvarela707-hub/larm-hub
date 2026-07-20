/**
 * v0.3.88 — Limpeza segura das duplicidades de 26, 29 e 30/06/2026.
 *
 * Correções desta versão:
 * - usa fin_movimento.data diretamente no PostgreSQL;
 * - não converte DATE para UTC no Node;
 * - não usa dia/mes/ano para determinar a data real;
 * - ignora movimentos de outras datas existentes no mesmo lote;
 * - valida quantidade por lote e por data;
 * - compara os dados financeiros antes de remover qualquer cópia;
 * - aceita movimentos oficiais legitimamente idênticos usando multiconjunto.
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

const RELEASE = '0.3.88'
const KEEP_LOT = 'MOV-2026-ATE-0107-20260702020021'
const DUPLICATE_LOTS = [
  'MOV-2026-20260629-30-0379',
  'MOV-2026-20260629-30-0383',
  'MOV-2026-20260626-30-0384',
  'MOV-2026-20260629-30-0385',
]
const TARGET_DATES = ['2026-06-26', '2026-06-29', '2026-06-30']
const TARGET_DATE_SET = new Set(TARGET_DATES)

const EXPECTED_BY_LOT = {
  [KEEP_LOT]: {
    total: 31,
    byDate: { '2026-06-26': 11, '2026-06-29': 13, '2026-06-30': 7 },
  },
  'MOV-2026-20260629-30-0379': {
    total: 20,
    byDate: { '2026-06-26': 0, '2026-06-29': 13, '2026-06-30': 7 },
  },
  'MOV-2026-20260629-30-0383': {
    total: 20,
    byDate: { '2026-06-26': 0, '2026-06-29': 13, '2026-06-30': 7 },
  },
  'MOV-2026-20260626-30-0384': {
    total: 31,
    byDate: { '2026-06-26': 11, '2026-06-29': 13, '2026-06-30': 7 },
  },
  'MOV-2026-20260629-30-0385': {
    total: 20,
    byDate: { '2026-06-26': 0, '2026-06-29': 13, '2026-06-30': 7 },
  },
}

function argValue(name) {
  const prefix = `--${name}=`
  const value = process.argv.find(item => item.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

function normalizedText(value) {
  if (value === null || value === undefined) return null
  return String(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

function normalizedNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(4) : String(value)
}

function logicalDate(row) {
  const value = row.data_logica
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Movimento ${row.id} retornou data inválida: ${String(value)}.`)
  }
  return value
}

function fingerprint(row) {
  return JSON.stringify({
    data: logicalDate(row),
    empresa: normalizedText(row.empresa),
    banco: normalizedText(row.banco),
    entradas: normalizedNumber(row.entradas),
    saidas: normalizedNumber(row.saidas),
    fornecedor: normalizedText(row.fornecedor),
    historico: normalizedText(row.historico),
    nf_doc: normalizedText(row.nf_doc),
    emissao_doc: row.emissao_doc_logica || null,
    conta_contabil: normalizedText(row.conta_contabil),
    centro_custo: normalizedText(row.centro_custo),
    obra: normalizedText(row.obra),
    natureza_financeira: normalizedText(row.natureza_financeira),
    n_cheque: normalizedText(row.n_cheque),
    tipo_lancamento: normalizedText(row.tipo_lancamento),
    vencimento: row.vencimento_logico || null,
  })
}

function compareOccurrence(a, b) {
  const lineA = Number.isFinite(Number(a.linha_origem))
    ? Number(a.linha_origem)
    : Number.MAX_SAFE_INTEGER
  const lineB = Number.isFinite(Number(b.linha_origem))
    ? Number(b.linha_origem)
    : Number.MAX_SAFE_INTEGER
  return lineA - lineB || Number(a.id) - Number(b.id)
}

function summarizeRows(rows) {
  const byDate = Object.fromEntries(TARGET_DATES.map(date => [date, 0]))
  let entries = 0
  let outflows = 0

  for (const row of rows) {
    const date = logicalDate(row)
    if (!TARGET_DATE_SET.has(date)) {
      throw new Error(
        `Falha interna: o movimento ${row.id} retornou fora das datas-alvo (${date}).`,
      )
    }
    byDate[date] += 1
    entries += Number(row.entradas || 0)
    outflows += Number(row.saidas || 0)
  }

  return { total: rows.length, byDate, entries, outflows }
}

function validateLot(lot, rows, allowRemoved = false) {
  if (allowRemoved && rows.length === 0) {
    return {
      total: 0,
      byDate: Object.fromEntries(TARGET_DATES.map(date => [date, 0])),
      entries: 0,
      outflows: 0,
      status: 'já removido',
    }
  }

  const expected = EXPECTED_BY_LOT[lot]
  if (!expected) throw new Error(`Não existe validação configurada para o lote ${lot}.`)

  const summary = summarizeRows(rows)
  if (summary.total !== expected.total) {
    throw new Error(
      `O lote ${lot} possui ${summary.total} movimento(s) nas datas-alvo; ` +
        `esperado ${expected.total}. Nada foi alterado.`,
    )
  }

  for (const date of TARGET_DATES) {
    if (summary.byDate[date] !== expected.byDate[date]) {
      throw new Error(
        `O lote ${lot} possui ${summary.byDate[date]} movimento(s) em ${date}; ` +
          `esperado ${expected.byDate[date]}. Nada foi alterado.`,
      )
    }
  }

  return { ...summary, status: lot === KEEP_LOT ? 'oficial' : 'duplicado validado' }
}

function buildBuckets(rows) {
  const buckets = new Map()
  for (const row of rows) {
    const key = fingerprint(row)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(row)
  }
  for (const bucket of buckets.values()) bucket.sort(compareOccurrence)
  return buckets
}

async function loadRows(client, lock = false) {
  const lots = [KEEP_LOT, ...DUPLICATE_LOTS]
  const { rows } = await client.query(
    `SELECT fm.*,
            fm.data::text AS data_logica,
            fm.emissao_doc::text AS emissao_doc_logica,
            fm.vencimento::text AS vencimento_logico
       FROM fin_movimento fm
      WHERE fm.lote_importacao=ANY($1::text[])
        AND fm.data=ANY($2::date[])
      ORDER BY fm.lote_importacao,
               fm.data,
               fm.linha_origem NULLS LAST,
               fm.id
      ${lock ? 'FOR UPDATE' : ''}`,
    [lots, TARGET_DATES],
  )

  const grouped = new Map(lots.map(lot => [lot, []]))
  for (const row of rows) grouped.get(row.lote_importacao).push(row)
  return grouped
}

async function loadIgnoredCounts(client) {
  const lots = [KEEP_LOT, ...DUPLICATE_LOTS]
  const { rows } = await client.query(
    `SELECT lote_importacao,
            COUNT(*) FILTER (WHERE NOT (data=ANY($2::date[])))::int AS fora_das_datas,
            COUNT(*)::int AS total_lote
       FROM fin_movimento
      WHERE lote_importacao=ANY($1::text[])
      GROUP BY lote_importacao
      ORDER BY lote_importacao`,
    [lots, TARGET_DATES],
  )
  return rows
}

function validateAndMap(grouped) {
  const officialRows = grouped.get(KEEP_LOT) || []
  const officialSummary = validateLot(KEEP_LOT, officialRows, false)
  const officialBuckets = buildBuckets(officialRows)

  const duplicateRows = []
  const mapping = new Map()
  const duplicateSummaries = []

  for (const lot of DUPLICATE_LOTS) {
    const rows = grouped.get(lot) || []
    const summary = validateLot(lot, rows, true)
    duplicateSummaries.push({ lot, ...summary })
    if (rows.length === 0) continue

    const duplicateBuckets = buildBuckets(rows)
    for (const [key, copies] of duplicateBuckets.entries()) {
      const originals = officialBuckets.get(key) || []
      if (originals.length === 0) {
        const row = copies[0]
        throw new Error(
          `O movimento ${row.id} do lote ${lot} não possui equivalente financeiro ` +
            `no lote oficial. Nada foi alterado.`,
        )
      }
      if (copies.length > originals.length) {
        throw new Error(
          `O lote ${lot} possui ${copies.length} ocorrência(s) de um movimento, ` +
            `mas o lote oficial possui apenas ${originals.length}. Nada foi alterado.`,
        )
      }

      copies.sort(compareOccurrence)
      originals.sort(compareOccurrence)
      for (let index = 0; index < copies.length; index += 1) {
        const duplicate = copies[index]
        const official = originals[index]
        mapping.set(Number(duplicate.id), Number(official.id))
        duplicateRows.push(duplicate)
      }
    }
  }

  duplicateRows.sort((a, b) => Number(a.id) - Number(b.id))
  return {
    officialRows,
    officialSummary,
    duplicateRows,
    duplicateSummaries,
    mapping,
  }
}

async function referencingForeignKeys(client) {
  const { rows } = await client.query(`
    SELECT ns.nspname AS schema_name,
           rel.relname AS table_name,
           att.attname AS column_name,
           con.conname AS constraint_name
      FROM pg_constraint con
      JOIN pg_class parent ON parent.oid=con.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid=parent.relnamespace
      JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_namespace ns ON ns.oid=rel.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY ck(attnum, ord) ON TRUE
      JOIN LATERAL unnest(con.confkey) WITH ORDINALITY pk(attnum, ord)
        ON pk.ord=ck.ord
      JOIN pg_attribute att
        ON att.attrelid=rel.oid AND att.attnum=ck.attnum
      JOIN pg_attribute parent_att
        ON parent_att.attrelid=parent.oid AND parent_att.attnum=pk.attnum
     WHERE con.contype='f'
       AND parent_ns.nspname='public'
       AND parent.relname='fin_movimento'
       AND parent_att.attname='id'
     ORDER BY ns.nspname, rel.relname, att.attname`)
  return rows
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

async function countReferences(client, foreignKeys, ids) {
  const result = []
  if (!ids.length) return result

  for (const fk of foreignKeys) {
    const { rows: [row] } = await client.query(
      `SELECT COUNT(*)::int AS total
         FROM ${quoteIdent(fk.schema_name)}.${quoteIdent(fk.table_name)}
        WHERE ${quoteIdent(fk.column_name)}=ANY($1::bigint[])`,
      [ids],
    )
    if (Number(row.total) > 0) result.push({ ...fk, total: Number(row.total) })
  }
  return result
}

async function redirectReferences(client, foreignKeys, mapping) {
  for (const fk of foreignKeys) {
    for (const [oldId, keepId] of mapping.entries()) {
      await client.query(
        `UPDATE ${quoteIdent(fk.schema_name)}.${quoteIdent(fk.table_name)}
            SET ${quoteIdent(fk.column_name)}=$1
          WHERE ${quoteIdent(fk.column_name)}=$2`,
        [keepId, oldId],
      )
    }
  }
}

function printState(validated, references, ignoredCounts) {
  console.log('\nMOVIMENTO BANCÁRIO — CORREÇÃO DE 26, 29 E 30/06/2026')
  console.log(`Versão do seed: ${RELEASE}`)
  console.log(`Lote oficial preservado: ${KEEP_LOT}`)
  console.log(
    `Oficial: ${validated.officialSummary.total} registros | ` +
      `26/06=${validated.officialSummary.byDate['2026-06-26']} | ` +
      `29/06=${validated.officialSummary.byDate['2026-06-29']} | ` +
      `30/06=${validated.officialSummary.byDate['2026-06-30']}`,
  )
  console.log(
    `Totais oficiais: entradas ${money(validated.officialSummary.entries)} | ` +
      `saídas ${money(validated.officialSummary.outflows)}`,
  )

  console.table(
    validated.duplicateSummaries.map(item => ({
      lote: item.lot,
      registros: item.total,
      dia_26: item.byDate['2026-06-26'],
      dia_29: item.byDate['2026-06-29'],
      dia_30: item.byDate['2026-06-30'],
      entradas: money(item.entries),
      saidas: money(item.outflows),
      status: item.status,
    })),
  )

  const ignored = ignoredCounts.filter(row => Number(row.fora_das_datas) > 0)
  if (ignored.length) {
    console.log('Movimentos de outras datas existentes nos mesmos lotes foram ignorados:')
    console.table(
      ignored.map(row => ({
        lote: row.lote_importacao,
        fora_das_datas: Number(row.fora_das_datas),
        total_lote: Number(row.total_lote),
      })),
    )
  }

  console.log(`Duplicidades validadas para remoção: ${validated.duplicateRows.length}`)
  if (references.length) {
    console.log('Referências que serão redirecionadas ao movimento oficial:')
    console.table(references)
  }
}

async function main() {
  await connectDB()
  const execute = process.argv.includes('--execute')
  const client = await pool.connect()

  try {
    const grouped = await loadRows(client, false)
    const validated = validateAndMap(grouped)
    const duplicateIds = validated.duplicateRows.map(row => Number(row.id))
    const foreignKeys = await referencingForeignKeys(client)
    const references = await countReferences(client, foreignKeys, duplicateIds)
    const ignoredCounts = await loadIgnoredCounts(client)
    printState(validated, references, ignoredCounts)

    if (!execute) {
      if (!duplicateIds.length) {
        console.log('\n✅ Não há duplicidades restantes.')
        console.log('✅ Os 31 movimentos oficiais estão preservados: 11/13/7.')
      } else {
        console.log('\n✅ Prévia concluída. Nada foi alterado.')
        console.log(
          `Para executar: node scripts/seed_corrigir_duplicidades_movimento_26_29_30.js ` +
            `--execute --confirmar=${duplicateIds.length}`,
        )
      }
      return
    }

    const confirmation = Number(argValue('confirmar'))
    if (confirmation !== duplicateIds.length) {
      throw new Error(`Confirmação inválida. Use --confirmar=${duplicateIds.length}.`)
    }
    if (!duplicateIds.length) throw new Error('Nenhuma duplicidade restante para remover.')

    await client.query('BEGIN')
    await client.query('LOCK TABLE fin_movimento IN SHARE ROW EXCLUSIVE MODE')

    const lockedGrouped = await loadRows(client, true)
    const locked = validateAndMap(lockedGrouped)
    const lockedIds = locked.duplicateRows.map(row => Number(row.id))

    if (
      lockedIds.length !== duplicateIds.length ||
      lockedIds.some((id, index) => id !== duplicateIds[index])
    ) {
      throw new Error(
        'Os movimentos mudaram depois da prévia. Execute novamente sem --execute.',
      )
    }

    const backupDir = path.join(__dirname, 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    const backupPath = path.join(
      backupDir,
      `duplicidades-movimento-26-29-30-antes-${stamp}.json.gz`,
    )

    fs.writeFileSync(
      backupPath,
      zlib.gzipSync(
        JSON.stringify(
          {
            release: RELEASE,
            generated_at: new Date().toISOString(),
            keep_lot: KEEP_LOT,
            target_dates: TARGET_DATES,
            duplicate_lots: DUPLICATE_LOTS,
            mapping: Object.fromEntries(locked.mapping),
            rows: locked.duplicateRows,
          },
          null,
          2,
        ),
      ),
    )

    await redirectReferences(client, foreignKeys, locked.mapping)

    const { rowCount } = await client.query(
      `DELETE FROM fin_movimento
        WHERE id=ANY($1::bigint[])
          AND lote_importacao=ANY($2::text[])
          AND data=ANY($3::date[])`,
      [lockedIds, DUPLICATE_LOTS, TARGET_DATES],
    )

    if (rowCount !== lockedIds.length) {
      throw new Error(
        `Foram removidos ${rowCount} registros; esperado ${lockedIds.length}.`,
      )
    }

    const finalGrouped = await loadRows(client, false)
    const finalValidated = validateAndMap(finalGrouped)
    if (finalValidated.duplicateRows.length !== 0) {
      throw new Error(
        `Ainda restaram ${finalValidated.duplicateRows.length} duplicidades.`,
      )
    }

    await client.query('COMMIT')
    console.log(`\n✅ Concluído: ${rowCount} duplicidade(s) removida(s).`)
    console.log(
      '✅ Permanecem exatamente 31 movimentos oficiais: ' +
        '11 em 26/06, 13 em 29/06 e 7 em 30/06.',
    )
    console.log(`Backup: ${backupPath}`)
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\nERRO: ${error.message}`)
  console.error('Nada foi alterado.')
  process.exit(1)
})
