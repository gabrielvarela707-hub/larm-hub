/**
 * scripts/seed_fornecedores_movimento.js
 *
 * Cria fornecedores iniciais a partir da extração sanitizada do Movimento Bancário
 * 2021-2026, sem preencher CNPJ/CPF fictício.
 *
 * Rodar:
 *   node scripts/seed_fornecedores_movimento.js
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const INPUT_FILE = path.join(__dirname, 'imports', 'fornecedores-movimento-2021-2026.json')

function stripAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeFornecedorKey(value) {
  let text = stripAccents(value)
    .toUpperCase()
    .replace(/\bLIMITADA\b/g, 'LTDA')
    .replace(/\bLTD\b/g, 'LTDA')
    .replace(/\bS\s*\/?\s*A\b/g, 'SA')
    .replace(/\bS\.A\.?\b/g, 'SA')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

  const stopWords = new Set([
    'LTDA', 'SA', 'ME', 'EPP', 'EIRELI', 'DE', 'DA', 'DO', 'DAS', 'DOS', 'E',
    'COM', 'IND', 'INDUSTRIA', 'COMERCIO', 'SERVICOS', 'SERVICO', 'CIA', 'COMPANHIA',
  ])

  return text
    .split(/\s+/)
    .filter((word) => word && !stopWords.has(word))
    .join(' ')
}

function textOrNull(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

function loadRows() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Arquivo não encontrado: ${INPUT_FILE}`)
  }

  const rows = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'))
  if (!Array.isArray(rows)) {
    throw new Error('Arquivo de fornecedores deve conter um array JSON.')
  }

  return rows
}

async function seedFornecedores() {
  await connectDB()

  const rows = loadRows()
  const existing = await pool.query(`SELECT id, razao_social FROM fin_fornecedores`)
  const existingKeys = new Map()

  for (const row of existing.rows) {
    const key = normalizeFornecedorKey(row.razao_social)
    if (key && !existingKeys.has(key)) existingKeys.set(key, row.id)
  }

  const seenImportKeys = new Set()
  const result = {
    read: rows.length,
    created: 0,
    skipped_existing: 0,
    skipped_duplicate_file: 0,
    skipped_invalid: 0,
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const row of rows) {
      const razaoSocial = textOrNull(row.razao_social)
      const key = normalizeFornecedorKey(razaoSocial)

      if (!razaoSocial || !key) {
        result.skipped_invalid += 1
        continue
      }

      if (seenImportKeys.has(key)) {
        result.skipped_duplicate_file += 1
        continue
      }
      seenImportKeys.add(key)

      if (existingKeys.has(key)) {
        result.skipped_existing += 1
        continue
      }

      const obsParts = [
        textOrNull(row.obs),
        row.ocorrencias ? `Ocorrências encontradas: ${row.ocorrencias}.` : null,
        row.anos ? `Anos de origem: ${row.anos}.` : null,
      ].filter(Boolean)

      const inserted = await client.query(
        `INSERT INTO fin_fornecedores
          (razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
           email, telefone, empresa, cep, endereco, cidade_uf,
           banco_nome, codigo_banco, agencia, conta, digito, tipo_conta, chave_pix, obs, ativo)
         VALUES ($1,$2,NULL,$3,$4,NULL,NULL,$5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$6,NULL,$7,true)
         RETURNING id`,
        [
          razaoSocial,
          textOrNull(row.nome_fantasia) || razaoSocial,
          ['PF', 'PJ'].includes(String(row.tipo_pessoa || '').toUpperCase())
            ? String(row.tipo_pessoa).toUpperCase()
            : 'PJ',
          textOrNull(row.categoria) || 'Não classificado',
          textOrNull(row.empresa) || 'TODOS',
          textOrNull(row.tipo_conta) || 'Corrente',
          obsParts.join('\n'),
        ],
      )

      existingKeys.set(key, inserted.rows[0].id)
      result.created += 1
    }

    await client.query('COMMIT')
    logger.info(`✅ Seed de fornecedores concluído: ${JSON.stringify(result)}`)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

seedFornecedores()
  .catch((err) => {
    logger.error(`❌ Erro no seed de fornecedores: ${err.message}`)
    process.exitCode = 1
  })
  .finally(() => pool.end())
