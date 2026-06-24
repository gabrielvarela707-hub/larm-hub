/**
 * Versão 0.3.43 — Estrutura comercial/receitas — Fase 1.
 *
 * Cria produtos, serviços, tipos de receita, receitas e itens de contrato.
 * Evolui com_contratos para usar cad_clientes sem remover campos legados.
 * As parcelas NÃO são recriadas nesta fase: com_parcelas será evoluída na Fase 2.
 *
 * Execução: node scripts/migrate_receitas_contratos_fase1.js
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const REQUIRED_TABLES = ['hub_tenants', 'cad_pessoas', 'cad_clientes', 'com_contratos']

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
      'Aplique primeiro as migrations de cad_pessoas/cad_clientes e de recebíveis.',
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
      CREATE TABLE IF NOT EXISTS cad_produtos (
        id                    SERIAL PRIMARY KEY,
        tenant_id             UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        codigo                VARCHAR(60),
        nome                  VARCHAR(200) NOT NULL,
        descricao             TEXT,
        tipo                  VARCHAR(30) NOT NULL DEFAULT 'produto',
        produto_pai_id        INTEGER REFERENCES cad_produtos(id) ON DELETE SET NULL,
        unidade_medida        VARCHAR(30),
        valor_padrao          NUMERIC(14,2),
        plano_conta_id        INTEGER,
        origem_legada         VARCHAR(40),
        codigo_legado         VARCHAR(80),
        dados_adicionais      JSONB NOT NULL DEFAULT '{}'::jsonb,
        ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_cad_produtos_tipo CHECK (
          tipo IN ('produto','obra','empreendimento','unidade','lote','aluguel','imovel','outro')
        )
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS cad_servicos (
        id                    SERIAL PRIMARY KEY,
        tenant_id             UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        codigo                VARCHAR(60),
        nome                  VARCHAR(500) NOT NULL,
        descricao             TEXT,
        codigo_fiscal         VARCHAR(60),
        item_lista_servico    VARCHAR(30),
        unidade_medida        VARCHAR(30),
        valor_padrao          NUMERIC(14,2),
        periodicidade_padrao  VARCHAR(30) NOT NULL DEFAULT 'unica',
        gera_receita_recorrente BOOLEAN NOT NULL DEFAULT FALSE,
        plano_conta_id        INTEGER,
        origem_legada         VARCHAR(40),
        codigo_legado         VARCHAR(80),
        dados_adicionais      JSONB NOT NULL DEFAULT '{}'::jsonb,
        ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_cad_servicos_periodicidade CHECK (
          periodicidade_padrao IN ('unica','diaria','semanal','mensal','bimestral','trimestral','semestral','anual','personalizada')
        )
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_tipos_receita (
        id                    SERIAL PRIMARY KEY,
        tenant_id             UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        codigo                VARCHAR(40) NOT NULL,
        nome                  VARCHAR(120) NOT NULL,
        codigo_legado         VARCHAR(20),
        categoria             VARCHAR(30) NOT NULL DEFAULT 'contratual',
        gera_parcela          BOOLEAN NOT NULL DEFAULT TRUE,
        descricao             TEXT,
        ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_tipos_receita_tenant_codigo UNIQUE (tenant_id, codigo),
        CONSTRAINT ck_fin_tipos_receita_categoria CHECK (
          categoria IN ('contratual','operacional','taxa','ajuste','financeira','outro')
        )
      )
    `)

    await client.query(`
      ALTER TABLE com_contratos
        ADD COLUMN IF NOT EXISTS cliente_id INTEGER,
        ADD COLUMN IF NOT EXISTS titulo VARCHAR(180),
        ADD COLUMN IF NOT EXISTS tipo_contrato VARCHAR(30) NOT NULL DEFAULT 'venda',
        ADD COLUMN IF NOT EXISTS data_inicio DATE,
        ADD COLUMN IF NOT EXISTS data_fim DATE,
        ADD COLUMN IF NOT EXISTS data_assinatura DATE,
        ADD COLUMN IF NOT EXISTS indice_reajuste_id INTEGER,
        ADD COLUMN IF NOT EXISTS reajuste_periodicidade_meses INTEGER,
        ADD COLUMN IF NOT EXISTS codigo_legado VARCHAR(80),
        ADD COLUMN IF NOT EXISTS origem VARCHAR(30) NOT NULL DEFAULT 'larmhub',
        ADD COLUMN IF NOT EXISTS obra_codigo_legado INTEGER,
        ADD COLUMN IF NOT EXISTS unidade_codigo_legado VARCHAR(80),
        ADD COLUMN IF NOT EXISTS dados_adicionais JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'ck_com_contratos_tipo_generico'
             AND conrelid = 'public.com_contratos'::regclass
        ) THEN
          ALTER TABLE com_contratos
            ADD CONSTRAINT ck_com_contratos_tipo_generico
            CHECK (tipo_contrato IN ('venda','aluguel','prestacao_servico','cessao','aditivo','renegociacao','outro'))
            NOT VALID;
        END IF;
      END $$;
    `)

    await addForeignKeyIfPossible(client, {
      table: 'com_contratos',
      constraint: 'fk_com_contratos_cliente',
      column: 'cliente_id',
      referenceTable: 'cad_clientes',
      onDelete: 'SET NULL',
    })
    await addForeignKeyIfPossible(client, {
      table: 'com_contratos',
      constraint: 'fk_com_contratos_indice_reajuste',
      column: 'indice_reajuste_id',
      referenceTable: 'fin_indice_tipos',
      onDelete: 'SET NULL',
    })

    await client.query(`
      CREATE TABLE IF NOT EXISTS com_contrato_itens (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id             UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        contrato_id           UUID NOT NULL REFERENCES com_contratos(id) ON DELETE CASCADE,
        produto_id            INTEGER REFERENCES cad_produtos(id) ON DELETE SET NULL,
        servico_id            INTEGER REFERENCES cad_servicos(id) ON DELETE SET NULL,
        tipo_receita_id       INTEGER REFERENCES fin_tipos_receita(id) ON DELETE SET NULL,
        descricao             TEXT NOT NULL,
        quantidade            NUMERIC(14,4) NOT NULL DEFAULT 1,
        valor_unitario        NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
        periodicidade         VARCHAR(30) NOT NULL DEFAULT 'unica',
        dia_vencimento        INTEGER,
        data_inicio           DATE,
        data_fim              DATE,
        indice_reajuste_id    INTEGER,
        gera_recebiveis       BOOLEAN NOT NULL DEFAULT TRUE,
        ordem                 INTEGER NOT NULL DEFAULT 0,
        dados_adicionais      JSONB NOT NULL DEFAULT '{}'::jsonb,
        ativo                 BOOLEAN NOT NULL DEFAULT TRUE,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_com_contrato_itens_origem CHECK (
          NOT (produto_id IS NOT NULL AND servico_id IS NOT NULL)
        ),
        CONSTRAINT ck_com_contrato_itens_periodicidade CHECK (
          periodicidade IN ('unica','diaria','semanal','mensal','bimestral','trimestral','semestral','anual','personalizada')
        ),
        CONSTRAINT ck_com_contrato_itens_dia CHECK (
          dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 31
        )
      )
    `)

    await addForeignKeyIfPossible(client, {
      table: 'com_contrato_itens',
      constraint: 'fk_com_contrato_itens_indice',
      column: 'indice_reajuste_id',
      referenceTable: 'fin_indice_tipos',
      onDelete: 'SET NULL',
    })

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_receitas (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id             UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        cliente_id            INTEGER NOT NULL REFERENCES cad_clientes(id) ON DELETE RESTRICT,
        contrato_id           UUID REFERENCES com_contratos(id) ON DELETE SET NULL,
        contrato_item_id      UUID REFERENCES com_contrato_itens(id) ON DELETE SET NULL,
        produto_id            INTEGER REFERENCES cad_produtos(id) ON DELETE SET NULL,
        servico_id            INTEGER REFERENCES cad_servicos(id) ON DELETE SET NULL,
        tipo_receita_id       INTEGER REFERENCES fin_tipos_receita(id) ON DELETE SET NULL,
        plano_conta_id        INTEGER,
        titulo                VARCHAR(180) NOT NULL,
        descricao             TEXT,
        numero_documento      VARCHAR(80),
        valor_total           NUMERIC(14,2) NOT NULL DEFAULT 0,
        competencia_inicio    DATE,
        competencia_fim       DATE,
        periodicidade         VARCHAR(30) NOT NULL DEFAULT 'unica',
        dia_vencimento        INTEGER,
        indice_reajuste_id    INTEGER,
        status                VARCHAR(20) NOT NULL DEFAULT 'rascunho',
        origem                VARCHAR(30) NOT NULL DEFAULT 'manual',
        codigo_legado         VARCHAR(80),
        dados_adicionais      JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by            UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_fin_receitas_item CHECK (
          NOT (produto_id IS NOT NULL AND servico_id IS NOT NULL)
        ),
        CONSTRAINT ck_fin_receitas_periodicidade CHECK (
          periodicidade IN ('unica','diaria','semanal','mensal','bimestral','trimestral','semestral','anual','personalizada')
        ),
        CONSTRAINT ck_fin_receitas_dia CHECK (
          dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 31
        ),
        CONSTRAINT ck_fin_receitas_status CHECK (
          status IN ('rascunho','prevista','ativa','suspensa','encerrada','cancelada')
        )
      )
    `)

    for (const fk of [
      { table: 'cad_produtos', constraint: 'fk_cad_produtos_plano_conta', column: 'plano_conta_id', referenceTable: 'fin_plano_contas' },
      { table: 'cad_servicos', constraint: 'fk_cad_servicos_plano_conta', column: 'plano_conta_id', referenceTable: 'fin_plano_contas' },
      { table: 'fin_receitas', constraint: 'fk_fin_receitas_plano_conta', column: 'plano_conta_id', referenceTable: 'fin_plano_contas' },
      { table: 'fin_receitas', constraint: 'fk_fin_receitas_indice', column: 'indice_reajuste_id', referenceTable: 'fin_indice_tipos' },
    ]) {
      await addForeignKeyIfPossible(client, { ...fk, onDelete: 'SET NULL' })
    }

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_produtos_codigo
        ON cad_produtos(tenant_id, codigo)
        WHERE codigo IS NOT NULL AND BTRIM(codigo) <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_produtos_legado
        ON cad_produtos(tenant_id, origem_legada, codigo_legado)
        WHERE origem_legada IS NOT NULL AND codigo_legado IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_cad_produtos_tipo_ativo
        ON cad_produtos(tenant_id, tipo, ativo, nome);
      CREATE INDEX IF NOT EXISTS idx_cad_produtos_pai
        ON cad_produtos(produto_pai_id);

      CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_servicos_codigo
        ON cad_servicos(tenant_id, codigo)
        WHERE codigo IS NOT NULL AND BTRIM(codigo) <> '';
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cad_servicos_legado
        ON cad_servicos(tenant_id, origem_legada, codigo_legado)
        WHERE origem_legada IS NOT NULL AND codigo_legado IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_cad_servicos_ativo
        ON cad_servicos(tenant_id, ativo, nome);

      CREATE INDEX IF NOT EXISTS idx_com_contratos_cliente
        ON com_contratos(cliente_id, status, created_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_com_contratos_origem_legado
        ON com_contratos(tenant_id, origem, codigo_legado)
        WHERE codigo_legado IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_com_contrato_itens_contrato
        ON com_contrato_itens(contrato_id, ativo, ordem);
      CREATE INDEX IF NOT EXISTS idx_com_contrato_itens_produto
        ON com_contrato_itens(produto_id) WHERE produto_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_com_contrato_itens_servico
        ON com_contrato_itens(servico_id) WHERE servico_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_fin_receitas_cliente_status
        ON fin_receitas(tenant_id, cliente_id, status, competencia_inicio);
      CREATE INDEX IF NOT EXISTS idx_fin_receitas_contrato
        ON fin_receitas(contrato_id) WHERE contrato_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_fin_receitas_tipo
        ON fin_receitas(tipo_receita_id) WHERE tipo_receita_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_receitas_legado
        ON fin_receitas(tenant_id, origem, codigo_legado)
        WHERE codigo_legado IS NOT NULL;
    `)

    await client.query(`
      UPDATE com_contratos
         SET titulo = COALESCE(
               NULLIF(BTRIM(titulo), ''),
               CASE WHEN NULLIF(BTRIM(numero), '') IS NOT NULL THEN 'Contrato ' || BTRIM(numero)
                    ELSE 'Contrato de ' || BTRIM(comprador_nome)
               END
             ),
             data_assinatura = COALESCE(data_assinatura, assinado_em::date),
             updated_at = NOW()
       WHERE titulo IS NULL
          OR BTRIM(titulo) = ''
          OR (data_assinatura IS NULL AND assinado_em IS NOT NULL)
    `)

    await client.query(`
      WITH candidatos AS (
        SELECT c.id AS contrato_id, MIN(cl.id) AS cliente_id
          FROM com_contratos c
          JOIN cad_pessoas p
            ON p.cpf_cnpj_digitos = REGEXP_REPLACE(COALESCE(c.comprador_cpf, ''), '[^0-9]', '', 'g')
          JOIN cad_clientes cl ON cl.pessoa_id = p.id
         WHERE c.cliente_id IS NULL
           AND LENGTH(REGEXP_REPLACE(COALESCE(c.comprador_cpf, ''), '[^0-9]', '', 'g')) IN (11, 14)
         GROUP BY c.id
        HAVING COUNT(DISTINCT cl.id) = 1
      )
      UPDATE com_contratos c
         SET cliente_id = candidatos.cliente_id,
             updated_at = NOW()
        FROM candidatos
       WHERE c.id = candidatos.contrato_id
    `)

    await client.query(`
      WITH candidatos AS (
        SELECT c.id AS contrato_id, MIN(cl.id) AS cliente_id
          FROM com_contratos c
          JOIN cad_pessoas p
            ON UPPER(BTRIM(COALESCE(p.nome, ''))) = UPPER(BTRIM(COALESCE(c.comprador_nome, '')))
            OR UPPER(BTRIM(COALESCE(p.razao_social, ''))) = UPPER(BTRIM(COALESCE(c.comprador_nome, '')))
          JOIN cad_clientes cl ON cl.pessoa_id = p.id
         WHERE c.cliente_id IS NULL
           AND NULLIF(BTRIM(c.comprador_nome), '') IS NOT NULL
         GROUP BY c.id
        HAVING COUNT(DISTINCT cl.id) = 1
      )
      UPDATE com_contratos c
         SET cliente_id = candidatos.cliente_id,
             updated_at = NOW()
        FROM candidatos
       WHERE c.id = candidatos.contrato_id
    `)

    const receitaTipos = [
      ['ENTRADA', 'Entrada', 'Ent', 'contratual', true, 'Entrada ou sinal contratual.'],
      ['PARCELA', 'Parcela', 'Par.', 'contratual', true, 'Parcela regular do contrato.'],
      ['ANUAL', 'Parcela anual', 'Ano', 'contratual', true, 'Parcela ou reforço anual.'],
      ['RENEGOCIACAO', 'Renegociação', 'RENE', 'ajuste', true, 'Valor originado de renegociação.'],
      ['INTERMEDIARIA', 'Parcela intermediária', 'INT', 'contratual', true, 'Parcela intermediária ou reforço.'],
      ['TAXA', 'Taxa', 'Tax.', 'taxa', true, 'Taxa cobrada do cliente.'],
      ['CONDOMINIO', 'Condomínio', 'COND', 'operacional', true, 'Receita ou repasse de condomínio.'],
      ['ADITIVO', 'Aditivo', 'ADT', 'ajuste', true, 'Valor gerado por aditivo contratual.'],
      ['OUTROS', 'Outras receitas', 'Out.', 'outro', true, 'Outras receitas vinculadas ao cliente/contrato.'],
      ['COMISSAO', 'Comissão', 'Com.', 'financeira', true, 'Comissão ou componente financeiro do contrato.'],
      ['ALUGUEL', 'Aluguel', null, 'contratual', true, 'Receita recorrente de locação.'],
      ['VENDA', 'Venda', null, 'contratual', true, 'Receita de venda de produto, obra, lote ou unidade.'],
      ['SERVICO', 'Prestação de serviço', null, 'operacional', true, 'Receita de prestação de serviço.'],
      ['PRODUTO', 'Venda de produto', null, 'operacional', true, 'Receita de produto sem contrato complexo.'],
    ]

    for (const [codigo, nome, codigoLegado, categoria, geraParcela, descricao] of receitaTipos) {
      await client.query(
        `INSERT INTO fin_tipos_receita
           (tenant_id, codigo, nome, codigo_legado, categoria, gera_parcela, descricao, ativo)
         SELECT id, $1, $2, $3, $4, $5, $6, TRUE
           FROM hub_tenants
         ON CONFLICT (tenant_id, codigo)
         DO UPDATE SET
           nome = EXCLUDED.nome,
           codigo_legado = COALESCE(fin_tipos_receita.codigo_legado, EXCLUDED.codigo_legado),
           categoria = EXCLUDED.categoria,
           gera_parcela = EXCLUDED.gera_parcela,
           descricao = COALESCE(NULLIF(fin_tipos_receita.descricao, ''), EXCLUDED.descricao),
           updated_at = NOW()`,
        [codigo, nome, codigoLegado, categoria, geraParcela, descricao],
      )
    }

    await client.query(`
      COMMENT ON TABLE cad_produtos IS 'Catálogo comercial de produtos, obras, empreendimentos, unidades, lotes, imóveis e aluguéis.';
      COMMENT ON TABLE cad_servicos IS 'Catálogo comercial de serviços faturáveis e recorrentes.';
      COMMENT ON TABLE fin_tipos_receita IS 'Naturezas de receita, incluindo os códigos do relatório legado Strato.';
      COMMENT ON TABLE com_contrato_itens IS 'Itens de produto/serviço que compõem cada contrato.';
      COMMENT ON TABLE fin_receitas IS 'Cabeçalho/origem de receita por cliente e contrato. Parcelas serão vinculadas na Fase 2.';
      COMMENT ON COLUMN com_contratos.cliente_id IS 'Cliente do cadastro unificado cad_clientes; campos comprador_* permanecem por compatibilidade.';
    `)

    await client.query('COMMIT')

    const { rows: [summary] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM cad_produtos) AS produtos,
        (SELECT COUNT(*) FROM cad_servicos) AS servicos,
        (SELECT COUNT(*) FROM fin_tipos_receita) AS tipos_receita,
        (SELECT COUNT(*) FROM com_contratos WHERE cliente_id IS NOT NULL) AS contratos_com_cliente,
        (SELECT COUNT(*) FROM com_contratos WHERE cliente_id IS NULL) AS contratos_sem_cliente
    `)

    logger.info(
      '✅ Fase 1 de Receitas/Contratos criada. ' +
      `Produtos: ${summary.produtos}; Serviços: ${summary.servicos}; ` +
      `Tipos de receita: ${summary.tipos_receita}; ` +
      `Contratos vinculados a clientes: ${summary.contratos_com_cliente}; ` +
      `pendentes de vínculo: ${summary.contratos_sem_cliente}.`,
    )
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`❌ Erro na migration da Fase 1 de Receitas/Contratos: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
