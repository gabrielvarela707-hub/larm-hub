/**
 * scripts/setup_all.js
 * → server/scripts/setup_all.js  (arquivo novo)
 *
 * Roda todas as migrations pendentes + seed de perfis em ordem.
 * Seguro rodar múltiplas vezes (idempotente).
 *
 * Usar: node scripts/setup_all.js
 */
require('dotenv').config()
const { v4: uuidv4 } = require('uuid')
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function run(sql, desc) {
  try {
    await pool.query(sql)
    logger.info(`  ✅  ${desc}`)
  } catch (err) {
    logger.error(`  ❌  ${desc}: ${err.message}`)
    throw err
  }
}

// ─── 1. hub_tenant_configs ────────────────────────────────────────────────────
async function migrateTenantConfig() {
  logger.info('\n[1/3] hub_tenant_configs...')
  await run(`
    CREATE TABLE IF NOT EXISTS hub_tenant_configs (
      tenant_id              UUID PRIMARY KEY REFERENCES hub_tenants(id) ON DELETE CASCADE,
      logo_url               TEXT,
      logo_text              VARCHAR(80)  DEFAULT 'LoteMobile',
      primary_color          VARCHAR(9)   DEFAULT '#2563EB',
      sidebar_color          VARCHAR(9)   DEFAULT '#0D1B2A',
      google_maps_key        TEXT,
      ses_region             VARCHAR(30)  DEFAULT 'us-east-1',
      ses_access_key_id      TEXT,
      ses_secret_access_key  TEXT,
      ses_from_email         VARCHAR(150),
      ses_from_name          VARCHAR(100),
      sns_region             VARCHAR(30)  DEFAULT 'sa-east-1',
      sns_access_key_id      TEXT,
      sns_secret_access_key  TEXT,
      sns_sender_id          VARCHAR(40)  DEFAULT 'LOTEAMENTO',
      sns_sms_type           VARCHAR(20)  DEFAULT 'Transactional',
      sns_mock_mode          BOOLEAN      DEFAULT TRUE,
      whatsapp_token         TEXT,
      whatsapp_phone_id      VARCHAR(60),
      whatsapp_business_id   VARCHAR(60),
      clicksign_key          TEXT,
      bank_name              VARCHAR(80),
      bank_api_key           TEXT,
      crm_config             JSONB        DEFAULT '{}',
      created_at             TIMESTAMP    DEFAULT NOW(),
      updated_at             TIMESTAMP    DEFAULT NOW()
    )
  `, 'CREATE TABLE hub_tenant_configs')

  // Adiciona colunas que podem estar faltando em instâncias antigas
  const cols = [
    ['logo_url',              'TEXT'],
    ['logo_text',             "VARCHAR(80) DEFAULT 'LoteMobile'"],
    ['ses_region',            "VARCHAR(30) DEFAULT 'us-east-1'"],
    ['ses_access_key_id',     'TEXT'],
    ['ses_secret_access_key', 'TEXT'],
    ['ses_from_email',        'VARCHAR(150)'],
    ['ses_from_name',         'VARCHAR(100)'],
    ['sns_region',            "VARCHAR(30) DEFAULT 'sa-east-1'"],
    ['sns_access_key_id',     'TEXT'],
    ['sns_secret_access_key', 'TEXT'],
    ['sns_sender_id',         "VARCHAR(40) DEFAULT 'LOTEAMENTO'"],
    ['sns_sms_type',          "VARCHAR(20) DEFAULT 'Transactional'"],
    ['sns_mock_mode',         'BOOLEAN DEFAULT TRUE'],
    ['google_maps_key',       'TEXT'],
    ['whatsapp_token',        'TEXT'],
    ['whatsapp_phone_id',     'VARCHAR(60)'],
    ['whatsapp_business_id',  'VARCHAR(60)'],
    ['clicksign_key',         'TEXT'],
    ['bank_name',             'VARCHAR(80)'],
    ['bank_api_key',          'TEXT'],
    ['crm_config',            "JSONB DEFAULT '{}'"],
  ]
  for (const [col, type] of cols) {
    await pool.query(`ALTER TABLE hub_tenant_configs ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }
  logger.info('  ✅  Colunas verificadas')
}

// ─── 2. hub_profiles + hub_user_profiles ─────────────────────────────────────
async function migrateProfiles() {
  logger.info('\n[2/3] hub_profiles e hub_user_profiles...')
  await run(`
    CREATE TABLE IF NOT EXISTS hub_profiles (
      id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   UUID         NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
      name        VARCHAR(80)  NOT NULL,
      description TEXT,
      color       VARCHAR(9)   DEFAULT '#2563EB',
      permissions JSONB        NOT NULL DEFAULT '{}',
      created_at  TIMESTAMP    DEFAULT NOW(),
      updated_at  TIMESTAMP    DEFAULT NOW()
    )
  `, 'CREATE TABLE hub_profiles')

  await run(`
    CREATE TABLE IF NOT EXISTS hub_user_profiles (
      user_id    UUID NOT NULL REFERENCES hub_users(id)    ON DELETE CASCADE,
      profile_id UUID NOT NULL REFERENCES hub_profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (user_id, profile_id)
    )
  `, 'CREATE TABLE hub_user_profiles')

  await pool.query('CREATE INDEX IF NOT EXISTS idx_profiles_tenant    ON hub_profiles(tenant_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON hub_user_profiles(user_id)')
  await pool.query('CREATE INDEX IF NOT EXISTS idx_user_profiles_prof ON hub_user_profiles(profile_id)')
  logger.info('  ✅  Índices verificados')
}

// ─── 3. Seed de perfis padrão ─────────────────────────────────────────────────
const ALL_MODS = [
  'dashboard','empreendimentos','mapa',
  'crm','simulador','contratos','landing',
  'fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped',
  'obras','relatorios','controladoria','ia',
  'configuracoes','usuarios',
]

function perms(readable = [], writable = []) {
  return Object.fromEntries(ALL_MODS.map(id => [id, {
    read:  readable.includes('*') || readable.includes(id),
    write: writable.includes('*') || writable.includes(id),
  }]))
}

const DEFAULT_PROFILES = [
  { name: 'Administrador',  description: 'Acesso total ao sistema',                          color: '#1D4ED8',
    permissions: perms(['*'], ['*']) },
  { name: 'Gerente',        description: 'Acesso completo exceto configurações do sistema',   color: '#7C3AED',
    permissions: perms(['*'], ALL_MODS.filter(m => !['configuracoes','usuarios','fin_sped'].includes(m))) },
  { name: 'Corretor',       description: 'CRM, simulador, contratos e mapa',                 color: '#059669',
    permissions: perms(
      ['dashboard','empreendimentos','mapa','crm','simulador','contratos','landing'],
      ['crm','simulador','landing']
    ) },
  { name: 'Financeiro',     description: 'Módulos financeiros — contas, boletos e relatórios', color: '#EA580C',
    permissions: perms(
      ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_split','relatorios','contratos'],
      ['fin_receber','fin_pagar','fin_boletos','fin_split']
    ) },
  { name: 'Controladoria',  description: 'Financeiro completo com SPED, DIMOB e controladoria', color: '#B45309',
    permissions: perms(
      ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped','relatorios','controladoria','contratos'],
      ['fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped','controladoria']
    ) },
  { name: 'Contador',       description: 'Leitura financeira — relatórios e obrigações fiscais', color: '#0891B2',
    permissions: perms(
      ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_sped','relatorios','contratos'], []
    ) },
  { name: 'Assistente',     description: 'Suporte operacional — leitura geral',              color: '#6D28D9',
    permissions: perms(['dashboard','empreendimentos','mapa','crm','simulador','relatorios'], ['crm']) },
  { name: 'Consultor',      description: 'Acesso externo para análise e simulações',         color: '#DB2777',
    permissions: perms(['dashboard','empreendimentos','mapa','simulador'], []) },
  { name: 'Cliente',        description: 'Acesso do cliente ao próprio contrato e mapa',     color: '#374151',
    permissions: perms(['dashboard','contratos','mapa'], []) },
  { name: 'Fornecedor',     description: 'Acesso restrito para fornecedores externos',       color: '#78716C',
    permissions: perms(['dashboard','obras'], []) },
]

async function seedProfiles() {
  logger.info('\n[3/3] Seed de perfis...')
  const { rows: tenants } = await pool.query('SELECT id, name FROM hub_tenants')
  let created = 0, skipped = 0

  for (const tenant of tenants) {
    for (const p of DEFAULT_PROFILES) {
      const { rows: ex } = await pool.query(
        'SELECT id FROM hub_profiles WHERE tenant_id=$1 AND name=$2',
        [tenant.id, p.name]
      )
      if (ex.length) { skipped++; continue }
      await pool.query(
        'INSERT INTO hub_profiles (id,tenant_id,name,description,color,permissions) VALUES ($1,$2,$3,$4,$5,$6)',
        [uuidv4(), tenant.id, p.name, p.description, p.color, JSON.stringify(p.permissions)]
      )
      logger.info(`  ✅  [${tenant.name}] ${p.name}`)
      created++
    }
  }
  logger.info(`  📊  ${created} criados, ${skipped} já existiam`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await connectDB()
  logger.info('🚀  Iniciando setup completo...')
  try {
    await migrateTenantConfig()
    await migrateProfiles()
    await seedProfiles()
    logger.info('\n✅  Setup concluído com sucesso!')
  } catch (err) {
    logger.error('\n❌  Falha no setup:')
    logger.error(err.stack || err.message || String(err))
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
