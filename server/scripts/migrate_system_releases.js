/**
 * scripts/migrate_system_releases.js
 * Cria/atualiza o versionamento/changelog do sistema.
 *
 * Importante:
 * - Insere/atualiza todas as versões como is_current=false.
 * - Depois marca somente a última versão do seed como atual.
 * - Evita erro da constraint idx_system_releases_current_unique.
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')
const { SYSTEM_RELEASES } = require('../data/system_releases_seed')

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS hub_system_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(30) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  frontend_version VARCHAR(30),
  backend_version VARCHAR(30),
  released_at TIMESTAMP NOT NULL DEFAULT NOW(),
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  architecture JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_releases_released_at ON hub_system_releases(released_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_releases_current_unique ON hub_system_releases(is_current) WHERE is_current = true;
`

async function seedReleases() {
  const current = SYSTEM_RELEASES[SYSTEM_RELEASES.length - 1]

  await pool.query('BEGIN')

  try {
    for (const release of SYSTEM_RELEASES) {
      await pool.query(
        `INSERT INTO hub_system_releases
          (version, title, description, frontend_version, backend_version, released_at, changes, architecture, is_current, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,false,NOW())
         ON CONFLICT (version) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          frontend_version = EXCLUDED.frontend_version,
          backend_version = EXCLUDED.backend_version,
          released_at = EXCLUDED.released_at,
          changes = EXCLUDED.changes,
          architecture = EXCLUDED.architecture,
          is_current = false,
          updated_at = NOW()`,
        [
          release.version,
          release.title,
          release.description,
          release.frontend_version,
          release.backend_version,
          release.released_at,
          JSON.stringify(release.changes || []),
          JSON.stringify(release.architecture || {}),
        ]
      )
    }

    if (current?.version) {
      await pool.query(
        `UPDATE hub_system_releases
            SET is_current = false,
                updated_at = NOW()
          WHERE is_current = true`
      )

      await pool.query(
        `UPDATE hub_system_releases
            SET is_current = true,
                updated_at = NOW()
          WHERE version = $1`,
        [current.version]
      )
    }

    await pool.query('COMMIT')
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }
}

async function migrate() {
  await connectDB()

  try {
    logger.info('Criando estrutura de versionamento do sistema...')
    await pool.query(SQL)
    await seedReleases()
    logger.info('✅ Versionamento/changelog configurado com sucesso')
  } catch (err) {
    logger.error('❌ Erro ao migrar versionamento do sistema: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
