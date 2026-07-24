/**
 * scripts/migrate_impostos_retidos_cp.js
 * Adiciona os campos de impostos retidos por parcela em Contas a Pagar.
 * Rodar: node scripts/migrate_impostos_retidos_cp.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
ALTER TABLE fin_parcelas_cp
  ADD COLUMN IF NOT EXISTS retencao_ipi NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_iss NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_icms NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_pis NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_cofins NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_csll NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_irrf NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_inss NUMERIC(18,4) DEFAULT 0;
`

async function migrate() {
  await connectDB()
  logger.info('Adicionando impostos retidos em fin_parcelas_cp...')
  try {
    await pool.query(SQL)
    logger.info('✅ Campos de impostos retidos adicionados/validados')
  } catch (err) {
    logger.error('❌ Erro:', err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
