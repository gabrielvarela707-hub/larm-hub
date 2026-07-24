/**
 * server/scripts/migrate_user_portal_access.js
 * Adiciona controle de acesso por portal/hub para usuários e convites.
 */

require('dotenv').config()
const { query } = require('../src/config/database')
const logger = require('../src/config/logger')

async function main() {
  logger.info('🔧 Migrando acesso por portal dos usuários...')

  await query(`
    ALTER TABLE hub_users
      ADD COLUMN IF NOT EXISTS allowed_hubs TEXT[] NOT NULL DEFAULT ARRAY['santa_clara','larm']::text[];
  `)

  await query(`
    ALTER TABLE hub_invites
      ADD COLUMN IF NOT EXISTS allowed_hubs TEXT[] NOT NULL DEFAULT ARRAY['santa_clara','larm']::text[];
  `)

  await query(`
    UPDATE hub_users
       SET allowed_hubs = ARRAY['santa_clara','larm']::text[]
     WHERE allowed_hubs IS NULL OR cardinality(allowed_hubs) = 0;
  `)

  await query(`
    UPDATE hub_invites
       SET allowed_hubs = ARRAY['santa_clara','larm']::text[]
     WHERE allowed_hubs IS NULL OR cardinality(allowed_hubs) = 0;
  `)

  await query(`CREATE INDEX IF NOT EXISTS idx_hub_users_allowed_hubs ON hub_users USING GIN (allowed_hubs);`)
  await query(`CREATE INDEX IF NOT EXISTS idx_hub_invites_allowed_hubs ON hub_invites USING GIN (allowed_hubs);`)

  logger.info('✅ Acesso por portal migrado com sucesso')
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('❌ Erro na migration de acesso por portal:', err)
    process.exit(1)
  })
