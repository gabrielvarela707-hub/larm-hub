/**
 * scripts/migrate_baixa_contas_pagar.js
 * Adiciona campos de baixa nas parcelas de Contas a Pagar.
 * Rodar: node scripts/migrate_baixa_contas_pagar.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
ALTER TABLE fin_parcelas_cp
  ADD COLUMN IF NOT EXISTS motivo_baixa TEXT,
  ADD COLUMN IF NOT EXISTS acrescimo NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS juros NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multa NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_final NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(80),
  ADD COLUMN IF NOT EXISTS movimento_id BIGINT REFERENCES fin_movimento(id);
`

async function migrate() {
  await connectDB()
  logger.info('Adicionando campos de baixa em fin_parcelas_cp...')
  try {
    await pool.query(SQL)
    logger.info('✅ Campos de baixa adicionados/validados')
  } catch (err) {
    logger.error('❌ Erro:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
