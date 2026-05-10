/**
 * scripts/migrate_bancos_lancamentos.js
 * → server/scripts/migrate_bancos_lancamentos.js  (novo)
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Criando fin_bancos_lancamentos...')
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_bancos_lancamentos (
        id          SERIAL      PRIMARY KEY,
        tenant_id   UUID        NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        conta_id    INT         NOT NULL REFERENCES fin_bancos_contas(id) ON DELETE CASCADE,
        tipo        VARCHAR(20) NOT NULL CHECK (tipo IN ('saldo_inicial','taxa','rendimento','aplicacao')),
        descricao   TEXT        NOT NULL,
        valor       NUMERIC(15,2) NOT NULL,
        data        DATE        NOT NULL,
        obs         TEXT,
        created_at  TIMESTAMP   DEFAULT NOW()
      )
    `)
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bancos_lanc_conta ON fin_bancos_lancamentos(conta_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bancos_lanc_tenant ON fin_bancos_lancamentos(tenant_id)')

    // Garante que saldo_inicial não é obrigatório na tabela de contas
    await pool.query(`ALTER TABLE fin_bancos_contas ALTER COLUMN saldo_inicial SET DEFAULT 0`)
    await pool.query(`ALTER TABLE fin_bancos_contas ALTER COLUMN saldo_inicial DROP NOT NULL`)
    await pool.query(`ALTER TABLE fin_bancos_contas ALTER COLUMN data_saldo_inicial DROP NOT NULL`)

    logger.info('✅  fin_bancos_lancamentos OK')
  } catch (err) {
    logger.error('❌  Erro: ' + err.message)
    logger.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
