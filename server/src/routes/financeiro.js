/**
 * src/routes/financeiro.js
 * CashFlow Consolidado + Movimento Bancário
 */

const express          = require('express')
const { query, transaction } = require('../config/database')
const { authenticate } = require('../middleware/authenticate')
const { PLANO_CONTAS_SEED } = require('../data/plano_contas_seed')

const router = express.Router()
router.use(authenticate)


// Valores futuros em aberto entram no Cash Flow apenas enquanto estiverem pendentes.
// Quando a parcela é baixada/paga, ela sai daqui e passa a aparecer no Movimento Bancário pago/recebido.
const STATUS_ABERTO_CP = ['pendente', 'vencido', 'aberto', 'aberta']
const STATUS_PAGO_CR   = ['pago', 'paga', 'quitado', 'quitada', 'recebido', 'recebida', 'q']
const STATUS_CANCELADO = ['cancelado', 'cancelada', 'c']
const DEFAULT_MOVIMENTO_YEAR = 2026
const MOVIMENTO_REALIZADO_CUTOFF_2026 = '2026-06-28'

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function sendExcelXml(res, filename, sheetName, columns, rows) {
  const header = columns.map(c => `<Cell><Data ss:Type="String">${xmlEscape(c.header)}</Data></Cell>`).join('')
  const body = rows.map(row => {
    const cells = columns.map(c => {
      const raw = typeof c.value === 'function' ? c.value(row) : row[c.key]
      const value = raw === null || raw === undefined ? '' : raw
      const numeric = typeof value === 'number' && Number.isFinite(value)
      return `<Cell><Data ss:Type="${numeric ? 'Number' : 'String'}">${xmlEscape(value)}</Data></Cell>`
    }).join('')
    return `<Row>${cells}</Row>`
  }).join('')
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="${xmlEscape(sheetName).slice(0, 31) || 'Export'}">
  <Table><Row>${header}</Row>${body}</Table>
 </Worksheet>
</Workbook>`
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.send(xml)
}


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

async function getSaldoInicialBancosMovimento({ empresa, banco, contaId, ano, detalhado = false }) {
  const result = { saldo_inicial: 0, contas_consideradas: 0, origem: 'fin_bancos_contas' }
  if (!(await tableExists('fin_bancos_contas'))) return detalhado ? result : 0

  const columns = await getTableColumns('fin_bancos_contas')
  const saldoColumn = pickColumn(columns, ['saldo_inicial', 'saldo', 'valor_inicial'])
  if (!saldoColumn) return detalhado ? result : 0

  const anoBase = Number.isFinite(Number(ano)) ? Number(ano) : DEFAULT_MOVIMENTO_YEAR
  const params = []
  const conditions = []

  if (columns.has('ativo')) {
    conditions.push(`COALESCE(bc.ativo, true) = true`)
  }

  if (empresa) {
    params.push(String(empresa).trim().toUpperCase())
    conditions.push(`UPPER(TRIM(COALESCE(bc.empresa, ''))) = $${params.length}`)
  }

  if (banco && columns.has('banco_nome')) {
    params.push(`%${String(banco).trim()}%`)
    conditions.push(`COALESCE(bc.banco_nome, '') ILIKE $${params.length}`)
  }

  if (contaId) {
    params.push(String(contaId))
    conditions.push(`bc.id::text = $${params.length}`)
  }

  if (columns.has('data_saldo_inicial')) {
    params.push(anoBase)
    conditions.push(`(bc.data_saldo_inicial IS NULL OR EXTRACT(YEAR FROM bc.data_saldo_inicial)::int = $${params.length})`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const { rows } = await query(
    `SELECT
        COUNT(*)::int AS contas_consideradas,
        COALESCE(SUM(COALESCE(bc.${saldoColumn}, 0)), 0)::float AS saldo_inicial
       FROM fin_bancos_contas bc
       ${where}`,
    params
  )

  result.saldo_inicial = parseFloat(rows[0]?.saldo_inicial || 0)
  result.contas_consideradas = parseInt(rows[0]?.contas_consideradas || 0, 10)
  result.origem = `fin_bancos_contas.${saldoColumn}`
  return detalhado ? result : result.saldo_inicial
}


async function getMovimentoRealizadoGuardCondition(alias = 'fm') {
  const cpExists = await tableExists('fin_parcelas_cp')
  const crExists = await tableExists('fin_parcelas_cr')

  const linkedChecks = []
  if (cpExists) linkedChecks.push(`EXISTS (SELECT 1 FROM fin_parcelas_cp p_guard WHERE p_guard.movimento_id = ${alias}.id)`)
  if (crExists) linkedChecks.push(`EXISTS (SELECT 1 FROM fin_parcelas_cr cr_guard WHERE cr_guard.movimento_id = ${alias}.id)`)

  const linkedSql = linkedChecks.length ? ` OR ${linkedChecks.join(' OR ')}` : ''

  return `(
    COALESCE(${alias}.ano, EXTRACT(YEAR FROM ${alias}.data)::int) <> 2026
    OR ${alias}.data IS NULL
    OR ${alias}.data <= DATE '${MOVIMENTO_REALIZADO_CUTOFF_2026}'
    ${linkedSql}
  )`
}

function movimentoCodigoMatches(linhaCodigo, movimentoCodigo) {
  const linha = normalizeCashflowCodigo(linhaCodigo)
  const mov = normalizeCashflowCodigo(movimentoCodigo)
  if (!linha || !mov) return false

  // Códigos inteiros, como 1, 4 e 7, são grupos e recebem seus filhos 1.1, 4.2 etc.
  if (/^\d+$/.test(linha)) return mov === linha || mov.startsWith(`${linha}.`)

  // Códigos decimais precisam bater exatamente para não misturar 4.1 com 4.10, 4.11 etc.
  return mov === linha
}

async function getOrcamentoRealizadoFromMovimento(linhasBase, empresa, ano, mes = null) {
  const realizadosPorRowIdx = {}
  if (!(await tableExists('fin_movimento'))) return realizadosPorRowIdx

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = [ano]
  const conditions = [
    `COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) = $1`,
    await getMovimentoRealizadoGuardCondition('fm'),
  ]

  if (mes) {
    params.push(mes)
    conditions.push(`COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int) = $${params.length}`)
  }

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`UPPER(TRIM(COALESCE(fm.empresa::text, ''))) = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT
        TRIM(COALESCE(fm.natureza_financeira::text, '')) AS natureza_financeira,
        COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int)::int AS mes,
        COALESCE(SUM(COALESCE(fm.entradas, 0)), 0)::float AS entradas,
        COALESCE(SUM(COALESCE(fm.saidas, 0)), 0)::float AS saidas
       FROM fin_movimento fm
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1, 2`,
    params
  )

  for (const linha of linhasBase) {
    const codigoLinha = normalizeCashflowCodigo(linha.codigo)
    if (!codigoLinha) continue

    for (const mov of rows) {
      if (!movimentoCodigoMatches(codigoLinha, mov.natureza_financeira)) continue
      const valor = Number(mov.entradas || 0) - Number(mov.saidas || 0)
      setMesValue(realizadosPorRowIdx, linha.row_idx, mov.mes, valor)
    }
  }

  return realizadosPorRowIdx
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
  const params = []
  const conditions = []
  addMovimentoPeriodoConditions(conditions, params, 'm', ano, mes)
  conditions.push(await getMovimentoRealizadoGuardCondition('m'))

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(String(empresaFiltro || '').toUpperCase().trim())
    conditions.push(`UPPER(TRIM(COALESCE(m.empresa::text, ''))) = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT COALESCE(EXTRACT(DAY FROM m.data)::int, m.dia)::int AS dia,
            COALESCE(SUM(CASE WHEN COALESCE(m.entradas, 0) <> 0 THEN ABS(m.entradas) ELSE 0 END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN COALESCE(m.saidas, 0) <> 0 THEN ABS(m.saidas) ELSE 0 END), 0) AS saidas
       FROM fin_movimento m
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  for (const r of rows) {
    const dia = Number(r.dia)
    if (!Number.isFinite(dia) || dia < 1) continue
    receitas[dia] = Math.abs(parseFloat(r.entradas || 0))
    despesas[dia] = -Math.abs(parseFloat(r.saidas || 0))
  }

  // Lançamentos internos que existem somente em fin_bancos_lancamentos
  // (sem movimento_id) também compõem a visão diária. Os que possuem
  // movimento_id já aparecem pelo fin_movimento e não são duplicados aqui.
  const bancosInternos = await getBancosLancamentosRealizadoDiario(empresa, ano, mes)
  return {
    receitas: sumMaps(receitas, bancosInternos.receitas),
    despesas: sumMaps(despesas, bancosInternos.despesas),
  }
}

async function getBancosLancamentosRealizadoDiario(empresa, ano, mes) {
  const receitas = emptyDayMap(ano, mes)
  const despesas = emptyDayMap(ano, mes)

  if (!(await tableExists('fin_bancos_lancamentos')) || !(await tableExists('fin_bancos_contas'))) {
    return { receitas, despesas }
  }

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = [ano, mes]
  const conditions = [
    `bl.movimento_id IS NULL`,
    `bl.data IS NOT NULL`,
    `EXTRACT(YEAR FROM bl.data)::int = $1`,
    `EXTRACT(MONTH FROM bl.data)::int = $2`,
  ]

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(String(empresaFiltro || '').toUpperCase().trim())
    conditions.push(`UPPER(TRIM(COALESCE(bc.empresa::text, ''))) = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT EXTRACT(DAY FROM bl.data)::int AS dia,
            COALESCE(SUM(CASE WHEN bl.tipo = 'taxa' OR COALESCE(bl.valor, 0) < 0 THEN 0 ELSE ABS(bl.valor) END), 0) AS entradas,
            COALESCE(SUM(CASE WHEN bl.tipo = 'taxa' OR COALESCE(bl.valor, 0) < 0 THEN ABS(bl.valor) ELSE 0 END), 0) AS saidas
       FROM fin_bancos_lancamentos bl
       JOIN fin_bancos_contas bc ON bc.id = bl.conta_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1
      ORDER BY 1`,
    params
  )

  for (const r of rows) {
    const dia = Number(r.dia)
    if (!Number.isFinite(dia) || dia < 1) continue
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
  const hasCashflowLines = await tableExists('fin_cashflow_linhas')

  // Fallback defensivo para instalações antigas que ainda não possuem a
  // estrutura hierárquica do Cash Flow importada.
  if (!hasCashflowLines) {
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

  const { rows: linhasImportadas } = await query(
    `SELECT id, row_idx, codigo, descricao, nivel, tipo
       FROM fin_cashflow_linhas
      ORDER BY row_idx`
  )

  const [dailyBreakdown, movimento, cpFuturo, crFuturo] = await Promise.all([
    getCashflowDailyBreakdown({ linhasImportadas, empresa, ano, mes }),
    getMovimentoRealizadoDiario(empresa, ano, mes),
    getContasPagarFuturoAbertoDiario(empresa, ano, mes),
    getContasReceberFuturoAbertoDiario(empresa, ano, mes),
  ])

  // A visão diária agora usa a mesma estrutura da visão mensal. As contas
  // analíticas de terceiro nível são inseridas logo abaixo do respectivo pai.
  const linhasHierarquicas = []
  for (const linha of linhasImportadas) {
    linhasHierarquicas.push(linha)
    const codigo = normalizeCashflowCodigo(linha.codigo)
    const children = dailyBreakdown.childrenByParent.get(codigo) || []
    linhasHierarquicas.push(...children)
  }

  const maxRowIdx = linhasHierarquicas.reduce(
    (max, linha) => Math.max(max, Number(linha.row_idx || 0)),
    0,
  )

  // Mantém os lançamentos futuros e o saldo líquido diário que já existiam na
  // tela, mas agora abaixo do plano de contas completo em vez de substituí-lo.
  const saldoDia = sumMaps(movimento.receitas, movimento.despesas, cpFuturo, crFuturo)
  const linhasExtras = [
    { id: -8003, row_idx: maxRowIdx + 1, codigo: 'FCP', descricao: 'Contas a Pagar Futuro em Aberto', nivel: 1, tipo: 'total', valores: cpFuturo },
    { id: -8004, row_idx: maxRowIdx + 2, codigo: 'FCR', descricao: 'Contas a Receber Futuro em Aberto', nivel: 1, tipo: 'total', valores: crFuturo },
    { id: -8005, row_idx: maxRowIdx + 3, codigo: '', descricao: 'Saldo do Dia', nivel: 1, tipo: 'header', valores: saldoDia },
  ]

  const linhas = [...linhasHierarquicas, ...linhasExtras].map(linha => {
    const valores = linha.valores || dailyBreakdown.valueMap[linha.id] || emptyDayMap(ano, mes)
    return {
      ...linha,
      valores,
      total: mapTotal(valores),
    }
  })

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


function normalizeCashflowCodigo(codigo) {
  const raw = String(codigo || '').trim().replace(',', '.')
  if (!raw) return ''
  const match = raw.match(/^\d+(?:\.\d+)*\.?/)
  if (!match) return raw
  return match[0]
    .replace(/\.$/, '')
    .split('.')
    .filter(Boolean)
    .map(part => String(parseInt(part, 10)))
    .join('.')
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeAccountDescription(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function cashflowCodeParts(codigo) {
  const code = normalizeCashflowCodigo(codigo)
  if (!/^\d+(?:\.\d+)*$/.test(code)) return []
  return code.split('.').map(part => parseInt(part, 10))
}

function cashflowCodeDepth(codigo) {
  return cashflowCodeParts(codigo).length
}

function cashflowParentCode(codigo) {
  const parts = cashflowCodeParts(codigo)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('.')
}

function compareCashflowCodes(a, b) {
  const aa = cashflowCodeParts(a)
  const bb = cashflowCodeParts(b)
  const size = Math.max(aa.length, bb.length)

  for (let i = 0; i < size; i += 1) {
    if (aa[i] === undefined) return -1
    if (bb[i] === undefined) return 1
    if (aa[i] !== bb[i]) return aa[i] - bb[i]
  }

  return 0
}

function syntheticCashflowId(codigo) {
  const value = String(normalizeCashflowCodigo(codigo) || codigo || '')
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash * 31) + value.charCodeAt(i)) >>> 0
  }
  return -(1000000 + hash)
}

async function getCashflowAnalyticAccounts() {
  let source = []

  if (await tableExists('fin_plano_contas')) {
    const { rows } = await query(
      `SELECT
          c.id,
          c.codigo,
          c.descricao,
          c.tipo,
          p.codigo AS pai_codigo
         FROM fin_plano_contas c
         LEFT JOIN fin_plano_contas p ON p.id = c.pai_id
        WHERE COALESCE(c.ativo, true) = true
        ORDER BY c.codigo`
    )
    source = rows
  }

  // Fallback defensivo para instalações onde o plano de contas ainda não foi
  // migrado ou populado. O seed faz parte do próprio backend e preserva a mesma
  // estrutura usada pelo cadastro administrativo.
  if (!source.length) source = PLANO_CONTAS_SEED

  const byCode = new Map()

  for (const item of source) {
    const codigo = normalizeCashflowCodigo(item.codigo)
    const paiCodigo = normalizeCashflowCodigo(item.pai_codigo || cashflowParentCode(codigo))
    const tipo = String(item.tipo || '').trim().toUpperCase()

    if (!codigo || cashflowCodeDepth(codigo) < 3 || !paiCodigo) continue
    if (tipo && tipo !== 'A') continue

    byCode.set(codigo, {
      id: item.id ? Number(item.id) : null,
      codigo,
      descricao: String(item.descricao || codigo).trim(),
      pai_codigo: paiCodigo,
    })
  }

  return [...byCode.values()].sort((a, b) => compareCashflowCodes(a.codigo, b.codigo))
}

async function getCashflowAnalyticBreakdown({ linhasImportadas, empresa, ano, mes = null }) {
  const empty = { childrenByParent: new Map(), valueMap: {} }
  if (!(await tableExists('fin_movimento'))) return empty

  const parentLines = new Map()
  for (const linha of linhasImportadas || []) {
    const codigo = normalizeCashflowCodigo(linha.codigo)
    if (cashflowCodeDepth(codigo) === 2) parentLines.set(codigo, linha)
  }
  if (!parentLines.size) return empty

  const accounts = (await getCashflowAnalyticAccounts())
    .filter(account => parentLines.has(account.pai_codigo))
  if (!accounts.length) return empty

  const accountsByCode = new Map(accounts.map(account => [account.codigo, account]))
  const accountsByDescription = new Map()
  for (const account of accounts) {
    const key = normalizeAccountDescription(account.descricao)
    if (!key) continue
    if (!accountsByDescription.has(key)) accountsByDescription.set(key, [])
    accountsByDescription.get(key).push(account)
  }

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = [ano]
  const conditions = [
    `COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) = $1`,
  ]

  if (mes) {
    params.push(mes)
    conditions.push(`COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int) = $${params.length}`)
  }

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`UPPER(TRIM(COALESCE(fm.empresa::text, ''))) = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT
        COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int)::int AS mes,
        TRIM(COALESCE(fm.natureza_financeira::text, '')) AS natureza_financeira,
        TRIM(COALESCE(fm.conta_contabil::text, '')) AS conta_contabil,
        COALESCE(SUM(COALESCE(fm.entradas, 0)), 0)::float AS entradas,
        COALESCE(SUM(COALESCE(fm.saidas, 0)), 0)::float AS saidas
       FROM fin_movimento fm
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1, 2, 3`,
    params
  )

  const valuesByCode = new Map()

  for (const row of rows) {
    const month = Number(row.mes)
    if (!Number.isInteger(month) || month < 1 || month > 12) continue

    const naturezaCodigo = normalizeCashflowCodigo(row.natureza_financeira)
    let account = null

    // Quando o próprio movimento já traz 4.5.7 (ou outro terceiro nível),
    // respeita diretamente o código analítico informado.
    if (cashflowCodeDepth(naturezaCodigo) >= 3) {
      account = accountsByCode.get(naturezaCodigo) || null
    }

    // Na base atual a Natureza Financeira traz o pai (ex.: 4.5) e a Conta
    // Contábil identifica o filho (ex.: SEGURANÇA E VIGILÂNCIA). O vínculo é
    // aceito somente quando a descrição encontra uma conta analítica daquele pai.
    if (!account) {
      const descriptionKey = normalizeAccountDescription(row.conta_contabil)
      const candidates = accountsByDescription.get(descriptionKey) || []
      account = candidates.find(candidate => candidate.pai_codigo === naturezaCodigo) || null

      // Alguns movimentos antigos podem estar sem Natureza Financeira, mas com
      // uma Conta Contábil analítica inequívoca. Nesse caso o próprio plano define
      // o pai, desde que ele exista no Cash Flow importado.
      if (!account && cashflowCodeDepth(naturezaCodigo) === 0 && candidates.length === 1 && parentLines.has(candidates[0].pai_codigo)) {
        account = candidates[0]
      }
    }

    if (!account || !parentLines.has(account.pai_codigo)) continue

    const value = Number(row.entradas || 0) - Number(row.saidas || 0)
    if (!value) continue

    if (!valuesByCode.has(account.codigo)) valuesByCode.set(account.codigo, emptyMonthMap())
    const values = valuesByCode.get(account.codigo)
    values[month] = Number(values[month] || 0) + value
  }

  const childrenByParent = new Map()
  const valueMap = {}

  for (const account of accounts) {
    const values = valuesByCode.get(account.codigo)
    if (!values || mapTotal(values, mes) === 0) continue

    const parentLine = parentLines.get(account.pai_codigo)
    const id = account.id ? -(1000000 + account.id) : syntheticCashflowId(account.codigo)
    const parentChildren = childrenByParent.get(account.pai_codigo) || []
    const rowIdx = Number(parentLine.row_idx || 0) + ((parentChildren.length + 1) / 1000)

    const child = {
      id,
      row_idx: rowIdx,
      codigo: account.codigo,
      descricao: account.descricao,
      nivel: cashflowCodeDepth(account.codigo) + 1,
      tipo: 'item',
    }

    parentChildren.push(child)
    childrenByParent.set(account.pai_codigo, parentChildren)
    valueMap[id] = values
  }

  return { childrenByParent, valueMap }
}

function addDayValue(valueMap, id, ano, mes, dia, valor) {
  const day = Number(dia)
  const amount = Number(valor || 0)
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(ano, mes) || !amount) return
  if (!valueMap[id]) valueMap[id] = emptyDayMap(ano, mes)
  valueMap[id][day] = Number(valueMap[id][day] || 0) + amount
}

function mapWithSign(map, multiplier = 1) {
  return Object.fromEntries(
    Object.entries(map || {}).map(([key, value]) => [key, Number(value || 0) * multiplier]),
  )
}

function findCashflowLineForMovement(code, linesByCode) {
  let current = normalizeCashflowCodigo(code)
  if (!current) return null

  while (current) {
    if (linesByCode.has(current)) return linesByCode.get(current)
    current = cashflowParentCode(current)
  }

  return null
}

async function getCashflowDailyOpeningBalance(empresa, ano, mes) {
  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const saldoInicial = await getSaldoInicialBancosMovimento({
    empresa: empresaFiltro === 'CONSOLIDADO' ? null : empresaFiltro,
    ano,
  })

  let movimentoAnterior = 0
  if (await tableExists('fin_movimento')) {
    const params = [ano, mes]
    const conditions = [
      `COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) = $1`,
      `COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int) < $2`,
      await getMovimentoRealizadoGuardCondition('fm'),
    ]

    if (empresaFiltro !== 'CONSOLIDADO') {
      params.push(empresaFiltro)
      conditions.push(`UPPER(TRIM(COALESCE(fm.empresa::text, ''))) = $${params.length}`)
    }

    const { rows } = await query(
      `SELECT COALESCE(SUM(COALESCE(fm.entradas, 0) - COALESCE(fm.saidas, 0)), 0)::float AS total
         FROM fin_movimento fm
        WHERE ${conditions.join(' AND ')}`,
      params,
    )
    movimentoAnterior = Number(rows[0]?.total || 0)
  }

  let bancosAnteriores = 0
  if ((await tableExists('fin_bancos_lancamentos')) && (await tableExists('fin_bancos_contas'))) {
    const params = [ano, mes]
    const conditions = [
      `bl.movimento_id IS NULL`,
      `bl.data IS NOT NULL`,
      `EXTRACT(YEAR FROM bl.data)::int = $1`,
      `EXTRACT(MONTH FROM bl.data)::int < $2`,
      `bl.tipo <> 'saldo_inicial'`,
    ]

    if (empresaFiltro !== 'CONSOLIDADO') {
      params.push(empresaFiltro)
      conditions.push(`UPPER(TRIM(COALESCE(bc.empresa::text, ''))) = $${params.length}`)
    }

    const { rows } = await query(
      `SELECT COALESCE(SUM(
          CASE
            WHEN bl.tipo = 'taxa' OR COALESCE(bl.valor, 0) < 0 THEN -ABS(COALESCE(bl.valor, 0))
            ELSE ABS(COALESCE(bl.valor, 0))
          END
        ), 0)::float AS total
         FROM fin_bancos_lancamentos bl
         JOIN fin_bancos_contas bc ON bc.id = bl.conta_id
        WHERE ${conditions.join(' AND ')}`,
      params,
    )
    bancosAnteriores = Number(rows[0]?.total || 0)
  }

  return Number(saldoInicial || 0) + movimentoAnterior + bancosAnteriores
}

async function getCashflowDailyBreakdown({ linhasImportadas, empresa, ano, mes }) {
  const valueMap = {}
  const childrenByParent = new Map()
  const linesByCode = new Map()
  const linesByDescription = new Map()

  for (const linha of linhasImportadas || []) {
    valueMap[linha.id] = emptyDayMap(ano, mes)

    const codigo = normalizeCashflowCodigo(linha.codigo)
    if (codigo && !linesByCode.has(codigo)) linesByCode.set(codigo, linha)

    const descriptionKey = normalizeAccountDescription(linha.descricao)
    if (descriptionKey && !linesByDescription.has(descriptionKey)) {
      linesByDescription.set(descriptionKey, linha)
    }
  }

  const parentLines = new Map()
  for (const linha of linhasImportadas || []) {
    const codigo = normalizeCashflowCodigo(linha.codigo)
    if (cashflowCodeDepth(codigo) === 2) parentLines.set(codigo, linha)
  }

  const analyticAccounts = (await getCashflowAnalyticAccounts())
    .filter(account => parentLines.has(account.pai_codigo))
  const accountsByCode = new Map(analyticAccounts.map(account => [account.codigo, account]))
  const accountsByDescription = new Map()

  for (const account of analyticAccounts) {
    const key = normalizeAccountDescription(account.descricao)
    if (!key) continue
    if (!accountsByDescription.has(key)) accountsByDescription.set(key, [])
    accountsByDescription.get(key).push(account)
  }

  const analyticValuesByCode = new Map()
  const empresaFiltro = normalizeEmpresaFilter(empresa)

  if (await tableExists('fin_movimento')) {
    const params = [ano, mes]
    const conditions = [
      `COALESCE(fm.ano, EXTRACT(YEAR FROM fm.data)::int) = $1`,
      `COALESCE(fm.mes, EXTRACT(MONTH FROM fm.data)::int) = $2`,
      await getMovimentoRealizadoGuardCondition('fm'),
    ]

    if (empresaFiltro !== 'CONSOLIDADO') {
      params.push(empresaFiltro)
      conditions.push(`UPPER(TRIM(COALESCE(fm.empresa::text, ''))) = $${params.length}`)
    }

    const { rows } = await query(
      `SELECT
          COALESCE(EXTRACT(DAY FROM fm.data)::int, fm.dia)::int AS dia,
          TRIM(COALESCE(fm.natureza_financeira::text, '')) AS natureza_financeira,
          TRIM(COALESCE(fm.conta_contabil::text, '')) AS conta_contabil,
          COALESCE(SUM(COALESCE(fm.entradas, 0)), 0)::float AS entradas,
          COALESCE(SUM(COALESCE(fm.saidas, 0)), 0)::float AS saidas
         FROM fin_movimento fm
        WHERE ${conditions.join(' AND ')}
        GROUP BY 1, 2, 3
        ORDER BY 1, 2, 3`,
      params,
    )

    for (const row of rows) {
      const dia = Number(row.dia)
      const valor = Number(row.entradas || 0) - Number(row.saidas || 0)
      if (!Number.isInteger(dia) || !valor) continue

      const naturezaCodigo = normalizeCashflowCodigo(row.natureza_financeira)
      let analyticAccount = null

      if (cashflowCodeDepth(naturezaCodigo) >= 3) {
        analyticAccount = accountsByCode.get(naturezaCodigo) || null
      }

      if (!analyticAccount) {
        const descriptionKey = normalizeAccountDescription(row.conta_contabil)
        const candidates = accountsByDescription.get(descriptionKey) || []
        analyticAccount = candidates.find(candidate => candidate.pai_codigo === naturezaCodigo) || null

        if (!analyticAccount && cashflowCodeDepth(naturezaCodigo) === 0 && candidates.length === 1) {
          analyticAccount = candidates[0]
        }
      }

      let linhaBase = null
      if (analyticAccount) {
        linhaBase = parentLines.get(analyticAccount.pai_codigo) || null
        if (!analyticValuesByCode.has(analyticAccount.codigo)) {
          analyticValuesByCode.set(analyticAccount.codigo, emptyDayMap(ano, mes))
        }
        const analyticMap = analyticValuesByCode.get(analyticAccount.codigo)
        analyticMap[dia] = Number(analyticMap[dia] || 0) + valor
      }

      if (!linhaBase) {
        linhaBase = findCashflowLineForMovement(naturezaCodigo, linesByCode)
      }

      if (!linhaBase && row.natureza_financeira) {
        linhaBase = linesByDescription.get(normalizeAccountDescription(row.natureza_financeira)) || null
      }

      if (linhaBase) addDayValue(valueMap, linhaBase.id, ano, mes, dia, valor)
    }
  }

  // Lançamentos bancários internos sem movimento vinculado também precisam
  // aparecer dentro do plano de contas, e não somente no resumo diário.
  if ((await tableExists('fin_bancos_lancamentos')) && (await tableExists('fin_bancos_contas'))) {
    const params = [ano, mes]
    const conditions = [
      `bl.movimento_id IS NULL`,
      `bl.data IS NOT NULL`,
      `EXTRACT(YEAR FROM bl.data)::int = $1`,
      `EXTRACT(MONTH FROM bl.data)::int = $2`,
      `bl.tipo <> 'saldo_inicial'`,
    ]

    if (empresaFiltro !== 'CONSOLIDADO') {
      params.push(empresaFiltro)
      conditions.push(`UPPER(TRIM(COALESCE(bc.empresa::text, ''))) = $${params.length}`)
    }

    const { rows } = await query(
      `SELECT
          EXTRACT(DAY FROM bl.data)::int AS dia,
          bl.tipo,
          COALESCE(SUM(
            CASE
              WHEN bl.tipo = 'taxa' OR COALESCE(bl.valor, 0) < 0 THEN -ABS(COALESCE(bl.valor, 0))
              ELSE ABS(COALESCE(bl.valor, 0))
            END
          ), 0)::float AS valor
         FROM fin_bancos_lancamentos bl
         JOIN fin_bancos_contas bc ON bc.id = bl.conta_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY 1, 2
        ORDER BY 1, 2`,
      params,
    )

    const codeByBankType = {
      rendimento: '5.1',
      taxa: '5.2',
      aplicacao: '7.2',
    }

    for (const row of rows) {
      const linha = linesByCode.get(codeByBankType[row.tipo])
      if (linha) addDayValue(valueMap, linha.id, ano, mes, row.dia, row.valor)
    }
  }

  for (const account of analyticAccounts) {
    const valores = analyticValuesByCode.get(account.codigo)
    if (!valores || mapTotal(valores) === 0) continue

    const parentLine = parentLines.get(account.pai_codigo)
    const id = account.id ? -(1000000 + account.id) : syntheticCashflowId(account.codigo)
    const parentChildren = childrenByParent.get(account.pai_codigo) || []
    const rowIdx = Number(parentLine.row_idx || 0) + ((parentChildren.length + 1) / 1000)

    const child = {
      id,
      row_idx: rowIdx,
      codigo: account.codigo,
      descricao: account.descricao,
      nivel: cashflowCodeDepth(account.codigo) + 1,
      tipo: 'item',
    }

    parentChildren.push(child)
    childrenByParent.set(account.pai_codigo, parentChildren)
    valueMap[id] = valores
  }

  const lineForCode = code => linesByCode.get(normalizeCashflowCodigo(code)) || null
  const mapForCode = code => {
    const linha = lineForCode(code)
    return linha ? valueMap[linha.id] : emptyDayMap(ano, mes)
  }
  const setCodeMap = (code, valores) => {
    const linha = lineForCode(code)
    if (linha) valueMap[linha.id] = valores
  }
  const setDescriptionMap = (description, valores) => {
    const linha = linesByDescription.get(normalizeAccountDescription(description))
    if (linha) valueMap[linha.id] = valores
  }
  const rawCodeMap = code => mapForCode(code)
  const sumCodes = codes => sumMaps(...codes.map(code => rawCodeMap(code)))

  // Replica as mesmas fórmulas estruturais usadas pela planilha mensal, agora
  // por dia. As contas analíticas continuam somente como detalhamento e não são
  // somadas novamente, evitando duplicidade nos totais.
  const receitasBrutas = sumMaps(rawCodeMap('1'), sumCodes(['1.1', '1.2', '1.3', '1.4']))
  const deducoes = sumCodes(['1.9', '2.1'])
  const receitaLiquida = sumMaps(receitasBrutas, deducoes)
  const despesasGerais = sumMaps(
    rawCodeMap('4'),
    sumCodes(['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '4.10', '4.11', '4.12', '6.1']),
  )
  const receitasFinanceiras = rawCodeMap('5.1')
  const despesasFinanceiras = rawCodeMap('5.2')
  const emprestimos = rawCodeMap('7.4')
  const resultadoFinanceiro = sumMaps(receitasFinanceiras, despesasFinanceiras, emprestimos)
  const geracaoCaixa = sumMaps(receitaLiquida, despesasGerais, resultadoFinanceiro)

  const investimentoCodes = [...linesByCode.keys()].filter(code => (
    code === '7.2' || code === '7.3' || /^8\./.test(code)
  ))
  const investimentos = sumMaps(rawCodeMap('7'), ...investimentoCodes.map(code => rawCodeMap(code)))
  const distribuicaoLucros = rawCodeMap('9.1')
  const sucessao = rawCodeMap('10.1')

  setCodeMap('1', receitasBrutas)
  setCodeMap('4', despesasGerais)
  setCodeMap('7', investimentos)
  setDescriptionMap('Deduções das Receitas', deducoes)
  setDescriptionMap('Receita Líquida', receitaLiquida)
  setDescriptionMap('Receitas Financeiras', receitasFinanceiras)
  setDescriptionMap('Despesas Financeiras', despesasFinanceiras)
  setDescriptionMap('Emprestimos e Financiamentos', emprestimos)
  setDescriptionMap('Resultado Financeiro', resultadoFinanceiro)
  setDescriptionMap('Geração de Caixa', geracaoCaixa)
  setDescriptionMap('Distribuição de Lucros', distribuicaoLucros)
  setDescriptionMap('Sucessão', sucessao)

  const curtoPrazo = sumCodes(['CDB1', 'CDB2', 'LCA2', 'LCI Pós', 'FI'])
  const longoPrazo = sumCodes(['LCA', 'LCA V', 'CDBG', 'LCI'])
  const aplicacoes = sumMaps(curtoPrazo, longoPrazo)
  setDescriptionMap('Curto Prazo', curtoPrazo)
  setDescriptionMap('Longo Prazo', longoPrazo)
  setDescriptionMap('Aplicações Financeiras', aplicacoes)

  const aberturaMes = await getCashflowDailyOpeningBalance(empresa, ano, mes)
  const fluxoCaixa = sumMaps(geracaoCaixa, investimentos, distribuicaoLucros, sucessao)
  const saldoInicialDiario = emptyDayMap(ano, mes)
  const saldoFinalDiario = emptyDayMap(ano, mes)
  let saldoCorrente = Number(aberturaMes || 0)

  for (let dia = 1; dia <= daysInMonth(ano, mes); dia += 1) {
    saldoInicialDiario[dia] = saldoCorrente
    saldoCorrente += Number(fluxoCaixa[dia] || 0)
    saldoFinalDiario[dia] = saldoCorrente
  }

  setDescriptionMap('(A) Saldo Inicial', saldoInicialDiario)
  setDescriptionMap('SALDO FINAL', saldoFinalDiario)
  setDescriptionMap('Saldos Bancários em C/C', sumMaps(saldoFinalDiario, mapWithSign(aplicacoes, -1)))

  return { childrenByParent, valueMap }
}

function inferTipoMovimento(descricao, valor = 0) {
  const desc = normalizeText(descricao)
  const numero = Number(valor || 0)
  if (numero < 0) return 'saida'
  if (numero > 0) return 'entrada'
  if (/dedu|despesa|imposto|taxa|custo|ocupac|utilidade|servico|viagem|veiculo|investimento|distribuicao|cancelad/.test(desc)) return 'saida'
  if (/receita|venda|aluguel|entrada|financeira/.test(desc)) return 'entrada'
  return null
}

function isSaldoDescricao(descricao) {
  const desc = normalizeText(descricao)
  return /saldo inicial|saldo final|saldo do dia|saldos bancarios|aplicacoes financeiras/.test(desc)
}

function getCashflowBalanceStructure(linhas = []) {
  const ordered = [...linhas].sort((a, b) => Number(a.row_idx || 0) - Number(b.row_idx || 0))
  const byDescription = (description) => {
    const key = normalizeAccountDescription(description)
    return ordered.find(linha => normalizeAccountDescription(linha.descricao) === key) || null
  }

  const saldoFinal = byDescription('SALDO FINAL')
  const saldoCc = byDescription('Saldos Bancários em C/C')
  const aplicacoes = byDescription('Aplicações Financeiras')
  const curtoPrazo = byDescription('Curto Prazo')
  const longoPrazo = byDescription('Longo Prazo')

  if (!saldoFinal || !saldoCc || !aplicacoes || !curtoPrazo || !longoPrazo) return null

  const curtoFilhos = ordered.filter(linha => {
    const rowIdx = Number(linha.row_idx || 0)
    return String(linha.codigo || '').trim()
      && rowIdx > Number(curtoPrazo.row_idx || 0)
      && rowIdx < Number(longoPrazo.row_idx || 0)
  })

  const longoFilhos = ordered.filter(linha => {
    const rowIdx = Number(linha.row_idx || 0)
    return String(linha.codigo || '').trim()
      && rowIdx > Number(longoPrazo.row_idx || 0)
  })

  const editableIds = new Set([
    Number(saldoCc.id),
    ...curtoFilhos.map(linha => Number(linha.id)),
    ...longoFilhos.map(linha => Number(linha.id)),
  ])

  return {
    saldoFinal,
    saldoCc,
    aplicacoes,
    curtoPrazo,
    longoPrazo,
    curtoFilhos,
    longoFilhos,
    editableIds,
  }
}

async function upsertCashflowValue(client, { linhaId, empresa, ano, mes, valor }) {
  await client.query(
    `INSERT INTO fin_cashflow_valores (linha_id, empresa, ano, mes, valor)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (linha_id, empresa, ano, mes)
     DO UPDATE SET valor = EXCLUDED.valor`,
    [linhaId, empresa, ano, mes, valor],
  )
}

async function recalculateCashflowBalanceSection(client, structure, empresa, ano, mes) {
  const leafIds = [
    ...structure.curtoFilhos.map(linha => Number(linha.id)),
    ...structure.longoFilhos.map(linha => Number(linha.id)),
    Number(structure.saldoCc.id),
  ]

  const { rows } = await client.query(
    `SELECT linha_id, valor
       FROM fin_cashflow_valores
      WHERE empresa = $1 AND ano = $2 AND mes = $3
        AND linha_id = ANY($4::int[])`,
    [empresa, ano, mes, leafIds],
  )

  const values = new Map(rows.map(row => [Number(row.linha_id), Number(row.valor || 0)]))
  const sumLines = linhas => linhas.reduce((sum, linha) => sum + Number(values.get(Number(linha.id)) || 0), 0)

  const curtoPrazo = sumLines(structure.curtoFilhos)
  const longoPrazo = sumLines(structure.longoFilhos)
  const aplicacoes = curtoPrazo + longoPrazo
  const saldoCc = Number(values.get(Number(structure.saldoCc.id)) || 0)
  const saldoFinal = saldoCc + aplicacoes

  await upsertCashflowValue(client, {
    linhaId: Number(structure.curtoPrazo.id), empresa, ano, mes, valor: curtoPrazo,
  })
  await upsertCashflowValue(client, {
    linhaId: Number(structure.longoPrazo.id), empresa, ano, mes, valor: longoPrazo,
  })
  await upsertCashflowValue(client, {
    linhaId: Number(structure.aplicacoes.id), empresa, ano, mes, valor: aplicacoes,
  })
  await upsertCashflowValue(client, {
    linhaId: Number(structure.saldoFinal.id), empresa, ano, mes, valor: saldoFinal,
  })

  return { curto_prazo: curtoPrazo, longo_prazo: longoPrazo, aplicacoes, saldo_cc: saldoCc, saldo_final: saldoFinal }
}

function isLinhaDiariaRealizada(linhaId, descricao) {
  const id = Number(linhaId)
  const desc = normalizeText(descricao)
  return id === -8001 || id === -8002 || desc.includes('receitas realizadas') || desc.includes('despesas realizadas')
}

function isLinhaSaldoDia(linhaId, descricao) {
  const id = Number(linhaId)
  const desc = normalizeText(descricao)
  return id === -8005 || desc.includes('saldo do dia')
}

function addPeriodoConditions(conditions, params, alias, column, ano, mes = null, dia = null) {
  conditions.push(`${alias}.${column} IS NOT NULL`)
  params.push(ano)
  conditions.push(`EXTRACT(YEAR FROM ${alias}.${column})::int = $${params.length}`)

  if (mes) {
    params.push(mes)
    conditions.push(`EXTRACT(MONTH FROM ${alias}.${column})::int = $${params.length}`)
  }

  if (dia) {
    params.push(dia)
    conditions.push(`EXTRACT(DAY FROM ${alias}.${column})::int = $${params.length}`)
  }
}

function addEmpresaCondition(conditions, params, empresaFiltro, alias = 'm') {
  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(String(empresaFiltro || '').toUpperCase().trim())
    conditions.push(`UPPER(TRIM(COALESCE(${alias}.empresa::text, ''))) = $${params.length}`)
  }
}

function addMovimentoPeriodoConditions(conditions, params, alias, ano, mes = null, dia = null) {
  params.push(ano)
  conditions.push(`(
    (${alias}.data IS NOT NULL AND EXTRACT(YEAR FROM ${alias}.data)::int = $${params.length})
    OR (${alias}.data IS NULL AND ${alias}.ano = $${params.length})
  )`)

  if (mes) {
    params.push(mes)
    conditions.push(`(
      (${alias}.data IS NOT NULL AND EXTRACT(MONTH FROM ${alias}.data)::int = $${params.length})
      OR (${alias}.data IS NULL AND ${alias}.mes = $${params.length})
    )`)
  }

  if (dia) {
    params.push(dia)
    conditions.push(`(
      (${alias}.data IS NOT NULL AND EXTRACT(DAY FROM ${alias}.data)::int = $${params.length})
      OR (${alias}.data IS NULL AND ${alias}.dia = $${params.length})
    )`)
  }
}

function normalizedAccountSql(column) {
  return `TRIM(REGEXP_REPLACE(
    TRANSLATE(
      UPPER(TRIM(COALESCE(${column}::text, ''))),
      'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    ),
    '[^A-Z0-9]+',
    ' ',
    'g'
  ))`
}

function addNaturezaCondition(conditions, params, codigo, descricao = '') {
  const code = normalizeCashflowCodigo(codigo)
  if (!code) return false

  if (/^\d+$/.test(code)) {
    params.push(`${code}.%`)
    const idxPrefix = params.length
    params.push(code)
    const idxExact = params.length
    conditions.push(`(TRIM(COALESCE(m.natureza_financeira::text, '')) LIKE $${idxPrefix} OR TRIM(COALESCE(m.natureza_financeira::text, '')) = $${idxExact})`)
    return true
  }

  if (cashflowCodeDepth(code) === 2) {
    params.push(code)
    const idxExact = params.length
    params.push(`${code}.%`)
    const idxPrefix = params.length
    conditions.push(`(
      TRIM(COALESCE(m.natureza_financeira::text, '')) = $${idxExact}
      OR TRIM(COALESCE(m.natureza_financeira::text, '')) LIKE $${idxPrefix}
    )`)
    return true
  }

  if (cashflowCodeDepth(code) >= 3) {
    const parentCode = cashflowParentCode(code)
    const descriptionKey = normalizeAccountDescription(descricao).toUpperCase()

    params.push(code)
    const idxExact = params.length

    if (parentCode && descriptionKey) {
      params.push(parentCode)
      const idxParent = params.length
      params.push(descriptionKey)
      const idxDescription = params.length

      conditions.push(`(
        TRIM(COALESCE(m.natureza_financeira::text, '')) = $${idxExact}
        OR (
          TRIM(COALESCE(m.natureza_financeira::text, '')) = $${idxParent}
          AND ${normalizedAccountSql('m.conta_contabil')} = $${idxDescription}
        )
        OR (
          ${normalizedAccountSql('m.conta_contabil')} = $${idxDescription}
          AND TRIM(COALESCE(m.natureza_financeira::text, '')) !~ '^\\d+(\\.\\d+)*\\.?$'
        )
      )`)
      return true
    }

    conditions.push(`TRIM(COALESCE(m.natureza_financeira::text, '')) = $${idxExact}`)
    return true
  }

  params.push(code)
  conditions.push(`TRIM(COALESCE(m.natureza_financeira::text, '')) = $${params.length}`)
  return true
}

async function getMovimentoDetalhesCashflow({
  empresa,
  ano,
  mes,
  dia,
  codigo,
  descricao,
  valor,
  incluirSaldos = false,
  ignorarNatureza = false,
  ignorarTipo = false,
}) {
  if (!(await tableExists('fin_movimento'))) return []
  if (!incluirSaldos && isSaldoDescricao(descricao) && !codigo) return []

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = []
  const conditions = []
  addMovimentoPeriodoConditions(conditions, params, 'm', ano, mes, dia)
  addEmpresaCondition(conditions, params, empresaFiltro, 'm')

  // As linhas sintéticas da visão diária (Receitas, Despesas e Saldo do Dia)
  // não possuem natureza contábil própria. Filtrar pelo código 1/2/5 fazia o
  // modal ficar vazio mesmo quando a célula tinha valor.
  const hasNatureza = ignorarNatureza ? false : addNaturezaCondition(conditions, params, codigo, descricao)
  const tipo = ignorarTipo ? null : inferTipoMovimento(descricao, valor)

  if (tipo === 'entrada') {
    conditions.push(`COALESCE(m.entradas, 0) <> 0`)
  } else if (tipo === 'saida') {
    conditions.push(`COALESCE(m.saidas, 0) <> 0`)
  } else if (!hasNatureza) {
    conditions.push(`(COALESCE(m.entradas, 0) <> 0 OR COALESCE(m.saidas, 0) <> 0)`)
  }

  const { rows } = await query(
    `SELECT
        'movimento_bancario' AS origem,
        m.id,
        TO_CHAR(m.data, 'YYYY-MM-DD') AS data,
        m.empresa,
        m.banco,
        m.fornecedor,
        m.historico,
        m.nf_doc,
        m.conta_contabil,
        m.natureza_financeira,
        NULL::text AS status,
        CASE
          WHEN COALESCE(m.entradas, 0) <> 0 THEN ABS(COALESCE(m.entradas, 0))
          ELSE -ABS(COALESCE(m.saidas, 0))
        END AS valor
       FROM fin_movimento m
      WHERE ${conditions.join(' AND ')}
      ORDER BY m.data ASC, m.id ASC
      LIMIT 1500`,
    params
  )

  return rows.map(r => ({ ...r, valor: parseFloat(r.valor || 0) }))
}

async function getBancosLancamentosDetalhesCashflow({ empresa, ano, mes, dia, tipo = null }) {
  if (!(await tableExists('fin_bancos_lancamentos')) || !(await tableExists('fin_bancos_contas'))) return []

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = []
  const conditions = [`bl.movimento_id IS NULL`]
  addPeriodoConditions(conditions, params, 'bl', 'data', ano, mes, dia)
  addEmpresaCondition(conditions, params, empresaFiltro, 'bc')

  if (tipo === 'entrada') {
    conditions.push(`COALESCE(bl.valor, 0) > 0 AND bl.tipo <> 'taxa'`)
  } else if (tipo === 'saida') {
    conditions.push(`(COALESCE(bl.valor, 0) < 0 OR bl.tipo = 'taxa')`)
  }

  const { rows } = await query(
    `SELECT
        'banco_interno' AS origem,
        bl.id,
        TO_CHAR(bl.data, 'YYYY-MM-DD') AS data,
        bc.empresa,
        bc.banco_nome AS banco,
        NULL::text AS fornecedor,
        CONCAT(
          CASE
            WHEN bl.tipo = 'saldo_inicial' THEN 'Saldo Inicial'
            WHEN bl.tipo = 'taxa' THEN 'Taxa Bancária'
            WHEN bl.tipo = 'rendimento' THEN 'Rendimento'
            WHEN bl.tipo = 'aplicacao' THEN 'Aplicação'
            ELSE 'Lançamento Bancário'
          END,
          ': ',
          bl.descricao
        ) AS historico,
        NULL::text AS nf_doc,
        CASE
          WHEN bl.tipo = 'saldo_inicial' THEN 'Saldo Inicial'
          WHEN bl.tipo = 'taxa' THEN 'Taxa Bancária'
          WHEN bl.tipo = 'rendimento' THEN 'Rendimento'
          WHEN bl.tipo = 'aplicacao' THEN 'Aplicação'
          ELSE 'Lançamento Bancário'
        END AS conta_contabil,
        NULL::text AS natureza_financeira,
        bl.tipo AS status,
        CASE
          WHEN bl.tipo = 'taxa' OR bl.valor < 0 THEN -ABS(COALESCE(bl.valor, 0))
          ELSE ABS(COALESCE(bl.valor, 0))
        END AS valor
       FROM fin_bancos_lancamentos bl
       JOIN fin_bancos_contas bc ON bc.id = bl.conta_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY bl.data ASC, bl.id ASC
      LIMIT 1500`,
    params
  )

  return rows.map(r => ({ ...r, valor: parseFloat(r.valor || 0) }))
}

async function getContasPagarDetalhesCashflow({ empresa, ano, mes, dia }) {
  if (!(await tableExists('fin_lancamentos_cp')) || !(await tableExists('fin_parcelas_cp'))) return []

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = []
  const conditions = []
  addPeriodoConditions(conditions, params, 'p', 'vencimento', ano, mes, dia)
  params.push(STATUS_ABERTO_CP)
  conditions.push(`LOWER(COALESCE(p.status::text, 'pendente')) = ANY($${params.length})`)
  addEmpresaCondition(conditions, params, empresaFiltro, 'l')

  const { rows } = await query(
    `SELECT
        'contas_pagar_aberto' AS origem,
        p.id,
        TO_CHAR(p.vencimento, 'YYYY-MM-DD') AS data,
        l.empresa,
        NULL::text AS banco,
        f.razao_social AS fornecedor,
        l.historico,
        l.nf_doc,
        l.conta_contabil,
        NULLIF(l.produto_servico, '') AS natureza_financeira,
        p.status,
        -ABS(COALESCE(p.valor_final, p.valor, 0)) AS valor
       FROM fin_parcelas_cp p
       JOIN fin_lancamentos_cp l ON l.id = p.lancamento_id
       LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.vencimento ASC, p.id ASC
      LIMIT 1500`,
    params
  )

  return rows.map(r => ({ ...r, valor: parseFloat(r.valor || 0) }))
}

async function getContasReceberDetalhesCashflow({ empresa, ano, mes, dia }) {
  const hasParc = await tableExists('fin_parcelas_cr')
  const hasLanc = await tableExists('fin_lancamentos_cr')
  if (!hasParc || !hasLanc) return []

  const pCols = await getTableColumns('fin_parcelas_cr')
  const lCols = await getTableColumns('fin_lancamentos_cr')
  const vencCol = pickColumn(pCols, ['vencimento', 'data_vencimento', 'dt_vencimento'])
  const valorCol = pickColumn(pCols, ['valor', 'valor_parcela', 'valor_total'])
  const statusCol = pickColumn(pCols, ['status', 'parcela_status'])
  const lancCol = pickColumn(pCols, ['lancamento_id', 'conta_receber_id', 'receber_id'])
  const empCol = pickColumn(lCols, ['empresa'])
  const histCol = pickColumn(lCols, ['historico', 'descricao', 'descricao_lancamento'])
  const docCol = pickColumn(lCols, ['nf_doc', 'numero_documento', 'documento'])
  const fornecedorCol = pickColumn(lCols, ['cliente_nome', 'fornecedor', 'pagador', 'sacado'])

  if (!vencCol || !valorCol || !lancCol || !empCol) return []

  const empresaFiltro = normalizeEmpresaFilter(empresa)
  const params = []
  const conditions = []
  addPeriodoConditions(conditions, params, 'p', vencCol, ano, mes, dia)

  if (statusCol) {
    params.push([...STATUS_PAGO_CR, ...STATUS_CANCELADO])
    conditions.push(`LOWER(COALESCE(p.${statusCol}::text, 'aberta')) <> ALL($${params.length})`)
  }

  if (empresaFiltro !== 'CONSOLIDADO') {
    params.push(empresaFiltro)
    conditions.push(`l.${empCol} = $${params.length}`)
  }

  const { rows } = await query(
    `SELECT
        'contas_receber_aberto' AS origem,
        p.id,
        TO_CHAR(p.${vencCol}, 'YYYY-MM-DD') AS data,
        l.${empCol} AS empresa,
        NULL::text AS banco,
        ${fornecedorCol ? `l.${fornecedorCol}` : `NULL::text`} AS fornecedor,
        ${histCol ? `l.${histCol}` : `NULL::text`} AS historico,
        ${docCol ? `l.${docCol}` : `NULL::text`} AS nf_doc,
        NULL::text AS conta_contabil,
        NULL::text AS natureza_financeira,
        ${statusCol ? `p.${statusCol}` : `NULL::text`} AS status,
        ABS(COALESCE(p.${valorCol}, 0)) AS valor
       FROM fin_parcelas_cr p
       JOIN fin_lancamentos_cr l ON l.id = p.${lancCol}
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.${vencCol} ASC, p.id ASC
      LIMIT 1500`,
    params
  )

  return rows.map(r => ({ ...r, valor: parseFloat(r.valor || 0) }))
}

function shouldUseCpDetalhes(linhaId, descricao) {
  const desc = normalizeText(descricao)
  return Number(linhaId) === -9001 || Number(linhaId) === -8003 || desc.includes('contas a pagar futuro')
}

function shouldUseCrDetalhes(linhaId, descricao) {
  const desc = normalizeText(descricao)
  return Number(linhaId) === -9002 || Number(linhaId) === -8004 || desc.includes('contas a receber futuro')
}

function shouldUseMovimentoDetalhes(linhaId, descricao) {
  const id = Number(linhaId)
  const desc = normalizeText(descricao)
  return id === -8001 || id === -8002 || desc.includes('receitas realizadas') || desc.includes('despesas realizadas') || desc.includes('saldo do dia')
}


// ─── ORÇAMENTO FINANCEIRO ────────────────────────────────────────────────────
// Previsto vem do Movimento Orçado; Realizado vem do Movimento Bancário realmente pago/recebido.
async function getOrcamentoLinhasBase() {
  const hasOrcamento = await tableExists('fin_orcamento_linhas')
  if (hasOrcamento) {
    const { rows } = await query(
      `SELECT id, row_idx, codigo, descricao, nivel, tipo
         FROM fin_orcamento_linhas
        ORDER BY row_idx`
    )
    if (rows.length) return { rows, origem: 'fin_orcamento_linhas' }
  }

  const hasCashflow = await tableExists('fin_cashflow_linhas')
  if (!hasCashflow) return { rows: [], origem: null }

  const { rows } = await query(
    `SELECT id, row_idx, codigo, descricao, nivel, tipo
       FROM fin_cashflow_linhas
      ORDER BY row_idx`
  )
  return { rows, origem: 'fin_cashflow_linhas' }
}

function setMesValue(map, key, mes, value) {
  if (!map[key]) map[key] = emptyMonthMap()
  map[key][Number(mes)] = Number(map[key][Number(mes)] || 0) + Number(value || 0)
}

function getDescricaoValue(linhas, descricao, campo) {
  const alvo = normalizeText(descricao)
  const linha = linhas.find(l => normalizeText(l.descricao) === alvo)
  return linha ? Number(linha[campo] || 0) : 0
}

router.get('/orcamento/empresas', async (req, res) => {
  try {
    const selects = []
    if (await tableExists('fin_orcamento_valores')) {
      selects.push(`SELECT DISTINCT empresa, ano FROM fin_orcamento_valores WHERE empresa IS NOT NULL AND ano IS NOT NULL`)
    }
    if (await tableExists('fin_orcamento_movimento')) {
      selects.push(`SELECT DISTINCT empresa, ano FROM fin_orcamento_movimento WHERE empresa IS NOT NULL AND ano IS NOT NULL`)
    }
    if (await tableExists('fin_cashflow_valores')) {
      selects.push(`SELECT DISTINCT empresa, ano FROM fin_cashflow_valores WHERE empresa IS NOT NULL AND ano IS NOT NULL`)
    }
    if (!selects.length) return res.json({ ok: true, data: [] })

    const { rows } = await query(`${selects.join(' UNION ')} ORDER BY ano DESC, empresa ASC`)
    return res.json({ ok: true, data: rows })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.get('/orcamento/movimento', async (req, res) => {
  const empresa = normalizeEmpresaFilter(req.query.empresa)
  const ano = parseInt(req.query.ano || DEFAULT_MOVIMENTO_YEAR)
  const mes = req.query.mes ? parseInt(req.query.mes, 10) : null
  const tipo = String(req.query.tipo || '').toLowerCase()
  const busca = String(req.query.busca || '').trim()
  const limit = Math.min(5000, parseInt(req.query.limit || '500', 10))

  try {
    if (!(await tableExists('fin_orcamento_movimento'))) {
      return res.json({ ok: true, data: [], summary: { total_entradas: 0, total_saidas: 0 } })
    }

    const params = [ano]
    const conditions = [`COALESCE(ano, EXTRACT(YEAR FROM data)::int) = $1`]
    if (empresa !== 'CONSOLIDADO') {
      params.push(empresa)
      conditions.push(`UPPER(TRIM(COALESCE(empresa, ''))) = $${params.length}`)
    }
    if (mes) {
      params.push(mes)
      conditions.push(`COALESCE(mes, EXTRACT(MONTH FROM data)::int) = $${params.length}`)
    }
    if (tipo === 'entrada') conditions.push(`COALESCE(entradas, 0) <> 0`)
    if (tipo === 'saida') conditions.push(`COALESCE(saidas, 0) <> 0`)
    if (busca) {
      params.push(`%${busca}%`)
      conditions.push(`(
        COALESCE(fornecedor, '') ILIKE $${params.length}
        OR COALESCE(historico, '') ILIKE $${params.length}
        OR COALESCE(banco, '') ILIKE $${params.length}
        OR COALESCE(nf_doc, '') ILIKE $${params.length}
        OR COALESCE(natureza_financeira, '') ILIKE $${params.length}
      )`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const summaryParams = [...params]
    params.push(limit)

    const { rows } = await query(
      `SELECT id,
              TO_CHAR(data, 'YYYY-MM-DD') AS data,
              empresa,
              banco,
              COALESCE(entradas, 0)::float AS entradas,
              COALESCE(saidas, 0)::float AS saidas,
              fornecedor,
              historico,
              nf_doc,
              conta_contabil,
              centro_custo,
              obra,
              natureza_financeira,
              dia,
              mes,
              ano,
              COALESCE(saldo, 0)::float AS saldo
         FROM fin_orcamento_movimento
        ${where}
        ORDER BY data ASC NULLS LAST, id ASC
        LIMIT $${params.length}`,
      params
    )

    const { rows: resumoRows } = await query(
      `SELECT COALESCE(SUM(entradas), 0)::float AS total_entradas,
              COALESCE(SUM(saidas), 0)::float AS total_saidas,
              COUNT(*)::int AS total_lancamentos
         FROM fin_orcamento_movimento
        ${where}`,
      summaryParams
    )

    const summary = {
      total_entradas: Number(resumoRows[0]?.total_entradas || 0),
      total_saidas: Number(resumoRows[0]?.total_saidas || 0),
      saldo_periodo: Number(resumoRows[0]?.total_entradas || 0) - Number(resumoRows[0]?.total_saidas || 0),
      total_lancamentos: Number(resumoRows[0]?.total_lancamentos || 0),
    }

    return res.json({ ok: true, data: rows, summary })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

router.get('/orcamento', async (req, res) => {
  const empresa = normalizeEmpresaFilter(req.query.empresa)
  const ano = parseInt(req.query.ano || DEFAULT_MOVIMENTO_YEAR)
  const mes = req.query.mes ? parseInt(req.query.mes, 10) : null

  try {
    const { rows: linhasBase, origem } = await getOrcamentoLinhasBase()
    if (!linhasBase.length) {
      return res.json({ ok: true, data: { linhas: [], colunas: [], empresa, ano, mes, origem } })
    }

    const previstosPorLinha = {}
    const realizadosPorRowIdx = {}
    const mesesSet = new Set()

    if (await tableExists('fin_orcamento_valores')) {
      const params = [empresa, ano]
      const mesFilter = mes ? `AND v.mes = $3` : ''
      if (mes) params.push(mes)
      const { rows: previstos } = await query(
        `SELECT v.linha_id, v.mes, COALESCE(SUM(v.previsto), 0)::float AS valor
           FROM fin_orcamento_valores v
          WHERE v.empresa = $1 AND v.ano = $2 ${mesFilter}
          GROUP BY v.linha_id, v.mes`,
        params
      )
      for (const row of previstos) {
        setMesValue(previstosPorLinha, row.linha_id, row.mes, row.valor)
        mesesSet.add(Number(row.mes))
      }
    }

    const realizadosMovimento = await getOrcamentoRealizadoFromMovimento(linhasBase, empresa, ano, mes)
    for (const [rowIdx, valores] of Object.entries(realizadosMovimento)) {
      for (const [mesKey, valor] of Object.entries(valores || {})) {
        if (!valor) continue
        setMesValue(realizadosPorRowIdx, rowIdx, mesKey, valor)
        mesesSet.add(Number(mesKey))
      }
    }

    const MESES_NOME = ['', 'Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    const colunas = mes
      ? [{ mes, label: MESES_NOME[mes] }]
      : Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, label: MESES_NOME[i + 1] }))

    const linhas = linhasBase.map(linha => {
      const previstos = previstosPorLinha[linha.id] || emptyMonthMap()
      const realizados = realizadosPorRowIdx[linha.row_idx] || emptyMonthMap()
      const total_previsto = mapTotal(previstos, mes)
      const total_realizado = mapTotal(realizados, mes)
      return {
        ...linha,
        previstos,
        realizados,
        total_previsto,
        total_realizado,
        diferenca: total_realizado - total_previsto,
      }
    })

    const resumo = {
      receitas_previstas: getDescricaoValue(linhas, 'Receitas Brutas', 'total_previsto'),
      receitas_realizadas: getDescricaoValue(linhas, 'Receitas Brutas', 'total_realizado'),
      despesas_previstas: getDescricaoValue(linhas, 'Despesas Gerais e Administrativas', 'total_previsto'),
      despesas_realizadas: getDescricaoValue(linhas, 'Despesas Gerais e Administrativas', 'total_realizado'),
      saldo_inicial_previsto: getDescricaoValue(linhas, '(A) Saldo Inicial', 'total_previsto'),
      saldo_inicial_realizado: getDescricaoValue(linhas, '(A) Saldo Inicial', 'total_realizado'),
      origem,
    }

    return res.json({ ok: true, data: { linhas, colunas, resumo, empresa, ano, mes, origem } })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/cashflow/lancamentos ────────────────────────────────────
// Retorna os lançamentos que compõem um valor clicado do Cash Flow.
router.get('/cashflow/lancamentos', async (req, res) => {
  const empresa = normalizeEmpresaFilter(req.query.empresa)
  const ano = parseInt(req.query.ano || new Date().getFullYear())
  const mes = req.query.mes ? parseInt(req.query.mes) : null
  const dia = req.query.dia ? parseInt(req.query.dia) : null
  const linhaId = req.query.linha_id
  const codigo = req.query.codigo || ''
  const descricao = req.query.descricao || ''
  const valor = Number(req.query.valor || 0)

  try {
    let itens = []

    if (shouldUseCpDetalhes(linhaId, descricao)) {
      itens = await getContasPagarDetalhesCashflow({ empresa, ano, mes, dia })
    } else if (shouldUseCrDetalhes(linhaId, descricao)) {
      itens = await getContasReceberDetalhesCashflow({ empresa, ano, mes, dia })
    } else if (isLinhaSaldoDia(linhaId, descricao)) {
      const [movimento, bancosInternos, cp, cr] = await Promise.all([
        getMovimentoDetalhesCashflow({
          empresa,
          ano,
          mes,
          dia,
          codigo,
          descricao,
          valor,
          incluirSaldos: true,
          ignorarNatureza: true,
          ignorarTipo: true,
        }),
        getBancosLancamentosDetalhesCashflow({ empresa, ano, mes, dia }),
        getContasPagarDetalhesCashflow({ empresa, ano, mes, dia }),
        getContasReceberDetalhesCashflow({ empresa, ano, mes, dia }),
      ])
      itens = [...movimento, ...bancosInternos, ...cp, ...cr]
    } else if (shouldUseMovimentoDetalhes(linhaId, descricao)) {
      const tipo = inferTipoMovimento(descricao, valor)
      const [movimento, bancosInternos] = await Promise.all([
        getMovimentoDetalhesCashflow({
          empresa,
          ano,
          mes,
          dia,
          codigo,
          descricao,
          valor,
          ignorarNatureza: isLinhaDiariaRealizada(linhaId, descricao),
        }),
        isLinhaDiariaRealizada(linhaId, descricao)
          ? getBancosLancamentosDetalhesCashflow({ empresa, ano, mes, dia, tipo })
          : Promise.resolve([]),
      ])
      itens = [...movimento, ...bancosInternos]
    } else {
      itens = await getMovimentoDetalhesCashflow({ empresa, ano, mes, dia, codigo, descricao, valor })
    }

    const total = itens.reduce((sum, item) => sum + Number(item.valor || 0), 0)

    return res.json({
      ok: true,
      data: {
        itens,
        total,
        quantidade: itens.length,
      },
    })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

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
    const balanceStructure = getCashflowBalanceStructure(linhasImportadas)

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
    const [cpFuturo, crFuturo, analyticBreakdown] = await Promise.all([
      getContasPagarFuturoAberto(empresa, ano, mes),
      getContasReceberFuturoAberto(empresa, ano, mes),
      getCashflowAnalyticBreakdown({ linhasImportadas, empresa, ano, mes }),
    ])

    // As linhas do Excel possuem os totais de segundo nível (ex.: 4.5).
    // O detalhamento de terceiro nível vem do Movimento Bancário + Plano de
    // Contas e é inserido logo abaixo do pai, sem recalcular nem duplicar o total.
    const linhas = []
    for (const linha of linhasImportadas) {
      linhas.push(linha)
      const codigo = normalizeCashflowCodigo(linha.codigo)
      const children = analyticBreakdown.childrenByParent.get(codigo) || []
      linhas.push(...children)
    }

    Object.assign(valMap, analyticBreakdown.valueMap)
    for (const values of Object.values(analyticBreakdown.valueMap)) {
      Object.entries(values || {}).forEach(([m, v]) => {
        if (Number(v) !== 0) mesesSet.add(Number(m))
      })
    }

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
        editavel_saldo: visao === 'mensal' && !!balanceStructure?.editableIds.has(Number(l.id)),
      }
    })

    return res.json({ ok: true, data: { linhas: data, colunas, empresa, ano } })
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── PATCH /financeiro/cashflow/valor ──────────────────────────────────────────
// Edição on-line dos saldos mensais exibidos abaixo de SALDO FINAL.
router.patch('/cashflow/valor', async (req, res) => {
  const linhaId = Number(req.body?.linha_id)
  const empresa = normalizeEmpresaFilter(req.body?.empresa)
  const ano = Number(req.body?.ano)
  const mes = Number(req.body?.mes)
  const valor = Number(req.body?.valor)

  if (!Number.isInteger(linhaId) || linhaId <= 0) {
    return res.status(400).json({ ok: false, message: 'Linha do Cash Flow inválida.' })
  }
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return res.status(400).json({ ok: false, message: 'Ano inválido.' })
  }
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, message: 'Mês inválido.' })
  }
  if (!Number.isFinite(valor) || Math.abs(valor) > 99999999999999) {
    return res.status(400).json({ ok: false, message: 'Valor inválido.' })
  }

  try {
    const { rows: linhas } = await query(
      `SELECT id, row_idx, codigo, descricao, nivel, tipo
         FROM fin_cashflow_linhas
        ORDER BY row_idx`,
    )
    const structure = getCashflowBalanceStructure(linhas)

    if (!structure) {
      return res.status(409).json({ ok: false, message: 'A estrutura de saldos do Cash Flow não foi localizada.' })
    }
    if (!structure.editableIds.has(linhaId)) {
      return res.status(403).json({ ok: false, message: 'Esta linha é calculada automaticamente e não pode ser editada diretamente.' })
    }

    const linha = linhas.find(item => Number(item.id) === linhaId)
    const result = await transaction(async client => {
      const { rows: anteriorRows } = await client.query(
        `SELECT valor
           FROM fin_cashflow_valores
          WHERE linha_id = $1 AND empresa = $2 AND ano = $3 AND mes = $4
          LIMIT 1`,
        [linhaId, empresa, ano, mes],
      )
      const valorAnterior = Number(anteriorRows[0]?.valor || 0)

      await upsertCashflowValue(client, { linhaId, empresa, ano, mes, valor })
      const recalculados = await recalculateCashflowBalanceSection(client, structure, empresa, ano, mes)

      // Quando uma empresa individual é ajustada, mantém o consolidado sincronizado
      // com a soma das empresas. Ajustes feitos diretamente em CONSOLIDADO permanecem
      // como uma correção manual independente.
      let consolidado = null
      if (empresa !== 'CONSOLIDADO') {
        const { rows: totalRows } = await client.query(
          `SELECT COALESCE(SUM(valor), 0)::float AS total
             FROM fin_cashflow_valores
            WHERE linha_id = $1 AND ano = $2 AND mes = $3
              AND UPPER(TRIM(empresa)) <> 'CONSOLIDADO'`,
          [linhaId, ano, mes],
        )
        const totalConsolidado = Number(totalRows[0]?.total || 0)
        await upsertCashflowValue(client, {
          linhaId, empresa: 'CONSOLIDADO', ano, mes, valor: totalConsolidado,
        })
        consolidado = await recalculateCashflowBalanceSection(client, structure, 'CONSOLIDADO', ano, mes)
      }

      return { valorAnterior, recalculados, consolidado }
    })

    return res.json({
      ok: true,
      data: {
        linha_id: linhaId,
        codigo: linha?.codigo || null,
        descricao: linha?.descricao || null,
        empresa,
        ano,
        mes,
        valor,
        valor_anterior: result.valorAnterior,
        recalculados: result.recalculados,
        consolidado: result.consolidado,
      },
    })
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


// ─── GET /financeiro/movimento/exportar ──────────────────────────────────────
// Exporta o extrato do Movimento Bancário filtrado em formato .xls compatível com Excel.
router.get('/movimento/exportar', async (req, res) => {
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
  const tipo            = req.query.tipo || ''

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
    const statusMovimento = String(status).toLowerCase()
    if (statusMovimento === 'pago' || statusMovimento === 'realizado') {
      conditions.push(`COALESCE(fm.saidas, 0) <> 0`)
    } else if (statusMovimento === 'recebido') {
      conditions.push(`COALESCE(fm.entradas, 0) <> 0`)
    }
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
  if (tipo === 'entrada') conditions.push(`COALESCE(fm.entradas, 0) <> 0`)
  if (tipo === 'saida')   conditions.push(`COALESCE(fm.saidas, 0) <> 0`)
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

  conditions.push(await getMovimentoRealizadoGuardCondition('fm'))

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(fm.data, 'YYYY-MM-DD') AS data,
        fm.empresa,
        COALESCE(b.banco_nome, fm.banco) AS banco,
        COALESCE(f.razao_social, fm.fornecedor) AS fornecedor,
        COALESCE(l.nf_doc, fm.nf_doc) AS documento,
        TO_CHAR(fm.emissao_doc, 'YYYY-MM-DD') AS emissao_doc,
        fm.historico,
        fm.conta_contabil,
        fm.centro_custo,
        fm.obra,
        fm.natureza_financeira,
        fm.n_cheque,
        CASE
          WHEN COALESCE(fm.saidas, 0) <> 0 THEN 'pago'
          WHEN COALESCE(fm.entradas, 0) <> 0 THEN 'recebido'
          ELSE NULL
        END AS status,
        COALESCE(fm.entradas, 0)::float AS entradas,
        COALESCE(fm.saidas, 0)::float AS saidas,
        COALESCE(fm.saldo, 0)::float AS saldo
      FROM fin_movimento fm
      LEFT JOIN fin_parcelas_cp p ON p.movimento_id = fm.id
      LEFT JOIN fin_lancamentos_cp l ON l.id = p.lancamento_id
      LEFT JOIN fin_fornecedores f ON f.id = COALESCE(l.fornecedor_id, fm.fornecedor_id)
      LEFT JOIN fin_bancos_contas b ON b.id = COALESCE(l.banco_conta_id, fm.banco_conta_id)
      LEFT JOIN fin_tipos_documento td ON td.id = l.tipo_documento_id
      ${where}
      ORDER BY fm.data DESC NULLS LAST, fm.id DESC
    `, params)

    return sendExcelXml(res, `movimento-bancario-${ano || 'export'}.xls`, 'Movimento', [
      { header: 'Data', key: 'data' },
      { header: 'Empresa', key: 'empresa' },
      { header: 'Banco', key: 'banco' },
      { header: 'Fornecedor', key: 'fornecedor' },
      { header: 'Documento', key: 'documento' },
      { header: 'Emissão DOC', key: 'emissao_doc' },
      { header: 'Histórico', key: 'historico' },
      { header: 'Conta Contábil', key: 'conta_contabil' },
      { header: 'Centro de Custo', key: 'centro_custo' },
      { header: 'Obra', key: 'obra' },
      { header: 'Natureza Financeira', key: 'natureza_financeira' },
      { header: 'N. Cheque', key: 'n_cheque' },
      { header: 'Status', key: 'status' },
      { header: 'Entradas', key: 'entradas' },
      { header: 'Saídas', key: 'saidas' },
      { header: 'Saldo', key: 'saldo' },
    ], rows)
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message })
  }
})

// ─── GET /financeiro/movimento/saldo-inicial-bancos ──────────────────────────
router.get('/movimento/saldo-inicial-bancos', async (req, res) => {
  try {
    const ano = req.query.ano ? parseInt(req.query.ano, 10) : DEFAULT_MOVIMENTO_YEAR
    const empresa = req.query.empresa || ''
    const banco = req.query.banco || ''
    const contaId = req.query.conta_id || ''
    const saldo = await getSaldoInicialBancosMovimento({ empresa, banco, contaId, ano, detalhado: true })

    return res.json({
      ok: true,
      data: {
        ano,
        empresa: empresa || 'CONSOLIDADO',
        banco: banco || null,
        conta_id: contaId || null,
        saldo_inicial: saldo.saldo_inicial,
        saldo_inicial_bancos: saldo.saldo_inicial,
        contas_consideradas: saldo.contas_consideradas,
        origem: saldo.origem,
      },
    })
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
    const statusMovimento = String(status).toLowerCase()
    if (statusMovimento === 'pago' || statusMovimento === 'realizado') {
      conditions.push(`COALESCE(fm.saidas, 0) <> 0`)
    } else if (statusMovimento === 'recebido') {
      conditions.push(`COALESCE(fm.entradas, 0) <> 0`)
    }
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
  if (tipo === 'entrada') conditions.push(`COALESCE(fm.entradas, 0) <> 0`)
  if (tipo === 'saida')   conditions.push(`COALESCE(fm.saidas, 0) <> 0`)
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

  conditions.push(await getMovimentoRealizadoGuardCondition('fm'))

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
        CASE
          WHEN COALESCE(fm.saidas, 0) <> 0 THEN 'pago'
          WHEN COALESCE(fm.entradas, 0) <> 0 THEN 'recebido'
          ELSE NULL
        END AS status,
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

    const totalEntradas = parseFloat(ct[0]?.total_entradas || 0)
    const totalSaidas = parseFloat(ct[0]?.total_saidas || 0)
    const saldoMovimento = totalEntradas - totalSaidas
    const saldoInicialInfo = await getSaldoInicialBancosMovimento({ empresa, banco, contaId, ano, detalhado: true })
    const saldoInicialBancos = saldoInicialInfo.saldo_inicial
    const saldoFinal = saldoInicialBancos + saldoMovimento

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
        total_entradas: totalEntradas,
        total_saidas: totalSaidas,
        saldo_inicial_bancos: saldoInicialBancos,
        saldo_inicial: saldoInicialBancos,
        saldo_inicial_ano: saldoInicialBancos,
        saldo_movimento: saldoMovimento,
        saldo_periodo: saldoFinal,
        saldo_final: saldoFinal,
        formula_saldo_final: 'saldo_inicial_bancos + total_entradas - total_saidas',
        saldo_inicial_contas_consideradas: saldoInicialInfo.contas_consideradas,
        saldo_inicial_origem: saldoInicialInfo.origem,
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
      Promise.resolve({ rows: [{ status: 'pago' }, { status: 'recebido' }] }),
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
