const rateLimit = require('express-rate-limit')

function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

// ─── Rate limit global ─────────────────────────────────────────────────────────
// O frontend é uma SPA e pode fazer várias consultas ao preencher formulários.
// O limite antigo de 100 requisições em 15 minutos era baixo para uso normal e,
// quando atingido, também bloqueava /auth/refresh e /auth/login.
const rateLimiter = rateLimit({
  windowMs: envInt('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max:      envInt('RATE_LIMIT_MAX', 1000),
  standardHeaders: true,
  legacyHeaders:   false,

  // Sessão e login têm tratamento próprio. Nunca bloquear o refresh por causa
  // do volume normal das telas financeiras, pois isso derruba a sessão do usuário.
  skip: (req) =>
    req.method === 'OPTIONS' ||
    req.path === '/health' ||
    req.path.startsWith('/health/') ||
    req.path === '/auth' ||
    req.path.startsWith('/auth/'),

  message: {
    ok:      false,
    message: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
  },
})

// ─── Rate limit estrito para login ────────────────────────────────────────────
// Conta somente tentativas que falharam; logins corretos não consomem o limite.
const authLimiter = rateLimit({
  windowMs: envInt('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  max:      envInt('AUTH_RATE_LIMIT_MAX', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,
  message: {
    ok:      false,
    message: 'Muitas tentativas de login sem sucesso. Aguarde 15 minutos.',
  },
})

module.exports = rateLimiter
module.exports.authLimiter = authLimiter
