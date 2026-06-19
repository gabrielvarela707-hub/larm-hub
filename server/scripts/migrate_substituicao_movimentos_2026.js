require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Preparando auditoria da substituição de movimentos...')
  try {
    await pool.query('BEGIN')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_importacao_lotes (
        id BIGSERIAL PRIMARY KEY,
        lote_id VARCHAR(80) NOT NULL UNIQUE,
        ano INTEGER NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'em_execucao',
        arquivo_realizado TEXT,
        arquivo_orcado TEXT,
        data_limite_realizado DATE,
        qtd_realizado INTEGER DEFAULT 0,
        qtd_orcado INTEGER DEFAULT 0,
        qtd_preservados INTEGER DEFAULT 0,
        qtd_plano_contas INTEGER DEFAULT 0,
        total_entradas_realizado NUMERIC(18,4) DEFAULT 0,
        total_saidas_realizado NUMERIC(18,4) DEFAULT 0,
        total_entradas_orcado NUMERIC(18,4) DEFAULT 0,
        total_saidas_orcado NUMERIC(18,4) DEFAULT 0,
        observacoes TEXT,
        iniciado_em TIMESTAMP DEFAULT NOW(),
        finalizado_em TIMESTAMP
      )
    `)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_importacao_backup (
        id BIGSERIAL PRIMARY KEY,
        lote_id VARCHAR(80) NOT NULL,
        tabela_origem VARCHAR(80) NOT NULL,
        registro_id BIGINT,
        dados JSONB NOT NULL,
        backup_em TIMESTAMP DEFAULT NOW()
      )
    `)
    await pool.query(`
      ALTER TABLE fin_movimento
        ADD COLUMN IF NOT EXISTS lote_importacao VARCHAR(80),
        ADD COLUMN IF NOT EXISTS arquivo_origem TEXT,
        ADD COLUMN IF NOT EXISTS linha_origem INTEGER,
        ADD COLUMN IF NOT EXISTS hash_importacao VARCHAR(64),
        ADD COLUMN IF NOT EXISTS importado_em TIMESTAMP
    `)
    await pool.query(`
      ALTER TABLE IF EXISTS fin_orcamento_movimento
        ADD COLUMN IF NOT EXISTS lote_importacao VARCHAR(80),
        ADD COLUMN IF NOT EXISTS arquivo_origem TEXT,
        ADD COLUMN IF NOT EXISTS linha_origem INTEGER,
        ADD COLUMN IF NOT EXISTS hash_importacao VARCHAR(64),
        ADD COLUMN IF NOT EXISTS importado_em TIMESTAMP
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_importacao_lotes_ano ON fin_importacao_lotes(ano, iniciado_em)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_importacao_backup_lote ON fin_importacao_backup(lote_id, tabela_origem)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mov_lote_importacao ON fin_movimento(lote_importacao)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orc_mov_lote_importacao ON fin_orcamento_movimento(lote_importacao)`)
    await pool.query('COMMIT')
    logger.info('✅ Estrutura de auditoria preparada.')
  } catch (err) {
    await pool.query('ROLLBACK')
    logger.error('❌ Erro: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
