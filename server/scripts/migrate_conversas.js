/**
 * scripts/migrate_conversas.js
 * v0.1.6 — Módulo Conversas: inbox por lead, SLA config e estatísticas.
 *
 * Execute: node server/scripts/migrate_conversas.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
-- Ampliar canais aceitos em crm_communication_events (ligacao + nota)
ALTER TABLE crm_communication_events
  DROP CONSTRAINT IF EXISTS crm_communication_events_channel_check;

ALTER TABLE crm_communication_events
  ADD CONSTRAINT crm_communication_events_channel_check
    CHECK (channel IN ('email','sms','whatsapp','ligacao','nota'));

-- Metadata de conversa por lead (starred, unread, SLA, last event)
CREATE TABLE IF NOT EXISTS crm_conversations (
  id                       UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID      NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  lead_id                  UUID      NOT NULL REFERENCES crm_leads(id)   ON DELETE CASCADE,
  is_starred               BOOLEAN   NOT NULL DEFAULT false,
  is_unread                BOOLEAN   NOT NULL DEFAULT false,
  last_event_at            TIMESTAMP,
  last_event_preview       TEXT,
  first_response_at        TIMESTAMP,
  resolved_at              TIMESTAMP,
  sla_first_response_due   TIMESTAMP,
  sla_resolution_due       TIMESTAMP,
  sla_first_response_met   BOOLEAN,
  sla_resolution_met       BOOLEAN,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_conversations_tenant
  ON crm_conversations(tenant_id, is_unread, last_event_at DESC);

-- Configuração de SLA por tenant
CREATE TABLE IF NOT EXISTS crm_sla_configs (
  id                       UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID      NOT NULL UNIQUE REFERENCES hub_tenants(id) ON DELETE CASCADE,
  is_active                BOOLEAN   NOT NULL DEFAULT false,
  first_response_minutes   INT       NOT NULL DEFAULT 60,
  resolution_minutes       INT       NOT NULL DEFAULT 480,
  created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
);
`

async function migrate() {
  await connectDB()
  try {
    logger.info('Iniciando migração Conversas (v0.1.6)...')
    await pool.query(SQL)
    logger.info('✅ Conversas v0.1.6 — tabelas criadas com sucesso.')
  } catch (err) {
    logger.error('❌ Erro na migração Conversas: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
