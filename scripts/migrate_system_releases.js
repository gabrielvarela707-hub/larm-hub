/**
 * scripts/migrate_system_releases.js
 * Cria/atualiza o versionamento/changelog do sistema.
 *
 * Fonte canônica:
 * - src/data/system_releases_seed.js
 *
 * Compatibilidade:
 * - data/system_releases_seed.js permanece sincronizado, mas não é mais a
 *   fonte principal da migration.
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')
const { SYSTEM_RELEASES } = require('../src/data/system_releases_seed')

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

function parseVersion(value) {
  return String(value || '')
    .split('.')
    .map(part => Number(part) || 0)
}

function compareVersions(a, b) {
  const av = parseVersion(a.version)
  const bv = parseVersion(b.version)

  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const diff = (av[i] || 0) - (bv[i] || 0)
    if (diff !== 0) return diff
  }

  return 0
}

function validateReleases() {
  if (!Array.isArray(SYSTEM_RELEASES) || SYSTEM_RELEASES.length === 0) {
    throw new Error('O seed de changelog está vazio ou inválido.')
  }

  const seen = new Set()
  const duplicates = []

  for (const release of SYSTEM_RELEASES) {
    if (!release?.version || !release?.title || !release?.released_at) {
      throw new Error(`Release inválida no seed: ${JSON.stringify(release)}`)
    }

    if (seen.has(release.version)) duplicates.push(release.version)
    seen.add(release.version)
  }

  if (duplicates.length > 0) {
    throw new Error(`Versões duplicadas no seed: ${[...new Set(duplicates)].join(', ')}`)
  }
}

async function seedReleases() {
  validateReleases()

  const current = [...SYSTEM_RELEASES].sort(compareVersions).at(-1)

  logger.info(
    `Changelog: ${SYSTEM_RELEASES.length} versões carregadas de src/data/system_releases_seed.js; atual=${current.version}`
  )

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

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total,
              MAX(version) FILTER (WHERE is_current = true) AS current_version
         FROM hub_system_releases`
    )

    await pool.query('COMMIT')

    logger.info(
      `Changelog aplicado: ${rows[0]?.total || 0} versões no banco; atual=${rows[0]?.current_version || current.version}`
    )
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  }
}

async function migrate() {
  await connectDB()

  try {
    logger.info('Criando/atualizando o versionamento do sistema...')
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
