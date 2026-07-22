/**
 * Ajusta a data de movimentos vinculados a com_parcelas para a data efetiva
 * da baixa (pago_em), sem criar ou duplicar movimentos.
 *
 * Segurança:
 * - prévia por padrão;
 * - só altera movimentos cujas parcelas vinculadas possuem uma única data de baixa;
 * - ignora vínculos com datas conflitantes;
 * - execute apenas com --execute --confirmar=N, usando N exibido na prévia.
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')

const execute = process.argv.includes('--execute')
const confirmArg = process.argv.find(arg => arg.startsWith('--confirmar='))
const expectedCount = confirmArg ? Number(confirmArg.split('=')[1]) : null

const CANDIDATES_SQL = `
  WITH vinculados AS (
    SELECT
      p.movimento_id,
      MIN(p.pago_em::date) AS data_baixa_min,
      MAX(p.pago_em::date) AS data_baixa_max,
      COUNT(*)::int AS parcelas_vinculadas
    FROM com_parcelas p
    WHERE p.movimento_id IS NOT NULL
      AND p.pago_em IS NOT NULL
      AND LOWER(TRIM(COALESCE(p.status, ''))) IN
          ('pago', 'paga', 'quitado', 'quitada', 'recebido', 'recebida', 'q')
    GROUP BY p.movimento_id
  )
  SELECT
    fm.id AS movimento_id,
    fm.data AS data_atual,
    v.data_baixa_min AS data_baixa,
    fm.empresa,
    fm.entradas,
    fm.historico,
    v.parcelas_vinculadas
  FROM vinculados v
  JOIN fin_movimento fm ON fm.id = v.movimento_id
  WHERE v.data_baixa_min = v.data_baixa_max
    AND fm.data IS DISTINCT FROM v.data_baixa_min
  ORDER BY v.data_baixa_min, fm.id
`

async function main() {
  await connectDB()

  const { rows } = await pool.query(CANDIDATES_SQL)
  console.log('=== REPARO DE DATAS — MOVIMENTO BANCÁRIO / CONTAS A RECEBER ===')
  console.log(`Candidatos seguros: ${rows.length}`)

  if (rows.length) {
    console.table(rows.map(row => ({
      movimento_id: row.movimento_id,
      data_atual: row.data_atual,
      data_baixa: row.data_baixa,
      empresa: row.empresa,
      entradas: Number(row.entradas || 0).toFixed(2),
      parcelas: row.parcelas_vinculadas,
      historico: String(row.historico || '').slice(0, 80),
    })))
  }

  if (!execute) {
    console.log('\nPrévia concluída. Nenhum registro foi alterado.')
    if (rows.length) {
      console.log(`Para executar: npm run db:repair:movimento-recebiveis-data -- --execute --confirmar=${rows.length}`)
    }
    return
  }

  if (!Number.isInteger(expectedCount) || expectedCount !== rows.length) {
    throw new Error(`Confirmação inválida. Esperado --confirmar=${rows.length}.`)
  }

  if (!rows.length) {
    console.log('Nenhum ajuste necessário.')
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ids = rows.map(row => row.movimento_id)
    const { rowCount } = await client.query(`
      WITH vinculados AS (
        SELECT
          p.movimento_id,
          MIN(p.pago_em::date) AS data_baixa_min,
          MAX(p.pago_em::date) AS data_baixa_max
        FROM com_parcelas p
        WHERE p.movimento_id = ANY($1::bigint[])
          AND p.pago_em IS NOT NULL
          AND LOWER(TRIM(COALESCE(p.status, ''))) IN
              ('pago', 'paga', 'quitado', 'quitada', 'recebido', 'recebida', 'q')
        GROUP BY p.movimento_id
      )
      UPDATE fin_movimento fm
         SET data = v.data_baixa_min,
             dia = EXTRACT(DAY FROM v.data_baixa_min)::int,
             mes = EXTRACT(MONTH FROM v.data_baixa_min)::int,
             ano = EXTRACT(YEAR FROM v.data_baixa_min)::int
        FROM vinculados v
       WHERE fm.id = v.movimento_id
         AND v.data_baixa_min = v.data_baixa_max
         AND fm.data IS DISTINCT FROM v.data_baixa_min
    `, [ids])

    if (rowCount !== rows.length) {
      throw new Error(`Quantidade alterada (${rowCount}) diferente da prévia (${rows.length}).`)
    }

    await client.query('COMMIT')
    console.log(`Reparo concluído: ${rowCount} movimento(s) ajustado(s).`)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

main()
  .catch(error => {
    console.error('Erro:', error.message)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
