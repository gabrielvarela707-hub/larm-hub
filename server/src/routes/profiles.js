/**
 * src/routes/profiles.js
 * → server/src/routes/profiles.js  (arquivo novo)
 *
 * CRUD de perfis de acesso por tenant
 * + vinculo perfil ↔ usuário (many-to-many)
 */

const express = require('express')
const { v4: uuidv4 } = require('uuid')
const { query }      = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const logger         = require('../config/logger')
const { logAudit } = require('../services/auditService')
const { isAdminRole, canManageRole, canSetRole, getRoleFromProfileIds } = require('../services/permissionService')

const router = express.Router()
router.use(authenticate)

// ── GET /profiles ─────────────────────────────────────────────────────────────
router.get('/profiles', async (req, res) => {
  const { tenant_id } = req.user
  const { rows } = await query(
    `SELECT p.*,
            COUNT(DISTINCT up.user_id)::int AS user_count
       FROM hub_profiles p
       LEFT JOIN hub_user_profiles up ON up.profile_id = p.id
      WHERE p.tenant_id = $1
      GROUP BY p.id
      ORDER BY p.created_at ASC`,
    [tenant_id]
  )
  return res.json({
    ok: true,
    data: rows.map(r => ({
      id:          r.id,
      name:        r.name,
      description: r.description || '',
      color:       r.color       || '#2563EB',
      permissions: r.permissions || {},
      user_count:  r.user_count  || 0,
    })),
  })
})

// ── POST /profiles ────────────────────────────────────────────────────────────
router.post('/profiles', async (req, res) => {
  const { tenant_id, role } = req.user
  if (!isAdminRole(role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }

  const { name, description = '', color = '#2563EB', permissions = {} } = req.body
  if (!name?.trim()) return res.status(400).json({ ok: false, message: 'Nome obrigatório' })

  const { rows: [p] } = await query(
    `INSERT INTO hub_profiles (id, tenant_id, name, description, color, permissions)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [uuidv4(), tenant_id, name.trim(), description, color, JSON.stringify(permissions)]
  )

  logger.info(`Perfil criado: ${name} (tenant=${tenant_id})`)
  return res.status(201).json({ ok: true, data: p })
})

// ── PUT /profiles/:id ─────────────────────────────────────────────────────────
router.put('/profiles/:id', async (req, res) => {
  const { tenant_id, role } = req.user
  if (!isAdminRole(role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }

  const { name, description, color, permissions } = req.body
  const fields = []
  const vals   = []
  let i = 1
  if (name        !== undefined) { fields.push(`name=$${i++}`);        vals.push(name) }
  if (description !== undefined) { fields.push(`description=$${i++}`); vals.push(description) }
  if (color       !== undefined) { fields.push(`color=$${i++}`);       vals.push(color) }
  if (permissions !== undefined) { fields.push(`permissions=$${i++}`); vals.push(JSON.stringify(permissions)) }
  if (!fields.length) return res.status(400).json({ ok: false, message: 'Nada para atualizar' })

  fields.push(`updated_at=NOW()`)
  vals.push(req.params.id, tenant_id)

  await query(
    `UPDATE hub_profiles SET ${fields.join(', ')}
     WHERE id=$${i} AND tenant_id=$${i+1}`,
    vals
  )

  logger.info(`Perfil atualizado: id=${req.params.id}`)
  return res.json({ ok: true, message: 'Perfil atualizado' })
})

// ── DELETE /profiles/:id ──────────────────────────────────────────────────────
router.delete('/profiles/:id', async (req, res) => {
  const { tenant_id, role } = req.user
  if (!isAdminRole(role)) {
    return res.status(403).json({ ok: false, message: 'Sem permissão' })
  }

  // Remove vínculos e depois o perfil
  await query('DELETE FROM hub_user_profiles WHERE profile_id = $1', [req.params.id])
  await query('DELETE FROM hub_profiles WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant_id])

  logger.info(`Perfil removido: id=${req.params.id}`)
  return res.json({ ok: true })
})

// ── GET /users/:userId/profiles ───────────────────────────────────────────────
router.get('/users/:userId/profiles', async (req, res) => {
  const { tenant_id } = req.user
  const { rows } = await query(
    `SELECT up.profile_id
       FROM hub_user_profiles up
       JOIN hub_profiles p ON p.id = up.profile_id
      WHERE up.user_id=$1 AND p.tenant_id=$2`,
    [req.params.userId, tenant_id]
  )
  return res.json({ ok: true, data: rows.map(r => r.profile_id) })
})

// ── POST /users/:userId/profiles ─────────────────────────────────────────────
router.post('/users/:userId/profiles', async (req, res) => {
  const { tenant_id, role } = req.user

  const { profileId } = req.body
  if (!profileId) return res.status(400).json({ ok: false, message: 'profileId obrigatório' })

  const { rows: [target] } = await query(
    'SELECT id, role FROM hub_users WHERE id=$1 AND tenant_id=$2',
    [req.params.userId, tenant_id]
  )
  if (!target) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })
  if (!canManageRole(role, target.role)) {
    return res.status(403).json({ ok: false, message: 'Você não pode alterar perfil de usuário igual ou superior ao seu' })
  }

  // Garante que o perfil pertence ao tenant
  const { rows } = await query('SELECT id FROM hub_profiles WHERE id=$1 AND tenant_id=$2', [profileId, tenant_id])
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Perfil não encontrado' })

  const inferredRole = await getRoleFromProfileIds(tenant_id, [profileId], target.role)
  if (!canSetRole(role, inferredRole)) {
    return res.status(403).json({ ok: false, message: 'Você não pode aplicar perfil igual ou superior ao seu' })
  }

  await query(
    `INSERT INTO hub_user_profiles (user_id, profile_id)
     VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [req.params.userId, profileId]
  )

  return res.json({ ok: true })
})

// ── PUT /users/:userId/profiles — substitui perfis do usuário ──────────────────
router.put('/users/:userId/profiles', async (req, res) => {
  const { id: requesterId, tenant_id, role } = req.user
  const profileIds = Array.isArray(req.body.profileIds) ? req.body.profileIds : []

  const { rows: [targetUser] } = await query(
    'SELECT id, email, role FROM hub_users WHERE id=$1 AND tenant_id=$2',
    [req.params.userId, tenant_id]
  )
  if (!targetUser) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })

  if (!canManageRole(role, targetUser.role)) {
    return res.status(403).json({ ok: false, message: 'Você não pode alterar perfil de usuário igual ou superior ao seu' })
  }

  let validIds = []
  if (profileIds.length > 0) {
    const { rows } = await query(
      'SELECT id FROM hub_profiles WHERE tenant_id=$1 AND id = ANY($2::uuid[])',
      [tenant_id, profileIds]
    )
    validIds = rows.map(r => r.id)
  }

  const inferredRole = await getRoleFromProfileIds(tenant_id, validIds, targetUser.role)
  if (!canSetRole(role, inferredRole)) {
    return res.status(403).json({ ok: false, message: 'Você não pode aplicar perfil igual ou superior ao seu' })
  }

  await query('DELETE FROM hub_user_profiles WHERE user_id=$1', [req.params.userId])

  for (const profileId of validIds) {
    await query(
      `INSERT INTO hub_user_profiles (user_id, profile_id)
       VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.params.userId, profileId]
    )
  }

  await query(
    'UPDATE hub_users SET role=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3',
    [inferredRole, req.params.userId, tenant_id]
  )

  await logAudit({
    tenantId: tenant_id,
    userId: requesterId,
    action: 'user_profiles_update',
    module: 'usuarios',
    entityType: 'hub_users',
    entityId: req.params.userId,
    targetUserId: req.params.userId,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
    details: { email: targetUser.email, before_role: targetUser.role, after_role: inferredRole, profile_ids: validIds },
  })

  return res.json({ ok: true, data: validIds, role: inferredRole })
})

// ── DELETE /users/:userId/profiles/:profileId ─────────────────────────────────
router.delete('/users/:userId/profiles/:profileId', async (req, res) => {
  const { tenant_id, role } = req.user

  const { rows: [target] } = await query(
    'SELECT id, role FROM hub_users WHERE id=$1 AND tenant_id=$2',
    [req.params.userId, tenant_id]
  )
  if (!target) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })
  if (!canManageRole(role, target.role)) {
    return res.status(403).json({ ok: false, message: 'Você não pode alterar perfil de usuário igual ou superior ao seu' })
  }

  await query(
    'DELETE FROM hub_user_profiles WHERE user_id=$1 AND profile_id=$2',
    [req.params.userId, req.params.profileId]
  )

  return res.json({ ok: true })
})

module.exports = router
