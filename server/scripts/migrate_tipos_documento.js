/**
 * scripts/migrate_tipos_documento.js
 * → server/scripts/migrate_tipos_documento.js
 * Rodar: node scripts/migrate_tipos_documento.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Criando fin_tipos_documento...')
  try {
    // Tabela principal
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_tipos_documento (
        id          SERIAL       PRIMARY KEY,
        tenant_id   UUID         NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        nome        VARCHAR(80)  NOT NULL,
        descricao   TEXT,
        ativo       BOOLEAN      DEFAULT TRUE,
        usado_em    TEXT[]       DEFAULT ARRAY['pagar','receber'],
        created_at  TIMESTAMP    DEFAULT NOW(),
        updated_at  TIMESTAMP    DEFAULT NOW(),
        UNIQUE(tenant_id, nome)
      )
    `)
    logger.info('  ✅  fin_tipos_documento criada')

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_tipos_doc_tenant ON fin_tipos_documento(tenant_id)`)

    // Adiciona coluna em fin_lancamentos_cp (se existir)
    const { rows: cpExists } = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'fin_lancamentos_cp' LIMIT 1
    `)
    if (cpExists.length) {
      await pool.query(`
        ALTER TABLE fin_lancamentos_cp
          ADD COLUMN IF NOT EXISTS tipo_documento_id INT REFERENCES fin_tipos_documento(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS documento_nome VARCHAR(255),
          ADD COLUMN IF NOT EXISTS documento_mime VARCHAR(120),
          ADD COLUMN IF NOT EXISTS documento_base64 TEXT
      `)
      logger.info('  ✅  colunas tipo_documento_id/documento_* em fin_lancamentos_cp')
    } else {
      logger.info('  ⏭  fin_lancamentos_cp não existe ainda — skip')
    }

    // Adiciona coluna em fin_lancamentos_cr (se existir)
    const { rows: crExists } = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'fin_lancamentos_cr' LIMIT 1
    `)
    if (crExists.length) {
      await pool.query(`
        ALTER TABLE fin_lancamentos_cr
          ADD COLUMN IF NOT EXISTS tipo_documento_id INT
          REFERENCES fin_tipos_documento(id) ON DELETE SET NULL
      `)
      logger.info('  ✅  coluna tipo_documento_id em fin_lancamentos_cr')
    } else {
      logger.info('  ⏭  fin_lancamentos_cr não existe ainda — skip')
    }

    logger.info('✅  Migration concluída com sucesso')
  } catch (err) {
    logger.error('❌  Erro: ' + err.message)
    logger.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
