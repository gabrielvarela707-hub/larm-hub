/**
 * Análise inteligente Strato x retorno Bradesco x LarmHub — v0.8.2.
 *
 * Esta camada é deliberadamente somente leitura. Ela identifica grupos em que
 * uma linha do CNAB representa uma ou mais parcelas, calcula a composição
 * financeira individual e compara cliente, contrato e parcela com o LarmHub.
 * Nenhum INSERT, UPDATE, DELETE, baixa ou Movimento Bancário é executado aqui.
 */

const { onlyDigits } = require('./bradescoCnab400')
const { normalizeCompany, roundMoney } = require('./bradescoReturnProcessor')

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function isoDate(value) {
  if (!value) return null
  // PostgreSQL DATE chega pelo node-postgres como Date no fuso local do
  // processo. Usar toISOString() deslocava datas para o dia anterior em
  // servidores UTC+1/UTC+2 e tornava duas parcelas equivalentes ambíguas.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const text = String(value).trim()
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)
  return iso ? iso[0] : null
}

function parcelDueDate(parcel) {
  return isoDate(parcel?.vencimento_data || parcel?.vencimento)
}

function asMoney(value) {
  if (value === null || value === undefined || value === '') return 0
  return roundMoney(Number(value) || 0)
}

function fraction(value) {
  const match = String(value || '').match(/(\d{1,4})\s*\/\s*(\d{1,4})/)
  return match ? { number: Number(match[1]), total: Number(match[2]) } : null
}

function fractionsEquivalent(left, right) {
  if (!left || !right || !left.total || !right.total) return false
  return left.number * right.total === right.number * left.total
}

function reportBoleto(item) {
  return onlyDigits(item?.boleto || '')
}

function returnBoleto(item) {
  return onlyDigits(item?.nossoNumeroWithDv || `${item?.nossoNumero || ''}${item?.nossoNumeroDv || ''}`)
}

function boletoVariants(item) {
  const full = returnBoleto(item)
  const base = onlyDigits(item?.nossoNumero || '')
  return new Set([full, base].filter(Boolean))
}

function normalizedOccurrence(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? digits.slice(-2).padStart(2, '0') : '00'
}

function reportGroupKey(row, occurrence = normalizedOccurrence(row?.ocorrencia)) {
  const boleto = reportBoleto(row)
  const paymentDate = String(row?.data_pagamento || '')
  return `${boleto}|${occurrence || '00'}|${paymentDate}`
}

function financialNature(values) {
  const additions = roundMoney(asMoney(values?.valor_juros_financeiro) + asMoney(values?.valor_seguro) + asMoney(values?.valor_moras) + asMoney(values?.valor_residuo))
  const discount = asMoney(values?.valor_desconto)
  const nominal = asMoney(values?.valor_nominal)
  const paid = asMoney(values?.valor_pago)
  if (additions > 0 && discount > 0) return { codigo: 'ACRESCIMO_E_DESCONTO', origem: 'RELATORIO_STRATO', valor_acrescimos: additions, valor_desconto: discount }
  if (additions > 0) return { codigo: 'JUROS_MORAS_OU_ACRESCIMOS', origem: 'RELATORIO_STRATO', valor_acrescimos: additions, valor_desconto: 0 }
  if (discount > 0) return { codigo: 'DESCONTO', origem: 'RELATORIO_STRATO', valor_acrescimos: 0, valor_desconto: discount }
  const difference = roundMoney(paid - nominal)
  if (difference > 0.02) return { codigo: 'ACRESCIMO_PROVAVEL', origem: 'INFERIDO_PELA_DIFERENCA', valor_acrescimos: difference, valor_desconto: 0 }
  if (difference < -0.02) return { codigo: 'DESCONTO_PROVAVEL', origem: 'INFERIDO_PELA_DIFERENCA', valor_acrescimos: 0, valor_desconto: Math.abs(difference) }
  return { codigo: 'SEM_AJUSTE', origem: 'RELATORIO_STRATO', valor_acrescimos: 0, valor_desconto: 0 }
}

function rowFinancials(row) {
  const nominal = asMoney(row?.valor_a_pagar ?? row?.valor_titulo)
  const jurosFinanceiro = asMoney(row?.juros_financeiro_pago ?? row?.juros_financeiro)
  const seguro = asMoney(row?.seguro_pago ?? row?.seguro)
  const moras = asMoney(row?.moras_pago ?? row?.moras)
  const desconto = asMoney(row?.valor_desconto)
  const residuo = asMoney(row?.valor_residuo)
  const totalOriginal = asMoney(row?.valor_total_original ?? row?.valor_total ?? nominal + jurosFinanceiro + seguro + moras)
  const pago = asMoney(row?.valor_pago_total ?? row?.valor_pago)
  const diferenca = asMoney(row?.valor_diferenca)
  return {
    valor_nominal: nominal,
    valor_juros_financeiro: jurosFinanceiro,
    valor_seguro: seguro,
    valor_moras: moras,
    valor_desconto: desconto,
    valor_residuo: residuo,
    valor_total: totalOriginal,
    valor_pago: pago,
    valor_diferenca: diferenca,
  }
}

function sumFinancials(rows) {
  return (rows || []).reduce((total, row) => {
    const values = rowFinancials(row)
    for (const key of Object.keys(total)) total[key] = roundMoney(total[key] + values[key])
    return total
  }, {
    valor_nominal: 0,
    valor_juros_financeiro: 0,
    valor_seguro: 0,
    valor_moras: 0,
    valor_desconto: 0,
    valor_residuo: 0,
    valor_total: 0,
    valor_pago: 0,
    valor_diferenca: 0,
  })
}

function groupReportRows(stratoReports = []) {
  const buckets = new Map()

  for (const report of stratoReports || []) {
    for (const row of report?.titulos || []) {
      const boleto = reportBoleto(row)
      if (!boleto) continue
      const paymentDate = String(row?.data_pagamento || '')
      const bucketKey = `${boleto}|${paymentDate}`
      if (!buckets.has(bucketKey)) buckets.set(bucketKey, [])
      buckets.get(bucketKey).push({
        row,
        report,
        order: Number(row?.indice_relatorio || buckets.get(bucketKey).length + 1),
        occurrence: normalizedOccurrence(row?.ocorrencia),
      })
    }
  }

  const groups = new Map()
  for (const entries of buckets.values()) {
    const explicit = entries.filter(entry => entry.occurrence !== '00')
    const uniqueOccurrences = [...new Set(explicit.map(entry => entry.occurrence))]

    for (const entry of entries) {
      let occurrence = entry.occurrence

      // O Strato imprime o "06-Motivo" apenas uma vez para um boleto que pode
      // ocupar várias linhas. Dependendo da posição do texto no PDF, somente a
      // primeira ou a última parcela recebe a ocorrência durante a extração.
      // As demais linhas sem ocorrência pertencem ao mesmo recebimento.
      if (occurrence === '00' && uniqueOccurrences.length === 1) {
        occurrence = uniqueOccurrences[0]
      } else if (occurrence === '00' && uniqueOccurrences.length > 1) {
        // Quando o mesmo boleto contém ocorrências realmente diferentes (ex.:
        // 02 e 06), a linha sem marcador é anexada à ocorrência explícita mais
        // próxima no relatório. Empates favorecem a ocorrência anterior.
        const nearest = explicit
          .map(candidate => ({
            candidate,
            distance: Math.abs(candidate.order - entry.order),
            previous: candidate.order <= entry.order ? 0 : 1,
          }))
          .sort((left, right) => left.distance - right.distance || left.previous - right.previous)[0]
        occurrence = nearest?.candidate?.occurrence || '00'
      }

      const key = reportGroupKey(entry.row, occurrence)
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          boleto: reportBoleto(entry.row),
          ocorrencia: occurrence,
          data_pagamento: entry.row?.data_pagamento || null,
          report: entry.report,
          rows: [],
        })
      }
      groups.get(key).rows.push(entry.row)
    }
  }

  return [...groups.values()]
    .map(group => ({
      ...group,
      rows: group.rows.sort((left, right) => Number(left?.indice_relatorio || 0) - Number(right?.indice_relatorio || 0)),
      totais: sumFinancials(group.rows),
    }))
}

function reconcileGroupRounding(group, returnPaid) {
  const difference = roundMoney(asMoney(returnPaid) - asMoney(group?.totais?.valor_pago))
  if (!group || !group.rows?.length || difference === 0) {
    return { group, adjusted: false, difference: 0, adjustedIndex: null }
  }
  // Relatórios impressos em duas casas podem somar um centavo a mais ou a
  // menos que o CNAB. Ajustamos somente a última parcela e mantemos a
  // evidência do valor impresso. Diferenças maiores continuam bloqueadas.
  if (Math.abs(difference) > 0.05) {
    return { group, adjusted: false, difference, adjustedIndex: null }
  }
  const rows = group.rows.map(row => ({ ...row }))
  const index = rows.length - 1
  const row = rows[index]
  const currentPaid = asMoney(row.valor_pago_total ?? row.valor_pago)
  row.valor_pago_impresso = currentPaid
  row.valor_pago_total = roundMoney(currentPaid + difference)
  row.valor_pago = row.valor_pago_total
  if (asMoney(row.valor_desconto) > 0) {
    row.valor_desconto_impresso = asMoney(row.valor_desconto)
    row.valor_desconto = roundMoney(asMoney(row.valor_desconto) - difference)
  }
  row.ajuste_arredondamento = difference
  const adjustedGroup = { ...group, rows, totais: sumFinancials(rows) }
  return { group: adjustedGroup, adjusted: true, difference, adjustedIndex: index }
}

function scoreGroupForReturn(item, group) {
  let score = 0
  const variants = boletoVariants(item)
  const exact = returnBoleto(item)
  const withoutDv = onlyDigits(item?.nossoNumero)
  if (exact && group.boleto === exact) score += 220
  else if (withoutDv && (group.boleto === withoutDv || group.boleto.startsWith(withoutDv))) score += 150
  else if (variants.has(group.boleto)) score += 150

  const itemOccurrence = String(item?.occurrence || '').padStart(2, '0')
  if (itemOccurrence && group.ocorrencia && itemOccurrence === group.ocorrencia) score += 180
  else if (itemOccurrence && group.ocorrencia) score -= 80

  const referenceAmount = itemOccurrence === '06'
    ? asMoney(item?.paidAmount || item?.titleAmount)
    : asMoney(item?.titleAmount)
  if (referenceAmount > 0) {
    const reportReference = itemOccurrence === '06'
      ? asMoney(group.totais.valor_pago)
      : asMoney(group.totais.valor_total || group.totais.valor_nominal)
    if (reportReference > 0 && Math.abs(reportReference - referenceAmount) <= 0.02) score += 90
  }

  const itemFraction = fraction(item?.documentNumber)
  if (group.rows.length === 1 && fractionsEquivalent(itemFraction, fraction(group.rows[0]?.parcela))) score += 40
  if (group.rows.length === 1 && item?.dueDate && item.dueDate === group.rows[0]?.vencimento) score += 30
  if (item?.occurrenceDate && group.data_pagamento && item.occurrenceDate === group.data_pagamento) score += 20
  return score
}

function selectGroupForReturn(item, groups, used = new Set()) {
  const ranked = groups
    .filter(group => !used.has(group.key))
    .map(group => ({ group, score: scoreGroupForReturn(item, group) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const second = ranked[1]
  if (!best || best.score < 120) return null
  if (second && best.score - second.score < 25) return null
  used.add(best.group.key)
  return best.group
}

async function findClients(client, tenantId, reportRow) {
  const code = String(reportRow?.cliente_codigo || '').trim()
  const name = String(reportRow?.cliente_nome || '').trim()
  const normalizedName = normalizeText(name)
  const { rows } = await client.query(
    `SELECT cl.id,
            cl.codigo,
            cp.codigo_legado::text AS codigo_legado,
            COALESCE(cp.nome, cp.razao_social) AS nome,
            cp.cpf_cnpj,
            cp.email,
            cp.telefone,
            cp.celular
       FROM cad_clientes cl
       JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
      WHERE $1::text IS NOT NULL
        AND cl.ativo IS DISTINCT FROM FALSE
        AND cp.ativo IS DISTINCT FROM FALSE
        AND (
          (NULLIF($2::text,'') IS NOT NULL AND (cl.codigo=$2 OR cp.codigo_legado::text=$2))
          OR
          (NULLIF($3::text,'') IS NOT NULL AND regexp_replace(upper(COALESCE(cp.nome,cp.razao_social,'')), '[^A-Z0-9]', '', 'g')=$3)
        )
      ORDER BY CASE WHEN cl.codigo=$2 OR cp.codigo_legado::text=$2 THEN 0 ELSE 1 END, cl.id
      LIMIT 10`,
    [tenantId, code, normalizedName],
  )
  // cad_clientes não possui tenant_id na estrutura atual; o tenant é validado
  // indiretamente pelos contratos na etapa seguinte. Mantemos o primeiro
  // parâmetro para assinatura estável e futura evolução multi-tenant do cadastro.
  return rows
}

async function findContracts(client, tenantId, reportRow, clients) {
  const clientIds = (clients || []).map(row => Number(row.id)).filter(Number.isFinite)
  const code = String(reportRow?.cliente_codigo || '').trim()
  const unit = String(reportRow?.unidade || '').trim()
  const obra = String(reportRow?.obra || '').trim()
  const name = String(reportRow?.cliente_nome || '').trim()
  const expectedNumber = code && unit ? `STR-${code}-${unit}` : ''

  const { rows } = await client.query(
    `SELECT c.id,
            c.numero,
            c.codigo_legado,
            c.cliente_id,
            c.comprador_nome,
            c.comprador_cpf,
            c.obra_codigo_legado,
            c.unidade_codigo_legado,
            c.status,
            c.valor_total,
            c.parcelas_count
       FROM com_contratos c
      WHERE c.tenant_id=$1
        AND (
          (cardinality($2::int[]) > 0 AND c.cliente_id=ANY($2::int[]))
          OR (NULLIF($3::text,'') IS NOT NULL AND upper(c.numero)=upper($3))
          OR (NULLIF($4::text,'') IS NOT NULL AND upper(c.comprador_nome)=upper($4))
        )
        AND (NULLIF($5::text,'') IS NULL OR COALESCE(c.obra_codigo_legado::text,'')=$5)
        AND (NULLIF($6::text,'') IS NULL OR upper(COALESCE(c.unidade_codigo_legado,c.lot_number,''))=upper($6))
      ORDER BY CASE WHEN upper(c.numero)=upper($3) THEN 0 ELSE 1 END, c.created_at DESC, c.id
      LIMIT 10`,
    [tenantId, clientIds, expectedNumber, name, obra, unit],
  )
  return rows
}

function currentParcelValue(parcel) {
  if (parcel?.valor_recalculado !== null && parcel?.valor_recalculado !== undefined) return asMoney(parcel.valor_recalculado)
  return roundMoney(
    asMoney(parcel?.valor_nominal)
      + asMoney(parcel?.valor_correcao)
      + asMoney(parcel?.valor_multa)
      + asMoney(parcel?.valor_juros_mora)
      + asMoney(parcel?.valor_outros_acrescimos)
      + asMoney(parcel?.valor_seguro)
      - asMoney(parcel?.valor_desconto),
  )
}

async function findParcels(client, tenantId, reportRow, contracts, excludedParcelIds = new Set()) {
  const contractIds = (contracts || []).map(row => row.id).filter(Boolean)
  if (!contractIds.length) return []
  const frac = fraction(reportRow?.parcela)
  const due = reportRow?.vencimento || null
  const boleto = reportBoleto(reportRow)
  const withoutDv = boleto ? boleto.slice(0, -1) : ''

  const { rows } = await client.query(
    `SELECT p.id,
            p.contrato_id,
            p.documento_legado,
            p.parcela_numero_legado,
            p.parcela_total_legado,
            p.numero,
            p.tipo,
            p.vencimento,
            to_char(p.vencimento, 'YYYY-MM-DD') AS vencimento_data,
            p.valor_nominal,
            p.valor_recalculado,
            p.valor_correcao,
            p.valor_multa,
            p.valor_juros_mora,
            p.valor_outros_acrescimos,
            p.valor_seguro,
            p.valor_desconto,
            p.valor_residuo,
            p.valor_pago,
            p.pago_em,
            p.status,
            p.movimento_id,
            p.origem_baixa,
            p.nosso_numero,
            p.nosso_numero_dv,
            p.controle_participante,
            c.numero AS contrato_numero,
            c.obra_codigo_legado,
            c.unidade_codigo_legado
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
      WHERE p.tenant_id=$1
        AND p.contrato_id=ANY($2::uuid[])
        AND (
          ($3::int IS NOT NULL AND $4::int IS NOT NULL
            AND p.parcela_numero_legado IS NOT NULL
            AND p.parcela_total_legado IS NOT NULL
            AND p.parcela_numero_legado * $4::int = $3::int * p.parcela_total_legado)
          OR (NULLIF($5::date::text,'') IS NOT NULL AND p.vencimento=$5::date)
          OR (NULLIF($6::text,'') IS NOT NULL AND regexp_replace(COALESCE(p.nosso_numero,''),'[^0-9]','','g') IN ($6,$7))
        )
      ORDER BY CASE WHEN p.vencimento=$5::date THEN 0 ELSE 1 END, p.id
      LIMIT 20`,
    [tenantId, contractIds, frac?.number || null, frac?.total || null, due, boleto, withoutDv],
  )
  if (!excludedParcelIds?.size) return rows
  return rows.filter(row => !excludedParcelIds.has(String(row.id)))
}

function selectParcel(reportRow, parcels, { multiparcelas = false } = {}) {
  if (!parcels?.length) return { parcel: null, ambiguous: false, confidence: 0 }
  const reportFraction = fraction(reportRow?.parcela)
  const financial = rowFinancials(reportRow)
  const ranked = parcels.map(parcel => {
    let score = 0
    if (fractionsEquivalent(reportFraction, {
      number: Number(parcel.parcela_numero_legado),
      total: Number(parcel.parcela_total_legado),
    })) score += 100
    if (parcelDueDate(parcel) === reportRow?.vencimento) score += 40
    if (Math.abs(asMoney(parcel.valor_nominal) - financial.valor_nominal) <= 0.02) score += 60

    // Em boleto consolidado, o nosso número identifica o grupo bancário, não
    // uma parcela individual. Depois que a primeira parcela é baixada, ela pode
    // receber esse identificador e não deve vencer artificialmente o casamento
    // das demais linhas do mesmo boleto.
    if (!multiparcelas
      && reportBoleto(reportRow)
      && onlyDigits(`${parcel.nosso_numero || ''}${parcel.nosso_numero_dv || ''}`) === reportBoleto(reportRow)) {
      score += 100
    }
    return { parcel, score }
  }).sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]
  if (best.score < 60) return { parcel: null, ambiguous: false, confidence: best.score }
  if (second && best.score - second.score < 20) return { parcel: null, ambiguous: true, confidence: best.score }
  return { parcel: best.parcel, ambiguous: false, confidence: Math.min(100, best.score) / 100 }
}

function compareParcel(reportRow, parcel) {
  const proposed = rowFinancials(reportRow)
  const divergences = []
  const reportFraction = fraction(reportRow?.parcela)
  const parcelFraction = {
    number: Number(parcel?.parcela_numero_legado),
    total: Number(parcel?.parcela_total_legado),
  }

  if (!fractionsEquivalent(reportFraction, parcelFraction)) divergences.push('FRACAO_DIVERGENTE')
  if (parcelDueDate(parcel) !== reportRow?.vencimento) divergences.push('VENCIMENTO_DIVERGENTE')
  if (Math.abs(asMoney(parcel?.valor_nominal) - proposed.valor_nominal) > 0.02) divergences.push('VALOR_NOMINAL_DIVERGENTE')
  if (Math.abs(asMoney(parcel?.valor_desconto) - proposed.valor_desconto) > 0.02) divergences.push('DESCONTO_DIVERGENTE')
  if (Math.abs(asMoney(parcel?.valor_juros_mora) - (proposed.valor_moras + proposed.valor_juros_financeiro)) > 0.02) divergences.push('JUROS_OU_MORAS_DIVERGENTES')
  if (Math.abs(asMoney(parcel?.valor_seguro) - proposed.valor_seguro) > 0.02) divergences.push('SEGURO_DIVERGENTE')
  if (Math.abs(asMoney(parcel?.valor_residuo) - proposed.valor_residuo) > 0.02) divergences.push('RESIDUO_DIVERGENTE')
  if (Math.abs(asMoney(parcel?.valor_pago) - proposed.valor_pago) > 0.02) divergences.push('VALOR_PAGO_DIVERGENTE')

  return {
    divergencias: divergences,
    valor_atual_larmhub: currentParcelValue(parcel),
    proposto: proposed,
    natureza_financeira: financialNature(proposed),
  }
}

// Somente campos efetivamente alterados na correção do recebimento podem
// reabrir uma baixa. Valor nominal, fração e vencimento permanecem como dados
// cadastrais/históricos e não devem gerar o mesmo ajuste indefinidamente.
const MUTABLE_RECEIPT_DIVERGENCES = new Set([
  'DESCONTO_DIVERGENTE',
  'JUROS_OU_MORAS_DIVERGENTES',
  'SEGURO_DIVERGENTE',
  'RESIDUO_DIVERGENTE',
  'VALOR_PAGO_DIVERGENTE',
])
const FINANCIAL_DIVERGENCES = MUTABLE_RECEIPT_DIVERGENCES

function mutableReceiptDivergences(comparison) {
  return (comparison?.divergencias || []).filter(code => MUTABLE_RECEIPT_DIVERGENCES.has(code))
}

function paidParcelCorrectionAction(parcel, comparison) {
  const mutable = mutableReceiptDivergences(comparison)
  const isBradescoReturn = String(parcel?.origem_baixa || '').trim().toLowerCase() === 'retorno_bradesco'
  const hasMovement = Boolean(parcel?.movimento_id)
  return isBradescoReturn && hasMovement && mutable.length > 0
    ? 'ATUALIZAR_RECEBIMENTO_EXISTENTE'
    : 'NENHUMA'
}

async function analyzeReportRow(client, tenantId, reportRow, returnItem, {
  excludedParcelIds = new Set(),
  multiparcelas = false,
} = {}) {
  const clients = await findClients(client, tenantId, reportRow)
  if (!clients.length) {
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: null,
      contrato: null,
      parcela: null,
      classificacao: 'CLIENTE_AUSENTE',
      acao_proposta: 'CRIAR_CLIENTE_CONTRATO_PARCELA_E_BAIXAR',
      bloqueado: true,
      confianca: 0.95,
      divergencias: ['CLIENTE_NAO_ENCONTRADO_NO_LARMHUB'],
    }
  }
  if (clients.length > 1) {
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: null,
      contrato: null,
      parcela: null,
      classificacao: 'CLIENTE_AMBIGUO',
      acao_proposta: 'REVISAR_CLIENTE',
      bloqueado: true,
      confianca: 0,
      divergencias: ['MAIS_DE_UM_CLIENTE_CANDIDATO'],
      candidatos_cliente: clients,
    }
  }

  const contracts = await findContracts(client, tenantId, reportRow, clients)
  if (!contracts.length) {
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: clients[0],
      contrato: null,
      parcela: null,
      classificacao: 'CONTRATO_AUSENTE',
      acao_proposta: 'CRIAR_CONTRATO_PARCELA_E_BAIXAR',
      bloqueado: true,
      confianca: 0.92,
      divergencias: ['CONTRATO_NAO_ENCONTRADO_NO_LARMHUB'],
    }
  }
  if (contracts.length > 1) {
    const exactNumber = `STR-${String(reportRow?.cliente_codigo || '').trim()}-${String(reportRow?.unidade || '').trim()}`.toUpperCase()
    const exact = contracts.filter(row => String(row.numero || '').toUpperCase() === exactNumber)
    if (exact.length === 1) contracts.splice(0, contracts.length, exact[0])
  }
  if (contracts.length > 1) {
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: clients[0],
      contrato: null,
      parcela: null,
      classificacao: 'CONTRATO_AMBIGUO',
      acao_proposta: 'REVISAR_CONTRATO',
      bloqueado: true,
      confianca: 0,
      divergencias: ['MAIS_DE_UM_CONTRATO_CANDIDATO'],
      candidatos_contrato: contracts,
    }
  }

  const parcels = await findParcels(client, tenantId, reportRow, contracts, excludedParcelIds)
  const selected = selectParcel(reportRow, parcels, { multiparcelas })
  if (selected.ambiguous) {
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: clients[0],
      contrato: contracts[0],
      parcela: null,
      classificacao: 'PARCELA_AMBIGUA',
      acao_proposta: 'REVISAR_PARCELA',
      bloqueado: true,
      confianca: 0,
      divergencias: ['MAIS_DE_UMA_PARCELA_CANDIDATA'],
      candidatos_parcela: parcels,
    }
  }
  if (!selected.parcel) {
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: clients[0],
      contrato: contracts[0],
      parcela: null,
      classificacao: 'PARCELA_AUSENTE',
      acao_proposta: 'CRIAR_PARCELA_E_BAIXAR',
      bloqueado: true,
      confianca: 0.88,
      divergencias: ['PARCELA_NAO_ENCONTRADA_NO_LARMHUB'],
    }
  }

  const comparison = compareParcel(reportRow, selected.parcel)
  const paid = Boolean(selected.parcel.movimento_id) || String(selected.parcel.status || '').toLowerCase() === 'paga'
  if (paid) {
    const paidAction = paidParcelCorrectionAction(selected.parcel, comparison)
    const mutableDivergences = mutableReceiptDivergences(comparison)
    const canCorrectExisting = String(selected.parcel?.origem_baixa || '').trim().toLowerCase() === 'retorno_bradesco'
      && Boolean(selected.parcel?.movimento_id)
    return {
      ...rowFinancials(reportRow),
      relatorio: reportRow,
      cliente: clients[0],
      contrato: contracts[0],
      parcela: selected.parcel,
      classificacao: comparison.divergencias.length ? 'JA_BAIXADA_COM_DIVERGENCIAS' : 'JA_BAIXADA',
      acao_proposta: paidAction,
      bloqueado: mutableDivergences.length > 0 && !canCorrectExisting,
      confianca: selected.confidence,
      divergencias: comparison.divergencias,
      valor_atual_larmhub: comparison.valor_atual_larmhub,
      natureza_financeira: comparison.natureza_financeira,
      confirmacao_recomendada: comparison.divergencias.length > 0,
      evidencias_correspondencia: [
        'CLIENTE_LOCALIZADO', 'CONTRATO_LOCALIZADO',
        fractionsEquivalent(fraction(reportRow?.parcela), { number: Number(selected.parcel.parcela_numero_legado), total: Number(selected.parcel.parcela_total_legado) }) ? 'FRACAO_EQUIVALENTE' : null,
        parcelDueDate(selected.parcel) === reportRow?.vencimento ? 'VENCIMENTO_EXATO' : null,
        reportBoleto(reportRow) === returnBoleto(returnItem) ? 'BOLETO_COMPLETO_NO_RELATORIO_E_RETORNO' : null,
      ].filter(Boolean),
    }
  }

  const hasComplexFinancials = comparison.proposto.valor_desconto > 0
    || comparison.proposto.valor_moras > 0
    || comparison.proposto.valor_juros_financeiro > 0
    || comparison.proposto.valor_seguro > 0
    || comparison.proposto.valor_residuo > 0
  const action = comparison.divergencias.length || hasComplexFinancials
    ? 'ATUALIZAR_E_BAIXAR'
    : 'BAIXAR_PARCELA'

  return {
    ...rowFinancials(reportRow),
    relatorio: reportRow,
    cliente: clients[0],
    contrato: contracts[0],
    parcela: selected.parcel,
    classificacao: comparison.divergencias.length ? 'PARCELA_LOCALIZADA_COM_DIVERGENCIAS' : 'PARCELA_LOCALIZADA',
    acao_proposta: action,
    bloqueado: action !== 'BAIXAR_PARCELA',
    confianca: selected.confidence,
    divergencias: comparison.divergencias,
    valor_atual_larmhub: comparison.valor_atual_larmhub,
    natureza_financeira: comparison.natureza_financeira,
    confirmacao_recomendada: comparison.divergencias.length > 0 || comparison.natureza_financeira.origem === 'INFERIDO_PELA_DIFERENCA',
    evidencias_correspondencia: [
      'CLIENTE_LOCALIZADO', 'CONTRATO_LOCALIZADO',
      fractionsEquivalent(fraction(reportRow?.parcela), { number: Number(selected.parcel.parcela_numero_legado), total: Number(selected.parcel.parcela_total_legado) }) ? 'FRACAO_EQUIVALENTE' : null,
      parcelDueDate(selected.parcel) === reportRow?.vencimento ? 'VENCIMENTO_EXATO' : null,
      reportBoleto(reportRow) === returnBoleto(returnItem) ? 'BOLETO_COMPLETO_NO_RELATORIO_E_RETORNO' : null,
    ].filter(Boolean),
    identificadores_retorno: {
      nosso_numero: returnItem?.nossoNumero || null,
      nosso_numero_dv: returnItem?.nossoNumeroDv || null,
      controle_participante: returnItem?.participantControl || null,
    },
  }
}

function summarize(items) {
  const summary = {
    itens_retorno: items.length,
    itens_com_relatorio: 0,
    boletos_multiparcelas: 0,
    parcelas_relacionadas: 0,
    clientes_ausentes: 0,
    contratos_ausentes: 0,
    parcelas_ausentes: 0,
    parcelas_divergentes: 0,
    parcelas_ja_baixadas: 0,
    itens_bloqueados: 0,
    valor_nominal: 0,
    valor_desconto: 0,
    valor_juros_e_moras: 0,
    valor_pago: 0,
  }

  for (const item of items) {
    if (item.relatorio_encontrado) summary.itens_com_relatorio += 1
    if ((item.parcelas || []).length > 1) summary.boletos_multiparcelas += 1
    summary.parcelas_relacionadas += (item.parcelas || []).length
    if (item.execucao_automatica_bloqueada) summary.itens_bloqueados += 1
    for (const row of item.parcelas || []) {
      if (row.classificacao === 'CLIENTE_AUSENTE') summary.clientes_ausentes += 1
      if (row.classificacao === 'CONTRATO_AUSENTE') summary.contratos_ausentes += 1
      if (row.classificacao === 'PARCELA_AUSENTE') summary.parcelas_ausentes += 1
      if (String(row.classificacao).includes('DIVERGENCIAS')) summary.parcelas_divergentes += 1
      if (String(row.classificacao).startsWith('JA_BAIXADA')) summary.parcelas_ja_baixadas += 1
      summary.valor_nominal = roundMoney(summary.valor_nominal + asMoney(row.valor_nominal))
      summary.valor_desconto = roundMoney(summary.valor_desconto + asMoney(row.valor_desconto))
      summary.valor_juros_e_moras = roundMoney(summary.valor_juros_e_moras + asMoney(row.valor_juros_financeiro) + asMoney(row.valor_moras))
      summary.valor_pago = roundMoney(summary.valor_pago + asMoney(row.valor_pago))
    }
  }
  return summary
}

async function analyzeStratoMultiParcelReturn({ client, tenantId, parsed, stratoReports = [], explicitCompany = null }) {
  const groups = groupReportRows(stratoReports)
  const used = new Set()
  const items = []
  const details = Array.isArray(parsed?.details) ? parsed.details : []

  for (const returnItem of details) {
    const group = selectGroupForReturn(returnItem, groups, used)
    if (!group) {
      items.push({
        linha: returnItem.lineNumber,
        boleto: returnBoleto(returnItem),
        nosso_numero: onlyDigits(returnItem?.nossoNumero || ''),
        nosso_numero_dv: String(returnItem?.nossoNumeroDv || ''),
        documento: returnItem.documentNumber,
        ocorrencia: returnItem.occurrence,
        valor_retorno: asMoney(returnItem.paidAmount || returnItem.titleAmount),
        relatorio_encontrado: false,
        parcelas: [],
        status_analise: 'SEM_RELATORIO_STRATO_CORRESPONDENTE',
        execucao_automatica_bloqueada: false,
        bloqueios: [],
      })
      continue
    }

    const isLiquidation = String(returnItem?.occurrence || '') === '06'
    const returnPaid = asMoney(isLiquidation ? (returnItem.paidAmount || returnItem.titleAmount) : returnItem.titleAmount)
    const reconciliation = isLiquidation
      ? reconcileGroupRounding(group, returnPaid)
      : { group, adjusted: false, difference: 0, adjustedIndex: null }
    const effectiveGroup = reconciliation.group
    const parcelAnalyses = []
    if (isLiquidation) {
      const usedGroupParcelIds = new Set()
      const groupHasMultipleParcels = effectiveGroup.rows.length > 1
      for (const reportRow of effectiveGroup.rows) {
        const parcelAnalysis = await analyzeReportRow(client, tenantId, reportRow, returnItem, {
          excludedParcelIds: usedGroupParcelIds,
          multiparcelas: groupHasMultipleParcels,
        })
        parcelAnalyses.push(parcelAnalysis)
        if (parcelAnalysis?.parcela?.id) usedGroupParcelIds.add(String(parcelAnalysis.parcela.id))
      }
    }

    const sumsMatch = !isLiquidation || Math.abs(effectiveGroup.totais.valor_pago - returnPaid) <= 0.02
    const multiple = parcelAnalyses.length > 1
    const rowBlocks = parcelAnalyses.filter(row => row.bloqueado)
    const requiresWrite = parcelAnalyses.some(row => row.acao_proposta && row.acao_proposta !== 'NENHUMA')
    const blocks = []
    if (isLiquidation && !sumsMatch) blocks.push('SOMA_DAS_PARCELAS_DIVERGE_DO_RETORNO')
    if (multiple && requiresWrite) blocks.push('BOLETO_COM_MULTIPLAS_PARCELAS_AGUARDA_FLUXO_0_6_5')
    if (isLiquidation && rowBlocks.length) blocks.push('HA_PARCELAS_COM_CADASTRO_AUSENTE_AMBIGUIDADE_OU_DIVERGENCIA')

    items.push({
      linha: returnItem.lineNumber,
      boleto: returnBoleto(returnItem),
      nosso_numero: onlyDigits(returnItem?.nossoNumero || ''),
      nosso_numero_dv: String(returnItem?.nossoNumeroDv || ''),
      documento: returnItem.documentNumber,
      ocorrencia: returnItem.occurrence,
      ocorrencia_descricao: returnItem.occurrenceLabel,
      data_ocorrencia: returnItem.occurrenceDate || null,
      data_recebimento: group.rows.map(row => row.data_pagamento).filter(Boolean)[0] || returnItem.occurrenceDate || null,
      data_credito: returnItem.creditDate || parsed?.header?.creditDate || null,
      valor_titulo_retorno: asMoney(returnItem.titleAmount),
      valor_retorno: returnPaid,
      relatorio_encontrado: true,
      arquivo_relatorio: effectiveGroup.report?.nome_arquivo_relatorio || null,
      quantidade_parcelas: parcelAnalyses.length,
      multiparcelas: multiple,
      totais_relatorio: effectiveGroup.totais,
      ajuste_arredondamento: reconciliation.adjusted ? {
        aplicado: true,
        valor: reconciliation.difference,
        parcela: effectiveGroup.rows[reconciliation.adjustedIndex]?.parcela || null,
        motivo: 'ARREDONDAMENTO_DO_RELATORIO_IMPRESSO_PARA_CONFERIR_COM_CNAB',
      } : null,
      soma_confere_com_retorno: sumsMatch,
      diferenca_soma: roundMoney(effectiveGroup.totais.valor_pago - returnPaid),
      parcelas: parcelAnalyses,
      status_analise: !isLiquidation ? 'OCORRENCIA_SEM_LIQUIDACAO' : (blocks.length ? 'AGUARDA_REVISAO' : 'PRONTO_FLUXO_ATUAL'),
      execucao_automatica_bloqueada: blocks.length > 0,
      bloqueios: blocks,
    })
  }

  const result = {
    versao: '0.8.2',
    modo: 'ANALISE_PARA_APROVACAO',
    empresa: normalizeCompany(explicitCompany) || normalizeCompany(parsed?.header?.companyName),
    arquivo_retorno: parsed?.filename || null,
    resumo: null,
    itens: items,
    seguranca: {
      escrita_financeira: false,
      cria_cliente: false,
      cria_contrato: false,
      cria_parcela: false,
      executa_baixa: false,
      cria_movimento: false,
    },
  }
  result.resumo = summarize(items)
  result.requer_fluxo_inteligente = result.resumo.itens_bloqueados > 0
  return result
}

module.exports = {
  analyzeStratoMultiParcelReturn,
  groupReportRows,
  selectGroupForReturn,
  rowFinancials,
  sumFinancials,
  fraction,
  fractionsEquivalent,
  reconcileGroupRounding,
  normalizeText,
  compareParcel,
  paidParcelCorrectionAction,
  mutableReceiptDivergences,
  MUTABLE_RECEIPT_DIVERGENCES,
  FINANCIAL_DIVERGENCES,
  selectParcel,
  isoDate,
  parcelDueDate,
}
