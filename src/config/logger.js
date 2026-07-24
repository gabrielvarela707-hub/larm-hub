const winston = require('winston')
const path    = require('path')
const fs      = require('fs')

const logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

const { combine, timestamp, printf, colorize, errors } = winston.format

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack
      ? `${timestamp} ${level}: ${message}\n${stack}`
      : `${timestamp} ${level}: ${message}`
  )
)

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
)

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    }),
  ],
})

// Adiciona nível http (usado pelo morgan)
logger.http = (msg) => logger.log('http', msg)

module.exports = logger
