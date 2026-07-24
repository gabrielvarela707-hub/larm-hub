/**
 * v0.3.87 — Processamento manual e idempotente de retornos Bradesco.
 *
 * Lê todos os .RET em scripts/imports/retornos-2026-07-02, identifica LARM/LUCKY
 * pelo cabeçalho, ignora arquivos repetidos pelo SHA-256 e executa primeiro a prévia.
 *
 * Prévia:
 *   node scripts/seed_processar_retornos_bradesco_2026_07_02.js
 *
 * Execução:
 *   node scripts/seed_processar_retornos_bradesco_2026_07_02.js --execute --confirmar=N
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { pool, connectDB } = require('../src/config/database')
const { processBradescoReturn } = require('../src/services/bradescoReturnProcessor')
const { parseReturn } = require('../src/services/bradescoCnab400')

const IMPORT_DIR = path.join(__dirname, 'imports', 'retornos-2026-07-02')
const MAX_OCCURRENCE_DATE = '2026-07-02'

function argValue(name) {
  const normalizedName = String(name || '').replace(/^--/, '')
  const prefix = `--${normalizedName}=`
  const entry = process.argv.find(value => value.startsWith(prefix))
  return entry ? entry.slice(prefix.length) : null
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
  })
}

async function resolveTenant(client) {
  const explicit = process.env.TENANT_ID || argValue('--tenant')
  if (explicit) {
    const { rows: [tenant] } = await client.query(
      'SELECT id, slug, name, hub_type FROM hub_tenants WHERE id=$1',
      [explicit],
    )
    if (!tenant) throw new Error(`Tenant não localizado: ${explicit}`)
    return tenant
  }

  const { rows } = await client.query(`
    SELECT t.id, t.slug, t.name, t.hub_type,
           COUNT(DISTINCT c.empresa) FILTER (
             WHERE UPPER(c.empresa) IN ('LARM','LUCKY') AND c.banco_codigo='237'
           )::int AS configs_bradesco,
           COUNT(DISTINCT p.id)::bigint AS parcelas
      FROM hub_tenants t
      LEFT JOIN fin_cobranca_bancaria_config c
        ON c.tenant_id=t.id AND c.ativo IS DISTINCT FROM FALSE
      LEFT JOIN com_parcelas p ON p.tenant_id=t.id
     WHERE t.is_active IS DISTINCT FROM FALSE
     GROUP BY t.id, t.slug, t.name, t.hub_type
     ORDER BY
       CASE WHEN COUNT(DISTINCT c.empresa) FILTER (
         WHERE UPPER(c.empresa) IN ('LARM','LUCKY') AND c.banco_codigo='237'
       )=2 THEN 0 ELSE 1 END,
       COUNT(DISTINCT p.id) DESC,
       t.id`)

  const candidates = rows.filter(row => Number(row.configs_bradesco) === 2 && Number(row.parcelas) > 0)
  if (candidates.length === 1) return candidates[0]
  throw new Error('Não foi possível selecionar um único tenant com configurações Bradesco de LARM e LUCKY. Use --tenant=UUID.')
}

async function resolveUser(client, tenantId) {
  const explicit = process.env.PROCESSADO_POR || argValue('--usuario')
  if (explicit) {
    const { rows: [user] } = await client.query(
      'SELECT id FROM hub_users WHERE id=$1 AND tenant_id=$2',
      [explicit, tenantId],
    )
    if (!user) throw new Error(`Usuário não localizado no tenant: ${explicit}`)
    return user.id
  }

  const { rows: [user] } = await client.query(`
    SELECT id
      FROM hub_users
     WHERE tenant_id=$1 AND is_active IS DISTINCT FROM FALSE
     ORDER BY CASE LOWER(role)
       WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2
       WHEN 'financial' THEN 3 WHEN 'financeiro' THEN 4 ELSE 9 END,
       last_login_at DESC NULLS LAST, created_at
     LIMIT 1`, [tenantId])
  return user?.id || null
}

function readUniqueFiles() {
  if (!fs.existsSync(IMPORT_DIR)) throw new Error(`Diretório não encontrado: ${IMPORT_DIR}`)
  const names = fs.readdirSync(IMPORT_DIR)
    .filter(name => /\.ret$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  if (!names.length) throw new Error(`Nenhum arquivo .RET encontrado em ${IMPORT_DIR}`)

  const seen = new Map()
  const unique = []
  const duplicates = []
  for (const filename of names) {
    const filepath = path.join(IMPORT_DIR, filename)
    const buffer = fs.readFileSync(filepath)
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
    if (seen.has(sha256)) {
      duplicates.push({ filename, sameAs: seen.get(sha256) })
      continue
    }
    const content = buffer.toString('latin1')
    const parsed = parseReturn(content)
    seen.set(sha256, filename)
    unique.push({ filename, content, parsed, sha256 })
  }
  return { unique, duplicates }
}

function summarize(results) {
  return results.reduce((total, result) => {
    if (result.duplicated) total.alreadyProcessed += 1
    else total.newFiles += 1
    total.conciliated += Number(result.conciliados || 0)
    total.notFound += Number(result.nao_localizados || 0)
    total.ready += Number(result.liquidacoes_prontas || 0)
    total.paid += Number(result.liquidacoes_baixadas || 0)
    total.movements += Number(result.movimentos_criados || 0)
    total.reused += Number(result.movimentos_reutilizados || 0)
    total.foundValue += Number(result.valor_liquidado || 0)
    total.paidValue += Number(result.valor_baixado || 0)
    return total
  }, {
    newFiles: 0, alreadyProcessed: 0, conciliated: 0, notFound: 0,
    ready: 0, paid: 0, movements: 0, reused: 0, foundValue: 0, paidValue: 0,
  })
}

function printFiles(files, duplicates) {
  console.log('\nARQUIVOS DE RETORNO ENCONTRADOS')
  for (const file of files) {
    console.log(
      `- ${file.filename}: ${file.parsed.header.companyName} | ` +
      `ocorrência até ${file.parsed.header.fileDate} | ${file.parsed.details.length} detalhe(s)`,
    )
  }
  for (const item of duplicates) {
    console.log(`- ${item.filename}: cópia idêntica de ${item.sameAs}; será ignorado.`)
  }
}

function printResults(results, title) {
  console.log(`\n========== ${title} ==========`)
  for (const result of results) {
    console.log(`\n${result.arquivo} (${result.empresa || 'empresa não identificada'})`)
    console.log(`  Localizados: ${result.conciliados}`)
    console.log(`  Não localizados: ${result.nao_localizados}`)
    console.log(`  Liquidações prontas: ${result.liquidacoes_prontas}`)
    console.log(`  Já baixadas: ${result.ja_baixadas}`)
    console.log(`  Movimentos novos: ${result.movimentos_criados || 0}`)
    console.log(`  Valor localizado: ${formatMoney(result.valor_liquidado)}`)
    if (result.duplicated) console.log('  Status: arquivo já processado; nenhuma duplicidade criada.')
  }
  const total = summarize(results)
  console.log('\n---------- TOTAL ----------')
  console.log(`Arquivos novos: ${total.newFiles}`)
  console.log(`Arquivos já processados: ${total.alreadyProcessed}`)
  console.log(`Liquidações prontas: ${total.ready}`)
  console.log(`Liquidações baixadas: ${total.paid}`)
  console.log(`Movimentos novos: ${total.movements}`)
  console.log(`Valor pronto/baixado: ${formatMoney(total.ready ? total.foundValue : total.paidValue)}`)
  return total
}

async function runProcessing(client, tenantId, userId, files, persist) {
  const results = []
  for (const file of files) {
    results.push(await processBradescoReturn({
      client,
      tenantId,
      userId,
      filename: file.filename,
      content: file.content,
      applyPayment: true,
      persist,
      maxOccurrenceDate: MAX_OCCURRENCE_DATE,
      explicitCompany: null,
    }))
  }
  return results
}

async function main() {
  const execute = process.argv.includes('--execute')
  const confirmation = Number(argValue('--confirmar'))
  const { unique, duplicates } = readUniqueFiles()
  printFiles(unique, duplicates)

  await connectDB()
  const client = await pool.connect()
  try {
    const tenant = await resolveTenant(client)
    const userId = await resolveUser(client, tenant.id)
    console.log(`\nTenant: ${tenant.name} (${tenant.slug}) — ${tenant.id}`)
    console.log(`Usuário técnico: ${userId || 'não localizado'}`)

    const preview = await runProcessing(client, tenant.id, userId, unique, false)
    const previewTotal = printResults(preview, 'PRÉVIA — NENHUMA ALTERAÇÃO REALIZADA')

    if (!execute) {
      console.log(`\nPara executar: node scripts/seed_processar_retornos_bradesco_2026_07_02.js --execute --confirmar=${previewTotal.ready}`)
      return
    }
    if (!Number.isInteger(confirmation) || confirmation !== previewTotal.ready) {
      throw new Error(`Confirmação inválida. Use --confirmar=${previewTotal.ready}.`)
    }

    await client.query('BEGIN')
    try {
      const executed = await runProcessing(client, tenant.id, userId, unique, true)
      await client.query('COMMIT')
      printResults(executed, 'EXECUÇÃO CONCLUÍDA')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\nERRO: ${error.message}`)
  console.error('Nenhuma alteração parcial foi mantida.')
  process.exit(1)
})
