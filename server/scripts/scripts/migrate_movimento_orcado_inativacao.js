/**
 * scripts/migrate_movimento_orcado_inativacao.js
 * Adiciona inativação segura e rastreável ao Movimento Orçado.
 * Rodar: node scripts/migrate_movimento_orcado_inativacao.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
ALTER TABLE IF EXISTS fin_orcamento_movimento
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS inativado_em TIMESTAMP,
  ADD COLUMN IF NOT EXISTS inativado_por UUID,
  ADD COLUMN IF NOT EXISTS motivo_inativacao TEXT;

UPDATE fin_orcamento_movimento
   SET ativo = TRUE
 WHERE ativo IS NULL;

CREATE INDEX IF NOT EXISTS idx_orcamento_mov_ativo
  ON fin_orcamento_movimento(ativo);

CREATE INDEX IF NOT EXISTS idx_orcamento_mov_ano_ativo
  ON fin_orcamento_movimento(ano, ativo);
`

async function migrate() {
  await connectDB()
  logger.info('Adicionando inativação auditável ao Movimento Orçado...')

  try {
    await pool.query(SQL)
    logger.info('✅ Inativação do Movimento Orçado configurada com sucesso')
  } catch (err) {
    logger.error('❌ Erro ao migrar inativação do Movimento Orçado: ' + err.message)
    logger.error(err.stack)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
