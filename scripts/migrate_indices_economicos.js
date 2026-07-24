/**
 * server/scripts/migrate_indices_economicos.js
 * Cria o catálogo flexível de índices econômicos e seus valores mensais.
 *
 * A tabela antiga fin_indices_economicos é preservada e seus dados são copiados
 * uma única vez para o novo modelo, sem apagar ou recriar registros existentes.
 *
 * Rodar: node scripts/migrate_indices_economicos.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  logger.info('Criando/atualizando estrutura flexível de índices econômicos...')

  try {
    await pool.query('BEGIN')

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_indice_tipos (
        id                   SERIAL PRIMARY KEY,
        tenant_id            UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        codigo               VARCHAR(30) NOT NULL,
        nome                 VARCHAR(120) NOT NULL,
        fonte                VARCHAR(160),
        ativo                BOOLEAN NOT NULL DEFAULT TRUE,
        created_by           UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        updated_by           UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_indice_tipos_tenant_codigo UNIQUE (tenant_id, codigo)
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS fin_indice_valores (
        id                   SERIAL PRIMARY KEY,
        tenant_id            UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        indice_tipo_id       INTEGER NOT NULL REFERENCES fin_indice_tipos(id) ON DELETE RESTRICT,
        referencia           DATE NOT NULL,
        variacao_mensal      NUMERIC(18,8) NOT NULL,
        variacao_periodo     NUMERIC(18,8),
        acumulado_12m        NUMERIC(18,8),
        created_by           UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        updated_by           UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_indice_valores_tenant_tipo_mes UNIQUE (tenant_id, indice_tipo_id, referencia),
        CONSTRAINT ck_fin_indice_valores_referencia_mes CHECK (EXTRACT(DAY FROM referencia) = 1)
      )
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_indice_tipos_tenant_ativo
      ON fin_indice_tipos (tenant_id, ativo, codigo)
    `)

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_indice_valores_tenant_referencia
      ON fin_indice_valores (tenant_id, referencia DESC, indice_tipo_id)
    `)

    await pool.query(`
      INSERT INTO fin_indice_tipos (tenant_id, codigo, nome, fonte, ativo)
      SELECT
        t.id,
        defaults.codigo,
        defaults.nome,
        defaults.fonte,
        TRUE
      FROM hub_tenants t
      CROSS JOIN (
        VALUES
          ('IGPM', 'IGP-M', 'FGV'),
          ('IPCA', 'IPCA', NULL),
          ('INCC', 'INCC', 'FGV'),
          ('IPC', 'IPC', 'FIPE'),
          ('INPC', 'INPC', 'IBGE')
      ) AS defaults(codigo, nome, fonte)
      ON CONFLICT (tenant_id, codigo)
      DO UPDATE SET
        nome = EXCLUDED.nome,
        fonte = COALESCE(fin_indice_tipos.fonte, EXCLUDED.fonte),
        ativo = TRUE,
        updated_at = NOW()
    `)

    const { rows: [legacyInfo] } = await pool.query(`
      SELECT TO_REGCLASS('public.fin_indices_economicos') IS NOT NULL AS existe
    `)

    if (legacyInfo?.existe) {
      logger.info('Copiando dados existentes de fin_indices_economicos para o modelo flexível...')

      await pool.query(`
        INSERT INTO fin_indice_valores
          (tenant_id, indice_tipo_id, referencia, variacao_mensal, variacao_periodo,
           acumulado_12m, created_by, updated_by, created_at, updated_at)
        SELECT
          old.tenant_id,
          tipo.id,
          old.referencia,
          old.igpm,
          NULL,
          NULL,
          old.created_by,
          old.updated_by,
          old.created_at,
          old.updated_at
        FROM fin_indices_economicos old
        JOIN fin_indice_tipos tipo
          ON tipo.tenant_id = old.tenant_id
         AND tipo.codigo = 'IGPM'
        WHERE old.igpm IS NOT NULL
        ON CONFLICT (tenant_id, indice_tipo_id, referencia) DO NOTHING
      `)

      await pool.query(`
        INSERT INTO fin_indice_valores
          (tenant_id, indice_tipo_id, referencia, variacao_mensal, variacao_periodo,
           acumulado_12m, created_by, updated_by, created_at, updated_at)
        SELECT
          old.tenant_id,
          tipo.id,
          old.referencia,
          old.ipca,
          NULL,
          NULL,
          old.created_by,
          old.updated_by,
          old.created_at,
          old.updated_at
        FROM fin_indices_economicos old
        JOIN fin_indice_tipos tipo
          ON tipo.tenant_id = old.tenant_id
         AND tipo.codigo = 'IPCA'
        WHERE old.ipca IS NOT NULL
        ON CONFLICT (tenant_id, indice_tipo_id, referencia) DO NOTHING
      `)

      const { rows: [inccColumns] } = await pool.query(`
        SELECT COUNT(*) = 2 AS existe
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'fin_indices_economicos'
          AND column_name IN ('incc', 'incc_acumulado_12m')
      `)

      if (inccColumns?.existe) {
        await pool.query(`
          INSERT INTO fin_indice_valores
            (tenant_id, indice_tipo_id, referencia, variacao_mensal, variacao_periodo,
             acumulado_12m, created_by, updated_by, created_at, updated_at)
          SELECT
            old.tenant_id,
            tipo.id,
            old.referencia,
            old.incc,
            NULL,
            old.incc_acumulado_12m,
            old.created_by,
            old.updated_by,
            old.created_at,
            old.updated_at
          FROM fin_indices_economicos old
          JOIN fin_indice_tipos tipo
            ON tipo.tenant_id = old.tenant_id
           AND tipo.codigo = 'INCC'
          WHERE old.incc IS NOT NULL
          ON CONFLICT (tenant_id, indice_tipo_id, referencia) DO NOTHING
        `)
      }
    }

    await pool.query('COMMIT')
    logger.info('✅ Estrutura flexível de índices econômicos criada/verificada com sucesso')
  } catch (err) {
    await pool.query('ROLLBACK')
    logger.error('❌ Erro ao criar estrutura flexível de índices econômicos: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
