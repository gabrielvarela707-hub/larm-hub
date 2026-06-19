/**
 * scripts/migrate_orcamento_financeiro.js
 * Cria as tabelas do módulo Orçamento Financeiro.
 * Rodar: node scripts/migrate_orcamento_financeiro.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `
CREATE TABLE IF NOT EXISTS fin_orcamento_linhas (
  id          SERIAL PRIMARY KEY,
  row_idx     INTEGER NOT NULL UNIQUE,
  codigo      VARCHAR(20),
  descricao   TEXT NOT NULL,
  nivel       INTEGER DEFAULT 1,
  tipo        VARCHAR(20) DEFAULT 'item',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

ALTER TABLE fin_orcamento_linhas
  ADD COLUMN IF NOT EXISTS row_idx INTEGER,
  ADD COLUMN IF NOT EXISTS codigo VARCHAR(20),
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS nivel INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'item',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_linhas_row_idx ON fin_orcamento_linhas(row_idx);

CREATE TABLE IF NOT EXISTS fin_orcamento_valores (
  id          SERIAL PRIMARY KEY,
  linha_id    INTEGER NOT NULL REFERENCES fin_orcamento_linhas(id) ON DELETE CASCADE,
  empresa     VARCHAR(30) NOT NULL,
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  previsto    NUMERIC(18,4) DEFAULT 0,
  origem      VARCHAR(80) DEFAULT 'movimento_orcado_agregado',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (linha_id, empresa, ano, mes)
);

ALTER TABLE fin_orcamento_valores
  ADD COLUMN IF NOT EXISTS linha_id INTEGER,
  ADD COLUMN IF NOT EXISTS empresa VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ano INTEGER,
  ADD COLUMN IF NOT EXISTS mes INTEGER,
  ADD COLUMN IF NOT EXISTS previsto NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origem VARCHAR(80) DEFAULT 'movimento_orcado_agregado',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_valores_unique ON fin_orcamento_valores(linha_id, empresa, ano, mes);
CREATE INDEX IF NOT EXISTS idx_orcamento_valores_empresa_ano ON fin_orcamento_valores(empresa, ano);
CREATE INDEX IF NOT EXISTS idx_orcamento_valores_linha ON fin_orcamento_valores(linha_id);

CREATE TABLE IF NOT EXISTS fin_orcamento_movimento (
  id                   BIGSERIAL PRIMARY KEY,
  data                 DATE,
  empresa              VARCHAR(30),
  banco                VARCHAR(120),
  entradas             NUMERIC(18,4),
  saidas               NUMERIC(18,4),
  fornecedor           TEXT,
  historico            TEXT,
  nf_doc               VARCHAR(120),
  emissao_doc          DATE,
  conta_contabil       TEXT,
  centro_custo         TEXT,
  obra                 TEXT,
  natureza_financeira  TEXT,
  n_cheque             VARCHAR(120),
  dia                  INTEGER,
  mes                  INTEGER,
  ano                  INTEGER,
  saldo                NUMERIC(18,4),
  tipo_lancamento      VARCHAR(20) DEFAULT 'orcado',
  origem               VARCHAR(80) DEFAULT 'movimento_orcado',
  created_at           TIMESTAMP DEFAULT NOW()
);

ALTER TABLE fin_orcamento_movimento
  ADD COLUMN IF NOT EXISTS data DATE,
  ADD COLUMN IF NOT EXISTS empresa VARCHAR(30),
  ADD COLUMN IF NOT EXISTS banco VARCHAR(120),
  ADD COLUMN IF NOT EXISTS entradas NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS saidas NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS fornecedor TEXT,
  ADD COLUMN IF NOT EXISTS historico TEXT,
  ADD COLUMN IF NOT EXISTS nf_doc VARCHAR(120),
  ADD COLUMN IF NOT EXISTS emissao_doc DATE,
  ADD COLUMN IF NOT EXISTS conta_contabil TEXT,
  ADD COLUMN IF NOT EXISTS centro_custo TEXT,
  ADD COLUMN IF NOT EXISTS obra TEXT,
  ADD COLUMN IF NOT EXISTS natureza_financeira TEXT,
  ADD COLUMN IF NOT EXISTS n_cheque VARCHAR(120),
  ADD COLUMN IF NOT EXISTS dia INTEGER,
  ADD COLUMN IF NOT EXISTS mes INTEGER,
  ADD COLUMN IF NOT EXISTS ano INTEGER,
  ADD COLUMN IF NOT EXISTS saldo NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS tipo_lancamento VARCHAR(20) DEFAULT 'orcado',
  ADD COLUMN IF NOT EXISTS origem VARCHAR(80) DEFAULT 'movimento_orcado',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_orcamento_mov_empresa_ano ON fin_orcamento_movimento(empresa, ano);
CREATE INDEX IF NOT EXISTS idx_orcamento_mov_data ON fin_orcamento_movimento(data);
CREATE INDEX IF NOT EXISTS idx_orcamento_mov_mes ON fin_orcamento_movimento(ano, mes);
CREATE INDEX IF NOT EXISTS idx_orcamento_mov_tipo ON fin_orcamento_movimento(tipo_lancamento);
`

async function migrate() {
  await connectDB()
  logger.info('Criando estrutura do módulo Orçamento Financeiro...')
  try {
    await pool.query(SQL)
    logger.info('✅ Estrutura criada / atualizada: fin_orcamento_*')
  } catch (err) {
    logger.error('❌ Erro ao migrar Orçamento Financeiro: ' + err.message)
    logger.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
