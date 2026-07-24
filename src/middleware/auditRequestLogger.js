const { logAudit, moduleFromPath, actionFromRequest } = require('../services/auditService')

function auditRequestLogger(req, res, next) {
  const startedAt = Date.now()

  res.on('finish', () => {
    const method = req.method
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return
    if (!req.user) return

    const path = req.originalUrl || req.path || ''
    if (path.startsWith('/auth/login') || path.startsWith('/auth/logout')) return
    if (path.startsWith('/health')) return

    const body = { ...(req.body || {}) }
    delete body.password
    delete body.currentPassword
    delete body.newPassword
    delete body.refreshToken
    delete body.password_hash
    delete body.temp_password

    logAudit({
      tenantId: req.user.tenant_id,
      userId: req.user.id,
      action: actionFromRequest(method, path),
      module: moduleFromPath(path),
      entityType: path.split('?')[0],
      entityId: req.params?.id || req.params?.userId || null,
      targetUserId: req.params?.userId || (path.startsWith('/users/') ? req.params?.id : null),
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'] || '',
      details: {
        method,
        path,
        status: res.statusCode,
        duration_ms: Date.now() - startedAt,
        body,
      },
    })
  })

  next()
}

module.exports = auditRequestLogger
