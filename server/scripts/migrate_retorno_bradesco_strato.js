/**
 * v0.3.81 — Retorno Bradesco integrado aos recebíveis importados do Strato.
 *
 * Execução:
 *   node scripts/migrate_retorno_bradesco_strato.js
 *
 * Idempotente: pode ser executado novamente sem duplicar estruturas.
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rows: [required] } = await client.query(`
      SELECT
        to_regclass('public.com_parcelas') AS parcelas,
        to_regclass('public.fin_movimento') AS movimento,
        to_regclass('public.fin_bancos_contas') AS bancos,
        to_regclass('public.fin_retornos_cobranca') AS retornos,
        to_regclass('public.fin_retornos_cobranca_itens') AS retorno_itens
    `)

    const missing = Object.entries(required || {}).filter(([, value]) => !value).map(([key]) => key)
    if (missing.length) {
      throw new Error(`Pré-requisitos ausentes: ${missing.join(', ')}. Execute primeiro as migrations de recebíveis e cobrança Bradesco.`)
    }

    await client.query(`
      ALTER TABLE fin_retornos_cobranca
        ADD COLUMN IF NOT EXISTS baixa_automatica BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS empresa VARCHAR(20),
        ADD COLUMN IF NOT EXISTS banco_conta_id INTEGER REFERENCES fin_bancos_contas(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS dados JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    await client.query(`
      ALTER TABLE fin_retornos_cobranca_itens
        ADD COLUMN IF NOT EXISTS movimento_id BIGINT REFERENCES fin_movimento(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS metodo_conciliacao VARCHAR(40),
        ADD COLUMN IF NOT EXISTS divergencia_valor NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS empresa VARCHAR(20)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_retorno_empresa_data
        ON fin_retornos_cobranca(tenant_id, empresa, data_arquivo DESC);
      CREATE INDEX IF NOT EXISTS idx_fin_retorno_banco_conta
        ON fin_retornos_cobranca(banco_conta_id)
        WHERE banco_conta_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_movimento
        ON fin_retornos_cobranca_itens(movimento_id)
        WHERE movimento_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_controle
        ON fin_retornos_cobranca_itens(tenant_id, controle_participante)
        WHERE controle_participante IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_controle_participante
        ON com_parcelas(tenant_id, controle_participante)
        WHERE controle_participante IS NOT NULL;
    `)

    await client.query(`
      COMMENT ON COLUMN fin_retornos_cobranca.empresa IS 'Empresa identificada no cabeçalho CNAB: LARM ou LUCKY.';
      COMMENT ON COLUMN fin_retornos_cobranca.banco_conta_id IS 'Conta Bradesco que recebeu os créditos do arquivo.';
      COMMENT ON COLUMN fin_retornos_cobranca.dados IS 'Cabeçalho e resumo técnico do processamento do retorno.';
      COMMENT ON COLUMN fin_retornos_cobranca_itens.movimento_id IS 'Movimento Bancário criado pela liquidação do retorno.';
      COMMENT ON COLUMN fin_retornos_cobranca_itens.metodo_conciliacao IS 'Método usado para localizar a parcela: nosso número, controle, ts1_core ou fallback seguro.';
      COMMENT ON COLUMN fin_retornos_cobranca_itens.divergencia_valor IS 'Diferença entre o valor atual da parcela no HUB e o valor do título no retorno.';
    `)

    await client.query('COMMIT')
    logger.info('Migration do retorno Bradesco/Strato aplicada com sucesso.')
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error(`Falha na migration do retorno Bradesco/Strato: ${error.message}`)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(() => process.exit(1))
