/**
 * server/src/routes/system.js
 * Informações básicas de arquitetura, versão e changelog.
 */

const express = require('express')
const path = require('path')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

const FALLBACK_VERSION = '0.0.1'

function safeRequirePackage(paths) {
  for (const p of paths) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(p)
    } catch (_) {}
  }
  return null
}

function cleanVersion(value, fallback = FALLBACK_VERSION) {
  if (!value || typeof value !== 'string') return fallback
  return value.replace(/^\^|~/, '')
}

function baseSystemInfo(currentRelease, releases) {
  const backendPkg = safeRequirePackage([
    path.resolve(__dirname, '../../package.json'),
    path.resolve(process.cwd(), 'package.json'),
  ])
  const frontendPkg = safeRequirePackage([
    path.resolve(__dirname, '../../../package.json'),
    path.resolve(process.cwd(), '../package.json'),
  ])

  const frontendDeps = frontendPkg?.dependencies || {}
  const backendDeps = backendPkg?.dependencies || {}

  const version = currentRelease?.version || FALLBACK_VERSION

  return {
    version,
    released_at: currentRelease?.released_at || null,
    frontend: {
      name: frontendPkg?.name || 'lotemobile-web',
      version: cleanVersion(frontendPkg?.version, version),
      framework: `Next.js ${cleanVersion(frontendDeps.next || '', '')}`.trim(),
      language: 'TypeScript / React',
      ui: ['TailwindCSS', 'Lucide React', 'Recharts', 'Zustand'],
    },
    backend: {
      name: backendPkg?.name || 'lotemobile-api',
      version: cleanVersion(backendPkg?.version, version),
      runtime: backendPkg?.engines?.node || 'Node.js >=18',
      framework: `Express ${cleanVersion(backendDeps.express || '', '')}`.trim(),
      auth: 'JWT + refresh token + permissões por perfil',
      email: 'AWS SES',
    },
    database: {
      engine: 'PostgreSQL',
      main_tables: [
        'hub_users',
        'hub_profiles',
        'hub_invites',
        'hub_audit_logs',
        'hub_system_releases',
        'fin_plano_contas',
        'fin_bancos_contas',
        'fin_contas_pagar',
      ],
    },
    infrastructure: {
      deploy: 'Next.js/Vercel no front-end e Node.js/PM2 no backend',
      proxy: 'Apache/Nginx com HTTPS na API',
      storage: 'PostgreSQL para dados administrativos e operacionais',
    },
    current_release: currentRelease || null,
    releases: releases || [],
  }
}

router.get('/system/about', async (_req, res) => {
  try {
    const { rows: releases } = await query(
      `SELECT id, version, title, description, frontend_version, backend_version,
              released_at, changes, architecture, is_current
         FROM hub_system_releases
        ORDER BY released_at DESC, created_at DESC
        LIMIT 20`
    )

    const current = releases.find(r => r.is_current) || releases[0] || null
    return res.json({ ok: true, data: baseSystemInfo(current, releases) })
  } catch (err) {
    // Caso a migration ainda não tenha sido rodada, mantém a tela funcional.
    if (err.code === '42P01') {
      const release = {
        version: FALLBACK_VERSION,
        title: 'Base de versionamento e arquitetura',
        description: 'Migration de changelog ainda não executada.',
        frontend_version: FALLBACK_VERSION,
        backend_version: FALLBACK_VERSION,
        released_at: new Date().toISOString(),
        changes: [
          'A aba Sobre sistema está disponível.',
          'Rode a migration de versionamento para persistir o changelog no banco.',
        ],
        is_current: true,
      }
      return res.json({ ok: true, data: baseSystemInfo(release, [release]) })
    }
    throw err
  }
})

module.exports = router
