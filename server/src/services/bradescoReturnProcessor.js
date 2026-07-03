/**
 * Conciliação de retorno Bradesco CNAB 400 com recebíveis importados do Strato.
 * v0.3.84
 *
 * Pontos importantes:
 * - o identificador do participante do retorno corresponde ao ts1_core.core1_cod;
 * - o contrato importado no HUB usa o prefixo STR-<vend1_cod>-...;
 * - uma prévia nunca grava o arquivo nem altera parcelas;
 * - a liquidação cria o Movimento Bancário e vincula movimento_id à parcela;
 * - a data contábil da baixa é a data da ocorrência, enquanto a data de crédito
 *   permanece registrada nos metadados da conciliação.
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
    p.receita_id,
    c.id AS contrato_id,
    c.numero AS contrato_numero,
    c.titulo AS contrato_titulo,
    c.obra_codigo_legado AS contrato_obra_codigo,
    ${billingCompanySql('p', 'c')} AS empresa_cobranca,
    COALESCE(cp.nome, cp.razao_social, c.comprador_nome, 'Cliente não identificado') AS cliente_nome,
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

async function findParcelForReturn(client, { tenantId, company, item, forUpdate = false, excludedParcelIds = null }) {
  if (!company) return null
  const options = { client, tenantId, company, item, forUpdate, excludedParcelIds }
  return (
    await matchByStoredIdentifiers(client, options)
    || await matchByLegacyStrato(client, options)
    || await matchBySafeFallback(client, options)
  )
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

async function createMovementAndPay(client, { tenantId, userId, filename, parsed, item, parcel, bankAccount, company }) {
  const paymentDate = item.occurrenceDate || parsed.header.fileDate || item.creditDate
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
}) {
  if (!client) throw new Error('Conexão com banco não informada.')
  if (!tenantId) throw new Error('Tenant não informado.')
  const parsed = parseReturn(content)
  const effectivePersist = Boolean(persist && applyPayment)

  let existingBatch = null
  let reprocessingExisting = false
  if (effectivePersist) {
    const { rows: [existing] } = await client.query(
      `SELECT r.*,
              COUNT(ri.id) FILTER (WHERE ri.ocorrencia='06')::int AS liquidacoes_registradas,
              COUNT(ri.id) FILTER (WHERE ri.ocorrencia='06' AND ri.movimento_id IS NULL)::int AS liquidacoes_sem_movimento
         FROM fin_retornos_cobranca r
         LEFT JOIN fin_retornos_cobranca_itens ri ON ri.retorno_id=r.id
        WHERE r.tenant_id=$1 AND r.sha256=$2
        GROUP BY r.id
        LIMIT 1`,
      [tenantId, parsed.sha256],
    )
    if (existing) {
      const needsRepair = Number(existing.liquidacoes_sem_movimento || 0) > 0
      if (!repairExisting || !needsRepair) {
        return { duplicated: true, persisted: true, id: existing.id, arquivo: existing.nome_arquivo, existing }
      }
      existingBatch = existing
      reprocessingExisting = true
    }
  }

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
      [tenantId, context.config?.id || null, filename, parsed.header.fileDate, parsed.recordCount, parsed.sha256, content, userId, context.company, context.bankAccount?.id || null, JSON.stringify({ header: parsed.header, corte_ocorrencia: maxOccurrenceDate || null })],
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
      [context.config?.id || null, context.company, context.bankAccount?.id || null, userId, JSON.stringify({ reprocessado_em: new Date().toISOString(), motivo: 'reparo_de_baixa_sem_movimento' }), batch.id],
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
    ocorrencias: {},
    itens: [],
  }

  const usedParcelIds = new Set()
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
      })
    }
    const parcel = matched?.parcel || null
    if (parcel) {
      usedParcelIds.add(String(parcel.id))
      if (itemKey) matchedKeys.set(itemKey, String(parcel.id))
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
          })
          status = 'liquidado'
          movementId = paid.movement.id
          summary.liquidacoes_baixadas += 1
          if (paid.movementCreated) summary.movimentos_criados += 1
          else summary.movimentos_reutilizados += 1
          summary.valor_baixado = roundMoney(summary.valor_baixado + paid.paidValue)
        } else {
          const existingMovement = await findExistingLiquidationMovement(client, {
            paymentDate: item.occurrenceDate || parsed.header.fileDate || item.creditDate,
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
      valor_titulo: roundMoney(item.titleAmount),
      valor_pago: roundMoney(item.paidAmount),
      parcela_id: parcel?.id || null,
      contrato: parcel?.contrato_numero || null,
      cliente: parcel?.cliente_nome || null,
      metodo_conciliacao: matched?.method || null,
      divergencia_valor: valueDifference,
      movimento_id: movementId,
      status_processamento: status,
    }
    summary.itens.push(itemResult)

    if (effectivePersist) {
      const itemParams = [batch.id, tenantId, parcel?.id || null, parcel?.remessa_item_id || null, item.nossoNumero, item.nossoNumeroDv, item.participantControl || null, item.occurrence, item.occurrenceLabel, item.occurrenceDate, item.creditDate, item.dueDate, item.titleAmount, item.paidAmount, item.interestAmount, item.discount, item.rejectionReasons, status, JSON.stringify(item), movementId, matched?.method || null, valueDifference, context.company]
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
      [summary.conciliados, summary.nao_localizados, summary.valor_baixado, JSON.stringify({ resumo: { liquidacoes_encontradas: summary.liquidacoes_encontradas, liquidacoes_baixadas: summary.liquidacoes_baixadas, ja_baixadas: summary.ja_baixadas, movimentos_criados: summary.movimentos_criados, valor_baixado: summary.valor_baixado, movimentos_reutilizados: summary.movimentos_reutilizados } }), batch.id],
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
}
