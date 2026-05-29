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
const DEFAULT_MOVIMENTO_YEAR = 2026

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
  const empresa         = req.query.empresa || ''
  const banco           = req.query.banco || ''
  const contaId         = req.query.conta_id || ''
  const fornecedorId    = req.query.fornecedor_id || ''
  const tipoDocumentoId = req.query.tipo_documento_id || ''
  const status          = req.query.status || ''
  const dataDe          = req.query.data_de || ''
  const dataAte         = req.query.data_ate || ''
  const ano             = req.query.ano ? parseInt(req.query.ano, 10) : DEFAULT_MOVIMENTO_YEAR
  const mes             = req.query.mes ? parseInt(req.query.mes, 10) : null
  const busca           = req.query.busca || ''
  const tipo            = req.query.tipo || '' // entrada | saida
  const ordenar         = req.query.ordenar || 'data_desc'

  const conditions = []
  const params = []

  if (empresa) {
    params.push(String(empresa).toUpperCase())
    conditions.push(`fm.empresa = $${params.length}`)
  }
  if (banco) {
    params.push(`%${banco}%`)
    conditions.push(`COALESCE(b.banco_nome, fm.banco, '') ILIKE $${params.length}`)
  }
  if (contaId) {
    params.push(contaId)
    conditions.push(`COALESCE(l.banco_conta_id, fm.banco_conta_id)::text = $${params.length}`)
  }
  if (fornecedorId) {
    params.push(fornecedorId)
    conditions.push(`COALESCE(l.fornecedor_id, fm.fornecedor_id)::text = $${params.length}`)
  }
  if (tipoDocumentoId) {
    params.push(tipoDocumentoId)
    conditions.push(`l.tipo_documento_id::text = $${params.length}`)
  }
  if (status) {
    params.push(String(status).toLowerCase())
    conditions.push(`LOWER(COALESCE(p.status::text, 'realizado')) = $${params.length}`)
  }
  if (dataDe) {
    params.push(dataDe)
    conditions.push(`fm.data >= $${params.length}`)
  }
  if (dataAte) {
    params.push(dataAte)
    conditions.push(`fm.data <= $${params.length}`)
  }
  if (Number.isFinite(ano)) {
    params.push(ano)
    conditions.push(`COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) = $${params.length}`)
  }
  if (Number.isFinite(mes)) {
    params.push(mes)
    conditions.push(`COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int) = $${params.length}`)
  }
  if (tipo === 'entrada') conditions.push(`COALESCE(fm.entradas, 0) > 0`)
  if (tipo === 'saida')   conditions.push(`COALESCE(fm.saidas, 0) > 0`)
  if (busca) {
    params.push(`%${busca}%`)
    conditions.push(`(
      COALESCE(f.razao_social, fm.fornecedor, '') ILIKE $${params.length}
      OR COALESCE(fm.historico, '') ILIKE $${params.length}
      OR COALESCE(l.nf_doc, fm.nf_doc, '') ILIKE $${params.length}
      OR COALESCE(fm.conta_contabil, '') ILIKE $${params.length}
      OR COALESCE(fm.centro_custo, '') ILIKE $${params.length}
      OR COALESCE(fm.obra, '') ILIKE $${params.length}
      OR COALESCE(fm.natureza_financeira, '') ILIKE $${params.length}
      OR COALESCE(fm.n_cheque, '') ILIKE $${params.length}
      OR COALESCE(td.nome, '') ILIKE $${params.length}
      OR COALESCE(b.banco_nome, fm.banco, '') ILIKE $${params.length}
    )`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const baseSelect = `
    FROM fin_movimento fm
    LEFT JOIN fin_parcelas_cp p ON p.movimento_id = fm.id
    LEFT JOIN fin_lancamentos_cp l ON l.id = p.lancamento_id
    LEFT JOIN fin_fornecedores f ON f.id = COALESCE(l.fornecedor_id, fm.fornecedor_id)
    LEFT JOIN fin_bancos_contas b ON b.id = COALESCE(l.banco_conta_id, fm.banco_conta_id)
    LEFT JOIN fin_tipos_documento td ON td.id = l.tipo_documento_id
    ${where}
  `

  const ORDER_MAP = {
    data_asc: 'fm.data ASC NULLS LAST, fm.id ASC',
    data_desc: 'fm.data DESC NULLS LAST, fm.id DESC',
    empresa_asc: 'fm.empresa ASC NULLS LAST, fm.data DESC',
    empresa_desc: 'fm.empresa DESC NULLS LAST, fm.data DESC',
    banco_asc: 'banco ASC NULLS LAST, fm.data DESC',
    banco_desc: 'banco DESC NULLS LAST, fm.data DESC',
    entradas_asc: 'fm.entradas ASC NULLS LAST, fm.data DESC',
    entradas_desc: 'fm.entradas DESC NULLS LAST, fm.data DESC',
    saidas_asc: 'fm.saidas ASC NULLS LAST, fm.data DESC',
    saidas_desc: 'fm.saidas DESC NULLS LAST, fm.data DESC',
    fornecedor_asc: 'fornecedor ASC NULLS LAST, fm.data DESC',
    fornecedor_desc: 'fornecedor DESC NULLS LAST, fm.data DESC',
    historico_asc: 'fm.historico ASC NULLS LAST, fm.data DESC',
    historico_desc: 'fm.historico DESC NULLS LAST, fm.data DESC',
    nf_doc_asc: 'documento ASC NULLS LAST, fm.data DESC',
    nf_doc_desc: 'documento DESC NULLS LAST, fm.data DESC',
    emissao_doc_asc: 'fm.emissao_doc ASC NULLS LAST, fm.data DESC',
    emissao_doc_desc: 'fm.emissao_doc DESC NULLS LAST, fm.data DESC',
    conta_contabil_asc: 'fm.conta_contabil ASC NULLS LAST, fm.data DESC',
    conta_contabil_desc: 'fm.conta_contabil DESC NULLS LAST, fm.data DESC',
    centro_custo_asc: 'fm.centro_custo ASC NULLS LAST, fm.data DESC',
    centro_custo_desc: 'fm.centro_custo DESC NULLS LAST, fm.data DESC',
    obra_asc: 'fm.obra ASC NULLS LAST, fm.data DESC',
    obra_desc: 'fm.obra DESC NULLS LAST, fm.data DESC',
    natureza_financeira_asc: 'fm.natureza_financeira ASC NULLS LAST, fm.data DESC',
    natureza_financeira_desc: 'fm.natureza_financeira DESC NULLS LAST, fm.data DESC',
    n_cheque_asc: 'fm.n_cheque ASC NULLS LAST, fm.data DESC',
    n_cheque_desc: 'fm.n_cheque DESC NULLS LAST, fm.data DESC',
    saldo_asc: 'fm.saldo ASC NULLS LAST, fm.data DESC',
    saldo_desc: 'fm.saldo DESC NULLS LAST, fm.data DESC',
  }
  const orderClause = ORDER_MAP[ordenar] || ORDER_MAP.data_desc

  try {
    const dataParams = [...params, limit, offset]
    const { rows } = await query(`
      SELECT
        fm.id,
        TO_CHAR(fm.data, 'YYYY-MM-DD') AS data,
        fm.empresa,
        CASE
          WHEN p.id IS NOT NULL THEN 'Contas a Pagar'
          WHEN COALESCE(fm.historico, '') ILIKE 'Saldo inicial%' THEN 'Saldo Inicial'
          WHEN COALESCE(fm.historico, '') ILIKE 'Taxa bancária%' THEN 'Taxa Bancária'
          WHEN COALESCE(fm.historico, '') ILIKE 'Rendimento%' THEN 'Rendimento'
          WHEN COALESCE(fm.historico, '') ILIKE 'Aplicação%' THEN 'Aplicação'
          WHEN COALESCE(fm.entradas, 0) > 0 THEN 'Entrada'
          WHEN COALESCE(fm.saidas, 0) > 0 THEN 'Saída'
          ELSE 'Movimento'
        END AS origem,
        COALESCE(b.banco_nome, fm.banco) AS banco,
        COALESCE(f.razao_social, fm.fornecedor) AS fornecedor,
        td.nome AS tipo_documento,
        COALESCE(l.nf_doc, fm.nf_doc) AS documento,
        COALESCE(l.nf_doc, fm.nf_doc) AS nf_doc,
        TO_CHAR(fm.emissao_doc, 'YYYY-MM-DD') AS emissao_doc,
        fm.historico,
        fm.conta_contabil,
        fm.centro_custo,
        fm.obra,
        fm.natureza_financeira,
        fm.n_cheque,
        fm.saldo,
        COALESCE(p.status, 'realizado') AS status,
        COALESCE(fm.entradas, 0) AS entradas,
        COALESCE(fm.saidas, 0) AS saidas,
        COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int) AS mes,
        COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) AS ano
      ${baseSelect}
      ORDER BY ${orderClause}
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams)

    const { rows: ct } = await query(`
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(fm.entradas), 0) AS total_entradas,
        COALESCE(SUM(fm.saidas), 0) AS total_saidas
      ${baseSelect}
    `, params)

    return res.json({
      ok: true,
      data: rows.map(r => ({
        ...r,
        saldo: r.saldo === null ? null : parseFloat(r.saldo || 0),
        entradas: parseFloat(r.entradas || 0),
        saidas: parseFloat(r.saidas || 0),
        mes: parseInt(r.mes || 0, 10),
        ano: parseInt(r.ano || 0, 10),
      })),
      summary: {
        total_entradas: parseFloat(ct[0].total_entradas),
        total_saidas: parseFloat(ct[0].total_saidas),
        saldo_periodo: parseFloat(ct[0].total_entradas) - parseFloat(ct[0].total_saidas),
      },
      pagination: {
        page,
        limit,
        total: parseInt(ct[0].count),
        pages: Math.ceil(parseInt(ct[0].count) / limit),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/movimento/filtros ────────────────────────────────────────
router.get('/movimento/filtros', async (req, res) => {
  try {
    const [empresas, bancos, contas, fornecedores, tiposDocumento, anos, status] = await Promise.all([
      query(`
        SELECT DISTINCT empresa FROM (
          SELECT empresa FROM fin_movimento WHERE empresa IS NOT NULL
          UNION
          SELECT empresa FROM fin_bancos_contas WHERE empresa IS NOT NULL
        ) x ORDER BY empresa
      `),
      query(`
        SELECT DISTINCT banco FROM (
          SELECT banco FROM fin_movimento WHERE banco IS NOT NULL
          UNION
          SELECT banco_nome AS banco FROM fin_bancos_contas WHERE banco_nome IS NOT NULL
        ) x ORDER BY banco
      `),
      query(`
        SELECT id,
               CONCAT_WS(' | ', empresa, banco_nome, NULLIF(agencia, ''), NULLIF(CONCAT_WS('-', conta, NULLIF(digito, '')), '')) AS label
          FROM fin_bancos_contas
         WHERE ativo = true
         ORDER BY empresa, banco_nome, agencia, conta
      `),
      query(`SELECT id, COALESCE(nome_fantasia, razao_social) AS nome FROM fin_fornecedores WHERE ativo = true ORDER BY nome`),
      query(`SELECT id, nome FROM fin_tipos_documento WHERE ativo = true ORDER BY nome`),
      query(`SELECT DISTINCT COALESCE(ano, EXTRACT(YEAR FROM data)::int) AS ano FROM fin_movimento WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int) IS NOT NULL ORDER BY ano`),
      query(`
        SELECT DISTINCT status FROM (
          SELECT COALESCE(status, 'realizado') AS status FROM fin_parcelas_cp
          UNION SELECT 'realizado' AS status
        ) s ORDER BY status
      `),
    ])

    return res.json({
      ok: true,
      data: {
        empresas: empresas.rows.map(r => r.empresa),
        bancos: bancos.rows.map(r => r.banco),
        contas: contas.rows,
        fornecedores: fornecedores.rows,
        tipos_documento: tiposDocumento.rows,
        anos: Array.from(new Set([
          ...Array.from({ length: DEFAULT_MOVIMENTO_YEAR - 2021 + 1 }, (_, i) => 2021 + i),
          ...anos.rows.map(r => Number(r.ano)).filter(Number.isFinite),
        ])).sort((a, b) => a - b),
        status: status.rows.map(r => r.status),
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/movimento/resumo ────────────────────────────────────────
router.get('/movimento/resumo', async (req, res) => {
  const empresa = req.query.empresa ? req.query.empresa.toUpperCase() : null
  const ano     = req.query.ano ? parseInt(req.query.ano) : DEFAULT_MOVIMENTO_YEAR
  const mes     = req.query.mes ? parseInt(req.query.mes) : null

  const conditions = ['COALESCE(ano, EXTRACT(YEAR FROM data)::int) = $1']
  const params     = [ano]

  if (empresa) { params.push(empresa); conditions.push(`empresa = $${params.length}`) }
  if (mes) { params.push(mes); conditions.push(`mes = $${params.length}`) }

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
