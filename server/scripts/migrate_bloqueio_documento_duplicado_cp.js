/**
 * server/scripts/migrate_bloqueio_documento_duplicado_cp.js
 * Bloqueia lançamentos duplicados em Contas a Pagar pela combinação:
 * fornecedor + tipo de documento + número do documento normalizado.
 *
 * Registros antigos não são excluídos nem alterados. A migration apenas cria
 * índice de apoio e trigger para impedir novas duplicidades.
 *
 * Rodar: node scripts/migrate_bloqueio_documento_duplicado_cp.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const CONSTRAINT_NAME = 'uq_fin_lancamentos_cp_fornecedor_tipo_numero'

async function migrate() {
  await connectDB()
  logger.info('Criando bloqueio de documento duplicado em Contas a Pagar...')

  try {
    await pool.query('BEGIN')

    await pool.query(`
      CREATE OR REPLACE FUNCTION fin_normalize_document_number(p_value TEXT)
      RETURNS TEXT
      LANGUAGE SQL
      IMMUTABLE
      PARALLEL SAFE
      AS $$
        SELECT UPPER(
          REGEXP_REPLACE(
            BTRIM(COALESCE(p_value, '')),
            '[^[:alnum:]]',
            '',
            'g'
          )
        )
      $$
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cp_documento_composto_normalizado
      ON fin_lancamentos_cp (
        fornecedor_id,
        tipo_documento_id,
        fin_normalize_document_number(nf_doc)
      )
      WHERE fornecedor_id IS NOT NULL
        AND tipo_documento_id IS NOT NULL
        AND fin_normalize_document_number(nf_doc) <> ''
    `)

    await pool.query(`
      CREATE OR REPLACE FUNCTION trg_fin_cp_bloquear_documento_duplicado()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_numero TEXT;
        v_lock_key TEXT;
        v_duplicado_id INTEGER;
      BEGIN
        v_numero := fin_normalize_document_number(NEW.nf_doc);

        IF NEW.fornecedor_id IS NULL
           OR NEW.tipo_documento_id IS NULL
           OR v_numero = '' THEN
          RETURN NEW;
        END IF;

        v_lock_key := 'cp-documento:'
          || NEW.fornecedor_id::TEXT || ':'
          || NEW.tipo_documento_id::TEXT || ':'
          || v_numero;

        PERFORM pg_advisory_xact_lock(hashtext(v_lock_key));

        SELECT l.id
          INTO v_duplicado_id
          FROM fin_lancamentos_cp l
         WHERE l.fornecedor_id = NEW.fornecedor_id
           AND l.tipo_documento_id = NEW.tipo_documento_id
           AND fin_normalize_document_number(l.nf_doc) = v_numero
           AND l.id IS DISTINCT FROM NEW.id
         ORDER BY l.id
         LIMIT 1;

        IF v_duplicado_id IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '23505',
            CONSTRAINT = '${CONSTRAINT_NAME}',
            MESSAGE = 'Já existe um lançamento para este fornecedor com o mesmo tipo e número de documento.',
            DETAIL = 'Lançamento existente: ' || v_duplicado_id::TEXT;
        END IF;

        RETURN NEW;
      END
      $$
    `)

    await pool.query(`
      DROP TRIGGER IF EXISTS trg_fin_cp_documento_duplicado
      ON fin_lancamentos_cp
    `)

    await pool.query(`
      CREATE TRIGGER trg_fin_cp_documento_duplicado
      BEFORE INSERT OR UPDATE OF fornecedor_id, tipo_documento_id, nf_doc
      ON fin_lancamentos_cp
      FOR EACH ROW
      EXECUTE FUNCTION trg_fin_cp_bloquear_documento_duplicado()
    `)

    const { rows: duplicates } = await pool.query(`
      SELECT
        fornecedor_id,
        tipo_documento_id,
        fin_normalize_document_number(nf_doc) AS numero_normalizado,
        COUNT(*)::INTEGER AS quantidade,
        ARRAY_AGG(id ORDER BY id) AS lancamentos
      FROM fin_lancamentos_cp
      WHERE fornecedor_id IS NOT NULL
        AND tipo_documento_id IS NOT NULL
        AND fin_normalize_document_number(nf_doc) <> ''
      GROUP BY
        fornecedor_id,
        tipo_documento_id,
        fin_normalize_document_number(nf_doc)
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `)

    await pool.query('COMMIT')

    logger.info('✅ Bloqueio de documentos duplicados criado/validado')
    if (duplicates.length) {
      logger.warn(
        `⚠️ Foram encontrados ${duplicates.length} grupo(s) duplicado(s) antigos. Eles foram preservados; novas duplicidades já estão bloqueadas.`,
      )
      duplicates.slice(0, 20).forEach((item) => {
        logger.warn(
          `Fornecedor ${item.fornecedor_id}, tipo ${item.tipo_documento_id}, número ${item.numero_normalizado}: lançamentos ${item.lancamentos.join(', ')}`,
        )
      })
    } else {
      logger.info('Nenhuma duplicidade antiga encontrada.')
    }
  } catch (err) {
    try {
      await pool.query('ROLLBACK')
    } catch {}
    logger.error('❌ Erro ao criar bloqueio de documentos duplicados:', err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
