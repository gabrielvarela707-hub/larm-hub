const rateLimit = require('express-rate-limit')

// ─── Rate limit global ─────────────────────────────────────────────────────────
const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    ok:      false,
    message: 'Muitas requisições. Tente novamente em alguns minutos.',
  },
})

// ─── Rate limit estrito para login ────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      10,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    ok:      false,
    message: 'Muitas tentativas de login. Aguarde 15 minutos.',
  },
})

module.exports = rateLimiter
module.exports.authLimiter = authLimiter
