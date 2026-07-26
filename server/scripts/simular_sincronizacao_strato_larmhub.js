#!/usr/bin/env node
'use strict'

/**
 * Etapa B — simulação somente leitura da sincronização Strato x LarmHub.
 *
 * Recebe o JSON produzido pela auditoria, revalida todos os dados diretamente
 * no PostgreSQL e gera um plano de correção. Não existe modo de execução neste
 * arquivo: nenhuma parcela, baixa, cliente, contrato ou movimento é alterado.
 *
 * Uso:
 *   node scripts/simular_sincronizacao_strato_larmhub.js \
 *     --auditoria="/tmp/auditoria-cb230700-lucky/cb230700-lucky-auditoria.json" \
 *     --saida="/tmp/simulacao-cb230700-lucky"
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
function normalizeStatus(value) { return String(value || '').trim().toLowerCase() }
function isPaidStatus(value) { return ['paga', 'pago', 'baixada', 'baixado', 'liquidada', 'liquidado'].includes(normalizeStatus(value)) }
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
function safeFilename(value) {
  return String(value || 'simulacao')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}
function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
function sha256(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex') }

function allocateProportionally(totalValue, components) {
  const totalCents = cents(totalValue)
  if (!components.length) return []
  const weights = components.map(item => Math.max(cents(item.valor_nominal_strato ?? item.valor_titulo), 1))
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

function resolveHashColumn(columnNames = []) {
  const names = new Set(columnNames.map(value => String(value || '').toLowerCase()))
  if (names.has('sha256')) return 'sha256'
  if (names.has('hash_arquivo')) return 'hash_arquivo'
  return null
}

async function tableExists(client, tableName) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`])
  return Boolean(row?.reg)
}

async function findReturnHeader(client, audit) {
  const { rows: columns } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='fin_retornos_cobranca'
        AND column_name IN ('sha256','hash_arquivo')`,
  )
  const hashColumn = resolveHashColumn(columns.map(row => row.column_name))
  const conditions = ['LOWER(nome_arquivo)=LOWER($1)']
  const params = [audit.retorno?.arquivo]
  if (hashColumn && audit.retorno?.sha256) {
    conditions.push(`${hashColumn}=$2`)
    params.push(audit.retorno.sha256)
  }
  const { rows } = await client.query(
    `SELECT id, tenant_id, nome_arquivo, created_at
       FROM fin_retornos_cobranca
      WHERE tenant_id=$${params.length + 1}
        AND (${conditions.join(' OR ')})
      ORDER BY created_at DESC, id DESC
      LIMIT 3`,
    [...params, audit.tenant_id],
  )
  if (!rows.length) throw new Error('Retorno auditado não foi localizado em fin_retornos_cobranca.')
  if (rows.length > 1 && !rows.every(row => String(row.id) === String(rows[0].id))) {
    const exact = rows.filter(row => String(row.nome_arquivo).toLowerCase() === String(audit.retorno?.arquivo || '').toLowerCase())
    if (exact.length === 1) return exact[0]
  }
  return rows[0]
}

async function loadReturnItems(client, returnId) {
  const { rows } = await client.query(
    `SELECT
       id,
       retorno_id,
       tenant_id,
       parcela_id,
       nosso_numero,
       nosso_numero_dv,
       controle_participante,
       ocorrencia,
       to_char(data_ocorrencia::date, 'YYYY-MM-DD') AS data_ocorrencia,
       to_char(data_credito::date, 'YYYY-MM-DD') AS data_credito,
       to_char(data_vencimento::date, 'YYYY-MM-DD') AS data_vencimento,
       valor_titulo::numeric AS valor_titulo,
       valor_pago::numeric AS valor_pago,
       valor_juros::numeric AS valor_juros,
       valor_desconto::numeric AS valor_desconto,
       status_processamento,
       movimento_id,
       metodo_conciliacao,
       divergencia_valor,
       empresa,
       dados
     FROM fin_retornos_cobranca_itens
     WHERE retorno_id=$1
       AND ocorrencia='06'
     ORDER BY id`,
    [returnId],
  )
  return rows
}

async function loadContractParcels(client, tenantId, contractId) {
  const { rows } = await client.query(
    `SELECT
       p.id,
       p.tenant_id,
       p.contrato_id,
       p.numero,
       p.tipo,
       to_char(p.vencimento::date, 'YYYY-MM-DD') AS vencimento,
       p.valor_nominal::numeric AS valor_nominal,
       p.valor_convertido::numeric AS valor_convertido,
       p.valor_total_relatorio::numeric AS valor_total_relatorio,
       p.valor_correcao::numeric AS valor_correcao,
       p.valor_multa::numeric AS valor_multa,
       p.valor_juros_mora::numeric AS valor_juros_mora,
       p.valor_outros_acrescimos::numeric AS valor_outros_acrescimos,
       p.valor_seguro::numeric AS valor_seguro,
       p.valor_desconto::numeric AS valor_desconto,
       ${receivableValueSql('p')}::numeric AS valor_atual,
       p.status,
       to_char(p.pago_em::date, 'YYYY-MM-DD') AS pago_em,
       p.valor_pago::numeric AS valor_pago,
       p.movimento_id,
       p.origem_baixa,
       p.forma_pagamento,
       p.observacoes_baixa,
       p.boleto_status,
       p.conciliacao_dados,
       p.documento_legado,
       p.documento_base_legado,
       p.parcela_numero_legado,
       p.parcela_total_legado,
       p.nosso_numero,
       p.nosso_numero_dv,
       p.controle_participante,
       c.numero AS contrato_numero,
       c.obra_codigo_legado,
       c.unidade_codigo_legado,
       COALESCE(cp.nome, cp.razao_social, c.comprador_nome) AS cliente_nome
     FROM com_parcelas p
     JOIN com_contratos c ON c.id=p.contrato_id
     LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
     LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
     WHERE p.tenant_id=$1
       AND p.contrato_id=$2
     ORDER BY p.vencimento, p.parcela_numero_legado NULLS LAST, p.id`,
    [tenantId, contractId],
  )
  return rows
}

async function findMovementCandidates(client, item, returnRow) {
  const company = String(returnRow?.empresa || item.cliente_strato?.empresa || 'LUCKY').toUpperCase()
  const movementDate = dateIso(returnRow?.data_credito || item.data_credito)
  const value = roundMoney(returnRow?.valor_pago ?? item.valor_pago_retorno)
  if (!movementDate || value <= 0) return []
  const clientFirstName = String(item.cliente_strato?.nome || '').trim().split(/\s+/)[0]
  const { rows } = await client.query(
    `SELECT id,
            to_char(data::date, 'YYYY-MM-DD') AS data,
            empresa,
            banco,
            entradas::numeric AS entradas,
            saidas::numeric AS saidas,
            fornecedor,
            historico,
            nf_doc,
            banco_conta_id
       FROM fin_movimento
      WHERE data::date=$1::date
        AND UPPER(COALESCE(empresa,''))=$2
        AND ABS(COALESCE(entradas,0)-$3::numeric)<0.02
        AND COALESCE(saidas,0)=0
        AND (
          COALESCE(fornecedor,'') ILIKE $4
          OR COALESCE(historico,'') ILIKE $4
          OR COALESCE(historico,'') ILIKE $5
          OR COALESCE(nf_doc,'') ILIKE $5
          OR COALESCE(historico,'') ILIKE $6
        )
      ORDER BY id
      LIMIT 5`,
    [movementDate, company, value, `%${clientFirstName}%`, `%${item.documento_retorno || ''}%`, `%${item.nosso_numero || ''}%`],
  )
  return rows
}

function fullBankNumber(item) {
  return `${onlyDigits(item.nosso_numero)}${onlyDigits(item.nosso_numero_dv)}`
}

function matchReturnRow(item, returnRows) {
  const byNumber = returnRows.filter(row =>
    onlyDigits(row.nosso_numero) === onlyDigits(item.nosso_numero)
      && onlyDigits(row.nosso_numero_dv) === onlyDigits(item.nosso_numero_dv),
  )
  if (byNumber.length === 1) return byNumber[0]
  const byFull = returnRows.filter(row => `${onlyDigits(row.nosso_numero)}${onlyDigits(row.nosso_numero_dv)}` === onlyDigits(item.boleto))
  return byFull.length === 1 ? byFull[0] : null
}

function matchComponent(component, parcels, returnRow) {
  const directIds = [
    returnRow?.parcela_id,
    component.parcela_larmhub?.id,
  ].filter(Boolean).map(String)
  for (const id of directIds) {
    const direct = parcels.find(parcel => String(parcel.id) === id)
    if (direct) return { parcela: direct, metodo: 'id_direto', ambiguo: false }
  }

  const fraction = parcels.filter(parcel =>
    Number(parcel.parcela_numero_legado) === Number(String(component.parcela_strato || '').split('/')[0])
      && Number(parcel.parcela_total_legado) === Number(String(component.parcela_strato || '').split('/')[1]),
  )
  const exactFractionAndDue = fraction.filter(parcel => dateIso(parcel.vencimento) === dateIso(component.vencimento_strato))
  if (exactFractionAndDue.length === 1) return { parcela: exactFractionAndDue[0], metodo: 'fracao_e_vencimento', ambiguo: false }
  if (fraction.length === 1) return { parcela: fraction[0], metodo: 'fracao_unica', ambiguo: false }

  const sameDue = parcels.filter(parcel => dateIso(parcel.vencimento) === dateIso(component.vencimento_strato))
  if (sameDue.length === 1) return { parcela: sameDue[0], metodo: 'vencimento_unico', ambiguo: false }

  return { parcela: null, metodo: sameDue.length > 1 || fraction.length > 1 ? 'ambiguo' : 'nao_localizado', ambiguo: sameDue.length > 1 || fraction.length > 1 }
}

function buildComponentProposal(item, component, parcel, paidAllocation, index) {
  const [parcelNumber, parcelTotal] = String(component.parcela_strato || '').split('/').map(value => Number(value))
  const nominalTarget = roundMoney(component.valor_nominal_strato)
  const paidTarget = roundMoney(paidAllocation)
  const difference = roundMoney(paidTarget - nominalTarget)
  const interestTarget = difference > 0 ? difference : 0
  const discountTarget = difference < 0 ? Math.abs(difference) : 0
  const current = parcel ? {
    id: parcel.id,
    documento_legado: parcel.documento_legado,
    parcela_numero_legado: Number(parcel.parcela_numero_legado || 0) || null,
    parcela_total_legado: Number(parcel.parcela_total_legado || 0) || null,
    vencimento: dateIso(parcel.vencimento),
    valor_nominal: roundMoney(parcel.valor_nominal),
    valor_convertido: roundMoney(parcel.valor_convertido),
    valor_total_relatorio: roundMoney(parcel.valor_total_relatorio),
    valor_juros_mora: roundMoney(parcel.valor_juros_mora),
    valor_desconto: roundMoney(parcel.valor_desconto),
    valor_atual: roundMoney(parcel.valor_atual),
    status: parcel.status,
    pago_em: dateIso(parcel.pago_em),
    valor_pago: parcel.valor_pago === null || parcel.valor_pago === undefined ? null : roundMoney(parcel.valor_pago),
    movimento_id: parcel.movimento_id || null,
    nosso_numero: parcel.nosso_numero || null,
    nosso_numero_dv: parcel.nosso_numero_dv || null,
    controle_participante: parcel.controle_participante || null,
  } : null

  const documentBase = parcel?.documento_base_legado || String(parcel?.documento_legado || '').split(/\s+/)[0] || null
  const proposed = {
    documento_legado: documentBase ? `${documentBase} ${String(parcelNumber).padStart(2, '0')}/${String(parcelTotal).padStart(2, '0')}` : null,
    parcela_numero_legado: parcelNumber || null,
    parcela_total_legado: parcelTotal || null,
    vencimento: dateIso(component.vencimento_strato),
    valor_nominal: nominalTarget,
    valor_convertido: nominalTarget,
    valor_total_relatorio: roundMoney(nominalTarget + interestTarget - discountTarget),
    valor_juros_mora: interestTarget,
    valor_desconto: discountTarget,
    valor_pago: paidTarget,
    status: 'paga',
    pago_em: dateIso(item.data_credito),
    forma_pagamento: 'Boleto',
    origem_baixa: 'retorno_bradesco',
    boleto_status: 'liquidado',
    gravar_identificador_bancario: index === 0,
    nosso_numero: index === 0 ? item.nosso_numero : null,
    nosso_numero_dv: index === 0 ? item.nosso_numero_dv : null,
    controle_participante: index === 0 ? (item.controle_participante || null) : null,
  }

  const changes = []
  if (!current) changes.push('CRIAR_OU_LOCALIZAR_PARCELA')
  else {
    if (current.parcela_numero_legado !== proposed.parcela_numero_legado || current.parcela_total_legado !== proposed.parcela_total_legado) changes.push('CORRIGIR_FRACAO')
    if (current.vencimento !== proposed.vencimento) changes.push('CORRIGIR_VENCIMENTO')
    if (Math.abs(current.valor_nominal - proposed.valor_nominal) >= 0.01) changes.push('ATUALIZAR_VALOR_NOMINAL')
    if (Math.abs(current.valor_juros_mora - proposed.valor_juros_mora) >= 0.01) changes.push('ATUALIZAR_JUROS')
    if (Math.abs(current.valor_desconto - proposed.valor_desconto) >= 0.01) changes.push('ATUALIZAR_DESCONTO')
    if (!isPaidStatus(current.status) || !current.movimento_id) changes.push('BAIXAR_PARCELA')
  }

  return {
    parcela_strato: component.parcela_strato,
    correspondencia: parcel ? 'LOCALIZADA' : 'NAO_LOCALIZADA',
    parcela_id: parcel?.id || null,
    atual: current,
    proposto: proposed,
    alteracoes_previstas: changes,
  }
}

function buildAlreadySettledPlan(item, returnRow, parcel) {
  const consistent = Boolean(
    returnRow?.movimento_id
      && returnRow?.parcela_id
      && parcel
      && String(parcel.id) === String(returnRow.parcela_id)
      && String(parcel.movimento_id || '') === String(returnRow.movimento_id || '')
      && isPaidStatus(parcel.status),
  )
  return {
    boleto: item.boleto,
    cliente: item.cliente_strato?.nome || null,
    contrato: item.contrato_selecionado?.numero || null,
    documento_retorno: item.documento_retorno,
    valor_pago: roundMoney(returnRow?.valor_pago ?? item.valor_pago_retorno),
    classificacao: consistent ? 'JA_CONCILIADO_SEM_ACAO' : 'CONFLITO_EM_REGISTRO_JA_BAIXADO',
    seguro_para_ignorar: consistent,
    retorno: {
      item_id: returnRow?.id || null,
      status_processamento: returnRow?.status_processamento || null,
      parcela_id: returnRow?.parcela_id || null,
      movimento_id: returnRow?.movimento_id || null,
      metodo_conciliacao: returnRow?.metodo_conciliacao || null,
    },
    parcela: parcel ? {
      id: parcel.id,
      documento_legado: parcel.documento_legado,
      fracao_larmhub: `${parcel.parcela_numero_legado || '?'}/${parcel.parcela_total_legado || '?'}`,
      fracao_strato: item.componentes?.[0]?.parcela_strato || null,
      vencimento: dateIso(parcel.vencimento),
      valor_nominal: roundMoney(parcel.valor_nominal),
      valor_pago: roundMoney(parcel.valor_pago),
      status: parcel.status,
      movimento_id: parcel.movimento_id || null,
    } : null,
    observacao: consistent
      ? 'O retorno já está vinculado à parcela e ao Movimento Bancário. Nenhuma ação será proposta.'
      : 'O retorno informa baixa anterior, mas o vínculo atual não está consistente. Revisão manual obrigatória.',
  }
}

async function buildPendingPlan(client, item, returnRow, parcels) {
  const matches = []
  const usedIds = new Set()
  for (const component of item.componentes || []) {
    const match = matchComponent(component, parcels, returnRow)
    if (match.parcela && usedIds.has(String(match.parcela.id))) {
      matches.push({ component, parcela: null, metodo: 'parcela_repetida', ambiguo: true })
      continue
    }
    if (match.parcela) usedIds.add(String(match.parcela.id))
    matches.push({ component, ...match })
  }

  const allocations = allocateProportionally(returnRow?.valor_pago ?? item.valor_pago_retorno, item.componentes || [])
  const components = matches.map((match, index) => ({
    metodo_correspondencia: match.metodo,
    ambiguo: match.ambiguo,
    ...buildComponentProposal(item, match.component, match.parcela, allocations[index] || 0, index),
  }))
  const missing = components.filter(component => !component.parcela_id)
  const paidConflicts = components.filter(component => component.atual && (component.atual.movimento_id || isPaidStatus(component.atual.status)))
  const movements = await findMovementCandidates(client, item, returnRow)
  const movementAction = movements.length === 0 ? 'CRIAR_MOVIMENTO' : movements.length === 1 ? 'VINCULAR_MOVIMENTO_EXISTENTE' : 'BLOQUEADO_MOVIMENTO_AMBIGUO'
  const consolidated = Boolean(item.boleto_consolidado || components.length > 1)
  const blockers = []
  if (!item.contrato_selecionado?.id) blockers.push('CONTRATO_NAO_IDENTIFICADO')
  if (missing.length) blockers.push('PARCELA_NAO_LOCALIZADA_OU_AMBIGUA')
  if (paidConflicts.length) blockers.push('PARCELA_JA_BAIXADA')
  if (movements.length > 1) blockers.push('MOVIMENTO_EXISTENTE_AMBIGUO')
  blockers.push(consolidated ? 'CONFIRMAR_COMPOSICAO_NO_SQLSERVER' : 'CONFIRMAR_DADOS_NO_SQLSERVER')

  return {
    boleto: item.boleto,
    cliente: item.cliente_strato?.nome || null,
    contrato: item.contrato_selecionado?.numero || null,
    contrato_id: item.contrato_selecionado?.id || null,
    documento_retorno: item.documento_retorno,
    data_ocorrencia: dateIso(returnRow?.data_ocorrencia || item.data_ocorrencia),
    data_credito: dateIso(returnRow?.data_credito || item.data_credito),
    valor_titulo_retorno: roundMoney(returnRow?.valor_titulo ?? item.valor_titulo_retorno),
    valor_pago_retorno: roundMoney(returnRow?.valor_pago ?? item.valor_pago_retorno),
    juros_retorno: roundMoney(returnRow?.valor_juros ?? item.juros_retorno),
    consolidado: consolidated,
    quantidade_componentes: components.length,
    classificacao: consolidated ? 'PROPOSTA_ATUALIZAR_E_BAIXAR_CONSOLIDADO' : 'PROPOSTA_ATUALIZAR_E_BAIXAR',
    retorno: {
      item_id: returnRow?.id || null,
      status_processamento: returnRow?.status_processamento || null,
      parcela_id: returnRow?.parcela_id || null,
      movimento_id: returnRow?.movimento_id || null,
      metodo_conciliacao: returnRow?.metodo_conciliacao || null,
    },
    movimento: {
      acao_prevista: movementAction,
      valor: roundMoney(returnRow?.valor_pago ?? item.valor_pago_retorno),
      data: dateIso(returnRow?.data_credito || item.data_credito),
      candidatos_existentes: movements.map(row => ({
        id: row.id,
        data: row.data,
        valor: roundMoney(row.entradas),
        fornecedor: row.fornecedor,
        historico: row.historico,
      })),
      vincular_todas_as_parcelas_ao_mesmo_movimento: consolidated,
    },
    componentes: components,
    bloqueios_para_execucao: blockers,
    pronto_para_etapa_de_execucao: false,
    observacao: 'Esta é somente uma simulação. A etapa de execução será criada separadamente após a confirmação do SQL Server.',
  }
}

function renderMarkdown(result) {
  const lines = []
  lines.push(`# Simulação Strato x LarmHub — ${result.auditoria.retorno}`)
  lines.push('')
  lines.push(`- Versão: ${result.versao}`)
  lines.push(`- Gerado em: ${result.gerado_em}`)
  lines.push(`- Modo: ${result.modo}`)
  lines.push(`- Tenant: ${result.tenant_id}`)
  lines.push(`- Liquidações analisadas: ${result.resumo.liquidacoes_analisadas}`)
  lines.push(`- Já conciliadas, sem ação: ${result.resumo.ja_conciliadas_sem_acao}`)
  lines.push(`- Propostas de correção: ${result.resumo.propostas_de_correcao}`)
  lines.push(`- Parcelas envolvidas nas propostas: ${result.resumo.parcelas_a_atualizar_ou_baixar}`)
  lines.push(`- Movimentos a criar: ${result.resumo.movimentos_a_criar}`)
  lines.push(`- Valor dos movimentos propostos: R$ ${money(result.resumo.valor_movimentos_propostos)}`)
  lines.push(`- Clientes a criar: ${result.resumo.clientes_a_criar}`)
  lines.push(`- Contratos a criar: ${result.resumo.contratos_a_criar}`)
  lines.push('')
  lines.push('> SIMULAÇÃO SOMENTE LEITURA. Nenhum INSERT, UPDATE ou DELETE foi executado.')
  lines.push('')

  if (result.ja_conciliados.length) {
    lines.push('## Já conciliados — nenhuma ação')
    lines.push('')
    lines.push('| Boleto | Cliente | Documento | Parcela LarmHub | Movimento | Valor | Situação |')
    lines.push('|---|---|---|---|---:|---:|---|')
    for (const item of result.ja_conciliados) {
      lines.push(`| ${item.boleto} | ${item.cliente || '-'} | ${item.documento_retorno || '-'} | ${item.parcela?.documento_legado || '-'} | ${item.retorno.movimento_id || '-'} | R$ ${money(item.valor_pago)} | ${item.classificacao} |`)
    }
    lines.push('')
  }

  for (const plan of result.propostas) {
    lines.push(`## ${plan.boleto} — ${plan.cliente || 'cliente não identificado'}`)
    lines.push('')
    lines.push(`- Contrato: ${plan.contrato || '-'}`)
    lines.push(`- Documento: ${plan.documento_retorno || '-'}`)
    lines.push(`- Pago no retorno: R$ ${money(plan.valor_pago_retorno)}`)
    lines.push(`- Movimento previsto: ${plan.movimento.acao_prevista} em ${plan.movimento.data || '-'} por R$ ${money(plan.movimento.valor)}`)
    lines.push(`- Consolidado: ${plan.consolidado ? `sim, ${plan.quantidade_componentes} parcelas` : 'não'}`)
    lines.push('')
    lines.push('| Parcela Strato | Parcela atual | Vencimento | Nominal atual | Nominal proposto | Pago proposto | Juros | Desconto | Alterações |')
    lines.push('|---|---|---|---:|---:|---:|---:|---:|---|')
    for (const component of plan.componentes) {
      lines.push(`| ${component.parcela_strato || '-'} | ${component.atual?.documento_legado || '-'} | ${component.proposto.vencimento || '-'} | R$ ${money(component.atual?.valor_nominal)} | R$ ${money(component.proposto.valor_nominal)} | R$ ${money(component.proposto.valor_pago)} | R$ ${money(component.proposto.valor_juros_mora)} | R$ ${money(component.proposto.valor_desconto)} | ${component.alteracoes_previstas.join(', ') || 'nenhuma'} |`)
    }
    lines.push('')
    lines.push('**Bloqueios antes da execução:**')
    for (const blocker of plan.bloqueios_para_execucao) lines.push(`- ${blocker}`)
    lines.push('')
  }

  lines.push('## Próximo passo')
  lines.push('')
  lines.push('Confirmar o resultado da consulta somente leitura no backup SQL Server. Depois disso será gerada uma etapa separada de execução, transacional, idempotente e com rollback por lote.')
  lines.push('')
  return `${lines.join('\n')}\n`
}

function writeOutputs(outputDir, result) {
  fs.mkdirSync(outputDir, { recursive: true })
  const base = safeFilename(path.parse(result.auditoria.retorno || 'retorno').name)
  const jsonPath = path.join(outputDir, `${base}-simulacao.json`)
  const csvPath = path.join(outputDir, `${base}-simulacao-componentes.csv`)
  const mdPath = path.join(outputDir, `${base}-simulacao.md`)
  fs.writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  fs.writeFileSync(mdPath, renderMarkdown(result), 'utf8')

  const header = [
    'boleto', 'cliente', 'contrato', 'classificacao_item', 'parcela_strato', 'parcela_id',
    'documento_atual', 'fracao_atual', 'vencimento_atual', 'vencimento_proposto',
    'valor_nominal_atual', 'valor_nominal_proposto', 'valor_pago_proposto',
    'juros_proposto', 'desconto_proposto', 'movimento_previsto', 'alteracoes', 'bloqueios_item',
  ]
  const rows = [header.join(';')]
  for (const plan of result.propostas) {
    for (const component of plan.componentes) {
      rows.push([
        plan.boleto,
        plan.cliente,
        plan.contrato,
        plan.classificacao,
        component.parcela_strato,
        component.parcela_id,
        component.atual?.documento_legado,
        component.atual ? `${component.atual.parcela_numero_legado || '?'}/${component.atual.parcela_total_legado || '?'}` : null,
        component.atual?.vencimento,
        component.proposto.vencimento,
        component.atual?.valor_nominal,
        component.proposto.valor_nominal,
        component.proposto.valor_pago,
        component.proposto.valor_juros_mora,
        component.proposto.valor_desconto,
        plan.movimento.acao_prevista,
        component.alteracoes_previstas.join(' | '),
        plan.bloqueios_para_execucao.join(' | '),
      ].map(csvCell).join(';'))
    }
  }
  fs.writeFileSync(csvPath, `${rows.join('\n')}\n`, 'utf8')
  return { jsonPath, csvPath, mdPath }
}

async function main() {
  const args = parseArgs(process.argv)
  if (args.execute || args.aplicar || args.confirmar) {
    throw new Error('A Etapa B é somente leitura e não possui modo de execução.')
  }
  if (!args.auditoria) throw new Error('Informe --auditoria=/caminho/arquivo-auditoria.json')
  const auditPath = path.resolve(String(args.auditoria))
  if (!fs.existsSync(auditPath)) throw new Error(`Arquivo de auditoria não encontrado: ${auditPath}`)
  const auditBuffer = fs.readFileSync(auditPath)
  const audit = JSON.parse(auditBuffer.toString('utf8'))
  if (!audit.tenant_id || !Array.isArray(audit.itens)) throw new Error('JSON de auditoria inválido ou incompleto.')
  if (args.tenant && String(args.tenant) !== String(audit.tenant_id)) throw new Error('O tenant informado diverge do tenant registrado na auditoria.')

  require('dotenv').config()
  const { pool, connectDB } = require('../src/config/database')
  await connectDB()
  const client = await pool.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')
    await client.query("SET LOCAL statement_timeout='120s'")
    for (const table of ['fin_retornos_cobranca', 'fin_retornos_cobranca_itens', 'com_parcelas', 'com_contratos', 'fin_movimento']) {
      if (!(await tableExists(client, table))) throw new Error(`Tabela obrigatória ausente: ${table}`)
    }

    const returnHeader = await findReturnHeader(client, audit)
    if (String(returnHeader.tenant_id) !== String(audit.tenant_id)) throw new Error('Tenant do retorno diverge da auditoria.')
    const returnRows = await loadReturnItems(client, returnHeader.id)
    const parcelsCache = new Map()
    const alreadySettled = []
    const proposals = []
    const conflicts = []

    for (const item of audit.itens) {
      const returnRow = matchReturnRow(item, returnRows)
      if (!returnRow) {
        conflicts.push({ boleto: item.boleto, cliente: item.cliente_strato?.nome || null, motivo: 'ITEM_DO_RETORNO_NAO_LOCALIZADO' })
        continue
      }
      const contractId = item.contrato_selecionado?.id
      let parcels = []
      if (contractId) {
        if (!parcelsCache.has(String(contractId))) parcelsCache.set(String(contractId), await loadContractParcels(client, audit.tenant_id, contractId))
        parcels = parcelsCache.get(String(contractId))
      }
      const returnSaysSettled = ['liquidado', 'ja_baixado'].includes(normalizeStatus(returnRow.status_processamento)) || Boolean(returnRow.movimento_id)
      if (returnSaysSettled) {
        const parcel = parcels.find(row => String(row.id) === String(returnRow.parcela_id || '')) || null
        const plan = buildAlreadySettledPlan(item, returnRow, parcel)
        if (plan.seguro_para_ignorar) alreadySettled.push(plan)
        else conflicts.push(plan)
        continue
      }
      proposals.push(await buildPendingPlan(client, item, returnRow, parcels))
    }

    const proposedComponents = proposals.flatMap(plan => plan.componentes)
    const movementsToCreate = proposals.filter(plan => plan.movimento.acao_prevista === 'CRIAR_MOVIMENTO')
    const result = {
      versao: '0.5.8',
      modo: 'SOMENTE_LEITURA_SIMULACAO',
      gerado_em: new Date().toISOString(),
      tenant_id: audit.tenant_id,
      auditoria: {
        arquivo: path.basename(auditPath),
        sha256: sha256(auditBuffer),
        versao_origem: audit.versao || null,
        retorno: audit.retorno?.arquivo || null,
        retorno_sha256: audit.retorno?.sha256 || null,
        retorno_id: returnHeader.id,
      },
      resumo: {
        liquidacoes_analisadas: audit.itens.length,
        ja_conciliadas_sem_acao: alreadySettled.length,
        propostas_de_correcao: proposals.length,
        conflitos_ou_bloqueios_estruturais: conflicts.length,
        parcelas_a_atualizar_ou_baixar: proposedComponents.length,
        movimentos_a_criar: movementsToCreate.length,
        movimentos_existentes_a_vincular: proposals.filter(plan => plan.movimento.acao_prevista === 'VINCULAR_MOVIMENTO_EXISTENTE').length,
        valor_movimentos_propostos: roundMoney(proposals.reduce((sum, plan) => sum + Number(plan.movimento.valor || 0), 0)),
        clientes_a_criar: proposals.filter(plan => !plan.cliente).length,
        contratos_a_criar: proposals.filter(plan => !plan.contrato_id).length,
        alteracoes_executadas: 0,
      },
      ja_conciliados: alreadySettled,
      propostas: proposals,
      conflitos: conflicts,
      seguranca: {
        transacao: 'BEGIN TRANSACTION READ ONLY',
        encerramento: 'ROLLBACK',
        comandos_de_escrita: 0,
        modo_execucao_disponivel: false,
      },
    }

    const outputDir = path.resolve(String(args.saida || path.join(process.cwd(), 'auditorias', `${safeFilename(path.parse(audit.retorno?.arquivo || 'retorno').name)}-simulacao-${new Date().toISOString().slice(0, 10)}`)))
    const outputs = writeOutputs(outputDir, result)
    await client.query('ROLLBACK')

    console.log('SIMULAÇÃO STRATO X LARMHUB CONCLUÍDA — SOMENTE LEITURA')
    console.log(`Tenant: ${result.tenant_id}`)
    console.log(`Liquidações analisadas: ${result.resumo.liquidacoes_analisadas}`)
    console.log(`Já conciliadas, sem ação: ${result.resumo.ja_conciliadas_sem_acao}`)
    console.log(`Propostas de correção: ${result.resumo.propostas_de_correcao}`)
    console.log(`Parcelas nas propostas: ${result.resumo.parcelas_a_atualizar_ou_baixar}`)
    console.log(`Movimentos a criar: ${result.resumo.movimentos_a_criar}`)
    console.log(`Valor proposto: R$ ${money(result.resumo.valor_movimentos_propostos)}`)
    console.log(`Conflitos estruturais: ${result.resumo.conflitos_ou_bloqueios_estruturais}`)
    console.log('Nenhum dado foi alterado.')
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
  dateIso,
  resolveHashColumn,
  matchComponent,
  buildComponentProposal,
  buildAlreadySettledPlan,
  fullBankNumber,
}
