/**
 * scripts/migrate_rateio_contas_pagar_estrutura.js
 *
 * ETAPA 1 do rateio do Contas a Pagar.
 * Cria somente a estrutura de banco necessária para relacionar um documento
 * a vários lançamentos/contas bancárias. Não ativa rotas, telas ou regras de
 * rateio e não altera dados financeiros existentes.
 *
 * Rodar: node scripts/migrate_rateio_contas_pagar_estrutura.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const REQUIRED_TABLES = [
  'fin_lancamentos_cp',
  'fin_fornecedores',
  'fin_tipos_documento',
]

const LEGACY_DRAFT_COLUMNS = [
  'rateio_grupo_id',
  'rateio_principal_id',
  'rateio_item',
  'rateio_total_itens',
  'rateio_percentual',
  'rateio_valor_original',
]

async function assertPrerequisites(client) {
  const { rows: missingRows } = await client.query(
    `SELECT required.table_name
       FROM unnest($1::text[]) AS required(table_name)
      WHERE to_regclass('public.' || required.table_name) IS NULL`,
    [REQUIRED_TABLES],
  )

  if (missingRows.length > 0) {
    throw new Error(
      `Tabelas obrigatórias não encontradas: ${missingRows.map((row) => row.table_name).join(', ')}`,
    )
  }

  const { rows: legacyColumns } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'fin_lancamentos_cp'
        AND column_name = ANY($1::text[])
      ORDER BY column_name`,
    [LEGACY_DRAFT_COLUMNS],
  )

  if (legacyColumns.length > 0) {
    throw new Error(
      'Foi encontrada uma estrutura preliminar incompatível de rateio em fin_lancamentos_cp: '
      + legacyColumns.map((row) => row.column_name).join(', ')
      + '. Não continue sem revisar/remover o pacote preliminar anterior.',
    )
  }
}

async function assertColumnType(client) {
  const { rows } = await client.query(`
    SELECT data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'fin_lancamentos_cp'
       AND column_name = 'rateio_id'
  `)

  if (rows.length !== 1 || rows[0].data_type !== 'bigint') {
    throw new Error('A coluna fin_lancamentos_cp.rateio_id não foi criada como BIGINT.')
  }
}

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  logger.info('ETAPA 1: criando somente a estrutura de rateio do Contas a Pagar...')

  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '5s'")
    await client.query("SET LOCAL statement_timeout = '60s'")

    await assertPrerequisites(client)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_cp_rateios (
        id BIGSERIAL PRIMARY KEY,
        fornecedor_id INTEGER,
        tipo_documento_id INTEGER,
        nf_doc VARCHAR(100),
        valor_total NUMERIC(18,4) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ativo',
        documento_nome VARCHAR(255),
        documento_mime VARCHAR(120),
        documento_base64 TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      ALTER TABLE fin_lancamentos_cp
        ADD COLUMN IF NOT EXISTS rateio_id BIGINT
    `)

    await assertColumnType(client)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_cp_rateio_itens (
        id BIGSERIAL PRIMARY KEY,
        rateio_id BIGINT NOT NULL,
        lancamento_id INTEGER NOT NULL,
        ordem INTEGER NOT NULL,
        percentual NUMERIC(9,6) NOT NULL,
        valor NUMERIC(18,4) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_fin_cp_rateios_valor_total_positivo'
             AND conrelid = 'public.fin_cp_rateios'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateios
            ADD CONSTRAINT ck_fin_cp_rateios_valor_total_positivo
            CHECK (valor_total > 0);
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_fin_cp_rateios_status'
             AND conrelid = 'public.fin_cp_rateios'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateios
            ADD CONSTRAINT ck_fin_cp_rateios_status
            CHECK (status IN ('ativo', 'cancelado'));
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'fk_fin_cp_rateios_fornecedor'
             AND conrelid = 'public.fin_cp_rateios'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateios
            ADD CONSTRAINT fk_fin_cp_rateios_fornecedor
            FOREIGN KEY (fornecedor_id)
            REFERENCES fin_fornecedores(id)
            ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'fk_fin_cp_rateios_tipo_documento'
             AND conrelid = 'public.fin_cp_rateios'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateios
            ADD CONSTRAINT fk_fin_cp_rateios_tipo_documento
            FOREIGN KEY (tipo_documento_id)
            REFERENCES fin_tipos_documento(id)
            ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'fk_fin_lancamentos_cp_rateio'
             AND conrelid = 'public.fin_lancamentos_cp'::regclass
        ) THEN
          ALTER TABLE fin_lancamentos_cp
            ADD CONSTRAINT fk_fin_lancamentos_cp_rateio
            FOREIGN KEY (rateio_id)
            REFERENCES fin_cp_rateios(id)
            ON DELETE RESTRICT;
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'uq_fin_lancamentos_cp_id_rateio'
             AND conrelid = 'public.fin_lancamentos_cp'::regclass
        ) THEN
          ALTER TABLE fin_lancamentos_cp
            ADD CONSTRAINT uq_fin_lancamentos_cp_id_rateio
            UNIQUE (id, rateio_id);
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_fin_cp_rateio_itens_ordem_positiva'
             AND conrelid = 'public.fin_cp_rateio_itens'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateio_itens
            ADD CONSTRAINT ck_fin_cp_rateio_itens_ordem_positiva
            CHECK (ordem > 0);
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_fin_cp_rateio_itens_percentual'
             AND conrelid = 'public.fin_cp_rateio_itens'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateio_itens
            ADD CONSTRAINT ck_fin_cp_rateio_itens_percentual
            CHECK (percentual > 0 AND percentual <= 100);
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_fin_cp_rateio_itens_valor_positivo'
             AND conrelid = 'public.fin_cp_rateio_itens'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateio_itens
            ADD CONSTRAINT ck_fin_cp_rateio_itens_valor_positivo
            CHECK (valor > 0);
        END IF;

        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'fk_fin_cp_rateio_itens_lancamento_rateio'
             AND conrelid = 'public.fin_cp_rateio_itens'::regclass
        ) THEN
          ALTER TABLE fin_cp_rateio_itens
            ADD CONSTRAINT fk_fin_cp_rateio_itens_lancamento_rateio
            FOREIGN KEY (lancamento_id, rateio_id)
            REFERENCES fin_lancamentos_cp(id, rateio_id)
            ON DELETE RESTRICT;
        END IF;
      END
      $$
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_lancamentos_cp_rateio_id
      ON fin_lancamentos_cp (rateio_id)
      WHERE rateio_id IS NOT NULL
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_cp_rateios_documento
      ON fin_cp_rateios (fornecedor_id, tipo_documento_id, nf_doc)
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_cp_rateio_itens_lancamento
      ON fin_cp_rateio_itens (lancamento_id)
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_cp_rateio_itens_ordem
      ON fin_cp_rateio_itens (rateio_id, ordem)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fin_cp_rateio_itens_rateio
      ON fin_cp_rateio_itens (rateio_id)
    `)

    await client.query(`
      COMMENT ON TABLE fin_cp_rateios IS
      'Documento original que será dividido entre dois ou mais lançamentos de Contas a Pagar.'
    `)

    await client.query(`
      COMMENT ON TABLE fin_cp_rateio_itens IS
      'Relação entre o grupo de rateio e cada lançamento individual do Contas a Pagar.'
    `)

    await client.query(`
      COMMENT ON COLUMN fin_lancamentos_cp.rateio_id IS
      'Grupo de rateio do documento. Nulo para lançamentos comuns e registros anteriores.'
    `)

    const { rows: existingLinks } = await client.query(`
      SELECT COUNT(*)::INTEGER AS total
        FROM fin_lancamentos_cp
       WHERE rateio_id IS NOT NULL
    `)

    await client.query('COMMIT')

    logger.info('✅ Estrutura criada/validada sem alterar lançamentos existentes.')
    logger.info(`Lançamentos já vinculados a rateio: ${existingLinks[0].total}`)
    logger.info('✅ Nenhuma rota, tela, baixa ou regra de duplicidade foi ativada nesta etapa.')
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {}

    logger.error(`❌ Falha na estrutura de rateio: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
