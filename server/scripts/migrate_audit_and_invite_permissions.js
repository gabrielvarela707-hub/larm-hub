/**
 * scripts/migrate_audit_and_invite_permissions.js
 * Logs completos + retenção + matriz de permissões de convite.
 * Rodar: node scripts/migrate_audit_and_invite_permissions.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hub_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES hub_users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  module VARCHAR(80) DEFAULT 'sistema',
  entity_type VARCHAR(120),
  entity_id VARCHAR(120),
  target_user_id UUID NULL REFERENCES hub_users(id) ON DELETE SET NULL,
  ip INET,
  user_agent TEXT,
  details JSONB DEFAULT '{}',
  meta JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID NULL REFERENCES hub_tenants(id) ON DELETE CASCADE;
ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS module VARCHAR(80) DEFAULT 'sistema';
ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(120);
ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS entity_id VARCHAR(120);
ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS target_user_id UUID NULL REFERENCES hub_users(id) ON DELETE SET NULL;
ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE hub_audit_logs ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

UPDATE hub_audit_logs SET details = COALESCE(details, meta, '{}'::jsonb);
UPDATE hub_audit_logs SET module = COALESCE(module, 'sistema');

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON hub_audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON hub_audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user ON hub_audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON hub_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON hub_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON hub_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS hub_audit_settings (
  tenant_id UUID PRIMARY KEY REFERENCES hub_tenants(id) ON DELETE CASCADE,
  retention_days INTEGER NOT NULL DEFAULT 30,
  updated_by UUID NULL REFERENCES hub_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO hub_audit_settings (tenant_id, retention_days)
SELECT id, 30 FROM hub_tenants
ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hub_invite_permissions (
  tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  inviter_role VARCHAR(40) NOT NULL,
  allowed_role VARCHAR(40) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (tenant_id, inviter_role, allowed_role)
);

CREATE INDEX IF NOT EXISTS idx_invite_permissions_tenant_role ON hub_invite_permissions(tenant_id, inviter_role);
`

const DEFAULT_MATRIX = {
  admin: ['admin', 'manager', 'controller', 'financial', 'marketing', 'accountant', 'broker', 'consultant', 'assistant', 'supplier', 'client', 'viewer'],
  manager: ['controller', 'financial', 'marketing', 'accountant', 'broker', 'consultant', 'assistant', 'supplier', 'client', 'viewer'],
  controller: ['financial', 'accountant', 'supplier', 'client', 'viewer'],
  financial: ['accountant', 'supplier', 'client', 'viewer'],
  marketing: ['marketing', 'broker', 'supplier', 'client'],
  accountant: ['supplier', 'client', 'viewer'],
  broker: ['client'],
  consultant: ['client'],
  assistant: ['client'],
  supplier: [],
  client: [],
  viewer: [],
}

async function seedDefaults() {
  const { rows: tenants } = await pool.query('SELECT id FROM hub_tenants')
  for (const tenant of tenants) {
    for (const [inviterRole, allowedRoles] of Object.entries(DEFAULT_MATRIX)) {
      for (const allowedRole of allowedRoles) {
        await pool.query(
          `INSERT INTO hub_invite_permissions (tenant_id, inviter_role, allowed_role)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [tenant.id, inviterRole, allowedRole]
        )
      }
    }
  }
}

async function migrate() {
  await connectDB()
  try {
    logger.info('Criando estrutura de logs e permissões de convite...')
    await pool.query(SQL)
    await seedDefaults()
    logger.info('✅  Logs, retenção e permissões de convite configurados')
  } catch (err) {
    logger.error('❌  ' + err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
