/**
 * src/routes/financeiro.js
 * CashFlow Consolidado + Movimento Bancário
 */

const express          = require('express')
const { query }        = require('../config/database')
const { authenticate } = require('../middleware/authenticate')

const router = express.Router()
router.use(authenticate)


// Valores futuros em aberto entram no Cash Flow apenas enquanto estiverem pendentes.
// Quando a parcela é baixada/paga, ela sai daqui e passa a aparecer no Movimento Bancário realizado.
const STATUS_ABERTO_CP = ['pendente', 'vencido', 'aberto', 'aberta']
const STATUS_PAGO_CR   = ['pago', 'paga', 'quitado', 'quitada', 'recebido', 'recebida', 'q']
const STATUS_CANCELADO = ['cancelado', 'cancelada', 'c']

async function tableExists(tableName) {
  const { rows } = await query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  )
  return !!rows[0]?.exists
}

async function getTableColumns(tableName) {
  const { rows } = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  )
  return new Set(rows.map(r => r.column_name))
}

function pickColumn(columns, candidates) {
  return candidates.find(c => columns.has(c)) || null
}

function emptyMonthMap() {
  return Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 0]))
}

function daysInMonth(ano, mes) {
  return new Date(ano, mes, 0).getDate()
}

function emptyDayMap(ano, mes) {
  return Object.fromEntries(Array.from({ length: daysInMonth(ano, mes) }, (_, i) => [i + 1, 0]))
}

function normalizeEmpresaFilter(empresa) {
  return String(empresa || 'CONSOLIDADO').toUpperCase()
}

async function getContasPagarFuturoAberto(empresa, ano, mes = null) {
  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = [ano]
  const conditions = [
    `p.vencimento IS NOT NULL`,
    `EXTRACT(YEAR FROM p.vencimento)::int = $1`,
    `LOWER(COALESCE(p.status::text, 'pendente')) = ANY($${params.length + 1})`,
  ]
  params.push(STATUS_ABERTO_CP)

  if (mes) {
    params.push(mes)
    conditions.push(`EXTRACT(MONTH FROM p.vencimento)::int = $${params.length}`)
  }

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`l.empresa = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(MONTH FROM p.vencimento)::int AS mes,
            COALESCE(SUM(p.valor), 0) AS total
       FROM fin_parcelas_cp p
       JOIN fin_lancamentos_cp l ON l.id = p.lancamento_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  const valores = emptyMonthMap()
  for (const r of rows) valores[Number(r.mes)] = -Math.abs(parseFloat(r.total || 0))
  return valores
}

async function getContasReceberFuturoAberto(empresa, ano, mes = null) {
  // O módulo de Contas a Receber ainda pode não existir neste banco.
  // Por isso a consulta é defensiva e só roda se as tabelas/colunas estiverem presentes.
  const hasParc = await tableExists('fin_parcelas_cr')
  const hasLanc = await tableExists('fin_lancamentos_cr')
  if (!hasParc || !hasLanc) return emptyMonthMap()

  const pCols = await getTableColumns('fin_parcelas_cr')
  const lCols = await getTableColumns('fin_lancamentos_cr')
  const vencCol = pickColumn(pCols, ['vencimento', 'data_vencimento', 'dt_vencimento'])
  const valorCol = pickColumn(pCols, ['valor', 'valor_parcela', 'valor_total'])
  const statusCol = pickColumn(pCols, ['status', 'parcela_status'])
  const lancCol = pickColumn(pCols, ['lancamento_id', 'conta_receber_id', 'receber_id'])
  const empCol = pickColumn(lCols, ['empresa'])

  if (!vencCol || !valorCol || !lancCol || !empCol) return emptyMonthMap()

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = [ano]
  const conditions = [
    `p.${vencCol} IS NOT NULL`,
    `EXTRACT(YEAR FROM p.${vencCol})::int = $1`,
  ]

  if (statusCol) {
    params.push([...STATUS_PAGO_CR, ...STATUS_CANCELADO])
    conditions.push(`LOWER(COALESCE(p.${statusCol}::text, 'aberta')) <> ALL($${params.length})`)
  }

  if (mes) {
    params.push(mes)
    conditions.push(`EXTRACT(MONTH FROM p.${vencCol})::int = $${params.length}`)
  }

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`l.${empCol} = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(MONTH FROM p.${vencCol})::int AS mes,
            COALESCE(SUM(p.${valorCol}), 0) AS total
       FROM fin_parcelas_cr p
       JOIN fin_lancamentos_cr l ON l.id = p.${lancCol}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  const valores = emptyMonthMap()
  for (const r of rows) valores[Number(r.mes)] = Math.abs(parseFloat(r.total || 0))
  return valores
}


async function getContasPagarFuturoAbertoDiario(empresa, ano, mes) {
  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const valores = emptyDayMap(ano, mes)
  const params = [ano, mes, STATUS_ABERTO_CP]
  const conditions = [
    `p.vencimento IS NOT NULL`,
    `EXTRACT(YEAR FROM p.vencimento)::int = $1`,
    `EXTRACT(MONTH FROM p.vencimento)::int = $2`,
    `LOWER(COALESCE(p.status::text, 'pendente')) = ANY($3)`,
  ]

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`l.empresa = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(DAY FROM p.vencimento)::int AS dia,
            COALESCE(SUM(p.valor), 0) AS total
       FROM fin_parcelas_cp p
       JOIN fin_lancamentos_cp l ON l.id = p.lancamento_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  for (const r of rows) valores[Number(r.dia)] = -Math.abs(parseFloat(r.total || 0))
  return valores
}

async function getContasReceberFuturoAbertoDiario(empresa, ano, mes) {
  const hasParc = await tableExists('fin_parcelas_cr')
  const hasLanc = await tableExists('fin_lancamentos_cr')
  const valores = emptyDayMap(ano, mes)
  if (!hasParc || !hasLanc) return valores

  const pCols = await getTableColumns('fin_parcelas_cr')
  const lCols = await getTableColumns('fin_lancamentos_cr')
  const vencCol = pickColumn(pCols, ['vencimento', 'data_vencimento', 'dt_vencimento'])
  const valorCol = pickColumn(pCols, ['valor', 'valor_parcela', 'valor_total'])
  const statusCol = pickColumn(pCols, ['status', 'parcela_status'])
  const lancCol = pickColumn(pCols, ['lancamento_id', 'conta_receber_id', 'receber_id'])
  const empCol = pickColumn(lCols, ['empresa'])

  if (!vencCol || !valorCol || !lancCol || !empCol) return valores

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = [ano, mes]
  const conditions = [
    `p.${vencCol} IS NOT NULL`,
    `EXTRACT(YEAR FROM p.${vencCol})::int = $1`,
    `EXTRACT(MONTH FROM p.${vencCol})::int = $2`,
  ]

  if (statusCol) {
    params.push([...STATUS_PAGO_CR, ...STATUS_CANCELADO])
    conditions.push(`LOWER(COALESCE(p.${statusCol}::text, 'aberta')) <> ALL($${params.length})`)
  }

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`l.${empCol} = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(DAY FROM p.${vencCol})::int AS dia,
            COALESCE(SUM(p.${valorCol}), 0) AS total
       FROM fin_parcelas_cr p
       JOIN fin_lancamentos_cr l ON l.id = p.${lancCol}
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  for (const r of rows) valores[Number(r.dia)] = Math.abs(parseFloat(r.total || 0))
  return valores
}

async function getMovimentoRealizadoDiario(empresa, ano, mes) {
  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const receitas = emptyDayMap(ano, mes)
  const despesas = emptyDayMap(ano, mes)
  const params = [ano, mes]
  const conditions = [
    `data IS NOT NULL`,
    `EXTRACT(YEAR FROM data)::int = $1`,
    `EXTRACT(MONTH FROM data)::int = $2`,
  ]

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`empresa = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(DAY FROM data)::int AS dia,
            COALESCE(SUM(entradas), 0) AS entradas,
            COALESCE(SUM(saidas), 0) AS saidas
       FROM fin_movimento
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  for (const r of rows) {
    const dia = Number(r.dia)
    receitas[dia] = Math.abs(parseFloat(r.entradas || 0))
    despesas[dia] = -Math.abs(parseFloat(r.saidas || 0))
  }

  return { receitas, despesas }
}

function sumMaps(...maps) {
  const result = {}
  for (const m of maps) {
    for (const [key, value] of Object.entries(m || {})) {
      result[key] = Number(result[key] || 0) + Number(value || 0)
    }
  }
  return result
}

function buildDailyColumns(ano, mes) {
  return Array.from({ length: daysInMonth(ano, mes) }, (_, i) => {
    const dia = i + 1
    return { mes: dia, dia, key: String(dia), label: String(dia).padStart(2, '0') }
  })
}

async function buildCashflowDiario(empresa, ano, mes) {
  const movimento = await getMovimentoRealizadoDiario(empresa, ano, mes)
  const cpFuturo = await getContasPagarFuturoAbertoDiario(empresa, ano, mes)
  const crFuturo = await getContasReceberFuturoAbertoDiario(empresa, ano, mes)
  const saldoDia = sumMaps(movimento.receitas, movimento.despesas, cpFuturo, crFuturo)

  const linhas = [
    { id: -8001, row_idx: 1, codigo: '1', descricao: 'Receitas Realizadas', nivel: 1, tipo: 'total', valores: movimento.receitas, total: mapTotal(movimento.receitas) },
    { id: -8002, row_idx: 2, codigo: '2', descricao: 'Despesas Realizadas', nivel: 1, tipo: 'total', valores: movimento.despesas, total: mapTotal(movimento.despesas) },
    { id: -8003, row_idx: 3, codigo: '3', descricao: 'Contas a Pagar Futuro em Aberto', nivel: 1, tipo: 'total', valores: cpFuturo, total: mapTotal(cpFuturo) },
    { id: -8004, row_idx: 4, codigo: '4', descricao: 'Contas a Receber Futuro em Aberto', nivel: 1, tipo: 'total', valores: crFuturo, total: mapTotal(crFuturo) },
    { id: -8005, row_idx: 5, codigo: '5', descricao: 'Saldo do Dia', nivel: 1, tipo: 'header', valores: saldoDia, total: mapTotal(saldoDia) },
  ]

  return {
    linhas,
    colunas: buildDailyColumns(ano, mes),
    empresa,
    ano,
    mes,
    visao: 'diaria',
  }
}

function mapTotal(valores, mes = null) {
  if (mes) return Number(valores[mes] || 0)
  return Object.values(valores).reduce((s, v) => s + Number(v || 0), 0)
}

// ─── GET /financeiro/cashflow ─────────────────────────────────────────────────
// Query params: empresa, ano, mes (opcional — se omitido traz todos os meses)
router.get('/cashflow', async (req, res) => {
  const empresa = normalizeEmpresaFilter(req.query.empresa)
  const ano     = parseInt(req.query.ano || new Date().getFullYear())
  const visao   = String(req.query.visao || 'mensal').toLowerCase()
  const mes     = req.query.mes ? parseInt(req.query.mes) : null

  try {
    if (visao === 'diaria') {
      const mesDiario = mes || (new Date().getMonth() + 1)
      const dataDiaria = await buildCashflowDiario(empresa, ano, mesDiario)
      return res.json({ ok: true, data: dataDiaria })
    }

    // Busca todas as linhas hierárquicas já importadas do Excel.
    const { rows: linhasImportadas } = await query(
      `SELECT id, row_idx, codigo, descricao, nivel, tipo
       FROM fin_cashflow_linhas ORDER BY row_idx`
    )

    // Busca valores agrupados por mês ou para o mês específico.
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

    // Monta mapa linha_id -> { mes -> valor }.
    const valMap = {}
    const mesesSet = new Set()
    for (const v of valores) {
      if (!valMap[v.linha_id]) valMap[v.linha_id] = {}
      valMap[v.linha_id][v.mes] = parseFloat(v.valor)
      mesesSet.add(v.mes)
    }

    // Regra de negócio:
    // - parcelas abertas alimentam o Cash Flow futuro;
    // - parcelas baixadas/pagas saem do futuro e entram no Movimento Bancário.
    const cpFuturo = await getContasPagarFuturoAberto(empresa, ano, mes)
    const crFuturo = await getContasReceberFuturoAberto(empresa, ano, mes)

    const linhas = [...linhasImportadas]
    const maxRowIdx = linhas.reduce((max, l) => Math.max(max, Number(l.row_idx || 0)), 0)

    const addLinhaFutura = (id, rowIdx, codigo, descricao, valoresMes) => {
      const total = mapTotal(valoresMes, mes)
      if (total === 0) return
      linhas.push({ id, row_idx: rowIdx, codigo, descricao, nivel: 1, tipo: 'total' })
      valMap[id] = valoresMes
      Object.entries(valoresMes).forEach(([m, v]) => {
        if (Number(v) !== 0) mesesSet.add(Number(m))
      })
    }

    addLinhaFutura(-9001, maxRowIdx + 1, 'FCP', 'Contas a Pagar Futuro em Aberto', cpFuturo)
    addLinhaFutura(-9002, maxRowIdx + 2, 'FCR', 'Contas a Receber Futuro em Aberto', crFuturo)

    if (!linhas.length) {
      return res.json({ ok: true, data: { linhas: [], colunas: [], empresa, ano } })
    }

    const MESES_NOME = ['', 'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const colunas = mes
      ? [{ mes, label: MESES_NOME[mes] }]
      : [...mesesSet].sort((a, b) => a - b).map(m => ({ mes: m, label: MESES_NOME[m] }))

    // Monta linhas com valores + total do ano.
    const data = linhas.map(l => {
      const vals = valMap[l.id] || {}
      const total = Object.values(vals).reduce((s, v) => s + Number(v || 0), 0)
      return {
        ...l,
        valores: vals,
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
    const selects = [
      `SELECT DISTINCT empresa, ano
         FROM fin_cashflow_valores
        WHERE empresa IS NOT NULL AND ano IS NOT NULL`,
    ]

    if (await tableExists('fin_lancamentos_cp')) {
      selects.push(
        `SELECT DISTINCT empresa, EXTRACT(YEAR FROM COALESCE(dt_emissao::timestamp, created_at))::int AS ano
           FROM fin_lancamentos_cp
          WHERE empresa IS NOT NULL AND COALESCE(dt_emissao::timestamp, created_at) IS NOT NULL`
      )
    }

    if (await tableExists('fin_movimento')) {
      selects.push(
        `SELECT DISTINCT empresa, ano
           FROM fin_movimento
          WHERE empresa IS NOT NULL AND ano IS NOT NULL`
      )
    }

    const { rows } = await query(
      `${selects.join(' UNION ')} ORDER BY ano DESC, empresa ASC`
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

    // Soma os lançamentos futuros em aberto no resumo.
    // CP entra negativo; CR entra positivo. Ao baixar/pagar, estes valores saem daqui.
    const cpFuturo = await getContasPagarFuturoAberto(empresa, ano, mes)
    const crFuturo = await getContasReceberFuturoAberto(empresa, ano, mes)
    const totalCpFuturo = mapTotal(cpFuturo, mes)
    const totalCrFuturo = mapTotal(crFuturo, mes)
    const impactoFuturo = totalCpFuturo + totalCrFuturo

    result.receita_bruta = Number(result.receita_bruta || 0) + totalCrFuturo
    result.receita_liquida = Number(result.receita_liquida || 0) + totalCrFuturo
    result.despesas = Number(result.despesas || 0) + totalCpFuturo
    result.geracao_caixa = Number(result.geracao_caixa || 0) + impactoFuturo
    result.saldo_final = Number(result.saldo_final || 0) + impactoFuturo
    result.contas_pagar_futuro_aberto = totalCpFuturo
    result.contas_receber_futuro_aberto = totalCrFuturo

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
