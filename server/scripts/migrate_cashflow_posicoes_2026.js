/**
 * Corrige as posições mensais do Cash Flow 2026 importadas como soma diária.
 *
 * Prévia:
 *   node scripts/migrate_cashflow_posicoes_2026.js
 *
 * Execução:
 *   node scripts/migrate_cashflow_posicoes_2026.js --execute --confirmar=1080
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { pool, connectDB } = require('../src/config/database')

const DATA_FILE = path.join(__dirname, 'data', 'cashflow_posicoes_2026.json')
const EXPECTED_TARGETS = 1080
const EXPECTED_ROWS = 15
const EXPECTED_COMPANIES = 6
const EXPECTED_MONTHS = 12
const JAN_CONSOLIDADO = {
  saldo_inicial: 9666473.96,
  saldo_final: 9416986.47,
  saldo_cc: 328152.96,
  aplicacoes: 9088833.51,
}

function getArg(name) {
  const prefix = `--${name}=`
  const item = process.argv.find(arg => arg.startsWith(prefix))
  return item ? item.slice(prefix.length) : null
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

function approx(a, b, tolerance = 0.05) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Arquivo de posições não encontrado: ${DATA_FILE}`)
  }

  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  const companies = Object.keys(data.empresas || {})
  if (Number(data.ano) !== 2026 || companies.length !== EXPECTED_COMPANIES) {
    throw new Error('Arquivo de posições inválido: ano ou quantidade de empresas divergente.')
  }

  let targets = 0
  for (const [company, rows] of Object.entries(data.empresas)) {
    const rowEntries = Object.entries(rows || {})
    if (rowEntries.length !== EXPECTED_ROWS) {
      throw new Error(`${company}: esperado ${EXPECTED_ROWS} linhas de posição; encontrado ${rowEntries.length}.`)
    }

    for (let month = 1; month <= EXPECTED_MONTHS; month += 1) {
      const key = String(month)
      const saldoFinal = rows['65']?.valores?.[key]
      const saldoCc = rows['67']?.valores?.[key]
      const aplicacoes = rows['68']?.valores?.[key]
      const curto = rows['70']?.valores?.[key]
      const longo = rows['76']?.valores?.[key]
      const curtoFilhos = [71, 72, 73, 74, 75]
        .reduce((sum, rowIdx) => sum + Number(rows[String(rowIdx)]?.valores?.[key] || 0), 0)
      const longoFilhos = [77, 78, 79, 80]
        .reduce((sum, rowIdx) => sum + Number(rows[String(rowIdx)]?.valores?.[key] || 0), 0)

      if (!approx(saldoFinal, Number(saldoCc) + Number(aplicacoes))) {
        throw new Error(`${company}/${key}: SALDO FINAL não fecha com C/C + aplicações.`)
      }
      if (!approx(aplicacoes, Number(curto) + Number(longo))) {
        throw new Error(`${company}/${key}: Aplicações não fecha com curto + longo prazo.`)
      }
      if (!approx(curto, curtoFilhos) || !approx(longo, longoFilhos)) {
        throw new Error(`${company}/${key}: subtotais de aplicações não fecham com as contas-filhas.`)
      }
      if (month > 1) {
        const saldoInicial = rows['4']?.valores?.[key]
        const saldoAnterior = rows['65']?.valores?.[String(month - 1)]
        if (!approx(saldoInicial, saldoAnterior)) {
          throw new Error(`${company}/${key}: encadeamento do Saldo Inicial divergente.`)
        }
      }
    }

    for (const row of rowEntries.map(([, value]) => value)) {
      const months = Object.keys(row.valores || {})
      if (months.length !== EXPECTED_MONTHS) {
        throw new Error(`${company}/${row.descricao}: quantidade de meses inválida.`)
      }
      targets += months.length
    }
  }

  if (targets !== EXPECTED_TARGETS) {
    throw new Error(`Arquivo inválido: esperado ${EXPECTED_TARGETS} alvos; encontrado ${targets}.`)
  }

  const consolidado = data.empresas.CONSOLIDADO
  if (
    !approx(consolidado['4'].valores['1'], JAN_CONSOLIDADO.saldo_inicial)
    || !approx(consolidado['65'].valores['1'], JAN_CONSOLIDADO.saldo_final)
    || !approx(consolidado['67'].valores['1'], JAN_CONSOLIDADO.saldo_cc)
    || !approx(consolidado['68'].valores['1'], JAN_CONSOLIDADO.aplicacoes)
  ) {
    throw new Error('Valores de controle de janeiro/CONSOLIDADO não conferem.')
  }

  return data
}

async function loadLines(client, data) {
  const rowIndexes = Object.keys(data.empresas.CONSOLIDADO).map(Number).sort((a, b) => a - b)
  const { rows } = await client.query(
    `SELECT id, row_idx, descricao
       FROM fin_cashflow_linhas
      WHERE row_idx = ANY($1::int[])
      ORDER BY row_idx`,
    [rowIndexes],
  )

  if (rows.length !== EXPECTED_ROWS) {
    throw new Error(`Estrutura do Cash Flow divergente: esperado ${EXPECTED_ROWS} linhas; encontrado ${rows.length}.`)
  }

  const byRowIdx = new Map(rows.map(row => [Number(row.row_idx), row]))
  for (const [rowIdx, source] of Object.entries(data.empresas.CONSOLIDADO)) {
    const line = byRowIdx.get(Number(rowIdx))
    if (!line) throw new Error(`Linha row_idx=${rowIdx} não encontrada.`)
    if (String(line.descricao || '').trim() !== String(source.descricao || '').trim()) {
      throw new Error(
        `Linha row_idx=${rowIdx} divergente: banco="${line.descricao}" / fonte="${source.descricao}".`,
      )
    }
  }

  return byRowIdx
}

async function currentSnapshot(client, lineMap, data) {
  const lineIds = [...lineMap.values()].map(row => Number(row.id))
  const companies = Object.keys(data.empresas)
  const { rows } = await client.query(
    `SELECT v.id, v.linha_id, l.row_idx, l.descricao, v.empresa, v.ano, v.mes, v.valor
       FROM fin_cashflow_valores v
       JOIN fin_cashflow_linhas l ON l.id = v.linha_id
      WHERE v.ano = 2026
        AND v.empresa = ANY($1::text[])
        AND v.linha_id = ANY($2::int[])
      ORDER BY v.empresa, l.row_idx, v.mes`,
    [companies, lineIds],
  )
  return rows
}

function sourceRows(data, lineMap) {
  const rows = []
  for (const [company, sourceLines] of Object.entries(data.empresas)) {
    for (const [rowIdx, source] of Object.entries(sourceLines)) {
      const line = lineMap.get(Number(rowIdx))
      for (const [month, value] of Object.entries(source.valores)) {
        rows.push({
          linha_id: Number(line.id),
          row_idx: Number(rowIdx),
          descricao: source.descricao,
          empresa: company,
          ano: 2026,
          mes: Number(month),
          valor: Number(value || 0),
        })
      }
    }
  }
  return rows
}

function summarizeCurrent(snapshot, lineMap) {
  const byKey = new Map(snapshot.map(row => [
    `${String(row.empresa).toUpperCase()}:${Number(row.row_idx)}:${Number(row.mes)}`,
    Number(row.valor || 0),
  ]))
  const value = (rowIdx) => byKey.get(`CONSOLIDADO:${rowIdx}:1`) || 0
  return {
    saldo_inicial: value(4),
    saldo_final: value(65),
    saldo_cc: value(67),
    aplicacoes: value(68),
  }
}

async function writeBackup(snapshot) {
  const dir = path.join(__dirname, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const file = path.join(dir, `cashflow-posicoes-2026-antes-0378-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify({
    generated_at: new Date().toISOString(),
    release: '0.3.78',
    rows: snapshot,
  }, null, 2))
  return file
}

async function main() {
  const execute = process.argv.includes('--execute')
  const confirmation = Number(getArg('confirmar') || 0)
  const data = loadData()

  if (execute && confirmation !== EXPECTED_TARGETS) {
    throw new Error(`Confirmação inválida. Execute com --execute --confirmar=${EXPECTED_TARGETS}.`)
  }

  await connectDB()
  const client = await pool.connect()

  try {
    const lineMap = await loadLines(client, data)
    const snapshot = await currentSnapshot(client, lineMap, data)
    const targets = sourceRows(data, lineMap)
    const before = summarizeCurrent(snapshot, lineMap)

    const currentByKey = new Map(snapshot.map(row => [
      `${String(row.empresa).toUpperCase()}:${Number(row.row_idx)}:${Number(row.mes)}`,
      Number(row.valor || 0),
    ]))
    const changed = targets.filter(row => !approx(
      currentByKey.get(`${row.empresa}:${row.row_idx}:${row.mes}`),
      row.valor,
      0.0001,
    ))

    console.log('\n=== CORREÇÃO DAS POSIÇÕES MENSAIS DO CASH FLOW 2026 ===')
    console.log(`Empresas: ${EXPECTED_COMPANIES}`)
    console.log(`Linhas de posição: ${EXPECTED_ROWS}`)
    console.log(`Valores validados: ${EXPECTED_TARGETS}`)
    console.log(`Valores diferentes no banco: ${changed.length}`)
    console.log('\nJaneiro — CONSOLIDADO')
    console.log(`Antes | Saldo Inicial: ${money(before.saldo_inicial)}`)
    console.log(`Antes | Saldo Final:   ${money(before.saldo_final)}`)
    console.log(`Antes | C/C:           ${money(before.saldo_cc)}`)
    console.log(`Antes | Aplicações:    ${money(before.aplicacoes)}`)
    console.log(`Depois| Saldo Inicial: ${money(JAN_CONSOLIDADO.saldo_inicial)}`)
    console.log(`Depois| Saldo Final:   ${money(JAN_CONSOLIDADO.saldo_final)}`)
    console.log(`Depois| C/C:           ${money(JAN_CONSOLIDADO.saldo_cc)}`)
    console.log(`Depois| Aplicações:    ${money(JAN_CONSOLIDADO.aplicacoes)}`)

    if (!execute) {
      console.log('\nModo prévia: nenhum registro foi alterado.')
      console.log(`Após conferir, execute com: --execute --confirmar=${EXPECTED_TARGETS}`)
      return
    }

    if (!changed.length) {
      console.log('\nA base já está corrigida. Nenhuma alteração foi necessária.')
      return
    }

    const backupFile = await writeBackup(snapshot)
    await client.query('BEGIN')

    for (const row of targets) {
      await client.query(
        `INSERT INTO fin_cashflow_valores (linha_id, empresa, ano, mes, valor)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (linha_id, empresa, ano, mes)
         DO UPDATE SET valor = EXCLUDED.valor`,
        [row.linha_id, row.empresa, row.ano, row.mes, row.valor],
      )
    }

    const verify = await currentSnapshot(client, lineMap, data)
    const verifyByKey = new Map(verify.map(row => [
      `${String(row.empresa).toUpperCase()}:${Number(row.row_idx)}:${Number(row.mes)}`,
      Number(row.valor || 0),
    ]))
    const invalid = targets.filter(row => !approx(
      verifyByKey.get(`${row.empresa}:${row.row_idx}:${row.mes}`),
      row.valor,
      0.0001,
    ))

    if (invalid.length) {
      throw new Error(`Validação final falhou em ${invalid.length} valores. A transação será cancelada.`)
    }

    await client.query('COMMIT')
    console.log('\n✅ Posições mensais corrigidas com sucesso.')
    console.log(`Backup anterior: ${backupFile}`)
    console.log(`Valores gravados/verificados: ${EXPECTED_TARGETS}`)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch {}
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\n❌ ${error.message}`)
  process.exitCode = 1
})
