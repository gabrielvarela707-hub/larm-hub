/**
 * scripts/migrate_crm_fase5.js
 * CRM/Funil — Fase 5 (v0.1.5): listas inteligentes, tipo de tarefa e ações em massa.
 *
 * Execute: node server/scripts/migrate_crm_fase5.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
-- Tipo de tarefa: ligação, SMS, e-mail, visita, geral, outro
ALTER TABLE crm_lead_tasks
  ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'geral'
    CHECK (type IN ('geral','ligacao','sms','email','visita','outro'));

-- Listas inteligentes (filtros salvos por tenant)
CREATE TABLE IF NOT EXISTS crm_smart_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  icon        VARCHAR(40)  NOT NULL DEFAULT 'filter',
  filters     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  position    SMALLINT     NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_smart_lists_tenant
  ON crm_smart_lists(tenant_id, position);

-- Índice para consultas de ações manuais (type + status + due_at)
CREATE INDEX IF NOT EXISTS idx_crm_tasks_type_status
  ON crm_lead_tasks(tenant_id, type, status, due_at);
`

async function migrate() {
  await connectDB()
  try {
    logger.info('Iniciando CRM Fase 5 (v0.1.5)...')
    await pool.query(SQL)
    logger.info('✅ CRM Fase 5 concluída — listas inteligentes e tipo de tarefa criados.')
  } catch (err) {
    logger.error('❌ Erro na migração CRM Fase 5: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
