/**
 * server/src/routes/corretores_comissoes.js
 * v0.2.0 — Corretores/parceiros e comissões comerciais.
 */

const express = require('express')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'manager'])

// ─────────────────────────────────────────────────────────────────────────────
// CORRETORES
// ─────────────────────────────────────────────────────────────────────────────

function mapCorretor(r) {
  return {
    id: r.id, tipo: r.tipo, nome: r.nome, email: r.email, phone: r.phone,
    creci: r.creci, cpf_cnpj: r.cpf_cnpj, regiao_exclusiva: r.regiao_exclusiva,
    exclusividade_ativa: r.exclusividade_ativa, comissao_pct: Number(r.comissao_pct),
    split_corretor_pct: Number(r.split_corretor_pct), user_id: r.user_id,
    user_name: r.user_name, is_active: r.is_active, observacoes: r.observacoes,
    created_at: r.created_at,
    total_vendas: Number(r.total_vendas || 0),
    total_comissoes: Number(r.total_comissoes || 0),
  }
}

// GET /corretores
router.get('/corretores', async (req, res) => {
  const { tipo, is_active = 'true' } = req.query
  const where  = ['c.tenant_id = $1']
  const params = [req.user.tenant_id]

  if (tipo) { params.push(tipo); where.push(`c.tipo = $${params.length}`) }
  if (is_active !== 'all') { params.push(is_active === 'true'); where.push(`c.is_active = $${params.length}`) }

  const { rows } = await query(
    `SELECT c.*,
        u.name AS user_name,
        (SELECT COUNT(*) FROM com_comissoes cc WHERE cc.corretor_id = c.id AND cc.tenant_id = c.tenant_id) AS total_vendas,
        (SELECT COALESCE(SUM(cc.comissao_bruta),0) FROM com_comissoes cc WHERE cc.corretor_id = c.id AND cc.tenant_id = c.tenant_id) AS total_comissoes
      FROM com_corretores c
      LEFT JOIN hub_users u ON u.id = c.user_id
     WHERE ${where.join(' AND ')}
     ORDER BY c.nome ASC`,
    params
  )
  return res.json({ ok: true, data: rows.map(mapCorretor) })
})

// GET /corretores/stats
router.get('/corretores/stats', async (req, res) => {
  const { rows: [s] } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE tipo = 'autonomo' AND is_active)    AS autonomos,
        COUNT(*) FILTER (WHERE tipo = 'imobiliaria' AND is_active) AS imobiliarias,
        COUNT(*) FILTER (WHERE exclusividade_ativa AND is_active)  AS com_exclusividade,
        COALESCE(AVG(comissao_pct) FILTER (WHERE is_active), 0)    AS comissao_media
      FROM com_corretores WHERE tenant_id = $1`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: s })
})

// POST /corretores
router.post('/corretores', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { tipo='autonomo', nome, email, phone, creci, cpf_cnpj,
          regiao_exclusiva, exclusividade_ativa=false, comissao_pct=0,
          split_corretor_pct=100, user_id, observacoes } = req.body
  if (!nome) return res.status(400).json({ ok: false, message: 'Nome obrigatório' })

  const { rows: [r] } = await query(
    `INSERT INTO com_corretores
       (tenant_id, tipo, nome, email, phone, creci, cpf_cnpj,
        regiao_exclusiva, exclusividade_ativa, comissao_pct, split_corretor_pct,
        user_id, observacoes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [req.user.tenant_id, tipo, nome, email||null, phone||null, creci||null,
     cpf_cnpj||null, regiao_exclusiva||null, exclusividade_ativa, comissao_pct,
     split_corretor_pct, user_id||null, observacoes||null, req.user.id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'corretor_created', module: 'comercial', entityType: 'com_corretores', entityId: r.id }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapCorretor(r) })
})

// PATCH /corretores/:id
router.patch('/corretores/:id', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const fields = ['nome','email','phone','creci','cpf_cnpj','regiao_exclusiva',
    'exclusividade_ativa','comissao_pct','split_corretor_pct','user_id','is_active','observacoes']
  const sets = []; const params = [req.user.tenant_id, req.params.id]
  for (const f of fields) {
    if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f}=$${params.length}`) }
  }
  if (!sets.length) return res.status(400).json({ ok: false, message: 'Nada para atualizar' })
  sets.push('updated_at=NOW()')
  const { rows: [r] } = await query(
    `UPDATE com_corretores SET ${sets.join(',')} WHERE tenant_id=$1 AND id=$2 RETURNING *`,
    params
  )
  if (!r) return res.status(404).json({ ok: false, message: 'Corretor não encontrado' })
  return res.json({ ok: true, data: mapCorretor(r) })
})

// ─────────────────────────────────────────────────────────────────────────────
// COMISSÕES
// ─────────────────────────────────────────────────────────────────────────────

function mapComissao(r) {
  return {
    id: r.id, proposta_id: r.proposta_id, reserva_id: r.reserva_id, lead_id: r.lead_id,
    corretor_id: r.corretor_id, corretor_nome: r.corretor_nome, corretor_tipo: r.corretor_tipo,
    lot_id: r.lot_id, lot_number: r.lot_number, quadra: r.quadra,
    lead_name: r.lead_name,
    valor_venda: Number(r.valor_venda), comissao_pct: Number(r.comissao_pct),
    comissao_bruta: Number(r.comissao_bruta),
    split_corretor_pct: Number(r.split_corretor_pct),
    valor_corretor: Number(r.valor_corretor),
    valor_imobiliaria: Number(r.valor_imobiliaria),
    status: r.status, elegivel_em: r.elegivel_em, pago_em: r.pago_em,
    valor_pago: Number(r.valor_pago || 0), forma_pagamento: r.forma_pagamento,
    observacoes: r.observacoes, created_at: r.created_at,
  }
}

// GET /comissoes?status=&corretor_id=
router.get('/comissoes', async (req, res) => {
  const { status, corretor_id } = req.query
  const where  = ['cm.tenant_id = $1']
  const params = [req.user.tenant_id]

  if (status && status !== 'all') { params.push(status); where.push(`cm.status = $${params.length}`) }
  if (corretor_id) { params.push(corretor_id); where.push(`cm.corretor_id = $${params.length}`) }

  // Auto-eligible: set elegivel when >= elegivel_apos_dias
  await query(
    `UPDATE com_comissoes SET status='elegivel', elegivel_em=NOW(), updated_at=NOW()
      WHERE tenant_id=$1 AND status='pendente'
        AND created_at + (elegivel_apos_dias || ' days')::interval <= NOW()`,
    [req.user.tenant_id]
  ).catch(() => {})

  const { rows } = await query(
    `SELECT cm.*, c.nome AS corretor_nome, c.tipo AS corretor_tipo, l.name AS lead_name
       FROM com_comissoes cm
       LEFT JOIN com_corretores c ON c.id = cm.corretor_id
       LEFT JOIN crm_leads      l ON l.id = cm.lead_id
      WHERE ${where.join(' AND ')}
      ORDER BY cm.created_at DESC LIMIT 200`,
    params
  )
  return res.json({ ok: true, data: rows.map(mapComissao) })
})

// GET /comissoes/stats
router.get('/comissoes/stats', async (req, res) => {
  const { rows: [s] } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'pendente')    AS pendentes,
        COUNT(*) FILTER (WHERE status = 'elegivel')    AS elegiveis,
        COUNT(*) FILTER (WHERE status = 'em_pagamento')AS em_pagamento,
        COUNT(*) FILTER (WHERE status = 'pago')        AS pagas,
        COALESCE(SUM(comissao_bruta),0)                AS total_bruto,
        COALESCE(SUM(valor_corretor),0)                AS total_corretor,
        COALESCE(SUM(valor_pago) FILTER (WHERE status='pago'), 0) AS total_pago,
        COALESCE(SUM(valor_corretor) FILTER (WHERE status IN ('elegivel','em_pagamento')),0) AS a_pagar
      FROM com_comissoes WHERE tenant_id = $1`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: s })
})

// POST /comissoes  — registrar comissão de uma venda
router.post('/comissoes', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const {
    corretor_id, proposta_id, reserva_id, lead_id,
    lot_id, lot_number, quadra, valor_venda, comissao_pct,
    split_corretor_pct = 100, elegivel_apos_dias = 30, observacoes,
  } = req.body
  if (!corretor_id || !valor_venda || comissao_pct == null)
    return res.status(400).json({ ok: false, message: 'corretor_id, valor_venda e comissao_pct obrigatórios' })

  const { rows: [cm] } = await query(
    `INSERT INTO com_comissoes
       (tenant_id, corretor_id, proposta_id, reserva_id, lead_id,
        lot_id, lot_number, quadra, valor_venda, comissao_pct,
        split_corretor_pct, elegivel_apos_dias, observacoes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [req.user.tenant_id, corretor_id, proposta_id||null, reserva_id||null, lead_id||null,
     lot_id||null, lot_number||null, quadra||null, valor_venda, comissao_pct,
     split_corretor_pct, elegivel_apos_dias, observacoes||null, req.user.id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'comissao_created', module: 'comercial', entityType: 'com_comissoes', entityId: cm.id }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapComissao(cm) })
})

// PATCH /comissoes/:id/pagar
router.patch('/comissoes/:id/pagar', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { valor_pago, forma_pagamento } = req.body
  const { rows: [cm] } = await query(
    `UPDATE com_comissoes
        SET status='pago', pago_em=NOW(), valor_pago=$1, forma_pagamento=$2, updated_at=NOW()
      WHERE id=$3 AND tenant_id=$4 AND status IN ('elegivel','em_pagamento')
      RETURNING *`,
    [valor_pago||null, forma_pagamento||null, req.params.id, req.user.tenant_id]
  )
  if (!cm) return res.status(404).json({ ok: false, message: 'Comissão não encontrada' })
  return res.json({ ok: true, data: mapComissao(cm) })
})

// PATCH /comissoes/:id/status  { status: 'em_pagamento'|'suspenso'|'cancelado' }
router.patch('/comissoes/:id/status', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const allowed = ['em_pagamento','suspenso','cancelado']
  if (!allowed.includes(req.body.status)) return res.status(400).json({ ok: false, message: 'Status inválido' })
  const { rows: [cm] } = await query(
    `UPDATE com_comissoes SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *`,
    [req.body.status, req.params.id, req.user.tenant_id]
  )
  if (!cm) return res.status(404).json({ ok: false, message: 'Comissão não encontrada' })
  return res.json({ ok: true, data: mapComissao(cm) })
})

module.exports = router
