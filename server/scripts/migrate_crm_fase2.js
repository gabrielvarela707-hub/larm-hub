/**
 * scripts/migrate_crm_fase2.js
 * Fase 2 do CRM/Funil: tarefas, follow-up, SLA e alertas comerciais.
 * Rodar: node server/scripts/migrate_crm_fase2.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crm_lead_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  due_at TIMESTAMP,
  priority VARCHAR(20) NOT NULL DEFAULT 'media',
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',
  responsible_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT crm_lead_tasks_priority_chk CHECK (priority IN ('baixa','media','alta','urgente')),
  CONSTRAINT crm_lead_tasks_status_chk CHECK (status IN ('pendente','concluida','cancelada'))
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_tenant_status_due ON crm_lead_tasks(tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON crm_lead_tasks(lead_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_responsible ON crm_lead_tasks(responsible_id, status, due_at);

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS last_contact_attempt_at TIMESTAMP;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_updated_at ON crm_lead_tasks;
CREATE TRIGGER trg_updated_at
BEFORE UPDATE ON crm_lead_tasks
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Cria uma tarefa inicial de retorno para leads que já tinham próximo retorno informado.
INSERT INTO crm_lead_tasks (tenant_id, lead_id, title, description, due_at, priority, status, responsible_id, created_by)
SELECT l.tenant_id,
       l.id,
       'Retornar contato',
       'Tarefa criada automaticamente a partir do próximo retorno do lead.',
       l.next_follow_up_at,
       CASE WHEN l.temperature = 'quente' THEN 'alta' ELSE 'media' END,
       'pendente',
       l.responsible_id,
       l.created_by
  FROM crm_leads l
 WHERE l.next_follow_up_at IS NOT NULL
   AND l.is_active = TRUE
   AND NOT EXISTS (
     SELECT 1
       FROM crm_lead_tasks t
      WHERE t.lead_id = l.id
        AND t.status = 'pendente'
        AND t.due_at = l.next_follow_up_at
        AND t.title = 'Retornar contato'
   );
`

async function main() {
  await connectDB()
  await pool.query(SQL)
  logger.info('✅ Migration CRM Fase 2 executada com sucesso')
  await pool.end()
}

main().catch(err => {
  logger.error('❌ Erro na migration CRM Fase 2:', err)
  process.exit(1)
})
