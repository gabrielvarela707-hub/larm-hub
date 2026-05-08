const logger = require('../config/logger')

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // CORS error
  if (err.message && err.message.startsWith('CORS bloqueado')) {
    return res.status(403).json({ ok: false, message: err.message })
  }

  // Validation errors (Joi)
  if (err.isJoi || err.name === 'ValidationError') {
    return res.status(400).json({
      ok:      false,
      message: err.details?.[0]?.message || err.message,
    })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ ok: false, message: 'Token inválido' })
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ ok: false, message: 'Token expirado' })
  }

  // PostgreSQL errors
  if (err.code) {
    const pgErrors = {
      '23505': 'Registro duplicado',
      '23503': 'Violação de chave estrangeira',
      '23502': 'Campo obrigatório não preenchido',
      '42P01': 'Tabela não encontrada',
    }
    if (pgErrors[err.code]) {
      return res.status(409).json({ ok: false, message: pgErrors[err.code] })
    }
  }

  // HTTP errors com status explícito
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ ok: false, message: err.message })
  }

  // Erro inesperado — não vaza stack em produção
  logger.error(`[${req.method}] ${req.path} → ${err.message}`, { stack: err.stack })

  return res.status(500).json({
    ok:      false,
    message: process.env.NODE_ENV === 'production'
      ? 'Erro interno no servidor'
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
}

module.exports = errorHandler
