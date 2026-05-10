/**
 * server/src/routes/fornecedores_bancos.js
 * Fornecedores, Bancos/Contas, Plano de Contas, Lançamentos CP
 */

const express          = require('express')
const { query }        = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

// ══════════════════════════════════════════════════════════════════════════════
// FORNECEDORES
// ══════════════════════════════════════════════════════════════════════════════

// GET /fornecedores — lista com filtros
router.get('/fornecedores', async (req, res) => {
  const { empresa, categoria, busca, ativo = 'true', page = 1, limit = 50 } = req.query
  const conditions = []
  const params = []

  if (ativo !== 'all') {
    params.push(ativo === 'true')
    conditions.push(`ativo = $${params.length}`)
  }
  if (empresa && empresa !== 'TODOS') {
    params.push(empresa.toUpperCase())
    conditions.push(`(empresa = $${params.length} OR empresa = 'TODOS')`)
  }
  if (categoria) {
    params.push(categoria)
    conditions.push(`categoria = $${params.length}`)
  }
  if (busca) {
    params.push(`%${busca}%`)
    conditions.push(`(razao_social ILIKE $${params.length} OR nome_fantasia ILIKE $${params.length} OR cnpj_cpf ILIKE $${params.length})`)
  }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (parseInt(page) - 1) * parseInt(limit)
  params.push(parseInt(limit), offset)

  try {
    const { rows } = await query(
      `SELECT * FROM fin_fornecedores ${where}
       ORDER BY razao_social
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    const ct = await query(`SELECT COUNT(*) FROM fin_fornecedores ${where}`, params.slice(0, -2))
    return res.json({ ok: true, data: rows, total: parseInt(ct.rows[0].count) })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /fornecedores/select — para dropdowns (id + nome)
router.get('/fornecedores/select', async (req, res) => {
  const { empresa } = req.query
  const params = []
  let where = 'WHERE ativo = true'
  if (empresa && empresa !== 'TODOS') {
    params.push(empresa.toUpperCase())
    where += ` AND (empresa = $${params.length} OR empresa = 'TODOS')`
  }
  try {
    const { rows } = await query(
      `SELECT id, razao_social, nome_fantasia, cnpj_cpf, empresa FROM fin_fornecedores ${where} ORDER BY razao_social`,
      params
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /fornecedores/:id
router.get('/fornecedores/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM fin_fornecedores WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Não encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /fornecedores
router.post('/fornecedores', async (req, res) => {
  const {
    razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa = 'PJ', categoria,
    email, telefone, empresa = 'TODOS', cep, endereco, cidade_uf,
    banco_nome, agencia, conta, tipo_conta = 'Corrente', chave_pix, obs
  } = req.body

  if (!razao_social) return res.status(400).json({ ok: false, message: 'razao_social obrigatório' })
  if (!empresa)      return res.status(400).json({ ok: false, message: 'empresa obrigatória' })

  try {
    const { rows } = await query(
      `INSERT INTO fin_fornecedores
         (razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
          email, telefone, empresa, cep, endereco, cidade_uf,
          banco_nome, agencia, conta, tipo_conta, chave_pix, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
       email, telefone, empresa.toUpperCase(), cep, endereco, cidade_uf,
       banco_nome, agencia, conta, tipo_conta, chave_pix, obs]
    )
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, message: 'CNPJ/CPF já cadastrado' })
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// PUT /fornecedores/:id
router.put('/fornecedores/:id', async (req, res) => {
  const {
    razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
    email, telefone, empresa, cep, endereco, cidade_uf,
    banco_nome, agencia, conta, tipo_conta, chave_pix, obs, ativo
  } = req.body
  try {
    const { rows } = await query(
      `UPDATE fin_fornecedores SET
         razao_social=$1, nome_fantasia=$2, cnpj_cpf=$3, tipo_pessoa=$4, categoria=$5,
         email=$6, telefone=$7, empresa=$8, cep=$9, endereco=$10, cidade_uf=$11,
         banco_nome=$12, agencia=$13, conta=$14, tipo_conta=$15, chave_pix=$16,
         obs=$17, ativo=$18, updated_at=NOW()
       WHERE id=$19 RETURNING *`,
      [razao_social, nome_fantasia, cnpj_cpf, tipo_pessoa, categoria,
       email, telefone, empresa?.toUpperCase(), cep, endereco, cidade_uf,
       banco_nome, agencia, conta, tipo_conta, chave_pix, obs, ativo ?? true, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Não encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// DELETE /fornecedores/:id  (soft delete)
router.delete('/fornecedores/:id', async (req, res) => {
  try {
    await query('UPDATE fin_fornecedores SET ativo=false, updated_at=NOW() WHERE id=$1', [req.params.id])
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// BANCOS / CONTAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /bancos — lista todas as contas bancárias das empresas
router.get('/bancos', async (req, res) => {
  const { empresa } = req.query
  const params = []
  let where = 'WHERE ativo = true'
  if (empresa) {
    params.push(empresa.toUpperCase())
    where += ` AND empresa = $${params.length}`
  }
  try {
    const { rows } = await query(
      `SELECT * FROM fin_bancos_contas ${where} ORDER BY empresa, banco_nome`,
      params
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /bancos/select — para dropdowns
router.get('/bancos/select', async (req, res) => {
  const { empresa } = req.query
  const params = []
  let where = 'WHERE ativo = true'
  if (empresa) {
    params.push(empresa.toUpperCase())
    where += ` AND empresa = $${params.length}`
  }
  try {
    const { rows } = await query(
      `SELECT id, empresa, banco_nome, agencia, conta, saldo_inicial FROM fin_bancos_contas ${where} ORDER BY empresa, banco_nome`,
      params
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /bancos/:id
router.get('/bancos/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM fin_bancos_contas WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Não encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /bancos
router.post('/bancos', async (req, res) => {
  const {
    empresa, banco_nome, codigo_banco, agencia, conta, digito,
    tipo_conta = 'Corrente', saldo_inicial = 0, data_saldo_inicial, obs
  } = req.body

  if (!empresa)    return res.status(400).json({ ok: false, message: 'empresa obrigatória' })
  if (!banco_nome) return res.status(400).json({ ok: false, message: 'banco_nome obrigatório' })

  try {
    const { rows } = await query(
      `INSERT INTO fin_bancos_contas
         (empresa, banco_nome, codigo_banco, agencia, conta, digito, tipo_conta, saldo_inicial, data_saldo_inicial, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [empresa.toUpperCase(), banco_nome, codigo_banco, agencia, conta, digito,
       tipo_conta, saldo_inicial, data_saldo_inicial || null, obs]
    )
    return res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// PUT /bancos/:id
router.put('/bancos/:id', async (req, res) => {
  const {
    empresa, banco_nome, codigo_banco, agencia, conta, digito,
    tipo_conta, saldo_inicial, data_saldo_inicial, obs, ativo
  } = req.body
  try {
    const { rows } = await query(
      `UPDATE fin_bancos_contas SET
         empresa=$1, banco_nome=$2, codigo_banco=$3, agencia=$4, conta=$5, digito=$6,
         tipo_conta=$7, saldo_inicial=$8, data_saldo_inicial=$9, obs=$10, ativo=$11
       WHERE id=$12 RETURNING *`,
      [empresa?.toUpperCase(), banco_nome, codigo_banco, agencia, conta, digito,
       tipo_conta, saldo_inicial, data_saldo_inicial || null, obs, ativo ?? true, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Não encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// DELETE /bancos/:id (soft)
router.delete('/bancos/:id', async (req, res) => {
  try {
    await query('UPDATE fin_bancos_contas SET ativo=false WHERE id=$1', [req.params.id])
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// PLANO DE CONTAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /plano-contas
router.get('/plano-contas', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, codigo, descricao, tipo, pai_id FROM fin_plano_contas WHERE ativo=true ORDER BY codigo`
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ══════════════════════════════════════════════════════════════════════════════
// LANÇAMENTOS CONTAS A PAGAR
// ══════════════════════════════════════════════════════════════════════════════

// GET /lancamentos-cp — lista com filtros
router.get('/lancamentos-cp', async (req, res) => {
  const { empresa, status, fornecedor_id, page = 1, limit = 50,
          dt_inicio, dt_fim, venc_inicio, venc_fim } = req.query
  const conditions = []
  const params = []

  if (empresa) {
    params.push(empresa.toUpperCase())
    conditions.push(`l.empresa = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`l.status = $${params.length}`)
  }
  if (fornecedor_id) {
    params.push(parseInt(fornecedor_id))
    conditions.push(`l.fornecedor_id = $${params.length}`)
  }
  if (dt_inicio) {
    params.push(dt_inicio)
    conditions.push(`l.dt_emissao >= $${params.length}`)
  }
  if (dt_fim) {
    params.push(dt_fim)
    conditions.push(`l.dt_emissao <= $${params.length}`)
  }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (parseInt(page) - 1) * parseInt(limit)
  params.push(parseInt(limit), offset)

  try {
    const { rows } = await query(
      `SELECT
         l.*,
         f.razao_social AS fornecedor_nome,
         f.cnpj_cpf     AS fornecedor_cnpj,
         b.banco_nome   AS banco_nome,
         b.agencia      AS banco_agencia,
         b.conta        AS banco_conta,
         (SELECT MIN(p.vencimento) FROM fin_parcelas_cp p WHERE p.lancamento_id = l.id AND p.status = 'pendente') AS proximo_venc
       FROM fin_lancamentos_cp l
       LEFT JOIN fin_fornecedores  f ON f.id = l.fornecedor_id
       LEFT JOIN fin_bancos_contas b ON b.id = l.banco_conta_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
    const ct = await query(
      `SELECT COUNT(*), COALESCE(SUM(valor_total),0) AS total_valor
       FROM fin_lancamentos_cp l ${where}`,
      params.slice(0, -2)
    )
    return res.json({
      ok: true, data: rows,
      total: parseInt(ct.rows[0].count),
      total_valor: parseFloat(ct.rows[0].total_valor),
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /lancamentos-cp/:id (com parcelas)
router.get('/lancamentos-cp/:id', async (req, res) => {
  try {
    const { rows: [lanc] } = await query(
      `SELECT l.*, f.razao_social AS fornecedor_nome, b.banco_nome, b.agencia, b.conta
       FROM fin_lancamentos_cp l
       LEFT JOIN fin_fornecedores  f ON f.id = l.fornecedor_id
       LEFT JOIN fin_bancos_contas b ON b.id = l.banco_conta_id
       WHERE l.id = $1`, [req.params.id]
    )
    if (!lanc) return res.status(404).json({ ok: false, message: 'Não encontrado' })

    const { rows: parcelas } = await query(
      'SELECT * FROM fin_parcelas_cp WHERE lancamento_id = $1 ORDER BY numero',
      [req.params.id]
    )
    return res.json({ ok: true, data: { ...lanc, parcelas } })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /lancamentos-cp — cria lançamento + parcelas
router.post('/lancamentos-cp', async (req, res) => {
  const {
    empresa, fornecedor_id, banco_conta_id, conta_contabil, descricao_conta,
    historico, produto_servico, nf_doc, dt_emissao, valor_total, qtd_parcelas = 1,
    centro_custo, obra, n_cheque, obs,
    parcelas  // array [{ vencimento, valor }] — opcional, gera automaticamente se omitido
  } = req.body

  if (!empresa)    return res.status(400).json({ ok: false, message: 'empresa obrigatória' })
  if (!historico)  return res.status(400).json({ ok: false, message: 'historico obrigatório' })
  if (!valor_total) return res.status(400).json({ ok: false, message: 'valor_total obrigatório' })

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    // Insere lançamento
    const { rows: [lanc] } = await client.query(
      `INSERT INTO fin_lancamentos_cp
         (empresa, fornecedor_id, banco_conta_id, conta_contabil, descricao_conta,
          historico, produto_servico, nf_doc, dt_emissao, valor_total, qtd_parcelas,
          centro_custo, obra, n_cheque, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [empresa.toUpperCase(), fornecedor_id || null, banco_conta_id || null,
       conta_contabil, descricao_conta, historico, produto_servico, nf_doc,
       dt_emissao || null, valor_total, qtd_parcelas,
       centro_custo, obra, n_cheque, obs]
    )

    // Gera parcelas
    const n    = parseInt(qtd_parcelas) || 1
    const vlr  = parseFloat(valor_total)
    const base = dt_emissao ? new Date(dt_emissao) : new Date()

    const parcs = parcelas?.length === n
      ? parcelas
      : Array.from({ length: n }, (_, i) => {
          const d = new Date(base)
          d.setMonth(d.getMonth() + i + 1)
          return { numero: i + 1, valor: parseFloat((vlr / n).toFixed(2)), vencimento: d.toISOString().split('T')[0] }
        })

    for (const p of parcs) {
      await client.query(
        'INSERT INTO fin_parcelas_cp (lancamento_id, numero, valor, vencimento) VALUES ($1,$2,$3,$4)',
        [lanc.id, p.numero || parcs.indexOf(p) + 1, p.valor, p.vencimento]
      )
    }

    await client.query('COMMIT')
    return res.status(201).json({ ok: true, data: { ...lanc, parcelas: parcs } })
  } catch (err) {
    await client.query('ROLLBACK')
    return res.status(500).json({ ok: false, message: err.message })
  } finally {
    client.release()
  }
})

// PUT /lancamentos-cp/:id/status — atualiza status
router.put('/lancamentos-cp/:id/status', async (req, res) => {
  const { status } = req.body
  if (!status) return res.status(400).json({ ok: false, message: 'status obrigatório' })
  try {
    const { rows } = await query(
      `UPDATE fin_lancamentos_cp SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ ok: false, message: 'Não encontrado' })
    return res.json({ ok: true, data: rows[0] })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// PUT /lancamentos-cp/:id/parcelas/:parcId/pagar — marca parcela paga
router.put('/lancamentos-cp/:id/parcelas/:parcId/pagar', async (req, res) => {
  const { dt_pagamento } = req.body
  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE fin_parcelas_cp SET status='pago', dt_pagamento=$1 WHERE id=$2`,
      [dt_pagamento || new Date().toISOString().split('T')[0], req.params.parcId]
    )
    // Se todas as parcelas estão pagas, marca o lançamento como pago
    const { rows: pend } = await client.query(
      `SELECT COUNT(*) FROM fin_parcelas_cp WHERE lancamento_id=$1 AND status != 'pago'`,
      [req.params.id]
    )
    if (parseInt(pend[0].count) === 0) {
      await client.query(
        `UPDATE fin_lancamentos_cp SET status='pago', updated_at=NOW() WHERE id=$1`,
        [req.params.id]
      )
    }
    await client.query('COMMIT')
    return res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    return res.status(500).json({ ok: false, message: err.message })
  } finally {
    client.release()
  }
})


// ── GET /financeiro/fornecedores/check-cnpj — verifica unicidade ─────────────
router.get('/financeiro/fornecedores/check-cnpj', async (req, res) => {
  const { tenant_id } = req.user
  const { cnpj, exclude_id } = req.query
  if (!cnpj) return res.json({ ok: true, exists: false })
  const digits = cnpj.replace(/\D/g, '')
  try {
    const { rows } = await query(
      `SELECT id FROM fin_fornecedores
       WHERE tenant_id=$1
         AND REGEXP_REPLACE(cnpj_cpf,'[^0-9]','','g') = $2
         AND ($3::int IS NULL OR id != $3::int)`,
      [tenant_id, digits, exclude_id ? parseInt(exclude_id) : null]
    )
    return res.json({ ok: true, exists: rows.length > 0 })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── GET /financeiro/fornecedores/:id/historico ────────────────────────────────
router.get('/financeiro/fornecedores/:id/historico', async (req, res) => {
  const { tenant_id } = req.user
  try {
    // Busca lançamentos vinculados ao fornecedor
    const { rows: lancamentos } = await query(
      `SELECT
         l.id, l.descricao, l.empresa,
         p.id AS parcela_id,
         p.vencimento, p.valor, p.status, p.dt_pagamento AS pago_em
       FROM fin_lancamentos_cp l
       JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
       WHERE l.tenant_id = $1
         AND l.fornecedor_id = $2
       ORDER BY p.vencimento DESC
       LIMIT 200`,
      [tenant_id, req.params.id]
    )

    const total_contas = new Set(lancamentos.map(r => r.id)).size
    const total_pago   = lancamentos.filter(r => r.status === 'pago').reduce((s, r) => s + parseFloat(r.valor), 0)
    const total_aberto = lancamentos.filter(r => r.status === 'aberto').reduce((s, r) => s + parseFloat(r.valor), 0)
    const total_vencido= lancamentos.filter(r => r.status === 'vencido').reduce((s, r) => s + parseFloat(r.valor), 0)

    return res.json({
      ok: true,
      data: {
        total_contas,
        total_pago,
        total_aberto,
        total_vencido,
        itens: lancamentos.map(r => ({
          id:         r.parcela_id,
          descricao:  r.descricao,
          vencimento: r.vencimento,
          valor:      parseFloat(r.valor),
          status:     r.status,
          pago_em:    r.pago_em,
          empresa:    r.empresa,
        })),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})


// ── GET /financeiro/bancos/:id/lancamentos ─────────────────────────────────
router.get('/financeiro/bancos/:id/lancamentos', async (req, res) => {
  const { tenant_id } = req.user
  try {
    const { rows } = await query(
      `SELECT * FROM fin_bancos_lancamentos
       WHERE conta_id = $1 AND tenant_id = $2
       ORDER BY data DESC, created_at DESC`,
      [req.params.id, tenant_id]
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── POST /financeiro/bancos/:id/lancamentos ────────────────────────────────
router.post('/financeiro/bancos/:id/lancamentos', async (req, res) => {
  const { tenant_id } = req.user
  const { tipo, descricao, valor, data, obs } = req.body

  const TIPOS_VALIDOS = ['saldo_inicial', 'taxa', 'rendimento', 'aplicacao']
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ ok: false, message: 'Tipo inválido' })
  }
  if (!descricao?.trim()) return res.status(400).json({ ok: false, message: 'Descrição obrigatória' })
  if (!valor || isNaN(valor)) return res.status(400).json({ ok: false, message: 'Valor obrigatório' })
  if (!data) return res.status(400).json({ ok: false, message: 'Data obrigatória' })

  try {
    // Insere o lançamento
    const { rows: [lanc] } = await query(
      `INSERT INTO fin_bancos_lancamentos (tenant_id, conta_id, tipo, descricao, valor, data, obs)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenant_id, req.params.id, tipo, descricao.trim(), valor, data, obs || null]
    )

    // Atualiza saldo_inicial da conta somando o lançamento
    await query(
      `UPDATE fin_bancos_contas
       SET saldo_inicial = saldo_inicial + $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [parseFloat(valor), req.params.id, tenant_id]
    )

    logger.info(`Lançamento bancário: conta=${req.params.id} tipo=${tipo} valor=${valor}`)
    return res.status(201).json({ ok: true, data: lanc })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ── DELETE /financeiro/bancos/:id/lancamentos/:lancId ─────────────────────
router.delete('/financeiro/bancos/:id/lancamentos/:lancId', async (req, res) => {
  const { tenant_id } = req.user
  try {
    // Busca o valor para reverter o saldo
    const { rows: [lanc] } = await query(
      'SELECT valor FROM fin_bancos_lancamentos WHERE id=$1 AND tenant_id=$2',
      [req.params.lancId, tenant_id]
    )
    if (!lanc) return res.status(404).json({ ok: false, message: 'Lançamento não encontrado' })

    await query('DELETE FROM fin_bancos_lancamentos WHERE id=$1', [req.params.lancId])

    // Reverte o saldo
    await query(
      `UPDATE fin_bancos_contas
       SET saldo_inicial = saldo_inicial - $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [parseFloat(lanc.valor), req.params.id, tenant_id]
    )

    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router
