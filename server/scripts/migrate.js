/**
 * scripts/migrate.js
 * Cria as tabelas do HUB no PostgreSQL (sem tocar nas tabelas do Strato)
 * 
 * Rodar: node scripts/migrate.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANTS (Santa Clara HUB, LARM HUB, futuros white-labels)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          VARCHAR(60)  UNIQUE NOT NULL,
  name          VARCHAR(120) NOT NULL,
  hub_type      VARCHAR(30)  NOT NULL DEFAULT 'santa_clara',
    -- Valores: 'santa_clara' | 'larm' | 'generic'
  domain        VARCHAR(120),
  plan          VARCHAR(20)  NOT NULL DEFAULT 'starter',
    -- Valores: 'starter' | 'pro' | 'premium' | 'enterprise'

  -- Tema / White-label
  primary_color   VARCHAR(10)  DEFAULT '#2563EB',
  secondary_color VARCHAR(10)  DEFAULT '#059669',
  sidebar_color   VARCHAR(10)  DEFAULT '#0D1B2A',
  logo_url        TEXT,
  logo_text       VARCHAR(80)  DEFAULT 'LoteMobile',
  favicon_url     TEXT,

  -- Integrações (armazenadas criptografadas no futuro)
  google_maps_key   TEXT,
  whatsapp_token    TEXT,
  whatsapp_phone_id TEXT,
  clicksign_key     TEXT,

  is_active   BOOLEAN   DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS do HUB (corretores, admins, clientes, LARM)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(30)  NOT NULL DEFAULT 'broker',
    -- Valores: 'super_admin' | 'admin' | 'manager' | 'broker' | 'client' | 'accountant'
  phone         VARCHAR(20),
  avatar_url    TEXT,

  -- Vínculo opcional com pessoa do Strato (tb2_pess)
  strato_pessoa_id INTEGER,

  is_active     BOOLEAN   DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hub_users_email     ON hub_users(email);
CREATE INDEX IF NOT EXISTS idx_hub_users_tenant_id ON hub_users(tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES hub_users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  ip          INET,
  user_agent  TEXT,
  expires_at  TIMESTAMP NOT NULL,
  revoked     BOOLEAN   DEFAULT FALSE,
  revoked_at  TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token   ON hub_refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON hub_refresh_tokens(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  action      VARCHAR(60) NOT NULL,
  ip          INET,
  user_agent  TEXT,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id   ON hub_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action    ON hub_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON hub_audit_logs(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIGURAÇÕES DO TENANT (chave-valor flexível)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_tenant_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  key         VARCHAR(100) NOT NULL,
  value       TEXT,
  is_secret   BOOLEAN DEFAULT FALSE,
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: updated_at automático
-- ─────────────────────────────────────────────────────────────────────────────
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
  FOREACH tbl IN ARRAY ARRAY['hub_tenants','hub_users'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at ON %I;
       CREATE TRIGGER trg_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      tbl, tbl
    );
  END LOOP;
END $$;

`

async function migrate() {
  await connectDB()
  logger.info('Iniciando migração das tabelas HUB...')
  try {
    await pool.query(SQL)
    logger.info('✅  Migração concluída! Tabelas criadas:')
    logger.info('   - hub_tenants')
    logger.info('   - hub_users')
    logger.info('   - hub_refresh_tokens')
    logger.info('   - hub_audit_logs')
    logger.info('   - hub_tenant_settings')
  } catch (err) {
    logger.error('❌  Erro na migração:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
