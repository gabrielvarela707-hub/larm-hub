/**
 * v0.6.1 — Rollback estrutural protegido.
 *
 * Recusa remover a tabela quando já houver análises ou vínculos cadastrados.
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function rollback() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rows: [table] } = await client.query(`
      SELECT to_regclass('public.fin_retornos_cobranca_item_parcelas') AS name
    `)

    if (!table?.name) {
      logger.info('Tabela multiparcelas já não existe. Nenhuma ação necessária.')
      await client.query('ROLLBACK')
      return
    }

    const { rows: [count] } = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM fin_retornos_cobranca_item_parcelas
    `)

    if (count.total > 0) {
      throw new Error(
        `Rollback bloqueado: existem ${count.total} relacionamento(s) multiparcelas. ` +
        'Exporte e remova os dados de forma controlada antes de excluir a estrutura.'
      )
    }

    await client.query('DROP TABLE fin_retornos_cobranca_item_parcelas')
    await client.query('COMMIT')
    logger.info('✅ Estrutura multiparcelas removida. Nenhum dado financeiro foi alterado.')
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error(`Falha no rollback multiparcelas: ${error.message}`)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

rollback().catch(() => process.exit(1))
