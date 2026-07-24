/**
 * Versão 0.3.59 — comunicação de boletos, retorno com baixa opcional e auditoria.
 * Execução: node scripts/migrate_recebiveis_comunicacao_lote.js
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
        ADD COLUMN IF NOT EXISTS boleto_enviado_em TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS boleto_envio_canal VARCHAR(20),
        ADD COLUMN IF NOT EXISTS boleto_envio_status VARCHAR(30),
        ADD COLUMN IF NOT EXISTS boleto_envio_erro TEXT
    `)
    await client.query(`
      ALTER TABLE fin_retornos_cobranca
        ADD COLUMN IF NOT EXISTS baixa_automatica BOOLEAN NOT NULL DEFAULT TRUE
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_boletos_envios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        parcela_id UUID NOT NULL REFERENCES com_parcelas(id) ON DELETE CASCADE,
        canal VARCHAR(20) NOT NULL,
        destinatario VARCHAR(180),
        status VARCHAR(30) NOT NULL,
        provider_message_id VARCHAR(180),
        erro TEXT,
        dados JSONB NOT NULL DEFAULT '{}'::jsonb,
        enviado_por UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        enviado_em TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_boletos_envios_parcela
        ON fin_boletos_envios(tenant_id, parcela_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_boleto_envio
        ON com_parcelas(tenant_id, boleto_envio_status, boleto_enviado_em);
    `)
    await client.query(`
      COMMENT ON COLUMN com_parcelas.boleto_enviado_em IS 'Data do último envio confirmado do boleto.';
      COMMENT ON COLUMN com_parcelas.boleto_envio_canal IS 'Canal do último envio: email ou whatsapp.';
      COMMENT ON COLUMN com_parcelas.boleto_envio_status IS 'Resultado do último preparo/envio do boleto.';
      COMMENT ON COLUMN fin_retornos_cobranca.baixa_automatica IS 'Indica se liquidações do arquivo foram baixadas automaticamente.';
    `)
    await client.query('COMMIT')
    logger.info('Migration 0.3.59 aplicada: comunicação de boletos e baixa opcional do retorno.')
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error(`Falha na migration 0.3.59: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
