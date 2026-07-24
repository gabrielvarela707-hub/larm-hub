/**
 * src/services/auditService.js
 * Log de ações centralizado. Falha de log nunca quebra o fluxo principal.
 */

const { v4: uuidv4 } = require('uuid')
const { query } = require('../config/database')
const logger = require('../config/logger')

function safeJson(value) {
  try { return JSON.stringify(value || {}) } catch { return '{}' }
}

async function logAudit({
  tenantId = null,
  userId = null,
  action,
  module = 'sistema',
  entityType = null,
  entityId = null,
  targetUserId = null,
  ip = null,
  userAgent = '',
  details = {},
  meta = null,
}) {
  if (!action) return

  const payload = meta || details || {}

  try {
    await query(
      `INSERT INTO hub_audit_logs
        (id, tenant_id, user_id, action, module, entity_type, entity_id,
         target_user_id, ip, user_agent, details, meta, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [
        uuidv4(), tenantId, userId, action, module, entityType, entityId,
        targetUserId, ip, userAgent, safeJson(payload), safeJson(payload),
      ]
    )
  } catch (err) {
    logger.warn(`Falha ao gravar audit log: ${err.message}`)
  }
}

function moduleFromPath(path = '') {
  if (path.startsWith('/auth')) return 'auth'
  if (path.startsWith('/financeiro')) return 'financeiro'
  if (path.startsWith('/crm')) return 'crm'
  if (path.startsWith('/users') || path.includes('/profiles')) return 'usuarios'
  if (path.startsWith('/profiles')) return 'perfis'
  if (path.startsWith('/tenant-config')) return 'configuracoes'
  if (path.startsWith('/audit')) return 'logs'
  if (path.startsWith('/tipos-documento')) return 'cadastros'
  if (path.startsWith('/strato')) return 'strato'
  return 'sistema'
}

function actionFromRequest(method, path = '') {
  if (method === 'POST') return 'criar'
  if (method === 'PUT' || method === 'PATCH') return 'atualizar'
  if (method === 'DELETE') return 'excluir_inativar'
  return 'visualizar'
}

async function purgeOldAuditLogs(tenantId) {
  if (!tenantId) return 0
  try {
    const { rows: [settings] } = await query(
      `SELECT retention_days FROM hub_audit_settings WHERE tenant_id = $1`,
      [tenantId]
    )
    const retention = Number(settings?.retention_days || 30)
    const { rowCount } = await query(
      `DELETE FROM hub_audit_logs
        WHERE tenant_id = $1
          AND created_at < NOW() - ($2::int || ' days')::interval`,
      [tenantId, retention]
    )
    return rowCount || 0
  } catch (err) {
    logger.warn(`Falha ao aplicar retenção dos logs: ${err.message}`)
    return 0
  }
}

module.exports = {
  logAudit,
  moduleFromPath,
  actionFromRequest,
  purgeOldAuditLogs,
}
