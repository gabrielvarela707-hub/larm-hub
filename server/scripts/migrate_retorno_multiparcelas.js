/**
 * v0.6.1 — Estrutura aditiva para um item de retorno bancário relacionado
 * a duas ou mais parcelas do Contas a Receber.
 *
 * Esta migration NÃO altera parcelas, baixas, movimentos ou retornos já
 * processados. Cria somente a tabela de relacionamento e seus índices.
 *
 * Execução:
 *   node scripts/migrate_retorno_multiparcelas.js
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const { rows: [required] } = await client.query(`
      SELECT
        to_regclass('public.hub_tenants') AS tenants,
        to_regclass('public.fin_retornos_cobranca_itens') AS retorno_itens,
        to_regclass('public.com_parcelas') AS parcelas,
        to_regclass('public.fin_movimento') AS movimentos
    `)

    const missing = Object.entries(required || {})
      .filter(([, value]) => !value)
      .map(([key]) => key)

    if (missing.length) {
      throw new Error(
        `Pré-requisitos ausentes: ${missing.join(', ')}. ` +
        'Execute primeiro as migrations de recebíveis, retorno Bradesco e Movimento Bancário.'
      )
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_retornos_cobranca_item_parcelas (
        id BIGSERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        retorno_item_id BIGINT NOT NULL
          REFERENCES fin_retornos_cobranca_itens(id) ON DELETE CASCADE,
        parcela_id UUID REFERENCES com_parcelas(id) ON DELETE SET NULL,
        movimento_id BIGINT REFERENCES fin_movimento(id) ON DELETE SET NULL,
        ordem SMALLINT NOT NULL,
        fonte VARCHAR(40) NOT NULL DEFAULT 'relatorio_strato',
        metodo_relacionamento VARCHAR(60),
        confianca NUMERIC(5,4),
        obra_codigo INTEGER,
        unidade VARCHAR(80),
        cliente_codigo_legado VARCHAR(30),
        cliente_nome VARCHAR(250),
        contrato_codigo_legado VARCHAR(30),
        documento_parcela VARCHAR(80),
        controle_participante VARCHAR(25),
        vencimento DATE,
        data_recebimento DATE,
        data_credito DATE,
        valor_nominal NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_juros_financeiro NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_seguro NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_moras NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_residuo NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_pago NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_diferenca NUMERIC(14,2) NOT NULL DEFAULT 0,
        status VARCHAR(30) NOT NULL DEFAULT 'analisado',
        acao_proposta VARCHAR(40),
        bloqueado BOOLEAN NOT NULL DEFAULT TRUE,
        evidencias JSONB NOT NULL DEFAULT '{}'::jsonb,
        dados JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_retorno_item_parcela_ordem
          UNIQUE (retorno_item_id, ordem),
        CONSTRAINT ck_fin_retorno_item_parcela_ordem
          CHECK (ordem BETWEEN 1 AND 999),
        CONSTRAINT ck_fin_retorno_item_parcela_confianca
          CHECK (confianca IS NULL OR (confianca >= 0 AND confianca <= 1)),
        CONSTRAINT ck_fin_retorno_item_parcela_valores
          CHECK (
            valor_nominal >= 0
            AND valor_juros_financeiro >= 0
            AND valor_seguro >= 0
            AND valor_moras >= 0
            AND valor_desconto >= 0
            AND valor_total >= 0
            AND valor_pago >= 0
          )
      )
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_retorno_item_parcela_vinculo
        ON fin_retornos_cobranca_item_parcelas(retorno_item_id, parcela_id)
        WHERE parcela_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_parcelas_tenant_item
        ON fin_retornos_cobranca_item_parcelas(tenant_id, retorno_item_id, ordem);

      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_parcelas_parcela
        ON fin_retornos_cobranca_item_parcelas(tenant_id, parcela_id)
        WHERE parcela_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_parcelas_movimento
        ON fin_retornos_cobranca_item_parcelas(movimento_id)
        WHERE movimento_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_parcelas_controle
        ON fin_retornos_cobranca_item_parcelas(tenant_id, controle_participante)
        WHERE controle_participante IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_fin_retorno_item_parcelas_status
        ON fin_retornos_cobranca_item_parcelas(tenant_id, status, bloqueado);
    `)

    await client.query(`
      COMMENT ON TABLE fin_retornos_cobranca_item_parcelas IS
        'Relaciona um item CNAB a uma ou mais parcelas identificadas no relatório Strato, preservando composição financeira individual e evidências.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.retorno_item_id IS
        'Linha original do retorno Bradesco. Um mesmo item pode possuir várias parcelas relacionadas.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.ordem IS
        'Ordem da parcela dentro da composição apresentada no relatório Strato.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.valor_nominal IS
        'Valor nominal individual da parcela antes de juros, moras, seguro, desconto e resíduo.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.valor_desconto IS
        'Desconto individual positivo, exibido separadamente conforme o relatório Strato.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.valor_pago IS
        'Valor efetivamente recebido para a parcela individual.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.bloqueado IS
        'Enquanto verdadeiro, a análise não pode executar atualização ou baixa automática.';
      COMMENT ON COLUMN fin_retornos_cobranca_item_parcelas.evidencias IS
        'Evidências determinísticas e extraídas por IA usadas para relacionar boleto, cliente, contrato e parcela.';
    `)

    await client.query('COMMIT')
    logger.info('✅ Estrutura multiparcelas do retorno criada sem alterar dados financeiros.')
  } catch (error) {
    await client.query('ROLLBACK')
    logger.error(`Falha na migration multiparcelas do retorno: ${error.message}`)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(() => process.exit(1))
