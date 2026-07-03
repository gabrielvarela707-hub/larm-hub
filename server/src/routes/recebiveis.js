/**
 * server/src/routes/recebiveis.js
 * v0.3.81 — Contratos, parcelas, baixa manual e retorno Bradesco integrado aos recebíveis Strato.
 */

const express = require('express')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const logger = require('../config/logger')
const { logAudit } = require('../services/auditService')
const {
  buildBoletoData,
  buildBoletoHtml,
  buildRemittance,
  nossoNumeroDv,
  onlyDigits,
} = require('../services/bradescoCnab400')
const { processBradescoReturn } = require('../services/bradescoReturnProcessor')

const router = express.Router()
router.use(authenticate)

const ADMIN_ROLES = new Set(['super_admin', 'admin', 'manager'])
const FINANCE_WRITE_ROLES = new Set([
  'super_admin', 'admin', 'manager', 'controller', 'financial',
  'superadministrador', 'administrador', 'gerente', 'controladoria', 'financeiro',
])

function canWriteFinance(user) {
  const candidates = [user?.role, user?.role_code, user?.perfil, user?.profile]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean)
  return candidates.some(role => FINANCE_WRITE_ROLES.has(role))
}

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


function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function sendExcelXml(res, filename, sheetName, columns, rows) {
  const header = columns
    .map(column => `<Cell><Data ss:Type="String">${xmlEscape(column.header)}</Data></Cell>`)
    .join('')
  const body = rows.map(row => {
    const cells = columns.map(column => {
      const raw = typeof column.value === 'function' ? column.value(row) : row[column.key]
      const value = raw === null || raw === undefined ? '' : raw
      const numeric = typeof value === 'number' && Number.isFinite(value)
      return `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${xmlEscape(value)}</Data></Cell>`
    }).join('')
    return `<Row>${cells}</Row>`
  }).join('')
  const xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlEscape(sheetName).slice(0, 31) || 'Export'}"><Table><Row>${header}</Row>${body}</Table></Worksheet></Workbook>`
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.send(xml)
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function contasReceberValorSql(alias = 'p') {
  return `CASE
    WHEN ${alias}.valor_recalculado IS NOT NULL THEN ${alias}.valor_recalculado
    WHEN ${alias}.origem = 'strato_receber' AND ${alias}.valor_total_relatorio IS NOT NULL
      THEN ${alias}.valor_total_relatorio
    ELSE COALESCE(${alias}.valor_nominal, 0)
      + COALESCE(${alias}.valor_correcao, 0)
      + COALESCE(${alias}.valor_multa, 0)
      + COALESCE(${alias}.valor_juros_mora, 0)
      + COALESCE(${alias}.valor_outros_acrescimos, 0)
      + COALESCE(${alias}.valor_seguro, 0)
      - COALESCE(${alias}.valor_desconto, 0)
  END`
}

function buildContasReceberFilters(req, { defaultCurrentMonth = true } = {}) {
  const {
    busca,
    cliente_id,
    tipo_receita_id,
    obra_id,
    empresa,
    status,
    venc_inicio,
    venc_fim,
  } = req.query

  const where = ['p.tenant_id = $1']
  const params = [req.user.tenant_id]

  if (busca) {
    params.push(`%${String(busca).trim()}%`)
    const token = `$${params.length}`
    where.push(`(
      COALESCE(cp.nome, cp.razao_social, c.comprador_nome, '') ILIKE ${token}
      OR COALESCE(cp.cpf_cnpj, c.comprador_cpf, '') ILIKE ${token}
      OR COALESCE(c.numero, '') ILIKE ${token}
      OR COALESCE(c.titulo, '') ILIKE ${token}
      OR COALESCE(r.titulo, '') ILIKE ${token}
      OR COALESCE(r.numero_documento, p.documento_legado, '') ILIKE ${token}
      OR COALESCE(unidade.nome, '') ILIKE ${token}
      OR COALESCE(obra.nome, '') ILIKE ${token}
      OR COALESCE(c.unidade_codigo_legado, '') ILIKE ${token}
    )`)
  }

  if (cliente_id) {
    params.push(Number(cliente_id))
    where.push(`c.cliente_id = $${params.length}`)
  }

  if (tipo_receita_id) {
    params.push(Number(tipo_receita_id))
    where.push(`p.tipo_receita_id = $${params.length}`)
  }

  if (obra_id) {
    params.push(Number(obra_id))
    where.push(`COALESCE(obra.id, unidade.produto_pai_id, unidade.id) = $${params.length}`)
  }

  const billingCompany = normalizeBillingCompany(empresa)
  if (billingCompany) {
    params.push(billingCompany)
    where.push(`CASE
      WHEN COALESCE(c.obra_codigo_legado, p.obra_codigo_legado) = 7698 THEN 'LUCKY'
      WHEN COALESCE(c.obra_codigo_legado, p.obra_codigo_legado) IN (7700, 7701) THEN 'LARM'
      ELSE NULL
    END = $${params.length}`)
  }

  if (status && status !== 'todos') {
    const normalized = String(status).toLowerCase()
    if (normalized === 'em_aberto') {
      where.push(`p.status IN ('aberta', 'atrasada')`)
    } else if (['aberta', 'atrasada', 'paga', 'cancelada'].includes(normalized)) {
      params.push(normalized)
      where.push(`p.status = $${params.length}`)
    }
  }

  const startDate = venc_inicio || (defaultCurrentMonth ? firstDayOfCurrentMonth() : null)
  if (startDate) {
    params.push(startDate)
    where.push(`p.vencimento >= $${params.length}`)
  }
  if (venc_fim) {
    params.push(venc_fim)
    where.push(`p.vencimento <= $${params.length}`)
  }

  return { where, params, appliedStartDate: startDate || null }
}

const CONTAS_RECEBER_FROM = `
  FROM com_parcelas p
  JOIN com_contratos c ON c.id = p.contrato_id
  LEFT JOIN cad_clientes cl ON cl.id = c.cliente_id
  LEFT JOIN cad_pessoas cp ON cp.id = cl.pessoa_id
  LEFT JOIN fin_receitas r ON r.id = p.receita_id
  LEFT JOIN fin_tipos_receita tr ON tr.id = p.tipo_receita_id
  LEFT JOIN cad_produtos unidade ON unidade.id = p.produto_id
  LEFT JOIN cad_produtos obra ON obra.id = unidade.produto_pai_id
  LEFT JOIN fin_movimento fm ON fm.id = p.movimento_id
  LEFT JOIN fin_indice_tipos idx ON idx.id = COALESCE(r.indice_reajuste_id, c.indice_reajuste_id)
`

const CONTAS_RECEBER_SELECT = `
  SELECT
    p.id,
    p.contrato_id,
    p.receita_id,
    p.numero,
    p.tipo,
    p.status,
    p.vencimento,
    p.pago_em,
    p.forma_pagamento,
    p.observacoes_baixa,
    p.origem,
    p.documento_legado,
    p.documento_base_legado,
    p.parcela_numero_legado,
    p.parcela_total_legado,
    p.obra_codigo_legado,
    p.unidade_codigo_legado,
    p.indice_codigo_legado,
    p.movimento_id,
    p.origem_baixa,
    p.conciliado_em,
    COALESCE(p.valor_nominal, 0)::float AS valor_nominal,
    COALESCE(p.valor_convertido, 0)::float AS valor_convertido,
    COALESCE(p.valor_correcao, 0)::float AS valor_correcao,
    COALESCE(p.valor_multa, 0)::float AS valor_multa,
    COALESCE(p.valor_juros_mora, 0)::float AS valor_juros_mora,
    COALESCE(p.valor_outros_acrescimos, 0)::float AS valor_outros_acrescimos,
    COALESCE(p.valor_seguro, 0)::float AS valor_seguro,
    COALESCE(p.valor_desconto, 0)::float AS valor_desconto,
    p.valor_recalculado::float AS valor_recalculado,
    p.data_recalculo,
    p.recalculado_em,
    p.recalculo_dados,
    p.nosso_numero,
    p.nosso_numero_dv,
    p.controle_participante,
    p.linha_digitavel,
    p.codigo_barras,
    p.boleto_status,
    p.boleto_emitido_em,
    p.boleto_enviado_em,
    p.boleto_envio_canal,
    p.boleto_envio_status,
    p.boleto_envio_erro,
    ${contasReceberValorSql('p')}::float AS valor_total,
    COALESCE(p.valor_pago, 0)::float AS valor_pago,
    c.numero AS contrato_numero,
    c.titulo AS contrato_titulo,
    c.tipo_contrato,
    c.cliente_id,
    c.obra_codigo_legado AS contrato_obra_codigo,
    c.unidade_codigo_legado AS contrato_unidade_codigo,
    CASE
      WHEN COALESCE(c.obra_codigo_legado, p.obra_codigo_legado) = 7698 THEN 'LUCKY'
      WHEN COALESCE(c.obra_codigo_legado, p.obra_codigo_legado) IN (7700, 7701) THEN 'LARM'
      ELSE NULL
    END AS empresa_cobranca,
    COALESCE(cp.nome, cp.razao_social, c.comprador_nome) AS cliente_nome,
    COALESCE(cp.cpf_cnpj, c.comprador_cpf) AS cliente_documento,
    COALESCE(cp.email, c.comprador_email) AS cliente_email,
    COALESCE(cp.celular, cp.telefone, c.comprador_phone) AS cliente_telefone,
    cp.cep AS cliente_cep,
    cp.logradouro AS cliente_logradouro,
    cp.numero AS cliente_numero,
    cp.complemento AS cliente_complemento,
    cp.bairro AS cliente_bairro,
    cp.cidade AS cliente_cidade,
    cp.uf AS cliente_uf,
    COALESCE(cl.ativo, TRUE) AS cliente_ativo,
    COALESCE(r.indice_reajuste_id, c.indice_reajuste_id) AS indice_reajuste_id,
    idx.codigo AS indice_codigo,
    idx.nome AS indice_nome,
    r.titulo AS receita_titulo,
    r.numero_documento AS receita_documento,
    tr.nome AS tipo_receita_nome,
    tr.codigo AS tipo_receita_codigo,
    COALESCE(obra.id, CASE WHEN unidade.tipo='obra' THEN unidade.id END) AS obra_id,
    COALESCE(obra.nome, CASE WHEN unidade.tipo='obra' THEN unidade.nome END, 'Obra ' || COALESCE(p.obra_codigo_legado::text, c.obra_codigo_legado::text, '')) AS obra_nome,
    unidade.id AS unidade_id,
    COALESCE(c.unidade_codigo_legado, p.unidade_codigo_legado, unidade.nome) AS unidade_nome,
    fm.data AS movimento_data,
    fm.banco AS movimento_banco,
    fm.historico AS movimento_historico
  ${CONTAS_RECEBER_FROM}
`

// ─────────────────────────────────────────────────────────────────────────────
// CONTAS A RECEBER OPERACIONAL
// ─────────────────────────────────────────────────────────────────────────────

// GET /financeiro/contas-receber/filtros
router.get('/financeiro/contas-receber/filtros', async (req, res) => {
  try {
    const [clientes, tipos, obras] = await Promise.all([
      query(
        `SELECT cl.id, COALESCE(p.nome, p.razao_social) AS nome, p.cpf_cnpj, cl.ativo
           FROM cad_clientes cl
           JOIN cad_pessoas p ON p.id = cl.pessoa_id
          WHERE EXISTS (SELECT 1 FROM com_contratos c WHERE c.cliente_id=cl.id AND c.tenant_id=$1)
          ORDER BY COALESCE(p.nome, p.razao_social)`,
        [req.user.tenant_id],
      ),
      query(
        `SELECT id, codigo, nome
           FROM fin_tipos_receita
          WHERE tenant_id=$1 AND ativo IS TRUE
          ORDER BY nome`,
        [req.user.tenant_id],
      ),
      query(
        `SELECT id, codigo, nome
           FROM cad_produtos
          WHERE tenant_id=$1 AND tipo='obra'
          ORDER BY nome`,
        [req.user.tenant_id],
      ),
    ])

    return res.json({
      ok: true,
      data: {
        clientes: clientes.rows,
        tipos_receita: tipos.rows,
        obras: obras.rows,
        empresas_cobranca: [
          { codigo: 'LARM', nome: 'LARM PARTICIPAÇÕES LTDA', obras: [7700, 7701] },
          { codigo: 'LUCKY', nome: 'LUCKY CAPITAL EMPREENDIMENTOS LTDA', obras: [7698] },
        ],
      },
    })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

// GET /financeiro/contas-receber
router.get('/financeiro/contas-receber', async (req, res) => {
  await query(`SELECT fn_parcelas_atualiza_atraso()`, []).catch(() => {})

  const page = Math.max(1, Number(req.query.page || 1))
  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)))
  const offset = (page - 1) * limit
  const { where, params, appliedStartDate } = buildContasReceberFilters(req)
  const whereSql = `WHERE ${where.join(' AND ')}`

  const sortMap = {
    cliente: 'cliente_nome',
    contrato: 'contrato_numero',
    receita: 'receita_titulo',
    parcela: 'p.numero',
    valor: 'valor_total',
    vencimento: 'p.vencimento',
    recebimento: 'p.pago_em',
    status: 'p.status',
  }
  const sort = sortMap[req.query.sort] || 'p.vencimento'
  const direction = String(req.query.direction).toLowerCase() === 'desc' ? 'DESC' : 'ASC'

  try {
    const dataParams = [...params, limit, offset]
    const dataSql = `${CONTAS_RECEBER_SELECT}
      ${whereSql}
      ORDER BY ${sort} ${direction} NULLS LAST, p.id
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`

    const summarySql = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE p.status IN ('aberta','atrasada'))::int AS total_em_aberto,
        COUNT(*) FILTER (WHERE p.status='atrasada')::int AS total_atrasadas,
        COUNT(*) FILTER (WHERE p.status='paga')::int AS total_pagas,
        COALESCE(SUM(${contasReceberValorSql('p')}) FILTER (WHERE p.status IN ('aberta','atrasada')), 0)::float AS valor_em_aberto,
        COALESCE(SUM(${contasReceberValorSql('p')}) FILTER (WHERE p.status='atrasada'), 0)::float AS valor_atrasado,
        COALESCE(SUM(COALESCE(NULLIF(p.valor_pago, 0), ${contasReceberValorSql('p')})) FILTER (WHERE p.status='paga'), 0)::float AS valor_recebido
      ${CONTAS_RECEBER_FROM}
      ${whereSql}`

    const [dataResult, summaryResult] = await Promise.all([
      query(dataSql, dataParams),
      query(summarySql, params),
    ])

    const summary = summaryResult.rows[0] || {}
    return res.json({
      ok: true,
      data: dataResult.rows,
      total: Number(summary.total || 0),
      page,
      limit,
      pages: Math.max(1, Math.ceil(Number(summary.total || 0) / limit)),
      default_vencimento_inicio: appliedStartDate,
      summary,
    })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

// GET /financeiro/contas-receber/exportar
router.get('/financeiro/contas-receber/exportar', async (req, res) => {
  const { where, params } = buildContasReceberFilters(req)
  const whereSql = `WHERE ${where.join(' AND ')}`

  try {
    const { rows } = await query(
      `${CONTAS_RECEBER_SELECT}
       ${whereSql}
       ORDER BY p.vencimento ASC NULLS LAST, cliente_nome, contrato_numero, p.numero`,
      params,
    )

    return sendExcelXml(res, 'contas-a-receber.xls', 'Contas a Receber', [
      { header: 'Cliente', key: 'cliente_nome' },
      { header: 'CPF/CNPJ', key: 'cliente_documento' },
      { header: 'Contrato', key: 'contrato_numero' },
      { header: 'Receita', key: 'receita_titulo' },
      { header: 'Tipo de Receita', key: 'tipo_receita_nome' },
      { header: 'Empresa de Cobrança', key: 'empresa_cobranca' },
      { header: 'Obra', key: 'obra_nome' },
      { header: 'Unidade', key: 'unidade_nome' },
      { header: 'Documento', value: row => row.receita_documento || row.documento_legado || '' },
      { header: 'Parcela', value: row => `${row.parcela_numero_legado || row.numero || ''}/${row.parcela_total_legado || ''}` },
      { header: 'Valor', key: 'valor_total' },
      { header: 'Vencimento', key: 'vencimento' },
      { header: 'Recebimento', key: 'pago_em' },
      { header: 'Valor Recebido', key: 'valor_pago' },
      { header: 'Status', key: 'status' },
      { header: 'Forma de Pagamento', key: 'forma_pagamento' },
      { header: 'Origem da Baixa', key: 'origem_baixa' },
      { header: 'Banco Conciliado', key: 'movimento_banco' },
    ], rows)
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})


const FINANCIAL_TIMEZONE = process.env.FINANCIAL_TIMEZONE || 'America/Sao_Paulo'

function isoToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: FINANCIAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function normalizeDateOnly(value, field = 'data') {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`${field} inválida`)
    return value.toISOString().slice(0, 10)
  }

  const text = String(value ?? '').trim()
  let raw = ''

  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    raw = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  } else {
    const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (brMatch) {
      raw = `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`
    } else {
      const parsed = new Date(text)
      if (Number.isNaN(parsed.getTime())) throw new Error(`${field} inválida`)
      raw = parsed.toISOString().slice(0, 10)
    }
  }

  const date = new Date(`${raw}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${field} inválida`)
  }
  return raw
}

function parseIsoDate(value, field = 'data') {
  const raw = normalizeDateOnly(value, field)
  return new Date(`${raw}T00:00:00.000Z`)
}

function dateToIso(date) {
  return normalizeDateOnly(date)
}

function firstOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1))
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function normalizeIndexCode(code) {
  return String(code || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function legacyIndexInfo(code) {
  const normalized = normalizeIndexCode(code)
  return {
    code: normalized.replace(/\d+$/g, ''),
    lagMonths: Math.max(0, Number((normalized.match(/(\d+)$/) || [])[1] || 0)),
  }
}

const RECEIVABLE_COMPANY_BY_OBRA = Object.freeze({
  '7698': 'LUCKY',
  '7700': 'LARM',
  '7701': 'LARM',
})

function normalizeBillingCompany(value) {
  const company = String(value || '').trim().toUpperCase()
  return ['LARM', 'LUCKY'].includes(company) ? company : null
}

function billingCompanyFromObra(value) {
  const obraCode = String(value ?? '').trim()
  return RECEIVABLE_COMPANY_BY_OBRA[obraCode] || null
}

function billingCompanyForParcel(parcel) {
  return billingCompanyFromObra(parcel?.contrato_obra_codigo)
    || billingCompanyFromObra(parcel?.obra_codigo_legado)
}

async function getBradescoConfig(tenantId, client = null, { forUpdate = false, empresa = null } = {}) {
  const runner = client || { query }
  const lock = client && forUpdate ? ' FOR UPDATE' : ''
  const company = normalizeBillingCompany(empresa)
  const params = [tenantId]
  const companyFilter = company ? ` AND UPPER(TRIM(empresa))=$${params.push(company)}` : ''
  const { rows: [config] } = await runner.query(
    `SELECT * FROM fin_cobranca_bancaria_config
      WHERE tenant_id=$1 AND banco_codigo='237' AND ativo IS TRUE${companyFilter}
      ORDER BY id
      LIMIT 1${lock}`,
    params,
  )
  return config || null
}

async function getReceivableParcel(id, tenantId, client = null, { forUpdate = false } = {}) {
  const runner = client || { query }
  const lock = client && forUpdate ? ' FOR UPDATE OF p' : ''
  const { rows: [row] } = await runner.query(
    `${CONTAS_RECEBER_SELECT}
      WHERE p.id=$1 AND p.tenant_id=$2${lock}`,
    [id, tenantId],
  )
  return row || null
}

async function calculateReceivable(parcel, tenantId, body = {}) {
  const targetDate = parseIsoDate(body.data_calculo || isoToday(), 'Data do cálculo')
  const dueDate = parseIsoDate(parcel.vencimento, 'Vencimento')
  const daysLate = Math.max(0, Math.floor((targetDate.getTime() - dueDate.getTime()) / 86400000))
  const billingCompany = billingCompanyForParcel(parcel)
  const config = billingCompany
    ? await getBradescoConfig(tenantId, null, { empresa: billingCompany }).catch(() => null)
    : null

  let indexType = null
  let lagMonths = 0
  const legacy = legacyIndexInfo(parcel.indice_codigo_legado)
  if (parcel.indice_reajuste_id) {
    const { rows: [row] } = await query(
      `SELECT id, codigo, nome, fonte FROM fin_indice_tipos WHERE id=$1 AND tenant_id=$2`,
      [parcel.indice_reajuste_id, tenantId],
    )
    indexType = row || null
  }

  if (!indexType && legacy.code) {
    const { rows: [row] } = await query(
      `SELECT id, codigo, nome, fonte
         FROM fin_indice_tipos
        WHERE tenant_id=$1
          AND REGEXP_REPLACE(UPPER(codigo), '[^A-Z0-9]', '', 'g')=$2
        ORDER BY ativo DESC, updated_at DESC, id DESC
        LIMIT 1`,
      [tenantId, legacy.code],
    )
    indexType = row || null
  }
  lagMonths = legacy.lagMonths

  const correctionMonths = []
  let cursor = addMonths(firstOfMonth(dueDate), 1)
  const targetMonth = firstOfMonth(targetDate)
  while (cursor <= targetMonth && correctionMonths.length < 240) {
    correctionMonths.push(new Date(cursor))
    cursor = addMonths(cursor, 1)
  }

  const references = correctionMonths.map(month => dateToIso(addMonths(month, -lagMonths)))
  let indexValues = []
  if (indexType && references.length) {
    // Usa o código econômico como chave principal, e não somente o ID gravado
    // no contrato. Isso mantém o recálculo compatível com contratos importados
    // antes da consolidação dos cadastros de índices e evita falso "ausente"
    // quando o mesmo IPCA/IGPM foi recadastrado no tenant.
    const lookupCode = legacy.code || normalizeIndexCode(indexType.codigo)
    const { rows } = await query(
      `SELECT DISTINCT ON (v.referencia)
              TO_CHAR(v.referencia, 'YYYY-MM-DD') AS referencia,
              v.variacao_mensal::float,
              v.variacao_periodo::float,
              v.acumulado_12m::float
         FROM fin_indice_valores v
         JOIN fin_indice_tipos t
           ON t.id = v.indice_tipo_id
          AND t.tenant_id = v.tenant_id
        WHERE v.tenant_id=$1
          AND (
            REGEXP_REPLACE(UPPER(t.codigo), '[^A-Z0-9]', '', 'g')=$2
            OR v.indice_tipo_id=$4
          )
          AND v.referencia = ANY($3::date[])
        ORDER BY v.referencia,
                 CASE WHEN v.indice_tipo_id=$4 THEN 0 ELSE 1 END,
                 v.updated_at DESC,
                 v.id DESC`,
      [tenantId, lookupCode, references, indexType.id],
    )
    indexValues = rows
  }

  const byReference = new Map(indexValues.map(row => [normalizeDateOnly(row.referencia, 'Referência do índice'), row]))
  let factor = 1
  const monthlyDetails = correctionMonths.map((month, index) => {
    const reference = references[index]
    const value = byReference.get(reference)
    const variation = value ? finiteNumber(value.variacao_mensal) : null
    if (variation !== null) factor *= 1 + (variation / 100)
    return {
      mes_correcao: dateToIso(month),
      referencia_indice: reference,
      variacao_mensal: variation,
      encontrado: Boolean(value),
    }
  })

  const calculatedIndexPercent = (factor - 1) * 100
  const indexPercent = body.percentual_indice === undefined || body.percentual_indice === ''
    ? calculatedIndexPercent
    : finiteNumber(body.percentual_indice)

  const baseValue = finiteNumber(parcel.valor_convertido) > 0
    ? finiteNumber(parcel.valor_convertido)
    : finiteNumber(parcel.valor_nominal || parcel.valor_total)
  const correctionValue = roundMoney(baseValue * indexPercent / 100)
  const correctedSubtotal = roundMoney(baseValue + correctionValue)
  const finePercent = daysLate > 0
    ? finiteNumber(body.percentual_multa, finiteNumber(config?.multa_percentual_padrao, 2))
    : 0
  const moraPercentMonth = daysLate > 0
    ? finiteNumber(body.percentual_mora_mes, finiteNumber(config?.mora_percentual_mes_padrao, 1))
    : 0
  const fineValue = roundMoney(correctedSubtotal * finePercent / 100)
  const moraValue = roundMoney(correctedSubtotal * moraPercentMonth / 100 * (daysLate / 30))
  const otherAdditions = roundMoney(finiteNumber(body.outros_acrescimos, parcel.valor_outros_acrescimos || 0))
  const insurance = roundMoney(finiteNumber(body.seguro, parcel.valor_seguro || 0))
  const discount = roundMoney(finiteNumber(body.desconto, parcel.valor_desconto || 0))
  const finalValue = Math.max(0, roundMoney(correctedSubtotal + fineValue + moraValue + otherAdditions + insurance - discount))
  const missingReferences = monthlyDetails.filter(item => !item.encontrado).map(item => item.referencia_indice)

  return {
    parcela_id: parcel.id,
    cliente_nome: parcel.cliente_nome,
    contrato_numero: parcel.contrato_numero,
    vencimento: normalizeDateOnly(parcel.vencimento, 'Vencimento'),
    data_calculo: dateToIso(targetDate),
    dias_atraso: daysLate,
    valor_base: roundMoney(baseValue),
    indice: indexType ? {
      id: indexType.id,
      codigo: indexType.codigo,
      nome: indexType.nome,
      fonte: indexType.fonte,
      defasagem_meses: lagMonths,
    } : null,
    percentual_indice_calculado: Number(calculatedIndexPercent.toFixed(8)),
    percentual_indice_aplicado: Number(indexPercent.toFixed(8)),
    valor_correcao: correctionValue,
    valor_corrigido: correctedSubtotal,
    percentual_multa: finePercent,
    valor_multa: fineValue,
    percentual_mora_mes: moraPercentMonth,
    valor_juros_mora: moraValue,
    valor_outros_acrescimos: otherAdditions,
    valor_seguro: insurance,
    valor_desconto: discount,
    valor_final: finalValue,
    meses: monthlyDetails,
    referencias_ausentes: missingReferences,
    avisos: [
      !indexType && correctionMonths.length ? 'O contrato não possui um índice econômico localizado; a correção monetária ficou zerada.' : null,
      missingReferences.length ? `Faltam valores mensais do índice para: ${missingReferences.join(', ')}.` : null,
    ].filter(Boolean),
  }
}

function ensureAdmin(req, res) {
  if (ADMIN_ROLES.has(req.user.role)) return true
  res.status(403).json({ ok: false, message: 'Sem permissão para esta operação.' })
  return false
}

async function getRecalculationParcels(anchor, tenantId, body = {}) {
  const includePrevious = body.incluir_parcelas_anteriores === true || body.incluir_parcelas_anteriores === 'true'
  if (!includePrevious) return [anchor]
  const targetDate = normalizeDateOnly(body.data_calculo || isoToday(), 'Data do cálculo')
  const { rows } = await query(
    `${CONTAS_RECEBER_SELECT}
      WHERE p.tenant_id=$1
        AND p.contrato_id=$2
        AND p.status IN ('aberta','atrasada')
        AND p.vencimento <= $3::date
      ORDER BY p.vencimento, p.tipo, p.numero, p.id`,
    [tenantId, anchor.contrato_id, targetDate],
  )
  return rows.length ? rows : [anchor]
}

function aggregateRecalculations(calculations, anchorId) {
  const anchor = calculations.find(item => item.parcela_id === anchorId) || calculations[calculations.length - 1]
  const sum = field => roundMoney(calculations.reduce((total, item) => total + finiteNumber(item[field]), 0))
  const warnings = [...new Set(calculations.flatMap(item => item.avisos || []))]
  const missing = [...new Set(calculations.flatMap(item => item.referencias_ausentes || []))]
  return {
    ...anchor,
    lote: calculations.length > 1,
    quantidade_parcelas: calculations.length,
    parcelas_ids: calculations.map(item => item.parcela_id),
    parcelas: calculations,
    dias_atraso: Math.max(...calculations.map(item => finiteNumber(item.dias_atraso))),
    valor_base: sum('valor_base'),
    valor_correcao: sum('valor_correcao'),
    valor_corrigido: sum('valor_corrigido'),
    valor_multa: sum('valor_multa'),
    valor_juros_mora: sum('valor_juros_mora'),
    valor_outros_acrescimos: sum('valor_outros_acrescimos'),
    valor_seguro: sum('valor_seguro'),
    valor_desconto: sum('valor_desconto'),
    valor_final: sum('valor_final'),
    referencias_ausentes: missing,
    avisos: warnings,
  }
}

async function calculateReceivableGroup(anchor, tenantId, body = {}) {
  const parcels = await getRecalculationParcels(anchor, tenantId, body)
  const calculations = []
  for (const parcel of parcels) {
    const parcelBody = parcel.id === anchor.id ? body : {
      ...body,
      outros_acrescimos: undefined,
      seguro: undefined,
      desconto: undefined,
    }
    calculations.push(await calculateReceivable(parcel, tenantId, parcelBody))
  }
  return aggregateRecalculations(calculations, anchor.id)
}

async function persistRecalculation(client, calculation, tenantId, userId) {
  const { rows: [updated] } = await client.query(
    `UPDATE com_parcelas
        SET valor_correcao=$1,
            valor_multa=$2,
            valor_juros_mora=$3,
            valor_outros_acrescimos=$4,
            valor_seguro=$5,
            valor_desconto=$6,
            valor_recalculado=$7,
            data_recalculo=$8,
            recalculado_em=NOW(),
            recalculado_por=$9,
            recalculo_dados=$10::jsonb,
            linha_digitavel=NULL,
            codigo_barras=NULL,
            boleto_status=CASE WHEN boleto_status='liquidado' THEN boleto_status ELSE 'recalculado' END,
            updated_at=NOW()
      WHERE id=$11 AND tenant_id=$12
      RETURNING *`,
    [
      calculation.valor_correcao,
      calculation.valor_multa,
      calculation.valor_juros_mora,
      calculation.valor_outros_acrescimos,
      calculation.valor_seguro,
      calculation.valor_desconto,
      calculation.valor_final,
      calculation.data_calculo,
      userId,
      JSON.stringify(calculation),
      calculation.parcela_id,
      tenantId,
    ],
  )
  return updated
}

// PATCH /financeiro/contas-receber/:id/baixar-manual
// Registra a baixa definitiva da parcela e cria a entrada correspondente no Movimento Bancário.
router.patch('/financeiro/contas-receber/:id/baixar-manual', async (req, res) => {
  if (!canWriteFinance(req.user)) {
    return res.status(403).json({
      ok: false,
      message: 'Somente usuários autorizados do grupo financeiro podem registrar baixa manual.',
    })
  }

  const parcelaId = String(req.params.id || '').trim()
  const bancoContaId = Number(req.body?.banco_conta_id)
  const valorRecebido = roundMoney(req.body?.valor_recebido)
  const formaPagamento = String(req.body?.forma_pagamento || '').trim().slice(0, 40)
  const observacoes = String(req.body?.observacoes || '').trim().slice(0, 500)
  let dataRecebimento

  try {
    dataRecebimento = normalizeDateOnly(req.body?.data_recebimento || isoToday(), 'Data do recebimento')
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }

  if (!parcelaId) return res.status(400).json({ ok: false, message: 'Parcela inválida.' })
  if (!Number.isInteger(bancoContaId) || bancoContaId <= 0) {
    return res.status(400).json({ ok: false, message: 'Selecione a conta bancária que recebeu o valor.' })
  }
  if (!Number.isFinite(valorRecebido) || valorRecebido <= 0) {
    return res.status(400).json({ ok: false, message: 'Informe um valor recebido maior que zero.' })
  }
  if (!formaPagamento) {
    return res.status(400).json({ ok: false, message: 'Informe a forma de pagamento.' })
  }

  try {
    const result = await transaction(async client => {
      const { rows: [parcela] } = await client.query(
        `SELECT
            p.id,
            p.numero,
            p.status,
            p.vencimento,
            p.valor_nominal,
            p.valor_recalculado,
            p.valor_correcao,
            p.valor_multa,
            p.valor_juros_mora,
            p.valor_outros_acrescimos,
            p.valor_seguro,
            p.valor_desconto,
            p.movimento_id,
            p.documento_legado,
            p.parcela_numero_legado,
            p.parcela_total_legado,
            p.obra_codigo_legado,
            c.numero AS contrato_numero,
            c.titulo AS contrato_titulo,
            c.obra_codigo_legado AS contrato_obra_codigo,
            r.titulo AS receita_titulo,
            r.numero_documento AS receita_documento,
            pc.codigo AS plano_codigo,
            pc.descricao AS plano_descricao,
            COALESCE(cp.nome, cp.razao_social, c.comprador_nome, 'Cliente não identificado') AS cliente_nome,
            CASE
              WHEN COALESCE(c.obra_codigo_legado, p.obra_codigo_legado) = 7698 THEN 'LUCKY'
              WHEN COALESCE(c.obra_codigo_legado, p.obra_codigo_legado) IN (7700, 7701) THEN 'LARM'
              ELSE NULL
            END AS empresa_cobranca,
            COALESCE(
              obra.nome,
              CASE WHEN unidade.tipo = 'obra' THEN unidade.nome END,
              'Obra ' || COALESCE(p.obra_codigo_legado::text, c.obra_codigo_legado::text, '')
            ) AS obra_nome
           FROM com_parcelas p
           JOIN com_contratos c ON c.id = p.contrato_id
           LEFT JOIN cad_clientes cl ON cl.id = c.cliente_id
           LEFT JOIN cad_pessoas cp ON cp.id = cl.pessoa_id
           LEFT JOIN fin_receitas r ON r.id = p.receita_id
           LEFT JOIN fin_plano_contas pc ON pc.id = r.plano_conta_id
           LEFT JOIN cad_produtos unidade ON unidade.id = p.produto_id
           LEFT JOIN cad_produtos obra ON obra.id = unidade.produto_pai_id
          WHERE p.id = $1 AND p.tenant_id = $2
          FOR UPDATE OF p`,
        [parcelaId, req.user.tenant_id],
      )

      if (!parcela) {
        const error = new Error('Parcela não encontrada.')
        error.statusCode = 404
        throw error
      }
      if (!['aberta', 'atrasada'].includes(String(parcela.status || '').toLowerCase())) {
        const error = new Error('Esta parcela não está em aberto ou já foi baixada.')
        error.statusCode = 409
        throw error
      }
      if (parcela.movimento_id) {
        const error = new Error('Esta parcela já possui um Movimento Bancário vinculado.')
        error.statusCode = 409
        throw error
      }

      const { rows: [banco] } = await client.query(
        `SELECT id, empresa, banco_nome, agencia, conta, digito, ativo
           FROM fin_bancos_contas
          WHERE id = $1
          FOR UPDATE`,
        [bancoContaId],
      )
      if (!banco || banco.ativo === false) {
        const error = new Error('Conta bancária não encontrada ou inativa.')
        error.statusCode = 400
        throw error
      }

      const empresaParcela = String(parcela.empresa_cobranca || '').trim().toUpperCase()
      const empresaBanco = String(banco.empresa || '').trim().toUpperCase()
      if (empresaParcela && empresaBanco && empresaParcela !== empresaBanco) {
        const error = new Error(`A conta selecionada pertence à empresa ${empresaBanco}, mas a parcela pertence à ${empresaParcela}.`)
        error.statusCode = 400
        throw error
      }

      const empresa = empresaParcela || empresaBanco
      if (!empresa) {
        const error = new Error('Não foi possível identificar a empresa da baixa.')
        error.statusCode = 400
        throw error
      }

      const [ano, mes, dia] = dataRecebimento.split('-').map(Number)
      const clienteNome = String(parcela.cliente_nome || 'Cliente não identificado').trim()
      const referencia = String(
        parcela.receita_titulo || parcela.contrato_titulo || parcela.contrato_numero || 'Conta a receber',
      ).trim()
      const parcelaNumero = parcela.parcela_numero_legado || parcela.parcela_total_legado
        ? `${parcela.parcela_numero_legado || parcela.numero || ''}${parcela.parcela_total_legado ? `/${parcela.parcela_total_legado}` : ''}`
        : String(parcela.numero || '')
      const historico = [
        'Baixa manual de conta a receber',
        parcelaNumero ? `parcela ${parcelaNumero}` : null,
        referencia,
        clienteNome,
      ].filter(Boolean).join(' - ')
      const nfDoc = String(
        parcela.receita_documento || parcela.documento_legado || parcela.contrato_numero || '',
      ).trim().slice(0, 100) || null
      const naturezaFinanceira = String(parcela.plano_codigo || '1.1').trim().slice(0, 20) || '1.1'
      const contaContabil = String(parcela.plano_descricao || 'VENDA DE IMÓVEIS').trim()
      const obra = String(parcela.obra_nome || '').trim() || null
      const bancoNome = String(banco.banco_nome || 'Banco não identificado').trim().slice(0, 60)

      const { rows: [movimento] } = await client.query(
        `INSERT INTO fin_movimento
          (data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
           conta_contabil, centro_custo, obra, natureza_financeira,
           dia, mes, ano, tipo_lancamento, vencimento, banco_conta_id)
         VALUES
          ($1, $2, $3, $4, 0, $5, $6, $7,
           $8, $9, $10, $11,
           $12, $13, $14, 'financeiro', $15, $16)
         RETURNING id, data, empresa, banco, entradas, historico, banco_conta_id`,
        [
          dataRecebimento,
          empresa,
          bancoNome,
          valorRecebido,
          clienteNome,
          historico,
          nfDoc,
          contaContabil,
          obra,
          obra,
          naturezaFinanceira,
          dia,
          mes,
          ano,
          parcela.vencimento,
          bancoContaId,
        ],
      )

      const conciliacaoDados = {
        origem: 'baixa_manual_contas_receber',
        movimento_id: movimento.id,
        banco_conta_id: bancoContaId,
        banco: bancoNome,
        empresa,
        valor_recebido: valorRecebido,
        data_recebimento: dataRecebimento,
        forma_pagamento: formaPagamento,
        usuario_id: req.user.id,
        usuario_nome: req.user.name || null,
      }

      const { rows: [parcelaAtualizada] } = await client.query(
        `UPDATE com_parcelas
            SET status = 'paga',
                pago_em = $1::date,
                valor_pago = $2,
                forma_pagamento = $3,
                observacoes_baixa = $4,
                movimento_id = $5,
                origem_baixa = 'manual',
                conciliado_em = NOW(),
                conciliacao_dados = COALESCE(conciliacao_dados, '{}'::jsonb) || $6::jsonb,
                updated_at = NOW()
          WHERE id = $7 AND tenant_id = $8
          RETURNING id, status, pago_em, valor_pago, forma_pagamento, observacoes_baixa,
                    movimento_id, origem_baixa, conciliado_em`,
        [
          dataRecebimento,
          valorRecebido,
          formaPagamento,
          observacoes || null,
          movimento.id,
          JSON.stringify(conciliacaoDados),
          parcelaId,
          req.user.tenant_id,
        ],
      )

      return { parcela: parcelaAtualizada, movimento, clienteNome, empresa, bancoNome }
    })

    await logAudit({
      userId: req.user.id,
      tenantId: req.user.tenant_id,
      action: 'conta_receber_baixa_manual',
      module: 'financeiro',
      entityType: 'com_parcelas',
      entityId: parcelaId,
      meta: {
        valor_recebido: valorRecebido,
        data_recebimento: dataRecebimento,
        forma_pagamento: formaPagamento,
        banco_conta_id: bancoContaId,
        movimento_id: result.movimento.id,
        empresa: result.empresa,
        banco: result.bancoNome,
        cliente: result.clienteNome,
      },
    }).catch(() => {})

    return res.json({
      ok: true,
      message: 'Baixa manual registrada e Movimento Bancário criado com sucesso.',
      data: result,
    })
  } catch (error) {
    logger.error(`Erro ao registrar baixa manual de conta a receber: ${error.message}`)
    return res.status(error.statusCode || 500).json({
      ok: false,
      message: error.statusCode ? error.message : 'Não foi possível registrar a baixa manual.',
    })
  }
})

// POST /financeiro/contas-receber/:id/recalculo/preview
router.post('/financeiro/contas-receber/:id/recalculo/preview', async (req, res) => {
  try {
    const parcel = await getReceivableParcel(req.params.id, req.user.tenant_id)
    if (!parcel) return res.status(404).json({ ok: false, message: 'Parcela não encontrada.' })
    if (!['aberta', 'atrasada'].includes(parcel.status)) {
      return res.status(409).json({ ok: false, message: 'Somente parcelas em aberto podem ser recalculadas.' })
    }
    const calculation = await calculateReceivableGroup(parcel, req.user.tenant_id, req.body || {})
    return res.json({ ok: true, data: calculation })
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }
})

// POST /financeiro/contas-receber/:id/recalcular
router.post('/financeiro/contas-receber/:id/recalcular', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  try {
    const parcel = await getReceivableParcel(req.params.id, req.user.tenant_id)
    if (!parcel) return res.status(404).json({ ok: false, message: 'Parcela não encontrada.' })
    if (!['aberta', 'atrasada'].includes(parcel.status)) {
      return res.status(409).json({ ok: false, message: 'Somente parcelas em aberto podem ser recalculadas.' })
    }
    const calculation = await calculateReceivableGroup(parcel, req.user.tenant_id, req.body || {})
    await transaction(async client => {
      for (const item of calculation.parcelas || [calculation]) {
        await persistRecalculation(client, item, req.user.tenant_id, req.user.id)
      }
    })
    await logAudit({
      userId: req.user.id,
      tenantId: req.user.tenant_id,
      action: calculation.lote ? 'parcelas_receber_recalculadas_lote' : 'parcela_receber_recalculada',
      module: 'recebiveis',
      entityType: 'com_parcelas',
      entityId: parcel.id,
      meta: calculation,
    }).catch(() => {})
    return res.json({ ok: true, data: calculation })
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }
})

// GET /financeiro/contas-receber/bradesco/config
router.get('/financeiro/contas-receber/bradesco/config', async (req, res) => {
  try {
    const requestedCompany = normalizeBillingCompany(req.query?.empresa)
      || billingCompanyFromObra(req.query?.obra_codigo)
      || 'LARM'
    const config = await getBradescoConfig(req.user.tenant_id, null, { empresa: requestedCompany })
    return res.json({ ok: true, data: config, empresa: requestedCompany })
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message })
  }
})

// PUT /financeiro/contas-receber/bradesco/config
router.put('/financeiro/contas-receber/bradesco/config', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  const body = req.body || {}
  const company = normalizeBillingCompany(body.empresa || 'LARM')
  if (!company) return res.status(400).json({ ok: false, message: 'Empresa de cobrança inválida. Use LARM ou LUCKY.' })
  const required = ['beneficiario_nome', 'agencia', 'conta', 'carteira']
  const missing = required.filter(field => !String(body[field] || '').trim())
  if (missing.length) return res.status(400).json({ ok: false, message: `Preencha: ${missing.join(', ')}.` })

  try {
    const { rows: [config] } = await query(
      `INSERT INTO fin_cobranca_bancaria_config (
         tenant_id, empresa, banco_codigo, banco_nome, codigo_empresa,
         beneficiario_nome, beneficiario_documento, agencia, agencia_dv,
         conta, conta_dv, carteira, especie_documento,
         cep, logradouro, numero, complemento, bairro, cidade, uf,
         local_pagamento, instrucoes, multa_percentual_padrao,
         mora_percentual_mes_padrao, homologado, ativo, created_by, updated_by
       ) VALUES (
         $1,$2,'237','BRADESCO',$3,$4,$5,$6,$7,$8,$9,$10,$11,
         $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,TRUE,$24,$24
       )
       ON CONFLICT (tenant_id, banco_codigo, empresa)
       DO UPDATE SET
         codigo_empresa=EXCLUDED.codigo_empresa,
         beneficiario_nome=EXCLUDED.beneficiario_nome,
         beneficiario_documento=EXCLUDED.beneficiario_documento,
         agencia=EXCLUDED.agencia,
         agencia_dv=EXCLUDED.agencia_dv,
         conta=EXCLUDED.conta,
         conta_dv=EXCLUDED.conta_dv,
         carteira=EXCLUDED.carteira,
         especie_documento=EXCLUDED.especie_documento,
         cep=EXCLUDED.cep,
         logradouro=EXCLUDED.logradouro,
         numero=EXCLUDED.numero,
         complemento=EXCLUDED.complemento,
         bairro=EXCLUDED.bairro,
         cidade=EXCLUDED.cidade,
         uf=EXCLUDED.uf,
         local_pagamento=EXCLUDED.local_pagamento,
         instrucoes=EXCLUDED.instrucoes,
         multa_percentual_padrao=EXCLUDED.multa_percentual_padrao,
         mora_percentual_mes_padrao=EXCLUDED.mora_percentual_mes_padrao,
         homologado=EXCLUDED.homologado,
         ativo=TRUE,
         updated_by=EXCLUDED.updated_by,
         updated_at=NOW()
       RETURNING *`,
      [
        req.user.tenant_id,
        company,
        String(body.codigo_empresa || '').trim() || null,
        String(body.beneficiario_nome).trim(),
        onlyDigits(body.beneficiario_documento) || null,
        onlyDigits(body.agencia),
        String(body.agencia_dv || '').trim() || null,
        onlyDigits(body.conta),
        String(body.conta_dv || '').trim() || null,
        onlyDigits(body.carteira),
        onlyDigits(body.especie_documento || '01'),
        onlyDigits(body.cep) || null,
        body.logradouro || null,
        body.numero || null,
        body.complemento || null,
        body.bairro || null,
        body.cidade || null,
        String(body.uf || '').trim().toUpperCase() || null,
        body.local_pagamento || null,
        body.instrucoes || null,
        finiteNumber(body.multa_percentual_padrao, 2),
        finiteNumber(body.mora_percentual_mes_padrao, 1),
        Boolean(body.homologado),
        req.user.id,
      ],
    )
    return res.json({ ok: true, data: config })
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }
})

async function assignOurNumber(client, config, parcel) {
  if (parcel.nosso_numero) {
    const dv = parcel.nosso_numero_dv || nossoNumeroDv(config.carteira, parcel.nosso_numero)
    return { nossoNumero: parcel.nosso_numero, nossoDv: dv, control: parcel.controle_participante }
  }

  let sequence = Number(config.nosso_numero_sequencia || 1)
  let nossoNumero
  for (let attempts = 0; attempts < 100; attempts += 1) {
    nossoNumero = String(sequence).padStart(11, '0').slice(-11)
    const { rowCount } = await client.query(
      `SELECT 1 FROM com_parcelas WHERE tenant_id=$1 AND nosso_numero=$2 LIMIT 1`,
      [parcel.tenant_id || config.tenant_id, nossoNumero],
    )
    if (!rowCount) break
    sequence += 1
  }
  const control = String(parcel.controle_participante || `CR${String(parcel.id).replace(/-/g, '').toUpperCase()}`).slice(0, 25)
  const nossoDv = nossoNumeroDv(config.carteira, nossoNumero)
  await client.query(
    `UPDATE com_parcelas
        SET nosso_numero=$1, nosso_numero_dv=$2, controle_participante=$3, updated_at=NOW()
      WHERE id=$4 AND tenant_id=$5`,
    [nossoNumero, nossoDv, control, parcel.id, config.tenant_id],
  )
  await client.query(
    `UPDATE fin_cobranca_bancaria_config
        SET nosso_numero_sequencia=$1, updated_at=NOW()
      WHERE id=$2`,
    [sequence + 1, config.id],
  )
  config.nosso_numero_sequencia = sequence + 1
  return { nossoNumero, nossoDv, control }
}

function boletoValidationError(message, code, fields = []) {
  const error = new Error(message)
  error.code = code
  error.fields = fields
  return error
}

function validateBradescoConfigForBoleto(config) {
  if (!config) throw boletoValidationError('Configure a cobrança Bradesco antes de gerar boletos.', 'BRADESCO_CONFIG_NOT_FOUND')
  const required = [
    ['beneficiario_nome', 'beneficiário'],
    ['beneficiario_documento', 'CPF/CNPJ do beneficiário'],
    ['agencia', 'agência'],
    ['conta', 'conta'],
    ['carteira', 'carteira'],
  ]
  const missing = required.filter(([field]) => !String(config[field] || '').trim()).map(([, label]) => label)
  if (missing.length) {
    throw boletoValidationError(`Configuração Bradesco incompleta: informe ${missing.join(', ')}.`, 'BRADESCO_CONFIG_INCOMPLETE', missing)
  }
}

function getRecalculationData(parcel) {
  if (parcel?.recalculo_dados && typeof parcel.recalculo_dados === 'object') return parcel.recalculo_dados
  if (typeof parcel?.recalculo_dados === 'string') {
    try { return JSON.parse(parcel.recalculo_dados) } catch { return {} }
  }
  return {}
}

function getSavedRecalculationDate(parcel) {
  const recalculationData = getRecalculationData(parcel)
  const candidates = [
    parcel?.data_recalculo,
    recalculationData?.data_calculo,
    recalculationData?.receber_ate,
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    try { return normalizeDateOnly(candidate, 'Data do recálculo') } catch { /* tenta o próximo valor persistido */ }
  }
  return null
}

function getRequestedRecalculationDate(body = {}) {
  const candidates = [body?.data_recalculo, body?.data_calculo, body?.receber_ate]
  for (const candidate of candidates) {
    if (!candidate) continue
    try { return normalizeDateOnly(candidate, 'Data do recálculo solicitada') } catch { /* tenta o próximo valor */ }
  }
  return null
}

function resolveBillingDueDate(parcel, body = {}) {
  const today = isoToday()
  const originalDueDate = normalizeDateOnly(parcel.vencimento, 'Vencimento')
  if (originalDueDate >= today) {
    return { dueDate: originalDueDate, source: 'vencimento_original' }
  }

  const savedDate = getSavedRecalculationDate(parcel)
  const requestedDate = getRequestedRecalculationDate(body)
  const recalculatedValue = finiteNumber(parcel.valor_recalculado, 0)
  const hasSavedRecalculation = recalculatedValue > 0 && Boolean(parcel.recalculado_em)

  if (savedDate && savedDate >= today && recalculatedValue > 0) {
    return { dueDate: savedDate, source: 'recalculo_salvo' }
  }

  // Fallback seguro para o fluxo imediatamente após salvar o recálculo.
  // O frontend envia a mesma data exibida no cálculo, mas ela só é aceita
  // quando já existe um recálculo persistido para a parcela.
  if (requestedDate && requestedDate >= today && hasSavedRecalculation) {
    return { dueDate: requestedDate, source: 'recalculo_solicitado' }
  }

  // Compatibilidade com registros antigos em que a coluna data_recalculo não
  // foi preenchida, mas o recálculo foi efetivamente salvo no dia atual.
  if (hasSavedRecalculation) {
    try {
      const recalculatedAtDate = normalizeDateOnly(parcel.recalculado_em, 'Data em que o recálculo foi salvo')
      if (recalculatedAtDate >= today) {
        return { dueDate: recalculatedAtDate, source: 'data_salvamento_recalculo' }
      }
    } catch { /* mantém a validação abaixo */ }
  }

  const error = boletoValidationError(
    'Parcela vencida: recalcule para uma data atual ou futura antes de gerar o boleto/remessa.',
    'PARCEL_RECALCULATION_REQUIRED',
    ['data_recalculo', 'valor_recalculado'],
  )
  error.validation = {
    hoje: today,
    vencimento_original: originalDueDate,
    data_recalculo_salva: savedDate,
    data_recalculo_solicitada: requestedDate,
    valor_recalculado: recalculatedValue,
    recalculado_em: parcel.recalculado_em || null,
    boleto_status: parcel.boleto_status || null,
  }
  throw error
}

function validateParcelForBilling(parcel, body = {}) {
  if (!['aberta', 'atrasada'].includes(parcel.status)) {
    throw boletoValidationError('A parcela não está em aberto.', 'PARCEL_NOT_OPEN')
  }

  const billingDate = resolveBillingDueDate(parcel, body)

  const missingCustomer = []
  if (!String(parcel.cliente_nome || '').trim()) missingCustomer.push('nome do cliente')
  if (!onlyDigits(parcel.cliente_documento)) missingCustomer.push('CPF/CNPJ do cliente')
  if (!onlyDigits(parcel.cliente_cep)) missingCustomer.push('CEP do cliente')
  if (!String(parcel.cliente_logradouro || '').trim()) missingCustomer.push('endereço do cliente')
  if (missingCustomer.length) {
    throw boletoValidationError(
      `Não foi possível gerar o boleto. Complete no cadastro do cliente: ${missingCustomer.join(', ')}.`,
      'CUSTOMER_BILLING_DATA_INCOMPLETE',
      missingCustomer,
    )
  }

  return billingDate
}

function parcelForBank(parcel, assigned, billingDueDate = null) {
  const due = billingDueDate || normalizeDateOnly(parcel.vencimento, 'Vencimento')
  const recalculatedValue = Number(parcel.valor_recalculado)
  const billingAmount = Number.isFinite(recalculatedValue) && recalculatedValue > 0
    ? recalculatedValue
    : finiteNumber(parcel.valor_total)
  return {
    ...parcel,
    tenant_id: parcel.tenant_id,
    nosso_numero: assigned.nossoNumero,
    nosso_numero_dv: assigned.nossoDv,
    controle_participante: assigned.control,
    vencimento_boleto: due,
    documento: parcel.receita_documento || parcel.documento_legado || parcel.contrato_numero || String(parcel.id).slice(0, 10),
    valor_total: billingAmount,
    mora_dia: roundMoney(billingAmount * finiteNumber(parcel.recalculo_dados?.percentual_mora_mes, 0) / 100 / 30),
    multa_percentual: finiteNumber(parcel.recalculo_dados?.percentual_multa, 0),
  }
}


function extractHtmlPart(html, tag) {
  const match = String(html || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match?.[1] || ''
}

function buildBoletoBundleHtml(entries, title = 'Boletos Bradesco') {
  const firstHtml = entries[0]?.html || ''
  const style = extractHtmlPart(firstHtml, 'style')
  const pages = entries.map((entry, index) => {
    let body = extractHtmlPart(entry.html, 'body') || entry.html
    body = body.replace(/<div class="actions">[\s\S]*?<\/div>/i, '')
    return `<section class="boleto-page" data-parcela="${entry.parcel.id}">${body}</section>${index < entries.length - 1 ? '<div class="page-break"></div>' : ''}`
  }).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>${style}\n.page-break{break-after:page;page-break-after:always}.boleto-page{position:relative}@media print{.page-break{display:block}}</style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Salvar PDF</button><button onclick="window.close()">Fechar</button></div>${pages}</body></html>`
}

async function prepareBoletoEntries(client, tenantId, parcelIds, body = {}) {
  const { rows } = await client.query(
    `${CONTAS_RECEBER_SELECT}
      WHERE p.tenant_id=$1 AND p.id = ANY($2::uuid[])
      ORDER BY p.vencimento, p.id
      FOR UPDATE OF p`,
    [tenantId, parcelIds],
  )
  if (rows.length !== parcelIds.length) throw new Error('Uma ou mais parcelas selecionadas não foram localizadas.')

  const configCache = new Map()
  const entries = []
  for (const parcel of rows) {
    const company = billingCompanyForParcel(parcel)
    if (!company) throw new Error(`A parcela ${parcel.documento_legado || parcel.id} não possui empresa de cobrança.`)
    let config = configCache.get(company)
    if (!config) {
      config = await getBradescoConfig(tenantId, client, { forUpdate: true, empresa: company })
      if (!config) throw new Error(`Configure a cobrança Bradesco da empresa ${company} antes de gerar o boleto.`)
      validateBradescoConfigForBoleto(config)
      configCache.set(company, config)
    }
    parcel.tenant_id = tenantId
    const billingDate = validateParcelForBilling(parcel, body)
    const assigned = await assignOurNumber(client, config, parcel)
    const bankParcel = parcelForBank(parcel, assigned, billingDate.dueDate)
    const boleto = buildBoletoData(config, bankParcel)
    const html = buildBoletoHtml(config, bankParcel)
    await client.query(
      `UPDATE com_parcelas
          SET linha_digitavel=$1,
              codigo_barras=$2,
              boleto_status='emitido',
              boleto_emitido_em=NOW(),
              updated_at=NOW()
        WHERE id=$3::uuid AND tenant_id=$4::uuid`,
      [boleto.digitableLine, boleto.barcode, parcel.id, tenantId],
    )
    entries.push({ parcel: bankParcel, boleto, html, config, company })
  }
  return entries
}

async function getTenantSesConfig(tenantId) {
  const { rows: [cfg] } = await query(
    `SELECT ses_region,ses_access_key_id,ses_secret_access_key,ses_from_email,ses_from_name
       FROM hub_tenant_configs WHERE tenant_id=$1`,
    [tenantId],
  )
  if (!cfg?.ses_access_key_id || !cfg?.ses_secret_access_key || !cfg?.ses_from_email) {
    throw new Error('AWS SES não está configurado para este tenant.')
  }
  return cfg
}

function mimeBase64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n')
}

async function sendBoletoRawEmail(sesConfig, recipient, customerName, entries) {
  const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses')
  const client = new SESClient({
    region: sesConfig.ses_region || 'us-east-1',
    credentials: { accessKeyId: sesConfig.ses_access_key_id, secretAccessKey: sesConfig.ses_secret_access_key },
  })
  const boundary = `----LarmHub${Date.now()}${Math.random().toString(16).slice(2)}`
  const attachment = buildBoletoBundleHtml(entries, `Boletos de ${customerName || recipient}`)
  const total = roundMoney(entries.reduce((sum, entry) => sum + finiteNumber(entry.parcel.valor_total), 0))
  const subject = `Boletos — ${customerName || recipient}`
  const htmlBody = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2>Boletos disponíveis</h2><p>Olá, <strong>${String(customerName || '').replace(/[<>]/g, '')}</strong>.</p><p>Encaminhamos ${entries.length} boleto(s), totalizando <strong>R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong>.</p><ul>${entries.map(entry => `<li>Vencimento ${normalizeDateOnly(entry.parcel.vencimento_boleto,'Vencimento')} — R$ ${finiteNumber(entry.parcel.valor_total).toLocaleString('pt-BR',{minimumFractionDigits:2})}<br><small>${entry.boleto.digitableLine}</small></li>`).join('')}</ul><p>O arquivo HTML anexado pode ser aberto no navegador e salvo em PDF.</p></div>`
  const fromName = sesConfig.ses_from_name || 'LarmHub'
  const raw = [
    `From: ${fromName} <${sesConfig.ses_from_email}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    mimeBase64(htmlBody),
    `--${boundary}`,
    'Content-Type: text/html; name="boletos.html"',
    'Content-Disposition: attachment; filename="boletos.html"',
    'Content-Transfer-Encoding: base64',
    '',
    mimeBase64(attachment),
    `--${boundary}--`,
    '',
  ].join('\r\n')
  const result = await client.send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(raw, 'utf8') } }))
  return result.MessageId || null
}

async function recordBoletoDelivery({ tenantId, parcelId, channel, recipient, status, userId, providerMessageId = null, error = null, data = {} }) {
  await query(
    `WITH params AS (
       SELECT
         $1::uuid AS tenant_id,
         $2::uuid AS parcela_id,
         $3::varchar(20) AS canal,
         $4::varchar(180) AS destinatario,
         $5::varchar(30) AS status,
         $6::varchar(180) AS provider_message_id,
         $7::text AS erro,
         COALESCE($8::jsonb, '{}'::jsonb) AS dados,
         $9::uuid AS enviado_por
     )
     INSERT INTO fin_boletos_envios (
       tenant_id,parcela_id,canal,destinatario,status,provider_message_id,erro,dados,enviado_por,enviado_em
     )
     SELECT
       tenant_id,parcela_id,canal,destinatario,status,provider_message_id,erro,dados,enviado_por,
       CASE WHEN status='enviado'::varchar(30) THEN NOW() ELSE NULL END
     FROM params`,
    [tenantId, parcelId, channel, recipient || null, status, providerMessageId, error, JSON.stringify(data || {}), userId],
  )
  await query(
    `WITH params AS (
       SELECT
         $1::uuid AS parcela_id,
         $2::varchar(20) AS canal,
         $3::varchar(30) AS status,
         $4::text AS erro,
         $5::uuid AS tenant_id
     )
     UPDATE com_parcelas AS p
        SET boleto_status=CASE WHEN params.status='enviado'::varchar(30) THEN 'enviado'::varchar(30) ELSE p.boleto_status END,
            boleto_enviado_em=CASE WHEN params.status='enviado'::varchar(30) THEN NOW() ELSE p.boleto_enviado_em END,
            boleto_envio_canal=params.canal,
            boleto_envio_status=params.status,
            boleto_envio_erro=params.erro,
            updated_at=NOW()
       FROM params
      WHERE p.id=params.parcela_id AND p.tenant_id=params.tenant_id`,
    [parcelId, channel, status, error, tenantId],
  )
}

// POST /financeiro/contas-receber/:id/bradesco/boleto
router.post('/financeiro/contas-receber/:id/bradesco/boleto', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  try {
    const result = await transaction(async client => {
      const parcel = await getReceivableParcel(req.params.id, req.user.tenant_id, client, { forUpdate: true })
      if (!parcel) throw new Error('Parcela não encontrada.')
      const company = billingCompanyForParcel(parcel)
      if (!company) {
        throw boletoValidationError(
          `A obra ${parcel.obra_codigo_legado || parcel.contrato_obra_codigo || 'não informada'} não possui empresa de cobrança configurada.`,
          'RECEIVABLE_COMPANY_NOT_MAPPED',
          ['obra_codigo_legado'],
        )
      }
      const config = await getBradescoConfig(req.user.tenant_id, client, { forUpdate: true, empresa: company })
      if (!config) {
        throw boletoValidationError(
          `Configure a cobrança Bradesco da empresa ${company} antes de gerar o boleto.`,
          'BRADESCO_CONFIG_NOT_FOUND_FOR_COMPANY',
          ['empresa'],
        )
      }
      validateBradescoConfigForBoleto(config)
      parcel.tenant_id = req.user.tenant_id
      const billingDate = validateParcelForBilling(parcel, req.body || {})
      const assigned = await assignOurNumber(client, config, parcel)
      const bankParcel = parcelForBank(parcel, assigned, billingDate.dueDate)
      const boleto = buildBoletoData(config, bankParcel)
      const html = buildBoletoHtml(config, bankParcel)
      await client.query(
        `UPDATE com_parcelas
            SET linha_digitavel=$1,
                codigo_barras=$2,
                boleto_status='emitido',
                boleto_emitido_em=NOW(),
                updated_at=NOW()
          WHERE id=$3::uuid AND tenant_id=$4::uuid`,
        [boleto.digitableLine, boleto.barcode, parcel.id, req.user.tenant_id],
      )
      return { html, boleto, homologado: config.homologado, empresa: company }
    })
    return res.json({ ok: true, data: result })
  } catch (error) {
    logger.warn('Falha ao gerar boleto Bradesco', {
      tenant_id: req.user?.tenant_id,
      parcela_id: req.params.id,
      code: error.code || 'BOLETO_GENERATION_FAILED',
      message: error.message,
      validation: error.validation || undefined,
    })
    return res.status(400).json({
      ok: false,
      code: error.code || 'BOLETO_GENERATION_FAILED',
      message: error.message,
      fields: Array.isArray(error.fields) ? error.fields : [],
      validation: error.validation || undefined,
    })
  }
})


// POST /financeiro/contas-receber/bradesco/boletos — impressão em lote
router.post('/financeiro/contas-receber/bradesco/boletos', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  const ids = Array.from(new Set(Array.isArray(req.body?.parcela_ids) ? req.body.parcela_ids.filter(Boolean) : []))
  if (!ids.length) return res.status(400).json({ ok: false, message: 'Selecione ao menos uma parcela.' })
  try {
    const entries = await transaction(client => prepareBoletoEntries(client, req.user.tenant_id, ids, req.body || {}))
    return res.json({
      ok: true,
      data: {
        html: buildBoletoBundleHtml(entries),
        quantidade: entries.length,
        empresas: [...new Set(entries.map(entry => entry.company))],
        homologacao: entries.some(entry => !entry.config.homologado),
      },
    })
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message, code: error.code || 'BOLETO_BATCH_FAILED' })
  }
})

// POST /financeiro/contas-receber/bradesco/enviar-email
router.post('/financeiro/contas-receber/bradesco/enviar-email', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  const ids = Array.from(new Set(Array.isArray(req.body?.parcela_ids) ? req.body.parcela_ids.filter(Boolean) : []))
  if (!ids.length) return res.status(400).json({ ok: false, message: 'Selecione ao menos uma parcela.' })
  try {
    const entries = await transaction(client => prepareBoletoEntries(client, req.user.tenant_id, ids, req.body || {}))
    const sesConfig = await getTenantSesConfig(req.user.tenant_id)
    const groups = new Map()
    for (const entry of entries) {
      const email = String(entry.parcel.cliente_email || '').trim().toLowerCase()
      const key = email || `sem-email:${entry.parcel.id}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }

    let sent = 0
    const failures = []
    for (const [email, group] of groups.entries()) {
      if (email.startsWith('sem-email:')) {
        for (const entry of group) {
          const message = `Cliente ${entry.parcel.cliente_nome || ''} sem e-mail cadastrado.`
          failures.push({ parcela_id: entry.parcel.id, cliente: entry.parcel.cliente_nome, message })
          await recordBoletoDelivery({ tenantId: req.user.tenant_id, parcelId: entry.parcel.id, channel: 'email', recipient: null, status: 'erro', userId: req.user.id, error: message })
        }
        continue
      }
      try {
        const messageId = await sendBoletoRawEmail(sesConfig, email, group[0].parcel.cliente_nome, group)
        for (const entry of group) {
          sent += 1
          await recordBoletoDelivery({ tenantId: req.user.tenant_id, parcelId: entry.parcel.id, channel: 'email', recipient: email, status: 'enviado', userId: req.user.id, providerMessageId: messageId, data: { quantidade_grupo: group.length } })
        }
      } catch (error) {
        for (const entry of group) {
          failures.push({ parcela_id: entry.parcel.id, cliente: entry.parcel.cliente_nome, message: error.message })
          await recordBoletoDelivery({ tenantId: req.user.tenant_id, parcelId: entry.parcel.id, channel: 'email', recipient: email, status: 'erro', userId: req.user.id, error: error.message })
        }
      }
    }
    return res.status(sent ? 200 : 400).json({ ok: sent > 0, data: { enviados: sent, erros: failures.length, falhas: failures } })
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }
})

// POST /financeiro/contas-receber/bradesco/whatsapp — prepara links; confirmação real depende de API oficial.
router.post('/financeiro/contas-receber/bradesco/whatsapp', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  const ids = Array.from(new Set(Array.isArray(req.body?.parcela_ids) ? req.body.parcela_ids.filter(Boolean) : []))
  if (!ids.length) return res.status(400).json({ ok: false, message: 'Selecione ao menos uma parcela.' })
  try {
    const entries = await transaction(client => prepareBoletoEntries(client, req.user.tenant_id, ids, req.body || {}))
    const groups = new Map()
    for (const entry of entries) {
      const phone = onlyDigits(entry.parcel.cliente_telefone)
      const key = phone || `sem-telefone:${entry.parcel.id}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(entry)
    }
    const links = []
    const failures = []
    for (const [phone, group] of groups.entries()) {
      if (phone.startsWith('sem-telefone:')) {
        for (const entry of group) {
          const message = `Cliente ${entry.parcel.cliente_nome || ''} sem telefone cadastrado.`
          failures.push({ parcela_id: entry.parcel.id, cliente: entry.parcel.cliente_nome, message })
          await recordBoletoDelivery({ tenantId: req.user.tenant_id, parcelId: entry.parcel.id, channel: 'whatsapp', recipient: null, status: 'erro', userId: req.user.id, error: message })
        }
        continue
      }
      const normalizedPhone = phone.startsWith('55') ? phone : `55${phone}`
      const total = roundMoney(group.reduce((sum, entry) => sum + finiteNumber(entry.parcel.valor_total), 0))
      const lines = group.map((entry, index) => `${index + 1}. Venc. ${normalizeDateOnly(entry.parcel.vencimento_boleto,'Vencimento')} — R$ ${finiteNumber(entry.parcel.valor_total).toLocaleString('pt-BR',{minimumFractionDigits:2})}\nLinha digitável: ${entry.boleto.digitableLine}`)
      const message = `Olá, ${group[0].parcel.cliente_nome || ''}. Seguem ${group.length} boleto(s), total R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}.\n\n${lines.join('\n\n')}`
      links.push({ telefone: normalizedPhone, cliente: group[0].parcel.cliente_nome, parcelas: group.map(entry => entry.parcel.id), url: `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}` })
      for (const entry of group) {
        await recordBoletoDelivery({ tenantId: req.user.tenant_id, parcelId: entry.parcel.id, channel: 'whatsapp', recipient: normalizedPhone, status: 'preparado', userId: req.user.id, data: { observacao: 'Link preparado. Sem confirmação de entrega porque não há API oficial configurada.' } })
      }
    }
    return res.json({ ok: true, data: { links, preparados: links.reduce((sum, item) => sum + item.parcelas.length, 0), erros: failures.length, falhas: failures } })
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }
})

// POST /financeiro/contas-receber/bradesco/remessa
router.post('/financeiro/contas-receber/bradesco/remessa', async (req, res) => {
  if (!ensureAdmin(req, res)) return
  const ids = Array.from(new Set(Array.isArray(req.body?.parcela_ids) ? req.body.parcela_ids.filter(Boolean) : []))
  if (!ids.length) return res.status(400).json({ ok: false, message: 'Selecione ao menos uma parcela.' })

  try {
    const result = await transaction(async client => {
      const { rows } = await client.query(
        `${CONTAS_RECEBER_SELECT}
          WHERE p.tenant_id=$1 AND p.id = ANY($2::uuid[])
          ORDER BY p.vencimento, p.id
          FOR UPDATE OF p`,
        [req.user.tenant_id, ids],
      )
      if (rows.length !== ids.length) throw new Error('Uma ou mais parcelas selecionadas não foram localizadas.')

      const companies = new Set(rows.map(billingCompanyForParcel).filter(Boolean))
      if (companies.size !== 1 || rows.some(parcel => !billingCompanyForParcel(parcel))) {
        throw new Error('As parcelas selecionadas precisam pertencer à mesma empresa de cobrança. Separe a remessa por obra/empresa.')
      }
      const [company] = companies
      const config = await getBradescoConfig(req.user.tenant_id, client, { forUpdate: true, empresa: company })
      if (!config) throw new Error(`Configure a cobrança Bradesco da empresa ${company} antes de gerar a remessa.`)
      if (!config.codigo_empresa) throw new Error(`Informe o código da empresa ${company} no Bradesco.`)

      const bankItems = []
      for (const parcel of rows) {
        parcel.tenant_id = req.user.tenant_id
        const billingDate = validateParcelForBilling(parcel)
        const assigned = await assignOurNumber(client, config, parcel)
        bankItems.push(parcelForBank(parcel, assigned, billingDate.dueDate))
      }

      const remittanceNumber = Number(config.remessa_sequencia || 1)
      const generated = buildRemittance(config, bankItems, remittanceNumber, new Date())
      const crypto = require('crypto')
      const hash = crypto.createHash('sha256').update(generated.content, 'latin1').digest('hex')
      const total = roundMoney(bankItems.reduce((sum, item) => sum + finiteNumber(item.valor_total), 0))
      const { rows: [batch] } = await client.query(
        `INSERT INTO fin_remessas_cobranca (
           tenant_id, config_id, banco_codigo, numero, nome_arquivo, status,
           homologacao, quantidade_titulos, valor_total, sha256, conteudo, gerada_por
         ) VALUES ($1,$2,'237',$3,$4,'gerada',$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [req.user.tenant_id, config.id, remittanceNumber, generated.filename, !config.homologado, bankItems.length, total, hash, generated.content, req.user.id],
      )
      for (const item of bankItems) {
        await client.query(
          `INSERT INTO fin_remessas_cobranca_itens (
             remessa_id, tenant_id, parcela_id, nosso_numero, nosso_numero_dv,
             controle_participante, valor, vencimento
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [batch.id, req.user.tenant_id, item.id, item.nosso_numero, item.nosso_numero_dv, item.controle_participante, item.valor_total, item.vencimento_boleto],
        )
        await client.query(
          `UPDATE com_parcelas
              SET boleto_status='remessa_gerada',
                  updated_at=NOW()
            WHERE id=$1::uuid`,
          [item.id],
        )
      }
      await client.query(
        `UPDATE fin_cobranca_bancaria_config SET remessa_sequencia=$1, updated_at=NOW() WHERE id=$2`,
        [remittanceNumber + 1, config.id],
      )
      return { ...generated, total, batchId: batch.id, empresa: company }
    })

    res.setHeader('Content-Type', 'text/plain; charset=ISO-8859-1')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    res.setHeader('X-Remessa-Id', result.batchId)
    return res.send(Buffer.from(result.content, 'latin1'))
  } catch (error) {
    return res.status(400).json({ ok: false, message: error.message })
  }
})

// POST /financeiro/contas-receber/bradesco/retorno
router.post('/financeiro/contas-receber/bradesco/retorno', async (req, res) => {
  if (!canWriteFinance(req.user)) {
    return res.status(403).json({
      ok: false,
      message: 'Somente usuários autorizados do grupo financeiro podem processar retornos bancários.',
    })
  }

  const filename = String(req.body?.filename || 'retorno.ret').slice(0, 160)
  const content = String(req.body?.content || '')
  const applyPayment = req.body?.baixar_liquidacoes !== false
  const explicitCompany = normalizeBillingCompany(req.body?.empresa)
  if (!content) return res.status(400).json({ ok: false, message: 'Arquivo de retorno vazio.' })

  try {
    const result = await transaction(async client => processBradescoReturn({
      client,
      tenantId: req.user.tenant_id,
      userId: req.user.id,
      filename,
      content,
      applyPayment,
      persist: applyPayment,
      explicitCompany,
    }))

    if (!result.duplicated && applyPayment) {
      await logAudit({
        userId: req.user.id,
        tenantId: req.user.tenant_id,
        action: 'contas_receber_retorno_bradesco',
        module: 'financeiro',
        entityType: 'fin_retornos_cobranca',
        entityId: result.id,
        meta: {
          arquivo: filename,
          empresa: result.empresa,
          conciliados: result.conciliados,
          nao_localizados: result.nao_localizados,
          liquidacoes_baixadas: result.liquidacoes_baixadas,
          ja_baixadas: result.ja_baixadas,
          movimentos_criados: result.movimentos_criados,
          valor_baixado: result.valor_baixado,
        },
      }).catch(() => {})
    }

    if (result.duplicated) {
      return res.json({
        ok: true,
        duplicated: true,
        message: 'Este retorno já foi processado. Nenhuma baixa foi duplicada.',
        data: result,
      })
    }

    return res.json({
      ok: true,
      preview: !applyPayment,
      message: applyPayment
        ? 'Retorno processado e baixas elegíveis registradas.'
        : 'Prévia concluída. Nenhum registro foi alterado.',
      data: result,
    })
  } catch (error) {
    logger.error(`Erro ao processar retorno Bradesco ${filename}: ${error.message}`)
    return res.status(400).json({ ok: false, message: error.message })
  }
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
