/**
 * scripts/migrate_corretores_comissoes.js
 * v0.2.0 — Corretores/parceiros e comissões comerciais.
 *
 * Execute: node server/scripts/migrate_corretores_comissoes.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL_CORRETORES = `
CREATE TABLE IF NOT EXISTS com_corretores (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID      NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
  tipo              VARCHAR(20) NOT NULL DEFAULT 'autonomo'
    CHECK (tipo IN ('autonomo','imobiliaria')),
  nome              VARCHAR(160) NOT NULL,
  email             VARCHAR(160),
  phone             VARCHAR(40),
  creci             VARCHAR(40),
  cpf_cnpj          VARCHAR(20),
  regiao_exclusiva  VARCHAR(160),
  exclusividade_ativa BOOLEAN NOT NULL DEFAULT false,
  comissao_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  split_corretor_pct NUMERIC(5,2) NOT NULL DEFAULT 100,
  user_id           UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  observacoes       TEXT,
  created_by        UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_com_corretores_tenant
  ON com_corretores(tenant_id, is_active, tipo);
`

// com_comissoes sem FK para com_propostas/com_reservas
// (FKs serão adicionadas depois se essas tabelas existirem)
const SQL_COMISSOES = `
CREATE TABLE IF NOT EXISTS com_comissoes (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID      NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,

  -- Referências opcionais (sem FK — tabelas podem não existir ainda)
  proposta_id       UUID,
  reserva_id        UUID,
  lead_id           UUID      REFERENCES crm_leads(id) ON DELETE SET NULL,

  corretor_id       UUID      NOT NULL REFERENCES com_corretores(id) ON DELETE RESTRICT,

  lot_id            VARCHAR(60),
  lot_number        VARCHAR(30),
  quadra            VARCHAR(10),

  valor_venda       NUMERIC(14,2) NOT NULL,
  comissao_pct      NUMERIC(5,2)  NOT NULL,
  comissao_bruta    NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND(valor_venda * comissao_pct / 100, 2)
  ) STORED,

  split_corretor_pct    NUMERIC(5,2) NOT NULL DEFAULT 100,
  valor_corretor        NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND((valor_venda * comissao_pct / 100) * split_corretor_pct / 100, 2)
  ) STORED,
  valor_imobiliaria     NUMERIC(14,2) GENERATED ALWAYS AS (
    ROUND((valor_venda * comissao_pct / 100) * (100 - split_corretor_pct) / 100, 2)
  ) STORED,

  status            VARCHAR(30) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','elegivel','em_pagamento','pago','suspenso','cancelado')),

  elegivel_apos_dias INT NOT NULL DEFAULT 30,
  elegivel_em       TIMESTAMP,
  pago_em           TIMESTAMP,
  valor_pago        NUMERIC(14,2),
  forma_pagamento   VARCHAR(40),

  observacoes       TEXT,
  created_by        UUID REFERENCES hub_users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_com_comissoes_tenant_status
  ON com_comissoes(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_com_comissoes_corretor
  ON com_comissoes(corretor_id, status);

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS corretor_id UUID REFERENCES com_corretores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_corretor
  ON crm_leads(corretor_id) WHERE corretor_id IS NOT NULL;
`

// FKs opcionais — só adiciona se as tabelas já existirem
const SQL_FK_OPTIONAL = `
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'com_propostas') THEN
    BEGIN
      ALTER TABLE com_comissoes
        ADD CONSTRAINT fk_comissoes_proposta
        FOREIGN KEY (proposta_id) REFERENCES com_propostas(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'com_reservas') THEN
    BEGIN
      ALTER TABLE com_comissoes
        ADD CONSTRAINT fk_comissoes_reserva
        FOREIGN KEY (reserva_id) REFERENCES com_reservas(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;
`

async function migrate() {
  await connectDB()
  try {
    logger.info('Iniciando migração Corretores & Comissões (v0.2.0)...')
    await pool.query(SQL_CORRETORES)
    logger.info('✅ com_corretores criada.')
    await pool.query(SQL_COMISSOES)
    logger.info('✅ com_comissoes criada.')
    await pool.query(SQL_FK_OPTIONAL)
    logger.info('✅ FKs opcionais verificadas.')
    logger.info('✅ Corretores & Comissões — migração concluída com sucesso.')
  } catch (err) {
    logger.error('❌ Erro: ' + err.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrate()
