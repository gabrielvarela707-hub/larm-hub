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
  hub:      Joi.string().valid('santa_clara', 'larm').optional(),
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

  const result = await authService.login(value.email, value.password, ip, userAgent, value.hub)

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
  const result = await authService.logout(
    refreshToken,
    req.ip || req.socket?.remoteAddress,
    req.headers['user-agent'] || ''
  )
  return res.json(result)
})

// ─── GET /auth/me ─────────────────────────────────────────────────────────────

router.get('/me', authenticate, (req, res) => {
  return res.json({ ok: true, data: { user: req.user } })
})


// ── POST /auth/change-password ────────────────────────────────────────────────
// Troca de senha — obrigatória no primeiro login com senha temporária
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  const { id: userId } = req.user

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, message: 'Campos obrigatórios' })
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ ok: false, message: 'Nova senha deve ter ao menos 8 caracteres' })
  }

  const { query }  = require('../config/database')
  const bcrypt     = require('bcryptjs')
  const logger     = require('../config/logger')

  const { rows } = await query('SELECT password_hash FROM hub_users WHERE id = $1', [userId])
  if (!rows.length) return res.status(404).json({ ok: false, message: 'Usuário não encontrado' })

  const ok = await bcrypt.compare(currentPassword, rows[0].password_hash)
  if (!ok) return res.status(401).json({ ok: false, message: 'Senha atual incorreta' })

  const newHash = await bcrypt.hash(newPassword, 12)
  await query(
    'UPDATE hub_users SET password_hash=$1, must_change_password=false, updated_at=NOW() WHERE id=$2',
    [newHash, userId]
  )

  logger.info(`Senha alterada: user=${userId}`)
  return res.json({ ok: true, message: 'Senha alterada com sucesso' })
})


module.exports = router
