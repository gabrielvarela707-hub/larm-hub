/**
 * Dados cadastrais comuns compartilhados por clientes e fornecedores.
 * Mantém e-mail, telefones e endereço em cad_pessoas e liga os perfis por FK.
 */

const PESSOA_FIELDS = [
  'codigo_legado',
  'nome',
  'nome_normalizado',
  'razao_social',
  'nome_fantasia',
  'tipo_pessoa',
  'cpf_cnpj',
  'cpf_cnpj_digitos',
  'rg',
  'orgao_emissor_rg',
  'inscricao_estadual',
  'inscricao_municipal',
  'email',
  'emails_adicionais',
  'telefone',
  'celular',
  'telefone_comercial',
  'telefone_residencial',
  'fax',
  'website',
  'contato_nome',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'profissao',
  'data_nascimento',
  'data_fundacao',
  'sexo',
  'estado_civil',
  'nacionalidade',
  'naturalidade',
  'dados_adicionais',
  'ativo',
]

function cleanText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || ['.', '-', '. . -', '. . / -', '0'].includes(text)) return null
  return text
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalName(value) {
  const stop = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'CIA', 'COMPANHIA', 'SOCIEDADE', 'SIMPLES', 'UNIPESSOAL'])
  return normalizeName(value)
    .split(' ')
    .filter(token => token && !stop.has(token))
    .join(' ')
}

function normalizeDate(value) {
  const text = cleanText(value)
  if (!text) return null
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

function splitCidadeUf(value) {
  const text = cleanText(value)
  if (!text) return { cidade: null, uf: null }
  const match = text.match(/^(.*?)\s*[-/]\s*([A-Za-z]{2})$/)
  if (!match) return { cidade: text, uf: null }
  return { cidade: cleanText(match[1]), uf: match[2].toUpperCase() }
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return [...new Set(value.map(cleanText).filter(Boolean))]
  if (!value) return []
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return [...new Set(parsed.map(cleanText).filter(Boolean))]
    } catch {}
    return [cleanText(value)].filter(Boolean)
  }
  return []
}

function normalizeJsonObject(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {}
  }
  return {}
}

function normalizePessoaPayload(raw = {}) {
  const nome = cleanText(raw.nome || raw.razao_social || raw.nome_fantasia)
  const document = cleanText(raw.cpf_cnpj || raw.cnpj_cpf)
  const documentDigits = digitsOnly(raw.cpf_cnpj_digitos || document)
  const codigoLegadoRaw = raw.codigo_legado ?? raw.codigo
  const codigoLegado = /^\d+$/.test(String(codigoLegadoRaw ?? '').trim())
    ? Number(codigoLegadoRaw)
    : null
  const tipoPessoa = cleanText(raw.tipo_pessoa)
    || (documentDigits.length === 14 ? 'PJ' : documentDigits.length === 11 ? 'PF' : 'PF')

  return {
    codigo_legado: Number.isInteger(codigoLegado) ? codigoLegado : null,
    nome,
    nome_normalizado: normalizeName(nome),
    razao_social: cleanText(raw.razao_social) || nome,
    nome_fantasia: cleanText(raw.nome_fantasia) || nome,
    tipo_pessoa: String(tipoPessoa).toUpperCase() === 'PJ' ? 'PJ' : 'PF',
    cpf_cnpj: document,
    cpf_cnpj_digitos: [11, 14].includes(documentDigits.length) ? documentDigits : null,
    rg: cleanText(raw.rg),
    orgao_emissor_rg: cleanText(raw.orgao_emissor_rg),
    inscricao_estadual: cleanText(raw.inscricao_estadual),
    inscricao_municipal: cleanText(raw.inscricao_municipal),
    email: cleanText(raw.email)?.toLowerCase() || null,
    emails_adicionais: normalizeJsonArray(raw.emails_adicionais),
    telefone: cleanText(raw.telefone),
    celular: cleanText(raw.celular),
    telefone_comercial: cleanText(raw.telefone_comercial),
    telefone_residencial: cleanText(raw.telefone_residencial),
    fax: cleanText(raw.fax),
    website: cleanText(raw.website),
    contato_nome: cleanText(raw.contato_nome),
    cep: cleanText(raw.cep),
    logradouro: cleanText(raw.logradouro || raw.endereco),
    numero: cleanText(raw.numero),
    complemento: cleanText(raw.complemento),
    bairro: cleanText(raw.bairro),
    cidade: cleanText(raw.cidade),
    uf: cleanText(raw.uf)?.slice(0, 2).toUpperCase() || null,
    profissao: cleanText(raw.profissao),
    data_nascimento: normalizeDate(raw.data_nascimento),
    data_fundacao: normalizeDate(raw.data_fundacao),
    sexo: cleanText(raw.sexo)?.slice(0, 1).toUpperCase() || null,
    estado_civil: cleanText(raw.estado_civil),
    nacionalidade: cleanText(raw.nacionalidade),
    naturalidade: cleanText(raw.naturalidade),
    dados_adicionais: normalizeJsonObject(raw.dados_adicionais),
    ativo: raw.ativo !== false,
  }
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function mergePessoa(existing, incoming, fillOnly) {
  const merged = {}
  for (const field of PESSOA_FIELDS) {
    const oldValue = existing?.[field]
    const newValue = incoming?.[field]

    if (field === 'dados_adicionais') {
      merged[field] = fillOnly
        ? { ...normalizeJsonObject(newValue), ...normalizeJsonObject(oldValue) }
        : { ...normalizeJsonObject(oldValue), ...normalizeJsonObject(newValue) }
      continue
    }

    if (field === 'emails_adicionais') {
      merged[field] = [...new Set([
        ...normalizeJsonArray(oldValue),
        ...normalizeJsonArray(newValue),
      ])]
      continue
    }

    if (field === 'ativo') {
      merged[field] = fillOnly && typeof oldValue === 'boolean' ? oldValue : newValue !== false
      continue
    }

    merged[field] = fillOnly
      ? (hasValue(oldValue) ? oldValue : newValue)
      : (hasValue(newValue) ? newValue : oldValue)
  }

  merged.nome = merged.nome || merged.razao_social || merged.nome_fantasia
  merged.nome_normalizado = normalizeName(merged.nome)
  merged.cpf_cnpj_digitos = [11, 14].includes(digitsOnly(merged.cpf_cnpj).length)
    ? digitsOnly(merged.cpf_cnpj)
    : merged.cpf_cnpj_digitos || null

  return merged
}

async function findPessoa(db, payload, explicitId = null) {
  if (explicitId) {
    const byId = await db.query('SELECT * FROM cad_pessoas WHERE id=$1', [explicitId])
    if (byId.rows[0]) return byId.rows[0]
  }

  // Código legado não é globalmente único: clientes e fornecedores podem ter o
  // mesmo código e representar pessoas diferentes. O vínculo seguro usa documento,
  // nome normalizado ou pessoa_id explícito.
  if (payload.cpf_cnpj_digitos) {
    const byDoc = await db.query(
      'SELECT * FROM cad_pessoas WHERE cpf_cnpj_digitos=$1 ORDER BY id LIMIT 1',
      [payload.cpf_cnpj_digitos],
    )
    if (byDoc.rows[0]) return byDoc.rows[0]
  }

  if (payload.nome_normalizado && payload.nome_normalizado.length >= 4) {
    const byName = await db.query(
      'SELECT * FROM cad_pessoas WHERE nome_normalizado=$1 ORDER BY id LIMIT 1',
      [payload.nome_normalizado],
    )
    if (byName.rows[0]) return byName.rows[0]
  }

  return null
}

async function upsertPessoa(db, rawPayload, options = {}) {
  const incoming = normalizePessoaPayload(rawPayload)
  if (!incoming.nome) throw new Error('Nome da pessoa é obrigatório')

  const existing = await findPessoa(db, incoming, options.pessoaId || null)
  const data = mergePessoa(existing || {}, incoming, Boolean(options.fillOnly))
  const values = PESSOA_FIELDS.map(field => {
    if (field === 'emails_adicionais') return JSON.stringify(data[field] || [])
    if (field === 'dados_adicionais') return JSON.stringify(data[field] || {})
    return data[field] ?? null
  })

  if (existing) {
    const assignments = PESSOA_FIELDS.map((field, index) => `${field}=$${index + 1}`).join(', ')
    const result = await db.query(
      `UPDATE cad_pessoas SET ${assignments}, updated_at=NOW()
       WHERE id=$${PESSOA_FIELDS.length + 1}
       RETURNING *`,
      [...values, existing.id],
    )
    return { pessoa: result.rows[0], created: false }
  }

  const placeholders = PESSOA_FIELDS.map((_, index) => `$${index + 1}`).join(', ')
  const result = await db.query(
    `INSERT INTO cad_pessoas (${PESSOA_FIELDS.join(', ')})
     VALUES (${placeholders})
     RETURNING *`,
    values,
  )
  return { pessoa: result.rows[0], created: true }
}

function fornecedorToPessoa(fornecedor = {}) {
  const city = splitCidadeUf(fornecedor.cidade_uf)
  return {
    codigo_legado: fornecedor.codigo,
    nome: fornecedor.razao_social || fornecedor.nome_fantasia,
    razao_social: fornecedor.razao_social,
    nome_fantasia: fornecedor.nome_fantasia,
    tipo_pessoa: fornecedor.tipo_pessoa,
    cpf_cnpj: fornecedor.cnpj_cpf,
    email: fornecedor.email,
    telefone: fornecedor.telefone,
    telefone_comercial: fornecedor.telefone,
    cep: fornecedor.cep,
    logradouro: fornecedor.endereco,
    cidade: city.cidade,
    uf: city.uf,
    ativo: fornecedor.ativo !== false,
    dados_adicionais: {
      fornecedor: {
        categoria: cleanText(fornecedor.categoria),
        empresa: cleanText(fornecedor.empresa),
      },
    },
  }
}

async function syncFornecedorPessoa(db, fornecedorOrId, options = {}) {
  let fornecedor = fornecedorOrId
  if (typeof fornecedorOrId !== 'object') {
    const result = await db.query('SELECT * FROM fin_fornecedores WHERE id=$1', [fornecedorOrId])
    fornecedor = result.rows[0]
  }
  if (!fornecedor) return null

  const saved = await upsertPessoa(db, fornecedorToPessoa(fornecedor), {
    pessoaId: fornecedor.pessoa_id || null,
    fillOnly: Boolean(options.fillOnly),
  })

  if (fornecedor.pessoa_id !== saved.pessoa.id) {
    await db.query(
      'UPDATE fin_fornecedores SET pessoa_id=$1, updated_at=NOW() WHERE id=$2',
      [saved.pessoa.id, fornecedor.id],
    )
  }

  return saved.pessoa
}

module.exports = {
  PESSOA_FIELDS,
  cleanText,
  digitsOnly,
  normalizeName,
  canonicalName,
  normalizePessoaPayload,
  upsertPessoa,
  syncFornecedorPessoa,
}
