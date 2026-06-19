/**
 * scripts/migrate_fornecedores_bancos.js
 * Cria tabelas de fornecedores, bancos/contas, plano de contas e lançamentos CP
 * Rodar: node scripts/migrate_fornecedores_bancos.js
 */
require("dotenv").config();
const { pool, connectDB } = require("../src/config/database");
const logger = require("../src/config/logger");

const SQL = `

-- ─── Fornecedores ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_fornecedores (
  id            SERIAL PRIMARY KEY,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj_cpf      VARCHAR(20) UNIQUE,
  tipo_pessoa   VARCHAR(2)  DEFAULT 'PJ',   -- PJ | PF
  categoria     VARCHAR(50),                -- 'Serviços' | 'Materiais' | 'Condomínio' | 'Órgão Público' ...
  email         VARCHAR(150),
  telefone      VARCHAR(20),
  empresa       VARCHAR(30) DEFAULT 'TODOS',-- LARM | LUCKY | LM | HOLDING | RM | TODOS
  cep           VARCHAR(10),
  endereco      TEXT,
  cidade_uf     VARCHAR(80),
  -- dados bancários do fornecedor (para pagamento)
  banco_nome    VARCHAR(120),
  codigo_banco  VARCHAR(10),
  agencia       VARCHAR(10),
  conta         VARCHAR(20),
  digito        VARCHAR(2),
  tipo_conta    VARCHAR(20) DEFAULT 'Corrente',
  chave_pix     VARCHAR(150),
  obs           TEXT,
  ativo         BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_forn_empresa  ON fin_fornecedores(empresa);
CREATE INDEX IF NOT EXISTS idx_forn_ativo    ON fin_fornecedores(ativo);
CREATE INDEX IF NOT EXISTS idx_forn_cnpj     ON fin_fornecedores(cnpj_cpf);

ALTER TABLE fin_fornecedores ADD COLUMN IF NOT EXISTS codigo_banco VARCHAR(10);
ALTER TABLE fin_fornecedores ADD COLUMN IF NOT EXISTS digito VARCHAR(2);
ALTER TABLE fin_fornecedores ALTER COLUMN banco_nome TYPE VARCHAR(120);

-- ─── Bancos / Contas da empresa ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_bancos_contas (
  id                 SERIAL PRIMARY KEY,
  empresa            VARCHAR(30) NOT NULL,  -- LARM | LUCKY | LM | HOLDING | RM
  banco_nome         VARCHAR(120) NOT NULL,
  codigo_banco       VARCHAR(10),
  agencia            VARCHAR(10),
  conta              VARCHAR(20),
  digito             CHAR(1),
  tipo_conta         VARCHAR(20) DEFAULT 'Corrente',
  saldo_inicial      NUMERIC(18,4) DEFAULT 0,
  data_saldo_inicial DATE,
  ativo              BOOLEAN DEFAULT TRUE,
  obs                TEXT,
  created_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bancos_empresa ON fin_bancos_contas(empresa);

ALTER TABLE fin_bancos_contas ALTER COLUMN banco_nome TYPE VARCHAR(120);

-- ─── Plano de Contas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_plano_contas (
  id        SERIAL PRIMARY KEY,
  codigo    VARCHAR(20) NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  tipo      CHAR(1) DEFAULT 'A',  -- T=totalizador, S=subtotal, A=analítico
  pai_id    INTEGER REFERENCES fin_plano_contas(id),
  ativo     BOOLEAN DEFAULT TRUE
);

-- Insere plano padrão vindo do sistema atual (baseado nos dados reais)
INSERT INTO fin_plano_contas (codigo, descricao, tipo) VALUES
  ('1',    'RECEITAS OPERACIONAIS',                  'T'),
  ('1.1',  'VENDA DE IMÓVEIS',                       'S'),
  ('1.2',  'ALUGUÉIS',                               'S'),
  ('1.3',  'VENDA DE MERCADORIAS/GADO',              'S'),
  ('1.4',  'OUTRAS RECEITAS OPERACIONAIS',           'S'),
  ('2',    'RECEITA LÍQUIDA',                        'T'),
  ('3',    'GERAÇÃO DE CAIXA',                       'T'),
  ('4',    'DESPESAS',                               'T'),
  ('4.1',  'FGTS',                                   'A'),
  ('4.2',  'ALUGUÉIS E CONDOMÍNIOS',                 'A'),
  ('4.3',  'ENERGIA ELÉTRICA',                       'A'),
  ('4.4',  'GASTOS DIVERSOS',                        'A'),
  ('4.5',  'SEGURANÇA E VIGILÂNCIA',                 'A'),
  ('4.6',  'TELEFONE E INTERNET',                    'A'),
  ('4.7',  'MANUTENÇÃO E REPARO DE VEÍCULOS',        'A'),
  ('4.8',  'COMBUSTÍVEL',                            'A'),
  ('4.9',  'IPVA / IMPOSTOS',                        'A'),
  ('4.10', 'IRPJ / CSLL',                            'A'),
  ('4.11', 'PASTAGENS',                              'A'),
  ('4.12', 'ASSISTÊNCIA MÉDICA',                     'A'),
  ('4.13', 'SALÁRIOS E ENCARGOS',                    'A'),
  ('5',    'DISTRIBUIÇÃO DE LUCROS',                 'T'),
  ('6',    'APLICAÇÕES FINANCEIRAS',                 'T'),
  ('7',    'INVESTIMENTOS',                          'T'),
  ('7.1',  'BENFEITORIAS',                           'A'),
  ('7.2',  'AQUISIÇÃO DE IMÓVEIS',                   'A'),
  ('7.3',  'IMÓVEIS / BENFEITORIAS',                 'A'),
  ('8',    'SALDOS BANCÁRIOS C/C',                   'T'),
  ('9',    'RESULTADOS',                             'T'),
  ('9.1',  'RESULTADO EM PARTICIPAÇÃO SOCIETÁRIA',   'A')
ON CONFLICT (codigo) DO NOTHING;

-- ─── Lançamentos Contas a Pagar ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_lancamentos_cp (
  id               SERIAL PRIMARY KEY,
  empresa          VARCHAR(30) NOT NULL,
  fornecedor_id    INTEGER REFERENCES fin_fornecedores(id),
  banco_conta_id   INTEGER REFERENCES fin_bancos_contas(id),
  conta_contabil   VARCHAR(20),   -- código do plano de contas ex: '4.2'
  descricao_conta  TEXT,          -- nome da conta (desnormalizado para performance)
  historico        TEXT NOT NULL,
  produto_servico  TEXT,
  tipo_documento_id INTEGER,
  nf_doc           VARCHAR(100),
  documento_nome   VARCHAR(255),
  documento_mime   VARCHAR(120),
  documento_base64 TEXT,
  dt_emissao       DATE,
  valor_total      NUMERIC(18,4) NOT NULL,
  qtd_parcelas     INTEGER DEFAULT 1,
  status           VARCHAR(20) DEFAULT 'pendente', -- pendente | pago | vencido | cancelado
  centro_custo     TEXT,
  obra             TEXT,
  n_cheque         VARCHAR(50),
  obs              TEXT,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cp_empresa    ON fin_lancamentos_cp(empresa);
CREATE INDEX IF NOT EXISTS idx_cp_status     ON fin_lancamentos_cp(status);
CREATE INDEX IF NOT EXISTS idx_cp_fornecedor ON fin_lancamentos_cp(fornecedor_id);

-- ─── Parcelas ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_parcelas_cp (
  id             SERIAL PRIMARY KEY,
  lancamento_id  INTEGER NOT NULL REFERENCES fin_lancamentos_cp(id) ON DELETE CASCADE,
  numero         INTEGER NOT NULL,      -- 1, 2, 3...
  valor          NUMERIC(18,4) NOT NULL,
  vencimento     DATE NOT NULL,
  status         VARCHAR(20) DEFAULT 'pendente',
  dt_pagamento   DATE,
  motivo_baixa   TEXT,
  acrescimo      NUMERIC(18,4) DEFAULT 0,
  desconto       NUMERIC(18,4) DEFAULT 0,
  retencao_ipi   NUMERIC(18,4) DEFAULT 0,
  retencao_iss   NUMERIC(18,4) DEFAULT 0,
  retencao_icms  NUMERIC(18,4) DEFAULT 0,
  retencao_pis   NUMERIC(18,4) DEFAULT 0,
  retencao_cofins NUMERIC(18,4) DEFAULT 0,
  retencao_csll  NUMERIC(18,4) DEFAULT 0,
  retencao_irrf  NUMERIC(18,4) DEFAULT 0,
  retencao_inss  NUMERIC(18,4) DEFAULT 0,
  juros          NUMERIC(18,4) DEFAULT 0,
  multa          NUMERIC(18,4) DEFAULT 0,
  valor_final    NUMERIC(18,4),
  baixa_acrescimo NUMERIC(18,4) DEFAULT 0,
  baixa_desconto  NUMERIC(18,4) DEFAULT 0,
  baixa_juros     NUMERIC(18,4) DEFAULT 0,
  baixa_multa     NUMERIC(18,4) DEFAULT 0,
  baixa_valor_final NUMERIC(18,4),
  forma_pagamento VARCHAR(80),
  movimento_id   BIGINT REFERENCES fin_movimento(id),
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parc_lancamento ON fin_parcelas_cp(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_parc_vencimento ON fin_parcelas_cp(vencimento);
CREATE INDEX IF NOT EXISTS idx_parc_status     ON fin_parcelas_cp(status);

-- ─── Adiciona campos de baixa em parcelas existentes ─────────────────────────
ALTER TABLE fin_parcelas_cp
  ADD COLUMN IF NOT EXISTS motivo_baixa TEXT,
  ADD COLUMN IF NOT EXISTS acrescimo NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_ipi NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_iss NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_icms NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_pis NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_cofins NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_csll NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_irrf NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retencao_inss NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS juros NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS multa NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_final NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS baixa_acrescimo NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_desconto NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_juros NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_multa NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baixa_valor_final NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(80),
  ADD COLUMN IF NOT EXISTS movimento_id BIGINT REFERENCES fin_movimento(id);

UPDATE fin_parcelas_cp
SET baixa_acrescimo = CASE WHEN baixa_acrescimo IS NULL OR baixa_acrescimo = 0 THEN COALESCE(acrescimo, 0) ELSE baixa_acrescimo END,
    baixa_desconto = CASE WHEN baixa_desconto IS NULL OR baixa_desconto = 0 THEN COALESCE(desconto, 0) ELSE baixa_desconto END,
    baixa_juros = CASE WHEN baixa_juros IS NULL OR baixa_juros = 0 THEN COALESCE(juros, 0) ELSE baixa_juros END,
    baixa_multa = CASE WHEN baixa_multa IS NULL OR baixa_multa = 0 THEN COALESCE(multa, 0) ELSE baixa_multa END,
    baixa_valor_final = COALESCE(baixa_valor_final, valor_final)
WHERE status = 'pago'
  AND (baixa_valor_final IS NULL OR baixa_valor_final = 0);

-- ─── Adiciona colunas novas ao fin_movimento (se não existirem) ───────────────
ALTER TABLE fin_movimento
  ADD COLUMN IF NOT EXISTS tipo_lancamento VARCHAR(20) DEFAULT 'financeiro',
  ADD COLUMN IF NOT EXISTS vencimento      DATE,
  ADD COLUMN IF NOT EXISTS fornecedor_id   INTEGER REFERENCES fin_fornecedores(id),
  ADD COLUMN IF NOT EXISTS banco_conta_id  INTEGER REFERENCES fin_bancos_contas(id);

-- classifica registros existentes: natureza_financeira = '#N/A' -> administrativo
UPDATE fin_movimento
SET tipo_lancamento = 'administrativo'
WHERE natureza_financeira = '#N/A' OR natureza_financeira IS NULL;

UPDATE fin_movimento
SET tipo_lancamento = 'financeiro'
WHERE natureza_financeira IS NOT NULL AND natureza_financeira != '#N/A'
  AND tipo_lancamento IS NULL;

CREATE INDEX IF NOT EXISTS idx_mov_tipo ON fin_movimento(tipo_lancamento);

`;

async function migrate() {
  await connectDB();
  logger.info("Criando tabelas de fornecedores, bancos e lançamentos CP...");
  try {
    await pool.query(SQL);
    logger.info("✅  Tabelas criadas / atualizadas:");
    logger.info("   - fin_fornecedores");
    logger.info("   - fin_bancos_contas");
    logger.info("   - fin_plano_contas");
    logger.info("   - fin_lancamentos_cp");
    logger.info("   - fin_parcelas_cp");
    logger.info("   - fin_movimento (colunas adicionadas)");
  } catch (err) {
    logger.error("❌  Erro:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
