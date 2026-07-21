const express    = require('express')
const { query }  = require('../config/database')

const router = express.Router()
const { version: packageVersion } = require('../../package.json')
const BUILD_ID = 'ia-modelos-configuraveis-0.4.6'

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
    version: packageVersion,
    build:   BUILD_ID,
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
