/**
 * scripts/migrate_tenant_config.js
 * → server/scripts/migrate_tenant_config.js
 * Idempotente — pode rodar mesmo com a tabela já existindo
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE TABLE IF NOT EXISTS hub_tenant_configs (
  tenant_id              UUID PRIMARY KEY REFERENCES hub_tenants(id) ON DELETE CASCADE,
  logo_url               TEXT,
  logo_text              VARCHAR(80)  DEFAULT 'LoteMobile',
  primary_color          VARCHAR(9)   DEFAULT '#2563EB',
  sidebar_color          VARCHAR(9)   DEFAULT '#0D1B2A',
  google_maps_key        TEXT,
  ses_region             VARCHAR(30)  DEFAULT 'us-east-1',
  ses_access_key_id      TEXT,
  ses_secret_access_key  TEXT,
  ses_from_email         VARCHAR(150),
  ses_from_name          VARCHAR(100),
  sns_region             VARCHAR(30)  DEFAULT 'sa-east-1',
  sns_access_key_id      TEXT,
  sns_secret_access_key  TEXT,
  sns_sender_id          VARCHAR(40)  DEFAULT 'LOTEAMENTO',
  sns_sms_type           VARCHAR(20)  DEFAULT 'Transactional',
  sns_mock_mode          BOOLEAN      DEFAULT TRUE,
  whatsapp_token         TEXT,
  whatsapp_phone_id      VARCHAR(60),
  whatsapp_business_id   VARCHAR(60),
  clicksign_key          TEXT,
  bank_name              VARCHAR(80),
  bank_api_key           TEXT,
  crm_config             JSONB        DEFAULT '{}',
  created_at             TIMESTAMP    DEFAULT NOW(),
  updated_at             TIMESTAMP    DEFAULT NOW()
);

-- Garante todas as colunas caso a tabela já exista
ALTER TABLE hub_tenant_configs
  ADD COLUMN IF NOT EXISTS ses_region            VARCHAR(30)  DEFAULT 'us-east-1',
  ADD COLUMN IF NOT EXISTS ses_access_key_id     TEXT,
  ADD COLUMN IF NOT EXISTS ses_secret_access_key TEXT,
  ADD COLUMN IF NOT EXISTS ses_from_email        VARCHAR(150),
  ADD COLUMN IF NOT EXISTS ses_from_name         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sns_region            VARCHAR(30)  DEFAULT 'sa-east-1',
  ADD COLUMN IF NOT EXISTS sns_access_key_id     TEXT,
  ADD COLUMN IF NOT EXISTS sns_secret_access_key TEXT,
  ADD COLUMN IF NOT EXISTS sns_sender_id         VARCHAR(40)  DEFAULT 'LOTEAMENTO',
  ADD COLUMN IF NOT EXISTS sns_sms_type          VARCHAR(20)  DEFAULT 'Transactional',
  ADD COLUMN IF NOT EXISTS sns_mock_mode         BOOLEAN      DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS whatsapp_token        TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_id     VARCHAR(60),
  ADD COLUMN IF NOT EXISTS whatsapp_business_id  VARCHAR(60),
  ADD COLUMN IF NOT EXISTS google_maps_key       TEXT,
  ADD COLUMN IF NOT EXISTS clicksign_key         TEXT,
  ADD COLUMN IF NOT EXISTS bank_name             VARCHAR(80),
  ADD COLUMN IF NOT EXISTS bank_api_key          TEXT,
  ADD COLUMN IF NOT EXISTS crm_config            JSONB        DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tenant_cfg_tenant ON hub_tenant_configs(tenant_id);
`

async function migrate() {
  await connectDB()
  logger.info('Atualizando hub_tenant_configs...')
  try {
    await pool.query(SQL)
    logger.info('✅  hub_tenant_configs OK')
  } catch (err) {
    logger.error('❌  Erro:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
