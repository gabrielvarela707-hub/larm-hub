/**
 * src/routes/audit.js
 * Logs de ações, retenção e matriz de permissões de convite.
 */

const express = require('express')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { logAudit, purgeOldAuditLogs } = require('../services/auditService')
const {
  ROLES_VALIDOS,
  ROLE_LABELS,
  DEFAULT_INVITE_PERMISSIONS,
  isAdminRole,
  getAllowedInviteRoles,
  ensureDefaultInvitePermissions,
} = require('../services/permissionService')

const router = express.Router()
router.use(authenticate)

function requireAdmin(req, res) {
  if (!isAdminRole(req.user.role)) {
    res.status(403).json({ ok: false, message: 'Apenas administradores podem alterar esta configuração' })
    return false
  }
  return true
}

// ── GET /audit/logs ──────────────────────────────────────────────────────────
router.get('/audit/logs', async (req, res) => {
  const { tenant_id, role } = req.user
  if (!isAdminRole(role)) return res.status(403).json({ ok: false, message: 'Sem permissão para visualizar logs' })

  await purgeOldAuditLogs(tenant_id)

  const {
    user_id,
    module,
    action,
    date_from,
    date_to,
    q,
    page = '1',
    limit = '50',
  } = req.query

  const where = ['l.tenant_id = $1']
  const params = [tenant_id]
  let i = 2

  if (user_id) { where.push(`l.user_id = $${i++}`); params.push(user_id) }
  if (module) { where.push(`l.module = $${i++}`); params.push(module) }
  if (action) { where.push(`l.action = $${i++}`); params.push(action) }
  if (date_from) { where.push(`l.created_at >= $${i++}`); params.push(date_from) }
  if (date_to) { where.push(`l.created_at < ($${i++}::date + INTERVAL '1 day')`); params.push(date_to) }
  if (q) {
    where.push(`(u.name ILIKE $${i} OR u.email ILIKE $${i} OR l.action ILIKE $${i} OR l.module ILIKE $${i} OR l.details::text ILIKE $${i})`)
    params.push(`%${q}%`)
    i++
  }

  const perPage = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
  const currentPage = Math.max(parseInt(page, 10) || 1, 1)
  const offset = (currentPage - 1) * perPage

  const sqlWhere = where.join(' AND ')

  const [{ rows }, { rows: countRows }] = await Promise.all([
    query(
      `SELECT l.id, l.created_at, l.action, l.module, l.entity_type, l.entity_id,
              l.target_user_id, l.ip::text AS ip, l.user_agent,
              COALESCE(l.details, l.meta, '{}'::jsonb) AS details,
              u.name AS user_name, u.email AS user_email,
              tu.name AS target_user_name, tu.email AS target_user_email
         FROM hub_audit_logs l
         LEFT JOIN hub_users u  ON u.id = l.user_id
         LEFT JOIN hub_users tu ON tu.id = l.target_user_id
        WHERE ${sqlWhere}
        ORDER BY l.created_at DESC
        LIMIT $${i++} OFFSET $${i++}`,
      [...params, perPage, offset]
    ),
    query(
      `SELECT COUNT(*)::int AS total
         FROM hub_audit_logs l
         LEFT JOIN hub_users u ON u.id = l.user_id
        WHERE ${sqlWhere}`,
      params
    ),
  ])

  return res.json({
    ok: true,
    data: rows,
    pagination: {
      page: currentPage,
      limit: perPage,
      total: countRows[0]?.total || 0,
    },
  })
})

// ── GET /audit/settings ──────────────────────────────────────────────────────
router.get('/audit/settings', async (req, res) => {
  const { tenant_id, role } = req.user
  if (!isAdminRole(role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })

  const { rows: [settings] } = await query(
    `INSERT INTO hub_audit_settings (tenant_id, retention_days)
     VALUES ($1, 30)
     ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
     RETURNING tenant_id, retention_days, updated_at`,
    [tenant_id]
  )

  return res.json({ ok: true, data: settings })
})

// ── PUT /audit/settings ──────────────────────────────────────────────────────
router.put('/audit/settings', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const retentionDays = parseInt(req.body.retention_days, 10)
  if (!retentionDays || retentionDays < 1 || retentionDays > 3650) {
    return res.status(400).json({ ok: false, message: 'Informe um período entre 1 e 3650 dias' })
  }

  const { rows: [settings] } = await query(
    `INSERT INTO hub_audit_settings (tenant_id, retention_days, updated_by, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       retention_days = EXCLUDED.retention_days,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING tenant_id, retention_days, updated_at`,
    [req.user.tenant_id, retentionDays, req.user.id]
  )

  const removed = await purgeOldAuditLogs(req.user.tenant_id)

  await logAudit({
    tenantId: req.user.tenant_id,
    userId: req.user.id,
    action: 'audit_retention_update',
    module: 'logs',
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
    details: { retention_days: retentionDays, removed },
  })

  return res.json({ ok: true, data: settings, removed })
})

// ── GET /users/invite-permissions ────────────────────────────────────────────
router.get('/users/invite-permissions', async (req, res) => {
  const { tenant_id, role } = req.user
  await ensureDefaultInvitePermissions(tenant_id)

  if (!isAdminRole(role)) {
    const allowed = await getAllowedInviteRoles(tenant_id, role)
    return res.json({
      ok: true,
      data: {
        roles: ROLES_VALIDOS.filter(r => r !== 'super_admin').map(id => ({ id, label: ROLE_LABELS[id] || id })),
        matrix: { [role]: allowed },
        allowed_for_current_user: allowed,
        editable: false,
      },
    })
  }

  const { rows } = await query(
    `SELECT inviter_role, allowed_role
       FROM hub_invite_permissions
      WHERE tenant_id = $1
      ORDER BY inviter_role, allowed_role`,
    [tenant_id]
  )

  const matrix = {}
  for (const roleId of ROLES_VALIDOS.filter(r => r !== 'super_admin')) matrix[roleId] = []
  for (const row of rows) {
    if (!matrix[row.inviter_role]) matrix[row.inviter_role] = []
    matrix[row.inviter_role].push(row.allowed_role)
  }

  return res.json({
    ok: true,
    data: {
      roles: ROLES_VALIDOS.filter(r => r !== 'super_admin').map(id => ({ id, label: ROLE_LABELS[id] || id })),
      matrix,
      defaults: DEFAULT_INVITE_PERMISSIONS,
      allowed_for_current_user: DEFAULT_INVITE_PERMISSIONS[role] || [],
      editable: true,
    },
  })
})

// ── PUT /users/invite-permissions ────────────────────────────────────────────
router.put('/users/invite-permissions', async (req, res) => {
  if (!requireAdmin(req, res)) return

  const matrix = req.body.matrix || {}
  const validRoles = ROLES_VALIDOS.filter(r => r !== 'super_admin')

  await transaction(async (client) => {
    await client.query('DELETE FROM hub_invite_permissions WHERE tenant_id = $1', [req.user.tenant_id])

    for (const inviterRole of validRoles) {
      const allowed = Array.isArray(matrix[inviterRole]) ? matrix[inviterRole] : []
      for (const allowedRole of allowed) {
        if (!validRoles.includes(allowedRole)) continue
        await client.query(
          `INSERT INTO hub_invite_permissions (tenant_id, inviter_role, allowed_role)
           VALUES ($1,$2,$3)
           ON CONFLICT DO NOTHING`,
          [req.user.tenant_id, inviterRole, allowedRole]
        )
      }
    }
  })

  await logAudit({
    tenantId: req.user.tenant_id,
    userId: req.user.id,
    action: 'invite_permissions_update',
    module: 'usuarios',
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.headers['user-agent'] || '',
    details: { matrix },
  })

  return res.json({ ok: true, message: 'Permissões de convite atualizadas' })
})

module.exports = router
