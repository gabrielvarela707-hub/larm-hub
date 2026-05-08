const express  = require('express')
const Joi      = require('joi')
const { authLimiter } = require('../middleware/rateLimiter')
const { authenticate } = require('../middleware/authenticate')
const authService = require('../services/authService')

const router = express.Router()

// ─── Validações ────────────────────────────────────────────────────────────────

const loginSchema = Joi.object({
  email:    Joi.string().required().messages({ 'any.required': 'E-mail obrigatório' }),
  password: Joi.string().required().messages({ 'any.required': 'Senha obrigatória' }),
})

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
})

// ─── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/login', authLimiter, async (req, res, next) => {
  const { error, value } = loginSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const ip        = req.ip || req.socket?.remoteAddress
  const userAgent = req.headers['user-agent'] || ''

  const result = await authService.login(value.email, value.password, ip, userAgent)

  if (!result.ok) {
    return res.status(401).json({ ok: false, message: result.message })
  }

  return res.json(result)
})

// ─── POST /auth/refresh ────────────────────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  const { error, value } = refreshSchema.validate(req.body)
  if (error) return res.status(400).json({ ok: false, message: error.details[0].message })

  const result = await authService.refreshAccessToken(value.refreshToken)

  if (!result.ok) {
    return res.status(401).json({ ok: false, message: result.message })
  }

  return res.json(result)
})

// ─── POST /auth/logout ─────────────────────────────────────────────────────────

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body
  const result = await authService.logout(refreshToken)
  return res.json(result)
})

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

router.get('/me', authenticate, (req, res) => {
  return res.json({ ok: true, data: { user: req.user } })
})

module.exports = router
