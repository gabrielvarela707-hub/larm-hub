/**
 * server/scripts/seed_indices_economicos.js
 * Seed inicial do catálogo flexível de índices econômicos.
 *
 * Séries incluídas:
 *   - IGP-M: jan/2025 a mai/2026
 *   - IPCA: jan/2025 a mai/2026
 *   - INCC: mai/2025 a mai/2026
 *   - IPC/FIPE: jan/2025 a mai/2026
 *   - INPC: jun/2025 a mai/2026
 *
 * Idempotente: atualiza o mesmo índice/mês sem duplicar.
 * Rodar: node scripts/seed_indices_economicos.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const TIPOS = [
  { codigo: 'IGPM', nome: 'IGP-M', fonte: 'FGV' },
  { codigo: 'IPCA', nome: 'IPCA', fonte: 'IBGE' },
  { codigo: 'INCC', nome: 'INCC', fonte: 'FGV' },
  { codigo: 'IPC', nome: 'IPC', fonte: 'FIPE' },
  { codigo: 'INPC', nome: 'INPC', fonte: 'IBGE' },
]

const VALORES = [
  // IGP-M
  { codigo: 'IGPM', referencia: '2025-01-01', mensal: 0.27 },
  { codigo: 'IGPM', referencia: '2025-02-01', mensal: 1.06 },
  { codigo: 'IGPM', referencia: '2025-03-01', mensal: -0.34 },
  { codigo: 'IGPM', referencia: '2025-04-01', mensal: 0.24 },
  { codigo: 'IGPM', referencia: '2025-05-01', mensal: -0.49 },
  { codigo: 'IGPM', referencia: '2025-06-01', mensal: -1.67 },
  { codigo: 'IGPM', referencia: '2025-07-01', mensal: -0.77 },
  { codigo: 'IGPM', referencia: '2025-08-01', mensal: 0.36 },
  { codigo: 'IGPM', referencia: '2025-09-01', mensal: 0.42 },
  { codigo: 'IGPM', referencia: '2025-10-01', mensal: -0.36 },
  { codigo: 'IGPM', referencia: '2025-11-01', mensal: 0.27 },
  { codigo: 'IGPM', referencia: '2025-12-01', mensal: -0.01 },
  { codigo: 'IGPM', referencia: '2026-01-01', mensal: 0.41 },
  { codigo: 'IGPM', referencia: '2026-02-01', mensal: -0.73 },
  { codigo: 'IGPM', referencia: '2026-03-01', mensal: 0.52 },
  { codigo: 'IGPM', referencia: '2026-04-01', mensal: 2.73 },
  { codigo: 'IGPM', referencia: '2026-05-01', mensal: 0.84 },

  // IPCA
  { codigo: 'IPCA', referencia: '2025-01-01', mensal: 0.16 },
  { codigo: 'IPCA', referencia: '2025-02-01', mensal: 1.31 },
  { codigo: 'IPCA', referencia: '2025-03-01', mensal: 0.56 },
  { codigo: 'IPCA', referencia: '2025-04-01', mensal: 0.43 },
  { codigo: 'IPCA', referencia: '2025-05-01', mensal: 0.26 },
  { codigo: 'IPCA', referencia: '2025-06-01', mensal: 0.24 },
  { codigo: 'IPCA', referencia: '2025-07-01', mensal: 0.26 },
  { codigo: 'IPCA', referencia: '2025-08-01', mensal: -0.11 },
  { codigo: 'IPCA', referencia: '2025-09-01', mensal: 0.48 },
  { codigo: 'IPCA', referencia: '2025-10-01', mensal: 0.09 },
  { codigo: 'IPCA', referencia: '2025-11-01', mensal: 0.18 },
  { codigo: 'IPCA', referencia: '2025-12-01', mensal: 0.33 },
  { codigo: 'IPCA', referencia: '2026-01-01', mensal: 0.33 },
  { codigo: 'IPCA', referencia: '2026-02-01', mensal: 0.70 },
  { codigo: 'IPCA', referencia: '2026-03-01', mensal: 0.88 },
  { codigo: 'IPCA', referencia: '2026-04-01', mensal: 0.67 },
  { codigo: 'IPCA', referencia: '2026-05-01', mensal: 0.58 },

  // INCC
  { codigo: 'INCC', referencia: '2025-05-01', mensal: 0.26, acumulado12m: 7.17 },
  { codigo: 'INCC', referencia: '2025-06-01', mensal: 0.96, acumulado12m: 7.19 },
  { codigo: 'INCC', referencia: '2025-07-01', mensal: 0.91, acumulado12m: 7.43 },
  { codigo: 'INCC', referencia: '2025-08-01', mensal: 0.70, acumulado12m: 7.49 },
  { codigo: 'INCC', referencia: '2025-09-01', mensal: 0.21, acumulado12m: 7.07 },
  { codigo: 'INCC', referencia: '2025-10-01', mensal: 0.21, acumulado12m: 6.58 },
  { codigo: 'INCC', referencia: '2025-11-01', mensal: 0.28, acumulado12m: 6.41 },
  { codigo: 'INCC', referencia: '2025-12-01', mensal: 0.21, acumulado12m: 6.10 },
  { codigo: 'INCC', referencia: '2026-01-01', mensal: 0.63, acumulado12m: 6.01 },
  { codigo: 'INCC', referencia: '2026-02-01', mensal: 0.34, acumulado12m: 5.83 },
  { codigo: 'INCC', referencia: '2026-03-01', mensal: 0.36, acumulado12m: 5.81 },
  { codigo: 'INCC', referencia: '2026-04-01', mensal: 1.04, acumulado12m: 6.28 },
  { codigo: 'INCC', referencia: '2026-05-01', mensal: 0.77, acumulado12m: 6.82 },

  // IPC/FIPE — primeira posição da linha = janeiro; última = dezembro.
  { codigo: 'IPC', referencia: '2025-01-01', mensal: 0.24 },
  { codigo: 'IPC', referencia: '2025-02-01', mensal: 0.51 },
  { codigo: 'IPC', referencia: '2025-03-01', mensal: 0.62 },
  { codigo: 'IPC', referencia: '2025-04-01', mensal: 0.45 },
  { codigo: 'IPC', referencia: '2025-05-01', mensal: 0.27 },
  { codigo: 'IPC', referencia: '2025-06-01', mensal: -0.08 },
  { codigo: 'IPC', referencia: '2025-07-01', mensal: 0.28 },
  { codigo: 'IPC', referencia: '2025-08-01', mensal: 0.04 },
  { codigo: 'IPC', referencia: '2025-09-01', mensal: 0.65 },
  { codigo: 'IPC', referencia: '2025-10-01', mensal: 0.27 },
  { codigo: 'IPC', referencia: '2025-11-01', mensal: 0.20 },
  { codigo: 'IPC', referencia: '2025-12-01', mensal: 0.32 },
  { codigo: 'IPC', referencia: '2026-01-01', mensal: 0.21 },
  { codigo: 'IPC', referencia: '2026-02-01', mensal: 0.25 },
  { codigo: 'IPC', referencia: '2026-03-01', mensal: 0.59 },
  { codigo: 'IPC', referencia: '2026-04-01', mensal: 0.40 },
  { codigo: 'IPC', referencia: '2026-05-01', mensal: 0.45 },

  // INPC
  { codigo: 'INPC', referencia: '2025-06-01', mensal: 0.23, periodo: 0.23, acumulado12m: 5.1804 },
  { codigo: 'INPC', referencia: '2025-07-01', mensal: 0.21, periodo: 0.44, acumulado12m: 5.1280 },
  { codigo: 'INPC', referencia: '2025-08-01', mensal: -0.21, periodo: 0.23, acumulado12m: 5.0543 },
  { codigo: 'INPC', referencia: '2025-09-01', mensal: 0.52, periodo: 0.75, acumulado12m: 5.0961 },
  { codigo: 'INPC', referencia: '2025-10-01', mensal: 0.03, periodo: 0.78, acumulado12m: 4.4902 },
  { codigo: 'INPC', referencia: '2025-11-01', mensal: 0.03, periodo: 0.81, acumulado12m: 4.1778 },
  { codigo: 'INPC', referencia: '2025-12-01', mensal: 0.21, periodo: 1.02, acumulado12m: 3.8979 },
  { codigo: 'INPC', referencia: '2026-01-01', mensal: 0.39, periodo: 1.42, acumulado12m: 4.3031 },
  { codigo: 'INPC', referencia: '2026-02-01', mensal: 0.56, periodo: 1.98, acumulado12m: 3.3575 },
  { codigo: 'INPC', referencia: '2026-03-01', mensal: 0.91, periodo: 2.91, acumulado12m: 3.7688 },
  { codigo: 'INPC', referencia: '2026-04-01', mensal: 0.81, periodo: 3.75, acumulado12m: 4.1096 },
  { codigo: 'INPC', referencia: '2026-05-01', mensal: 0.65, periodo: 4.42, acumulado12m: 4.4208 },
]

async function seed() {
  await connectDB()

  const { rows: tenants } = await pool.query('SELECT id, name FROM hub_tenants ORDER BY name')
  logger.info(`Aplicando catálogo e histórico de índices para ${tenants.length} tenant(s)...`)

  let gravados = 0

  try {
    await pool.query('BEGIN')

    for (const tenant of tenants) {
      const typeIds = new Map()

      for (const tipo of TIPOS) {
        const { rows: [savedType] } = await pool.query(
          `INSERT INTO fin_indice_tipos
             (tenant_id, codigo, nome, fonte, ativo)
           VALUES ($1, $2, $3, $4, TRUE)
           ON CONFLICT (tenant_id, codigo)
           DO UPDATE SET
             nome = EXCLUDED.nome,
             fonte = EXCLUDED.fonte,
             ativo = TRUE,
             updated_at = NOW()
           RETURNING id`,
          [tenant.id, tipo.codigo, tipo.nome, tipo.fonte]
        )
        typeIds.set(tipo.codigo, savedType.id)
      }

      for (const item of VALORES) {
        const typeId = typeIds.get(item.codigo)
        if (!typeId) throw new Error(`Tipo ${item.codigo} não foi criado para o tenant ${tenant.name}`)

        await pool.query(
          `INSERT INTO fin_indice_valores
             (tenant_id, indice_tipo_id, referencia, variacao_mensal, variacao_periodo, acumulado_12m)
           VALUES ($1, $2, $3::date, $4, $5, $6)
           ON CONFLICT (tenant_id, indice_tipo_id, referencia)
           DO UPDATE SET
             variacao_mensal = EXCLUDED.variacao_mensal,
             variacao_periodo = EXCLUDED.variacao_periodo,
             acumulado_12m = EXCLUDED.acumulado_12m,
             updated_at = NOW()`,
          [
            tenant.id,
            typeId,
            item.referencia,
            item.mensal,
            item.periodo ?? null,
            item.acumulado12m ?? null,
          ]
        )
        gravados++
      }

      logger.info(`  ✅ [${tenant.name}] ${TIPOS.length} tipos e ${VALORES.length} valores inseridos/atualizados`)
    }

    await pool.query('COMMIT')
    logger.info(`✅ Seed concluído: ${gravados} valor(es) inserido(s)/atualizado(s)`)
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
