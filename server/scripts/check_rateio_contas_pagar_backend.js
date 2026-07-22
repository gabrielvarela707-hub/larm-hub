/**
 * Confere a ETAPA 2 do rateio sem alterar dados.
 * Rodar: node scripts/check_rateio_contas_pagar_backend.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function check() {
  await connectDB()
  const client = await pool.connect()

  try {
    const { rows: structure } = await client.query(`
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

    const { rows: functions } = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'trg_fin_cp_bloquear_documento_duplicado'
       LIMIT 1
    `)
    const functionDefinition = String(functions[0]?.definition || '')

    const { rows: triggers } = await client.query(`
      SELECT pg_get_triggerdef(t.oid, true) AS definition
        FROM pg_trigger t
       WHERE t.tgrelid = 'public.fin_lancamentos_cp'::regclass
         AND t.tgname = 'trg_fin_cp_documento_duplicado'
         AND NOT t.tgisinternal
       LIMIT 1
    `)
    const triggerDefinition = String(triggers[0]?.definition || '')

    const functionOk = functionDefinition.includes('NEW.rateio_id')
      && functionDefinition.includes('l.rateio_id IS DISTINCT FROM NEW.rateio_id')
    const triggerOk = triggerDefinition.includes('rateio_id')
      && triggerDefinition.includes('trg_fin_cp_bloquear_documento_duplicado')

    const { rows: totals } = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM fin_cp_rateios) AS grupos,
        (SELECT COUNT(*)::int FROM fin_cp_rateio_itens) AS itens,
        (SELECT COUNT(*)::int FROM fin_lancamentos_cp WHERE rateio_id IS NOT NULL) AS lancamentos_vinculados
    `)

    const { rows: integrityRows } = await client.query(`
      WITH group_totals AS (
        SELECT r.id,
               r.valor_total,
               COUNT(ri.id)::int AS total_itens,
               COALESCE(SUM(ri.valor), 0) AS soma_valores,
               COALESCE(SUM(ri.percentual), 0) AS soma_percentuais
          FROM fin_cp_rateios r
          LEFT JOIN fin_cp_rateio_itens ri ON ri.rateio_id = r.id
         GROUP BY r.id, r.valor_total
      ), duplicate_owners AS (
        SELECT l.fornecedor_id,
               l.tipo_documento_id,
               fin_normalize_document_number(l.nf_doc) AS numero_normalizado
          FROM fin_lancamentos_cp l
         WHERE l.fornecedor_id IS NOT NULL
           AND l.tipo_documento_id IS NOT NULL
           AND fin_normalize_document_number(l.nf_doc) <> ''
         GROUP BY l.fornecedor_id,
                  l.tipo_documento_id,
                  fin_normalize_document_number(l.nf_doc)
        HAVING COUNT(DISTINCT CASE
                 WHEN l.rateio_id IS NULL THEN 'L:' || l.id::text
                 ELSE 'R:' || l.rateio_id::text
               END) > 1
      )
      SELECT
        (SELECT COUNT(*)::int
           FROM group_totals
          WHERE total_itens < 2
             OR ABS(soma_valores - valor_total) > 0.005
             OR ABS(soma_percentuais - 100) > 0.000001) AS grupos_inconsistentes,
        (SELECT COUNT(*)::int
           FROM fin_lancamentos_cp l
           LEFT JOIN fin_cp_rateio_itens ri ON ri.lancamento_id = l.id
          WHERE l.rateio_id IS NOT NULL
            AND ri.id IS NULL) AS lancamentos_sem_item,
        (SELECT COUNT(*)::int
           FROM fin_cp_rateio_itens ri
           JOIN fin_lancamentos_cp l ON l.id = ri.lancamento_id
          WHERE l.rateio_id IS DISTINCT FROM ri.rateio_id) AS vinculos_inconsistentes,
        (SELECT COUNT(*)::int FROM duplicate_owners) AS documentos_duplicados_fora_do_grupo
    `)
    const integrity = integrityRows[0] || {}

    logger.info(`Tabela fin_cp_rateios: ${structure[0]?.grupos_ok ? 'OK' : 'FALTA'}`)
    logger.info(`Tabela fin_cp_rateio_itens: ${structure[0]?.itens_ok ? 'OK' : 'FALTA'}`)
    logger.info(`Coluna fin_lancamentos_cp.rateio_id BIGINT: ${structure[0]?.coluna_ok ? 'OK' : 'FALTA'}`)
    logger.info(`Função de duplicidade compatível com rateio: ${functionOk ? 'OK' : 'FALTA'}`)
    logger.info(`Trigger observa rateio_id: ${triggerOk ? 'OK' : 'FALTA'}`)
    logger.info(`Grupos cadastrados: ${totals[0]?.grupos ?? 'indisponível'}`)
    logger.info(`Itens cadastrados: ${totals[0]?.itens ?? 'indisponível'}`)
    logger.info(`Lançamentos vinculados: ${totals[0]?.lancamentos_vinculados ?? 'indisponível'}`)
    logger.info(`Grupos inconsistentes: ${integrity.grupos_inconsistentes ?? 'indisponível'}`)
    logger.info(`Lançamentos de rateio sem item: ${integrity.lancamentos_sem_item ?? 'indisponível'}`)
    logger.info(`Vínculos inconsistentes: ${integrity.vinculos_inconsistentes ?? 'indisponível'}`)
    logger.info(`Documentos duplicados fora do mesmo grupo: ${integrity.documentos_duplicados_fora_do_grupo ?? 'indisponível'}`)

    const failed = !structure[0]?.grupos_ok
      || !structure[0]?.itens_ok
      || !structure[0]?.coluna_ok
      || !functionOk
      || !triggerOk
      || Number(integrity.grupos_inconsistentes || 0) > 0
      || Number(integrity.lancamentos_sem_item || 0) > 0
      || Number(integrity.vinculos_inconsistentes || 0) > 0
      || Number(integrity.documentos_duplicados_fora_do_grupo || 0) > 0

    if (failed) {
      process.exitCode = 1
      return
    }

    logger.info('✅ Backend do rateio conferido sem alterar nenhum lançamento.')
  } catch (err) {
    logger.error(`❌ Erro na conferência: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

check()
