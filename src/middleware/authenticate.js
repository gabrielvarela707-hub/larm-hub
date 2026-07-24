const jwt    = require('jsonwebtoken')
const { query } = require('../config/database')

/**
 * Middleware que valida o Bearer token e injeta req.user
 */
async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'Token não fornecido' })
  }

  const token = header.split(' ')[1]

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    // Busca o usuário no banco para garantir que ainda existe e está ativo
    const { rows } = await query(
      `SELECT id, name, email, role, tenant_id, is_active
       FROM hub_users
       WHERE id = $1`,
      [payload.sub]
    )

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ ok: false, message: 'Usuário inativo ou não encontrado' })
    }

    req.user = {
      id:       rows[0].id,
      name:     rows[0].name,
      email:    rows[0].email,
      role:     rows[0].role,
      tenant_id: rows[0].tenant_id,
    }

    next()
  } catch (err) {
    next(err) // Passa para o errorHandler (TokenExpiredError, JsonWebTokenError)
  }
}

/**
 * Factory — restringe acesso a roles específicas
 * Uso: router.get('/admin', authenticate, requireRole('admin', 'manager'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        ok:      false,
        message: `Acesso restrito. Roles permitidas: ${roles.join(', ')}`,
      })
    }
    next()
  }
}

module.exports = { authenticate, requireRole }
