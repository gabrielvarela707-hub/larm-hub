/**
 * src/routes/mapa-vendas.js
 * Relatórios — Mapa de Vendas.
 *
 * Integra o relatório Next.js aos dados legados já migrados para PostgreSQL:
 * TS1_VEND, TS1_UNIV, TB2_PESS, TB2_OBRA, TS1_CEMP e TS1_CORE.
 */

const express = require('express')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function toInt(value, fallback = null) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

function toNum(value) {
  if (value === null || value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function toDate(value) {
  return value || null
}

async function tableExists(tableName) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
     ) AS exists`,
    [tableName]
  )
  return !!rows[0]?.exists
}

async function getTableColumns(tableName) {
  const { rows } = await query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName]
  )
  return new Set(rows.map(r => r.column_name))
}

let unitSourceCache = null
async function getUnitSource() {
  if (unitSourceCache) return unitSourceCache

  // Alguns ambientes legados possuem a view ts1_univ_v com campo area.
  // Quando ela não existir, usamos a tabela base ts1_univ e deixamos area/preço m² nulos.
  const hasView = await tableExists('ts1_univ_v')
  if (hasView) {
    const cols = await getTableColumns('ts1_univ_v')
    if (cols.has('univ1_cod')) {
      unitSourceCache = {
        table: 'ts1_univ_v',
        areaExpr: cols.has('area') ? 'NULLIF(u.area, 0)' : 'NULL::numeric',
        situExpr: cols.has('situ1_cod') ? 'u.situ1_cod' : 'NULL::integer',
      }
      return unitSourceCache
    }
  }

  unitSourceCache = {
    table: 'ts1_univ',
    areaExpr: 'NULL::numeric',
    situExpr: 'u.situ1_cod',
  }
  return unitSourceCache
}

async function legacyTablesReady() {
  const required = ['ts1_vend', 'ts1_univ', 'tb2_pess', 'tb2_obra']
  for (const t of required) {
    if (!(await tableExists(t))) return false
  }
  return true
}

function mapVenda(row) {
  return {
    id: Number(row.id),
    ano: Number(row.ano),
    num_contrato: row.num_contrato === null ? null : Number(row.num_contrato),
    obra_id: row.obra_id === null || row.obra_id === undefined ? null : Number(row.obra_id),
    obra: row.obra || '—',
    data_venda: toDate(row.data_venda),
    empresa: row.empresa || '—',
    unidade: row.unidade || '—',
    cliente_codigo: row.cliente_codigo ? String(row.cliente_codigo).trim() : '',
    cliente_nome: row.cliente_nome || '—',
    valor_prazo: toNum(row.valor_prazo),
    valor_vista: toNum(row.valor_vista),
    entrada: toNum(row.entrada),
    parcelado: toNum(row.parcelado),
    num_parcelas: Number(row.num_parcelas || 0),
    area_m2: toNum(row.area_m2),
    preco_m2: toNum(row.preco_m2),
    comissao: toNum(row.comissao),
    data_receber_entrada: toDate(row.data_receber_entrada),
  }
}

function buildFilters({ ano, empresa, obra, busca }, params) {
  const where = [
    'v.vend1_dat_ven IS NOT NULL',
    '(v.vend1_dat_can IS NULL)',
  ]

  if (ano) {
    params.push(ano)
    where.push(`EXTRACT(YEAR FROM v.vend1_dat_ven)::int = $${params.length}`)
  }

  if (empresa) {
    params.push(String(empresa).trim())
    where.push(`COALESCE(NULLIF(TRIM(c.cemp1_nom_fan), ''), NULLIF(TRIM(c.cemp1_nom), ''), 'Empresa ' || COALESCE(c.cemp1_cod, o.cemp1_cod, 0)::text) = $${params.length}`)
  }

  if (obra) {
    params.push(toInt(obra, 0))
    where.push(`v.obra2_cod = $${params.length}`)
  }

  if (busca) {
    params.push(`%${String(busca).trim()}%`)
    where.push(`(
      TRIM(COALESCE(p.pess2_nom, '')) ILIKE $${params.length}
      OR TRIM(COALESCE(p.pess2_raz, '')) ILIKE $${params.length}
      OR TRIM(COALESCE(u.univ1_ide, '')) ILIKE $${params.length}
      OR TRIM(COALESCE(u.univ1_qua, '')) ILIKE $${params.length}
      OR TRIM(COALESCE(u.univ1_lot, '')) ILIKE $${params.length}
      OR v.vend1_cod::text ILIKE $${params.length}
      OR v.pess2_cod::text ILIKE $${params.length}
    )`)
  }

  return where
}

async function buildBaseSql(filters, params) {
  const unit = await getUnitSource()
  const where = buildFilters(filters, params)

  return `
    FROM ts1_vend v
    LEFT JOIN ${unit.table} u ON u.univ1_cod = v.univ1_cod AND (u.obra2_cod = v.obra2_cod OR u.obra2_cod IS NULL)
    LEFT JOIN tb2_obra o ON o.obra2_cod = v.obra2_cod
    LEFT JOIN ts1_cemp c ON c.cemp1_cod = o.cemp1_cod
    LEFT JOIN tb2_pess p ON p.pess2_cod = v.pess2_cod
   WHERE ${where.join(' AND ')}
  `
}

async function vendaSelectSql(filters, params) {
  const unit = await getUnitSource()
  const base = await buildBaseSql(filters, params)

  return `
    SELECT
      v.vend1_cod AS id,
      EXTRACT(YEAR FROM v.vend1_dat_ven)::int AS ano,
      v.vend1_cod AS num_contrato,
      v.obra2_cod AS obra_id,
      COALESCE(NULLIF(TRIM(o.obra2_nom), ''), 'Obra ' || v.obra2_cod::text) AS obra,
      v.vend1_dat_ven AS data_venda,
      COALESCE(NULLIF(TRIM(c.cemp1_nom_fan), ''), NULLIF(TRIM(c.cemp1_nom), ''), 'Empresa ' || COALESCE(c.cemp1_cod, o.cemp1_cod, 0)::text) AS empresa,
      COALESCE(
        NULLIF(TRIM(u.univ1_ide), ''),
        NULLIF(TRIM(CONCAT('Q ', NULLIF(TRIM(u.univ1_qua), ''), ' / L ', NULLIF(TRIM(u.univ1_lot), ''))), 'Q  / L '),
        v.univ1_cod::text
      ) AS unidade,
      v.pess2_cod::text AS cliente_codigo,
      COALESCE(NULLIF(TRIM(p.pess2_nom), ''), NULLIF(TRIM(p.pess2_raz), ''), 'Cliente ' || v.pess2_cod::text) AS cliente_nome,
      COALESCE(v.vend1_val_ven, 0) AS valor_prazo,
      COALESCE(NULLIF(v.vend1_val_pre, 0), NULLIF(v.vend1_val_ori, 0), 0) AS valor_vista,
      COALESCE(v.vend1_val_ent, 0) AS entrada,
      COALESCE(v.vend1_val_par, 0) AS parcelado,
      COALESCE((SELECT COUNT(*) FROM ts1_core cr WHERE cr.vend1_cod = v.vend1_cod), 0)::int AS num_parcelas,
      COALESCE(${unit.areaExpr}, 0) AS area_m2,
      CASE WHEN COALESCE(${unit.areaExpr}, 0) > 0
           THEN COALESCE(v.vend1_val_ven, 0) / NULLIF(${unit.areaExpr}, 0)
           ELSE 0
      END AS preco_m2,
      COALESCE(v.vend1_val_com, 0) AS comissao,
      (SELECT MIN(cr.core1_dat_ven) FROM ts1_core cr WHERE cr.vend1_cod = v.vend1_cod) AS data_receber_entrada
    ${base}
  `
}

router.get('/anos', async (req, res) => {
  if (!(await legacyTablesReady())) {
    return res.json({ ok: true, data: [] })
  }

  const params = []
  const where = ['vend1_dat_ven IS NOT NULL', 'vend1_dat_can IS NULL']
  if (req.query.obra) {
    params.push(toInt(req.query.obra, 0))
    where.push(`obra2_cod = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(YEAR FROM vend1_dat_ven)::int AS ano,
            COUNT(*)::int AS contratos
       FROM ts1_vend
      WHERE ${where.join(' AND ')}
      GROUP BY 1
      ORDER BY 1 DESC`,
    params
  )

  res.json({ ok: true, data: rows.map(r => ({ ano: Number(r.ano), contratos: Number(r.contratos || 0) })) })
})

router.get('/resumo', async (req, res) => {
  if (!(await legacyTablesReady())) {
    return res.json({
      ok: true,
      data: {
        por_ano: [],
        por_empresa: [],
        recentes: [],
        total: { total_contratos: 0, total_prazo: 0, total_entrada: 0, area_total: 0, primeira_venda: null, ultima_venda: null },
      },
    })
  }

  const params = []
  const filters = {
    ano: toInt(req.query.ano, null),
    empresa: req.query.empresa || '',
    obra: req.query.obra || '',
    busca: req.query.busca || '',
  }
  const selectSql = await vendaSelectSql(filters, params)

  const [porAno, porEmpresa, recentes, total] = await Promise.all([
    query(
      `SELECT ano,
              COUNT(*)::int AS contratos,
              COALESCE(SUM(valor_prazo), 0) AS total_prazo,
              COALESCE(SUM(valor_vista), 0) AS total_vista,
              COALESCE(SUM(entrada), 0) AS total_entrada,
              COALESCE(SUM(area_m2), 0) AS area_total,
              CASE WHEN COALESCE(SUM(area_m2), 0) > 0 THEN COALESCE(SUM(valor_prazo), 0) / NULLIF(SUM(area_m2), 0) ELSE 0 END AS preco_m2_medio
         FROM (${selectSql}) x
        GROUP BY ano
        ORDER BY ano DESC`,
      params
    ),
    query(
      `SELECT empresa,
              COUNT(*)::int AS contratos,
              COALESCE(SUM(valor_prazo), 0) AS total_prazo,
              COALESCE(SUM(valor_vista), 0) AS total_vista,
              COALESCE(SUM(area_m2), 0) AS area_total
         FROM (${selectSql}) x
        GROUP BY empresa
        ORDER BY contratos DESC, empresa ASC`,
      params
    ),
    query(
      `SELECT *
         FROM (${selectSql}) x
        ORDER BY data_venda DESC NULLS LAST, id DESC
        LIMIT 10`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS total_contratos,
              COALESCE(SUM(valor_prazo), 0) AS total_prazo,
              COALESCE(SUM(entrada), 0) AS total_entrada,
              COALESCE(SUM(area_m2), 0) AS area_total,
              MIN(data_venda) AS primeira_venda,
              MAX(data_venda) AS ultima_venda
         FROM (${selectSql}) x`,
      params
    ),
  ])

  res.json({
    ok: true,
    data: {
      por_ano: porAno.rows.map(r => ({
        ano: Number(r.ano),
        contratos: Number(r.contratos || 0),
        total_prazo: toNum(r.total_prazo),
        total_vista: toNum(r.total_vista),
        total_entrada: toNum(r.total_entrada),
        area_total: toNum(r.area_total),
        preco_m2_medio: toNum(r.preco_m2_medio),
      })),
      por_empresa: porEmpresa.rows.map(r => ({
        empresa: r.empresa,
        contratos: Number(r.contratos || 0),
        total_prazo: toNum(r.total_prazo),
        total_vista: toNum(r.total_vista),
        area_total: toNum(r.area_total),
      })),
      recentes: recentes.rows.map(mapVenda),
      total: {
        total_contratos: Number(total.rows[0]?.total_contratos || 0),
        total_prazo: toNum(total.rows[0]?.total_prazo),
        total_entrada: toNum(total.rows[0]?.total_entrada),
        area_total: toNum(total.rows[0]?.area_total),
        primeira_venda: toDate(total.rows[0]?.primeira_venda),
        ultima_venda: toDate(total.rows[0]?.ultima_venda),
      },
    },
  })
})

router.get('/', async (req, res) => {
  if (!(await legacyTablesReady())) {
    return res.json({
      ok: true,
      data: [],
      pagination: { page: 1, pages: 1, total: 0, limit: DEFAULT_LIMIT },
      summary: { total_contratos: 0, total_prazo: 0, total_vista: 0, total_entrada: 0, total_comissao: 0 },
    })
  }

  const page = Math.max(1, toInt(req.query.page, 1))
  const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(req.query.limit, DEFAULT_LIMIT)))
  const offset = (page - 1) * limit

  const params = []
  const filters = {
    ano: toInt(req.query.ano, null),
    empresa: req.query.empresa || '',
    obra: req.query.obra || '',
    busca: req.query.busca || '',
  }

  const selectSql = await vendaSelectSql(filters, params)
  const countParams = [...params]

  params.push(limit)
  const limitParam = params.length
  params.push(offset)
  const offsetParam = params.length

  const [items, total, summary] = await Promise.all([
    query(
      `SELECT *
         FROM (${selectSql}) x
        ORDER BY data_venda DESC NULLS LAST, id DESC
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    ),
    query(`SELECT COUNT(*)::int AS total FROM (${selectSql}) x`, countParams),
    query(
      `SELECT COUNT(*)::int AS total_contratos,
              COALESCE(SUM(valor_prazo), 0) AS total_prazo,
              COALESCE(SUM(valor_vista), 0) AS total_vista,
              COALESCE(SUM(entrada), 0) AS total_entrada,
              COALESCE(SUM(comissao), 0) AS total_comissao
         FROM (${selectSql}) x`,
      countParams
    ),
  ])

  const totalRows = Number(total.rows[0]?.total || 0)

  res.json({
    ok: true,
    data: items.rows.map(mapVenda),
    pagination: {
      page,
      pages: Math.max(1, Math.ceil(totalRows / limit)),
      total: totalRows,
      limit,
    },
    summary: {
      total_contratos: Number(summary.rows[0]?.total_contratos || 0),
      total_prazo: toNum(summary.rows[0]?.total_prazo),
      total_vista: toNum(summary.rows[0]?.total_vista),
      total_entrada: toNum(summary.rows[0]?.total_entrada),
      total_comissao: toNum(summary.rows[0]?.total_comissao),
    },
  })
})

module.exports = router
