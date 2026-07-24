/**
 * scripts/migrate_invite_profiles.js
 * → server/scripts/migrate_invite_profiles.js  (novo)
 * Adiciona coluna profile_ids à tabela hub_invites
 * Rodar: node scripts/migrate_invite_profiles.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  try {
    await pool.query(`ALTER TABLE hub_invites ADD COLUMN IF NOT EXISTS profile_ids JSONB DEFAULT '[]'`)
    logger.info('✅  coluna profile_ids adicionada em hub_invites')
  } catch (err) {
    logger.error('❌  ' + err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
