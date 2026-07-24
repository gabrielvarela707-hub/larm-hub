/**
 * Versão 0.3.38
 * Cria o cadastro comum de pessoas e o perfil de clientes.
 * Fornecedores existentes são ligados a cad_pessoas sem apagar colunas legadas.
 *
 * Rodar: node scripts/migrate_cadastros_pessoas_clientes.js
 */
require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')
const { syncFornecedorPessoa } = require('../src/services/cadastroPessoaService')

async function migrate() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    await client.query(`
      CREATE TABLE IF NOT EXISTS cad_pessoas (
        id                      SERIAL PRIMARY KEY,
        codigo_legado           INTEGER,
        nome                    TEXT NOT NULL,
        nome_normalizado        TEXT NOT NULL,
        razao_social            TEXT,
        nome_fantasia           TEXT,
        tipo_pessoa             VARCHAR(2) NOT NULL DEFAULT 'PF',
        cpf_cnpj                VARCHAR(30),
        cpf_cnpj_digitos        VARCHAR(14),
        rg                      VARCHAR(40),
        orgao_emissor_rg        VARCHAR(30),
        inscricao_estadual      VARCHAR(40),
        inscricao_municipal     VARCHAR(40),
        email                   VARCHAR(255),
        emails_adicionais       JSONB NOT NULL DEFAULT '[]'::jsonb,
        telefone                VARCHAR(40),
        celular                 VARCHAR(40),
        telefone_comercial     VARCHAR(40),
        telefone_residencial   VARCHAR(40),
        fax                     VARCHAR(40),
        website                 VARCHAR(255),
        contato_nome            VARCHAR(160),
        cep                     VARCHAR(12),
        logradouro              TEXT,
        numero                  VARCHAR(30),
        complemento             VARCHAR(160),
        bairro                  VARCHAR(120),
        cidade                  VARCHAR(120),
        uf                      VARCHAR(2),
        profissao               VARCHAR(160),
        data_nascimento         DATE,
        data_fundacao           DATE,
        sexo                    VARCHAR(1),
        estado_civil            VARCHAR(60),
        nacionalidade           VARCHAR(80),
        naturalidade            VARCHAR(120),
        dados_adicionais        JSONB NOT NULL DEFAULT '{}'::jsonb,
        ativo                   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT ck_cad_pessoas_tipo CHECK (tipo_pessoa IN ('PF', 'PJ'))
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS cad_clientes (
        id              SERIAL PRIMARY KEY,
        pessoa_id       INTEGER NOT NULL REFERENCES cad_pessoas(id) ON DELETE RESTRICT,
        codigo          VARCHAR(30),
        observacoes     TEXT,
        ativo           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_cad_clientes_pessoa UNIQUE (pessoa_id)
      )
    `)

    await client.query(`ALTER TABLE fin_fornecedores ADD COLUMN IF NOT EXISTS pessoa_id INTEGER`)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_fin_fornecedores_pessoa'
        ) THEN
          ALTER TABLE fin_fornecedores
            ADD CONSTRAINT fk_fin_fornecedores_pessoa
            FOREIGN KEY (pessoa_id) REFERENCES cad_pessoas(id) ON DELETE SET NULL;
        END IF;
      END $$
    `)

    await client.query('CREATE INDEX IF NOT EXISTS idx_cad_pessoas_codigo ON cad_pessoas (codigo_legado)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_cad_pessoas_nome_norm ON cad_pessoas (nome_normalizado)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_cad_pessoas_documento ON cad_pessoas (cpf_cnpj_digitos)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_cad_pessoas_ativo ON cad_pessoas (ativo)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_cad_clientes_codigo ON cad_clientes (codigo)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_cad_clientes_ativo ON cad_clientes (ativo)')
    await client.query('CREATE INDEX IF NOT EXISTS idx_fin_fornecedores_pessoa ON fin_fornecedores (pessoa_id)')

    const { rows: fornecedores } = await client.query('SELECT * FROM fin_fornecedores ORDER BY id')
    let vinculados = 0
    for (const fornecedor of fornecedores) {
      await syncFornecedorPessoa(client, fornecedor, { fillOnly: true })
      vinculados += 1
    }

    await client.query(`
      UPDATE hub_profiles
         SET permissions = COALESCE(permissions, '{}'::jsonb) ||
           jsonb_build_object(
             'cadastros_clientes',
             CASE
               WHEN LOWER(name) IN ('administrador', 'gerente')
                 THEN jsonb_build_object('read', true, 'write', true)
               ELSE jsonb_build_object('read', false, 'write', false)
             END
           ),
           updated_at = NOW()
       WHERE NOT (COALESCE(permissions, '{}'::jsonb) ? 'cadastros_clientes')
    `)

    await client.query('COMMIT')
    logger.info(`✅ Cadastro comum criado. ${vinculados} fornecedores vinculados a cad_pessoas.`)
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(`❌ Erro na migration de cadastros: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

migrate()
