/**
 * scripts/migrate_profiles.js
 * → server/scripts/migrate_profiles.js  (arquivo novo)
 * Rodar: node scripts/migrate_profiles.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
-- Perfis de acesso por tenant
CREATE TABLE IF NOT EXISTS hub_profiles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  name        VARCHAR(80)  NOT NULL,
  description TEXT,
  color       VARCHAR(9)   DEFAULT '#2563EB',
  permissions JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP    DEFAULT NOW(),
  updated_at  TIMESTAMP    DEFAULT NOW()
);

-- Vínculo usuário ↔ perfil (many-to-many)
CREATE TABLE IF NOT EXISTS hub_user_profiles (
  user_id    UUID NOT NULL REFERENCES hub_users(id)    ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES hub_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant    ON hub_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON hub_user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_prof ON hub_user_profiles(profile_id);
`

async function migrate() {
  await connectDB()
  logger.info('Criando tabelas hub_profiles e hub_user_profiles...')
  try {
    await pool.query(SQL)
    logger.info('✅  Tabelas criadas com sucesso')
  } catch (err) {
    logger.error('❌  Erro:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
