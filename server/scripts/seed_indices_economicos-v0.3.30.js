/**
 * server/scripts/seed_indices_economicos.js
 * Seed inicial dos índices mensais informados pelo cliente.
 *
 * Período:
 *   - IGP-M e IPCA: jan/2025 a mai/2026
 *   - INCC e acumulado 12 meses: mai/2025 a mai/2026
 *
 * Idempotente: atualiza o mesmo mês sem duplicar.
 * Rodar: node scripts/seed_indices_economicos.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const INDICES = [
  { referencia: '2025-01-01', igpm: 0.27,  ipca: 0.16, incc: null, incc_acumulado_12m: null },
  { referencia: '2025-02-01', igpm: 1.06,  ipca: 1.31, incc: null, incc_acumulado_12m: null },
  { referencia: '2025-03-01', igpm: -0.34, ipca: 0.56, incc: null, incc_acumulado_12m: null },
  { referencia: '2025-04-01', igpm: 0.24,  ipca: 0.43, incc: null, incc_acumulado_12m: null },
  { referencia: '2025-05-01', igpm: -0.49, ipca: 0.26, incc: 0.26, incc_acumulado_12m: 7.17 },
  { referencia: '2025-06-01', igpm: -1.67, ipca: 0.24, incc: 0.96, incc_acumulado_12m: 7.19 },
  { referencia: '2025-07-01', igpm: -0.77, ipca: 0.26, incc: 0.91, incc_acumulado_12m: 7.43 },
  { referencia: '2025-08-01', igpm: 0.36,  ipca: -0.11, incc: 0.70, incc_acumulado_12m: 7.49 },
  { referencia: '2025-09-01', igpm: 0.42,  ipca: 0.48, incc: 0.21, incc_acumulado_12m: 7.07 },
  { referencia: '2025-10-01', igpm: -0.36, ipca: 0.09, incc: 0.21, incc_acumulado_12m: 6.58 },
  { referencia: '2025-11-01', igpm: 0.27,  ipca: 0.18, incc: 0.28, incc_acumulado_12m: 6.41 },
  { referencia: '2025-12-01', igpm: -0.01, ipca: 0.33, incc: 0.21, incc_acumulado_12m: 6.10 },
  { referencia: '2026-01-01', igpm: 0.41,  ipca: 0.33, incc: 0.63, incc_acumulado_12m: 6.01 },
  { referencia: '2026-02-01', igpm: -0.73, ipca: 0.70, incc: 0.34, incc_acumulado_12m: 5.83 },
  { referencia: '2026-03-01', igpm: 0.52,  ipca: 0.88, incc: 0.36, incc_acumulado_12m: 5.81 },
  { referencia: '2026-04-01', igpm: 2.73,  ipca: 0.67, incc: 1.04, incc_acumulado_12m: 6.28 },
  { referencia: '2026-05-01', igpm: 0.84,  ipca: 0.58, incc: 0.77, incc_acumulado_12m: 6.82 },
]

async function seed() {
  await connectDB()

  const { rows: tenants } = await pool.query('SELECT id, name FROM hub_tenants ORDER BY name')
  logger.info(`Aplicando histórico de índices para ${tenants.length} tenant(s)...`)

  let gravados = 0

  try {
    await pool.query('BEGIN')

    for (const tenant of tenants) {
      for (const item of INDICES) {
        await pool.query(
          `INSERT INTO fin_indices_economicos
             (tenant_id, referencia, igpm, ipca, incc, incc_acumulado_12m)
           VALUES ($1, $2::date, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, referencia)
           DO UPDATE SET
             igpm = EXCLUDED.igpm,
             ipca = EXCLUDED.ipca,
             incc = EXCLUDED.incc,
             incc_acumulado_12m = EXCLUDED.incc_acumulado_12m,
             updated_at = NOW()`,
          [
            tenant.id,
            item.referencia,
            item.igpm,
            item.ipca,
            item.incc,
            item.incc_acumulado_12m,
          ]
        )
        gravados++
      }

      logger.info(`  ✅ [${tenant.name}] ${INDICES.length} meses inseridos/atualizados`)
    }

    await pool.query('COMMIT')
    logger.info(`✅ Seed concluído: ${gravados} registro(s) inseridos/atualizados`)
  } catch (err) {
    await pool.query('ROLLBACK')
    throw err
  } finally {
    await pool.end()
  }
}

seed().catch(err => {
  logger.error('❌ Erro ao aplicar seed de índices econômicos: ' + err.message)
  process.exit(1)
})
