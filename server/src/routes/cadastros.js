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
  const { busca, ativo = 'true', page = 1, limit = 50 } = req.query
  const conditions = []
  const params = []

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
         ORDER BY COALESCE(p.nome, p.razao_social), c.id
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
      if (existing.rows[0]) {
        const updated = await client.query(
          `UPDATE cad_clientes SET codigo=$1, observacoes=$2, ativo=$3, updated_at=NOW()
           WHERE id=$4 RETURNING id`,
          [cleanText(req.body.codigo), cleanText(req.body.observacoes), req.body.ativo !== false, existing.rows[0].id],
        )
        return updated.rows[0].id
      }
      const inserted = await client.query(
        `INSERT INTO cad_clientes (pessoa_id, codigo, observacoes, ativo)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [saved.pessoa.id, cleanText(req.body.codigo), cleanText(req.body.observacoes), req.body.ativo !== false],
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
