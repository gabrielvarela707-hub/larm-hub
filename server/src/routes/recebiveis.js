/**
 * server/src/routes/recebiveis.js
 * v0.2.1 — Contratos, Parcelas, Cobrança, Acordos e Projeção.
 */

const express = require('express')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(authenticate)

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'manager'])

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcPriceParcel(pv, taxaMes, n) {
  if (taxaMes === 0) return pv / n
  const i = taxaMes / 100
  return pv * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1)
}

function calcSacParcel(pv, taxaMes, n, numero) {
  const amort = pv / n
  const saldo = pv - amort * (numero - 1)
  return amort + saldo * (taxaMes / 100)
}

function gerarParcelas(contrato) {
  const parcelas = []
  const { valor_total, valor_entrada, parcelas_count, taxa_juros_mes, financiamento_tipo } = contrato
  const valorFinanciado = valor_total - valor_entrada

  // Entrada
  if (valor_entrada > 0) {
    parcelas.push({ numero: 0, tipo: 'entrada', vencimento: new Date(), valor_nominal: valor_entrada })
  }

  if (financiamento_tipo === 'avista') return parcelas

  const hoje = new Date()
  for (let i = 1; i <= parcelas_count; i++) {
    const venc = new Date(hoje)
    venc.setMonth(venc.getMonth() + i)
    let valor
    if (financiamento_tipo === 'sac') {
      valor = calcSacParcel(valorFinanciado, taxa_juros_mes, parcelas_count, i)
    } else {
      valor = calcPriceParcel(valorFinanciado, taxa_juros_mes, parcelas_count)
    }
    parcelas.push({ numero: i, tipo: 'parcela', vencimento: venc, valor_nominal: Math.round(valor * 100) / 100 })
  }
  return parcelas
}

function mapContrato(r) {
  return {
    id: r.id, numero: r.numero, tenant_id: r.tenant_id,
    proposta_id: r.proposta_id, lead_id: r.lead_id, corretor_id: r.corretor_id,
    lot_id: r.lot_id, lot_number: r.lot_number, quadra: r.quadra,
    area_m2: Number(r.area_m2 || 0), empreendimento_id: r.empreendimento_id,
    comprador_nome: r.comprador_nome, comprador_cpf: r.comprador_cpf,
    comprador_phone: r.comprador_phone, comprador_email: r.comprador_email,
    valor_total: Number(r.valor_total), valor_entrada: Number(r.valor_entrada),
    parcelas_count: r.parcelas_count, taxa_juros_mes: Number(r.taxa_juros_mes),
    financiamento_tipo: r.financiamento_tipo, status: r.status,
    assinado_em: r.assinado_em, distratado_em: r.distratado_em, quitado_em: r.quitado_em,
    observacoes: r.observacoes, responsavel_id: r.responsavel_id,
    responsavel_name: r.responsavel_name, created_by_name: r.created_by_name,
    lead_name: r.lead_name, lead_phone: r.lead_phone,
    parcelas_total: Number(r.parcelas_total || 0),
    parcelas_pagas: Number(r.parcelas_pagas || 0),
    parcelas_atrasadas: Number(r.parcelas_atrasadas || 0),
    valor_recebido: Number(r.valor_recebido || 0),
    created_at: r.created_at, updated_at: r.updated_at,
  }
}

function mapParcela(r) {
  const hoje = new Date()
  const venc = new Date(r.vencimento)
  const diasAtraso = r.status === 'atrasada' ? Math.floor((hoje - venc) / 86400000) : 0
  return {
    id: r.id, contrato_id: r.contrato_id, numero: r.numero, tipo: r.tipo,
    contrato_numero: r.contrato_numero, comprador_nome: r.comprador_nome,
    lot_id: r.lot_id, lot_number: r.lot_number, quadra: r.quadra,
    vencimento: r.vencimento, valor_nominal: Number(r.valor_nominal),
    valor_correcao: Number(r.valor_correcao || 0),
    valor_multa: Number(r.valor_multa || 0),
    valor_juros_mora: Number(r.valor_juros_mora || 0),
    valor_desconto: Number(r.valor_desconto || 0),
    valor_total_cobrar: Number(r.valor_nominal) + Number(r.valor_correcao || 0) +
      Number(r.valor_multa || 0) + Number(r.valor_juros_mora || 0) - Number(r.valor_desconto || 0),
    status: r.status, pago_em: r.pago_em, valor_pago: Number(r.valor_pago || 0),
    forma_pagamento: r.forma_pagamento, observacoes_baixa: r.observacoes_baixa,
    dias_atraso: diasAtraso, created_at: r.created_at,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS
// ─────────────────────────────────────────────────────────────────────────────

const CONTRATO_SELECT = `
  SELECT c.*,
    l.name  AS lead_name, l.phone AS lead_phone,
    u.name  AS responsavel_name, cb.name AS created_by_name,
    (SELECT COUNT(*) FROM com_parcelas p WHERE p.contrato_id = c.id)                          AS parcelas_total,
    (SELECT COUNT(*) FROM com_parcelas p WHERE p.contrato_id = c.id AND p.status = 'paga')    AS parcelas_pagas,
    (SELECT COUNT(*) FROM com_parcelas p WHERE p.contrato_id = c.id AND p.status = 'atrasada')AS parcelas_atrasadas,
    (SELECT COALESCE(SUM(p.valor_pago),0) FROM com_parcelas p WHERE p.contrato_id = c.id AND p.status = 'paga') AS valor_recebido
  FROM com_contratos c
  LEFT JOIN crm_leads  l  ON l.id  = c.lead_id
  LEFT JOIN hub_users  u  ON u.id  = c.responsavel_id
  LEFT JOIN hub_users  cb ON cb.id = c.created_by
`

// GET /contratos
router.get('/contratos', async (req, res) => {
  const { status, search } = req.query
  const where = ['c.tenant_id = $1']; const params = [req.user.tenant_id]
  if (status && status !== 'all') { params.push(status); where.push(`c.status = $${params.length}`) }
  if (search) { params.push(`%${search}%`); where.push(`(c.comprador_nome ILIKE $${params.length} OR c.numero ILIKE $${params.length} OR c.lot_id ILIKE $${params.length})`) }
  const { rows } = await query(`${CONTRATO_SELECT} WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC LIMIT 200`, params)
  return res.json({ ok: true, data: rows.map(mapContrato) })
})

// GET /contratos/stats
router.get('/contratos/stats', async (req, res) => {
  await query(`SELECT fn_parcelas_atualiza_atraso()`, []).catch(() => {})
  const { rows: [s] } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status='rascunho')              AS rascunhos,
        COUNT(*) FILTER (WHERE status='aguardando_assinatura') AS aguardando,
        COUNT(*) FILTER (WHERE status='assinado')              AS assinados,
        COUNT(*) FILTER (WHERE status='distratado')            AS distratados,
        COUNT(*) FILTER (WHERE status='quitado')               AS quitados,
        COALESCE(SUM(valor_total) FILTER (WHERE status='assinado'),0) AS carteira_total
      FROM com_contratos WHERE tenant_id=$1`, [req.user.tenant_id])
  return res.json({ ok: true, data: s })
})

// POST /contratos
router.post('/contratos', async (req, res) => {
  const {
    proposta_id, lead_id, corretor_id, lot_id, lot_number, quadra, area_m2, empreendimento_id,
    comprador_nome, comprador_cpf, comprador_phone, comprador_email,
    valor_total, valor_entrada = 0, parcelas_count = 1, taxa_juros_mes = 0,
    financiamento_tipo = 'price', responsavel_id, observacoes,
  } = req.body
  if (!comprador_nome || !valor_total) return res.status(400).json({ ok: false, message: 'comprador_nome e valor_total obrigatórios' })

  const { rowCount: count } = await query(`SELECT COUNT(*) FROM com_contratos WHERE tenant_id=$1`, [req.user.tenant_id])
  const numero = `SC-${String(Number((await query(`SELECT COUNT(*)+1 AS n FROM com_contratos WHERE tenant_id=$1`, [req.user.tenant_id])).rows[0].n).toString().padStart(3, '0'))}/${new Date().getFullYear()}`

  const { rows: [c] } = await query(
    `INSERT INTO com_contratos (tenant_id, numero, proposta_id, lead_id, corretor_id,
        lot_id, lot_number, quadra, area_m2, empreendimento_id,
        comprador_nome, comprador_cpf, comprador_phone, comprador_email,
        valor_total, valor_entrada, parcelas_count, taxa_juros_mes, financiamento_tipo,
        responsavel_id, observacoes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     RETURNING *`,
    [req.user.tenant_id, numero, proposta_id||null, lead_id||null, corretor_id||null,
     lot_id||null, lot_number||null, quadra||null, area_m2||null, empreendimento_id||null,
     comprador_nome, comprador_cpf||null, comprador_phone||null, comprador_email||null,
     valor_total, valor_entrada, parcelas_count, taxa_juros_mes, financiamento_tipo,
     responsavel_id||null, observacoes||null, req.user.id]
  )
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'contrato_created', module: 'recebiveis', entityType: 'com_contratos', entityId: c.id }).catch(() => {})
  return res.status(201).json({ ok: true, data: mapContrato(c) })
})

// PATCH /contratos/:id/assinar — assina e gera parcelas
router.patch('/contratos/:id/assinar', async (req, res) => {
  const { rows: [c] } = await query(
    `UPDATE com_contratos SET status='assinado', assinado_em=NOW(), updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 AND status IN ('rascunho','aguardando_assinatura') RETURNING *`,
    [req.params.id, req.user.tenant_id]
  )
  if (!c) return res.status(404).json({ ok: false, message: 'Contrato não encontrado ou já assinado' })

  // Gera parcelas se ainda não existem
  const { rows: existing } = await query(`SELECT COUNT(*) AS n FROM com_parcelas WHERE contrato_id=$1`, [c.id])
  if (Number(existing[0].n) === 0) {
    const parcelas = gerarParcelas(c)
    for (const p of parcelas) {
      await query(
        `INSERT INTO com_parcelas (tenant_id, contrato_id, numero, tipo, vencimento, valor_nominal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [req.user.tenant_id, c.id, p.numero, p.tipo, p.vencimento, p.valor_nominal]
      )
    }
  }
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'contrato_assinado', module: 'recebiveis', entityType: 'com_contratos', entityId: c.id }).catch(() => {})
  return res.json({ ok: true, data: mapContrato(c) })
})

// PATCH /contratos/:id/status  { status: 'aguardando_assinatura'|'distratado'|'quitado', motivo? }
router.patch('/contratos/:id/status', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { status, motivo } = req.body
  const allowed = ['aguardando_assinatura','distratado','quitado']
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, message: 'Status inválido' })
  const extra = status === 'distratado' ? `, distratado_em=NOW(), distrato_motivo=${motivo ? `'${motivo}'` : 'NULL'}`
    : status === 'quitado' ? ', quitado_em=NOW()' : ''
  const { rows: [c] } = await query(
    `UPDATE com_contratos SET status=$1${extra}, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *`,
    [status, req.params.id, req.user.tenant_id]
  )
  if (!c) return res.status(404).json({ ok: false, message: 'Contrato não encontrado' })
  return res.json({ ok: true, data: mapContrato(c) })
})

// ─────────────────────────────────────────────────────────────────────────────
// PARCELAS
// ─────────────────────────────────────────────────────────────────────────────

const PARCELA_SELECT = `
  SELECT p.*, c.numero AS contrato_numero, c.comprador_nome, c.lot_id, c.lot_number, c.quadra
    FROM com_parcelas p
    JOIN com_contratos c ON c.id = p.contrato_id
`

// GET /parcelas?status=&contrato_id=&vencimento_ate=
router.get('/parcelas', async (req, res) => {
  await query(`SELECT fn_parcelas_atualiza_atraso()`, []).catch(() => {})
  const { status, contrato_id, vencimento_ate, vencimento_de } = req.query
  const where = ['p.tenant_id = $1']; const params = [req.user.tenant_id]
  if (status && status !== 'all') { params.push(status); where.push(`p.status = $${params.length}`) }
  if (contrato_id) { params.push(contrato_id); where.push(`p.contrato_id = $${params.length}`) }
  if (vencimento_de) { params.push(vencimento_de); where.push(`p.vencimento >= $${params.length}`) }
  if (vencimento_ate) { params.push(vencimento_ate); where.push(`p.vencimento <= $${params.length}`) }
  const { rows } = await query(`${PARCELA_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.vencimento ASC LIMIT 500`, params)
  return res.json({ ok: true, data: rows.map(mapParcela) })
})

// GET /parcelas/stats
router.get('/parcelas/stats', async (req, res) => {
  await query(`SELECT fn_parcelas_atualiza_atraso()`, []).catch(() => {})
  const { rows: [s] } = await query(
    `SELECT
        COUNT(*) FILTER (WHERE status='aberta')      AS abertas,
        COUNT(*) FILTER (WHERE status='atrasada')    AS atrasadas,
        COUNT(*) FILTER (WHERE status='paga')        AS pagas,
        COALESCE(SUM(valor_nominal) FILTER (WHERE status='aberta'),0)   AS valor_aberto,
        COALESCE(SUM(valor_nominal) FILTER (WHERE status='atrasada'),0) AS valor_atrasado,
        COALESCE(SUM(valor_pago)    FILTER (WHERE status='paga'),0)     AS valor_recebido,
        COUNT(*) FILTER (WHERE status='aberta' AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE+30) AS vencendo_30d
      FROM com_parcelas WHERE tenant_id=$1`, [req.user.tenant_id])
  return res.json({ ok: true, data: s })
})

// PATCH /parcelas/:id/baixar
router.patch('/parcelas/:id/baixar', async (req, res) => {
  const { valor_pago, forma_pagamento, observacoes_baixa, data_pagamento } = req.body
  if (!valor_pago) return res.status(400).json({ ok: false, message: 'valor_pago obrigatório' })
  const pago_em = data_pagamento ? new Date(data_pagamento) : new Date()
  const { rows: [p] } = await query(
    `UPDATE com_parcelas
        SET status='paga', pago_em=$1, valor_pago=$2, forma_pagamento=$3, observacoes_baixa=$4, updated_at=NOW()
      WHERE id=$5 AND tenant_id=$6 AND status IN ('aberta','atrasada')
      RETURNING *`,
    [pago_em, valor_pago, forma_pagamento||null, observacoes_baixa||null, req.params.id, req.user.tenant_id]
  )
  if (!p) return res.status(404).json({ ok: false, message: 'Parcela não encontrada ou já paga' })
  await logAudit({ userId: req.user.id, tenantId: req.user.tenant_id, action: 'parcela_baixada', module: 'recebiveis', entityType: 'com_parcelas', entityId: p.id, meta: { valor_pago } }).catch(() => {})
  return res.json({ ok: true, data: mapParcela(p) })
})

// PATCH /parcelas/:id/reemitir  — reseta para aberta
router.patch('/parcelas/:id/reemitir', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { rows: [p] } = await query(
    `UPDATE com_parcelas SET status='aberta', pago_em=NULL, valor_pago=NULL, forma_pagamento=NULL, updated_at=NOW()
      WHERE id=$1 AND tenant_id=$2 RETURNING *`,
    [req.params.id, req.user.tenant_id]
  )
  if (!p) return res.status(404).json({ ok: false, message: 'Parcela não encontrada' })
  return res.json({ ok: true, data: mapParcela(p) })
})

// ─────────────────────────────────────────────────────────────────────────────
// COBRANÇAS
// ─────────────────────────────────────────────────────────────────────────────

// GET /cobrancas?contrato_id=
router.get('/cobrancas', async (req, res) => {
  const { contrato_id, parcela_id } = req.query
  const where = ['cb.tenant_id = $1']; const params = [req.user.tenant_id]
  if (contrato_id) { params.push(contrato_id); where.push(`cb.contrato_id = $${params.length}`) }
  if (parcela_id)  { params.push(parcela_id);  where.push(`cb.parcela_id  = $${params.length}`) }
  const { rows } = await query(
    `SELECT cb.*, p.numero AS parcela_numero, p.vencimento, p.valor_nominal, u.name AS criado_por_nome
       FROM com_cobrancas cb
       JOIN com_parcelas p ON p.id = cb.parcela_id
       LEFT JOIN hub_users u ON u.id = cb.created_by
      WHERE ${where.join(' AND ')}
      ORDER BY cb.created_at DESC LIMIT 200`, params)
  return res.json({ ok: true, data: rows })
})

// POST /cobrancas
router.post('/cobrancas', async (req, res) => {
  const { parcela_id, canal = 'sms', mensagem } = req.body
  if (!parcela_id) return res.status(400).json({ ok: false, message: 'parcela_id obrigatório' })
  const { rows: [par] } = await query(`SELECT contrato_id FROM com_parcelas WHERE id=$1 AND tenant_id=$2`, [parcela_id, req.user.tenant_id])
  if (!par) return res.status(404).json({ ok: false, message: 'Parcela não encontrada' })
  const { rows: [cb] } = await query(
    `INSERT INTO com_cobrancas (tenant_id, parcela_id, contrato_id, canal, mensagem, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.tenant_id, parcela_id, par.contrato_id, canal, mensagem||null, req.user.id]
  )
  return res.status(201).json({ ok: true, data: cb })
})

// POST /cobrancas/bulk  — régua em lote: envia para todas parcelas atrasadas
router.post('/cobrancas/bulk', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { canal = 'sms', dias_atraso_min = 1, dias_atraso_max = 90 } = req.body
  const { rows: parcelas } = await query(
    `SELECT p.id, p.contrato_id FROM com_parcelas p
      WHERE p.tenant_id=$1 AND p.status='atrasada'
        AND p.vencimento BETWEEN CURRENT_DATE-$2 AND CURRENT_DATE-$3`,
    [req.user.tenant_id, dias_atraso_max, dias_atraso_min]
  )
  let count = 0
  for (const p of parcelas) {
    await query(
      `INSERT INTO com_cobrancas (tenant_id, parcela_id, contrato_id, canal, created_by) VALUES ($1,$2,$3,$4,$5)`,
      [req.user.tenant_id, p.id, p.contrato_id, canal, req.user.id]
    ).catch(() => {})
    count++
  }
  return res.json({ ok: true, enviadas: count })
})

// ─────────────────────────────────────────────────────────────────────────────
// ACORDOS / RENEGOCIAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

// GET /acordos?contrato_id=
router.get('/acordos', async (req, res) => {
  const { contrato_id, status } = req.query
  const where = ['a.tenant_id = $1']; const params = [req.user.tenant_id]
  if (contrato_id) { params.push(contrato_id); where.push(`a.contrato_id = $${params.length}`) }
  if (status && status !== 'all') { params.push(status); where.push(`a.status = $${params.length}`) }
  const { rows } = await query(
    `SELECT a.*, c.numero AS contrato_numero, c.comprador_nome, u.name AS criado_por_nome, ap.name AS aprovado_por_nome
       FROM com_acordos a
       JOIN com_contratos c ON c.id = a.contrato_id
       LEFT JOIN hub_users u  ON u.id  = a.created_by
       LEFT JOIN hub_users ap ON ap.id = a.aprovado_por
      WHERE ${where.join(' AND ')}
      ORDER BY a.created_at DESC LIMIT 100`, params)
  return res.json({ ok: true, data: rows })
})

// POST /acordos
router.post('/acordos', async (req, res) => {
  const { contrato_id, tipo='renegociacao', descricao, parcelas_afetadas=[],
          novo_valor_parcela, novo_vencimento_base, novas_parcelas_count,
          desconto_pct, valor_entrada_acordo } = req.body
  if (!contrato_id) return res.status(400).json({ ok: false, message: 'contrato_id obrigatório' })
  const { rows: [a] } = await query(
    `INSERT INTO com_acordos (tenant_id, contrato_id, tipo, descricao, parcelas_afetadas,
        novo_valor_parcela, novo_vencimento_base, novas_parcelas_count,
        desconto_pct, valor_entrada_acordo, created_by)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [req.user.tenant_id, contrato_id, tipo, descricao||null, JSON.stringify(parcelas_afetadas),
     novo_valor_parcela||null, novo_vencimento_base||null, novas_parcelas_count||null,
     desconto_pct||null, valor_entrada_acordo||null, req.user.id]
  )
  return res.status(201).json({ ok: true, data: a })
})

// PATCH /acordos/:id/aprovar
router.patch('/acordos/:id/aprovar', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { rows: [a] } = await query(
    `UPDATE com_acordos SET status='aprovado', aprovado_por=$1, aprovado_em=NOW(), updated_at=NOW()
      WHERE id=$2 AND tenant_id=$3 AND status='pendente' RETURNING *`,
    [req.user.id, req.params.id, req.user.tenant_id]
  )
  if (!a) return res.status(404).json({ ok: false, message: 'Acordo não encontrado' })
  return res.json({ ok: true, data: a })
})

// PATCH /acordos/:id/recusar
router.patch('/acordos/:id/recusar', async (req, res) => {
  if (!ADMIN_ROLES.has(req.user.role)) return res.status(403).json({ ok: false, message: 'Sem permissão' })
  const { rows: [a] } = await query(
    `UPDATE com_acordos SET status='recusado', recusado_por=$1, motivo_recusa=$2, updated_at=NOW()
      WHERE id=$2 AND tenant_id=$3 AND status='pendente' RETURNING *`,
    [req.user.id, req.body.motivo||null, req.user.tenant_id]
  )
  if (!a) return res.status(404).json({ ok: false, message: 'Acordo não encontrado' })
  return res.json({ ok: true, data: a })
})

// ─────────────────────────────────────────────────────────────────────────────
// PROJEÇÃO DE RECEBÍVEIS (REC-07)
// ─────────────────────────────────────────────────────────────────────────────

// GET /recebiveis/projecao?meses=12
router.get('/recebiveis/projecao', async (req, res) => {
  const meses = Math.min(60, Math.max(1, Number(req.query.meses) || 12))

  const { rows } = await query(
    `SELECT
        TO_CHAR(DATE_TRUNC('month', vencimento), 'YYYY-MM') AS mes,
        COUNT(*)                                             AS total_parcelas,
        SUM(valor_nominal)                                   AS valor_previsto,
        SUM(CASE WHEN status='paga' THEN valor_pago ELSE 0 END) AS valor_realizado,
        COUNT(*) FILTER (WHERE status='atrasada')            AS atrasadas,
        COUNT(*) FILTER (WHERE status='paga')                AS pagas
      FROM com_parcelas
     WHERE tenant_id=$1
       AND vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' months')::interval
     GROUP BY 1 ORDER BY 1`,
    [req.user.tenant_id, meses]
  )

  // Safra — agrupa contratos por mês de criação e projeta recebíveis
  const { rows: safra } = await query(
    `SELECT
        TO_CHAR(DATE_TRUNC('month', c.created_at), 'YYYY-MM') AS safra,
        COUNT(DISTINCT c.id)                                   AS contratos,
        SUM(c.valor_total)                                     AS valor_total_carteira,
        SUM(COALESCE(p_pago.recebido, 0))                      AS recebido
      FROM com_contratos c
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(p.valor_pago), 0) AS recebido
          FROM com_parcelas p
         WHERE p.contrato_id = c.id AND p.status = 'paga'
      ) p_pago ON true
     WHERE c.tenant_id=$1 AND c.status='assinado'
     GROUP BY 1 ORDER BY 1 LIMIT 24`,
    [req.user.tenant_id]
  )

  return res.json({ ok: true, data: { fluxo: rows, safra } })
})

module.exports = router
