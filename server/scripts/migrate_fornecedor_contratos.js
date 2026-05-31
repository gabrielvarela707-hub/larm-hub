/**
 * scripts/migrate_fornecedor_contratos.js
 * Cria a tabela de contratos vinculados aos fornecedores.
 * Rodar: node scripts/migrate_fornecedor_contratos.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE TABLE IF NOT EXISTS fin_fornecedor_contratos (
  id               SERIAL PRIMARY KEY,
  fornecedor_id    INTEGER NOT NULL REFERENCES fin_fornecedores(id) ON DELETE CASCADE,
  tenant_id        UUID,
  titulo           TEXT NOT NULL,
  numero_contrato  VARCHAR(120),
  status           VARCHAR(30) DEFAULT 'ativo',
  data_assinatura  DATE,
  data_inicio      DATE,
  data_fim         DATE,
  data_renovacao   DATE,
  indice_correcao  VARCHAR(80),
  valor_mensal     NUMERIC(18,4) DEFAULT 0,
  valor_total      NUMERIC(18,4) DEFAULT 0,
  valor_pago       NUMERIC(18,4) DEFAULT 0,
  servicos         TEXT,
  responsavel      VARCHAR(150),
  observacoes      TEXT,
  arquivo_nome     VARCHAR(255),
  arquivo_mime     VARCHAR(120),
  arquivo_base64   TEXT,
  ativo            BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

ALTER TABLE fin_fornecedor_contratos
  ADD COLUMN IF NOT EXISTS tenant_id UUID,
  ADD COLUMN IF NOT EXISTS titulo TEXT,
  ADD COLUMN IF NOT EXISTS numero_contrato VARCHAR(120),
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS data_assinatura DATE,
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE,
  ADD COLUMN IF NOT EXISTS data_renovacao DATE,
  ADD COLUMN IF NOT EXISTS indice_correcao VARCHAR(80),
  ADD COLUMN IF NOT EXISTS valor_mensal NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_pago NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS servicos TEXT,
  ADD COLUMN IF NOT EXISTS responsavel VARCHAR(150),
  ADD COLUMN IF NOT EXISTS observacoes TEXT,
  ADD COLUMN IF NOT EXISTS arquivo_nome VARCHAR(255),
  ADD COLUMN IF NOT EXISTS arquivo_mime VARCHAR(120),
  ADD COLUMN IF NOT EXISTS arquivo_base64 TEXT,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

UPDATE fin_fornecedor_contratos SET titulo = COALESCE(NULLIF(titulo, ''), 'Contrato sem título') WHERE titulo IS NULL;
ALTER TABLE fin_fornecedor_contratos ALTER COLUMN titulo SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_forn_contratos_fornecedor ON fin_fornecedor_contratos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_forn_contratos_status ON fin_fornecedor_contratos(status);
CREATE INDEX IF NOT EXISTS idx_forn_contratos_renovacao ON fin_fornecedor_contratos(data_renovacao);
CREATE INDEX IF NOT EXISTS idx_forn_contratos_ativo ON fin_fornecedor_contratos(ativo);
CREATE INDEX IF NOT EXISTS idx_forn_contratos_tenant ON fin_fornecedor_contratos(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_forn_contratos_numero_unique
  ON fin_fornecedor_contratos(fornecedor_id, numero_contrato)
  WHERE numero_contrato IS NOT NULL AND numero_contrato <> '';
`

async function migrate() {
  await connectDB()
  logger.info('Criando tabela de contratos de fornecedores...')
  try {
    await pool.query(SQL)
    logger.info('✅  Tabela criada / atualizada: fin_fornecedor_contratos')
  } catch (err) {
    logger.error('❌  Erro:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
