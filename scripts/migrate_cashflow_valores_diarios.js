/**
 * scripts/migrate_cashflow_valores_diarios.js
 * Cria a tabela usada para editar saldos de aplicações na visão diária do Cash Flow.
 * Rodar: node scripts/migrate_cashflow_valores_diarios.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE TABLE IF NOT EXISTS fin_cashflow_valores_diarios (
  id            BIGSERIAL PRIMARY KEY,
  linha_id      INTEGER NOT NULL REFERENCES fin_cashflow_linhas(id) ON DELETE CASCADE,
  empresa       VARCHAR(30) NOT NULL,
  data          DATE NOT NULL,
  valor         NUMERIC(18,4) NOT NULL DEFAULT 0,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (linha_id, empresa, data)
);

CREATE INDEX IF NOT EXISTS idx_cf_valores_diarios_empresa_data
  ON fin_cashflow_valores_diarios (empresa, data);

CREATE INDEX IF NOT EXISTS idx_cf_valores_diarios_linha_data
  ON fin_cashflow_valores_diarios (linha_id, data);
`

async function main() {
  try {
    await connectDB()
    await pool.query(SQL)
    logger.info('✅ Migration Cash Flow diário concluída: fin_cashflow_valores_diarios pronta para uso.')
  } catch (error) {
    logger.error(`❌ Erro na migration do Cash Flow diário: ${error.message}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
