/**
 * scripts/seed.js
 * Cria os tenants iniciais e usuários admin
 *
 * Rodar: node scripts/seed.js
 * ⚠️  Idempotente: usa INSERT ... ON CONFLICT DO NOTHING
 */

require('dotenv').config()
const bcrypt = require('bcryptjs')
const { pool, connectDB, query } = require('../src/config/database')
const logger = require('../src/config/logger')

// ─── Defina as senhas antes de rodar em produção! ─────────────────────────────
const SEEDS = {
  tenants: [
    {
      id:              'a1000000-0000-4000-8000-000000000001',
      slug:            'santa-clara',
      name:            'Residencial Santa Clara',
      hub_type:        'santa_clara',
      domain:          'hub.loteamentosantaclara.imb.br',
      plan:            'pro',
      primary_color:   '#B8860B',
      secondary_color: '#2D5016',
      sidebar_color:   '#1A2E0F',
      logo_text:       'Santa Clara HUB',
    },
    {
      id:              'b2000000-0000-4000-8000-000000000002',
      slug:            'larm',
      name:            'LARM Group',
      hub_type:        'larm',
      domain:          'hub.larmgroup.com.br',
      plan:            'enterprise',
      primary_color:   '#1B4332',
      secondary_color: '#1E3A5F',
      sidebar_color:   '#0D1B2A',
      logo_text:       'LARM HUB',
    },
  ],
  users: [
    {
      id:        'c1000000-0000-4000-8000-000000000001',
      tenant_id: 'a1000000-0000-4000-8000-000000000001',
      name:      'Fernando Monteiro',
      email:     'admin@santaclara.com.br',
      password:  'Troque@2024!',
      role:      'admin',
    },
    {
      id:        'c2000000-0000-4000-8000-000000000002',
      tenant_id: 'a1000000-0000-4000-8000-000000000001',
      name:      'Carlos Henrique',
      email:     'carlos@santaclara.com.br',
      password:  'Troque@2024!',
      role:      'broker',
    },
    {
      id:        'c3000000-0000-4000-8000-000000000003',
      tenant_id: 'b2000000-0000-4000-8000-000000000002',
      name:      'Admin LARM',
      email:     'admin@larmgroup.com.br',
      password:  'Troque@2024!',
      role:      'admin',
    },
  ],
}

async function seed() {
  await connectDB()
  logger.info('Iniciando seed...')

  try {
    // Tenants
    for (const t of SEEDS.tenants) {
      await query(
        `INSERT INTO hub_tenants (
          id, slug, name, hub_type, domain, plan,
          primary_color, secondary_color, sidebar_color, logo_text
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (slug) DO NOTHING`,
        [t.id, t.slug, t.name, t.hub_type, t.domain, t.plan,
         t.primary_color, t.secondary_color, t.sidebar_color, t.logo_text]
      )
      logger.info(`  Tenant: ${t.name} (${t.slug})`)
    }

    // Users
    for (const u of SEEDS.users) {
      const hash = await bcrypt.hash(u.password, 12)
      await query(
        `INSERT INTO hub_users (id, tenant_id, name, email, password_hash, role)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (email) DO NOTHING`,
        [u.id, u.tenant_id, u.name, u.email, hash, u.role]
      )
      logger.info(`  User: ${u.email} [${u.role}]`)
    }

    logger.info('✅  Seed concluído!')
    logger.info('  Credenciais de acesso inicial:')
    logger.info('  Santa Clara: admin@santaclara.com.br / Troque@2024!')
    logger.info('  LARM:        admin@larmgroup.com.br  / Troque@2024!')
    logger.info('  ⚠️  Mude as senhas após o primeiro login!')

  } catch (err) {
    logger.error('❌  Erro no seed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

seed()
