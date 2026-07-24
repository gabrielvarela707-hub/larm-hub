/**
 * scripts/migrate_invites.js
 * Cria tabela de convites e adiciona colunas de suporte a hub_users
 * Rodar: node scripts/migrate_invites.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `

-- ─── Convites ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hub_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  invited_by      UUID NOT NULL REFERENCES hub_users(id)   ON DELETE CASCADE,

  -- Dados do convidado
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(150) NOT NULL,
  role            VARCHAR(30)  NOT NULL DEFAULT 'broker',

  -- Opções do convite
  auto_activate   BOOLEAN  DEFAULT TRUE,   -- ativa conta sem precisar confirmar e-mail
  temp_password   TEXT,                    -- hash da senha temporária (se gerada)
  custom_message  TEXT,                    -- mensagem personalizada (null = mensagem padrão)

  -- Controle de estado
  token           VARCHAR(64)  UNIQUE NOT NULL,  -- token seguro para a URL de aceite
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  -- 'pending' | 'accepted' | 'expired' | 'cancelled'

  expires_at      TIMESTAMP    NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at     TIMESTAMP,
  user_id         UUID REFERENCES hub_users(id) ON DELETE SET NULL, -- preenchido ao aceitar

  created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_tenant  ON hub_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_token   ON hub_invites(token);
CREATE INDEX IF NOT EXISTS idx_inv_email   ON hub_invites(email);
CREATE INDEX IF NOT EXISTS idx_inv_status  ON hub_invites(status);

-- ─── Colunas extras em hub_users ──────────────────────────────────────────────
ALTER TABLE hub_users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
  -- Força troca de senha no primeiro login (quando criado com senha temp)
  ADD COLUMN IF NOT EXISTS invited_by           UUID REFERENCES hub_users(id),
  ADD COLUMN IF NOT EXISTS invited_at           TIMESTAMP;

`

async function migrate() {
  await connectDB()
  logger.info('Criando tabela de convites...')
  try {
    await pool.query(SQL)
    logger.info('✅  Tabelas criadas / atualizadas:')
    logger.info('   - hub_invites')
    logger.info('   - hub_users  (must_change_password, invited_by, invited_at)')
  } catch (err) {
    logger.error('❌  Erro:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
