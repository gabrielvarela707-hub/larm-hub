/**
 * scripts/migrate_crm_fase4.js
 * CRM/Funil — Fase 4: campanhas, templates e comunicação via AWS SES/SNS.
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE hub_tenant_configs
  ADD COLUMN IF NOT EXISTS sns_region VARCHAR(80),
  ADD COLUMN IF NOT EXISTS sns_access_key_id TEXT,
  ADD COLUMN IF NOT EXISTS sns_secret_access_key TEXT,
  ADD COLUMN IF NOT EXISTS sns_default_sender_id VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sns_default_topic_arn TEXT;

CREATE TABLE IF NOT EXISTS crm_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
  subject VARCHAR(220),
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name, channel)
);

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed')),
  template_id UUID REFERENCES crm_message_templates(id) ON DELETE SET NULL,
  subject VARCHAR(220),
  body TEXT NOT NULL,
  target_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email','sms')),
  email VARCHAR(180),
  phone VARCHAR(40),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  error_message TEXT,
  provider_message_id TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaign_recipients_unique
  ON crm_campaign_recipients(campaign_id, lead_id, channel);

CREATE TABLE IF NOT EXISTS crm_communication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES crm_campaigns(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
  subject VARCHAR(220),
  body_preview TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'sent',
  provider VARCHAR(40),
  provider_message_id TEXT,
  error_message TEXT,
  sent_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_templates_tenant_channel ON crm_message_templates(tenant_id, channel, is_active);
CREATE INDEX IF NOT EXISTS idx_crm_campaigns_tenant_status ON crm_campaigns(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_campaign_recipients_campaign ON crm_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_communication_events_lead ON crm_communication_events(tenant_id, lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_leads_optout ON crm_leads(tenant_id, email_opt_out, sms_opt_out);
`

async function seedTemplates() {
  await pool.query(`
    INSERT INTO crm_message_templates (tenant_id, name, channel, subject, body, is_active)
    SELECT t.id, 'Follow-up de interesse', 'email',
           'Ainda tem interesse no {{empreendimento}}?',
           'Olá, {{nome}}! Tudo bem? Passando para saber se você ainda tem interesse no {{empreendimento}}. Posso te ajudar com valores, disponibilidade ou simulação?',
           true
      FROM hub_tenants t
    ON CONFLICT (tenant_id, name, channel) DO UPDATE SET
      subject = EXCLUDED.subject,
      body = EXCLUDED.body,
      is_active = true,
      updated_at = NOW();

    INSERT INTO crm_message_templates (tenant_id, name, channel, subject, body, is_active)
    SELECT t.id, 'Retorno rápido WhatsApp/SMS', 'sms',
           NULL,
           'Olá, {{nome}}! Aqui é da equipe Santa Clara. Podemos te ajudar com informações sobre {{empreendimento}}? Responda este contato para continuar.',
           true
      FROM hub_tenants t
    ON CONFLICT (tenant_id, name, channel) DO UPDATE SET
      body = EXCLUDED.body,
      is_active = true,
      updated_at = NOW();
  `)
}

async function migrate() {
  await connectDB()
  try {
    logger.info('Criando estrutura de campanhas CRM Fase 4...')
    await pool.query(SQL)
    await seedTemplates()
    logger.info('✅ CRM Fase 4 configurado com sucesso')
  } catch (err) {
    logger.error('❌ Erro ao migrar CRM Fase 4: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
