/**
 * Conciliação de retorno Bradesco CNAB 400 com recebíveis importados do Strato.
 * v0.5.0
 *
 * Pontos importantes:
 * - o identificador do participante do retorno corresponde ao ts1_core.core1_cod;
 * - o contrato importado no HUB usa o prefixo STR-<vend1_cod>-...;
 * - uma prévia nunca grava o arquivo nem altera parcelas;
 * - a liquidação cria o Movimento Bancário e vincula movimento_id à parcela;
 * - nas importações feitas pela tela, a data do recebimento é a data em que o
 *   arquivo de retorno foi enviado ao LarmHub; as datas bancárias permanecem
 *   registradas nos metadados da conciliação.
 */

const { parseReturn, onlyDigits } = require('./bradescoCnab400')

const KNOWN_COMPANY_CODES = new Map([
  ['4352309', 'LARM'],
  ['4798045', 'LUCKY'],
])

function roundMoney(value) {
  const number = Number(value || 0)
  return Math.round((number + Number.EPSILON) * 100) / 100
}

function normalizeCompany(value) {
  const normalized = String(value || '').trim().toUpperCase()
  if (normalized.includes('LUCKY')) return 'LUCKY'
  if (normalized.includes('LARM')) return 'LARM'
  return null
}

function normalizeDigits(value) {
  return onlyDigits(String(value || '')).replace(/^0+/, '') || '0'
}

function billingCompanySql(parcelAlias = 'p', contractAlias = 'c') {
  return `CASE
    WHEN COALESCE(${contractAlias}.obra_codigo_legado, ${parcelAlias}.obra_codigo_legado) = 7698 THEN 'LUCKY'
    WHEN COALESCE(${contractAlias}.obra_codigo_legado, ${parcelAlias}.obra_codigo_legado) IN (7700, 7701) THEN 'LARM'
    ELSE NULL
  END`
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

function expectedParcelType(documentNumber) {
  const value = String(documentNumber || '').trim().toUpperCase()
  if (/^(E\b|E\s|.*-ENTR?$|.*-ENT$)/.test(value)) return 'entrada'
  if (/^(P\b|P\s|.*-PA$)/.test(value)) return 'parcela'
  return null
}

function documentFraction(documentNumber) {
  const match = String(documentNumber || '').match(/(\d{1,3})\s*\/\s*(\d{1,3})/)
  if (!match) return null
  return { number: Number(match[1]), total: Number(match[2]) }
}

async function tableExists(client, tableName) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`])
  return Boolean(row?.table_name)
}

async function inferReturnContext(client, tenantId, parsed, explicitCompany = null) {
  const explicit = normalizeCompany(explicitCompany)
  const headerDigits = normalizeDigits(parsed.header.companyCode)
  const headerCompany = KNOWN_COMPANY_CODES.get(headerDigits) || normalizeCompany(parsed.header.companyName)

  if (explicit && headerCompany && explicit !== headerCompany) {
    throw new Error(`Empresa informada (${explicit}) diverge do cabeçalho CNAB (${headerCompany}).`)
  }

  // O cabeçalho do CNAB é a fonte principal para LARM/LUCKY. Na base legada,
  // a configuração LUCKY chegou a usar o mesmo codigo_empresa da LARM; por isso
  // consultar a configuração antes do cabeçalho classificava arquivos LARM como LUCKY.
  let company = explicit || headerCompany || null
  let config = null

  if (company) {
    const { rows: [row] } = await client.query(
      `SELECT *
         FROM fin_cobranca_bancaria_config
        WHERE tenant_id=$1 AND banco_codigo='237' AND UPPER(empresa)=UPPER($2)
        ORDER BY ativo DESC, updated_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [tenantId, company],
    )
    config = row || null
  }

  // Fallback apenas para bancos/empresas ainda não conhecidos no mapa do CNAB.
  if (!company) {
    const { rows } = await client.query(
      `SELECT *
         FROM fin_cobranca_bancaria_config
        WHERE tenant_id=$1
          AND banco_codigo='237'
          AND regexp_replace(COALESCE(codigo_empresa,''), '[^0-9]', '', 'g') <> ''
        ORDER BY ativo DESC, updated_at DESC NULLS LAST, id DESC`,
      [tenantId],
    )
    config = rows.find(row => normalizeDigits(row.codigo_empresa) === headerDigits) || null
    company = normalizeCompany(config?.empresa)
  }

  let bankAccount = null
  let bankAccountAmbiguous = false
  if (company) {
    const { rows } = await client.query(
      `SELECT id, empresa, banco_nome, codigo_banco, agencia, conta, digito, ativo
         FROM fin_bancos_contas
        WHERE ativo IS DISTINCT FROM FALSE
          AND UPPER(empresa)=UPPER($1)
          AND (
            regexp_replace(COALESCE(codigo_banco,''), '[^0-9]', '', 'g')='237'
            OR banco_nome ILIKE '%BRADESCO%'
          )
        ORDER BY
          CASE WHEN regexp_replace(COALESCE(codigo_banco,''), '[^0-9]', '', 'g')='237' THEN 0 ELSE 1 END,
          id`,
      [company],
    )
    if (rows.length === 1) bankAccount = rows[0]
    else if (rows.length > 1) {
      const exact = rows.filter(row => normalizeDigits(row.codigo_banco) === '237')
      if (exact.length === 1) bankAccount = exact[0]
      else bankAccountAmbiguous = true
    }
  }

  return { company, config, bankAccount, bankAccountAmbiguous, headerDigits, headerCompany }
}

const PARCEL_BASE_SELECT = `
  SELECT
    p.id,
    p.status,
    p.vencimento,
    p.tipo,
    p.numero,
    p.valor_nominal,
    p.valor_recalculado,
    p.valor_correcao,
    p.valor_multa,
    p.valor_juros_mora,
    p.valor_outros_acrescimos,
    p.valor_seguro,
    p.valor_desconto,
    p.valor_pago,
    p.pago_em,
    p.movimento_id,
    p.origem_baixa,
    p.conciliacao_dados,
    p.nosso_numero,
    p.nosso_numero_dv,
    p.controle_participante,
    p.documento_legado,
    p.parcela_numero_legado,
    p.parcela_total_legado,
    p.obra_codigo_legado,
    p.unidade_codigo_legado,
    p.receita_id,
    c.id AS contrato_id,
    c.numero AS contrato_numero,
    c.titulo AS contrato_titulo,
    c.obra_codigo_legado AS contrato_obra_codigo,
    c.unidade_codigo_legado AS contrato_unidade_codigo,
    ${billingCompanySql('p', 'c')} AS empresa_cobranca,
    COALESCE(cp.nome, cp.razao_social, c.comprador_nome, 'Cliente não identificado') AS cliente_nome,
    cl.codigo AS cliente_codigo,
    cp.codigo_legado::text AS cliente_codigo_legado,
    r.titulo AS receita_titulo,
    r.numero_documento AS receita_documento,
    pc.codigo AS plano_codigo,
    pc.descricao AS plano_descricao,
    COALESCE(
      obra.nome,
      CASE WHEN unidade.tipo='obra' THEN unidade.nome END,
      'Obra ' || COALESCE(p.obra_codigo_legado::text, c.obra_codigo_legado::text, '')
    ) AS obra_nome,
    ${receivableValueSql('p')}::numeric AS valor_atual,
    ri.id AS remessa_item_id
  FROM com_parcelas p
  JOIN com_contratos c ON c.id=p.contrato_id
  LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
  LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
  LEFT JOIN fin_receitas r ON r.id=p.receita_id
  LEFT JOIN fin_plano_contas pc ON pc.id=r.plano_conta_id
  LEFT JOIN cad_produtos unidade ON unidade.id=p.produto_id
  LEFT JOIN cad_produtos obra ON obra.id=unidade.produto_pai_id
  LEFT JOIN LATERAL (
    SELECT x.id
      FROM fin_remessas_cobranca_itens x
     WHERE x.tenant_id=p.tenant_id AND x.parcela_id=p.id
     ORDER BY x.created_at DESC NULLS LAST, x.id DESC
     LIMIT 1
  ) ri ON TRUE
`

function parcelOrderSql(dueIndex, amountIndex) {
  const dueToken = `$${dueIndex}`
  const amountToken = `$${amountIndex}`
  return `
    ORDER BY
      CASE WHEN LOWER(COALESCE(p.status,'')) IN ('aberta','atrasada') THEN 0 ELSE 1 END,
      CASE WHEN p.vencimento=${dueToken}::date THEN 0 ELSE 1 END,
      ABS(${receivableValueSql('p')} - ${amountToken}::numeric),
      CASE WHEN LOWER(COALESCE(p.status,''))='paga' THEN 1 ELSE 0 END,
      p.id
  `
}

async function queryParcelCandidates(client, { tenantId, company, whereSql, params, item, limit = 5, forUpdate = false, excludedParcelIds = null }) {
  const baseParams = [tenantId, company, ...params]
  // Não inclua parâmetros que não aparecem no SQL. O PostgreSQL rejeita
  // sequências com lacunas, por exemplo $1, $2, $3, $4, $6 e $7, com
  // "could not determine data type of parameter $5".
  const dueIndex = baseParams.length + 1
  baseParams.push(item.dueDate || null)
  const amountIndex = baseParams.length + 1
  baseParams.push(roundMoney(item.titleAmount || item.paidAmount || 0))

  const sql = `${PARCEL_BASE_SELECT}
    WHERE p.tenant_id=$1
      AND ${billingCompanySql('p', 'c')}=$2
      AND (${whereSql})
    ${parcelOrderSql(dueIndex, amountIndex)}
    LIMIT ${Number(limit)}
    ${forUpdate ? 'FOR UPDATE OF p' : ''}`
  const { rows } = await client.query(sql, baseParams)
  if (!excludedParcelIds?.size) return rows
  return rows.filter(row => !excludedParcelIds.has(String(row.id)))
}

function chooseUniqueCandidate(rows, item, { requireCloseAmount = false } = {}) {
  if (!rows.length) return null
  if (!requireCloseAmount) {
    if (rows.length === 1) return rows[0]
    const exactDue = rows.filter(row => String(row.vencimento).slice(0, 10) === String(item.dueDate || '').slice(0, 10))
    if (exactDue.length === 1) return exactDue[0]
    return null
  }

  const reference = roundMoney(item.titleAmount || item.paidAmount || 0)
  const maxDifference = Math.max(100, reference * 0.03)
  const ranked = rows
    .map(row => ({ row, difference: Math.abs(Number(row.valor_atual || 0) - reference) }))
    .sort((a, b) => a.difference - b.difference)
  const eligible = ranked.filter(entry => entry.difference <= maxDifference)
  if (eligible.length !== 1) return null
  return eligible[0].row
}

async function matchByStoredIdentifiers(client, options) {
  const { item } = options
  if (!item.nossoNumero && !item.participantControl) return null
  const rows = await queryParcelCandidates(client, {
    ...options,
    whereSql: `
      (NULLIF($3::text,'') IS NOT NULL AND p.nosso_numero=$3::text)
      OR (NULLIF($4::text,'') IS NOT NULL AND p.controle_participante=$4::text)
    `,
    params: [item.nossoNumero || '', item.participantControl || ''],
    limit: 3,
  })
  const parcel = chooseUniqueCandidate(rows, item)
  return parcel ? { parcel, method: parcel.nosso_numero === item.nossoNumero ? 'nosso_numero' : 'controle_participante' } : null
}

async function findLegacyContracts(client, item) {
  if (!(await tableExists(client, 'ts1_core'))) return []
  const control = String(item.participantControl || '').trim()
  const nosso = normalizeDigits(item.nossoNumero)
  const nossoDv = normalizeDigits(`${item.nossoNumero || ''}${item.nossoNumeroDv || ''}`)
  if (!control && nosso === '0') return []

  const { rows } = await client.query(
    `SELECT vend1_cod::text AS vend1_cod,
            core1_cod::text AS core1_cod,
            regexp_replace(COALESCE(core1_bol::text,''), '[^0-9]', '', 'g') AS core1_bol,
            core1_dat_ven::date AS vencimento_legado,
            core1_doc_num::text AS documento_legado
       FROM ts1_core
      WHERE
        (NULLIF($1,'') IS NOT NULL AND core1_cod::text=$1)
        OR (
          $2 <> '0'
          AND regexp_replace(COALESCE(core1_bol::text,''), '[^0-9]', '', 'g') IN ($2,$3)
        )
      ORDER BY
        CASE WHEN core1_dat_ven::date=$4::date THEN 0 ELSE 1 END,
        vend1_cod::text
      LIMIT 10`,
    [control, nosso, nossoDv, item.dueDate || null],
  )
  return rows
}

async function matchByLegacyStrato(client, options) {
  const legacyRows = await findLegacyContracts(client, options.item)
  if (!legacyRows.length) return null

  const vendCodes = [...new Set(legacyRows.map(row => String(row.vend1_cod || '').trim()).filter(Boolean))]
  if (!vendCodes.length) return null
  const rows = await queryParcelCandidates(client, {
    ...options,
    whereSql: `EXISTS (
      SELECT 1 FROM unnest($3::text[]) legacy(vend_code)
       WHERE c.numero LIKE ('STR-' || legacy.vend_code || '-%')
          OR p.documento_base_legado=legacy.vend_code
    )`,
    params: [vendCodes],
    limit: 8,
  })
  const parcel = chooseUniqueCandidate(rows, options.item)
  return parcel ? {
    parcel,
    method: 'strato_core',
    legacy: legacyRows.find(row => String(parcel.contrato_numero || '').startsWith(`STR-${row.vend1_cod}-`)) || legacyRows[0],
  } : null
}


function normalizeComparisonText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizedReturnBoleto(item) {
  return onlyDigits(item?.nossoNumeroWithDv || `${item?.nossoNumero || ''}${item?.nossoNumeroDv || ''}`)
}

function reportRowKey(report, item) {
  return `${report?.nome_arquivo_relatorio || report?.arquivo_retorno || 'relatorio'}:${item?.indice_relatorio || 0}`
}

function scoreReportRowForReturn(item, reportItem) {
  let score = 0
  const returnBoleto = normalizedReturnBoleto(item)
  const returnWithoutDv = onlyDigits(item?.nossoNumero)
  const reportBoleto = onlyDigits(reportItem?.boleto)
  const fraction = documentFraction(item?.documentNumber)
  const referenceAmount = roundMoney(item?.paidAmount || item?.titleAmount || 0)
  const reportAmount = roundMoney(reportItem?.valor_pago || reportItem?.valor_titulo || 0)

  if (returnBoleto && reportBoleto && returnBoleto === reportBoleto) score += 100
  else if (returnWithoutDv && reportBoleto && (returnWithoutDv === reportBoleto || reportBoleto.startsWith(returnWithoutDv))) score += 70
  if (fraction && Number(reportItem?.parcela_numero) === fraction.number && Number(reportItem?.parcela_total) === fraction.total) score += 30
  if (item?.dueDate && reportItem?.vencimento && item.dueDate === reportItem.vencimento) score += 20
  if (referenceAmount > 0 && reportAmount > 0 && Math.abs(referenceAmount - reportAmount) <= 0.02) score += 25
  if (item?.occurrenceDate && reportItem?.data_pagamento && item.occurrenceDate === reportItem.data_pagamento) score += 10
  if (item?.occurrence && reportItem?.ocorrencia && item.occurrence === reportItem.ocorrencia) score += 5
  return score
}

function selectReportRowForReturn(item, stratoReports = [], usedReportRows = null) {
  const ranked = []
  for (const report of stratoReports || []) {
    for (const reportItem of report?.titulos || []) {
      const key = reportRowKey(report, reportItem)
      if (usedReportRows?.has(key)) continue
      ranked.push({ report, reportItem, key, score: scoreReportRowForReturn(item, reportItem) })
    }
  }
  ranked.sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const second = ranked[1]
  if (!best || best.score < 60) return null
  if (second && best.score - second.score < 15 && best.score < 100) return null
  return best
}

function scoreParcelForReport(parcel, item, reportItem) {
  let score = 0
  let identityEvidence = false
  let financialEvidence = 0
  const clientCode = String(reportItem?.cliente_codigo || '').trim()
  const unit = String(reportItem?.unidade || '').trim()
  const exactContract = clientCode && unit ? `STR-${clientCode}-${unit}`.toUpperCase() : ''
  const contractNumber = String(parcel?.contrato_numero || '').trim().toUpperCase()
  const candidateClient = normalizeComparisonText(parcel?.cliente_nome)
  const reportClient = normalizeComparisonText(reportItem?.cliente_nome)
  const candidateUnit = String(parcel?.contrato_unidade_codigo || parcel?.unidade_codigo_legado || '').trim().toUpperCase()
  const reportUnit = unit.toUpperCase()
  const candidateObra = String(parcel?.contrato_obra_codigo || parcel?.obra_codigo_legado || '').trim()
  const reportObra = String(reportItem?.obra || '').trim()
  const referenceAmount = roundMoney(reportItem?.valor_titulo || reportItem?.valor_pago || item?.titleAmount || item?.paidAmount || 0)
  const candidateAmount = roundMoney(parcel?.valor_atual || 0)

  const candidateClientCodes = [parcel?.cliente_codigo, parcel?.cliente_codigo_legado]
    .map(value => String(value || '').trim())
    .filter(Boolean)
  if (clientCode && candidateClientCodes.includes(clientCode)) {
    score += 70
    identityEvidence = true
  }
  if (exactContract && contractNumber === exactContract) {
    score += 40
    identityEvidence = true
  } else if (clientCode && contractNumber.startsWith(`STR-${clientCode}-`)) {
    score += 25
    identityEvidence = true
  }

  if (reportClient && candidateClient) {
    if (reportClient === candidateClient) {
      score += 45
      identityEvidence = true
    } else if (reportClient.includes(candidateClient) || candidateClient.includes(reportClient)) {
      score += 25
      identityEvidence = true
    }
  }

  if (reportUnit && candidateUnit && reportUnit === candidateUnit) score += 25
  if (reportObra && candidateObra && reportObra === candidateObra) score += 20
  if (reportItem?.parcela_numero && Number(parcel?.parcela_numero_legado) === Number(reportItem.parcela_numero)) {
    score += 20
    financialEvidence += 1
  }
  if (reportItem?.parcela_total && Number(parcel?.parcela_total_legado) === Number(reportItem.parcela_total)) score += 15

  const dueDates = [reportItem?.vencimento, item?.dueDate].filter(Boolean)
  if (dueDates.includes(String(parcel?.vencimento || '').slice(0, 10))) {
    score += 25
    financialEvidence += 1
  }
  if (referenceAmount > 0 && Math.abs(candidateAmount - referenceAmount) <= 0.02) {
    score += 35
    financialEvidence += 1
  } else if (referenceAmount > 0 && Math.abs(candidateAmount - referenceAmount) <= Math.max(100, referenceAmount * 0.03)) {
    score += 10
  }

  const returnBoleto = onlyDigits(item?.nossoNumero)
  if (returnBoleto && onlyDigits(parcel?.nosso_numero) === returnBoleto) {
    score += 100
    identityEvidence = true
  }
  if (item?.participantControl && String(parcel?.controle_participante || '') === String(item.participantControl)) {
    score += 100
    identityEvidence = true
  }

  return { score, identityEvidence, financialEvidence }
}

async function matchExactParcelFromStratoReport(client, options, selectedReport) {
  const reportItem = selectedReport?.reportItem
  if (!reportItem) return null

  const clientCode = String(reportItem.cliente_codigo || '').trim()
  const reportClient = normalizeComparisonText(reportItem.cliente_nome)
  const unit = String(reportItem.unidade || '').trim()
  const obra = String(reportItem.obra || '').trim()
  const dueDate = reportItem.vencimento || options.item?.dueDate || null
  const amount = roundMoney(
    reportItem.valor_titulo
      || reportItem.valor_pago
      || options.item?.titleAmount
      || options.item?.paidAmount
      || 0,
  )

  // Esta combinação é a chave determinística fornecida pelo próprio Strato:
  // cliente + unidade + vencimento + valor. A fração da parcela não é usada
  // como trava porque a importação de posição pode ter renumerado as parcelas
  // remanescentes (ex.: 073/120 no Strato e 59/97 no cadastro importado).
  if ((!clientCode && !reportClient) || !unit || !dueDate || amount <= 0) return null

  const rows = await queryParcelCandidates(client, {
    ...options,
    whereSql: `
      (NULLIF($3::text,'') IS NULL OR cl.codigo=$3::text OR cp.codigo_legado::text=$3::text)
      AND UPPER(COALESCE(c.unidade_codigo_legado,p.unidade_codigo_legado,''))=UPPER($4::text)
      AND (NULLIF($5::text,'') IS NULL OR COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text=$5::text)
      AND p.vencimento=$6::date
      AND ABS(${receivableValueSql('p')} - $7::numeric) <= 0.02
      AND LOWER(COALESCE(p.status,'')) IN ('aberta','atrasada','paga')
    `,
    params: [clientCode, unit, obra, dueDate, amount],
    limit: 5,
  })

  const identityRows = clientCode
    ? rows
    : rows.filter(row => normalizeComparisonText(row.cliente_nome) === reportClient)

  if (identityRows.length !== 1) return null

  return {
    parcel: identityRows[0],
    method: 'relatorio_strato_exato',
    reportItem,
    report: selectedReport.report,
    reportScore: selectedReport.score,
    confidence: 100,
  }
}

async function matchByStratoReport(client, options, stratoReports, usedReportRows) {
  const selectedReport = selectReportRowForReturn(options.item, stratoReports, usedReportRows)
  if (!selectedReport) return null

  const exactMatch = await matchExactParcelFromStratoReport(client, options, selectedReport)
  usedReportRows?.add(selectedReport.key)
  if (exactMatch) return exactMatch

  const reportItem = selectedReport.reportItem
  const clientCode = String(reportItem?.cliente_codigo || '').trim()
  const unit = String(reportItem?.unidade || '').trim()
  const contractPrefix = clientCode ? `STR-${clientCode}-%` : ''
  const reportAmount = roundMoney(reportItem?.valor_titulo || reportItem?.valor_pago || options.item?.titleAmount || options.item?.paidAmount || 0)

  const rows = await queryParcelCandidates(client, {
    ...options,
    whereSql: `
      (NULLIF($3::text,'') IS NOT NULL AND (cl.codigo=$3::text OR cp.codigo_legado::text=$3::text))
      OR (NULLIF($4::text,'') IS NOT NULL AND UPPER(c.numero) LIKE UPPER($4::text))
      OR (NULLIF($5::text,'') IS NOT NULL AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text=$5::text)
      OR (NULLIF($6::text,'') IS NOT NULL AND UPPER(COALESCE(c.unidade_codigo_legado,p.unidade_codigo_legado,''))=UPPER($6::text))
      OR ($7::int IS NOT NULL AND p.parcela_numero_legado=$7::int)
      OR ($8::date IS NOT NULL AND p.vencimento=$8::date)
      OR ($9::numeric > 0 AND ABS(${receivableValueSql('p')} - $9::numeric) <= GREATEST(100, $9::numeric * 0.03))
    `,
    params: [
      clientCode,
      contractPrefix,
      String(reportItem?.obra || ''),
      unit,
      reportItem?.parcela_numero || null,
      reportItem?.vencimento || options.item?.dueDate || null,
      reportAmount,
    ],
    limit: 30,
  })

  const ranked = rows
    .map(parcel => ({ parcel, ...scoreParcelForReport(parcel, options.item, reportItem) }))
    .sort((a, b) => b.score - a.score)
  const best = ranked[0]
  const second = ranked[1]
  const uniqueEnough = best && (!second || best.score - second.score >= 15)
  const safe = best && best.score >= 90 && best.identityEvidence && best.financialEvidence >= 2 && uniqueEnough

  if (!safe) {
    return {
      parcel: null,
      method: 'relatorio_strato_sem_match_seguro',
      reportItem,
      report: selectedReport.report,
      reportScore: selectedReport.score,
      confidence: best ? Math.min(89, best.score) : 0,
      candidates: ranked.slice(0, 3).map(entry => ({
        parcela_id: entry.parcel.id,
        contrato: entry.parcel.contrato_numero,
        cliente: entry.parcel.cliente_nome,
        score: entry.score,
      })),
    }
  }

  return {
    parcel: best.parcel,
    method: 'relatorio_strato_ia',
    reportItem,
    report: selectedReport.report,
    reportScore: selectedReport.score,
    confidence: Math.min(100, best.score),
  }
}

async function persistStratoReportData(client, tenantId, parcelId, reportItem, report, confidence) {
  if (!reportItem) return
  await client.query(
    `UPDATE com_parcelas
        SET documento_legado=COALESCE(NULLIF(documento_legado,''), NULLIF($1,'')),
            parcela_numero_legado=COALESCE(parcela_numero_legado,$2),
            parcela_total_legado=COALESCE(parcela_total_legado,$3),
            obra_codigo_legado=COALESCE(obra_codigo_legado,$4),
            unidade_codigo_legado=COALESCE(NULLIF(unidade_codigo_legado,''),NULLIF($5,'')),
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $6::jsonb,
            updated_at=NOW()
      WHERE id=$7::uuid AND tenant_id=$8`,
    [
      reportItem.parcela || '',
      reportItem.parcela_numero || null,
      reportItem.parcela_total || null,
      Number(reportItem.obra) || null,
      reportItem.unidade || '',
      JSON.stringify({
        conciliacao_relatorio_strato: {
          arquivo_relatorio: report?.nome_arquivo_relatorio || null,
          arquivo_retorno: report?.arquivo_retorno || null,
          provider: report?.provider || null,
          boleto: reportItem.boleto || null,
          cliente_codigo: reportItem.cliente_codigo || null,
          cliente_nome: reportItem.cliente_nome || null,
          confianca: confidence || null,
          conciliado_em: new Date().toISOString(),
        },
      }),
      parcelId,
      tenantId,
    ],
  )
}

async function matchBySafeFallback(client, options) {
  const { item } = options
  if (!item.dueDate) return null
  const type = expectedParcelType(item.documentNumber)
  const fraction = documentFraction(item.documentNumber)
  const extra = []
  const params = [item.dueDate]

  if (type) {
    params.push(type)
    extra.push(`LOWER(COALESCE(p.tipo,''))=$${params.length + 2}`)
  }

  // Quando o documento do retorno traz a fração, ela serve apenas como reforço.
  // Importações do relatório de posição podem renumerar as parcelas restantes,
  // portanto a ausência de coincidência não elimina o candidato.
  let fractionSql = ''
  if (fraction) {
    params.push(String(fraction.number), String(fraction.total))
    const numberToken = `$${params.length + 1}`
    const totalToken = `$${params.length + 2}`
    fractionSql = `,
      CASE WHEN p.parcela_numero_legado::text=${numberToken} AND p.parcela_total_legado::text=${totalToken} THEN 0 ELSE 1 END AS fracao_rank`
  }

  const baseParams = [options.tenantId, options.company, ...params]
  const amountIndex = baseParams.length + 1
  baseParams.push(roundMoney(item.titleAmount || item.paidAmount || 0))
  const sql = `${PARCEL_BASE_SELECT.replace('ri.id AS remessa_item_id', `ri.id AS remessa_item_id${fractionSql}`)}
    WHERE p.tenant_id=$1
      AND ${billingCompanySql('p', 'c')}=$2
      AND p.vencimento=$3::date
      ${extra.length ? `AND ${extra.join(' AND ')}` : ''}
      AND LOWER(COALESCE(p.status,'')) IN ('aberta','atrasada','paga')
    ORDER BY
      ${fraction ? 'fracao_rank,' : ''}
      CASE WHEN LOWER(COALESCE(p.status,'')) IN ('aberta','atrasada') THEN 0 ELSE 1 END,
      ABS(${receivableValueSql('p')} - $${amountIndex}::numeric),
      p.id
    LIMIT 8
    ${options.forUpdate ? 'FOR UPDATE OF p' : ''}`
  const { rows } = await client.query(sql, baseParams)
  const parcel = chooseUniqueCandidate(rows, item, { requireCloseAmount: true })
  return parcel ? { parcel, method: 'data_tipo_valor_unico' } : null
}

async function loadParcelById(client, { tenantId, company, item, parcelId, forUpdate = false }) {
  const rows = await queryParcelCandidates(client, {
    tenantId,
    company,
    item,
    forUpdate,
    whereSql: 'p.id=$3::uuid',
    params: [parcelId],
    limit: 1,
  })
  return rows[0] || null
}

async function findParcelForReturn(client, { tenantId, company, item, forUpdate = false, excludedParcelIds = null, stratoReports = [], usedReportRows = null }) {
  if (!company) return null
  const options = { client, tenantId, company, item, forUpdate, excludedParcelIds }
  const directMatch = (
    await matchByStoredIdentifiers(client, options)
    || await matchByLegacyStrato(client, options)
    || await matchBySafeFallback(client, options)
  )

  if (directMatch) {
    const selectedReport = selectReportRowForReturn(item, stratoReports, usedReportRows)
    if (selectedReport) {
      usedReportRows?.add(selectedReport.key)
      directMatch.reportItem = selectedReport.reportItem
      directMatch.report = selectedReport.report
      directMatch.reportScore = selectedReport.score
      directMatch.confidence = 100
    }
    return directMatch
  }

  return matchByStratoReport(client, options, stratoReports, usedReportRows)
}

async function findExistingLiquidationMovement(client, { paymentDate, company, bankAccount }) {
  if (!paymentDate || !company || !bankAccount?.id) return null
  const { rows } = await client.query(
    `SELECT id, data, empresa, banco, entradas, saidas, fornecedor, historico, banco_conta_id
       FROM fin_movimento
      WHERE data::date=$1::date
        AND UPPER(COALESCE(empresa,''))=UPPER($2::text)
        AND (
          banco_conta_id=$3
          OR UPPER(COALESCE(banco,'')) LIKE '%BRADESCO%'
        )
        AND COALESCE(entradas,0)>0
        AND COALESCE(saidas,0)=0
        AND COALESCE(BTRIM(fornecedor),'')=''
        AND (
          COALESCE(historico,'') ILIKE '%cobran%'
          OR COALESCE(conta_contabil,'') ILIKE '%VENDA DE IM%'
        )
      ORDER BY CASE WHEN banco_conta_id=$3 THEN 0 ELSE 1 END, id
      LIMIT 2`,
    [paymentDate, company, bankAccount.id],
  )
  return rows.length === 1 ? rows[0] : null
}

async function persistReturnIdentifiers(client, tenantId, parcelId, item) {
  let nossoNumero = null
  if (item.nossoNumero) {
    const { rows } = await client.query(
      `SELECT id FROM com_parcelas WHERE tenant_id=$1 AND nosso_numero=$2 AND id<>$3::uuid LIMIT 1`,
      [tenantId, item.nossoNumero, parcelId],
    )
    if (!rows.length) nossoNumero = item.nossoNumero
  }

  await client.query(
    `UPDATE com_parcelas
        SET nosso_numero=COALESCE(nosso_numero,$1),
            nosso_numero_dv=COALESCE(nosso_numero_dv,$2),
            controle_participante=COALESCE(controle_participante,NULLIF($3,'')),
            updated_at=NOW()
      WHERE id=$4::uuid AND tenant_id=$5`,
    [nossoNumero, item.nossoNumeroDv || null, item.participantControl || '', parcelId, tenantId],
  )
}

async function createMovementAndPay(client, { tenantId, userId, filename, parsed, item, parcel, bankAccount, company, receiptDate }) {
  const paymentDate = normalizeReceiptDate(receiptDate) || item.occurrenceDate || parsed.header.fileDate || item.creditDate
  if (!paymentDate) throw new Error(`Não foi possível identificar a data da baixa na linha ${item.lineNumber}.`)
  const [year, month, day] = paymentDate.split('-').map(Number)
  const paidValue = roundMoney(item.paidAmount || item.titleAmount)
  const clientName = String(parcel.cliente_nome || 'Cliente não identificado').trim()
  const reference = String(parcel.receita_titulo || parcel.contrato_titulo || parcel.contrato_numero || 'Conta a receber').trim()
  const document = String(item.documentNumber || parcel.receita_documento || parcel.documento_legado || parcel.contrato_numero || '').trim().slice(0, 100) || null
  const history = [
    'Liquidação via retorno Bradesco',
    document,
    reference,
    clientName,
  ].filter(Boolean).join(' - ')
  const nature = String(parcel.plano_codigo || '1.1').trim().slice(0, 20) || '1.1'
  const account = String(parcel.plano_descricao || 'VENDA DE IMÓVEIS').trim()
  const project = String(parcel.obra_nome || '').trim() || null
  const bankName = String(bankAccount.banco_nome || 'BRADESCO').trim().slice(0, 60)

  let movement = await findExistingLiquidationMovement(client, {
    paymentDate,
    company,
    bankAccount,
  })
  let movementCreated = false

  // O Movimento Bancário pode já ter sido importado pelo extrato como uma
  // liquidação consolidada. Nesse caso, reutilize o movimento existente para
  // vincular as parcelas e não duplique a entrada financeira.
  if (!movement) {
    const { rows: [insertedMovement] } = await client.query(
      `INSERT INTO fin_movimento
        (data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
         conta_contabil, centro_custo, obra, natureza_financeira,
         dia, mes, ano, tipo_lancamento, vencimento, banco_conta_id)
       VALUES
        ($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'financeiro',$15,$16)
       RETURNING id, data, empresa, banco, entradas, historico, banco_conta_id`,
      [paymentDate, company, bankName, paidValue, clientName, history, document, account, project, project, nature, day, month, year, parcel.vencimento, bankAccount.id],
    )
    movement = insertedMovement
    movementCreated = true
  }

  const reconciliation = {
    origem: 'retorno_bradesco_cnab400',
    arquivo: filename,
    movimento_id: movement.id,
    movimento_reutilizado: !movementCreated,
    banco_conta_id: bankAccount.id,
    banco: bankName,
    empresa: company,
    nosso_numero: item.nossoNumero,
    nosso_numero_dv: item.nossoNumeroDv,
    controle_participante: item.participantControl || null,
    ocorrencia: item.occurrence,
    data_ocorrencia: item.occurrenceDate,
    data_credito: item.creditDate,
    data_baixa: paymentDate,
    data_recebimento_sistema: paymentDate,
    valor_titulo: roundMoney(item.titleAmount),
    valor_pago: paidValue,
    valor_juros: roundMoney(item.interestAmount),
    usuario_id: userId || null,
  }

  const { rows: [updated] } = await client.query(
    `UPDATE com_parcelas
        SET status='paga',
            pago_em=$1::date,
            valor_pago=$2,
            forma_pagamento='Boleto',
            observacoes_baixa=COALESCE(observacoes_baixa,'') || CASE WHEN COALESCE(observacoes_baixa,'')='' THEN '' ELSE E'\n' END || $3,
            movimento_id=$4,
            origem_baixa='retorno_bradesco',
            conciliado_em=NOW(),
            boleto_status='liquidado',
            conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $5::jsonb,
            updated_at=NOW()
      WHERE id=$6::uuid AND tenant_id=$7
      RETURNING id, status, pago_em, valor_pago, movimento_id`,
    [paymentDate, paidValue, `Retorno ${filename} — crédito bancário ${item.creditDate || 'não informado'}`, movement.id, JSON.stringify(reconciliation), parcel.id, tenantId],
  )

  return { movement, parcel: updated, paidValue, movementCreated }
}


function normalizeReceiptDate(value) {
  const text = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function loadPersistedReturnResult(client, { tenantId, returnId }) {
  const { rows: [batch] } = await client.query(
    `SELECT
       r.*,
       (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS data_processamento,
       COALESCE(u.name, u.email, 'Usuário não identificado') AS processado_por_nome
     FROM fin_retornos_cobranca r
     LEFT JOIN hub_users u ON u.id=r.processado_por
     WHERE r.id=$1 AND r.tenant_id=$2
     LIMIT 1`,
    [returnId, tenantId],
  )

  if (!batch) return null

  const { rows } = await client.query(
    `SELECT
       i.*,
       p.pago_em::date::text AS data_recebimento,
       p.numero AS parcela_numero,
       p.parcela_numero_legado,
       p.parcela_total_legado,
       p.status AS parcela_status,
       p.movimento_id AS parcela_movimento_id,
       c.numero AS contrato,
       COALESCE(cp.nome, cp.razao_social, c.comprador_nome, i.dados #>> '{relatorio_strato,cliente_nome}') AS cliente,
       fm.data::text AS movimento_data
     FROM fin_retornos_cobranca_itens i
     LEFT JOIN com_parcelas p ON p.id=i.parcela_id AND p.tenant_id=i.tenant_id
     LEFT JOIN com_contratos c ON c.id=p.contrato_id AND c.tenant_id=i.tenant_id
     LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
     LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
     LEFT JOIN fin_movimento fm ON fm.id=COALESCE(i.movimento_id,p.movimento_id)
     WHERE i.retorno_id=$1 AND i.tenant_id=$2
     ORDER BY i.id`,
    [returnId, tenantId],
  )

  const batchData = safeObject(batch.dados)
  const savedSummary = safeObject(batchData.resumo)
  const reportMetadata = Array.isArray(batchData.relatorios_strato) ? batchData.relatorios_strato : []
  const items = rows.map(row => {
    const data = safeObject(row.dados)
    const report = safeObject(data.relatorio_strato)
    const parcelNumber = row.parcela_numero_legado || row.parcela_numero || null
    const parcelTotal = row.parcela_total_legado || null
    return {
      linha: Number(data.lineNumber || row.id),
      empresa: row.empresa || batch.empresa || null,
      ocorrencia: row.ocorrencia || '',
      ocorrencia_descricao: row.ocorrencia_descricao || '',
      nosso_numero: row.nosso_numero || null,
      nosso_numero_dv: row.nosso_numero_dv || null,
      controle_participante: row.controle_participante || null,
      documento: data.documentNumber || null,
      vencimento: row.data_vencimento || data.dueDate || null,
      data_ocorrencia: row.data_ocorrencia || data.occurrenceDate || null,
      data_credito: row.data_credito || data.creditDate || null,
      data_recebimento: row.data_recebimento || row.movimento_data || batchData.data_recebimento_padrao || batch.data_processamento || null,
      valor_titulo: roundMoney(row.valor_titulo),
      valor_pago: roundMoney(row.valor_pago),
      valor_juros: roundMoney(row.valor_juros),
      valor_desconto: roundMoney(row.valor_desconto),
      parcela_id: row.parcela_id || null,
      parcela_numero: parcelNumber,
      parcela_total: parcelTotal,
      contrato: row.contrato || null,
      cliente: row.cliente || null,
      metodo_conciliacao: row.metodo_conciliacao || null,
      confianca_conciliacao: data.confianca_conciliacao || null,
      relatorio_strato: Object.keys(report).length ? report : null,
      movimento_id: row.movimento_id || row.parcela_movimento_id || null,
      divergencia_valor: row.divergencia_valor == null ? null : roundMoney(row.divergencia_valor),
      status_processamento: row.status_processamento || 'nao_localizado',
    }
  })

  const uniqueMovements = new Set(items.map(item => String(item.movimento_id || '')).filter(Boolean))
  const liquidations = items.filter(item => item.ocorrencia === '06')
  const located = items.filter(item => item.parcela_id)
  const notLocated = items.filter(item => !item.parcela_id)
  const paid = items.filter(item => ['liquidado', 'baixado'].includes(item.status_processamento))
  const alreadyPaid = items.filter(item => item.status_processamento === 'ja_baixado')
  const reportMatched = items.filter(item => String(item.metodo_conciliacao || '').startsWith('relatorio_strato_') && item.parcela_id)
  const receiptDate = items.find(item => item.data_recebimento)?.data_recebimento
    || batchData.data_recebimento_padrao
    || batch.data_processamento
    || null

  return {
    id: batch.id,
    arquivo: batch.nome_arquivo,
    empresa: batch.empresa || null,
    banco_codigo: batch.banco_codigo || '237',
    banco_conta_id: batch.banco_conta_id || null,
    conta_bancaria_localizada: Boolean(batch.banco_conta_id),
    conta_bancaria_ambigua: false,
    persisted: true,
    preview: false,
    duplicated: true,
    data_arquivo: batch.data_arquivo || null,
    data_recebimento: receiptDate,
    processado_em: batch.created_at || null,
    processado_por: batch.processado_por_nome,
    registros: Number(batch.quantidade_registros || items.length),
    titulos: items.length,
    conciliados: located.length,
    nao_localizados: notLocated.length,
    liquidacoes_encontradas: liquidations.length,
    liquidacoes_prontas: 0,
    liquidacoes_baixadas: paid.length || Number(savedSummary.liquidacoes_baixadas || 0),
    ja_baixadas: alreadyPaid.length || Number(savedSummary.ja_baixadas || 0),
    movimentos_criados: uniqueMovements.size || Number(savedSummary.movimentos_criados || 0),
    movimentos_reutilizados: Number(savedSummary.movimentos_reutilizados || 0),
    valor_liquidado: roundMoney(liquidations.reduce((sum, item) => sum + Number(item.valor_pago || item.valor_titulo || 0), 0)),
    valor_baixado: roundMoney(items.filter(item => item.movimento_id).reduce((sum, item) => sum + Number(item.valor_pago || item.valor_titulo || 0), 0)),
    relatorios_strato_processados: reportMetadata.length,
    conciliados_por_relatorio: reportMatched.length || Number(savedSummary.conciliados_por_relatorio || 0),
    ia_providers: [...new Set(reportMetadata.map(item => item?.provider).filter(Boolean))],
    ocorrencias: items.reduce((acc, item) => {
      acc[item.ocorrencia] = (acc[item.ocorrencia] || 0) + 1
      return acc
    }, {}),
    itens: items,
  }
}

async function processBradescoReturn({
  client,
  tenantId,
  userId = null,
  filename = 'retorno.ret',
  content,
  applyPayment = true,
  persist = true,
  explicitCompany = null,
  maxOccurrenceDate = null,
  repairExisting = true,
  stratoReports = [],
  receiptDate = null,
}) {
  if (!client) throw new Error('Conexão com banco não informada.')
  if (!tenantId) throw new Error('Tenant não informado.')
  const parsed = parseReturn(content)
  const effectivePersist = Boolean(persist && applyPayment)
  const reportMetadata = (stratoReports || []).map(report => ({
    nome_arquivo_relatorio: report.nome_arquivo_relatorio || null,
    arquivo_retorno: report.arquivo_retorno || null,
    provider: report.provider || null,
    titulos: Array.isArray(report.titulos) ? report.titulos.length : 0,
  }))

  let existingBatch = null
  let reprocessingExisting = false
  const { rows: [existing] } = await client.query(
    `SELECT r.*,
            COUNT(ri.id) FILTER (WHERE ri.ocorrencia='06')::int AS liquidacoes_registradas,
            COUNT(ri.id) FILTER (WHERE ri.ocorrencia='06' AND ri.movimento_id IS NULL)::int AS liquidacoes_sem_movimento,
            (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS data_recebimento_upload
       FROM fin_retornos_cobranca r
       LEFT JOIN fin_retornos_cobranca_itens ri ON ri.retorno_id=r.id
      WHERE r.tenant_id=$1 AND r.sha256=$2
      GROUP BY r.id
      LIMIT 1`,
    [tenantId, parsed.sha256],
  )
  if (existing) {
    const needsRepair = Number(existing.liquidacoes_sem_movimento || 0) > 0
    // Arquivo já conhecido sempre devolve o processamento persistido completo,
    // inclusive quando o operador deixou "Baixar liquidações" desmarcado.
    // Reprocessamento somente ocorre no fluxo interno explícito de reparo.
    if (!effectivePersist || !repairExisting || !needsRepair) {
      const persistedResult = await loadPersistedReturnResult(client, { tenantId, returnId: existing.id })
      return persistedResult || {
        duplicated: true,
        persisted: true,
        id: existing.id,
        arquivo: existing.nome_arquivo,
        itens: [],
      }
    }
    existingBatch = existing
    reprocessingExisting = true
  }

  const savedBatchData = safeObject(existingBatch?.dados)
  const effectiveReceiptDate = normalizeReceiptDate(
    savedBatchData.data_recebimento_padrao
      || existingBatch?.data_recebimento_upload
      || receiptDate,
  )

  const context = await inferReturnContext(client, tenantId, parsed, explicitCompany)
  const details = maxOccurrenceDate
    ? parsed.details.filter(item => !item.occurrenceDate || item.occurrenceDate <= maxOccurrenceDate)
    : parsed.details
  const skippedByCutoff = parsed.details.length - details.length

  let batch = existingBatch
  if (effectivePersist && !batch) {
    const { rows: [inserted] } = await client.query(
      `INSERT INTO fin_retornos_cobranca (
         tenant_id, config_id, banco_codigo, nome_arquivo, data_arquivo,
         quantidade_registros, sha256, conteudo, processado_por, baixa_automatica,
         empresa, banco_conta_id, dados
       ) VALUES ($1,$2,'237',$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11::jsonb)
       RETURNING *`,
      [tenantId, context.config?.id || null, filename, parsed.header.fileDate, parsed.recordCount, parsed.sha256, content, userId, context.company, context.bankAccount?.id || null, JSON.stringify({ header: parsed.header, corte_ocorrencia: maxOccurrenceDate || null, relatorios_strato: reportMetadata, data_recebimento_padrao: effectiveReceiptDate })],
    )
    batch = inserted
  } else if (effectivePersist && batch) {
    const { rows: [updatedBatch] } = await client.query(
      `UPDATE fin_retornos_cobranca
          SET config_id=COALESCE($1,config_id),
              empresa=COALESCE($2,empresa),
              banco_conta_id=COALESCE($3,banco_conta_id),
              processado_por=COALESCE($4,processado_por),
              baixa_automatica=TRUE,
              dados=COALESCE(dados,'{}'::jsonb) || $5::jsonb
        WHERE id=$6
        RETURNING *`,
      [context.config?.id || null, context.company, context.bankAccount?.id || null, userId, JSON.stringify({ reprocessado_em: new Date().toISOString(), motivo: 'reparo_de_baixa_sem_movimento', relatorios_strato: reportMetadata, data_recebimento_padrao: effectiveReceiptDate }), batch.id],
    )
    batch = updatedBatch
  }

  const summary = {
    id: batch?.id || null,
    arquivo: filename,
    empresa: context.company,
    banco_conta_id: context.bankAccount?.id || null,
    conta_bancaria_localizada: Boolean(context.bankAccount),
    conta_bancaria_ambigua: context.bankAccountAmbiguous,
    persisted: effectivePersist,
    preview: !effectivePersist,
    reprocessado: reprocessingExisting,
    data_recebimento: effectiveReceiptDate,
    registros: parsed.recordCount,
    titulos: details.length,
    ignorados_por_corte: skippedByCutoff,
    conciliados: 0,
    nao_localizados: 0,
    liquidacoes_encontradas: 0,
    liquidacoes_prontas: 0,
    liquidacoes_baixadas: 0,
    ja_baixadas: 0,
    movimentos_criados: 0,
    movimentos_reutilizados: 0,
    valor_liquidado: 0,
    valor_baixado: 0,
    relatorios_strato_processados: reportMetadata.length,
    conciliados_por_relatorio: 0,
    ia_providers: [...new Set(reportMetadata.map(item => item.provider).filter(Boolean))],
    ocorrencias: {},
    itens: [],
  }

  const usedParcelIds = new Set()
  const usedReportRows = new Set()
  const matchedKeys = new Map()

  for (const item of details) {
    summary.ocorrencias[item.occurrence] = (summary.ocorrencias[item.occurrence] || 0) + 1
    const itemKey = item.nossoNumero
      ? `nosso:${item.nossoNumero}`
      : (item.participantControl ? `controle:${item.participantControl}` : null)
    let matched = null

    if (itemKey && matchedKeys.has(itemKey)) {
      const repeatedParcel = await loadParcelById(client, {
        tenantId,
        company: context.company,
        item,
        parcelId: matchedKeys.get(itemKey),
        forUpdate: effectivePersist,
      })
      if (repeatedParcel) matched = { parcel: repeatedParcel, method: 'mesmo_titulo_no_arquivo' }
    }

    if (!matched) {
      matched = await findParcelForReturn(client, {
        tenantId,
        company: context.company,
        item,
        forUpdate: effectivePersist,
        excludedParcelIds: usedParcelIds,
        stratoReports,
        usedReportRows,
      })
    }
    const parcel = matched?.parcel || null
    if (parcel) {
      usedParcelIds.add(String(parcel.id))
      if (itemKey) matchedKeys.set(itemKey, String(parcel.id))
      if (String(matched?.method || '').startsWith('relatorio_strato_')) summary.conciliados_por_relatorio += 1
      if (effectivePersist && matched?.reportItem) {
        await persistStratoReportData(client, tenantId, parcel.id, matched.reportItem, matched.report, matched.confidence)
      }
    }
    let status = parcel ? 'localizado' : 'nao_localizado'
    let movementId = null
    let valueDifference = parcel ? roundMoney(Number(parcel.valor_atual || 0) - Number(item.titleAmount || 0)) : null

    if (parcel) {
      summary.conciliados += 1
      if (item.occurrence === '06') {
        summary.liquidacoes_encontradas += 1
        summary.valor_liquidado = roundMoney(summary.valor_liquidado + roundMoney(item.paidAmount || item.titleAmount))
      }

      const repairableLegacyReturn = String(parcel.status || '').toLowerCase() === 'paga'
        && !parcel.movimento_id
        && String(parcel.origem_baixa || '').toLowerCase() === 'retorno_bradesco'
      const alreadyPaid = Boolean(parcel.movimento_id)
        || (String(parcel.status || '').toLowerCase() === 'paga' && !repairableLegacyReturn)
      if (item.occurrence === '06' && alreadyPaid) {
        status = 'ja_baixado'
        summary.ja_baixadas += 1
        movementId = parcel.movimento_id || null
      } else if (item.occurrence === '06' && !context.bankAccount) {
        status = context.bankAccountAmbiguous ? 'conta_bancaria_ambigua' : 'conta_bancaria_nao_localizada'
      } else if (item.occurrence === '06') {
        summary.liquidacoes_prontas += 1
        if (effectivePersist) {
          await persistReturnIdentifiers(client, tenantId, parcel.id, item)
          const paid = await createMovementAndPay(client, {
            tenantId,
            userId,
            filename,
            parsed,
            item,
            parcel,
            bankAccount: context.bankAccount,
            company: context.company,
            receiptDate: effectiveReceiptDate,
          })
          status = 'liquidado'
          movementId = paid.movement.id
          summary.liquidacoes_baixadas += 1
          if (paid.movementCreated) summary.movimentos_criados += 1
          else summary.movimentos_reutilizados += 1
          summary.valor_baixado = roundMoney(summary.valor_baixado + paid.paidValue)
        } else {
          const existingMovement = await findExistingLiquidationMovement(client, {
            paymentDate: effectiveReceiptDate || item.occurrenceDate || parsed.header.fileDate || item.creditDate,
            company: context.company,
            bankAccount: context.bankAccount,
          })
          if (existingMovement) {
            status = 'pronto_para_baixa_movimento_existente'
            movementId = existingMovement.id
            summary.movimentos_reutilizados += 1
          } else {
            status = 'pronto_para_baixa'
            summary.movimentos_criados += 1
          }
        }
      } else if (item.occurrence === '02') {
        status = 'entrada_confirmada'
        if (effectivePersist) {
          await persistReturnIdentifiers(client, tenantId, parcel.id, item)
          await client.query(`UPDATE com_parcelas SET boleto_status='registrado', updated_at=NOW() WHERE id=$1::uuid`, [parcel.id])
        }
      } else if (item.occurrence === '03') {
        status = 'rejeitado'
        if (effectivePersist) await client.query(`UPDATE com_parcelas SET boleto_status='rejeitado', updated_at=NOW() WHERE id=$1::uuid`, [parcel.id])
      } else if (['09', '10'].includes(item.occurrence)) {
        status = 'baixado_banco'
        if (effectivePersist) {
          await persistReturnIdentifiers(client, tenantId, parcel.id, item)
          await client.query(`UPDATE com_parcelas SET boleto_status='baixado_banco', updated_at=NOW() WHERE id=$1::uuid`, [parcel.id])
        }
      } else {
        status = 'localizado_sem_acao'
      }
    } else {
      summary.nao_localizados += 1
      if (!context.company) status = 'empresa_nao_identificada'
    }

    const itemResult = {
      linha: item.lineNumber,
      empresa: context.company,
      ocorrencia: item.occurrence,
      ocorrencia_descricao: item.occurrenceLabel,
      nosso_numero: item.nossoNumero,
      nosso_numero_dv: item.nossoNumeroDv,
      controle_participante: item.participantControl || null,
      documento: item.documentNumber,
      vencimento: item.dueDate,
      data_ocorrencia: item.occurrenceDate,
      data_credito: item.creditDate,
      data_recebimento: item.occurrence === '06' ? (effectiveReceiptDate || item.occurrenceDate || parsed.header.fileDate || item.creditDate) : null,
      valor_titulo: roundMoney(item.titleAmount),
      valor_pago: roundMoney(item.paidAmount),
      parcela_id: parcel?.id || null,
      parcela_numero: parcel?.parcela_numero_legado || parcel?.numero || null,
      parcela_total: parcel?.parcela_total_legado || null,
      contrato: parcel?.contrato_numero || null,
      cliente: parcel?.cliente_nome || null,
      metodo_conciliacao: matched?.method || null,
      confianca_conciliacao: matched?.confidence || null,
      relatorio_strato: matched?.reportItem ? {
        arquivo: matched.report?.nome_arquivo_relatorio || null,
        arquivo_retorno: matched.report?.arquivo_retorno || null,
        provider: matched.report?.provider || null,
        boleto: matched.reportItem.boleto || null,
        obra: matched.reportItem.obra || null,
        unidade: matched.reportItem.unidade || null,
        parcela: matched.reportItem.parcela || null,
        cliente_codigo: matched.reportItem.cliente_codigo || null,
        cliente_nome: matched.reportItem.cliente_nome || null,
        vencimento: matched.reportItem.vencimento || null,
        valor_titulo: matched.reportItem.valor_titulo,
        data_pagamento: matched.reportItem.data_pagamento || null,
        valor_pago: matched.reportItem.valor_pago,
      } : null,
      divergencia_valor: valueDifference,
      movimento_id: movementId,
      status_processamento: status,
    }
    summary.itens.push(itemResult)

    if (effectivePersist) {
      const itemParams = [batch.id, tenantId, parcel?.id || null, parcel?.remessa_item_id || null, item.nossoNumero, item.nossoNumeroDv, item.participantControl || null, item.occurrence, item.occurrenceLabel, item.occurrenceDate, item.creditDate, item.dueDate, item.titleAmount, item.paidAmount, item.interestAmount, item.discount, item.rejectionReasons, status, JSON.stringify({ ...item, relatorio_strato: matched?.reportItem || null, confianca_conciliacao: matched?.confidence || null }), movementId, matched?.method || null, valueDifference, context.company]
      const { rowCount: updatedItemCount } = await client.query(
        `WITH target AS (
           SELECT id
             FROM fin_retornos_cobranca_itens
            WHERE retorno_id=$1
              AND tenant_id=$2
              AND COALESCE(nosso_numero,'')=COALESCE($5,'')
              AND COALESCE(ocorrencia,'')=COALESCE($8,'')
              AND COALESCE(data_ocorrencia::text,'')=COALESCE($10::date::text,'')
            ORDER BY id
            LIMIT 1
         )
         UPDATE fin_retornos_cobranca_itens i
            SET parcela_id=$3,
                remessa_item_id=$4,
                nosso_numero=$5,
                nosso_numero_dv=$6,
                controle_participante=$7,
                ocorrencia_descricao=$9,
                data_credito=$11,
                data_vencimento=$12,
                valor_titulo=$13,
                valor_pago=$14,
                valor_juros=$15,
                valor_desconto=$16,
                motivos_rejeicao=$17,
                status_processamento=$18,
                dados=$19::jsonb,
                movimento_id=$20,
                metodo_conciliacao=$21,
                divergencia_valor=$22,
                empresa=$23
           FROM target
          WHERE i.id=target.id`,
        itemParams,
      )
      if (!updatedItemCount) {
        await client.query(
          `INSERT INTO fin_retornos_cobranca_itens (
             retorno_id, tenant_id, parcela_id, remessa_item_id,
             nosso_numero, nosso_numero_dv, controle_participante,
             ocorrencia, ocorrencia_descricao, data_ocorrencia, data_credito,
             data_vencimento, valor_titulo, valor_pago, valor_juros,
             valor_desconto, motivos_rejeicao, status_processamento, dados,
             movimento_id, metodo_conciliacao, divergencia_valor, empresa
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23
           )`,
          itemParams,
        )
      }
    }
  }

  if (effectivePersist) {
    await client.query(
      `UPDATE fin_retornos_cobranca
          SET quantidade_conciliada=$1,
              quantidade_nao_localizada=$2,
              valor_liquidado=$3,
              dados=COALESCE(dados,'{}'::jsonb) || $4::jsonb
        WHERE id=$5`,
      [summary.conciliados, summary.nao_localizados, summary.valor_baixado, JSON.stringify({ resumo: { liquidacoes_encontradas: summary.liquidacoes_encontradas, liquidacoes_baixadas: summary.liquidacoes_baixadas, ja_baixadas: summary.ja_baixadas, movimentos_criados: summary.movimentos_criados, valor_baixado: summary.valor_baixado, movimentos_reutilizados: summary.movimentos_reutilizados, relatorios_strato_processados: summary.relatorios_strato_processados, conciliados_por_relatorio: summary.conciliados_por_relatorio, ia_providers: summary.ia_providers } }), batch.id],
    )
  }

  return summary
}

module.exports = {
  processBradescoReturn,
  findParcelForReturn,
  inferReturnContext,
  normalizeCompany,
  expectedParcelType,
  documentFraction,
  roundMoney,
  loadPersistedReturnResult,
}
