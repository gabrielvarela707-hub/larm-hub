const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { query, transaction } = require('../config/database')
const logger = require('../config/logger')

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

// ─── Login ─────────────────────────────────────────────────────────────────────

async function login(email, password, ip, userAgent) {
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
    await logAudit(null, 'login_failed', ip, userAgent, { email, reason: 'user_not_found' })
    return { ok: false, message: 'E-mail ou senha incorretos' }
  }

  // 3. Verifica se está ativo
  if (!user.is_active) {
    await logAudit(user.id, 'login_blocked', ip, userAgent, { reason: 'inactive' })
    return { ok: false, message: 'Usuário inativo. Entre em contato com o suporte.' }
  }

  // 4. Verifica senha
  const passwordOk = await bcrypt.compare(password, user.password_hash)
  if (!passwordOk) {
    await logAudit(user.id, 'login_failed', ip, userAgent, { reason: 'wrong_password' })
    return { ok: false, message: 'E-mail ou senha incorretos' }
  }

  // 5. Gera tokens
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

  await logAudit(user.id, 'login_success', ip, userAgent, {})

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
        hubType:    user.hub_type,     // 'santa_clara' | 'larm'
        mustChangePassword: user.must_change_password || false,
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

async function logout(refreshToken) {
  if (!refreshToken) return { ok: true }

  await query(
    `UPDATE hub_refresh_tokens SET revoked = true, revoked_at = NOW()
     WHERE token = $1`,
    [refreshToken]
  )
  return { ok: true, message: 'Logout realizado com sucesso' }
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function logAudit(userId, action, ip, userAgent, meta) {
  try {
    await query(
      `INSERT INTO hub_audit_logs (id, user_id, action, ip, user_agent, meta, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [uuidv4(), userId, action, ip, userAgent, JSON.stringify(meta)]
    )
  } catch (err) {
    // Não deixa falha no log quebrar o fluxo principal
    logger.warn(`Falha ao gravar audit log: ${err.message}`)
  }
}

module.exports = { login, refreshAccessToken, logout }
