/**
 * Adiciona modalidade/instruções de pagamento e múltiplos boletos aos
 * lançamentos de Contas a Pagar.
 *
 * Execução:
 *   node scripts/migrate_modalidade_pagamento_cp.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Adicionando modalidade de pagamento e boletos em Contas a Pagar...')

  try {
    await pool.query('BEGIN')

    await pool.query(`
      ALTER TABLE fin_lancamentos_cp
        ADD COLUMN IF NOT EXISTS modalidade_pagamento VARCHAR(20),
        ADD COLUMN IF NOT EXISTS chave_pix_pagamento VARCHAR(180),
        ADD COLUMN IF NOT EXISTS banco_pagamento_nome VARCHAR(160),
        ADD COLUMN IF NOT EXISTS banco_pagamento_codigo VARCHAR(10),
        ADD COLUMN IF NOT EXISTS agencia_pagamento VARCHAR(30),
        ADD COLUMN IF NOT EXISTS conta_pagamento VARCHAR(50),
        ADD COLUMN IF NOT EXISTS digito_pagamento VARCHAR(10),
        ADD COLUMN IF NOT EXISTS tipo_conta_pagamento VARCHAR(30),
        ADD COLUMN IF NOT EXISTS linha_digitavel_boleto TEXT
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_lancamentos_cp_boletos (
        id              BIGSERIAL PRIMARY KEY,
        lancamento_id   INTEGER NOT NULL REFERENCES fin_lancamentos_cp(id) ON DELETE CASCADE,
        nome            VARCHAR(255) NOT NULL,
        mime            VARCHAR(120) NOT NULL,
        tamanho_bytes   INTEGER DEFAULT 0,
        arquivo_base64  TEXT NOT NULL,
        created_at      TIMESTAMP DEFAULT NOW()
      )
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_cp_boletos_lancamento
        ON fin_lancamentos_cp_boletos(lancamento_id)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_cp_modalidade_pagamento
        ON fin_lancamentos_cp(modalidade_pagamento)
    `)

    await pool.query('COMMIT')
    logger.info('✅ Migration de modalidade de pagamento concluída.')
  } catch (err) {
    await pool.query('ROLLBACK')
    logger.error('❌ Erro na migration de modalidade de pagamento: ' + err.message)
    logger.error(err.stack)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
