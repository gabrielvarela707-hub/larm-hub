/**
 * scripts/seed_plano_contas.js
 * Seed do plano de contas a partir da planilha "Plano de contas financeiro.xlsx".
 *
 * Rodar:
 *   node scripts/seed_plano_contas.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')
const { PLANO_CONTAS_SEED } = require('../src/data/plano_contas_seed')

async function seedPlanoContas() {
  await connectDB()
  logger.info('Iniciando seed do plano de contas...')

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_plano_contas (
        id        SERIAL PRIMARY KEY,
        codigo    VARCHAR(20) NOT NULL UNIQUE,
        descricao TEXT NOT NULL,
        tipo      CHAR(1) DEFAULT 'A',
        pai_id    INTEGER REFERENCES fin_plano_contas(id),
        ativo     BOOLEAN DEFAULT TRUE
      )
    `)

    let upserts = 0

    for (const item of PLANO_CONTAS_SEED) {
      await pool.query(
        `INSERT INTO fin_plano_contas (codigo, descricao, tipo, ativo)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (codigo) DO UPDATE
            SET descricao = EXCLUDED.descricao,
                tipo = EXCLUDED.tipo,
                ativo = true`,
        [item.codigo, item.descricao, item.tipo || 'A']
      )
      upserts++
    }

    for (const item of PLANO_CONTAS_SEED) {
      if (!item.pai_codigo) {
        await pool.query('UPDATE fin_plano_contas SET pai_id = NULL WHERE codigo = $1', [item.codigo])
        continue
      }

      await pool.query(
        `UPDATE fin_plano_contas filho
            SET pai_id = pai.id
           FROM fin_plano_contas pai
          WHERE filho.codigo = $1
            AND pai.codigo = $2
            AND filho.id <> pai.id`,
        [item.codigo, item.pai_codigo]
      )
    }

    logger.info(`✅ Seed concluído: ${upserts} contas criadas/atualizadas`)
  } catch (err) {
    logger.error('❌ Erro no seed do plano de contas: ' + err.message)
    logger.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

seedPlanoContas()
