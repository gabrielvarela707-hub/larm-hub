/**
 * Versão 0.3.47 — Contas a Receber: recálculo e cobrança Bradesco CNAB 400.
 *
 * Execução:
 *   node scripts/migrate_recalculo_bradesco_recebiveis.js
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
        to_regclass('public.com_parcelas') AS parcelas,
        to_regclass('public.fin_indice_tipos') AS indices,
        to_regclass('public.hub_tenants') AS tenants
    `)
    if (!required?.parcelas || !required?.indices || !required?.tenants) {
      throw new Error('Pré-requisitos ausentes. Aplique primeiro as migrations de Receitas/Parcelas e Índices Econômicos.')
    }

    await client.query(`
      ALTER TABLE com_parcelas
        ADD COLUMN IF NOT EXISTS valor_outros_acrescimos NUMERIC(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS valor_recalculado NUMERIC(14,2),
        ADD COLUMN IF NOT EXISTS data_recalculo DATE,
        ADD COLUMN IF NOT EXISTS recalculado_em TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS recalculado_por UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS recalculo_dados JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS nosso_numero VARCHAR(11),
        ADD COLUMN IF NOT EXISTS nosso_numero_dv VARCHAR(1),
        ADD COLUMN IF NOT EXISTS controle_participante VARCHAR(25),
        ADD COLUMN IF NOT EXISTS linha_digitavel VARCHAR(60),
        ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(44),
        ADD COLUMN IF NOT EXISTS boleto_status VARCHAR(30),
        ADD COLUMN IF NOT EXISTS boleto_emitido_em TIMESTAMPTZ
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_cobranca_bancaria_config (
        id BIGSERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        empresa VARCHAR(80) NOT NULL DEFAULT 'LARM',
        banco_codigo VARCHAR(3) NOT NULL DEFAULT '237',
        banco_nome VARCHAR(80) NOT NULL DEFAULT 'BRADESCO',
        codigo_empresa VARCHAR(20),
        beneficiario_nome VARCHAR(120) NOT NULL,
        beneficiario_documento VARCHAR(20),
        agencia VARCHAR(5) NOT NULL,
        agencia_dv VARCHAR(2),
        conta VARCHAR(12) NOT NULL,
        conta_dv VARCHAR(2),
        carteira VARCHAR(3) NOT NULL DEFAULT '09',
        especie_documento VARCHAR(2) NOT NULL DEFAULT '01',
        cep VARCHAR(8),
        logradouro VARCHAR(180),
        numero VARCHAR(30),
        complemento VARCHAR(80),
        bairro VARCHAR(100),
        cidade VARCHAR(100),
        uf VARCHAR(2),
        local_pagamento TEXT,
        instrucoes TEXT,
        multa_percentual_padrao NUMERIC(9,4) NOT NULL DEFAULT 2,
        mora_percentual_mes_padrao NUMERIC(9,4) NOT NULL DEFAULT 1,
        remessa_sequencia INTEGER NOT NULL DEFAULT 1,
        nosso_numero_sequencia BIGINT NOT NULL DEFAULT 1,
        homologado BOOLEAN NOT NULL DEFAULT FALSE,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        created_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_cobranca_config UNIQUE (tenant_id, banco_codigo, empresa)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_remessas_cobranca (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        config_id BIGINT NOT NULL REFERENCES fin_cobranca_bancaria_config(id) ON DELETE RESTRICT,
        banco_codigo VARCHAR(3) NOT NULL,
        numero INTEGER NOT NULL,
        nome_arquivo VARCHAR(120) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'gerada',
        homologacao BOOLEAN NOT NULL DEFAULT TRUE,
        quantidade_titulos INTEGER NOT NULL DEFAULT 0,
        valor_total NUMERIC(16,2) NOT NULL DEFAULT 0,
        sha256 VARCHAR(64) NOT NULL,
        conteudo TEXT NOT NULL,
        gerada_por UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_remessa_numero UNIQUE (tenant_id, config_id, numero),
        CONSTRAINT uq_fin_remessa_hash UNIQUE (tenant_id, sha256)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_remessas_cobranca_itens (
        id BIGSERIAL PRIMARY KEY,
        remessa_id UUID NOT NULL REFERENCES fin_remessas_cobranca(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        parcela_id UUID NOT NULL REFERENCES com_parcelas(id) ON DELETE RESTRICT,
        nosso_numero VARCHAR(11) NOT NULL,
        nosso_numero_dv VARCHAR(1),
        controle_participante VARCHAR(25),
        valor NUMERIC(14,2) NOT NULL,
        vencimento DATE NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'enviado',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_remessa_item UNIQUE (remessa_id, parcela_id)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_retornos_cobranca (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        config_id BIGINT REFERENCES fin_cobranca_bancaria_config(id) ON DELETE SET NULL,
        banco_codigo VARCHAR(3) NOT NULL DEFAULT '237',
        nome_arquivo VARCHAR(160) NOT NULL,
        data_arquivo DATE,
        quantidade_registros INTEGER NOT NULL DEFAULT 0,
        quantidade_conciliada INTEGER NOT NULL DEFAULT 0,
        quantidade_nao_localizada INTEGER NOT NULL DEFAULT 0,
        valor_liquidado NUMERIC(16,2) NOT NULL DEFAULT 0,
        sha256 VARCHAR(64) NOT NULL,
        conteudo TEXT NOT NULL,
        processado_por UUID REFERENCES hub_users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fin_retorno_hash UNIQUE (tenant_id, sha256)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS fin_retornos_cobranca_itens (
        id BIGSERIAL PRIMARY KEY,
        retorno_id UUID NOT NULL REFERENCES fin_retornos_cobranca(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
        parcela_id UUID REFERENCES com_parcelas(id) ON DELETE SET NULL,
        remessa_item_id BIGINT REFERENCES fin_remessas_cobranca_itens(id) ON DELETE SET NULL,
        nosso_numero VARCHAR(11),
        nosso_numero_dv VARCHAR(1),
        controle_participante VARCHAR(25),
        ocorrencia VARCHAR(3),
        ocorrencia_descricao VARCHAR(160),
        data_ocorrencia DATE,
        data_credito DATE,
        data_vencimento DATE,
        valor_titulo NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_pago NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_juros NUMERIC(14,2) NOT NULL DEFAULT 0,
        valor_desconto NUMERIC(14,2) NOT NULL DEFAULT 0,
        motivos_rejeicao VARCHAR(30),
        status_processamento VARCHAR(30) NOT NULL DEFAULT 'recebido',
        dados JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_com_parcelas_nosso_numero
        ON com_parcelas(tenant_id, nosso_numero)
        WHERE nosso_numero IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_com_parcelas_boleto_status
        ON com_parcelas(tenant_id, boleto_status)
        WHERE boleto_status IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_fin_remessa_itens_parcela
        ON fin_remessas_cobranca_itens(tenant_id, parcela_id);
      CREATE INDEX IF NOT EXISTS idx_fin_retorno_itens_parcela
        ON fin_retornos_cobranca_itens(tenant_id, parcela_id);
      CREATE INDEX IF NOT EXISTS idx_fin_retorno_itens_nosso_numero
        ON fin_retornos_cobranca_itens(tenant_id, nosso_numero);
    `)

    // Configuração identificada no arquivo de remessa histórico fornecido.
    // Mantida em homologação até validação cadastral pelo banco.
    await client.query(`
      INSERT INTO fin_cobranca_bancaria_config (
        tenant_id, empresa, banco_codigo, banco_nome, codigo_empresa,
        beneficiario_nome, beneficiario_documento,
        agencia, agencia_dv, conta, conta_dv, carteira,
        local_pagamento, instrucoes, homologado, ativo
      )
      SELECT
        t.id, 'LARM', '237', 'BRADESCO', '00000000000004352309',
        'LARM PARTICIPACOES LTDA', '59786491000190',
        '2370', NULL, '27458', '5', '09',
        'PAGÁVEL PREFERENCIALMENTE NA REDE BRADESCO OU EM QUALQUER BANCO ATÉ O VENCIMENTO.',
        'APÓS O VENCIMENTO, RECALCULAR O TÍTULO ANTES DA EMISSÃO.',
        FALSE, TRUE
      FROM hub_tenants t
      WHERE t.id = 'a1000000-0000-4000-8000-000000000001'
      ON CONFLICT (tenant_id, banco_codigo, empresa)
      DO UPDATE SET
        codigo_empresa = COALESCE(fin_cobranca_bancaria_config.codigo_empresa, EXCLUDED.codigo_empresa),
        beneficiario_documento = COALESCE(fin_cobranca_bancaria_config.beneficiario_documento, EXCLUDED.beneficiario_documento),
        carteira = COALESCE(fin_cobranca_bancaria_config.carteira, EXCLUDED.carteira),
        agencia = COALESCE(fin_cobranca_bancaria_config.agencia, EXCLUDED.agencia),
        conta = COALESCE(fin_cobranca_bancaria_config.conta, EXCLUDED.conta),
        conta_dv = COALESCE(fin_cobranca_bancaria_config.conta_dv, EXCLUDED.conta_dv),
        updated_at = NOW()
    `)

    await client.query(`
      COMMENT ON COLUMN com_parcelas.valor_recalculado IS 'Valor final confirmado pelo operador no recálculo da parcela.';
      COMMENT ON COLUMN com_parcelas.recalculo_dados IS 'Memória de cálculo: índice, referências mensais, multa, mora, seguro, acréscimos e desconto.';
      COMMENT ON COLUMN com_parcelas.nosso_numero IS 'Nosso Número Bradesco sem dígito, com 11 posições.';
      COMMENT ON TABLE fin_cobranca_bancaria_config IS 'Configuração por tenant/empresa para boleto e CNAB de cobrança.';
      COMMENT ON TABLE fin_remessas_cobranca IS 'Arquivos CNAB 400 de cobrança gerados pelo sistema.';
      COMMENT ON TABLE fin_retornos_cobranca IS 'Arquivos de retorno CNAB 400 processados pelo sistema.';
    `)

    await client.query('COMMIT')

    const { rows: [summary] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM fin_cobranca_bancaria_config)::int AS configuracoes,
        (SELECT COUNT(*) FROM com_parcelas WHERE status='atrasada')::int AS atrasadas
    `)
    logger.info(`✅ Recálculo e cobrança Bradesco preparados. Configurações: ${summary.configuracoes}; parcelas atrasadas: ${summary.atrasadas}.`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`❌ Erro na migration de recálculo/Bradesco: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
