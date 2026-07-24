/**
 * scripts/migrate_movimento_bancario.js
 * Ajustes finais para Movimento Bancário.
 * Rodar: node scripts/migrate_movimento_bancario.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Atualizando estrutura do Movimento Bancário...')
  try {
    await pool.query(`
      ALTER TABLE fin_movimento
        ADD COLUMN IF NOT EXISTS tipo_lancamento VARCHAR(20) DEFAULT 'financeiro',
        ADD COLUMN IF NOT EXISTS emissao_doc DATE,
        ADD COLUMN IF NOT EXISTS vencimento DATE,
        ADD COLUMN IF NOT EXISTS fornecedor_id INTEGER REFERENCES fin_fornecedores(id),
        ADD COLUMN IF NOT EXISTS banco_conta_id INTEGER REFERENCES fin_bancos_contas(id)
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_bancos_lancamentos (
        id           SERIAL PRIMARY KEY,
        tenant_id    UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        conta_id     INT NOT NULL REFERENCES fin_bancos_contas(id) ON DELETE CASCADE,
        tipo         VARCHAR(20) NOT NULL CHECK (tipo IN ('saldo_inicial','taxa','rendimento','aplicacao')),
        descricao    TEXT NOT NULL,
        valor        NUMERIC(15,2) NOT NULL,
        data         DATE NOT NULL,
        obs          TEXT,
        movimento_id BIGINT REFERENCES fin_movimento(id) ON DELETE SET NULL,
        created_at   TIMESTAMP DEFAULT NOW()
      )
    `)

    await pool.query(`ALTER TABLE fin_bancos_lancamentos ADD COLUMN IF NOT EXISTS movimento_id BIGINT REFERENCES fin_movimento(id) ON DELETE SET NULL`)
    await pool.query(`ALTER TABLE fin_bancos_contas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`)

    await pool.query('CREATE INDEX IF NOT EXISTS idx_mov_banco_conta ON fin_movimento(banco_conta_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_mov_fornecedor_id ON fin_movimento(fornecedor_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bancos_lanc_movimento ON fin_bancos_lancamentos(movimento_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_bancos_lanc_conta ON fin_bancos_lancamentos(conta_id)')

    logger.info('✅ Movimento Bancário atualizado')
  } catch (err) {
    logger.error('❌ Erro: ' + err.message)
    logger.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
