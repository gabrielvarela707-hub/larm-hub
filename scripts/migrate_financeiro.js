/**
 * scripts/migrate_financeiro.js
 * Cria as tabelas financeiras (CashFlow + Movimento Bancário)
 * Rodar: node scripts/migrate_financeiro.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const SQL = `

-- ─── CashFlow — linhas hierárquicas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_cashflow_linhas (
  id          SERIAL PRIMARY KEY,
  row_idx     INTEGER NOT NULL,           -- posição original na planilha
  codigo      VARCHAR(20),                -- '1.', '1.1', '4.12', etc.
  descricao   TEXT NOT NULL,
  nivel       INTEGER DEFAULT 1,          -- 1=categoria, 2=subcategoria, 3=item
  tipo        VARCHAR(20) DEFAULT 'item', -- 'header'|'total'|'item'|'subtotal'
  UNIQUE(row_idx)
);

-- ─── CashFlow — valores mensais por empresa ───────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_cashflow_valores (
  id          BIGSERIAL PRIMARY KEY,
  linha_id    INTEGER NOT NULL REFERENCES fin_cashflow_linhas(id) ON DELETE CASCADE,
  empresa     VARCHAR(30) NOT NULL,       -- CONSOLIDADO|LARM|LUCKY|LM|HOLDING|RM
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL,           -- 1-12
  valor       NUMERIC(18,4) DEFAULT 0,
  UNIQUE(linha_id, empresa, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_cf_valores_empresa  ON fin_cashflow_valores(empresa);
CREATE INDEX IF NOT EXISTS idx_cf_valores_ano_mes  ON fin_cashflow_valores(ano, mes);
CREATE INDEX IF NOT EXISTS idx_cf_valores_linha    ON fin_cashflow_valores(linha_id);

-- ─── Movimento Bancário ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_movimento (
  id                  BIGSERIAL PRIMARY KEY,
  data                DATE,
  empresa             VARCHAR(30),
  banco               VARCHAR(60),
  entradas            NUMERIC(18,4),
  saidas              NUMERIC(18,4),
  fornecedor          TEXT,
  historico           TEXT,
  nf_doc              VARCHAR(100),
  emissao_doc         DATE,
  conta_contabil      TEXT,
  centro_custo        TEXT,
  obra                TEXT,
  natureza_financeira VARCHAR(20),        -- '1.1', '4.2', '5.1', etc.
  n_cheque            VARCHAR(50),
  dia                 INTEGER,
  mes                 INTEGER,
  ano                 INTEGER,
  saldo               NUMERIC(18,4),
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mov_data      ON fin_movimento(data);
CREATE INDEX IF NOT EXISTS idx_mov_empresa   ON fin_movimento(empresa);
CREATE INDEX IF NOT EXISTS idx_mov_banco     ON fin_movimento(banco);
CREATE INDEX IF NOT EXISTS idx_mov_nat       ON fin_movimento(natureza_financeira);
CREATE INDEX IF NOT EXISTS idx_mov_ano_mes   ON fin_movimento(ano, mes);
CREATE INDEX IF NOT EXISTS idx_mov_fornec    ON fin_movimento(fornecedor);

`

async function migrate() {
  await connectDB()
  logger.info('Criando tabelas financeiras...')
  try {
    await pool.query(SQL)
    logger.info('✅  Tabelas criadas:')
    logger.info('   - fin_cashflow_linhas')
    logger.info('   - fin_cashflow_valores')
    logger.info('   - fin_movimento')
  } catch (err) {
    logger.error('❌  Erro:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
