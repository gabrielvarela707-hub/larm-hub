/**
 * Versão 0.3.44 — Contas a Receber: contratos, receitas e parcelas — Fase 2.
 *
 * Evolui com_parcelas para se relacionar com fin_receitas, contrato item,
 * produto/serviço e tipo de receita, preservando a tabela existente.
 *
 * Execução: node scripts/migrate_receitas_parcelas_fase2.js
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const REQUIRED_TABLES = [
  'hub_tenants',
  'cad_pessoas',
  'cad_clientes',
  'cad_produtos',
  'fin_tipos_receita',
  'com_contratos',
  'com_contrato_itens',
  'fin_receitas',
  'com_parcelas',
]

async function assertRequiredTables(client) {
  const { rows } = await client.query(
    `SELECT relname
       FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind IN ('r', 'p')
        AND relname = ANY($1::text[])`,
    [REQUIRED_TABLES],
  )

  const found = new Set(rows.map(row => row.relname))
  const missing = REQUIRED_TABLES.filter(name => !found.has(name))
  if (missing.length) {
    throw new Error(
      `Pré-requisitos ausentes: ${missing.join(', ')}. ` +
      'Aplique primeiro migrate_receitas_contratos_fase1.js.',
    )
  }
}

async function addForeignKeyIfPossible(client, {
  table,
  constraint,
  column,
  referenceTable,
  referenceColumn = 'id',
  onDelete = 'SET NULL',
}) {
  const { rows: [ref] } = await client.query(
    'SELECT to_regclass($1) AS relation',
    [`public.${referenceTable}`],
  )
  if (!ref?.relation) return false

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = '${constraint}'
           AND conrelid = 'public.${table}'::regclass
      ) THEN
        ALTER TABLE public.${table}
          ADD CONSTRAINT ${constraint}
          FOREIGN KEY (${column})
          REFERENCES public.${referenceTable}(${referenceColumn})
          ON DELETE ${onDelete};
      END IF;
    END $$;
  `)
  return true
}

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    await assertRequiredTables(client)

    await client.query(`
      ALTER TABLE com_contrato_itens
        ADD COLUMN IF NOT EXISTS origem VARCHAR(30) NOT NULL DEFAULT 'larmhub',
        ADD COLUMN IF NOT EXISTS codigo_legado VARCHAR(120)
    `)

    await client.query(`
      ALTER TABLE com_parcelas
        ADD COLUMN IF NOT EXISTS receita_id UUID,
        ADD COLUMN IF NOT EXISTS contrato_item_id UUID,
        ADD COLUMN IF NOT EXISTS produto_id INTEGER,
        ADD COLUMN IF NOT EXISTS servico_id INTEGER,
        ADD COLUMN IF NOT EXISTS tipo_receita_id INTEGER,
        ADD COLUMN IF NOT EXISTS documento_legado VARCHAR(80),
        ADD COLUMN IF NOT EXISTS documento_base_legado VARCHAR(40),
        ADD COLUMN IF NOT EXISTS parcela_numero_legado INTEGER,
        ADD COLUMN IF NOT EXISTS parcela_total_legado INTEGER,
        ADD COLUMN IF NOT EXISTS obra_codigo_legado INTEGER,
        ADD COLUMN IF NOT EXISTS unidade_codigo_legado VARCHAR(80),
        ADD COLUMN IF NOT EXISTS indice_codigo_legado VARCHAR(30),
        ADD COLUMN IF NOT EXISTS valor_convertido NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS valor_residuo NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS valor_moras NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS valor_seguro NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS valor_juros_financiamento NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS valor_total_relatorio NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS origem VARCHAR(30) NOT NULL DEFAULT 'larmhub',
        ADD COLUMN IF NOT EXISTS codigo_legado VARCHAR(120),
        ADD COLUMN IF NOT EXISTS posicao_relatorio DATE,
        ADD COLUMN IF NOT EXISTS dados_adicionais JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    await addForeignKeyIfPossible(client, {
      table: 'com_parcelas',
      constraint: 'fk_com_parcelas_receita',
      column: 'receita_id',
      referenceTable: 'fin_receitas',
    })
    await addForeignKeyIfPossible(client, {
      table: 'com_parcelas',
      constraint: 'fk_com_parcelas_contrato_item',
      column: 'contrato_item_id',
      referenceTable: 'com_contrato_itens',
    })
    await addForeignKeyIfPossible(client, {
      table: 'com_parcelas',
      constraint: 'fk_com_parcelas_produto',
      column: 'produto_id',
      referenceTable: 'cad_produtos',
    })
    await addForeignKeyIfPossible(client, {
      table: 'com_parcelas',
      constraint: 'fk_com_parcelas_servico',
      column: 'servico_id',
      referenceTable: 'cad_servicos',
    })
    await addForeignKeyIfPossible(client, {
      table: 'com_parcelas',
      constraint: 'fk_com_parcelas_tipo_receita',
      column: 'tipo_receita_id',
      referenceTable: 'fin_tipos_receita',
    })

    await client.query(`
      ALTER TABLE com_parcelas DROP CONSTRAINT IF EXISTS com_parcelas_tipo_check;
      ALTER TABLE com_parcelas DROP CONSTRAINT IF EXISTS ck_com_parcelas_tipo_generico;

      ALTER TABLE com_parcelas
        ADD CONSTRAINT ck_com_parcelas_tipo_generico
        CHECK (tipo IN (
          'entrada','parcela','balao','aditivo','anual','renegociacao',
          'intermediaria','taxa','condominio','outros','comissao'
        )) NOT VALID;

      ALTER TABLE com_parcelas VALIDATE CONSTRAINT ck_com_parcelas_tipo_generico;
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_com_contrato_itens_legado
        ON com_contrato_itens(tenant_id, origem, codigo_legado)
        WHERE codigo_legado IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_com_parcelas_legado
        ON com_parcelas(tenant_id, origem, codigo_legado)
        WHERE codigo_legado IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_com_parcelas_receita
        ON com_parcelas(receita_id) WHERE receita_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_tipo_receita
        ON com_parcelas(tipo_receita_id) WHERE tipo_receita_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_produto
        ON com_parcelas(produto_id) WHERE produto_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_origem_posicao
        ON com_parcelas(tenant_id, origem, posicao_relatorio, vencimento);
    `)

    await client.query(`
      COMMENT ON COLUMN com_parcelas.receita_id IS 'Receita que originou a parcela.';
      COMMENT ON COLUMN com_parcelas.contrato_item_id IS 'Item de produto/serviço do contrato relacionado à parcela.';
      COMMENT ON COLUMN com_parcelas.valor_nominal IS 'Valor efetivamente apresentado no Contas a Receber; no legado Strato recebe o Total do relatório.';
      COMMENT ON COLUMN com_parcelas.valor_convertido IS 'Valor convertido/original informado pelo relatório legado.';
      COMMENT ON COLUMN com_parcelas.codigo_legado IS 'Identificador idempotente da parcela no sistema de origem.';
      COMMENT ON COLUMN com_parcelas.posicao_relatorio IS 'Data de posição do relatório usado na importação.';
    `)

    await client.query('COMMIT')

    const { rows: [summary] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE origem='strato_receber') AS parcelas_strato,
        COUNT(*) FILTER (WHERE receita_id IS NOT NULL) AS parcelas_com_receita,
        COUNT(*) FILTER (WHERE produto_id IS NOT NULL OR servico_id IS NOT NULL) AS parcelas_com_item
      FROM com_parcelas
    `)

    logger.info(
      '✅ Fase 2 de Receitas/Parcelas criada. ' +
      `Parcelas Strato atuais: ${summary.parcelas_strato}; ` +
      `parcelas com receita: ${summary.parcelas_com_receita}; ` +
      `parcelas com produto/serviço: ${summary.parcelas_com_item}.`,
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`❌ Erro na migration da Fase 2 de Receitas/Parcelas: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
