/**
 * scripts/limpar_movimento_futuro_2026.js
 *
 * Remove do Movimento Bancário realizado os lançamentos futuros de 2026 que
 * foram importados por engano como movimento efetivo.
 *
 * Regra:
 * - mantém tudo até 28/06/2026;
 * - mantém lançamentos futuros que estejam vinculados a baixa de Contas a Pagar;
 * - mantém lançamentos futuros que estejam vinculados a Contas a Receber, se a tabela existir;
 * - remove somente movimentos futuros sem vínculo de baixa/recebimento.
 *
 * Uso seguro:
 *   npm run db:preview:movimento-futuro-2026
 *   npm run db:limpar:movimento-futuro-2026
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')

const CUTOFF = '2026-06-28'
const execute = process.argv.includes('--execute')

async function tableExists(tableName) {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  )
  return !!rows[0]?.exists
}

async function buildKeepLinkedSql(alias = 'fm') {
  const checks = []

  if (await tableExists('fin_parcelas_cp')) {
    checks.push(`EXISTS (SELECT 1 FROM fin_parcelas_cp p WHERE p.movimento_id = ${alias}.id)`)
  }

  if (await tableExists('fin_parcelas_cr')) {
    checks.push(`EXISTS (SELECT 1 FROM fin_parcelas_cr r WHERE r.movimento_id = ${alias}.id)`)
  }

  return checks.length ? `AND NOT (${checks.join(' OR ')})` : ''
}

async function main() {
  await connectDB()
  const linkedGuard = await buildKeepLinkedSql('fm')

  const alvoSql = `
    FROM fin_movimento fm
    WHERE fm.data > $1::date
      AND COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) = 2026
      ${linkedGuard}
  `

  const { rows: resumoRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(COALESCE(fm.entradas, 0)), 0)::float AS entradas,
       COALESCE(SUM(COALESCE(fm.saidas, 0)), 0)::float AS saidas,
       MIN(fm.data) AS primeira_data,
       MAX(fm.data) AS ultima_data
     ${alvoSql}`,
    [CUTOFF]
  )

  const resumo = resumoRows[0] || {}
  console.log('Prévia de limpeza do Movimento Bancário futuro 2026')
  console.log('Corte mantido até:', CUTOFF)
  console.log('Registros futuros sem baixa/recebimento:', resumo.total || 0)
  console.log('Entradas futuras indevidas:', Number(resumo.entradas || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
  console.log('Saídas futuras indevidas:', Number(resumo.saidas || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
  console.log('Período encontrado:', resumo.primeira_data || '-', 'até', resumo.ultima_data || '-')

  const { rows: exemplos } = await pool.query(
    `SELECT fm.id, fm.data, fm.empresa, fm.banco, fm.entradas, fm.saidas, fm.fornecedor, fm.historico
     ${alvoSql}
     ORDER BY fm.data ASC, fm.id ASC
     LIMIT 20`,
    [CUTOFF]
  )
  if (exemplos.length) {
    console.table(exemplos)
  }

  if (!execute) {
    console.log('\nModo prévia: nada foi apagado.')
    console.log('Para executar a limpeza: npm run db:limpar:movimento-futuro-2026')
    return
  }

  await pool.query('BEGIN')
  try {
    const { rows: deleted } = await pool.query(
      `WITH alvo AS (
         SELECT fm.id
         ${alvoSql}
       )
       DELETE FROM fin_movimento fm
       USING alvo
       WHERE fm.id = alvo.id
       RETURNING fm.id`,
      [CUTOFF]
    )

    await pool.query('COMMIT')
    console.log(`\nLimpeza concluída. Registros removidos: ${deleted.length}`)
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }
}

main()
  .catch(err => {
    console.error('Erro na limpeza:', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
