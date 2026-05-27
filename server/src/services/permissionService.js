/**
 * src/services/permissionService.js
 * Regras hierárquicas de usuários e permissões de convite.
 */

const { query } = require('../config/database')

const ROLES_VALIDOS = [
  'super_admin', 'admin', 'manager', 'controller', 'financial', 'marketing',
  'accountant', 'broker', 'consultant', 'assistant', 'supplier', 'client', 'viewer',
]

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Gerente',
  controller: 'Controladoria',
  financial: 'Financeiro',
  marketing: 'Marketing',
  accountant: 'Contador',
  broker: 'Corretor',
  consultant: 'Consultor',
  assistant: 'Assistente',
  supplier: 'Fornecedor',
  client: 'Cliente',
  viewer: 'Visualizador',
}

// Quanto maior, mais alto na hierarquia.
const ROLE_LEVELS = {
  super_admin: 100,
  admin: 90,
  manager: 80,
  controller: 70,
  financial: 65,
  marketing: 55,
  accountant: 50,
  broker: 45,
  consultant: 40,
  assistant: 35,
  supplier: 25,
  client: 20,
  viewer: 10,
}

const DEFAULT_INVITE_PERMISSIONS = {
  super_admin: ROLES_VALIDOS.filter(r => r !== 'super_admin'),
  admin: ROLES_VALIDOS.filter(r => r !== 'super_admin'),
  manager: ['controller', 'financial', 'marketing', 'accountant', 'broker', 'consultant', 'assistant', 'supplier', 'client', 'viewer'],
  controller: ['financial', 'accountant', 'supplier', 'client', 'viewer'],
  financial: ['accountant', 'supplier', 'client', 'viewer'],
  marketing: ['marketing', 'broker', 'supplier', 'client'],
  accountant: ['supplier', 'client', 'viewer'],
  broker: ['client'],
  consultant: ['client'],
  assistant: ['client'],
  supplier: [],
  client: [],
  viewer: [],
}

function normalizeRole(role) {
  return ROLES_VALIDOS.includes(role) ? role : 'viewer'
}

function roleLevel(role) {
  return ROLE_LEVELS[normalizeRole(role)] || 0
}

function isAdminRole(role) {
  return ['admin', 'super_admin'].includes(role)
}

function canManageRole(requesterRole, targetRole) {
  const requester = normalizeRole(requesterRole)
  const target = normalizeRole(targetRole)

  if (requester === 'super_admin') return target !== 'super_admin'
  if (requester === 'admin') return target !== 'super_admin'
  return roleLevel(requester) > roleLevel(target)
}

function canSetRole(requesterRole, newRole) {
  const requester = normalizeRole(requesterRole)
  const target = normalizeRole(newRole)

  if (requester === 'super_admin') return target !== 'super_admin'
  if (requester === 'admin') return target !== 'super_admin'
  return roleLevel(requester) > roleLevel(target)
}

async function ensureDefaultInvitePermissions(tenantId) {
  if (!tenantId) return

  const values = []
  const params = []
  let i = 1

  for (const [inviterRole, allowedRoles] of Object.entries(DEFAULT_INVITE_PERMISSIONS)) {
    for (const allowedRole of allowedRoles) {
      values.push(`($${i++}, $${i++}, $${i++})`)
      params.push(tenantId, inviterRole, allowedRole)
    }
  }

  if (!values.length) return

  await query(
    `INSERT INTO hub_invite_permissions (tenant_id, inviter_role, allowed_role)
     VALUES ${values.join(',')}
     ON CONFLICT (tenant_id, inviter_role, allowed_role) DO NOTHING`,
    params
  ).catch(() => {})
}

async function getAllowedInviteRoles(tenantId, inviterRole) {
  const role = normalizeRole(inviterRole)

  if (isAdminRole(role)) {
    return DEFAULT_INVITE_PERMISSIONS[role] || []
  }

  await ensureDefaultInvitePermissions(tenantId)

  const { rows } = await query(
    `SELECT allowed_role
       FROM hub_invite_permissions
      WHERE tenant_id = $1
        AND inviter_role = $2
      ORDER BY allowed_role`,
    [tenantId, role]
  )

  if (rows.length) return rows.map(r => r.allowed_role)
  return DEFAULT_INVITE_PERMISSIONS[role] || []
}

async function canInviteRole(tenantId, inviterRole, targetRole) {
  const inviter = normalizeRole(inviterRole)
  const normalizedTarget = normalizeRole(targetRole)

  if (isAdminRole(inviter)) return normalizedTarget !== 'super_admin'

  // Convite pode ser para perfil do mesmo nível quando a matriz permitir
  // (ex.: Marketing convidando outro Marketing), mas nunca para nível acima.
  if (roleLevel(inviter) < roleLevel(normalizedTarget)) return false

  const allowed = await getAllowedInviteRoles(tenantId, inviter)
  return allowed.includes(normalizedTarget)
}

async function getRoleFromProfileIds(tenantId, profileIds = [], fallback = 'broker') {
  if (!Array.isArray(profileIds) || profileIds.length === 0) return normalizeRole(fallback)

  const { rows } = await query(
    `SELECT name
       FROM hub_profiles
      WHERE tenant_id = $1
        AND id = ANY($2::uuid[])`,
    [tenantId, profileIds]
  )

  const found = rows
    .map(r => roleFromProfileName(r.name))
    .filter(Boolean)

  const priority = ['admin', 'manager', 'controller', 'financial', 'marketing', 'accountant', 'broker', 'consultant', 'assistant', 'supplier', 'client', 'viewer']
  return priority.find(role => found.includes(role)) || normalizeRole(fallback)
}

function roleFromProfileName(name) {
  const n = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (n.includes('administrador') || n.includes('admin')) return 'admin'
  if (n.includes('gerente') || n.includes('gestor')) return 'manager'
  if (n.includes('controladoria')) return 'controller'
  if (n.includes('financeiro')) return 'financial'
  if (n.includes('marketing')) return 'marketing'
  if (n.includes('contador') || n.includes('contabil')) return 'accountant'
  if (n.includes('corretor') || n.includes('broker')) return 'broker'
  if (n.includes('consultor')) return 'consultant'
  if (n.includes('assistente')) return 'assistant'
  if (n.includes('fornecedor')) return 'supplier'
  if (n.includes('cliente')) return 'client'
  return null
}

module.exports = {
  ROLES_VALIDOS,
  ROLE_LABELS,
  ROLE_LEVELS,
  DEFAULT_INVITE_PERMISSIONS,
  normalizeRole,
  roleLevel,
  isAdminRole,
  canManageRole,
  canSetRole,
  ensureDefaultInvitePermissions,
  getAllowedInviteRoles,
  canInviteRole,
  getRoleFromProfileIds,
  roleFromProfileName,
}
