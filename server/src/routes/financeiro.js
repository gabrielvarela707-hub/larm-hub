/**
 * src/routes/financeiro.js
 * CashFlow Consolidado + Movimento Bancário
 */

const express          = require('express')
const { query }        = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)

// ─── GET /financeiro/cashflow ─────────────────────────────────────────────────
// Query params: empresa, ano, mes (opcional — se omitido traz todos os meses)
router.get('/cashflow', async (req, res) => {
  const empresa = (req.query.empresa || 'CONSOLIDADO').toUpperCase()
  const ano     = parseInt(req.query.ano || new Date().getFullYear())
  const mes     = req.query.mes ? parseInt(req.query.mes) : null

  try {
    // Busca todas as linhas hierárquicas
    const { rows: linhas } = await query(
      `SELECT id, row_idx, codigo, descricao, nivel, tipo
       FROM fin_cashflow_linhas ORDER BY row_idx`
    )

    if (!linhas.length) {
      return res.json({ ok: true, data: { linhas: [], colunas: [], empresa, ano } })
    }

    // Busca valores agrupados por mês ou para o mês específico
    let valQuery, valParams
    if (mes) {
      valQuery = `
        SELECT linha_id, mes, valor
        FROM fin_cashflow_valores
        WHERE empresa = $1 AND ano = $2 AND mes = $3
      `
      valParams = [empresa, ano, mes]
    } else {
      valQuery = `
        SELECT linha_id, mes, valor
        FROM fin_cashflow_valores
        WHERE empresa = $1 AND ano = $2
        ORDER BY linha_id, mes
      `
      valParams = [empresa, ano]
    }

    const { rows: valores } = await query(valQuery, valParams)

    // Monta mapa linha_id -> { mes -> valor }
    const valMap = {}
    const mesesSet = new Set()
    for (const v of valores) {
      if (!valMap[v.linha_id]) valMap[v.linha_id] = {}
      valMap[v.linha_id][v.mes] = parseFloat(v.valor)
      mesesSet.add(v.mes)
    }

    const MESES_NOME = ['', 'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const colunas = mes
      ? [{ mes, label: MESES_NOME[mes] }]
      : [...mesesSet].sort((a, b) => a - b).map(m => ({ mes: m, label: MESES_NOME[m] }))

    // Monta linhas com valores + total do ano
    const data = linhas.map(l => {
      const vals = valMap[l.id] || {}
      const total = Object.values(vals).reduce((s, v) => s + v, 0)
      return {
        ...l,
        valores: vals,   // { 1: 5000, 2: 3200, ... }
        total,
      }
    })

    return res.json({ ok: true, data: { linhas: data, colunas, empresa, ano } })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/cashflow/empresas ────────────────────────────────────────
router.get('/cashflow/empresas', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT empresa, ano
       FROM fin_cashflow_valores
       ORDER BY empresa, ano`
    )
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/cashflow/resumo ─────────────────────────────────────────
// Retorna cards de resumo: saldo atual, receitas, despesas, geração de caixa
router.get('/cashflow/resumo', async (req, res) => {
  const empresa = (req.query.empresa || 'CONSOLIDADO').toUpperCase()
  const ano     = parseInt(req.query.ano || new Date().getFullYear())
  const mes     = req.query.mes ? parseInt(req.query.mes) : null

  const LINHAS_RESUMO = [
    { key: 'saldo_final',        desc: 'SALDO FINAL' },
    { key: 'receita_bruta',      desc: 'Receitas Brutas' },
    { key: 'receita_liquida',    desc: 'Receita Líquida' },
    { key: 'despesas',           desc: 'Despesas Gerais e Administrativas' },
    { key: 'geracao_caixa',      desc: 'Geração de Caixa' },
    { key: 'distribuicao',       desc: 'Distribuição de Lucros' },
    { key: 'saldo_cc',           desc: 'Saldos Bancários em C/C' },
    { key: 'aplicacoes',         desc: 'Aplicações Financeiras' },
    { key: 'saldo_inicial',      desc: '(A) Saldo Inicial' },
  ]

  try {
    const mesFilter = mes ? 'AND v.mes = $3' : ''
    const params    = mes ? [empresa, ano, mes] : [empresa, ano]

    const result = {}
    for (const item of LINHAS_RESUMO) {
      const { rows } = await query(
        `SELECT COALESCE(SUM(v.valor), 0) AS total
         FROM fin_cashflow_valores v
         JOIN fin_cashflow_linhas l ON l.id = v.linha_id
         WHERE v.empresa = $1 AND v.ano = $2 ${mesFilter}
           AND l.descricao = '${item.desc}'`,
        params
      )
      result[item.key] = parseFloat(rows[0]?.total ?? 0)
    }

    return res.json({ ok: true, data: result })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/movimento ────────────────────────────────────────────────
router.get('/movimento', async (req, res) => {
  const page            = Math.max(1, parseInt(req.query.page  || '1'))
  const limit           = Math.min(200, parseInt(req.query.limit || '50'))
  const offset          = (page - 1) * limit
  const empresa         = req.query.empresa  || ''
  const banco           = req.query.banco    || ''
  const natureza        = req.query.natureza || ''
  const busca           = req.query.busca    || ''
  const ano             = req.query.ano      ? parseInt(req.query.ano) : null
  const mes             = req.query.mes      ? parseInt(req.query.mes) : null
  const tipo            = req.query.tipo     || ''  // 'entrada' | 'saida'
  const tipo_lancamento = req.query.tipo_lancamento || '' // 'financeiro' | 'administrativo' | '' = todos
  const ordenar         = req.query.ordenar || 'data_desc' // 'data_desc'|'data_asc'|'fornecedor_asc'|'valor_desc'

  const conditions = []
  const params     = []

  if (empresa)  { params.push(empresa.toUpperCase());  conditions.push(`empresa = $${params.length}`) }
  if (banco) {
    params.push(`%${banco}%`)
    conditions.push(`banco ILIKE $${params.length}`)
  }
  if (natureza) { params.push(natureza);  conditions.push(`natureza_financeira = $${params.length}`) }
  if (ano)      { params.push(ano);       conditions.push(`ano = $${params.length}`) }
  if (mes)      { params.push(mes);       conditions.push(`mes = $${params.length}`) }
  if (tipo === 'entrada') conditions.push(`entradas > 0`)
  if (tipo === 'saida')   conditions.push(`saidas > 0`)
  if (tipo_lancamento) {
    params.push(tipo_lancamento)
    conditions.push(`tipo_lancamento = $${params.length}`)
  }
  if (busca) {
    params.push(`%${busca}%`)
    conditions.push(`(fornecedor ILIKE $${params.length} OR historico ILIKE $${params.length} OR conta_contabil ILIKE $${params.length})`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  // Ordenação
  const ORDER_MAP = {
    'data_desc':       'data DESC NULLS LAST, id DESC',
    'data_asc':        'data ASC  NULLS LAST, id ASC',
    'fornecedor_asc':  'fornecedor ASC NULLS LAST, data DESC',
    'fornecedor_desc': 'fornecedor DESC NULLS LAST, data DESC',
    'valor_desc':      'COALESCE(entradas, 0) + COALESCE(saidas, 0) DESC, data DESC',
    'vencimento_asc':  'vencimento ASC NULLS LAST, data DESC',
  }
  const orderClause = ORDER_MAP[ordenar] || ORDER_MAP['data_desc']

  params.push(limit, offset)

  try {
    const { rows } = await query(`
      SELECT
        id, data, empresa, banco,
        entradas, saidas, saldo,
        fornecedor, historico, nf_doc,
        conta_contabil, centro_custo, obra,
        natureza_financeira, n_cheque,
        tipo_lancamento, vencimento,
        dia, mes, ano
      FROM fin_movimento
      ${where}
      ORDER BY ${orderClause}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params)

    const countParams = params.slice(0, params.length - 2)
    const { rows: ct } = await query(
      `SELECT COUNT(*), COALESCE(SUM(entradas),0) AS total_entradas, COALESCE(SUM(saidas),0) AS total_saidas
       FROM fin_movimento ${where}`, countParams
    )

    return res.json({
      ok: true,
      data: rows,
      summary: {
        total_entradas: parseFloat(ct[0].total_entradas),
        total_saidas:   parseFloat(ct[0].total_saidas),
        saldo_periodo:  parseFloat(ct[0].total_entradas) - parseFloat(ct[0].total_saidas),
      },
      pagination: {
        page, limit,
        total: parseInt(ct[0].count),
        pages: Math.ceil(ct[0].count / limit),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/movimento/filtros ────────────────────────────────────────
// Retorna listas de valores únicos para os dropdowns
router.get('/movimento/filtros', async (req, res) => {
  try {
    const [empresas, bancos, contas, anos] = await Promise.all([
      query(`SELECT DISTINCT empresa FROM fin_movimento WHERE empresa IS NOT NULL ORDER BY empresa`),
      query(`SELECT DISTINCT banco    FROM fin_movimento WHERE banco IS NOT NULL ORDER BY banco`),
      query(`SELECT DISTINCT conta_contabil, natureza_financeira FROM fin_movimento WHERE conta_contabil IS NOT NULL ORDER BY conta_contabil`),
      query(`SELECT DISTINCT ano FROM fin_movimento WHERE ano IS NOT NULL ORDER BY ano DESC`),
    ])

    return res.json({
      ok: true,
      data: {
        empresas: empresas.rows.map(r => r.empresa),
        bancos:   bancos.rows.map(r => r.banco),
        contas:   contas.rows,
        anos:     anos.rows.map(r => r.ano),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/movimento/resumo ────────────────────────────────────────
router.get('/movimento/resumo', async (req, res) => {
  const empresa = req.query.empresa ? req.query.empresa.toUpperCase() : null
  const ano     = req.query.ano ? parseInt(req.query.ano) : new Date().getFullYear()

  const conditions = ['ano = $1']
  const params     = [ano]

  if (empresa) { params.push(empresa); conditions.push(`empresa = $${params.length}`) }

  const where = `WHERE ${conditions.join(' AND ')}`

  try {
    // Resumo por mês
    const { rows: mensal } = await query(`
      SELECT
        mes,
        COALESCE(SUM(entradas), 0) AS entradas,
        COALESCE(SUM(saidas),   0) AS saidas,
        COALESCE(SUM(entradas), 0) - COALESCE(SUM(saidas), 0) AS saldo
      FROM fin_movimento
      ${where}
      GROUP BY mes ORDER BY mes
    `, params)

    // Resumo por empresa
    const { rows: por_empresa } = await query(`
      SELECT
        empresa,
        COALESCE(SUM(entradas), 0) AS entradas,
        COALESCE(SUM(saidas),   0) AS saidas
      FROM fin_movimento
      ${where}
      GROUP BY empresa ORDER BY empresa
    `, params)

    // Top categorias de despesas
    const { rows: top_despesas } = await query(`
      SELECT
        conta_contabil,
        COALESCE(SUM(saidas), 0) AS total
      FROM fin_movimento
      ${where}
        AND saidas > 0
        AND conta_contabil IS NOT NULL
      GROUP BY conta_contabil
      ORDER BY total DESC
      LIMIT 10
    `, params)

    return res.json({
      ok: true,
      data: { mensal, por_empresa, top_despesas },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router
