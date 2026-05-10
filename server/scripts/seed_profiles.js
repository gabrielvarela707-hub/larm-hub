/**
 * scripts/seed_profiles.js
 * → server/scripts/seed_profiles.js  (arquivo novo)
 *
 * Popula os perfis padrão para todos os tenants existentes.
 * Idempotente — ignora perfis que já existem (mesmo nome + tenant).
 * Rodar: node scripts/seed_profiles.js
 */
require('dotenv').config()
const { v4: uuidv4 } = require('uuid')
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

// ─── Definição dos módulos (mesma lista do frontend) ──────────────────────────
const ALL_MODS = [
  'dashboard','empreendimentos','mapa',
  'crm','simulador','contratos','landing',
  'fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped',
  'obras','relatorios','controladoria','ia',
  'configuracoes','usuarios',
]

function perms(readable = [], writable = []) {
  return Object.fromEntries(ALL_MODS.map(id => ({
    [id]: {
      read:  readable.includes('*') || readable.includes(id),
      write: writable.includes('*') || writable.includes(id),
    }
  })).map(o => Object.entries(o)[0]))
}

// ─── Perfis padrão ────────────────────────────────────────────────────────────
const DEFAULT_PROFILES = [
  {
    name: 'Administrador',
    description: 'Acesso total ao sistema',
    color: '#1D4ED8',
    permissions: perms(['*'], ['*']),
  },
  {
    name: 'Gerente',
    description: 'Acesso completo exceto configurações do sistema',
    color: '#7C3AED',
    permissions: perms(['*'], ALL_MODS.filter(m => !['configuracoes','usuarios','fin_sped'].includes(m))),
  },
  {
    name: 'Corretor',
    description: 'CRM, simulador, contratos e mapa',
    color: '#059669',
    permissions: perms(
      ['dashboard','empreendimentos','mapa','crm','simulador','contratos','landing'],
      ['crm','simulador','landing']
    ),
  },
  {
    name: 'Financeiro',
    description: 'Módulos financeiros — contas, boletos e relatórios',
    color: '#EA580C',
    permissions: perms(
      ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_split','relatorios','contratos'],
      ['fin_receber','fin_pagar','fin_boletos','fin_split']
    ),
  },
  {
    name: 'Controladoria',
    description: 'Financeiro completo com SPED, DIMOB e controladoria',
    color: '#B45309',
    permissions: perms(
      ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped','relatorios','controladoria','contratos'],
      ['fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped','controladoria']
    ),
  },
  {
    name: 'Contador',
    description: 'Leitura financeira — relatórios e obrigações fiscais',
    color: '#0891B2',
    permissions: perms(
      ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_sped','relatorios','contratos'],
      []
    ),
  },
  {
    name: 'Assistente',
    description: 'Suporte operacional — leitura geral',
    color: '#6D28D9',
    permissions: perms(
      ['dashboard','empreendimentos','mapa','crm','simulador','relatorios'],
      ['crm']
    ),
  },
  {
    name: 'Consultor',
    description: 'Acesso externo para análise e simulações',
    color: '#DB2777',
    permissions: perms(
      ['dashboard','empreendimentos','mapa','simulador'],
      []
    ),
  },
  {
    name: 'Cliente',
    description: 'Acesso do cliente ao próprio contrato e mapa',
    color: '#374151',
    permissions: perms(
      ['dashboard','contratos','mapa'],
      []
    ),
  },
  {
    name: 'Fornecedor',
    description: 'Acesso restrito para fornecedores externos',
    color: '#78716C',
    permissions: perms(
      ['dashboard','obras'],
      []
    ),
  },
]

async function seed() {
  await connectDB()
  const { rows: tenants } = await pool.query('SELECT id, name FROM hub_tenants')
  logger.info(`Seeding perfis para ${tenants.length} tenant(s)...`)

  let created = 0, skipped = 0

  for (const tenant of tenants) {
    for (const p of DEFAULT_PROFILES) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM hub_profiles WHERE tenant_id=$1 AND name=$2',
        [tenant.id, p.name]
      )
      if (existing.length) { skipped++; continue }

      await pool.query(
        `INSERT INTO hub_profiles (id, tenant_id, name, description, color, permissions)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [uuidv4(), tenant.id, p.name, p.description, p.color, JSON.stringify(p.permissions)]
      )
      created++
      logger.info(`  ✅  [${tenant.name}] ${p.name}`)
    }
  }

  logger.info(`\nConcluído: ${created} criados, ${skipped} já existiam`)
  await pool.end()
}

seed().catch(err => {
  logger.error('Erro no seed:', err.message)
  process.exit(1)
})
