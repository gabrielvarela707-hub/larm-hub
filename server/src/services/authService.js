const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { query, transaction } = require('../config/database')
const logger = require('../config/logger')
const { logAudit } = require('./auditService')

const PORTAL_OPTIONS = {
  santa_clara: 'Santa Clara HUB',
  larm: 'LARM HUB',
}

function normalizeAllowedHubs(value) {
  let hubs = value
  if (typeof hubs === 'string') {
    try { hubs = JSON.parse(hubs) } catch { hubs = hubs.split(',') }
  }
  if (!Array.isArray(hubs)) hubs = []
  const valid = [...new Set(hubs.filter(h => PORTAL_OPTIONS[h]))]
  return valid.length ? valid : ['santa_clara', 'larm']
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub:      user.id,
      email:    user.email,
      role:     user.role,
      tenantId: user.tenant_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  )
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  )
}


function mergeProfilePermissions(profileRows = []) {
  const merged = {}

  for (const profile of profileRows) {
    const permissions = profile.permissions || {}
    for (const [moduleId, perm] of Object.entries(permissions)) {
      const current = merged[moduleId] || { read: false, write: false }
      merged[moduleId] = {
        read: Boolean(current.read || perm?.read),
        write: Boolean(current.write || perm?.write),
      }
    }
  }

  return merged
}

// ─── Login ─────────────────────────────────────────────────────────────────────

async function login(email, password, ip, userAgent, requestedHub = null) {
  // 1. Busca usuário
  const { rows } = await query(
    `SELECT u.*, t.slug AS tenant_slug, t.name AS tenant_name, t.hub_type
     FROM hub_users u
     JOIN hub_tenants t ON t.id = u.tenant_id
     WHERE LOWER(u.email) = LOWER($1)`,
    [email]
  )

  const user = rows[0]

  // 2. Usuário não existe — delay para evitar timing attack
  if (!user) {
    await new Promise(r => setTimeout(r, 400))
    await logAudit({ action: 'login_failed', module: 'auth', ip, userAgent, details: { email, reason: 'user_not_found' } })
    return { ok: false, message: 'E-mail ou senha incorretos' }
  }

  // 3. Verifica se está ativo
  if (!user.is_active) {
    await logAudit({ tenantId: user.tenant_id, userId: user.id, action: 'login_blocked', module: 'auth', ip, userAgent, details: { reason: 'inactive' } })
    return { ok: false, message: 'Usuário inativo. Entre em contato com o suporte.' }
  }

  // 4. Verifica senha
  const passwordOk = await bcrypt.compare(password, user.password_hash)
  if (!passwordOk) {
    await logAudit({ tenantId: user.tenant_id, userId: user.id, action: 'login_failed', module: 'auth', ip, userAgent, details: { reason: 'wrong_password' } })
    return { ok: false, message: 'E-mail ou senha incorretos' }
  }

  const requestedPortal = PORTAL_OPTIONS[requestedHub] ? requestedHub : null
  const allowedHubs = normalizeAllowedHubs(user.allowed_hubs)
  if (requestedPortal && !allowedHubs.includes(requestedPortal)) {
    await logAudit({
      tenantId: user.tenant_id,
      userId: user.id,
      action: 'login_blocked',
      module: 'auth',
      ip,
      userAgent,
      details: { reason: 'portal_denied', requested_hub: requestedPortal, allowed_hubs: allowedHubs },
    })
    return { ok: false, message: `Seu usuário não tem acesso ao ${PORTAL_OPTIONS[requestedPortal]}.` }
  }

  // 5. Busca perfis/permissões vinculados ao usuário
  const { rows: profileRows } = await query(
    `SELECT p.id, p.name, p.color, p.permissions
       FROM hub_user_profiles up
       JOIN hub_profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND p.tenant_id = $2
      ORDER BY p.name`,
    [user.id, user.tenant_id]
  )
  const permissions = mergeProfilePermissions(profileRows)

  // 6. Gera tokens
  const accessToken  = generateAccessToken(user)
  const refreshToken = generateRefreshToken(user)

  // 6. Persiste refresh token + atualiza last_login
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 dias
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO hub_refresh_tokens (id, user_id, token, expires_at, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [uuidv4(), user.id, refreshToken, expiresAt, ip, userAgent]
    )
    await client.query(
      `UPDATE hub_users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    )
  })

  await logAudit({ tenantId: user.tenant_id, userId: user.id, action: 'login_success', module: 'auth', ip, userAgent, details: { requested_hub: requestedPortal || null } })

  logger.info(`Login: ${user.email} [${user.role}] tenant:${user.tenant_slug}`)

  return {
    ok: true,
    data: {
      accessToken,
      refreshToken,
      user: {
        id:         user.id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        avatarUrl:  user.avatar_url,
        tenantId:   user.tenant_id,
        tenantName: user.tenant_name,
        tenantSlug: user.tenant_slug,
        hubType:    requestedPortal || user.hub_type,     // 'santa_clara' | 'larm'
        allowedHubs,
        mustChangePassword: user.must_change_password || false,
        profiles: profileRows.map(p => ({ id: p.id, name: p.name, color: p.color })),
        permissions,
      },
    },
  }
}

// ─── Refresh ───────────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken) {
  let payload
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
  } catch {
    return { ok: false, message: 'Refresh token inválido ou expirado' }
  }

  // Verifica se o token existe e não foi revogado
  const { rows } = await query(
    `SELECT rt.*, u.role, u.email, u.tenant_id, u.is_active
     FROM hub_refresh_tokens rt
     JOIN hub_users u ON u.id = rt.user_id
     WHERE rt.token = $1 AND rt.revoked = false AND rt.expires_at > NOW()`,
    [refreshToken]
  )

  if (!rows.length) {
    return { ok: false, message: 'Refresh token inválido ou expirado' }
  }

  const record = rows[0]

  if (!record.is_active) {
    return { ok: false, message: 'Usuário inativo' }
  }

  const newAccessToken = generateAccessToken({
    id:        record.user_id,
    email:     record.email,
    role:      record.role,
    tenant_id: record.tenant_id,
  })

  return { ok: true, data: { accessToken: newAccessToken } }
}

// ─── Logout ────────────────────────────────────────────────────────────────────

async function logout(refreshToken, ip, userAgent) {
  if (!refreshToken) return { ok: true }

  const { rows: [session] } = await query(
    `SELECT rt.user_id, u.tenant_id, u.email
       FROM hub_refresh_tokens rt
       JOIN hub_users u ON u.id = rt.user_id
      WHERE rt.token = $1`,
    [refreshToken]
  ).catch(() => ({ rows: [] }))

  await query(
    `UPDATE hub_refresh_tokens SET revoked = true, revoked_at = NOW()
     WHERE token = $1`,
    [refreshToken]
  )

  if (session) {
    await logAudit({
      tenantId: session.tenant_id,
      userId: session.user_id,
      action: 'logout',
      module: 'auth',
      ip,
      userAgent,
      details: { email: session.email },
    })
  }

  return { ok: true, message: 'Logout realizado com sucesso' }
}

module.exports = { login, refreshAccessToken, logout }
