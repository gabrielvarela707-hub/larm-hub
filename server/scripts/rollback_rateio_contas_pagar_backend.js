/**
 * Restaura somente a regra antiga de duplicidade da ETAPA 2.
 * Recusa a execução se qualquer dado de rateio já tiver sido criado.
 * A estrutura da ETAPA 1 não é removida por este script.
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const CONSTRAINT_NAME = 'uq_fin_lancamentos_cp_fornecedor_tipo_numero'

async function rollback() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")

    const { rows } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM fin_cp_rateios) AS grupos,
        (SELECT COUNT(*)::int FROM fin_cp_rateio_itens) AS itens,
        (SELECT COUNT(*)::int FROM fin_lancamentos_cp WHERE rateio_id IS NOT NULL) AS vinculados
    `)
    const totals = rows[0] || {}

    if (Number(totals.grupos || 0) > 0
      || Number(totals.itens || 0) > 0
      || Number(totals.vinculados || 0) > 0) {
      throw new Error(
        'Rollback recusado: já existem dados de rateio. Preserve o backend compatível para não bloquear ou desalinhar esses registros.',
      )
    }

    await client.query(`
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

    await client.query(`
      DROP TRIGGER IF EXISTS trg_fin_cp_documento_duplicado
      ON fin_lancamentos_cp
    `)

    await client.query(`
      CREATE TRIGGER trg_fin_cp_documento_duplicado
      BEFORE INSERT OR UPDATE OF fornecedor_id, tipo_documento_id, nf_doc
      ON fin_lancamentos_cp
      FOR EACH ROW
      EXECUTE FUNCTION trg_fin_cp_bloquear_documento_duplicado()
    `)

    await client.query('COMMIT')
    logger.info('✅ Regra anterior de duplicidade restaurada. Estrutura da etapa 1 preservada.')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    logger.error(`❌ Falha no rollback do backend de rateio: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

rollback()
