/**
 * Confere a ETAPA 1 do rateio sem alterar o banco.
 * Rodar: node scripts/check_rateio_contas_pagar_estrutura.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const EXPECTED_CONSTRAINTS = [
  'ck_fin_cp_rateios_valor_total_positivo',
  'ck_fin_cp_rateios_status',
  'fk_fin_cp_rateios_fornecedor',
  'fk_fin_cp_rateios_tipo_documento',
  'fk_fin_lancamentos_cp_rateio',
  'uq_fin_lancamentos_cp_id_rateio',
  'ck_fin_cp_rateio_itens_ordem_positiva',
  'ck_fin_cp_rateio_itens_percentual',
  'ck_fin_cp_rateio_itens_valor_positivo',
  'fk_fin_cp_rateio_itens_lancamento_rateio',
]

const EXPECTED_INDEXES = [
  'idx_fin_lancamentos_cp_rateio_id',
  'idx_fin_cp_rateios_documento',
  'uq_fin_cp_rateio_itens_lancamento',
  'uq_fin_cp_rateio_itens_ordem',
  'idx_fin_cp_rateio_itens_rateio',
]

async function check() {
  await connectDB()
  const client = await pool.connect()

  try {
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
             AND data_type = 'bigint'
        ) AS coluna_ok
    `)

    const { rows: constraints } = await client.query(
      `SELECT conname
         FROM pg_constraint
        WHERE conname = ANY($1::text[])
        ORDER BY conname`,
      [EXPECTED_CONSTRAINTS],
    )

    const { rows: indexes } = await client.query(
      `SELECT indexname
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = ANY($1::text[])
        ORDER BY indexname`,
      [EXPECTED_INDEXES],
    )

    let linked = null
    let groups = null
    let items = null

    if (structure[0].coluna_ok) {
      const result = await client.query(`
        SELECT COUNT(*)::INTEGER AS total
          FROM fin_lancamentos_cp
         WHERE rateio_id IS NOT NULL
      `)
      linked = result.rows[0].total
    }

    if (structure[0].grupos_ok) {
      const result = await client.query('SELECT COUNT(*)::INTEGER AS total FROM fin_cp_rateios')
      groups = result.rows[0].total
    }

    if (structure[0].itens_ok) {
      const result = await client.query('SELECT COUNT(*)::INTEGER AS total FROM fin_cp_rateio_itens')
      items = result.rows[0].total
    }

    const missingConstraints = EXPECTED_CONSTRAINTS.filter(
      (name) => !constraints.some((row) => row.conname === name),
    )
    const missingIndexes = EXPECTED_INDEXES.filter(
      (name) => !indexes.some((row) => row.indexname === name),
    )

    logger.info(`Tabela fin_cp_rateios: ${structure[0].grupos_ok ? 'OK' : 'FALTA'}`)
    logger.info(`Tabela fin_cp_rateio_itens: ${structure[0].itens_ok ? 'OK' : 'FALTA'}`)
    logger.info(`Coluna fin_lancamentos_cp.rateio_id BIGINT: ${structure[0].coluna_ok ? 'OK' : 'FALTA'}`)
    logger.info(`Constraints: ${constraints.length}/${EXPECTED_CONSTRAINTS.length}`)
    logger.info(`Índices: ${indexes.length}/${EXPECTED_INDEXES.length}`)
    logger.info(`Grupos cadastrados: ${groups ?? 'indisponível'}`)
    logger.info(`Itens cadastrados: ${items ?? 'indisponível'}`)
    logger.info(`Lançamentos antigos vinculados: ${linked ?? 'indisponível'}`)

    const failed = !structure[0].grupos_ok
      || !structure[0].itens_ok
      || !structure[0].coluna_ok
      || missingConstraints.length > 0
      || missingIndexes.length > 0

    if (failed) {
      if (missingConstraints.length > 0) {
        logger.error(`Constraints ausentes: ${missingConstraints.join(', ')}`)
      }
      if (missingIndexes.length > 0) {
        logger.error(`Índices ausentes: ${missingIndexes.join(', ')}`)
      }
      process.exitCode = 1
      return
    }

    logger.info('✅ Estrutura da ETAPA 1 conferida com sucesso; nenhuma alteração foi feita.')
  } catch (err) {
    logger.error(`❌ Erro na conferência: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

check()
