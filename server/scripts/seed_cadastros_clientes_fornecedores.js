/**
 * Versão 0.3.38
 * Popula clientes e complementa fornecedores a partir das bases STR9820/STR8124.
 *
 * Regras para fornecedores:
 * 1. compara CPF/CNPJ sem pontuação;
 * 2. compara nome normalizado;
 * 3. compara nome canônico sem sufixos societários;
 * 4. em fornecedor existente, preenche somente dados vazios.
 *
 * Rodar: node scripts/seed_cadastros_clientes_fornecedores.js
 */
require('dotenv').config()

const path = require('path')
const clientes = require(path.join(__dirname, 'imports/cadastros-clientes-str9820.json'))
const fornecedores = require(path.join(__dirname, 'imports/cadastros-fornecedores-str8124.json'))
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const EXECUTE = process.argv.includes('--execute')
const {
  cleanText,
  digitsOnly,
  normalizeName,
  canonicalName,
  upsertPessoa,
  syncFornecedorPessoa,
} = require('../src/services/cadastroPessoaService')

function uniqueMap(rows, keyFn) {
  const grouped = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (!key) continue
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  const result = new Map()
  for (const [key, items] of grouped.entries()) {
    if (items.length === 1) result.set(key, items[0])
  }
  return result
}

function firstMap(rows, keyFn) {
  const result = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    if (key && !result.has(key)) result.set(key, row)
  }
  return result
}

function fornecedorPessoaPayload(source) {
  return {
    ...source,
    nome: source.nome || source.razao_social,
    dados_adicionais: {
      ...(source.dados_adicionais || {}),
      perfil_fornecedor: {
        codigos_legado: source.codigos_legado || [source.codigo_legado].filter(Boolean),
        origem: 'STR8124',
      },
    },
  }
}

function splitCidadeUf(source) {
  const cidade = cleanText(source.cidade)
  const uf = cleanText(source.uf)?.slice(0, 2).toUpperCase() || null
  return cidade && uf ? `${cidade} - ${uf}` : cidade || uf
}

async function seed() {
  await connectDB()
  const client = await pool.connect()
  const summary = {
    pessoas_criadas: 0,
    pessoas_atualizadas: 0,
    clientes_criados: 0,
    clientes_atualizados: 0,
    fornecedores_criados: 0,
    fornecedores_complementados: 0,
    fornecedores_sem_alteracao: 0,
  }

  try {
    await client.query('BEGIN')

    for (const source of clientes) {
      const saved = await upsertPessoa(client, source, { fillOnly: true })
      if (saved.created) summary.pessoas_criadas += 1
      else summary.pessoas_atualizadas += 1

      const code = cleanText(source.codigo_legado)
      const existing = await client.query(
        'SELECT id FROM cad_clientes WHERE pessoa_id=$1 LIMIT 1',
        [saved.pessoa.id],
      )

      if (existing.rows[0]) {
        await client.query(
          `UPDATE cad_clientes SET
             codigo=COALESCE(NULLIF(codigo,''), $1),
             observacoes=COALESCE(NULLIF(observacoes,''), $2),
             updated_at=NOW()
           WHERE id=$3`,
          [code, cleanText(source.observacoes), existing.rows[0].id],
        )
        summary.clientes_atualizados += 1
      } else {
        await client.query(
          `INSERT INTO cad_clientes (pessoa_id, codigo, observacoes, ativo)
           VALUES ($1,$2,$3,TRUE)`,
          [saved.pessoa.id, code, cleanText(source.observacoes)],
        )
        summary.clientes_criados += 1
      }
    }

    let { rows: existingFornecedores } = await client.query('SELECT * FROM fin_fornecedores ORDER BY id')
    let byDoc = firstMap(existingFornecedores, row => {
      const value = digitsOnly(row.cnpj_cpf)
      return [11, 14].includes(value.length) ? value : ''
    })
    // Nome exato normalizado pode apontar para o primeiro registro existente sem
    // criar duplicidade. A comparação canônica só é usada quando for única.
    let byName = firstMap(existingFornecedores, row => normalizeName(row.razao_social || row.nome_fantasia))
    let byCanonical = uniqueMap(existingFornecedores, row => canonicalName(row.razao_social || row.nome_fantasia))

    for (const source of fornecedores) {
      const doc = digitsOnly(source.cpf_cnpj)
      const nameKey = normalizeName(source.nome || source.razao_social)
      const canonicalKey = canonicalName(source.nome || source.razao_social)
      const existing = (doc && byDoc.get(doc)) || byName.get(nameKey) || byCanonical.get(canonicalKey) || null

      if (existing) {
        const before = JSON.stringify(existing)
        const values = [
          source.razao_social || source.nome,
          source.nome_fantasia || source.nome,
          source.cpf_cnpj,
          source.tipo_pessoa || 'PJ',
          source.categoria,
          source.email,
          source.telefone || source.telefone_comercial,
          source.empresa || 'TODOS',
          source.cep,
          source.logradouro,
          splitCidadeUf(source),
          source.observacoes,
          String(source.codigo_legado || ''),
          existing.id,
        ]

        const updated = await client.query(
          `UPDATE fin_fornecedores SET
             razao_social=COALESCE(NULLIF(razao_social,''), $1),
             nome_fantasia=COALESCE(NULLIF(nome_fantasia,''), $2),
             cnpj_cpf=COALESCE(NULLIF(cnpj_cpf,''), $3),
             tipo_pessoa=COALESCE(NULLIF(tipo_pessoa,''), $4),
             categoria=COALESCE(NULLIF(categoria,''), $5),
             email=COALESCE(NULLIF(email,''), $6),
             telefone=COALESCE(NULLIF(telefone,''), $7),
             empresa=COALESCE(NULLIF(empresa,''), $8),
             cep=COALESCE(NULLIF(cep,''), $9),
             endereco=COALESCE(NULLIF(endereco,''), $10),
             cidade_uf=COALESCE(NULLIF(cidade_uf,''), $11),
             obs=COALESCE(NULLIF(obs,''), $12),
             codigo=COALESCE(NULLIF(codigo,''), NULLIF($13,'')),
             updated_at=NOW()
           WHERE id=$14
           RETURNING *`,
          values,
        )

        await upsertPessoa(client, fornecedorPessoaPayload(source), {
          pessoaId: updated.rows[0].pessoa_id || null,
          fillOnly: true,
        })
        const pessoa = await syncFornecedorPessoa(client, updated.rows[0], { fillOnly: true })
        const finalRow = { ...updated.rows[0], pessoa_id: pessoa?.id || updated.rows[0].pessoa_id }
        const changed = before !== JSON.stringify(finalRow)
        Object.assign(existing, finalRow)
        summary.fornecedores_complementados += changed ? 1 : 0
        summary.fornecedores_sem_alteracao += changed ? 0 : 1
      } else {
        const savedPessoa = await upsertPessoa(client, fornecedorPessoaPayload(source), { fillOnly: true })
        if (savedPessoa.created) summary.pessoas_criadas += 1
        else summary.pessoas_atualizadas += 1

        const inserted = await client.query(
          `INSERT INTO fin_fornecedores
             (pessoa_id, razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
              email, telefone, empresa, cep, endereco, cidade_uf, obs, ativo, codigo)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14)
           RETURNING *`,
          [
            savedPessoa.pessoa.id,
            source.razao_social || source.nome,
            source.nome_fantasia || source.nome,
            source.cpf_cnpj,
            source.tipo_pessoa || 'PJ',
            source.categoria,
            source.email,
            source.telefone || source.telefone_comercial,
            source.empresa || 'TODOS',
            source.cep,
            source.logradouro,
            splitCidadeUf(source),
            source.observacoes,
            String(source.codigo_legado || ''),
          ],
        )
        summary.fornecedores_criados += 1
        existingFornecedores.push(inserted.rows[0])
        byDoc = firstMap(existingFornecedores, row => {
          const value = digitsOnly(row.cnpj_cpf)
          return [11, 14].includes(value.length) ? value : ''
        })
        byName = firstMap(existingFornecedores, row => normalizeName(row.razao_social || row.nome_fantasia))
        byCanonical = uniqueMap(existingFornecedores, row => canonicalName(row.razao_social || row.nome_fantasia))
      }
    }

    if (EXECUTE) {
      await client.query('COMMIT')
      logger.info('✅ Seed de cadastros executado e gravado no banco')
    } else {
      await client.query('ROLLBACK')
      logger.info('🔎 Prévia concluída. Nenhuma alteração foi gravada. Use --execute para confirmar.')
    }
    logger.info(JSON.stringify(summary, null, 2))
  } catch (err) {
    await client.query('ROLLBACK')
    logger.error(`❌ Erro no seed de cadastros: ${err.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
