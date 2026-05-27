/**
 * scripts/migrate_crm_fase1.js
 * Fase 1 do CRM/Funil: etapas configuráveis, leads, histórico e motivos de perda.
 * Rodar: node server/scripts/migrate_crm_fase1.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS crm_funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT '#2563EB',
  position INTEGER NOT NULL DEFAULT 0,
  max_days INTEGER NOT NULL DEFAULT 3,
  default_responsible_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_crm_stages_tenant ON crm_funnel_stages(tenant_id, is_active, position);

CREATE TABLE IF NOT EXISTS crm_loss_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_loss_reasons_tenant ON crm_loss_reasons(tenant_id, is_active, position);

CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES crm_funnel_stages(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  loss_reason_id UUID REFERENCES crm_loss_reasons(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(40),
  email VARCHAR(160),
  source VARCHAR(80) DEFAULT 'outros',
  campaign VARCHAR(160),
  empreendimento VARCHAR(160),
  estimated_value NUMERIC(14,2) DEFAULT 0,
  temperature VARCHAR(20) DEFAULT 'morno',
  score INTEGER DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_interaction_at TIMESTAMP,
  next_follow_up_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_tenant_stage ON crm_leads(tenant_id, stage_id, is_active);
CREATE INDEX IF NOT EXISTS idx_crm_leads_responsible ON crm_leads(responsible_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_search ON crm_leads USING gin (to_tsvector('portuguese', coalesce(name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email,'') || ' ' || coalesce(notes,'')));

CREATE TABLE IF NOT EXISTS crm_lead_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  from_stage_id UUID REFERENCES crm_funnel_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES crm_funnel_stages(id) ON DELETE SET NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_history_lead ON crm_lead_history(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_history_tenant ON crm_lead_history(tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['crm_funnel_stages','crm_loss_reasons','crm_leads'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();', tbl, tbl
    );
  END LOOP;
END $$;

WITH defaults(code, name, color, position, max_days, is_won, is_lost) AS (
  VALUES
    ('novo', 'Novo lead', '#64748B', 10, 1, FALSE, FALSE),
    ('em_atendimento', 'Em atendimento', '#2563EB', 20, 2, FALSE, FALSE),
    ('qualificacao', 'Qualificação', '#7C3AED', 30, 3, FALSE, FALSE),
    ('visita_agendada', 'Visita agendada', '#F59E0B', 40, 2, FALSE, FALSE),
    ('proposta_enviada', 'Proposta enviada', '#EA580C', 50, 3, FALSE, FALSE),
    ('negociacao', 'Negociação', '#4F46E5', 60, 5, FALSE, FALSE),
    ('contrato_enviado', 'Contrato enviado', '#0F766E', 70, 3, FALSE, FALSE),
    ('vendido', 'Vendido', '#059669', 80, 0, TRUE, FALSE),
    ('perdido', 'Perdido', '#DC2626', 90, 0, FALSE, TRUE)
)
INSERT INTO crm_funnel_stages (tenant_id, code, name, color, position, max_days, is_won, is_lost)
SELECT t.id, d.code, d.name, d.color, d.position, d.max_days, d.is_won, d.is_lost
  FROM hub_tenants t
 CROSS JOIN defaults d
ON CONFLICT (tenant_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  color = EXCLUDED.color,
  position = EXCLUDED.position,
  max_days = EXCLUDED.max_days,
  is_won = EXCLUDED.is_won,
  is_lost = EXCLUDED.is_lost,
  is_active = TRUE;

WITH reasons(name, position) AS (
  VALUES
    ('Preço alto', 10),
    ('Sem interesse', 20),
    ('Comprou com concorrente', 30),
    ('Sem crédito', 40),
    ('Não respondeu', 50),
    ('Localização não agradou', 60),
    ('Documentação reprovada', 70),
    ('Outro', 80)
)
INSERT INTO crm_loss_reasons (tenant_id, name, position)
SELECT t.id, r.name, r.position
  FROM hub_tenants t
 CROSS JOIN reasons r
ON CONFLICT (tenant_id, name) DO UPDATE SET
  position = EXCLUDED.position,
  is_active = TRUE;
`

async function main() {
  await connectDB()
  await pool.query(SQL)
  logger.info('✅ Migration CRM Fase 1 executada com sucesso')
  await pool.end()
}

main().catch(err => {
  logger.error('❌ Erro na migration CRM Fase 1:', err)
  process.exit(1)
})
