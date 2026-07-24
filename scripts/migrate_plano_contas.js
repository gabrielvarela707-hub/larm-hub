/**
 * scripts/migrate_plano_contas.js
 * Garante a estrutura do plano de contas financeiro.
 *
 * Rodar:
 *   node scripts/migrate_plano_contas.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Criando/ajustando fin_plano_contas...')

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_plano_contas (
        id        SERIAL PRIMARY KEY,
        codigo    VARCHAR(20) NOT NULL UNIQUE,
        descricao TEXT NOT NULL,
        tipo      CHAR(1) DEFAULT 'A',
        pai_id    INTEGER REFERENCES fin_plano_contas(id),
        ativo     BOOLEAN DEFAULT TRUE
      )
    `)

    await pool.query(`ALTER TABLE fin_plano_contas ADD COLUMN IF NOT EXISTS codigo VARCHAR(20)`)
    await pool.query(`ALTER TABLE fin_plano_contas ADD COLUMN IF NOT EXISTS descricao TEXT`)
    await pool.query(`ALTER TABLE fin_plano_contas ADD COLUMN IF NOT EXISTS tipo CHAR(1) DEFAULT 'A'`)
    await pool.query(`ALTER TABLE fin_plano_contas ADD COLUMN IF NOT EXISTS pai_id INTEGER REFERENCES fin_plano_contas(id)`)
    await pool.query(`ALTER TABLE fin_plano_contas ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE`)

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'fin_plano_contas_codigo_key'
        ) THEN
          ALTER TABLE fin_plano_contas ADD CONSTRAINT fin_plano_contas_codigo_key UNIQUE (codigo);
        END IF;
      END $$;
    `)

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_plano_contas_codigo ON fin_plano_contas(codigo)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_plano_contas_pai_id ON fin_plano_contas(pai_id)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fin_plano_contas_ativo ON fin_plano_contas(ativo)`)

    logger.info('✅ fin_plano_contas pronta')
  } catch (err) {
    logger.error('❌ Erro na migration de plano de contas: ' + err.message)
    logger.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
