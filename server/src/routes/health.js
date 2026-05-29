const express    = require('express')
const { query }  = require('../config/database')

const router = express.Router()

// GET /health  — checagem básica (sem auth)
router.get('/', async (req, res) => {
  let dbOk = false
  let dbLatency = null

  try {
    const t0 = Date.now()
    await query('SELECT 1')
    dbLatency = Date.now() - t0
    dbOk = true
  } catch {}

  const status = dbOk ? 200 : 503

  return res.status(status).json({
    ok:      dbOk,
    service: 'larmhub-api',
    version: process.env.npm_package_version || '1.0.0',
    env:     process.env.NODE_ENV,
    uptime:  Math.floor(process.uptime()),
    db: {
      ok:      dbOk,
      latency: dbLatency ? `${dbLatency}ms` : null,
    },
    timestamp: new Date().toISOString(),
  })
})

module.exports = router
