require('dotenv').config()
require('express-async-errors')

const express = require('express')
const cors    = require('cors')
const helmet  = require('helmet')
const morgan  = require('morgan')

const { connectDB }     = require('./config/database')
const logger            = require('./config/logger')
const errorHandler      = require('./middleware/errorHandler')
const rateLimiter       = require('./middleware/rateLimiter')

// ─── Routes ──────────────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth')
const healthRoutes      = require('./routes/health')
const stratoRoutes      = require('./routes/strato')
const financeiroRoutes  = require('./routes/financeiro')

const app  = express()
const PORT = process.env.PORT || 3001

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet())
app.set('trust proxy', 1)

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())

app.use(cors({
  origin: (origin, cb) => {
    // Permite requests sem origin (Postman, cURL, server-to-server)
    if (!origin) return cb(null, true)
    if (allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS bloqueado para: ${origin}`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
}))

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ─── Logger HTTP ──────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: msg => logger.http(msg.trim()) },
}))

// ─── Rate Limit global ────────────────────────────────────────────────────────
app.use(rateLimiter)

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/health', healthRoutes)
app.use('/auth',   authRoutes)
app.use('/strato',     stratoRoutes)
app.use('/financeiro', financeiroRoutes)

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Rota não encontrada' })
})

// Error handler global
app.use(errorHandler)

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function bootstrap() {
  await connectDB()
  app.listen(PORT, () => {
    logger.info(`🚀  API rodando em http://localhost:${PORT}`)
    logger.info(`🌍  Env: ${process.env.NODE_ENV}`)
    logger.info(`🔗  CORS: ${allowedOrigins.join(' | ')}`)
  })
}

bootstrap().catch(err => {
  logger.error('Falha ao iniciar servidor:', err)
  process.exit(1)
})
