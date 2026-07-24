/**
 * Versão 0.3.46 — Contas a Receber operacional.
 *
 * Prepara o vínculo entre parcelas recebidas e o Movimento Bancário. A baixa
 * conciliada deve preencher movimento_id, origem_baixa='conciliacao_bancaria'
 * e conciliado_em. A tela passa a diferenciar baixa manual de conciliação.
 *
 * Execução: node scripts/migrate_contas_receber_operacional.js
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(`
      ALTER TABLE com_parcelas
        ADD COLUMN IF NOT EXISTS movimento_id BIGINT,
        ADD COLUMN IF NOT EXISTS origem_baixa VARCHAR(30),
        ADD COLUMN IF NOT EXISTS conciliado_em TIMESTAMP,
        ADD COLUMN IF NOT EXISTS conciliacao_dados JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    await client.query(`
      DO $$
      BEGIN
        IF to_regclass('public.fin_movimento') IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
               FROM pg_constraint
              WHERE conname = 'fk_com_parcelas_movimento'
                AND conrelid = 'public.com_parcelas'::regclass
           ) THEN
          ALTER TABLE com_parcelas
            ADD CONSTRAINT fk_com_parcelas_movimento
            FOREIGN KEY (movimento_id)
            REFERENCES fin_movimento(id)
            ON DELETE SET NULL;
        END IF;
      END $$
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_movimento
        ON com_parcelas(movimento_id)
        WHERE movimento_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_com_parcelas_receber_listagem
        ON com_parcelas(tenant_id, vencimento, status);
    `)

    await client.query(`
      UPDATE com_parcelas
         SET origem_baixa = CASE
           WHEN movimento_id IS NOT NULL THEN 'conciliacao_bancaria'
           WHEN status='paga' THEN 'manual'
           ELSE origem_baixa
         END,
         conciliado_em = CASE
           WHEN movimento_id IS NOT NULL THEN COALESCE(conciliado_em, pago_em, updated_at)
           ELSE conciliado_em
         END
       WHERE origem_baixa IS NULL
          OR (movimento_id IS NOT NULL AND conciliado_em IS NULL)
    `)

    await client.query(`
      COMMENT ON COLUMN com_parcelas.movimento_id IS 'Movimento bancário que confirmou o recebimento da parcela.';
      COMMENT ON COLUMN com_parcelas.origem_baixa IS 'Origem da baixa: manual, conciliacao_bancaria ou importacao_historica.';
      COMMENT ON COLUMN com_parcelas.conciliado_em IS 'Data/hora em que o retorno bancário conciliou a parcela.';
      COMMENT ON COLUMN com_parcelas.conciliacao_dados IS 'Metadados do retorno bancário usados na conciliação.';
    `)

    await client.query('COMMIT')

    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(*)::int AS parcelas,
        COUNT(*) FILTER (WHERE status='paga')::int AS pagas,
        COUNT(*) FILTER (WHERE movimento_id IS NOT NULL)::int AS conciliadas
      FROM com_parcelas
    `)

    logger.info(
      `✅ Contas a Receber operacional preparado. Parcelas: ${summary.parcelas}; ` +
      `pagas: ${summary.pagas}; conciliadas: ${summary.conciliadas}.`,
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`❌ Erro na migration do Contas a Receber operacional: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
