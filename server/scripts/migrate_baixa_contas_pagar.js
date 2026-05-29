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
  ADD COLUMN IF NOT EXISTS baixa_acrescimo NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_desconto NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_juros NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_multa NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_valor_final NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(80),
  ADD COLUMN IF NOT EXISTS movimento_id BIGINT REFERENCES fin_movimento(id);

UPDATE fin_parcelas_cp
SET baixa_acrescimo = CASE WHEN baixa_acrescimo IS NULL OR baixa_acrescimo = 0 THEN COALESCE(acrescimo, 0) ELSE baixa_acrescimo END,
    baixa_desconto = CASE WHEN baixa_desconto IS NULL OR baixa_desconto = 0 THEN COALESCE(desconto, 0) ELSE baixa_desconto END,
    baixa_juros = CASE WHEN baixa_juros IS NULL OR baixa_juros = 0 THEN COALESCE(juros, 0) ELSE baixa_juros END,
    baixa_multa = CASE WHEN baixa_multa IS NULL OR baixa_multa = 0 THEN COALESCE(multa, 0) ELSE baixa_multa END,
    baixa_valor_final = COALESCE(baixa_valor_final, valor_final)
WHERE status = 'pago'
  AND (baixa_valor_final IS NULL OR baixa_valor_final = 0);
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
