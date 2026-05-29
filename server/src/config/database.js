const { Pool } = require('pg')
const logger   = require('./logger')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'larmhub_prod',
  user:     process.env.DB_USER     || 'larmhub',
  password: process.env.DB_PASSWORD,
  // Pool config
  max:                20,
  idleTimeoutMillis:  30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false,
})

// Log de erros inesperados no pool
pool.on('error', (err) => {
  logger.error('Erro inesperado no pool PostgreSQL:', err)
})

async function connectDB() {
  try {
    const client = await pool.connect()
    const { rows } = await client.query('SELECT version()')
    logger.info(`✅  PostgreSQL conectado: ${rows[0].version.split(',')[0]}`)
    client.release()
  } catch (err) {
    logger.error('❌  Falha ao conectar no PostgreSQL:', err.message)
    throw err
  }
}

/**
 * Helper para queries simples
 * @param {string} text   - SQL com $1, $2…
 * @param {any[]}  params - valores
 */
async function query(text, params) {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const dur = Date.now() - start
    if (dur > 500) {
      logger.warn(`Query lenta (${dur}ms): ${text.slice(0, 80)}`)
    }
    return res
  } catch (err) {
    logger.error(`Erro na query: ${text.slice(0, 80)}\n${err.message}`)
    throw err
  }
}

/**
 * Helper para transações
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 */
async function transaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = { pool, connectDB, query, transaction }
