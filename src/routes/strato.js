/**
 * src/routes/strato.js
 *
 * Rotas que consultam as tabelas Strato migradas para PostgreSQL.
 * Colunas mapeadas via information_schema (schema real confirmado).
 *
 * Tabelas e seus papéis reais:
 *   ts1_vend  — VENDAS / Contratos de venda    (1.057 registros)
 *   ts1_bole  — BOLETOS gerados                (34.833 registros)
 *   ts1_core  — Parcelas / Cobranças           (77.259 registros)
 *   tb2_pess  — Pessoas / Clientes             (1.152  registros)
 *   ts1_conv  — Índice de correção monetária   (63.802 registros)
 *   ts1_logo  — Log de operações               (69.629 registros)
 *
 * Status boleto: pago = bole1_cor_dtpgto IS NOT NULL
 *                cancelado = bole1_dat_can IS NOT NULL
 *                vencido = bole1_cor_dtvenc < TODAY AND não pago/cancelado
 */

const express          = require('express')
const { query }        = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

// ─── GET /strato/schema ───────────────────────────────────────────────────────
router.get('/schema', async (req, res) => {
  const tables = ['ts1_vend','ts1_bole','ts1_core','tb2_pess','ts1_conv','ts1_logo','ts1_situ','ts1_univ']
  const schema = {}
  for (const t of tables) {
    try {
      const { rows } = await query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = $1 ORDER BY ordinal_position`, [t]
      )
      schema[t] = rows
    } catch { schema[t] = [] }
  }
  return res.json({ ok: true, data: schema })
})

// ─── GET /strato/situacoes ────────────────────────────────────────────────────
router.get('/situacoes', async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM ts1_situ ORDER BY situ1_cod`)
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /strato/dashboard ────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const results = {}

  // 1. Vendas / Contratos
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*)                                            AS total_vendas,
        COUNT(*) FILTER (WHERE vend1_dat_can IS NULL)      AS vendas_ativas,
        COUNT(*) FILTER (WHERE vend1_dat_can IS NOT NULL)  AS vendas_canceladas,
        COALESCE(SUM(vend1_val_ven), 0)                   AS valor_total_vendas,
        COALESCE(SUM(vend1_val_ven) FILTER (WHERE vend1_dat_can IS NULL), 0) AS valor_vendas_ativas,
        COALESCE(AVG(vend1_val_ven) FILTER (WHERE vend1_dat_can IS NULL), 0) AS ticket_medio
      FROM ts1_vend
    `)
    results.vendas = rows[0]
  } catch (err) { results.vendas = { error: err.message } }

  // 2. Boletos
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*)                                                    AS total_boletos,
        COUNT(*) FILTER (WHERE bole1_cor_dtpgto IS NOT NULL)       AS boletos_pagos,
        COUNT(*) FILTER (WHERE bole1_cor_dtpgto IS NULL AND bole1_dat_can IS NULL) AS boletos_em_aberto,
        COUNT(*) FILTER (WHERE bole1_cor_dtpgto IS NULL AND bole1_dat_can IS NULL AND bole1_cor_dtvenc < CURRENT_DATE) AS boletos_vencidos,
        COUNT(*) FILTER (WHERE bole1_dat_can IS NOT NULL)          AS boletos_cancelados,
        COALESCE(SUM(bole1_cor_valor) FILTER (WHERE bole1_cor_dtpgto IS NOT NULL), 0) AS valor_recebido,
        COALESCE(SUM(bole1_cor_valor) FILTER (WHERE bole1_cor_dtpgto IS NULL AND bole1_dat_can IS NULL), 0) AS valor_em_aberto,
        COALESCE(SUM(bole1_cor_valor) FILTER (WHERE bole1_cor_dtpgto IS NULL AND bole1_dat_can IS NULL AND bole1_cor_dtvenc < CURRENT_DATE), 0) AS valor_vencido
      FROM ts1_bole
    `)
    results.boletos = rows[0]
  } catch (err) { results.boletos = { error: err.message } }

  // 3. Clientes
  try {
    const { rows } = await query(`
      SELECT
        COUNT(*)                                          AS total_clientes,
        COUNT(*) FILTER (WHERE pess2_pes_fis = 'S')     AS pessoas_fisicas,
        COUNT(*) FILTER (WHERE pess2_pes_fis != 'S' OR pess2_pes_fis IS NULL) AS pessoas_juridicas
      FROM tb2_pess
    `)
    results.clientes = rows[0]
  } catch (err) { results.clientes = { error: err.message } }

  // 4. Receita mensal — últimos 12 meses (boletos pagos)
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', bole1_cor_dtpgto), 'YYYY-MM') AS mes,
        COUNT(*)                                                    AS qtd_boletos,
        COALESCE(SUM(bole1_cor_valor), 0)                         AS valor_recebido
      FROM ts1_bole
      WHERE bole1_cor_dtpgto IS NOT NULL
        AND bole1_cor_dtpgto >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', bole1_cor_dtpgto)
      ORDER BY mes ASC
    `)
    results.receita_mensal = rows
  } catch { results.receita_mensal = [] }

  // 5. Vendas por mês — últimos 12 meses
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', vend1_dat_ven), 'YYYY-MM') AS mes,
        COUNT(*)                                                AS qtd_vendas,
        COALESCE(SUM(vend1_val_ven), 0)                       AS valor_total
      FROM ts1_vend
      WHERE vend1_dat_ven  >= CURRENT_DATE - INTERVAL '12 months'
        AND vend1_dat_can  IS NULL
      GROUP BY DATE_TRUNC('month', vend1_dat_ven)
      ORDER BY mes ASC
    `)
    results.vendas_por_mes = rows
  } catch { results.vendas_por_mes = [] }

  // 6. Vendas recentes (últimas 8)
  try {
    const { rows } = await query(`
      SELECT
        v.vend1_cod,
        v.vend1_dat_ven,
        v.vend1_val_ven,
        v.vend1_val_sal,
        v.situ1_cod,
        v.univ1_cod,
        p.pess2_nom     AS cliente,
        p.pess2_tel_cel AS telefone,
        p.pess2_email   AS email,
        p.pess2_wts     AS whatsapp
      FROM ts1_vend v
      LEFT JOIN tb2_pess p ON p.pess2_cod = v.pess2_cod
      WHERE v.vend1_dat_can IS NULL
      ORDER BY v.vend1_dat_ven DESC NULLS LAST
      LIMIT 8
    `)
    results.vendas_recentes = rows
  } catch { results.vendas_recentes = [] }

  return res.json({ ok: true, data: results })
})

// ─── GET /strato/vendas ───────────────────────────────────────────────────────
router.get('/vendas', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'))
  const limit  = Math.min(100, parseInt(req.query.limit || '20'))
  const offset = (page - 1) * limit
  const busca  = req.query.busca || ''
  const status = req.query.status

  const conditions = []
  const params     = []

  if (busca) {
    params.push(`%${busca}%`)
    conditions.push(`(p.pess2_nom ILIKE $${params.length} OR v.vend1_cod::text ILIKE $${params.length})`)
  }
  if (status === 'ativo')     conditions.push(`v.vend1_dat_can IS NULL`)
  if (status === 'cancelado') conditions.push(`v.vend1_dat_can IS NOT NULL`)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    params.push(limit, offset)
    const { rows } = await query(`
      SELECT
        v.vend1_cod,
        v.vend1_dat_ven,
        v.vend1_dat_can,
        v.vend1_val_ven,
        v.vend1_val_ent,
        v.vend1_val_fin,
        v.vend1_val_sal,
        v.situ1_cod,
        v.univ1_cod,
        v.obra2_cod,
        p.pess2_nom     AS cliente,
        p.pess2_tel_cel AS telefone,
        p.pess2_email   AS email,
        p.pess2_wts     AS whatsapp,
        pc.pess2_nom    AS corretor
      FROM ts1_vend v
      LEFT JOIN tb2_pess p  ON p.pess2_cod = v.pess2_cod
      LEFT JOIN tb2_pess pc ON pc.pess2_cod = v.pess2_cod_cor
      ${where}
      ORDER BY v.vend1_dat_ven DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)

    const countParams = params.slice(0, params.length - 2)
    const { rows: ct } = await query(
      `SELECT COUNT(*) FROM ts1_vend v LEFT JOIN tb2_pess p ON p.pess2_cod = v.pess2_cod ${where}`,
      countParams
    )

    return res.json({
      ok: true,
      data: rows,
      pagination: { page, limit, total: parseInt(ct[0].count), pages: Math.ceil(ct[0].count / limit) },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /strato/boletos ──────────────────────────────────────────────────────
router.get('/boletos', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'))
  const limit  = Math.min(200, parseInt(req.query.limit || '30'))
  const offset = (page - 1) * limit
  const status = req.query.status // pago | aberto | vencido | cancelado
  const busca  = req.query.busca || ''

  const conditions = []
  const params     = []

  if (status === 'pago')      conditions.push(`b.bole1_cor_dtpgto IS NOT NULL`)
  if (status === 'cancelado') conditions.push(`b.bole1_dat_can IS NOT NULL`)
  if (status === 'aberto')    conditions.push(`b.bole1_cor_dtpgto IS NULL AND b.bole1_dat_can IS NULL`)
  if (status === 'vencido')   conditions.push(`b.bole1_cor_dtpgto IS NULL AND b.bole1_dat_can IS NULL AND b.bole1_cor_dtvenc < CURRENT_DATE`)

  if (busca) {
    params.push(`%${busca}%`)
    conditions.push(`(b.bole1_cli_nmclie ILIKE $${params.length} OR b.bole1_cli_cpfcli ILIKE $${params.length})`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)

  try {
    const { rows } = await query(`
      SELECT
        b.bole1_cod,
        b.bole1_cor_dtvenc   AS vencimento,
        b.bole1_cor_dtpgto   AS data_pagamento,
        b.bole1_dat_emi      AS emissao,
        b.bole1_dat_can      AS cancelamento,
        b.bole1_cor_valor    AS valor,
        b.bole1_cor_vljuro   AS juros,
        b.bole1_cor_vlmult   AS multa,
        b.bole1_cor_nrapar   AS num_parcela,
        b.bole1_cli_nmclie   AS cliente,
        b.bole1_cli_cpfcli   AS cpf,
        b.bole1_cli_email    AS email,
        b.bole1_cor_codbar   AS codigo_barras,
        b.bole1_cont1_cod    AS contrato_cod,
        CASE
          WHEN b.bole1_dat_can    IS NOT NULL THEN 'cancelado'
          WHEN b.bole1_cor_dtpgto IS NOT NULL THEN 'pago'
          WHEN b.bole1_cor_dtvenc < CURRENT_DATE THEN 'vencido'
          ELSE 'em_aberto'
        END AS status
      FROM ts1_bole b
      ${where}
      ORDER BY b.bole1_cor_dtvenc DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)

    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /strato/inadimplencia ────────────────────────────────────────────────
router.get('/inadimplencia', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        bole1_cli_nmclie                    AS cliente,
        bole1_cli_cpfcli                    AS cpf,
        bole1_cli_email                     AS email,
        bole1_cont1_cod                     AS contrato,
        COUNT(bole1_cod)                    AS boletos_vencidos,
        COALESCE(SUM(bole1_cor_valor), 0)  AS valor_total_vencido,
        MIN(bole1_cor_dtvenc)              AS vencimento_mais_antigo,
        MAX(bole1_cor_dtvenc)              AS vencimento_mais_recente,
        CURRENT_DATE - MIN(bole1_cor_dtvenc) AS dias_em_atraso
      FROM ts1_bole
      WHERE bole1_cor_dtpgto IS NULL
        AND bole1_dat_can    IS NULL
        AND bole1_cor_dtvenc < CURRENT_DATE
        AND bole1_cli_nmclie IS NOT NULL
      GROUP BY bole1_cli_nmclie, bole1_cli_cpfcli, bole1_cli_email, bole1_cont1_cod
      ORDER BY valor_total_vencido DESC
      LIMIT 100
    `)
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /strato/clientes ─────────────────────────────────────────────────────
router.get('/clientes', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'))
  const limit  = Math.min(100, parseInt(req.query.limit || '20'))
  const offset = (page - 1) * limit
  const busca  = req.query.busca || ''

  const params = []
  let where    = ''
  if (busca) {
    params.push(`%${busca}%`)
    where = `WHERE pess2_nom ILIKE $1 OR pess2_email ILIKE $1 OR pess2_tel_cel ILIKE $1`
  }
  params.push(limit, offset)

  try {
    const { rows } = await query(`
      SELECT
        pess2_cod,
        pess2_ide,
        pess2_nom,
        pess2_raz,
        pess2_email,
        pess2_tel_cel  AS celular,
        pess2_tel_res  AS tel_residencial,
        pess2_tel_com  AS tel_comercial,
        pess2_wts      AS whatsapp,
        pess2_end,
        pess2_bai      AS bairro,
        pess2_cep,
        pess2_pes_fis  AS pessoa_fisica,
        pess2_sit      AS situacao,
        pess2_dat_inc  AS data_cadastro
      FROM tb2_pess
      ${where}
      ORDER BY pess2_nom ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)

    const countParams = busca ? [`%${busca}%`] : []
    const { rows: ct } = await query(`SELECT COUNT(*) FROM tb2_pess ${where}`, countParams)

    return res.json({
      ok: true,
      data: rows,
      pagination: { page, limit, total: parseInt(ct[0].count), pages: Math.ceil(ct[0].count / limit) },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /strato/clientes/:cod ────────────────────────────────────────────────
router.get('/clientes/:cod', async (req, res) => {
  const { cod } = req.params
  try {
    const { rows: pessoa } = await query(`SELECT * FROM tb2_pess WHERE pess2_cod = $1`, [cod])
    if (!pessoa.length) return res.status(404).json({ ok: false, message: 'Cliente não encontrado' })

    const { rows: vendas } = await query(`
      SELECT vend1_cod, vend1_dat_ven, vend1_val_ven, vend1_val_sal,
             vend1_dat_can, situ1_cod, univ1_cod, obra2_cod
      FROM ts1_vend WHERE pess2_cod = $1 ORDER BY vend1_dat_ven DESC
    `, [cod])

    const { rows: boletos } = await query(`
      SELECT bole1_cod,
             bole1_cor_dtvenc AS vencimento,
             bole1_cor_dtpgto AS data_pagamento,
             bole1_cor_valor  AS valor,
             bole1_cor_nrapar AS parcela,
             CASE
               WHEN bole1_dat_can    IS NOT NULL THEN 'cancelado'
               WHEN bole1_cor_dtpgto IS NOT NULL THEN 'pago'
               WHEN bole1_cor_dtvenc < CURRENT_DATE THEN 'vencido'
               ELSE 'em_aberto'
             END AS status
      FROM ts1_bole
      WHERE bole1_cont1_cod = ANY(
        SELECT vend1_cod::text FROM ts1_vend WHERE pess2_cod = $1
      )
      ORDER BY bole1_cor_dtvenc DESC
      LIMIT 50
    `, [cod])

    return res.json({ ok: true, data: { pessoa: pessoa[0], vendas, boletos } })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router

// ─── GET /strato/lotes ────────────────────────────────────────────────────────
router.get('/lotes', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'))
  const limit  = Math.min(100, parseInt(req.query.limit || '20'))
  const offset = (page - 1) * limit
  const busca  = req.query.busca || ''

  const params = []
  let where = ''
  if (busca) {
    params.push(`%${busca}%`)
    where = `WHERE univ2_qua ILIKE $1 OR univ2_lot::text ILIKE $1 OR univ2_sit ILIKE $1`
  }
  params.push(limit, offset)

  try {
    const { rows } = await query(`
      SELECT
        univ1_cod,
        univ2_qua   AS quadra,
        univ2_lot   AS lote,
        univ2_are   AS area,
        univ2_val   AS valor,
        univ2_sit   AS situacao,
        univ2_tip   AS tipo,
        obra2_cod,
        pess2_cod_co AS comprador_cod
      FROM ts1_univ
      ${where}
      ORDER BY univ2_qua, univ2_lot
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)

    const countParams = busca ? [`%${busca}%`] : []
    const { rows: ct } = await query(`SELECT COUNT(*) FROM ts1_univ ${where}`, countParams)

    return res.json({
      ok: true, data: rows,
      pagination: { page, limit, total: parseInt(ct[0].count), pages: Math.ceil(ct[0].count / limit) },
    })
  } catch (err) {
    // Tenta com view se tabela base não existir
    try {
      const { rows } = await query(`SELECT * FROM ts1_univ_v LIMIT $1 OFFSET $2`, [limit, offset])
      const { rows: ct } = await query(`SELECT COUNT(*) FROM ts1_univ_v`)
      return res.json({
        ok: true, data: rows,
        pagination: { page, limit, total: parseInt(ct[0].count), pages: Math.ceil(ct[0].count / limit) },
      })
    } catch (err2) {
      return res.status(500).json({ ok: false, message: `ts1_univ: ${err.message}` })
    }
  }
})

// ─── GET /strato/cobrancas ────────────────────────────────────────────────────
router.get('/cobrancas', async (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page  || '1'))
  const limit  = Math.min(100, parseInt(req.query.limit || '20'))
  const offset = (page - 1) * limit
  const busca  = req.query.busca || ''
  const status = req.query.status || ''

  const conditions = []
  const params     = []

  if (busca) {
    params.push(`%${busca}%`)
    conditions.push(`(core2_nom ILIKE $${params.length} OR core1_cod::text ILIKE $${params.length})`)
  }
  if (status === 'pago')    conditions.push(`core2_dat_pag IS NOT NULL`)
  if (status === 'aberto')  conditions.push(`core2_dat_pag IS NULL AND core2_dat_can IS NULL`)
  if (status === 'vencido') conditions.push(`core2_dat_pag IS NULL AND core2_dat_can IS NULL AND core2_dat_ven < CURRENT_DATE`)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit, offset)

  try {
    const { rows } = await query(`
      SELECT
        core1_cod,
        core2_nom        AS nome,
        core2_dat_ven    AS vencimento,
        core2_dat_pag    AS pagamento,
        core2_dat_can    AS cancelamento,
        core2_val        AS valor,
        core2_val_pag    AS valor_pago,
        core2_par        AS parcela,
        core2_sit        AS situacao,
        vend1_cod        AS venda_cod,
        pess2_cod        AS cliente_cod,
        CASE
          WHEN core2_dat_can IS NOT NULL THEN 'cancelado'
          WHEN core2_dat_pag IS NOT NULL THEN 'pago'
          WHEN core2_dat_ven < CURRENT_DATE THEN 'vencido'
          ELSE 'em_aberto'
        END AS status
      FROM ts1_core
      ${where}
      ORDER BY core2_dat_ven DESC NULLS LAST
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)

    const countParams = params.slice(0, params.length - 2)
    const { rows: ct } = await query(`SELECT COUNT(*) FROM ts1_core ${where}`, countParams)

    return res.json({
      ok: true, data: rows,
      pagination: { page, limit, total: parseInt(ct[0].count), pages: Math.ceil(ct[0].count / limit) },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})
