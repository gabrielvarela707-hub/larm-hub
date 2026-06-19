/**
 * Adiciona tipo e número de documento por parcela em Contas a Pagar.
 *
 * Execução:
 *   node scripts/migrate_documentos_parcelas_cp.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Adicionando documento por parcela em Contas a Pagar...')

  try {
    await pool.query('BEGIN')

    await pool.query(`
      ALTER TABLE fin_parcelas_cp
        ADD COLUMN IF NOT EXISTS tipo_documento_id INTEGER,
        ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(160)
    `)

    const { rows: fkRows } = await pool.query(`
      SELECT 1
        FROM pg_constraint
       WHERE conname = 'fk_fin_parcelas_cp_tipo_documento'
       LIMIT 1
    `)

    if (!fkRows.length) {
      await pool.query(`
        ALTER TABLE fin_parcelas_cp
          ADD CONSTRAINT fk_fin_parcelas_cp_tipo_documento
          FOREIGN KEY (tipo_documento_id)
          REFERENCES fin_tipos_documento(id)
          ON DELETE SET NULL
      `)
    }

    const backfill = await pool.query(`
      UPDATE fin_parcelas_cp p
         SET tipo_documento_id = COALESCE(p.tipo_documento_id, l.tipo_documento_id),
             numero_documento = COALESCE(NULLIF(BTRIM(p.numero_documento), ''), l.nf_doc)
        FROM fin_lancamentos_cp l
       WHERE l.id = p.lancamento_id
         AND (
           p.tipo_documento_id IS NULL
           OR NULLIF(BTRIM(p.numero_documento), '') IS NULL
         )
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_parcelas_cp_tipo_documento
        ON fin_parcelas_cp(tipo_documento_id)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_parcelas_cp_numero_documento_normalizado
        ON fin_parcelas_cp (
          UPPER(REGEXP_REPLACE(BTRIM(COALESCE(numero_documento, '')), '[^[:alnum:]]', '', 'g'))
        )
    `)

    await pool.query('COMMIT')
    logger.info(`✅ Migration concluída. ${backfill.rowCount} parcela(s) preenchida(s) com o documento principal.`)
  } catch (err) {
    await pool.query('ROLLBACK')
    logger.error('❌ Erro na migration de documentos por parcela: ' + err.message)
    logger.error(err.stack)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
