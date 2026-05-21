/**
 * scripts/migrate_crm_fase3.js
 * Fase 3 do CRM/Funil: inteligência comercial, scoring, relatórios e previsão.
 * Rodar na API: node scripts/migrate_crm_fase3.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_stage_active ON crm_leads(tenant_id, stage_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_source ON crm_leads(tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_campaign ON crm_leads(tenant_id, campaign);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_responsible ON crm_leads(tenant_id, responsible_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_score ON crm_leads(tenant_id, score);
CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_created_at ON crm_leads(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_history_tenant_lead_created ON crm_lead_history(tenant_id, lead_id, created_at DESC);

WITH task_stats AS (
  SELECT lead_id,
         tenant_id,
         COUNT(*) FILTER (WHERE status='pendente')::int AS open_tasks,
         COUNT(*) FILTER (WHERE status='pendente' AND due_at IS NOT NULL AND due_at < NOW())::int AS overdue_tasks,
         COUNT(*) FILTER (WHERE status='concluida')::int AS completed_tasks
    FROM crm_lead_tasks
   GROUP BY lead_id, tenant_id
), computed AS (
  SELECT l.id,
         CASE
           WHEN COALESCE(s.is_won,false) THEN 100
           WHEN COALESCE(s.is_lost,false) THEN 0
           ELSE LEAST(100, GREATEST(0,
             15
             + CASE WHEN NULLIF(regexp_replace(COALESCE(l.phone,''),'\\D','','g'),'') IS NOT NULL THEN 15 ELSE 0 END
             + CASE WHEN NULLIF(l.email,'') IS NOT NULL THEN 10 ELSE 0 END
             + CASE WHEN NULLIF(l.empreendimento,'') IS NOT NULL THEN 10 ELSE 0 END
             + CASE WHEN NULLIF(l.campaign,'') IS NOT NULL THEN 5 ELSE 0 END
             + CASE WHEN COALESCE(l.estimated_value,0) > 0 THEN 10 ELSE 0 END
             + CASE WHEN l.source IN ('indicacao','whatsapp') THEN 15 WHEN l.source IN ('meta_ads','google_ads') THEN 12 WHEN l.source IN ('instagram','facebook','site','portal') THEN 8 ELSE 0 END
             + CASE WHEN l.next_follow_up_at IS NOT NULL AND l.next_follow_up_at >= NOW() THEN 10 ELSE 0 END
             + CASE WHEN COALESCE(ts.open_tasks,0) > 0 THEN 5 ELSE 0 END
             + CASE WHEN COALESCE(ts.completed_tasks,0) > 0 THEN 10 ELSE 0 END
             + CASE WHEN l.last_interaction_at IS NOT NULL AND l.last_interaction_at >= NOW() - INTERVAL '7 days' THEN 10 ELSE 0 END
             - CASE WHEN COALESCE(ts.overdue_tasks,0) > 0 THEN 20 ELSE 0 END
             - CASE WHEN l.last_interaction_at IS NULL OR l.last_interaction_at < NOW() - INTERVAL '14 days' THEN 15 ELSE 0 END
           ))::int
         END AS new_score
    FROM crm_leads l
    LEFT JOIN crm_funnel_stages s ON s.id = l.stage_id
    LEFT JOIN task_stats ts ON ts.lead_id = l.id AND ts.tenant_id = l.tenant_id
   WHERE l.is_active = true
)
UPDATE crm_leads l
   SET score = c.new_score,
       temperature = CASE WHEN c.new_score >= 80 THEN 'quente' WHEN c.new_score >= 50 THEN 'morno' ELSE 'frio' END,
       updated_at = NOW()
  FROM computed c
 WHERE l.id = c.id;
`

async function main() {
  await connectDB()
  await pool.query(SQL)
  logger.info('✅ Migration CRM Fase 3 executada com sucesso')
  await pool.end()
}

main().catch(err => {
  logger.error('❌ Erro na migration CRM Fase 3:', err)
  process.exit(1)
})
