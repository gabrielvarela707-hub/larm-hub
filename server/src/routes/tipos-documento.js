/**
 * src/routes/tipos-documento.js
 * → server/src/routes/tipos-documento.js  (arquivo novo)
 *
 * CRUD de tipos de documento financeiro (NF, Boleto, Recibo, etc.)
 * Rotas: GET/POST /financeiro/tipos-documento
 *        PUT/DELETE /financeiro/tipos-documento/:id
 *        POST /financeiro/tipos-documento/seed
 */

const express  = require('express')
const { query }  = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const logger   = require('../config/logger')

const router = express.Router()
router.use(authenticate)

const DEFAULTS = [
  { nome: 'Nota Fiscal',             descricao: 'NF-e, NFS-e ou nota fiscal avulsa', usado_em: ['pagar','receber'] },
  { nome: 'NFS',                     descricao: 'Nota Fiscal de Serviço',             usado_em: ['pagar','receber'] },
  { nome: 'Boleto',                  descricao: 'Boleto bancário',                   usado_em: ['pagar','receber'] },
  { nome: 'Recibo',                  descricao: 'Recibo de pagamento ou recebimento', usado_em: ['pagar','receber'] },
  { nome: 'Contrato',                descricao: 'Documento contratual',               usado_em: ['pagar','receber'] },
  { nome: 'Fatura',                  descricao: 'Fatura de serviços ou produtos',     usado_em: ['pagar','receber'] },
  { nome: 'Duplicata',               descricao: 'Duplicata mercantil',                usado_em: ['pagar','receber'] },
  { nome: 'Cheque',                  descricao: 'Cheque pré-datado ou à vista',       usado_em: ['pagar','receber'] },
  { nome: 'Comprovante de Pagamento',descricao: 'Comprovante de TED/PIX/DOC',         usado_em: ['pagar','receber'] },
  { nome: 'Outros',                  descricao: 'Outros tipos de documento',          usado_em: ['pagar','receber'] },
]

// GET /financeiro/tipos-documento
router.get('/financeiro/tipos-documento', async (req, res) => {
  const { tenant_id } = req.user
  try {
    const { rows } = await query(
      `SELECT * FROM fin_tipos_documento
       WHERE tenant_id = $1
       ORDER BY nome ASC`,
      [tenant_id]
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// GET /financeiro/tipos-documento/ativos — para dropdowns
router.get('/financeiro/tipos-documento/ativos', async (req, res) => {
  const { tenant_id } = req.user
  const { modulo } = req.query  // 'pagar' | 'receber'
  try {
    const { rows } = await query(
      `SELECT id, nome FROM fin_tipos_documento
       WHERE tenant_id = $1
         AND ativo = true
         AND ($2::text IS NULL OR usado_em @> ARRAY[$2::text])
       ORDER BY nome ASC`,
      [tenant_id, modulo || null]
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /financeiro/tipos-documento
router.post('/financeiro/tipos-documento', async (req, res) => {
  const { tenant_id } = req.user
  const { nome, descricao, usado_em = ['pagar','receber'] } = req.body
  if (!nome?.trim()) return res.status(400).json({ ok: false, message: 'Nome obrigatório' })

  try {
    const { rows: [t] } = await query(
      `INSERT INTO fin_tipos_documento (tenant_id, nome, descricao, usado_em)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [tenant_id, nome.trim(), descricao || null, usado_em]
    )
    logger.info(`Tipo de documento criado: ${nome} (tenant=${tenant_id})`)
    return res.status(201).json({ ok: true, data: t })
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, message: 'Já existe um tipo com este nome' })
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// PUT /financeiro/tipos-documento/:id
router.put('/financeiro/tipos-documento/:id', async (req, res) => {
  const { tenant_id } = req.user
  const { nome, descricao, ativo, usado_em } = req.body
  try {
    await query(
      `UPDATE fin_tipos_documento
       SET nome=$1, descricao=$2, ativo=$3, usado_em=$4, updated_at=NOW()
       WHERE id=$5 AND tenant_id=$6`,
      [nome, descricao || null, ativo ?? true, usado_em ?? ['pagar','receber'], req.params.id, tenant_id]
    )
    return res.json({ ok: true })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// DELETE /financeiro/tipos-documento/:id
router.delete('/financeiro/tipos-documento/:id', async (req, res) => {
  const { tenant_id } = req.user
  try {
    await query('DELETE FROM fin_tipos_documento WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant_id])
    return res.json({ ok: true })
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ ok: false, message: 'Tipo em uso — inative em vez de deletar' })
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// POST /financeiro/tipos-documento/seed — cria os tipos padrão
router.post('/financeiro/tipos-documento/seed', async (req, res) => {
  const { tenant_id } = req.user
  let created = 0
  try {
    for (const t of DEFAULTS) {
      const { rows: ex } = await query(
        'SELECT id FROM fin_tipos_documento WHERE tenant_id=$1 AND nome=$2',
        [tenant_id, t.nome]
      )
      if (ex.length) continue
      await query(
        'INSERT INTO fin_tipos_documento (tenant_id, nome, descricao, usado_em) VALUES ($1,$2,$3,$4)',
        [tenant_id, t.nome, t.descricao, t.usado_em]
      )
      created++
    }
    return res.json({ ok: true, created })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router
