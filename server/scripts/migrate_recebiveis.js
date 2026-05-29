/**
 * scripts/migrate_recebiveis.js
 * v0.2.1 — Contratos, Parcelas, Cobrança e Acordos/Renegociações.
 *
 * Execute: node server/scripts/migrate_recebiveis.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
-- ─── CONTRATOS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS com_contratos (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID    NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  numero              VARCHAR(30),

  -- Vínculos (opcionais — sem FK hard para tolerância de ordem de migration)
  proposta_id         UUID,
  lead_id             UUID    REFERENCES crm_leads(id) ON DELETE SET NULL,
  corretor_id         UUID,

  -- Lote
  lot_id              VARCHAR(60),
  lot_number          VARCHAR(30),
  quadra              VARCHAR(10),
  area_m2             NUMERIC(10,2),
  empreendimento_id   VARCHAR(60),

  -- Comprador
  comprador_nome      VARCHAR(160) NOT NULL,
  comprador_cpf       VARCHAR(20),
  comprador_phone     VARCHAR(40),
  comprador_email     VARCHAR(160),

  -- Valores
  valor_total         NUMERIC(14,2) NOT NULL,
  valor_entrada       NUMERIC(14,2) NOT NULL DEFAULT 0,
  parcelas_count      INT           NOT NULL DEFAULT 1,
  taxa_juros_mes      NUMERIC(6,4)  NOT NULL DEFAULT 0,
  financiamento_tipo  VARCHAR(20)   NOT NULL DEFAULT 'price'
    CHECK (financiamento_tipo IN ('price','sac','avista','permuta')),

  -- Workflow
  status              VARCHAR(30) NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_assinatura','assinado','distratado','quitado')),
  assinado_em         TIMESTAMP,
  distratado_em       TIMESTAMP,
  quitado_em          TIMESTAMP,
  distrato_motivo     TEXT,

  observacoes         TEXT,
  template_id         VARCHAR(60),

  responsavel_id      UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_com_contratos_tenant_status
  ON com_contratos(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_com_contratos_lead
  ON com_contratos(lead_id) WHERE lead_id IS NOT NULL;

-- ─── PARCELAS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS com_parcelas (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID    NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  contrato_id         UUID    NOT NULL REFERENCES com_contratos(id) ON DELETE CASCADE,
  numero              INT     NOT NULL,

  tipo                VARCHAR(20) NOT NULL DEFAULT 'parcela'
    CHECK (tipo IN ('entrada','parcela','balao','aditivo')),

  vencimento          DATE    NOT NULL,
  valor_nominal       NUMERIC(14,2) NOT NULL,

  -- Calculados no momento do pagamento
  valor_correcao      NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_multa         NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_juros_mora    NUMERIC(14,2) NOT NULL DEFAULT 0,
  valor_desconto      NUMERIC(14,2) NOT NULL DEFAULT 0,

  status              VARCHAR(20) NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta','paga','atrasada','renegociada','cancelada')),

  pago_em             TIMESTAMP,
  valor_pago          NUMERIC(14,2),
  forma_pagamento     VARCHAR(40),
  observacoes_baixa   TEXT,

  acordo_id           UUID,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_com_parcelas_contrato
  ON com_parcelas(contrato_id, numero);
CREATE INDEX IF NOT EXISTS idx_com_parcelas_tenant_status
  ON com_parcelas(tenant_id, status, vencimento);
CREATE INDEX IF NOT EXISTS idx_com_parcelas_vencimento
  ON com_parcelas(tenant_id, vencimento, status);

-- Auto-marcar parcelas atrasadas
CREATE OR REPLACE FUNCTION fn_parcelas_atualiza_atraso()
RETURNS void LANGUAGE sql AS $$
  UPDATE com_parcelas
     SET status = 'atrasada', updated_at = NOW()
   WHERE status = 'aberta' AND vencimento < CURRENT_DATE;
$$;

-- ─── COBRANÇAS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS com_cobrancas (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID    NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  parcela_id          UUID    NOT NULL REFERENCES com_parcelas(id) ON DELETE CASCADE,
  contrato_id         UUID    NOT NULL REFERENCES com_contratos(id) ON DELETE CASCADE,

  canal               VARCHAR(20) NOT NULL DEFAULT 'sms'
    CHECK (canal IN ('whatsapp','sms','email','ligacao','carta')),
  status              VARCHAR(20) NOT NULL DEFAULT 'enviado'
    CHECK (status IN ('enviado','entregue','falhou','sem_resposta')),
  mensagem            TEXT,

  created_by          UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_com_cobrancas_parcela
  ON com_cobrancas(parcela_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_com_cobrancas_tenant
  ON com_cobrancas(tenant_id, created_at DESC);

-- ─── ACORDOS / RENEGOCIAÇÕES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS com_acordos (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID    NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  contrato_id         UUID    NOT NULL REFERENCES com_contratos(id) ON DELETE CASCADE,

  tipo                VARCHAR(30) NOT NULL DEFAULT 'renegociacao'
    CHECK (tipo IN ('renegociacao','distrato','quitacao_antecipada','aditivo')),

  status              VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aprovado','recusado','executado')),

  descricao           TEXT,
  parcelas_afetadas   JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Novos termos
  novo_valor_parcela  NUMERIC(14,2),
  novo_vencimento_base DATE,
  novas_parcelas_count INT,
  desconto_pct        NUMERIC(5,2),
  valor_entrada_acordo NUMERIC(14,2),

  aprovado_por        UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  aprovado_em         TIMESTAMP,
  recusado_por        UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  motivo_recusa       TEXT,
  executado_em        TIMESTAMP,

  created_by          UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_com_acordos_contrato
  ON com_acordos(contrato_id, status);
CREATE INDEX IF NOT EXISTS idx_com_acordos_tenant
  ON com_acordos(tenant_id, status, created_at DESC);
`

async function migrate() {
  await connectDB()
  try {
    logger.info('Iniciando migração Recebíveis v0.2.1...')
    await pool.query(SQL)
    logger.info('✅ Recebíveis v0.2.1 — tabelas criadas com sucesso.')
  } catch (err) {
    logger.error('❌ Erro: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
