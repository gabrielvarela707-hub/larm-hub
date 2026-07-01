/**
 * Cadastro de clientes baseado em cad_pessoas.
 * Dados comuns são compartilhados com fornecedores por chave estrangeira.
 */
const express = require('express')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { cleanText, upsertPessoa } = require('../services/cadastroPessoaService')

const router = express.Router()
router.use(authenticate)

const CEP_CACHE = new Map()
const CEP_CACHE_TTL_MS = 24 * 60 * 60 * 1000

function trimDb(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function normalizeBillingCompany(row) {
  const code = Number(row?.codigo)
  const name = trimDb(row?.nome).toUpperCase()
  if (code === 1 || name.includes('LARM')) return 'LARM'
  if (code === 2 || name.includes('LUCKY')) return 'LUCKY'
  return null
}

function normalizeCompanyAddress(row) {
  let logradouro = trimDb(row?.logradouro)
  let numero = trimDb(row?.numero)
  let complemento = ''

  if (numero) {
    const numberMatch = numero.match(/^(\d+[A-Za-z]?)\s*(.*)$/)
    if (numberMatch) {
      numero = numberMatch[1]
      complemento = trimDb(numberMatch[2])
    }
  } else {
    const streetMatch = logradouro.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)\s*(.*)$/)
    if (streetMatch) {
      logradouro = trimDb(streetMatch[1]).replace(/,$/, '')
      numero = streetMatch[2]
      complemento = trimDb(streetMatch[3])
    }
  }

  return { logradouro, numero, complemento }
}

async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'LarmHub/0.3.64' },
    })
    if (!response.ok) throw new Error(`Serviço de CEP respondeu ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

async function lookupCep(cep) {
  const digits = String(cep || '').replace(/\D/g, '')
  if (digits.length !== 8) {
    const error = new Error('CEP inválido. Informe 8 dígitos.')
    error.statusCode = 400
    throw error
  }

  const cached = CEP_CACHE.get(digits)
  if (cached && Date.now() - cached.savedAt < CEP_CACHE_TTL_MS) return cached.data

  let data = null
  try {
    const result = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${digits}/json/`)
    if (!result?.erro) {
      data = {
        cep: trimDb(result.cep) || `${digits.slice(0, 5)}-${digits.slice(5)}`,
        logradouro: trimDb(result.logradouro),
        complemento: trimDb(result.complemento),
        bairro: trimDb(result.bairro),
        cidade: trimDb(result.localidade),
        uf: trimDb(result.uf).toUpperCase(),
        ibge: trimDb(result.ibge),
      }
    }
  } catch (_) {
    // Tenta a segunda fonte abaixo.
  }

  if (!data) {
    try {
      const result = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v1/${digits}`)
      data = {
        cep: trimDb(result.cep) || `${digits.slice(0, 5)}-${digits.slice(5)}`,
        logradouro: trimDb(result.street),
        complemento: '',
        bairro: trimDb(result.neighborhood),
        cidade: trimDb(result.city),
        uf: trimDb(result.state).toUpperCase(),
        ibge: '',
      }
    } catch (_) {
      const error = new Error('CEP não encontrado ou serviço indisponível.')
      error.statusCode = 404
      throw error
    }
  }

  CEP_CACHE.set(digits, { savedAt: Date.now(), data })
  if (CEP_CACHE.size > 300) CEP_CACHE.delete(CEP_CACHE.keys().next().value)
  return data
}

// Empresas já cadastradas no legado, usadas por cobrança e outros formulários.
router.get('/cadastros/empresas', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT
         e.cemp1_cod AS codigo,
         TRIM(e.cemp1_nom) AS nome,
         NULLIF(TRIM(e.cemp1_nom_fan), '') AS nome_fantasia,
         NULLIF(TRIM(e.cemp1_cnpj), '') AS cpf_cnpj,
         NULLIF(TRIM(e.cemp1_cep), '') AS cep,
         NULLIF(TRIM(e.cemp1_end), '') AS logradouro,
         NULLIF(TRIM(e.cemp1_end_num), '') AS numero,
         NULLIF(TRIM(e.cemp1_bai), '') AS bairro,
         NULLIF(TRIM(c.cida2_nom), '') AS cidade,
         NULLIF(TRIM(uf.esta2_abr), '') AS uf,
         NULLIF(TRIM(e.cemp1_email), '') AS email,
         NULLIF(TRIM(e.cemp1_tele), '') AS telefone
       FROM ts1_cemp e
       LEFT JOIN tb2_cida c ON c.cida2_cod = e.cida2_cod
       LEFT JOIN tb2_esta uf ON uf.esta2_cod = c.esta2_cod
       ORDER BY e.cemp1_cod`,
      [],
    )

    const data = rows.map(row => ({
      ...row,
      ...normalizeCompanyAddress(row),
      codigo: Number(row.codigo),
      empresa_cobranca: normalizeBillingCompany(row),
    }))
    return res.json({ ok: true, data })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// Consulta centralizada de CEP para todos os formulários do sistema.
router.get('/cadastros/cep/:cep', async (req, res) => {
  try {
    const data = await lookupCep(req.params.cep)
    return res.json({ ok: true, data })
  } catch (err) {
    return res.status(err.statusCode || 502).json({ ok: false, message: err.message })
  }
})

const SELECT_CLIENTE = `
  SELECT
    c.id,
    c.pessoa_id,
    c.codigo,
    c.observacoes,
    c.ativo AS cliente_ativo,
    c.created_at,
    c.updated_at,
    p.nome,
    p.razao_social,
    p.nome_fantasia,
    p.tipo_pessoa,
    COALESCE(
      NULLIF(p.dados_adicionais #>> '{cliente,categoria}', ''),
      CASE WHEN p.tipo_pessoa = 'PJ' THEN 'Pessoa jurídica' ELSE 'Pessoa física' END
    ) AS categoria,
    p.cpf_cnpj,
    p.rg,
    p.orgao_emissor_rg,
    p.inscricao_estadual,
    p.inscricao_municipal,
    p.email,
    p.emails_adicionais,
    p.telefone,
    p.celular,
    p.telefone_comercial,
    p.telefone_residencial,
    p.fax,
    p.website,
    p.contato_nome,
    p.cep,
    p.logradouro,
    p.numero,
    p.complemento,
    p.bairro,
    p.cidade,
    p.uf,
    p.profissao,
    p.data_nascimento,
    p.data_fundacao,
    p.sexo,
    p.estado_civil,
    p.nacionalidade,
    p.naturalidade,
    p.dados_adicionais,
    (c.ativo AND p.ativo) AS ativo
  FROM cad_clientes c
  JOIN cad_pessoas p ON p.id = c.pessoa_id
`

router.get('/cadastros/clientes', async (req, res) => {
  const {
    busca,
    ativo = 'true',
    page = 1,
    limit = 50,
  } = req.query
  const ordenar = req.query.ordenar || req.query.sort || req.query.order_by || 'nome'
  const direcao = req.query.direcao || req.query.direction || req.query.order_dir || 'asc'
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  const conditions = []
  const params = []

  const categoriaExpression = `COALESCE(
    NULLIF(p.dados_adicionais #>> '{cliente,categoria}', ''),
    CASE WHEN p.tipo_pessoa = 'PJ' THEN 'Pessoa jurídica' ELSE 'Pessoa física' END
  )`
  const orderFields = {
    nome: `COALESCE(NULLIF(p.nome, ''), NULLIF(p.razao_social, ''), '')`,
    cliente: `COALESCE(NULLIF(p.nome, ''), NULLIF(p.razao_social, ''), '')`,
    codigo: `CASE WHEN BTRIM(COALESCE(c.codigo, '')) ~ '^[0-9]+$' THEN BTRIM(c.codigo)::numeric END`,
    categoria: categoriaExpression,
  }
  const normalizedOrder = String(ordenar).toLowerCase().trim()
  const safeOrder = Object.prototype.hasOwnProperty.call(orderFields, normalizedOrder) ? normalizedOrder : 'nome'
  const orderField = orderFields[safeOrder]
  const orderDirection = String(direcao).toLowerCase() === 'desc' ? 'DESC' : 'ASC'

  if (ativo !== 'all') {
    params.push(ativo === 'true')
    conditions.push(`c.ativo = $${params.length}`)
  }

  if (busca) {
    params.push(`%${String(busca).trim()}%`)
    conditions.push(`(
      p.nome ILIKE $${params.length}
      OR p.razao_social ILIKE $${params.length}
      OR p.nome_fantasia ILIKE $${params.length}
      OR p.cpf_cnpj ILIKE $${params.length}
      OR p.email ILIKE $${params.length}
      OR p.telefone ILIKE $${params.length}
      OR c.codigo ILIKE $${params.length}
    )`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  const safePage = Math.max(Number(page) || 1, 1)
  const offset = (safePage - 1) * safeLimit
  const queryParams = [...params, safeLimit, offset]

  try {
    const [data, count] = await Promise.all([
      query(
        `${SELECT_CLIENTE} ${where}
         ORDER BY ${orderField} ${orderDirection} NULLS LAST,
                  COALESCE(NULLIF(p.nome, ''), NULLIF(p.razao_social, ''), '') ASC,
                  c.id ASC
         LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
        queryParams,
      ),
      query(
        `SELECT COUNT(*)
           FROM cad_clientes c
           JOIN cad_pessoas p ON p.id = c.pessoa_id
          ${where}`,
        params,
      ),
    ])

    return res.json({
      ok: true,
      data: data.rows,
      total: Number(count.rows[0].count),
      page: safePage,
      limit: safeLimit,
      ordenacao: {
        campo: safeOrder,
        direcao: orderDirection.toLowerCase(),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.get('/cadastros/clientes/proximo-codigo', async (_req, res) => {
  try {
    const { rows: [row] } = await query(
      `SELECT COALESCE(MAX(codigo::bigint), 0) + 1 AS proximo
         FROM cad_clientes
        WHERE codigo ~ '^[0-9]+$'`,
      [],
    )
    return res.json({ ok: true, data: { codigo: String(row.proximo) } })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.get('/cadastros/clientes/:id/historico', async (req, res) => {
  const clienteId = Number(req.params.id)
  const tenantId = req.user.tenant_id

  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ ok: false, message: 'Cliente inválido' })
  }

  try {
    const { rows: clienteRows } = await query(
      `SELECT c.id, c.codigo, COALESCE(NULLIF(p.nome, ''), p.razao_social) AS nome
         FROM cad_clientes c
         JOIN cad_pessoas p ON p.id = c.pessoa_id
        WHERE c.id = $1`,
      [clienteId],
    )
    if (!clienteRows[0]) {
      return res.status(404).json({ ok: false, message: 'Cliente não encontrado' })
    }

    await query(`SELECT fn_parcelas_atualiza_atraso()`, []).catch(() => {})

    const valorAtualParcela = `COALESCE(
      p.valor_recalculado,
      p.valor_total_relatorio,
      COALESCE(p.valor_nominal, 0)
        + COALESCE(p.valor_correcao, 0)
        + COALESCE(p.valor_multa, 0)
        + COALESCE(p.valor_juros_mora, 0)
        + COALESCE(p.valor_moras, 0)
        + COALESCE(p.valor_outros_acrescimos, 0)
        + COALESCE(p.valor_seguro, 0)
        + COALESCE(p.valor_juros_financiamento, 0)
        - COALESCE(p.valor_desconto, 0)
    )`

    const { rows: contratos } = await query(
      `SELECT
         c.id,
         c.numero,
         c.titulo,
         c.tipo_contrato,
         c.status,
         c.data_inicio,
         c.data_fim,
         c.data_assinatura,
         c.valor_total::float AS valor_total,
         c.valor_entrada::float AS valor_entrada,
         c.parcelas_count,
         c.obra_codigo_legado,
         c.unidade_codigo_legado,
         CASE
           WHEN c.obra_codigo_legado = 7698 THEN 'LUCKY'
           WHEN c.obra_codigo_legado IN (7700, 7701) THEN 'LARM'
           ELSE COALESCE(c.dados_adicionais ->> 'empresa', '')
         END AS empresa,
         COALESCE(c.dados_adicionais ->> 'empresa_nome', '') AS empresa_nome,
         COUNT(p.id)::int AS parcelas_total,
         (COUNT(p.id) FILTER (WHERE LOWER(COALESCE(p.status, '')) = 'paga'))::int AS parcelas_pagas,
         (COUNT(p.id) FILTER (WHERE LOWER(COALESCE(p.status, '')) IN ('aberta', 'aberto', 'pendente')))::int AS parcelas_abertas,
         (COUNT(p.id) FILTER (WHERE LOWER(COALESCE(p.status, '')) IN ('atrasada', 'vencida', 'vencido')))::int AS parcelas_vencidas,
         COALESCE(SUM(CASE
           WHEN LOWER(COALESCE(p.status, '')) = 'paga'
           THEN COALESCE(p.valor_pago, ${valorAtualParcela})
           ELSE 0 END), 0)::float AS total_recebido,
         COALESCE(SUM(CASE
           WHEN LOWER(COALESCE(p.status, '')) IN ('aberta', 'aberto', 'pendente', 'atrasada', 'vencida', 'vencido')
           THEN ${valorAtualParcela}
           ELSE 0 END), 0)::float AS total_aberto,
         COALESCE(SUM(CASE
           WHEN LOWER(COALESCE(p.status, '')) IN ('atrasada', 'vencida', 'vencido')
           THEN ${valorAtualParcela}
           ELSE 0 END), 0)::float AS total_vencido,
         MIN(p.vencimento) AS primeiro_vencimento,
         MAX(p.vencimento) AS ultimo_vencimento
       FROM com_contratos c
       LEFT JOIN com_parcelas p
         ON p.contrato_id = c.id
        AND p.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
        AND c.cliente_id = $2
      GROUP BY
        c.id, c.numero, c.titulo, c.tipo_contrato, c.status,
        c.data_inicio, c.data_fim, c.data_assinatura,
        c.valor_total, c.valor_entrada, c.parcelas_count,
        c.obra_codigo_legado, c.unidade_codigo_legado,
        c.dados_adicionais
      ORDER BY COALESCE(c.data_inicio, c.created_at::date) DESC, c.numero DESC`,
      [tenantId, clienteId],
    )

    const resumo = contratos.reduce((acc, contrato) => {
      acc.valor_contratos += Number(contrato.valor_total || 0)
      acc.total_recebido += Number(contrato.total_recebido || 0)
      acc.total_aberto += Number(contrato.total_aberto || 0)
      acc.total_vencido += Number(contrato.total_vencido || 0)
      if (trimDb(contrato.unidade_codigo_legado)) acc.unidades.add(`${contrato.obra_codigo_legado || ''}/${trimDb(contrato.unidade_codigo_legado)}`)
      return acc
    }, {
      valor_contratos: 0,
      total_recebido: 0,
      total_aberto: 0,
      total_vencido: 0,
      unidades: new Set(),
    })

    return res.json({
      ok: true,
      data: {
        cliente: clienteRows[0],
        total_contratos: contratos.length,
        total_unidades: resumo.unidades.size,
        valor_contratos: resumo.valor_contratos,
        total_recebido: resumo.total_recebido,
        total_aberto: resumo.total_aberto,
        total_vencido: resumo.total_vencido,
        contratos: contratos.map(contrato => ({
          ...contrato,
          valor_total: Number(contrato.valor_total || 0),
          valor_entrada: Number(contrato.valor_entrada || 0),
          total_recebido: Number(contrato.total_recebido || 0),
          total_aberto: Number(contrato.total_aberto || 0),
          total_vencido: Number(contrato.total_vencido || 0),
        })),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.get('/cadastros/clientes/:id', async (req, res) => {
  try {
    const { rows } = await query(`${SELECT_CLIENTE} WHERE c.id=$1`, [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, message: 'Cliente não encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.post('/cadastros/clientes', async (req, res) => {
  if (!cleanText(req.body?.nome || req.body?.razao_social)) {
    return res.status(400).json({ ok: false, message: 'Nome é obrigatório' })
  }

  try {
    const result = await transaction(async client => {
      const saved = await upsertPessoa(client, req.body, { fillOnly: false })
      const existing = await client.query('SELECT id FROM cad_clientes WHERE pessoa_id=$1', [saved.pessoa.id])
      let codigo = cleanText(req.body.codigo)
      if (!codigo) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('cad_clientes_codigo_sequencial'))`)
        const { rows: [next] } = await client.query(
          `SELECT COALESCE(MAX(codigo::bigint), 0) + 1 AS proximo
             FROM cad_clientes
            WHERE codigo ~ '^[0-9]+$'`,
        )
        codigo = String(next.proximo)
      }
      if (existing.rows[0]) {
        const updated = await client.query(
          `UPDATE cad_clientes SET codigo=$1, observacoes=$2, ativo=$3, updated_at=NOW()
           WHERE id=$4 RETURNING id`,
          [codigo, cleanText(req.body.observacoes), req.body.ativo !== false, existing.rows[0].id],
        )
        return updated.rows[0].id
      }
      const inserted = await client.query(
        `INSERT INTO cad_clientes (pessoa_id, codigo, observacoes, ativo)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [saved.pessoa.id, codigo, cleanText(req.body.observacoes), req.body.ativo !== false],
      )
      return inserted.rows[0].id
    })

    const { rows } = await query(`${SELECT_CLIENTE} WHERE c.id=$1`, [result])
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.put('/cadastros/clientes/:id', async (req, res) => {
  try {
    const clienteId = Number(req.params.id)
    const updatedId = await transaction(async client => {
      const current = await client.query('SELECT * FROM cad_clientes WHERE id=$1', [clienteId])
      if (!current.rows[0]) return null

      await upsertPessoa(client, req.body, {
        pessoaId: current.rows[0].pessoa_id,
        fillOnly: false,
      })
      await client.query(
        `UPDATE cad_clientes SET codigo=$1, observacoes=$2, ativo=$3, updated_at=NOW()
         WHERE id=$4`,
        [cleanText(req.body.codigo), cleanText(req.body.observacoes), req.body.ativo !== false, clienteId],
      )
      return clienteId
    })

    if (!updatedId) return res.status(404).json({ ok: false, message: 'Cliente não encontrado' })
    const { rows } = await query(`${SELECT_CLIENTE} WHERE c.id=$1`, [updatedId])
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.delete('/cadastros/clientes/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'UPDATE cad_clientes SET ativo=FALSE, updated_at=NOW() WHERE id=$1',
      [req.params.id],
    )
    if (!rowCount) return res.status(404).json({ ok: false, message: 'Cliente não encontrado' })
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router
