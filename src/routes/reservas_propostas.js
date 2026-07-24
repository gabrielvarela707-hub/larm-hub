/**
 * server/src/routes/reservas_propostas.js
 * v0.1.9 — Reservas de lote e Propostas comerciais.
 */

const express = require('express')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'manager'])

function requireWrite(req, res) {
  return Promise.resolve(true) // inherit from CRM write permission
}

// ─────────────────────────────────────────────────────────────────────────────
// RESERVAS
// ─────────────────────────────────────────────────────────────────────────────

function mapReserva(r) {
  return {
    id:               r.id,
    lead_id:          r.lead_id,
    lead_name:        r.lead_name,
    lead_phone:       r.lead_phone,
    lot_id:           r.lot_id,
    lot_number:       r.lot_number,
    quadra:           r.quadra,
    area_m2:          Number(r.area_m2 || 0),
    preco_lista:      Number(r.preco_lista || 0),
    empreendimento_id:r.empreendimento_id,
    status:           r.status,
    responsavel_id:   r.responsavel_id,
    responsavel_name: r.responsavel_name,
    expires_at:       r.expires_at,
    converted_at:     r.converted_at,
    cancelled_at:     r.cancelled_at,
    cancel_reason:    r.cancel_reason,
    observacoes:      r.observacoes,
    created_by:       r.created_by,
    created_by_name:  r.created_by_name,
    created_at:       r.created_at,
    updated_at:       r.updated_at,
    minutes_remaining: r.expires_at
      ? Math.max(0, Math.floor((new Date(r.expires_at).getTime() - Date.now()) / 60000))
      : null,
  }
}

// GET /reservas?status=ativa&lead_id=
router.get('/reservas', async (req, res) => {
  const { status, lead_id } = req.query
  const where  = ['r.tenant_id = $1']
  const params = [req.user.tenant_id]

  if (status && status !== 'all') { params.push(status); where.push(`r.status = $${params.length}`) }
  if (lead_id) { params.push(lead_id); where.push(`r.lead_id = $${params.length}`) }

  // Auto-expire overdue active reservas
  await query(
    `UPDATE com_reservas SET status='expirada', updated_at=NOW()
      WHERE tenant_id=$1 AND status='ativa' AND expires_at < NOW()`,
    [req.user.tenant_id]
  ).catch(() => {})

  const { rows } = await query(
    `SELECT r.*,
        l.name        AS lead_name,
        l.phone       AS lead_phone,
        u.name        AS responsavel_name,
        cb.name       AS created_by_name
      FROM com_reservas r
      LEFT JOIN crm_leads  l  ON l.id = r.lead_id
      LEFT JOIN hub_users  u  ON u.id = r.responsavel_id
      LEFT JOIN hub_users  cb ON cb.id = r.created_by
     WHERE ${where.join(' AND ')}
     ORDER BY r.created_at DESC
     LIMIT 200`,
    params
  )
  return res.json({ ok: true, data: rows.map(mapReserva) })
})

// GET /reservas/stats
router.get('/reservas/stats', async (req, res) => {
  const { rows: [s] } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'ativa')       AS ativas,
        COUNT(*) FILTER (WHERE status = 'expirada')    AS expiradas,
        COUNT(*) FILTER (WHERE status = 'convertida')  AS convertidas,
        COUNT(*) FILTER (WHERE status = 'cancelada')   AS canceladas,
        COUNT(*) FILTER (WHERE status = 'ativa' AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '2 hours') AS expirando_em_breve
      FROM com_reservas WHERE tenant_id = $1`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: s })
})

// POST /reservas
router.post('/reservas', async (req, res) => {
  const {
    lead_id, lot_id, lot_number, quadra, area_m2, preco_lista,
    empreendimento_id, responsavel_id, sla_horas = 48, observacoes,
  } = req.body

  if (!lot_id) return res.status(400).json({ ok: false, message: 'lot_id obrigatório' })

  // Anti-dupla venda: check ativa for same lot
  const { rows: existing } = await query(
    `SELECT id FROM com_reservas WHERE tenant_id=$1 AND lot_id=$2 AND status='ativa' LIMIT 1`,
    [req.user.tenant_id, lot_id]
  )
  if (existing.length) return res.status(409).json({ ok: false, message: 'Lote já possui reserva ativa. Cancele a reserva existente primeiro.' })

  const expiresAt = new Date(Date.now() + Number(sla_horas) * 3600000)

  const { rows: [r] } = await query(
    `INSERT INTO com_reservas
       (tenant_id, lead_id, lot_id, lot_number, quadra, area_m2, preco_lista,
        empreendimento_id, responsavel_id, expires_at, observacoes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [req.user.tenant_id, lead_id||null, lot_id, lot_number||null, quadra||null,
     area_m2||null, preco_lista||null, empreendimento_id||null,
     responsavel_id||null, expiresAt, observacoes||null, req.user.id]
  )

  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'reserva_created', module: 'comercial', entityType: 'com_reservas', entityId: r.id, meta: { lot_id, lead_id } }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapReserva(r) })
})

// PATCH /reservas/:id/cancel
router.patch('/reservas/:id/cancel', async (req, res) => {
  const { cancel_reason } = req.body
  const { rows: [r] } = await query(
    `UPDATE com_reservas SET status='cancelada', cancel_reason=$1, cancelled_at=NOW(), updated_at=NOW()
      WHERE id=$2 AND tenant_id=$3 AND status='ativa'
      RETURNING *`,
    [cancel_reason||null, req.params.id, req.user.tenant_id]
  )
  if (!r) return res.status(404).json({ ok: false, message: 'Reserva não encontrada ou já encerrada' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'reserva_cancelled', module: 'comercial', entityType: 'com_reservas', entityId: r.id }).catch(() => {})
  return res.json({ ok: true, data: mapReserva(r) })
})

// PATCH /reservas/:id/extend  { horas: 24 }
router.patch('/reservas/:id/extend', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const horas = Math.max(1, Number(req.body.horas) || 24)
  const { rows: [r] } = await query(
    `UPDATE com_reservas
        SET expires_at = GREATEST(expires_at, NOW()) + ($1 || ' hours')::interval, updated_at=NOW()
      WHERE id=$2 AND tenant_id=$3 AND status='ativa'
      RETURNING *`,
    [horas, req.params.id, req.user.tenant_id]
  )
  if (!r) return res.status(404).json({ ok: false, message: 'Reserva não encontrada' })
  return res.json({ ok: true, data: mapReserva(r) })
})

// PATCH /reservas/:id/convert  — converte em proposta
router.patch('/reservas/:id/convert', async (req, res) => {
  const { rows: [r] } = await query(
    `UPDATE com_reservas SET status='convertida', converted_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 AND status='ativa'
      RETURNING *`,
    [req.params.id, req.user.tenant_id]
  )
  if (!r) return res.status(404).json({ ok: false, message: 'Reserva não encontrada' })
  return res.json({ ok: true, data: mapReserva(r) })
})

// ─────────────────────────────────────────────────────────────────────────────
// PROPOSTAS
// ─────────────────────────────────────────────────────────────────────────────

function mapProposta(p) {
  return {
    id:                 p.id,
    numero:             p.numero,
    lead_id:            p.lead_id,
    lead_name:          p.lead_name,
    lead_phone:         p.lead_phone,
    reserva_id:         p.reserva_id,
    lot_id:             p.lot_id,
    lot_number:         p.lot_number,
    quadra:             p.quadra,
    area_m2:            Number(p.area_m2 || 0),
    empreendimento_id:  p.empreendimento_id,
    preco_lista:        Number(p.preco_lista || 0),
    preco_negociado:    Number(p.preco_negociado || 0),
    desconto_pct:       Number(p.desconto_pct || 0),
    entrada_pct:        Number(p.entrada_pct || 0),
    entrada_valor:      Number(p.entrada_valor || 0),
    parcelas:           Number(p.parcelas || 1),
    taxa_juros_mes:     Number(p.taxa_juros_mes || 0),
    financiamento_tipo: p.financiamento_tipo,
    status:             p.status,
    requer_aprovacao:   p.requer_aprovacao,
    aprovado_por:       p.aprovado_por,
    aprovado_por_name:  p.aprovado_por_name,
    aprovado_em:        p.aprovado_em,
    motivo_recusa:      p.motivo_recusa,
    validade_dias:      p.validade_dias,
    expires_at:         p.expires_at,
    observacoes:        p.observacoes,
    condicoes_especiais:p.condicoes_especiais,
    responsavel_id:     p.responsavel_id,
    responsavel_name:   p.responsavel_name,
    created_by_name:    p.created_by_name,
    created_at:         p.created_at,
    updated_at:         p.updated_at,
  }
}

const PROPOSTA_JOIN = `
  FROM com_propostas p
  LEFT JOIN crm_leads  l   ON l.id  = p.lead_id
  LEFT JOIN hub_users  u   ON u.id  = p.responsavel_id
  LEFT JOIN hub_users  ap  ON ap.id = p.aprovado_por
  LEFT JOIN hub_users  cb  ON cb.id = p.created_by
`
const PROPOSTA_SELECT = `
  SELECT p.*,
    l.name   AS lead_name,
    l.phone  AS lead_phone,
    u.name   AS responsavel_name,
    ap.name  AS aprovado_por_name,
    cb.name  AS created_by_name
`

// GET /propostas?status=&lead_id=
router.get('/propostas', async (req, res) => {
  const { status, lead_id } = req.query
  const where  = ['p.tenant_id = $1']
  const params = [req.user.tenant_id]

  if (status && status !== 'all') { params.push(status); where.push(`p.status = $${params.length}`) }
  if (lead_id) { params.push(lead_id); where.push(`p.lead_id = $${params.length}`) }

  const { rows } = await query(
    `${PROPOSTA_SELECT} ${PROPOSTA_JOIN} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 200`,
    params
  )
  return res.json({ ok: true, data: rows.map(mapProposta) })
})

// GET /propostas/stats
router.get('/propostas/stats', async (req, res) => {
  const { rows: [s] } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status = 'rascunho')              AS rascunhos,
        COUNT(*) FILTER (WHERE status = 'aguardando_aprovacao')  AS aguardando,
        COUNT(*) FILTER (WHERE status = 'aprovada')              AS aprovadas,
        COUNT(*) FILTER (WHERE status = 'recusada')              AS recusadas,
        COUNT(*) FILTER (WHERE status = 'convertida')            AS convertidas,
        COALESCE(SUM(preco_negociado) FILTER (WHERE status = 'aprovada'), 0) AS pipeline_aprovado,
        COALESCE(AVG(desconto_pct)    FILTER (WHERE status IN ('aprovada','convertida')), 0) AS desconto_medio
      FROM com_propostas WHERE tenant_id = $1`,
    [req.user.tenant_id]
  )
  return res.json({ ok: true, data: s })
})

// POST /propostas
router.post('/propostas', async (req, res) => {
  const {
    lead_id, reserva_id, lot_id, lot_number, quadra, area_m2, empreendimento_id,
    preco_lista, preco_negociado,
    entrada_pct = 0, parcelas = 1, taxa_juros_mes = 0, financiamento_tipo = 'price',
    validade_dias = 7, observacoes, condicoes_especiais, responsavel_id,
  } = req.body

  if (!preco_lista || !preco_negociado) return res.status(400).json({ ok: false, message: 'Preços obrigatórios' })

  const descontoAbs = Number(preco_lista) - Number(preco_negociado)
  const descontoPct = preco_lista > 0 ? (descontoAbs / Number(preco_lista)) * 100 : 0
  const requerAprovacao = descontoPct > 5  // business rule: >5% requer aprovação
  const entradaValor = Number(preco_negociado) * (Number(entrada_pct) / 100)
  const expiresAt = new Date(Date.now() + Number(validade_dias) * 86400000)

  const { rows: [p] } = await query(
    `INSERT INTO com_propostas
       (tenant_id, lead_id, reserva_id, lot_id, lot_number, quadra, area_m2,
        empreendimento_id, preco_lista, preco_negociado, entrada_pct, entrada_valor,
        parcelas, taxa_juros_mes, financiamento_tipo, requer_aprovacao,
        status, validade_dias, expires_at, observacoes, condicoes_especiais,
        responsavel_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING *`,
    [
      req.user.tenant_id, lead_id||null, reserva_id||null, lot_id||null, lot_number||null,
      quadra||null, area_m2||null, empreendimento_id||null,
      preco_lista, preco_negociado, entrada_pct, entradaValor,
      parcelas, taxa_juros_mes, financiamento_tipo, requerAprovacao,
      requerAprovacao ? 'aguardando_aprovacao' : 'rascunho',
      validade_dias, expiresAt, observacoes||null, condicoes_especiais||null,
      responsavel_id||null, req.user.id,
    ]
  )

  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'proposta_created', module: 'comercial', entityType: 'com_propostas', entityId: p.id }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapProposta(p) })
})

// PATCH /propostas/:id/aprovar
router.patch('/propostas/:id/aprovar', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão para aprovar' })
  const { rows: [p] } = await query(
    `UPDATE com_propostas
        SET status='aprovada', aprovado_por=$1, aprovado_em=NOW(), updated_at=NOW()
      WHERE id=$2 AND tenant_id=$3 AND status IN ('rascunho','aguardando_aprovacao')
      RETURNING *`,
    [req.user.id, req.params.id, req.user.tenant_id]
  )
  if (!p) return res.status(404).json({ ok: false, message: 'Proposta não encontrada' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'proposta_approved', module: 'comercial', entityType: 'com_propostas', entityId: p.id }).catch(() => {})
  return res.json({ ok: true, data: mapProposta(p) })
})

// PATCH /propostas/:id/recusar
router.patch('/propostas/:id/recusar', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão para recusar' })
  const motivo = String(req.body.motivo || '').trim()
  const { rows: [p] } = await query(
    `UPDATE com_propostas
        SET status='recusada', recusado_por=$1, recusado_em=NOW(), motivo_recusa=$2, updated_at=NOW()
      WHERE id=$3 AND tenant_id=$4 AND status IN ('rascunho','aguardando_aprovacao')
      RETURNING *`,
    [req.user.id, motivo, req.params.id, req.user.tenant_id]
  )
  if (!p) return res.status(404).json({ ok: false, message: 'Proposta não encontrada' })
  return res.json({ ok: true, data: mapProposta(p) })
})

// PATCH /propostas/:id/converter
router.patch('/propostas/:id/converter', async (req, res) => {
  const { rows: [p] } = await query(
    `UPDATE com_propostas SET status='convertida', converted_at=NOW(), updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 AND status='aprovada'
      RETURNING *`,
    [req.params.id, req.user.tenant_id]
  )
  if (!p) return res.status(404).json({ ok: false, message: 'Proposta não encontrada ou não aprovada' })
  return res.json({ ok: true, data: mapProposta(p) })
})

module.exports = router
