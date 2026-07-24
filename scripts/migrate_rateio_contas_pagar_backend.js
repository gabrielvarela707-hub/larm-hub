/**
 * ETAPA 2 do rateio do Contas a Pagar.
 *
 * Ativa no banco a exceção controlada da regra de documento duplicado:
 * várias partes podem repetir fornecedor + tipo + número somente quando todas
 * pertencem ao mesmo fin_cp_rateios.id. Documentos normais e grupos diferentes
 * continuam bloqueados.
 *
 * Rodar: node scripts/migrate_rateio_contas_pagar_backend.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const CONSTRAINT_NAME = 'uq_fin_lancamentos_cp_fornecedor_tipo_numero'

async function assertStageOne(client) {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.fin_cp_rateios') IS NOT NULL AS grupos_ok,
      to_regclass('public.fin_cp_rateio_itens') IS NOT NULL AS itens_ok,
      EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'fin_lancamentos_cp'
           AND column_name = 'rateio_id'
           AND data_type = 'bigint'
      ) AS coluna_ok
  `)

  const status = rows[0] || {}
  if (!status.grupos_ok || !status.itens_ok || !status.coluna_ok) {
    throw new Error(
      'A estrutura da etapa 1 não foi encontrada. Execute e confira primeiro db:migrate:rateio-cp-estrutura.',
    )
  }
}

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  logger.info('ETAPA 2: ativando o backend seguro do rateio de Contas a Pagar...')

  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '60s'")
    await assertStageOne(client)

    await client.query(`
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
           AND (
             NEW.rateio_id IS NULL
             OR l.rateio_id IS DISTINCT FROM NEW.rateio_id
           )
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
      BEFORE INSERT OR UPDATE OF fornecedor_id, tipo_documento_id, nf_doc, rateio_id
      ON fin_lancamentos_cp
      FOR EACH ROW
      EXECUTE FUNCTION trg_fin_cp_bloquear_documento_duplicado()
    `)

    await client.query('COMMIT')
    logger.info('✅ Regra de duplicidade preparada para partes do mesmo rateio.')
    logger.info('✅ Documentos normais e grupos de rateio diferentes continuam bloqueados.')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {}
    logger.error(`❌ Falha ao ativar o backend do rateio: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
