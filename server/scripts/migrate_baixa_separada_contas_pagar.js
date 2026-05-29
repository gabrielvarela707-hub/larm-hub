/**
 * scripts/migrate_baixa_separada_contas_pagar.js
 * Separa os valores do lançamento/parcela dos valores informados na baixa.
 * Rodar: node scripts/migrate_baixa_separada_contas_pagar.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
ALTER TABLE fin_parcelas_cp
  ADD COLUMN IF NOT EXISTS baixa_acrescimo NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_desconto NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_juros NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_multa NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_valor_final NUMERIC(18,4);

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
  try {
    logger.info('Separando valores de baixa em Contas a Pagar...')
    await pool.query(SQL)
    logger.info('✅ Campos de baixa separados com sucesso')
  } catch (err) {
    logger.error('❌ Erro: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
