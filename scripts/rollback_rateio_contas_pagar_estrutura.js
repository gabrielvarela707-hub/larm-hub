/**
 * Remove somente a estrutura da ETAPA 1.
 *
 * SEGURANÇA: o rollback é recusado se existir qualquer grupo, item ou
 * lançamento vinculado a rateio. Não existe opção --force.
 *
 * Rodar: node scripts/rollback_rateio_contas_pagar_estrutura.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function rollback() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '60s'")

    const { rows: structure } = await client.query(`
      SELECT
        to_regclass('public.fin_cp_rateios') IS NOT NULL AS grupos_ok,
        to_regclass('public.fin_cp_rateio_itens') IS NOT NULL AS itens_ok,
        EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'fin_lancamentos_cp'
             AND column_name = 'rateio_id'
        ) AS coluna_ok
    `)

    let groups = 0
    let items = 0
    let linked = 0

    if (structure[0].grupos_ok) {
      groups = Number((await client.query('SELECT COUNT(*) AS total FROM fin_cp_rateios')).rows[0].total)
    }
    if (structure[0].itens_ok) {
      items = Number((await client.query('SELECT COUNT(*) AS total FROM fin_cp_rateio_itens')).rows[0].total)
    }
    if (structure[0].coluna_ok) {
      linked = Number((await client.query(
        'SELECT COUNT(*) AS total FROM fin_lancamentos_cp WHERE rateio_id IS NOT NULL',
      )).rows[0].total)
    }

    if (groups > 0 || items > 0 || linked > 0) {
      throw new Error(
        `Rollback recusado: grupos=${groups}, itens=${items}, lançamentos vinculados=${linked}. `
        + 'Restaure o backup ou remova os rateios pelo fluxo funcional antes de retirar a estrutura.',
      )
    }

    if (structure[0].itens_ok) {
      await client.query('DROP TABLE fin_cp_rateio_itens')
    }

    if (structure[0].coluna_ok) {
      await client.query(`
        ALTER TABLE fin_lancamentos_cp
          DROP CONSTRAINT IF EXISTS fk_fin_lancamentos_cp_rateio,
          DROP CONSTRAINT IF EXISTS uq_fin_lancamentos_cp_id_rateio
      `)
      await client.query('DROP INDEX IF EXISTS idx_fin_lancamentos_cp_rateio_id')
      await client.query('ALTER TABLE fin_lancamentos_cp DROP COLUMN rateio_id')
    }

    if (structure[0].grupos_ok) {
      await client.query('DROP TABLE fin_cp_rateios')
    }

    await client.query('COMMIT')
    logger.info('✅ Estrutura vazia da ETAPA 1 removida com segurança.')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    logger.error(`❌ Rollback não executado: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

rollback()
