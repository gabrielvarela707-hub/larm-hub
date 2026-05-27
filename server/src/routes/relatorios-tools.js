/**
 * src/routes/relatorios-tools.js
 * Relatórios importados do Tools/Scriptcase, reescritos no padrão Node + PostgreSQL.
 *
 * Não executa PHP legado. Usa as tabelas já migradas:
 * tb2_obra, ts1_univ, ts1_situ, ts1_vend, ts1_desu, ts1_tpun, tb2_pess, ts1_cemp.
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

function trim(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function toBool(value) {
  if (typeof value === 'boolean') return value
  const v = String(value || '').toLowerCase().trim()
  return ['1', 'true', 'sim', 's', 'yes'].includes(v)
}

function imageUrl(value) {
  const raw = trim(value)
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('/')) return raw
  const base = (process.env.TOOLS_FILES_BASE_URL || process.env.LEGACY_FILES_BASE_URL || '').replace(/\/$/, '')
  if (!base) return null
  return `${base}/${raw.replace(/^\//, '')}`
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

async function requiredTablesReady(required) {
  for (const t of required) {
    if (!(await tableExists(t))) return false
  }
  return true
}

let obraColsCache = null
async function getObraColumns() {
  if (!obraColsCache) obraColsCache = await getTableColumns('tb2_obra')
  return obraColsCache
}

async function plantaExpr(alias = 'o') {
  const cols = await getObraColumns()
  return cols.has('obra2_usua_img_planta')
    ? `NULLIF(BTRIM(${alias}.obra2_usua_img_planta::text), '')`
    : 'NULL::text'
}

function pushSearch(where, params, busca, columnsSql) {
  const text = trim(busca)
  if (!text) return
  params.push(`%${text}%`)
  const p = `$${params.length}`
  where.push(`(${columnsSql.map(c => `${c} ILIKE ${p}`).join(' OR ')})`)
}

function pagination(req) {
  const page = Math.max(1, toInt(req.query.page, 1))
  const limit = Math.min(MAX_LIMIT, Math.max(1, toInt(req.query.limit, DEFAULT_LIMIT)))
  return { page, limit, offset: (page - 1) * limit }
}

function mapObra(row) {
  return {
    id: Number(row.obra_id),
    codigo: Number(row.obra_id),
    nome: trim(row.nome) || `Obra ${row.obra_id}`,
    empresa_codigo: row.empresa_codigo === null ? null : Number(row.empresa_codigo),
    empresa: trim(row.empresa) || '—',
    cidade_codigo: row.cidade_codigo === null ? null : Number(row.cidade_codigo),
    cidade: trim(row.cidade) || '—',
    endereco: trim(row.endereco),
    numero: trim(row.numero),
    bairro: trim(row.bairro),
    cep: trim(row.cep),
    area: toNum(row.area),
    area_total: toNum(row.area_total),
    data_inicio: row.data_inicio || null,
    data_entrega: row.data_entrega || null,
    data_conclusao: row.data_conclusao || null,
    data_habite_se: row.data_habite_se || null,
    planta: trim(row.planta) || null,
    planta_url: imageUrl(row.planta),
    total_unidades: Number(row.total_unidades || 0),
    disponiveis: Number(row.disponiveis || 0),
    vendidas: Number(row.vendidas || 0),
    ultima_venda_data: row.ultima_venda_data || null,
    ultima_venda_unidade: trim(row.ultima_venda_unidade) || null,
  }
}

function mapUnidade(row) {
  return {
    id: Number(row.unidade_id),
    unidade_id: Number(row.unidade_id),
    obra_id: Number(row.obra_id),
    obra: trim(row.obra) || `Obra ${row.obra_id}`,
    situacao_codigo: row.situacao_codigo === null ? null : Number(row.situacao_codigo),
    situacao: trim(row.situacao) || '—',
    situacao_cor: trim(row.situacao_cor) || null,
    tipo_codigo: row.tipo_codigo === null ? null : Number(row.tipo_codigo),
    tipo: trim(row.tipo) || '—',
    quadra: trim(row.quadra),
    lote: trim(row.lote),
    unidade: trim(row.unidade) || trim(row.nome) || String(row.unidade_id),
    nome: trim(row.nome),
    area: toNum(row.area),
    venda_codigo: row.venda_codigo === null ? null : Number(row.venda_codigo),
    data_venda: row.data_venda || null,
    cliente_codigo: row.cliente_codigo === null ? null : Number(row.cliente_codigo),
    cliente: trim(row.cliente) || '—',
  }
}

router.get('/filtros', async (req, res) => {
  const data = { obras: [], situacoes: [], tipos: [], empresas: [] }

  if (await requiredTablesReady(['tb2_obra'])) {
    const { rows } = await query(
      `SELECT o.obra2_cod AS codigo,
              BTRIM(o.obra2_nom) AS nome,
              o.cemp1_cod AS empresa_codigo,
              COALESCE(NULLIF(BTRIM(c.cemp1_nom_fan), ''), NULLIF(BTRIM(c.cemp1_nom), ''), 'Empresa ' || o.cemp1_cod::text) AS empresa
         FROM tb2_obra o
         LEFT JOIN ts1_cemp c ON c.cemp1_cod = o.cemp1_cod
        ORDER BY o.obra2_cod`,
      []
    )
    data.obras = rows.map(r => ({ codigo: Number(r.codigo), nome: trim(r.nome), empresa_codigo: r.empresa_codigo, empresa: trim(r.empresa) }))

    const empresas = new Map()
    data.obras.forEach(o => {
      if (o.empresa_codigo !== null && o.empresa_codigo !== undefined) empresas.set(o.empresa_codigo, o.empresa)
    })
    data.empresas = Array.from(empresas.entries()).map(([codigo, nome]) => ({ codigo: Number(codigo), nome }))
  }

  if (await requiredTablesReady(['ts1_situ'])) {
    const { rows } = await query(
      `SELECT s.situ1_cod AS codigo,
              BTRIM(s.situ1_nom) AS nome,
              NULLIF(BTRIM(COALESCE(s.situ1_cor, '')), '') AS cor
         FROM ts1_situ s
        ORDER BY s.situ1_cod`,
      []
    )
    data.situacoes = rows.map(r => ({ codigo: Number(r.codigo), nome: trim(r.nome), cor: trim(r.cor) || null }))
  }

  if (await requiredTablesReady(['ts1_tpun'])) {
    const { rows } = await query(
      `SELECT tpun1_cod AS codigo, BTRIM(tpun1_nom) AS nome
         FROM ts1_tpun
        ORDER BY tpun1_cod`,
      []
    )
    data.tipos = rows.map(r => ({ codigo: Number(r.codigo), nome: trim(r.nome) }))
  }

  res.json({ ok: true, data })
})

async function handleProjetos(req, res) {
  if (!(await requiredTablesReady(['tb2_obra']))) {
    return res.json({ ok: true, data: [], pagination: { page: 1, pages: 1, total: 0, limit: DEFAULT_LIMIT }, summary: { total: 0, unidades: 0, disponiveis: 0, vendidas: 0 } })
  }

  const { page, limit, offset } = pagination(req)
  const params = []
  const where = ['1=1']
  const planta = await plantaExpr('o')

  if (req.query.empresa) {
    params.push(toInt(req.query.empresa, 0))
    where.push(`o.cemp1_cod = $${params.length}`)
  }

  if (req.query.com_planta !== undefined && String(req.query.com_planta) !== '') {
    where.push(toBool(req.query.com_planta) ? `${planta} IS NOT NULL` : `${planta} IS NULL`)
  }

  pushSearch(where, params, req.query.busca, [
    'BTRIM(o.obra2_nom)',
    'BTRIM(COALESCE(o.obra2_end, \'\'))',
    'BTRIM(COALESCE(o.obra2_bai, \'\'))',
    'o.obra2_cod::text',
  ])

  const base = `
    FROM tb2_obra o
    LEFT JOIN ts1_cemp c ON c.cemp1_cod = o.cemp1_cod
    LEFT JOIN tb2_cida ci ON ci.cida2_cod = o.cida2_cod
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS total_unidades,
             COUNT(*) FILTER (WHERE u.situ1_cod IN (19, 997))::int AS disponiveis,
             COUNT(*) FILTER (WHERE u.situ1_cod IN (1, 5, 6, 8, 24, 41))::int AS vendidas
        FROM ts1_univ u
       WHERE u.obra2_cod = o.obra2_cod
    ) un ON true
    LEFT JOIN LATERAL (
      SELECT v.vend1_dat_ven AS ultima_venda_data,
             COALESCE(NULLIF(BTRIM(u2.univ1_ide), ''), NULLIF(BTRIM(CONCAT(BTRIM(u2.univ1_qua), '-', BTRIM(u2.univ1_lot))), '-'), u2.univ1_cod::text) AS ultima_venda_unidade
        FROM ts1_vend v
        LEFT JOIN ts1_univ u2 ON u2.univ1_cod = v.univ1_cod AND u2.obra2_cod = v.obra2_cod
       WHERE v.obra2_cod = o.obra2_cod
         AND v.vend1_dat_ven IS NOT NULL
         AND v.vend1_dat_can IS NULL
       ORDER BY v.vend1_dat_ven DESC NULLS LAST, v.vend1_cod DESC
       LIMIT 1
    ) uv ON true
   WHERE ${where.join(' AND ')}
  `

  const listParams = [...params, limit, offset]
  const limitParam = params.length + 1
  const offsetParam = params.length + 2

  const [items, total, summary] = await Promise.all([
    query(
      `SELECT o.obra2_cod AS obra_id,
              o.cemp1_cod AS empresa_codigo,
              COALESCE(NULLIF(BTRIM(c.cemp1_nom_fan), ''), NULLIF(BTRIM(c.cemp1_nom), ''), 'Empresa ' || o.cemp1_cod::text) AS empresa,
              o.cida2_cod AS cidade_codigo,
              BTRIM(ci.cida2_nom) AS cidade,
              BTRIM(o.obra2_nom) AS nome,
              BTRIM(COALESCE(o.obra2_end, '')) AS endereco,
              BTRIM(COALESCE(o.obra2_end_num, '')) AS numero,
              BTRIM(COALESCE(o.obra2_bai, '')) AS bairro,
              BTRIM(COALESCE(o.obra2_cep, '')) AS cep,
              COALESCE(o.obra2_are, 0) AS area,
              COALESCE(o.obra2_are_tot, 0) AS area_total,
              o.obra2_dat_ini AS data_inicio,
              o.obra2_dat_ent AS data_entrega,
              o.obra2_dat_con AS data_conclusao,
              o.obra2_dat_hab AS data_habite_se,
              ${planta} AS planta,
              COALESCE(un.total_unidades, 0) AS total_unidades,
              COALESCE(un.disponiveis, 0) AS disponiveis,
              COALESCE(un.vendidas, 0) AS vendidas,
              uv.ultima_venda_data,
              uv.ultima_venda_unidade
         ${base}
        ORDER BY o.obra2_cod
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
      listParams
    ),
    query(`SELECT COUNT(*)::int AS total ${base}`, params),
    query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(COALESCE(un.total_unidades, 0)), 0)::int AS unidades,
              COALESCE(SUM(COALESCE(un.disponiveis, 0)), 0)::int AS disponiveis,
              COALESCE(SUM(COALESCE(un.vendidas, 0)), 0)::int AS vendidas
         ${base}`,
      params
    ),
  ])

  const totalRows = Number(total.rows[0]?.total || 0)
  res.json({
    ok: true,
    data: items.rows.map(mapObra),
    pagination: { page, pages: Math.max(1, Math.ceil(totalRows / limit)), total: totalRows, limit },
    summary: {
      total: Number(summary.rows[0]?.total || 0),
      unidades: Number(summary.rows[0]?.unidades || 0),
      disponiveis: Number(summary.rows[0]?.disponiveis || 0),
      vendidas: Number(summary.rows[0]?.vendidas || 0),
    },
  })
}

router.get('/projetos', handleProjetos)
router.get('/implantacoes', handleProjetos)

router.get('/unidades', async (req, res) => {
  if (!(await requiredTablesReady(['ts1_univ', 'tb2_obra', 'ts1_situ']))) {
    return res.json({ ok: true, data: [], pagination: { page: 1, pages: 1, total: 0, limit: DEFAULT_LIMIT }, summary: { total: 0, area_total: 0 } })
  }

  const { page, limit, offset } = pagination(req)
  const params = []
  const where = ['1=1']

  if (req.query.obra) {
    params.push(toInt(req.query.obra, 0))
    where.push(`u.obra2_cod = $${params.length}`)
  }

  if (req.query.situacao) {
    const codes = String(req.query.situacao).split(',').map(v => toInt(v, null)).filter(v => v !== null)
    if (codes.length) {
      params.push(codes)
      where.push(`u.situ1_cod = ANY($${params.length}::int[])`)
    }
  }

  if (req.query.tipo) {
    params.push(toInt(req.query.tipo, 0))
    where.push(`u.tpun1_cod = $${params.length}`)
  }

  pushSearch(where, params, req.query.busca, [
    'BTRIM(COALESCE(o.obra2_nom, \'\'))',
    'BTRIM(COALESCE(u.univ1_ide, \'\'))',
    'BTRIM(COALESCE(u.univ1_qua, \'\'))',
    'BTRIM(COALESCE(u.univ1_lot, \'\'))',
    'BTRIM(COALESCE(p.pess2_nom, \'\'))',
    'BTRIM(COALESCE(p.pess2_raz, \'\'))',
    'u.univ1_cod::text',
    'COALESCE(v.vend1_cod, 0)::text',
  ])

  const base = `
    FROM ts1_univ u
    LEFT JOIN tb2_obra o ON o.obra2_cod = u.obra2_cod
    LEFT JOIN ts1_situ s ON s.situ1_cod = u.situ1_cod
    LEFT JOIN ts1_tpun tp ON tp.tpun1_cod = u.tpun1_cod
    LEFT JOIN LATERAL (
      SELECT d.desu1_val AS area, d.desu1_cod AS desu_codigo
        FROM ts1_desu d
       WHERE d.univ1_cod = u.univ1_cod
         AND d.tide1_cod = 5
       ORDER BY d.desu1_cod DESC
       LIMIT 1
    ) area ON true
    LEFT JOIN LATERAL (
      SELECT v.vend1_cod, v.vend1_dat_ven, v.pess2_cod
        FROM ts1_vend v
       WHERE v.univ1_cod = u.univ1_cod
         AND v.obra2_cod = u.obra2_cod
         AND v.vend1_dat_can IS NULL
       ORDER BY v.vend1_cod DESC
       LIMIT 1
    ) v ON true
    LEFT JOIN tb2_pess p ON p.pess2_cod = v.pess2_cod
   WHERE ${where.join(' AND ')}
  `

  const listParams = [...params, limit, offset]
  const limitParam = params.length + 1
  const offsetParam = params.length + 2

  const [items, total, summary] = await Promise.all([
    query(
      `SELECT u.univ1_cod AS unidade_id,
              u.obra2_cod AS obra_id,
              BTRIM(COALESCE(o.obra2_nom, '')) AS obra,
              u.situ1_cod AS situacao_codigo,
              BTRIM(COALESCE(s.situ1_nom, '')) AS situacao,
              NULLIF(BTRIM(COALESCE(s.situ1_cor, '')), '') AS situacao_cor,
              u.tpun1_cod AS tipo_codigo,
              BTRIM(COALESCE(tp.tpun1_nom, '')) AS tipo,
              BTRIM(COALESCE(u.univ1_qua, '')) AS quadra,
              BTRIM(COALESCE(u.univ1_lot, '')) AS lote,
              BTRIM(COALESCE(u.univ1_ide, '')) AS unidade,
              BTRIM(COALESCE(u.univ1_nom, '')) AS nome,
              COALESCE(area.area, 0) AS area,
              v.vend1_cod AS venda_codigo,
              v.vend1_dat_ven AS data_venda,
              v.pess2_cod AS cliente_codigo,
              COALESCE(NULLIF(BTRIM(p.pess2_nom), ''), NULLIF(BTRIM(p.pess2_raz), ''), '') AS cliente
         ${base}
        ORDER BY o.obra2_cod, u.univ1_cod
        LIMIT $${limitParam} OFFSET $${offsetParam}`,
      listParams
    ),
    query(`SELECT COUNT(*)::int AS total ${base}`, params),
    query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(COALESCE(area.area, 0)), 0) AS area_total ${base}`, params),
  ])

  const totalRows = Number(total.rows[0]?.total || 0)
  res.json({
    ok: true,
    data: items.rows.map(mapUnidade),
    pagination: { page, pages: Math.max(1, Math.ceil(totalRows / limit)), total: totalRows, limit },
    summary: {
      total: Number(summary.rows[0]?.total || 0),
      area_total: toNum(summary.rows[0]?.area_total),
    },
  })
})

module.exports = router
