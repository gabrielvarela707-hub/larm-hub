#!/usr/bin/env node
'use strict'

/**
 * Auditoria somente leitura — Strato x LarmHub / Contas a Receber.
 *
 * Analisa um retorno CNAB 400 e o relatório Strato correspondente, agrupa
 * boletos consolidados e compara clientes, contratos e parcelas no PostgreSQL.
 * Nenhum INSERT, UPDATE ou DELETE é executado.
 *
 * Uso:
 *   node scripts/auditar_sincronizacao_strato_larmhub.js \
 *     --retorno="/tmp/CB230700 LUCKY .RET" \
 *     --relatorio="/tmp/RET 23072026 LUCKY.pdf" \
 *     --saida="/tmp/auditoria-cb230700-lucky"
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

function parseArgs(argv) {
  const args = {}
  for (const token of argv.slice(2)) {
    if (!token.startsWith('--')) continue
    const [key, ...rest] = token.slice(2).split('=')
    args[key] = rest.length ? rest.join('=') : true
  }
  return args
}

function onlyDigits(value) { return String(value || '').replace(/\D/g, '') }
function roundMoney(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100 }
function cents(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function dateIso(value) {
  if (!value) return null
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return null
}
function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
function safeFilename(value) {
  return String(value || 'auditoria')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex') }

function allocateProportionally(totalValue, components) {
  const totalCents = cents(totalValue)
  if (!components.length) return []
  const weights = components.map(item => Math.max(cents(item.valor_titulo), 1))
  const weightTotal = weights.reduce((sum, value) => sum + value, 0)
  const raw = weights.map(weight => totalCents * weight / weightTotal)
  const allocated = raw.map(value => Math.floor(value))
  let remainder = totalCents - allocated.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (let index = 0; index < remainder; index += 1) allocated[order[index % order.length].index] += 1
  return allocated.map(value => value / 100)
}

function groupReportTitles(report) {
  const groups = new Map()
  for (const title of report.titulos || []) {
    const boleto = onlyDigits(title.boleto)
    if (!boleto) continue
    if (!groups.has(boleto)) groups.set(boleto, [])
    groups.get(boleto).push(title)
  }
  for (const items of groups.values()) {
    items.sort((a, b) => Number(a.parcela_numero || 0) - Number(b.parcela_numero || 0))
  }
  return groups
}

function selectReturnLiquidations(parsed) {
  return (parsed.details || parsed.items || [])
    .filter(item => String(item.occurrence || '').padStart(2, '0') === '06')
    .map(item => ({
      ...item,
      boleto: `${onlyDigits(item.nossoNumero)}${onlyDigits(item.nossoNumeroDv)}`,
    }))
}

function receivableValueSql(alias = 'p') {
  return `COALESCE(
    ${alias}.valor_recalculado,
    COALESCE(${alias}.valor_nominal, 0)
      + COALESCE(${alias}.valor_correcao, 0)
      + COALESCE(${alias}.valor_multa, 0)
      + COALESCE(${alias}.valor_juros_mora, 0)
      + COALESCE(${alias}.valor_outros_acrescimos, 0)
      + COALESCE(${alias}.valor_seguro, 0)
      - COALESCE(${alias}.valor_desconto, 0)
  )`
}

function resolveReturnHashColumn(columnNames = []) {
  const available = new Set(columnNames.map(value => String(value || '').toLowerCase()))
  if (available.has('sha256')) return 'sha256'
  if (available.has('hash_arquivo')) return 'hash_arquivo'
  return null
}

async function findTenant(client, returnFilename, returnHash, explicitTenant) {
  if (explicitTenant) return explicitTenant

  // A tabela atual usa `sha256`. Algumas bases antigas usavam
  // `hash_arquivo`; a auditoria aceita ambas sem alterar a estrutura.
  const columnsResult = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='fin_retornos_cobranca'
        AND column_name IN ('sha256', 'hash_arquivo')`,
  )
  const hashColumn = resolveReturnHashColumn(columnsResult.rows.map(row => row.column_name))
  const conditions = ['LOWER(nome_arquivo)=LOWER($1)']
  const params = [path.basename(returnFilename)]
  if (hashColumn) {
    conditions.push(`${hashColumn}=$2`)
    params.push(returnHash)
  }

  const { rows } = await client.query(
    `SELECT tenant_id, id, nome_arquivo
       FROM fin_retornos_cobranca
      WHERE ${conditions.join(' OR ')}
      ORDER BY created_at DESC, id DESC
      LIMIT 2`,
    params,
  )
  if (rows.length === 1) return rows[0].tenant_id
  if (rows.length > 1 && rows.every(row => String(row.tenant_id) === String(rows[0].tenant_id))) return rows[0].tenant_id
  if (process.env.TENANT_ID) return process.env.TENANT_ID
  throw new Error('Tenant não identificado com segurança. Informe --tenant=<uuid>.')
}

async function findContracts(client, tenantId, reportItems) {
  const reference = reportItems[0] || {}
  const obra = Number(reference.obra || 0) || null
  const unidade = String(reference.unidade || '').trim()
  const clienteCodigo = String(reference.cliente_codigo || '').trim()
  const clienteNome = normalizeText(reference.cliente_nome)

  const { rows } = await client.query(
    `SELECT
       c.id,
       c.numero,
       c.titulo,
       c.obra_codigo_legado,
       c.unidade_codigo_legado,
       c.comprador_nome,
       c.status,
       c.created_at,
       c.updated_at,
       cl.id AS cliente_id,
       cp.id AS pessoa_id,
       cp.codigo_legado::text AS cliente_codigo_legado,
       COALESCE(cp.nome, cp.razao_social, c.comprador_nome) AS cliente_nome,
       cp.cpf_cnpj,
       CASE
         WHEN NULLIF($4,'') IS NOT NULL AND cp.codigo_legado::text=$4 THEN 100
         WHEN NULLIF($5,'') IS NOT NULL AND regexp_replace(upper(COALESCE(cp.nome, cp.razao_social, c.comprador_nome,'')), '[^A-Z0-9]+', ' ', 'g')=$5 THEN 80
         ELSE 0
       END
       + CASE WHEN $2::integer IS NOT NULL AND c.obra_codigo_legado=$2 THEN 20 ELSE 0 END
       + CASE WHEN NULLIF($3,'') IS NOT NULL AND upper(COALESCE(c.unidade_codigo_legado,''))=upper($3) THEN 20 ELSE 0 END AS score
     FROM com_contratos c
     LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
     LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
     WHERE c.tenant_id=$1
       AND (
         (NULLIF($4,'') IS NOT NULL AND cp.codigo_legado::text=$4)
         OR (NULLIF($5,'') IS NOT NULL AND regexp_replace(upper(COALESCE(cp.nome, cp.razao_social, c.comprador_nome,'')), '[^A-Z0-9]+', ' ', 'g')=$5)
         OR (
           $2::integer IS NOT NULL AND c.obra_codigo_legado=$2
           AND NULLIF($3,'') IS NOT NULL AND upper(COALESCE(c.unidade_codigo_legado,''))=upper($3)
         )
       )
     ORDER BY score DESC, c.updated_at DESC NULLS LAST, c.id`,
    [tenantId, obra, unidade, clienteCodigo, clienteNome],
  )
  return rows
}

async function findParcels(client, tenantId, contractId) {
  const { rows } = await client.query(
    `SELECT
       p.id,
       p.contrato_id,
       p.numero,
       p.tipo,
       to_char(p.vencimento::date, 'YYYY-MM-DD') AS vencimento,
       p.valor_nominal,
       ${receivableValueSql('p')}::numeric AS valor_atual,
       p.valor_desconto,
       p.status,
       to_char(p.pago_em::date, 'YYYY-MM-DD') AS pago_em,
       p.valor_pago,
       p.movimento_id,
       p.origem_baixa,
       p.documento_legado,
       p.documento_base_legado,
       p.parcela_numero_legado,
       p.parcela_total_legado,
       p.nosso_numero,
       p.nosso_numero_dv,
       p.controle_participante,
       p.posicao_relatorio,
       p.codigo_legado,
       p.dados_adicionais
     FROM com_parcelas p
     WHERE p.tenant_id=$1 AND p.contrato_id=$2
     ORDER BY p.vencimento, p.parcela_numero_legado NULLS LAST, p.id`,
    [tenantId, contractId],
  )
  return rows
}

function classifyComponent(reportItem, parcels) {
  const fractionMatches = parcels.filter(parcel =>
    Number(parcel.parcela_numero_legado) === Number(reportItem.parcela_numero)
      && Number(parcel.parcela_total_legado) === Number(reportItem.parcela_total)
  )
  const exact = fractionMatches.find(parcel => dateIso(parcel.vencimento) === dateIso(reportItem.vencimento))
    || (fractionMatches.length === 1 ? fractionMatches[0] : null)
  const sameDue = parcels.filter(parcel => dateIso(parcel.vencimento) === dateIso(reportItem.vencimento))
  const candidate = exact || (sameDue.length === 1 ? sameDue[0] : null)

  if (!candidate) {
    return {
      classificacao: 'PARCELA_AUSENTE_OU_SEM_CORRESPONDENCIA_UNICA',
      parcela: null,
      divergencias: ['Nenhuma parcela única foi encontrada por fração ou vencimento.'],
      bloqueado: false,
    }
  }

  const divergencias = []
  if (Number(candidate.parcela_numero_legado) !== Number(reportItem.parcela_numero)
    || Number(candidate.parcela_total_legado) !== Number(reportItem.parcela_total)) {
    divergencias.push(`Fração LarmHub ${candidate.parcela_numero_legado || '?'}\/${candidate.parcela_total_legado || '?'} diverge do Strato ${reportItem.parcela}.`)
  }
  if (dateIso(candidate.vencimento) !== dateIso(reportItem.vencimento)) {
    divergencias.push(`Vencimento LarmHub ${dateIso(candidate.vencimento)} diverge do Strato ${dateIso(reportItem.vencimento)}.`)
  }
  if (Math.abs(Number(candidate.valor_atual || 0) - Number(reportItem.valor_titulo || 0)) >= 0.01) {
    divergencias.push(`Valor LarmHub R$ ${money(candidate.valor_atual)} diverge do Strato R$ ${money(reportItem.valor_titulo)}.`)
  }
  const blocked = Boolean(candidate.movimento_id || candidate.pago_em || ['paga', 'pago', 'baixada', 'baixado'].includes(String(candidate.status || '').toLowerCase()))
  if (blocked) divergencias.push('Parcela já possui baixa/movimento e não pode ser alterada automaticamente.')

  let classificacao = 'PARCELA_EXATA'
  if (!exact && sameDue.length === 1) classificacao = 'PROVAVEL_FRACAO_CORROMPIDA_NA_IMPORTACAO'
  else if (divergencias.length) classificacao = 'PARCELA_LOCALIZADA_COM_DIVERGENCIAS'

  return { classificacao, parcela: candidate, divergencias, bloqueado: blocked }
}

function buildAuditForItem(returnItem, reportItems, contracts, parcelsByContract) {
  const fullBoleto = returnItem.boleto
  const grouped = reportItems.length > 1
  const allocations = allocateProportionally(returnItem.paidAmount, reportItems)
  const chosenContract = contracts.length === 1 ? contracts[0] : (contracts[0]?.score > contracts[1]?.score ? contracts[0] : null)
  const parcels = chosenContract ? (parcelsByContract.get(String(chosenContract.id)) || []) : []

  const components = reportItems.map((reportItem, index) => {
    const match = classifyComponent(reportItem, parcels)
    return {
      parcela_strato: reportItem.parcela,
      vencimento_strato: reportItem.vencimento,
      valor_nominal_strato: reportItem.valor_titulo,
      valor_pago_rateado: allocations[index] || 0,
      desconto_rateado_estimado: roundMoney(Number(reportItem.valor_titulo || 0) - Number(allocations[index] || 0)),
      classificacao: match.classificacao,
      bloqueado: match.bloqueado,
      divergencias: match.divergencias,
      parcela_larmhub: match.parcela ? {
        id: match.parcela.id,
        documento_legado: match.parcela.documento_legado,
        parcela_numero_legado: match.parcela.parcela_numero_legado,
        parcela_total_legado: match.parcela.parcela_total_legado,
        vencimento: dateIso(match.parcela.vencimento),
        valor_atual: Number(match.parcela.valor_atual),
        status: match.parcela.status,
        movimento_id: match.parcela.movimento_id,
        nosso_numero: match.parcela.nosso_numero,
        nosso_numero_dv: match.parcela.nosso_numero_dv,
        controle_participante: match.parcela.controle_participante,
      } : null,
    }
  })

  const blockers = []
  if (!reportItems.length) blockers.push('Boleto não localizado no relatório Strato anexado.')
  if (!contracts.length) blockers.push('Cliente/contrato não encontrado no LarmHub.')
  else if (!chosenContract) blockers.push('Mais de um contrato candidato sem vencedor inequívoco.')
  if (components.some(item => !item.parcela_larmhub)) blockers.push('Há componente sem parcela correspondente no LarmHub.')
  if (components.some(item => item.bloqueado)) blockers.push('Há componente já baixado ou vinculado a movimento.')
  if (grouped) blockers.push('Boleto consolidado: composição deve ser confirmada no SQL Server antes da baixa.')

  return {
    linha_retorno: returnItem.lineNumber,
    boleto: fullBoleto,
    nosso_numero: returnItem.nossoNumero,
    nosso_numero_dv: returnItem.nossoNumeroDv,
    controle_participante: returnItem.participantControl || null,
    documento_retorno: returnItem.documentNumber,
    vencimento_retorno: returnItem.dueDate,
    data_ocorrencia: returnItem.occurrenceDate,
    data_credito: returnItem.creditDate,
    valor_titulo_retorno: returnItem.titleAmount,
    valor_pago_retorno: returnItem.paidAmount,
    juros_retorno: returnItem.interestAmount,
    boleto_consolidado: grouped,
    quantidade_componentes: reportItems.length,
    cliente_strato: reportItems[0] ? {
      codigo: reportItems[0].cliente_codigo,
      nome: reportItems[0].cliente_nome,
      obra: reportItems[0].obra,
      unidade: reportItems[0].unidade,
    } : null,
    contratos_candidatos: contracts.map(item => ({
      id: item.id,
      numero: item.numero,
      cliente_codigo_legado: item.cliente_codigo_legado,
      cliente_nome: item.cliente_nome,
      obra: item.obra_codigo_legado,
      unidade: item.unidade_codigo_legado,
      score: item.score,
    })),
    contrato_selecionado: chosenContract ? { id: chosenContract.id, numero: chosenContract.numero } : null,
    componentes: components,
    bloqueios: blockers,
    pronto_para_aplicacao_automatica: blockers.length === 0,
  }
}

function renderMarkdown(result) {
  const lines = []
  lines.push(`# Auditoria Strato x LarmHub — ${result.retorno.arquivo}`)
  lines.push('')
  lines.push(`- Gerado em: ${result.gerado_em}`)
  lines.push(`- Empresa: ${result.retorno.empresa || 'não identificada'}`)
  lines.push(`- Liquidações no retorno: ${result.resumo.liquidacoes}`)
  lines.push(`- Boletos consolidados: ${result.resumo.boletos_consolidados}`)
  lines.push(`- Itens bloqueados para aplicação automática: ${result.resumo.itens_bloqueados}`)
  lines.push('')
  lines.push('> Esta auditoria é somente leitura. Nenhum dado foi alterado.')
  lines.push('')

  for (const item of result.itens) {
    lines.push(`## Boleto ${item.boleto} — ${item.cliente_strato?.nome || 'cliente não identificado'}`)
    lines.push('')
    lines.push(`- Documento no retorno: ${item.documento_retorno || '-'}`)
    lines.push(`- Pago: R$ ${money(item.valor_pago_retorno)} em ${item.data_ocorrencia || '-'}; crédito ${item.data_credito || '-'}`)
    lines.push(`- Contrato selecionado: ${item.contrato_selecionado?.numero || 'não identificado'}`)
    lines.push(`- Consolidado: ${item.boleto_consolidado ? `sim, ${item.quantidade_componentes} parcelas` : 'não'}`)
    lines.push('')
    lines.push('| Parcela Strato | Vencimento | Nominal Strato | Rateio do pago | Parcela LarmHub | Valor LarmHub | Status | Diagnóstico |')
    lines.push('|---|---:|---:|---:|---|---:|---|---|')
    for (const component of item.componentes) {
      const local = component.parcela_larmhub
      lines.push(`| ${component.parcela_strato || '-'} | ${component.vencimento_strato || '-'} | R$ ${money(component.valor_nominal_strato)} | R$ ${money(component.valor_pago_rateado)} | ${local?.documento_legado || '-'} | ${local ? `R$ ${money(local.valor_atual)}` : '-'} | ${local?.status || '-'} | ${component.classificacao} |`)
    }
    if (item.bloqueios.length) {
      lines.push('')
      lines.push('**Bloqueios:**')
      for (const blocker of item.bloqueios) lines.push(`- ${blocker}`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function writeOutputs(outputDir, result) {
  fs.mkdirSync(outputDir, { recursive: true })
  const base = safeFilename(path.parse(result.retorno.arquivo).name)
  const jsonPath = path.join(outputDir, `${base}-auditoria.json`)
  const csvPath = path.join(outputDir, `${base}-componentes.csv`)
  const mdPath = path.join(outputDir, `${base}-auditoria.md`)

  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  fs.writeFileSync(mdPath, renderMarkdown(result), 'utf8')

  const header = [
    'boleto', 'cliente_codigo', 'cliente_nome', 'contrato', 'parcela_strato', 'vencimento_strato',
    'valor_nominal_strato', 'valor_pago_rateado', 'parcela_larmhub_id', 'documento_larmhub',
    'vencimento_larmhub', 'valor_larmhub', 'status_larmhub', 'classificacao', 'bloqueado', 'divergencias',
  ]
  const rows = [header.join(';')]
  for (const item of result.itens) {
    for (const component of item.componentes) {
      const local = component.parcela_larmhub || {}
      rows.push([
        item.boleto,
        item.cliente_strato?.codigo,
        item.cliente_strato?.nome,
        item.contrato_selecionado?.numero,
        component.parcela_strato,
        component.vencimento_strato,
        component.valor_nominal_strato,
        component.valor_pago_rateado,
        local.id,
        local.documento_legado,
        local.vencimento,
        local.valor_atual,
        local.status,
        component.classificacao,
        component.bloqueado,
        component.divergencias.join(' | '),
      ].map(csvCell).join(';'))
    }
  }
  fs.writeFileSync(csvPath, `${rows.join('\n')}\n`, 'utf8')

  return { jsonPath, csvPath, mdPath }
}

async function main() {
  require('dotenv').config()
  const { pool, connectDB } = require('../src/config/database')
  const { parseReturn } = require('../src/services/bradescoCnab400')
  const { analyzePdfLocally } = require('../src/services/stratoReturnReportAnalyzer')
  const args = parseArgs(process.argv)
  const retornoPath = path.resolve(String(args.retorno || ''))
  const relatorioPath = path.resolve(String(args.relatorio || ''))
  if (!args.retorno || !fs.existsSync(retornoPath)) throw new Error('Informe um arquivo existente em --retorno=/caminho/arquivo.RET')
  if (!args.relatorio || !fs.existsSync(relatorioPath)) throw new Error('Informe um PDF existente em --relatorio=/caminho/relatorio.pdf')

  const outputDir = path.resolve(String(args.saida || path.join(process.cwd(), 'auditorias', `${safeFilename(path.parse(retornoPath).name)}-${new Date().toISOString().slice(0, 10)}`)))
  const returnBuffer = fs.readFileSync(retornoPath)
  const reportBuffer = fs.readFileSync(relatorioPath)
  const parsed = parseReturn(returnBuffer.toString('latin1'))
  const report = await analyzePdfLocally({ filename: path.basename(relatorioPath), base64: reportBuffer.toString('base64') })
  const liquidations = selectReturnLiquidations(parsed)
  const reportGroups = groupReportTitles(report)

  await connectDB()
  const client = await pool.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    await client.query("SET LOCAL statement_timeout='120s'")
    const tenantId = await findTenant(client, retornoPath, sha256(returnBuffer), args.tenant)
    const items = []

    for (const returnItem of liquidations) {
      const reportItems = reportGroups.get(returnItem.boleto) || []
      const contracts = await findContracts(client, tenantId, reportItems)
      const parcelsByContract = new Map()
      for (const contract of contracts.slice(0, 5)) {
        parcelsByContract.set(String(contract.id), await findParcels(client, tenantId, contract.id))
      }
      items.push(buildAuditForItem(returnItem, reportItems, contracts, parcelsByContract))
    }

    const result = {
      versao: '0.5.8',
      modo: 'SOMENTE_LEITURA',
      gerado_em: new Date().toISOString(),
      tenant_id: tenantId,
      retorno: {
        arquivo: path.basename(retornoPath),
        sha256: sha256(returnBuffer),
        empresa: parsed.header?.companyName || null,
        codigo_empresa: parsed.header?.companyCode || null,
        quantidade_detalhes: (parsed.details || parsed.items || []).length,
      },
      relatorio: {
        arquivo: path.basename(relatorioPath),
        sha256: sha256(reportBuffer),
        arquivo_retorno_identificado: report.arquivo_retorno,
        titulos: (report.titulos || []).length,
      },
      resumo: {
        liquidacoes: items.length,
        boletos_consolidados: items.filter(item => item.boleto_consolidado).length,
        itens_bloqueados: items.filter(item => item.bloqueios.length).length,
        clientes_ou_contratos_ausentes: items.filter(item => !item.contrato_selecionado).length,
        componentes_sem_parcela: items.reduce((sum, item) => sum + item.componentes.filter(component => !component.parcela_larmhub).length, 0),
        componentes_com_divergencia: items.reduce((sum, item) => sum + item.componentes.filter(component => component.divergencias.length).length, 0),
      },
      itens: items,
    }

    const outputs = writeOutputs(outputDir, result)
    await client.query('ROLLBACK')
    console.log('AUDITORIA SOMENTE LEITURA CONCLUÍDA')
    console.log(`Tenant: ${tenantId}`)
    console.log(`Liquidações: ${result.resumo.liquidacoes}`)
    console.log(`Consolidados: ${result.resumo.boletos_consolidados}`)
    console.log(`Bloqueados: ${result.resumo.itens_bloqueados}`)
    console.log(`JSON: ${outputs.jsonPath}`)
    console.log(`CSV: ${outputs.csvPath}`)
    console.log(`Relatório: ${outputs.mdPath}`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`ERRO: ${error.stack || error.message}`)
    process.exitCode = 1
  })
}

module.exports = {
  allocateProportionally,
  groupReportTitles,
  classifyComponent,
  buildAuditForItem,
  resolveReturnHashColumn,
  dateIso,
}
