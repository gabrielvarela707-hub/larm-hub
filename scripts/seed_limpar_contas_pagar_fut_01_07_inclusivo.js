/**
 * LARMHUB — limpeza validada dos lançamentos FUT-* em Contas a Pagar, incluindo 01/07/2026.
 *
 * Base de validação: dump lotemobile_prod gerado em 01/07/2026.
 * Data de corte fixa: 2026-07-01.
 *
 * O seed remove somente lançamentos importados do Excel de contas futuras que:
 * - possuem nf_doc e numero_documento iniciados por FUT-;
 * - possuem exatamente uma parcela;
 * - vencem em 01/07/2026 ou depois;
 * - permanecem pendentes e sem qualquer sinal de baixa/pagamento;
 * - não possuem vínculo nem documento correspondente no Movimento Bancário.
 *
 * Segurança:
 * - sem argumento, apenas mostra a prévia;
 * - para excluir, exige --execute --confirmar=987;
 * - antes da exclusão, exige exatamente 987 lançamentos, 987 parcelas e
 *   R$ 5.187.448,0469, conforme o banco enviado para análise;
 * - gera backup JSON dentro de scripts/backups/;
 * - executa em uma única conexão e transação PostgreSQL.
 *
 * Uso:
 *   node scripts/seed_limpar_contas_pagar_fut_01_07_inclusivo.js
 *   node scripts/seed_limpar_contas_pagar_fut_01_07_inclusivo.js --execute --confirmar=987
 */
require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { pool, connectDB } = require('../src/config/database')

const CUTOFF_DATE = '2026-07-01'
const EXPECTED_LANCAMENTOS = 987
const EXPECTED_PARCELAS = 987
const EXPECTED_TOTAL = '5187448.0469'
const EXPECTED_FIRST_DUE = '2026-07-01'
const EXPECTED_LAST_DUE = '2026-12-31'

const execute = process.argv.includes('--execute')
const confirmArg = process.argv.find(arg => arg.startsWith('--confirmar='))
const confirmedCount = confirmArg ? Number(confirmArg.split('=')[1]) : null

const TARGET_SQL = `
  SELECT l.id
    FROM fin_lancamentos_cp l
    JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
   WHERE UPPER(BTRIM(COALESCE(l.nf_doc, ''))) LIKE 'FUT-%'
     AND UPPER(BTRIM(COALESCE(p.numero_documento, ''))) LIKE 'FUT-%'
     AND COALESCE(l.obs, '') ILIKE 'Importado do Excel contas a pagar futuro 2026.%'
     AND COALESCE(l.qtd_parcelas, 1) = 1
     AND p.vencimento >= $1::date
     AND LOWER(BTRIM(COALESCE(l.status, 'pendente'))) = 'pendente'
     AND LOWER(BTRIM(COALESCE(p.status, 'pendente'))) = 'pendente'
     AND p.dt_pagamento IS NULL
     AND p.movimento_id IS NULL
     AND p.forma_pagamento IS NULL
     AND p.baixa_valor_final IS NULL
     AND p.motivo_baixa IS NULL
     AND NOT EXISTS (
       SELECT 1
         FROM fin_movimento m
        WHERE UPPER(BTRIM(COALESCE(m.nf_doc, '')))
            = UPPER(BTRIM(COALESCE(l.nf_doc, '')))
     )
   GROUP BY l.id
  HAVING COUNT(p.id) = 1
`

function formatBRL(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
     ) AS exists`,
    [tableName]
  )
  return Boolean(rows[0]?.exists)
}

async function columnExists(client, tableName, columnName) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
     ) AS exists`,
    [tableName, columnName]
  )
  return Boolean(rows[0]?.exists)
}

async function validateSchema(client) {
  const requiredTables = [
    'fin_lancamentos_cp',
    'fin_parcelas_cp',
    'fin_movimento',
  ]

  for (const table of requiredTables) {
    if (!(await tableExists(client, table))) {
      throw new Error(`Tabela obrigatória não encontrada: ${table}`)
    }
  }

  const requiredColumns = [
    ['fin_lancamentos_cp', 'nf_doc'],
    ['fin_lancamentos_cp', 'obs'],
    ['fin_lancamentos_cp', 'qtd_parcelas'],
    ['fin_lancamentos_cp', 'status'],
    ['fin_parcelas_cp', 'numero_documento'],
    ['fin_parcelas_cp', 'vencimento'],
    ['fin_parcelas_cp', 'status'],
    ['fin_parcelas_cp', 'dt_pagamento'],
    ['fin_parcelas_cp', 'movimento_id'],
    ['fin_parcelas_cp', 'forma_pagamento'],
    ['fin_parcelas_cp', 'baixa_valor_final'],
    ['fin_parcelas_cp', 'motivo_baixa'],
    ['fin_movimento', 'nf_doc'],
  ]

  for (const [table, column] of requiredColumns) {
    if (!(await columnExists(client, table, column))) {
      throw new Error(`Coluna obrigatória não encontrada: ${table}.${column}`)
    }
  }
}

async function fetchSummary(client) {
  const { rows } = await client.query(
    `WITH alvo AS (${TARGET_SQL})
     SELECT COUNT(DISTINCT l.id)::int AS total_lancamentos,
            COUNT(p.id)::int AS total_parcelas,
            COALESCE(SUM(l.valor_total), 0)::numeric(18,4)::text AS total_lancamentos_valor,
            COALESCE(SUM(COALESCE(p.valor_final, p.valor)), 0)::numeric(18,4)::text AS total_parcelas_valor,
            MIN(p.vencimento)::text AS primeiro_vencimento,
            MAX(p.vencimento)::text AS ultimo_vencimento
       FROM alvo a
       JOIN fin_lancamentos_cp l ON l.id = a.id
       JOIN fin_parcelas_cp p ON p.lancamento_id = l.id`,
    [CUTOFF_DATE]
  )
  return rows[0]
}

async function showPreview(client, summary) {
  console.log('\n=== PRÉVIA VALIDADA — CONTAS A PAGAR FUT-* DESDE 01/07/2026 ===')
  console.log(`Data de corte fixa: ${CUTOFF_DATE}`)
  console.log('Regra: remove vencimentos iguais ou posteriores à data de corte.')
  console.log(`Lançamentos encontrados: ${summary.total_lancamentos}`)
  console.log(`Parcelas encontradas: ${summary.total_parcelas}`)
  console.log(`Valor dos lançamentos: ${formatBRL(summary.total_lancamentos_valor)}`)
  console.log(`Valor das parcelas: ${formatBRL(summary.total_parcelas_valor)}`)
  console.log(`Período: ${summary.primeiro_vencimento || '-'} até ${summary.ultimo_vencimento || '-'}`)

  const { rows: byMonth } = await client.query(
    `WITH alvo AS (${TARGET_SQL})
     SELECT TO_CHAR(p.vencimento, 'YYYY-MM') AS mes,
            COUNT(*)::int AS registros,
            SUM(COALESCE(p.valor_final, p.valor))::numeric(18,4)::text AS valor
       FROM alvo a
       JOIN fin_parcelas_cp p ON p.lancamento_id = a.id
      GROUP BY TO_CHAR(p.vencimento, 'YYYY-MM')
      ORDER BY mes`,
    [CUTOFF_DATE]
  )

  console.log('\nResumo por mês:')
  console.table(
    byMonth.map(row => ({
      mês: row.mes,
      registros: row.registros,
      valor: formatBRL(row.valor),
    }))
  )

  const { rows: examples } = await client.query(
    `WITH alvo AS (${TARGET_SQL})
     SELECT l.id,
            l.empresa,
            COALESCE(f.razao_social, f.nome_fantasia, 'Fornecedor não identificado') AS fornecedor,
            l.nf_doc AS documento,
            l.historico,
            p.vencimento::text AS vencimento,
            COALESCE(p.valor_final, p.valor)::numeric(18,4)::text AS valor
       FROM alvo a
       JOIN fin_lancamentos_cp l ON l.id = a.id
       JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
       LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
      ORDER BY p.vencimento, l.id
      LIMIT 30`,
    [CUTOFF_DATE]
  )

  console.log('\nPrimeiros 30 registros elegíveis:')
  console.table(examples)
}

function assertExpectedSummary(summary) {
  const errors = []

  if (Number(summary.total_lancamentos) !== EXPECTED_LANCAMENTOS) {
    errors.push(`lançamentos: esperado ${EXPECTED_LANCAMENTOS}, encontrado ${summary.total_lancamentos}`)
  }
  if (Number(summary.total_parcelas) !== EXPECTED_PARCELAS) {
    errors.push(`parcelas: esperado ${EXPECTED_PARCELAS}, encontrado ${summary.total_parcelas}`)
  }
  if (String(summary.total_lancamentos_valor) !== EXPECTED_TOTAL) {
    errors.push(`valor dos lançamentos: esperado ${EXPECTED_TOTAL}, encontrado ${summary.total_lancamentos_valor}`)
  }
  if (String(summary.total_parcelas_valor) !== EXPECTED_TOTAL) {
    errors.push(`valor das parcelas: esperado ${EXPECTED_TOTAL}, encontrado ${summary.total_parcelas_valor}`)
  }
  if (summary.primeiro_vencimento !== EXPECTED_FIRST_DUE) {
    errors.push(`primeiro vencimento: esperado ${EXPECTED_FIRST_DUE}, encontrado ${summary.primeiro_vencimento}`)
  }
  if (summary.ultimo_vencimento !== EXPECTED_LAST_DUE) {
    errors.push(`último vencimento: esperado ${EXPECTED_LAST_DUE}, encontrado ${summary.ultimo_vencimento}`)
  }

  if (errors.length) {
    throw new Error(
      'A base atual diverge do banco analisado. Nenhum registro será apagado.\n- ' +
      errors.join('\n- ')
    )
  }
}

async function fetchTargetIds(client) {
  const { rows } = await client.query(
    `WITH alvo AS (${TARGET_SQL})
     SELECT id FROM alvo ORDER BY id`,
    [CUTOFF_DATE]
  )
  return rows.map(row => Number(row.id))
}

async function createBackup(client, ids) {
  const [{ rows: lancamentos }, { rows: parcelas }] = await Promise.all([
    client.query(
      `SELECT *
         FROM fin_lancamentos_cp
        WHERE id = ANY($1::int[])
        ORDER BY id`,
      [ids]
    ),
    client.query(
      `SELECT *
         FROM fin_parcelas_cp
        WHERE lancamento_id = ANY($1::int[])
        ORDER BY lancamento_id, numero, id`,
      [ids]
    ),
  ])

  let boletos = []
  if (await tableExists(client, 'fin_lancamentos_cp_boletos')) {
    const result = await client.query(
      `SELECT *
         FROM fin_lancamentos_cp_boletos
        WHERE lancamento_id = ANY($1::int[])
        ORDER BY lancamento_id, id`,
      [ids]
    )
    boletos = result.rows
  }

  const backupDir = path.join(__dirname, 'backups')
  fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(
    backupDir,
    `contas-pagar-fut-01-07-inclusivo-corte-${CUTOFF_DATE}-${timestamp}.json`
  )

  const payload = {
    generated_at: new Date().toISOString(),
    cutoff_date: CUTOFF_DATE,
    validated_against: {
      total_lancamentos: EXPECTED_LANCAMENTOS,
      total_parcelas: EXPECTED_PARCELAS,
      total: EXPECTED_TOTAL,
      first_due_date: EXPECTED_FIRST_DUE,
      last_due_date: EXPECTED_LAST_DUE,
    },
    rule: 'Somente importados FUT-* do Excel; uma parcela; vencimento em ou após 2026-07-01; pendente; sem baixa, pagamento ou movimento bancário.',
    lancamentos,
    parcelas,
    boletos,
  }

  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2), 'utf8')
  return backupPath
}

async function executeCleanup(client) {
  if (confirmedCount !== EXPECTED_LANCAMENTOS) {
    throw new Error(
      `Para executar, use --execute --confirmar=${EXPECTED_LANCAMENTOS}. Nenhum registro foi apagado.`
    )
  }

  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')

  try {
    const summary = await fetchSummary(client)
    assertExpectedSummary(summary)

    const ids = await fetchTargetIds(client)

    await client.query(
      `SELECT id
         FROM fin_lancamentos_cp
        WHERE id = ANY($1::int[])
        ORDER BY id
        FOR UPDATE`,
      [ids]
    )

    await client.query(
      `SELECT id
         FROM fin_parcelas_cp
        WHERE lancamento_id = ANY($1::int[])
        ORDER BY id
        FOR UPDATE`,
      [ids]
    )

    const summaryAfterLock = await fetchSummary(client)
    assertExpectedSummary(summaryAfterLock)

    const backupPath = await createBackup(client, ids)

    const { rows: deleted } = await client.query(
      `DELETE FROM fin_lancamentos_cp
        WHERE id = ANY($1::int[])
        RETURNING id, empresa, nf_doc, historico, valor_total`,
      [ids]
    )

    if (deleted.length !== EXPECTED_LANCAMENTOS) {
      throw new Error(
        `A exclusão retornou ${deleted.length} lançamentos; esperado ${EXPECTED_LANCAMENTOS}. Operação revertida.`
      )
    }

    const { rows: remaining } = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM fin_lancamentos_cp WHERE id = ANY($1::int[]))::int AS lancamentos,
         (SELECT COUNT(*) FROM fin_parcelas_cp WHERE lancamento_id = ANY($1::int[]))::int AS parcelas`,
      [ids]
    )

    if (remaining[0].lancamentos !== 0 || remaining[0].parcelas !== 0) {
      throw new Error('A verificação pós-exclusão encontrou registros remanescentes. Operação revertida.')
    }

    await client.query('COMMIT')

    console.log('\n=== LIMPEZA CONCLUÍDA ===')
    console.log(`Lançamentos removidos: ${deleted.length}`)
    console.log(`Parcelas removidas por CASCADE: ${EXPECTED_PARCELAS}`)
    console.log(`Valor removido: ${formatBRL(EXPECTED_TOTAL)}`)
    console.log(`Backup: ${backupPath}`)
    console.log('Nenhum registro do Movimento Bancário foi alterado.')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function main() {
  await connectDB()
  const client = await pool.connect()

  try {
    await validateSchema(client)
    const summary = await fetchSummary(client)
    await showPreview(client, summary)

    if (!execute) {
      console.log('\nModo prévia: nenhum registro foi apagado.')
      console.log(`Após conferir, execute com: --execute --confirmar=${EXPECTED_LANCAMENTOS}`)
      return
    }

    assertExpectedSummary(summary)
    await executeCleanup(client)
  } finally {
    client.release()
  }
}

main()
  .catch(error => {
    console.error('\nERRO:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
