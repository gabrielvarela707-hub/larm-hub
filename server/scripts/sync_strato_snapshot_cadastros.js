/**
 * LarmHub 0.8.3 — sincronização cadastral Strato -> LarmHub.
 *
 * Objetivo:
 * - atualizar pessoas/clientes já conhecidos somente nos campos vazios;
 * - criar clientes novos pelo código do Strato;
 * - criar somente contratos novos a partir da data de corte;
 * - NÃO importar parcelas, valores indexados, baixas ou Movimento Bancário.
 *
 * Prévia (não altera nada):
 *   node scripts/sync_strato_snapshot_cadastros.js \
 *     --file=scripts/imports/strato_snapshot_2026_07_25.csv \
 *     --cutoff=2026-06-01
 *
 * Execução:
 *   node scripts/sync_strato_snapshot_cadastros.js \
 *     --file=scripts/imports/strato_snapshot_2026_07_25.csv \
 *     --cutoff=2026-06-01 --execute
 */

const fs = require('fs')
const path = require('path')

let pool = null
let connectDB = null
let upsertPessoa = null

function loadRuntime() {
  require('dotenv').config()
  const database = require('../src/config/database')
  const pessoaService = require('../src/services/cadastroPessoaService')
  pool = database.pool
  connectDB = database.connectDB
  upsertPessoa = pessoaService.upsertPessoa
}

function cleanText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim()
  return !text || text.toUpperCase() === 'NULL' ? null : text
}

function digitsOnly(value) {
  return String(value ?? '').replace(/\\D/g, '')
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
}

const EXECUTE = process.argv.includes('--execute')
const FILE_ARG = (process.argv.find(arg => arg.startsWith('--file=')) || '').slice('--file='.length)
const CUTOFF_ARG = (process.argv.find(arg => arg.startsWith('--cutoff=')) || '').slice('--cutoff='.length)
const TENANT_ARG = (process.argv.find(arg => arg.startsWith('--tenant=')) || '').slice('--tenant='.length)
const FILE_PATH = path.resolve(process.cwd(), FILE_ARG || 'scripts/imports/strato_snapshot_2026_07_25.csv')
const CUTOFF = /^\d{4}-\d{2}-\d{2}$/.test(CUTOFF_ARG) ? CUTOFF_ARG : '2026-06-01'

const COL = Object.freeze({
  tipo_registro: 0,
  empresa: 1,
  obra_codigo: 2,
  unidade: 3,
  cliente_codigo: 4,
  cliente_nome: 5,
  cliente_cpf_cnpj: 6,
  cliente_telefone: 7,
  cliente_email: 8,
  contrato_codigo: 9,
  contrato_data: 10,
  contrato_cancelado_em: 11,
  contrato_valor: 12,
  contrato_saldo: 13,
  contrato_situacao: 14,
  parcela_controle: 15,
  parcela_documento: 16,
  parcela_vencimento: 17,
  parcela_recebimento: 18,
  parcela_status: 19,
  valor_core_parcela: 20,
  valor_core_pago: 21,
  valor_core_desconto: 22,
  boleto_codigo: 23,
  boleto_emitido_em: 24,
  boleto_vencimento: 25,
  boleto_recebimento: 26,
  boleto_valor_nominal: 27,
  boleto_valor_recebido: 28,
  boleto_desconto: 29,
  boleto_juros_financeiro: 30,
  boleto_juros: 31,
  boleto_multa: 32,
  boleto_residuo: 33,
  boleto_composicao: 34,
  boleto_linha_digitavel: 35,
  boleto_codigo_barras: 36,
  extraido_em: 37,
})

function value(row, key) {
  const raw = row[COL[key]]
  if (raw === undefined || raw === null) return null
  const text = String(raw).replace(/^\uFEFF/, '').trim()
  return !text || text.toUpperCase() === 'NULL' ? null : text
}

function isoDate(raw) {
  const text = cleanText(raw)
  const match = text && text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function numberValue(raw) {
  const text = cleanText(raw)
  if (!text) return null
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function splitEmails(raw) {
  const text = cleanText(raw)
  if (!text) return []
  return [...new Set(text.split(/[;,]/).map(item => item.trim().toLowerCase()).filter(Boolean))]
}

function parseDelimited(text, onRow) {
  let row = []
  let field = ''
  let quoted = false

  const flushField = () => {
    row.push(field)
    field = ''
  }
  const flushRow = () => {
    flushField()
    if (row.some(item => String(item).trim() !== '')) onRow(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ';') {
      flushField()
    } else if (char === '\n') {
      if (field.endsWith('\r')) field = field.slice(0, -1)
      flushRow()
    } else {
      field += char
    }
  }

  if (field.length || row.length) flushRow()
  if (quoted) throw new Error('CSV inválido: aspas não encerradas.')
}

function mergeClient(existing, incoming) {
  if (!existing) return incoming
  const existingDoc = digitsOnly(existing.cliente_cpf_cnpj)
  const incomingDoc = digitsOnly(incoming.cliente_cpf_cnpj)
  if (existingDoc && incomingDoc && existingDoc !== incomingDoc) {
    throw new Error(`Código ${incoming.cliente_codigo} possui CPF/CNPJ divergente no snapshot.`)
  }
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, item]) => cleanText(item))),
    empresas: [...new Set([...(existing.empresas || []), ...(incoming.empresas || [])])],
    obras: [...new Set([...(existing.obras || []), ...(incoming.obras || [])])],
  }
}

function parseSnapshot(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`)
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')
  const clients = new Map()
  const contracts = new Map()
  const parcelStats = new Map()
  const totals = { linhas: 0, clientes: 0, contratos: 0, parcelas: 0, ignoradas: 0 }
  let extractedAt = null

  parseDelimited(text, row => {
    totals.linhas += 1
    if (row.length !== 38) {
      throw new Error(`Linha ${totals.linhas} possui ${row.length} colunas; esperado: 38.`)
    }

    const kind = String(value(row, 'tipo_registro') || '').toUpperCase()
    extractedAt = extractedAt || value(row, 'extraido_em')

    const clientCode = value(row, 'cliente_codigo')
    if (kind === 'CLIENTE') {
      totals.clientes += 1
      if (!clientCode) return
      const emails = splitEmails(value(row, 'cliente_email'))
      const current = {
        cliente_codigo: clientCode,
        cliente_nome: value(row, 'cliente_nome'),
        cliente_cpf_cnpj: value(row, 'cliente_cpf_cnpj'),
        cliente_telefone: value(row, 'cliente_telefone'),
        cliente_email: emails[0] || null,
        emails_adicionais: emails.slice(1),
        empresas: [value(row, 'empresa')].filter(Boolean),
        obras: [value(row, 'obra_codigo')].filter(Boolean),
      }
      clients.set(clientCode, mergeClient(clients.get(clientCode), current))
      return
    }

    const contractCode = value(row, 'contrato_codigo')
    if (kind === 'CONTRATO') {
      totals.contratos += 1
      if (!contractCode) return
      const emails = splitEmails(value(row, 'cliente_email'))
      contracts.set(contractCode, {
        contrato_codigo: contractCode,
        contrato_data: isoDate(value(row, 'contrato_data')),
        contrato_cancelado_em: isoDate(value(row, 'contrato_cancelado_em')),
        contrato_valor: numberValue(value(row, 'contrato_valor')),
        contrato_saldo: numberValue(value(row, 'contrato_saldo')),
        contrato_situacao: value(row, 'contrato_situacao'),
        empresa: value(row, 'empresa'),
        obra_codigo: value(row, 'obra_codigo'),
        unidade: value(row, 'unidade'),
        cliente_codigo: clientCode,
        cliente_nome: value(row, 'cliente_nome'),
        cliente_cpf_cnpj: value(row, 'cliente_cpf_cnpj'),
        cliente_telefone: value(row, 'cliente_telefone'),
        cliente_email: emails[0] || null,
        emails_adicionais: emails.slice(1),
      })
      return
    }

    if (kind === 'PARCELA') {
      totals.parcelas += 1
      if (!contractCode) return
      const due = isoDate(value(row, 'parcela_vencimento'))
      const stats = parcelStats.get(contractCode) || {
        total: 0,
        pagas: 0,
        abertas: 0,
        atrasadas: 0,
        canceladas: 0,
        primeiro_vencimento: null,
        ultimo_vencimento: null,
        parcelas_com_boleto_materializado: 0,
      }
      stats.total += 1
      const status = String(value(row, 'parcela_status') || '').toUpperCase()
      if (status === 'PAGA') stats.pagas += 1
      else if (status === 'ABERTA') stats.abertas += 1
      else if (status === 'ATRASADA') stats.atrasadas += 1
      else if (status === 'CANCELADA') stats.canceladas += 1
      if (due && (!stats.primeiro_vencimento || due < stats.primeiro_vencimento)) stats.primeiro_vencimento = due
      if (due && (!stats.ultimo_vencimento || due > stats.ultimo_vencimento)) stats.ultimo_vencimento = due
      if ((numberValue(value(row, 'boleto_valor_nominal')) || 0) > 0) stats.parcelas_com_boleto_materializado += 1
      parcelStats.set(contractCode, stats)
      return
    }

    totals.ignoradas += 1
  })

  return { clients, contracts, parcelStats, totals, extractedAt }
}

async function resolveTenant(client) {
  if (TENANT_ARG) {
    const { rows } = await client.query('SELECT id FROM hub_tenants WHERE id=$1', [TENANT_ARG])
    if (!rows[0]) throw new Error(`Tenant não encontrado: ${TENANT_ARG}`)
    return rows[0].id
  }
  const { rows } = await client.query('SELECT id FROM hub_tenants ORDER BY id')
  if (rows.length === 1) return rows[0].id
  if (!rows.length) throw new Error('Nenhum tenant encontrado em hub_tenants.')
  throw new Error(`Existem ${rows.length} tenants. Informe --tenant=<UUID>.`)
}

async function loadCurrentClients(client) {
  const { rows } = await client.query(`
    SELECT cl.id AS cliente_id, cl.codigo, cl.pessoa_id, cl.ativo AS cliente_ativo,
           p.nome, p.nome_normalizado, p.cpf_cnpj, p.cpf_cnpj_digitos,
           p.email, p.emails_adicionais, p.telefone, p.celular, p.ativo AS pessoa_ativa
      FROM cad_clientes cl
      JOIN cad_pessoas p ON p.id=cl.pessoa_id
     ORDER BY cl.id
  `)
  const map = new Map()
  for (const row of rows) {
    const code = cleanText(row.codigo)
    if (code && !map.has(code)) map.set(code, row)
  }
  return map
}

async function loadCurrentContracts(client, tenantId) {
  const { rows } = await client.query(`
    SELECT id, numero, cliente_id, comprador_nome, comprador_cpf,
           comprador_phone, comprador_email, valor_total, parcelas_count,
           status, obra_codigo_legado, unidade_codigo_legado, dados_adicionais
      FROM com_contratos
     WHERE tenant_id=$1
     ORDER BY created_at, id
  `, [tenantId])
  const map = new Map()
  for (const row of rows) {
    const number = cleanText(row.numero)?.toUpperCase()
    if (number && !map.has(number)) map.set(number, row)
  }
  return map
}

function clientNeedsEnrichment(existing, source) {
  if (!existing) return true
  const checks = [
    [existing.nome, source.cliente_nome],
    [existing.cpf_cnpj, source.cliente_cpf_cnpj],
    [existing.email, source.cliente_email],
    [existing.telefone || existing.celular, source.cliente_telefone],
  ]
  return checks.some(([oldValue, newValue]) => !cleanText(oldValue) && cleanText(newValue))
}

function contractNumber(source) {
  return `STR-${source.contrato_codigo}-${source.unidade}`.toUpperCase()
}

function companyMetadata(obraCode) {
  const code = String(obraCode || '')
  if (code === '7698') return {
    empreendimento_id: '5',
    titulo_obra: 'RESIDENCIAL SANTA CLARA',
    empresa_nome: 'LUCKY CAPITAL EMPREENDIMENTOS LTDA',
    tipo_contrato: 'venda',
  }
  if (code === '7701') return {
    empreendimento_id: '7',
    titulo_obra: 'ALUGUEL CJ 23',
    empresa_nome: 'LARM PARTICIPAÇÕES LTDA',
    tipo_contrato: 'aluguel',
  }
  return {
    empreendimento_id: '6',
    titulo_obra: 'LARM RESIDENCIAL SANTA CLARA',
    empresa_nome: 'LARM PARTICIPAÇÕES LTDA',
    tipo_contrato: 'venda',
  }
}

async function saveClient(client, source, existing, summary) {
  const saved = await upsertPessoa(client, {
    codigo_legado: source.cliente_codigo,
    nome: source.cliente_nome,
    razao_social: source.cliente_nome,
    nome_fantasia: source.cliente_nome,
    cpf_cnpj: source.cliente_cpf_cnpj,
    email: source.cliente_email,
    emails_adicionais: source.emails_adicionais,
    telefone: source.cliente_telefone,
    celular: source.cliente_telefone,
    ativo: true,
    dados_adicionais: {
      strato_snapshot: {
        codigo_cliente: source.cliente_codigo,
        empresas: source.empresas || [],
        obras: source.obras || [],
        sincronizado_em: new Date().toISOString(),
        versao: '0.8.3',
      },
    },
  }, {
    pessoaId: existing?.pessoa_id || null,
    fillOnly: true,
  })

  if (existing) {
    await client.query(
      `UPDATE cad_clientes
          SET ativo=TRUE,
              codigo=COALESCE(NULLIF(codigo,''), $1),
              observacoes=COALESCE(NULLIF(observacoes,''), $2),
              updated_at=NOW()
        WHERE id=$3`,
      [source.cliente_codigo, 'Sincronizado do snapshot SQL Server Strato.', existing.cliente_id],
    )
    summary.clientes_enriquecidos += 1
    return existing.cliente_id
  }

  const byPerson = await client.query('SELECT id FROM cad_clientes WHERE pessoa_id=$1 ORDER BY id LIMIT 1', [saved.pessoa.id])
  if (byPerson.rows[0]) {
    await client.query(
      `UPDATE cad_clientes
          SET codigo=COALESCE(NULLIF(codigo,''), $1), ativo=TRUE, updated_at=NOW()
        WHERE id=$2`,
      [source.cliente_codigo, byPerson.rows[0].id],
    )
    summary.clientes_enriquecidos += 1
    return byPerson.rows[0].id
  }

  const inserted = await client.query(
    `INSERT INTO cad_clientes (pessoa_id, codigo, observacoes, ativo)
     VALUES ($1,$2,$3,TRUE)
     RETURNING id`,
    [saved.pessoa.id, source.cliente_codigo, 'Criado pela sincronização cadastral SQL Server Strato 0.8.3.'],
  )
  summary.clientes_criados += 1
  return inserted.rows[0].id
}

async function insertContract(client, tenantId, source, customerId, stats, extractedAt) {
  const company = companyMetadata(source.obra_codigo)
  const number = contractNumber(source)
  const total = Number(source.contrato_valor || 0)
  const titlePrefix = company.tipo_contrato === 'aluguel' ? 'Aluguel' : 'Contrato'
  const data = {
    origem_snapshot: path.basename(FILE_PATH),
    extraido_em: extractedAt,
    sincronizacao_versao: '0.8.3',
    contrato_codigo_strato: source.contrato_codigo,
    cliente_codigo_strato: source.cliente_codigo,
    contrato_situacao_strato: source.contrato_situacao,
    contrato_saldo_strato: source.contrato_saldo,
    empresa: source.empresa,
    empresa_nome: company.empresa_nome,
    parcelas_snapshot: stats || {},
    parcelas_nao_importadas: true,
    motivo_parcelas_nao_importadas: 'core1_val_par pode representar valor indexado e não valor monetário em reais',
  }

  const result = await client.query(
    `INSERT INTO com_contratos (
       tenant_id, numero, lot_id, lot_number, empreendimento_id,
       comprador_nome, comprador_cpf, comprador_phone, comprador_email,
       valor_total, valor_entrada, parcelas_count, taxa_juros_mes,
       financiamento_tipo, status, assinado_em, observacoes,
       cliente_id, titulo, tipo_contrato, data_inicio, data_fim,
       data_assinatura, codigo_legado, origem,
       obra_codigo_legado, unidade_codigo_legado, dados_adicionais
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,
       $10,0,$11,0,'price','assinado',$12,$13,
       $14,$15,$16,$17,$18,$19,$20,'strato_snapshot',
       $21,$22,$23::jsonb
     )
     RETURNING id, numero`,
    [
      tenantId,
      number,
      `${source.obra_codigo}/${source.unidade}`,
      source.unidade,
      company.empreendimento_id,
      source.cliente_nome,
      source.cliente_cpf_cnpj,
      source.cliente_telefone,
      source.cliente_email,
      total,
      Number(stats?.total || 1),
      source.contrato_data,
      `Importado do snapshot SQL Server Strato. Parcelas não foram criadas nesta etapa para evitar valores indexados incorretos.`,
      customerId,
      `${titlePrefix} — ${company.titulo_obra} / ${source.unidade}`,
      company.tipo_contrato,
      stats?.primeiro_vencimento || source.contrato_data,
      stats?.ultimo_vencimento || source.contrato_data,
      source.contrato_data,
      `STR-VEND-${source.contrato_codigo}`,
      Number(source.obra_codigo),
      source.unidade,
      JSON.stringify(data),
    ],
  )
  return result.rows[0]
}

async function main() {
  const snapshot = parseSnapshot(FILE_PATH)
  loadRuntime()
  await connectDB()
  const client = await pool.connect()

  try {
    const tenantId = await resolveTenant(client)
    const currentClients = await loadCurrentClients(client)
    const currentContracts = await loadCurrentContracts(client, tenantId)

    const missingClients = []
    const enrichingClients = []
    for (const source of snapshot.clients.values()) {
      const existing = currentClients.get(source.cliente_codigo)
      if (!existing) missingClients.push(source)
      else if (clientNeedsEnrichment(existing, source)) enrichingClients.push({ source, existing })
    }

    const recentContracts = []
    const historicalMissingContracts = []
    const existingContractsToLink = []
    for (const source of snapshot.contracts.values()) {
      const number = contractNumber(source)
      const existing = currentContracts.get(number)
      if (existing) {
        if (!existing.cliente_id && source.cliente_codigo) existingContractsToLink.push({ source, existing })
        continue
      }
      if (source.contrato_data && source.contrato_data >= CUTOFF) recentContracts.push(source)
      else historicalMissingContracts.push(source)
    }

    const preview = {
      modo: EXECUTE ? 'EXECUCAO' : 'PREVIA_SEM_ALTERACAO',
      arquivo: FILE_PATH,
      extraido_em: snapshot.extractedAt,
      data_corte_contratos: CUTOFF,
      tenant_id: tenantId,
      snapshot: {
        linhas: snapshot.totals.linhas,
        clientes_linhas: snapshot.totals.clientes,
        clientes_unicos: snapshot.clients.size,
        contratos: snapshot.contracts.size,
        parcelas: snapshot.totals.parcelas,
      },
      alteracoes_previstas: {
        clientes_criar: missingClients.length,
        clientes_enriquecer: enrichingClients.length,
        contratos_recentes_criar: recentContracts.length,
        contratos_existentes_vincular_cliente: existingContractsToLink.length,
        contratos_historicos_ausentes_nao_importados: historicalMissingContracts.length,
        parcelas_importar: 0,
      },
      clientes_novos: missingClients.map(item => ({
        codigo: item.cliente_codigo,
        nome: item.cliente_nome,
        cpf_cnpj: item.cliente_cpf_cnpj,
        empresa: item.empresas,
      })),
      contratos_novos: recentContracts.map(item => ({
        contrato: item.contrato_codigo,
        numero_larmhub: contractNumber(item),
        cliente_codigo: item.cliente_codigo,
        cliente: item.cliente_nome,
        obra: item.obra_codigo,
        unidade: item.unidade,
        data: item.contrato_data,
        parcelas: snapshot.parcelStats.get(item.contrato_codigo) || null,
      })),
      seguranca: {
        importa_parcelas: false,
        cria_movimento_bancario: false,
        executa_baixa: false,
        remove_dados: false,
        sobrescreve_campos_preenchidos: false,
      },
    }

    console.log(JSON.stringify(preview, null, 2))
    if (!EXECUTE) return

    const summary = {
      clientes_criados: 0,
      clientes_enriquecidos: 0,
      contratos_criados: 0,
      contratos_vinculados: 0,
    }

    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('strato_snapshot_cadastros_0_8_3'))`)

    const clientIds = new Map()
    const clientWork = [...missingClients, ...enrichingClients.map(item => item.source)]
    for (const source of clientWork) {
      const existing = currentClients.get(source.cliente_codigo) || null
      const id = await saveClient(client, source, existing, summary)
      clientIds.set(source.cliente_codigo, id)
    }

    for (const source of snapshot.clients.values()) {
      if (clientIds.has(source.cliente_codigo)) continue
      const existing = currentClients.get(source.cliente_codigo)
      if (existing) clientIds.set(source.cliente_codigo, existing.cliente_id)
    }

    for (const item of existingContractsToLink) {
      const customerId = clientIds.get(item.source.cliente_codigo)
      if (!customerId) continue
      await client.query(
        `UPDATE com_contratos
            SET cliente_id=$1,
                comprador_nome=COALESCE(NULLIF(comprador_nome,''), $2),
                comprador_cpf=COALESCE(NULLIF(comprador_cpf,''), $3),
                comprador_phone=COALESCE(NULLIF(comprador_phone,''), $4),
                comprador_email=COALESCE(NULLIF(comprador_email,''), $5),
                updated_at=NOW()
          WHERE id=$6`,
        [
          customerId,
          item.source.cliente_nome,
          item.source.cliente_cpf_cnpj,
          item.source.cliente_telefone,
          item.source.cliente_email,
          item.existing.id,
        ],
      )
      summary.contratos_vinculados += 1
    }

    for (const source of recentContracts) {
      let customerId = clientIds.get(source.cliente_codigo)
      if (!customerId) {
        const clientSource = snapshot.clients.get(source.cliente_codigo) || source
        customerId = await saveClient(client, clientSource, currentClients.get(source.cliente_codigo) || null, summary)
        clientIds.set(source.cliente_codigo, customerId)
      }
      await insertContract(
        client,
        tenantId,
        source,
        customerId,
        snapshot.parcelStats.get(source.contrato_codigo),
        snapshot.extractedAt,
      )
      summary.contratos_criados += 1
    }

    await client.query('COMMIT')
    console.log(JSON.stringify({ ok: true, executado: true, summary }, null, 2))
  } catch (error) {
    if (EXECUTE) await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end().catch(() => {})
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({ ok: false, erro: error.message, stack: error.stack }, null, 2))
    process.exitCode = 1
  })
}

module.exports = { parseDelimited, parseSnapshot, contractNumber }
