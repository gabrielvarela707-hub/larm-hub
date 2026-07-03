/**
 * v0.3.84 — Processa os quatro retornos Bradesco enviados pelo cliente.
 *
 * Arquivos:
 *   - baixas de 30/06/2026 (LARM e LUCKY)
 *   - baixas de 01/07/2026 (LARM e LUCKY)
 *
 * A prévia é somente leitura:
 *   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js
 *
 * Execução (use a quantidade exibida na prévia):
 *   node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --execute --confirmar=N
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { pool, connectDB } = require('../src/config/database')
const { processBradescoReturn } = require('../src/services/bradescoReturnProcessor')

const IMPORT_DIR = path.join(__dirname, 'imports', 'retornos-2026-07-01')
const CUTOFF = '2026-07-01'
const FILES = [
  { filename: 'CB010700 Larm 30-06.RET', company: 'LARM' },
  { filename: 'CB010700 Lucky 30-06.RET', company: 'LUCKY' },
  { filename: 'CB020700 (Lucky 01-07).RET', company: 'LUCKY' },
  { filename: 'CB020700 Larm 01-07.RET', company: 'LARM' },
]

function argValue(name) {
  const prefix = `${name}=`
  const entry = process.argv.find(value => value.startsWith(prefix))
  return entry ? entry.slice(prefix.length) : null
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

async function resolveTenant(client) {
  const explicit = process.env.TENANT_ID || argValue('--tenant')
  if (explicit) {
    const { rows: [tenant] } = await client.query(
      'SELECT id, slug, name, hub_type FROM hub_tenants WHERE id=$1',
      [explicit],
    )
    if (!tenant) throw new Error(`TENANT_ID não localizado: ${explicit}`)
    return tenant
  }

  // Seleciona o tenant que realmente contém os recebíveis e as configurações
  // Bradesco de LARM e LUCKY. Na base validada, esse tenant é Santa Clara.
  const { rows } = await client.query(
    `SELECT t.id, t.slug, t.name, t.hub_type,
            COUNT(DISTINCT c.empresa) FILTER (WHERE UPPER(c.empresa) IN ('LARM','LUCKY') AND c.banco_codigo='237')::int AS configs_bradesco,
            COUNT(DISTINCT p.id)::bigint AS parcelas
       FROM hub_tenants t
       LEFT JOIN fin_cobranca_bancaria_config c ON c.tenant_id=t.id AND c.ativo IS DISTINCT FROM FALSE
       LEFT JOIN com_parcelas p ON p.tenant_id=t.id
      WHERE t.is_active IS DISTINCT FROM FALSE
      GROUP BY t.id, t.slug, t.name, t.hub_type
      ORDER BY
        CASE WHEN COUNT(DISTINCT c.empresa) FILTER (WHERE UPPER(c.empresa) IN ('LARM','LUCKY') AND c.banco_codigo='237')=2 THEN 0 ELSE 1 END,
        COUNT(DISTINCT p.id) DESC,
        t.id`,
  )

  const candidates = rows.filter(row => Number(row.configs_bradesco || 0) === 2 && Number(row.parcelas || 0) > 0)
  if (candidates.length === 1) return candidates[0]

  const opcoes = rows.length
    ? rows.map(t => `${t.name} (${t.slug}: ${t.id}; configs=${t.configs_bradesco}; parcelas=${t.parcelas})`).join(', ')
    : 'nenhum tenant ativo'
  throw new Error(`Não foi possível selecionar com segurança o tenant dos recebíveis. Opções: ${opcoes}. Use --tenant=UUID.`)
}

async function resolveUser(client, tenantId) {
  const explicit = process.env.PROCESSADO_POR || argValue('--usuario')
  if (explicit) {
    const { rows: [user] } = await client.query('SELECT id FROM hub_users WHERE id=$1 AND tenant_id=$2', [explicit, tenantId])
    if (!user) throw new Error(`Usuário PROCESSADO_POR não localizado no tenant: ${explicit}`)
    return user.id
  }

  const { rows: [user] } = await client.query(
    `SELECT id
       FROM hub_users
      WHERE tenant_id=$1 AND is_active IS DISTINCT FROM FALSE
      ORDER BY
        CASE LOWER(role)
          WHEN 'super_admin' THEN 0
          WHEN 'admin' THEN 1
          WHEN 'manager' THEN 2
          WHEN 'financial' THEN 3
          WHEN 'financeiro' THEN 4
          ELSE 9
        END,
        last_login_at DESC NULLS LAST,
        created_at
      LIMIT 1`,
    [tenantId],
  )
  return user?.id || null
}

function readFiles() {
  return FILES.map(({ filename, company }) => {
    const filepath = path.join(IMPORT_DIR, filename)
    if (!fs.existsSync(filepath)) throw new Error(`Arquivo não encontrado: ${filepath}`)
    return { filename, company, content: fs.readFileSync(filepath, 'latin1') }
  })
}

function summarize(results) {
  return results.reduce((total, result) => {
    if (result.duplicated) {
      total.duplicados += 1
      return total
    }
    total.arquivos += 1
    total.titulos += Number(result.titulos || 0)
    total.conciliados += Number(result.conciliados || 0)
    total.naoLocalizados += Number(result.nao_localizados || 0)
    total.liquidacoesEncontradas += Number(result.liquidacoes_encontradas || 0)
    total.liquidacoesProntas += Number(result.liquidacoes_prontas || 0)
    total.liquidacoesBaixadas += Number(result.liquidacoes_baixadas || 0)
    total.jaBaixadas += Number(result.ja_baixadas || 0)
    total.movimentos += Number(result.movimentos_criados || 0)
    total.movimentosReutilizados += Number(result.movimentos_reutilizados || 0)
    total.valorEncontrado += Number(result.valor_liquidado || 0)
    total.valorBaixado += Number(result.valor_baixado || 0)
    total.itens.push(...(result.itens || []).map(item => ({ arquivo: result.arquivo, ...item })))
    return total
  }, {
    arquivos: 0,
    duplicados: 0,
    titulos: 0,
    conciliados: 0,
    naoLocalizados: 0,
    liquidacoesEncontradas: 0,
    liquidacoesProntas: 0,
    liquidacoesBaixadas: 0,
    jaBaixadas: 0,
    movimentos: 0,
    movimentosReutilizados: 0,
    valorEncontrado: 0,
    valorBaixado: 0,
    itens: [],
  })
}

function printResults(results, title) {
  console.log(`\n========== ${title} ==========`)
  for (const result of results) {
    if (result.duplicated) {
      console.log(`\n${result.arquivo}: JÁ PROCESSADO — nenhuma duplicidade será criada.`)
      continue
    }
    console.log(`\n${result.arquivo} (${result.empresa || 'empresa não identificada'})`)
    console.log(`  Títulos: ${result.titulos}`)
    console.log(`  Localizados: ${result.conciliados}`)
    console.log(`  Não localizados: ${result.nao_localizados}`)
    console.log(`  Liquidações prontas: ${result.liquidacoes_prontas}`)
    console.log(`  Já baixadas: ${result.ja_baixadas}`)
    console.log(`  Valor localizado: ${formatMoney(result.valor_liquidado)}`)
    console.log(`  Movimentos novos: ${Number(result.movimentos_criados || 0)} | reutilizados: ${Number(result.movimentos_reutilizados || 0)}`)
    if (!result.conta_bancaria_localizada) {
      console.log(`  ALERTA: conta Bradesco ${result.empresa || ''} ${result.conta_bancaria_ambigua ? 'ambígua' : 'não localizada'}.`)
    }
  }

  const total = summarize(results)
  console.log('\n---------- TOTAL ----------')
  console.log(`Arquivos novos: ${total.arquivos}`)
  console.log(`Arquivos já processados: ${total.duplicados}`)
  console.log(`Detalhes analisados: ${total.titulos}`)
  console.log(`Detalhes conciliados: ${total.conciliados}`)
  console.log(`Detalhes não localizados: ${total.naoLocalizados}`)
  console.log(`Liquidações prontas para baixar: ${total.liquidacoesProntas}`)
  console.log(`Liquidações já baixadas: ${total.jaBaixadas}`)
  console.log(`Valor pronto para baixa: ${formatMoney(total.valorEncontrado)}`)
  console.log(`Movimentos bancários novos: ${total.movimentos} | movimentos existentes reutilizados: ${total.movimentosReutilizados}`)

  const unresolved = total.itens.filter(item => ['nao_localizado', 'empresa_nao_identificada', 'conta_bancaria_nao_localizada', 'conta_bancaria_ambigua'].includes(item.status_processamento))
  if (unresolved.length) {
    console.log('\nItens que exigem atenção e NÃO serão baixados automaticamente:')
    console.table(unresolved.map(item => ({
      arquivo: item.arquivo,
      linha: item.linha,
      empresa: item.empresa,
      ocorrencia: item.ocorrencia,
      nosso_numero: item.nosso_numero,
      controle: item.controle_participante,
      documento: item.documento,
      vencimento: item.vencimento,
      valor: formatMoney(item.valor_pago || item.valor_titulo),
      status: item.status_processamento,
    })))
  }
  return total
}

async function preview(client, tenantId, userId, files) {
  const results = []
  for (const file of files) {
    results.push(await processBradescoReturn({
      client,
      tenantId,
      userId,
      filename: file.filename,
      content: file.content,
      applyPayment: true,
      persist: false,
      maxOccurrenceDate: CUTOFF,
      explicitCompany: file.company,
    }))
  }
  return results
}

async function main() {
  const execute = process.argv.includes('--execute')
  const confirmation = Number(argValue('--confirmar'))
  const files = readFiles()

  await connectDB()
  const client = await pool.connect()
  try {
    const tenant = await resolveTenant(client)
    const tenantId = tenant.id
    const userId = await resolveUser(client, tenantId)
    console.log(`Tenant: ${tenant.name} (${tenant.slug}) — ${tenantId}`)
    console.log(`Usuário de processamento: ${userId || 'não informado (registro técnico)'}`)
    console.log(`Corte máximo da ocorrência: ${CUTOFF}`)

    const previewResults = await preview(client, tenantId, userId, files)
    const previewTotal = printResults(previewResults, 'PRÉVIA — NENHUMA ALTERAÇÃO REALIZADA')

    if (!execute) {
      console.log(`\nPara executar: node scripts/seed_processar_retornos_bradesco_ate_2026_07_01.js --execute --confirmar=${previewTotal.liquidacoesProntas}`)
      return
    }

    if (!Number.isInteger(confirmation) || confirmation !== previewTotal.liquidacoesProntas) {
      throw new Error(`Confirmação inválida. A prévia encontrou ${previewTotal.liquidacoesProntas} liquidações prontas. Use --confirmar=${previewTotal.liquidacoesProntas}.`)
    }

    await client.query('BEGIN')
    const executionResults = []
    try {
      for (const file of files) {
        executionResults.push(await processBradescoReturn({
          client,
          tenantId,
          userId,
          filename: file.filename,
          content: file.content,
          applyPayment: true,
          persist: true,
          maxOccurrenceDate: CUTOFF,
          explicitCompany: file.company,
        }))
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }

    const executed = printResults(executionResults, 'EXECUÇÃO CONCLUÍDA')
    console.log(`\nBaixas criadas: ${executed.liquidacoesBaixadas}`)
    console.log(`Movimentos Bancários criados: ${executed.movimentos}`)
    console.log(`Movimentos Bancários existentes reutilizados: ${executed.movimentosReutilizados}`)
    console.log(`Valor efetivamente baixado: ${formatMoney(executed.valorBaixado)}`)
    console.log('Os itens não localizados permaneceram intactos para análise manual.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\nERRO: ${error.message}`)
  if (process.env.DEBUG_SEED === '1' && error.stack) console.error(error.stack)
  process.exit(1)
})
