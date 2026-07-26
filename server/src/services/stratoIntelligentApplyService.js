/**
 * Aplicação transacional da análise inteligente Strato — v0.8.2.
 *
 * Regras de segurança:
 * - a conferência do operador é a confirmação final dos valores exibidos;
 * - a seleção é reencontrada por parcela, nosso número, cliente e fração;
 * - parcelas são bloqueadas com FOR UPDATE antes da alteração;
 * - cada parcela cria seu próprio Movimento Bancário;
 * - cliente/contrato ausentes não são criados sem dados cadastrais completos;
 * - a execução é idempotente pelo hash do retorno e pelos vínculos persistidos.
 */

const crypto = require('crypto')
const {
  inferReturnContext,
  expectedParcelType,
  roundMoney,
  loadPersistedReturnResult,
} = require('./bradescoReturnProcessor')

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function asMoney(value) {
  return roundMoney(Number(value || 0))
}

function isoDate(value) {
  if (!value) return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

function fraction(value) {
  const match = String(value || '').match(/(\d{1,4})\s*\/\s*(\d{1,4})/)
  return match ? { number: Number(match[1]), total: Number(match[2]) } : null
}

function selectionPart(value) {
  return encodeURIComponent(String(value ?? '').trim().toLowerCase())
}

function parcelSelectionIdentity(analysisItem, parcelAnalysis) {
  const row = parcelAnalysis?.relatorio || {}
  return String(parcelAnalysis?.parcela?.id || [
    row.obra || '',
    row.unidade || '',
    row.parcela || '',
    row.boleto || analysisItem?.boleto || '',
  ].join('|')).trim().toLowerCase()
}

function stableSelectionKey(filename, analysisItem, parcelAnalysis) {
  return [
    'v2',
    selectionPart(filename),
    selectionPart(analysisItem?.linha ?? ''),
    selectionPart(parcelSelectionIdentity(analysisItem, parcelAnalysis)),
  ].join('|')
}

function decodeSelectionPart(value) {
  try {
    return decodeURIComponent(String(value || '')).trim().toLowerCase()
  } catch {
    return String(value || '').trim().toLowerCase()
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeFilename(value) {
  const decoded = decodeSelectionPart(value)
  const dot = decoded.lastIndexOf('.')
  const extension = dot >= 0 ? decoded.slice(dot) : ''
  const basename = dot >= 0 ? decoded.slice(0, dot) : decoded
  return `${basename.replace(/(?:\s*\(\d+\))+$/g, '').trim()}${extension}`
}

function fractionsEquivalent(left, right) {
  if (!left || !right || !left.number || !left.total || !right.number || !right.total) return false
  return Number(left.number) * Number(right.total) === Number(right.number) * Number(left.total)
}

function bankIdentifierEquivalent(left, right) {
  const a = onlyDigits(left)
  const b = onlyDigits(right)
  if (!a || !b) return false
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  return a.length < b.length ? b.startsWith(a) : a.startsWith(b)
}

function parseStableSelectionKey(key) {
  const parts = String(key || '').split('|')
  if (parts.length !== 4 || parts[0] !== 'v2') return null
  return {
    key: String(key),
    filename: decodeSelectionPart(parts[1]),
    line: decodeSelectionPart(parts[2]),
    identity: decodeSelectionPart(parts[3]),
  }
}

function normalizeSelectionDescriptor(selection, index = 0) {
  const payload = selection && typeof selection === 'object' ? selection : {}
  const key = typeof selection === 'string' ? selection : String(payload.key || '')
  const parsed = parseStableSelectionKey(key)
  const parsedIdentity = String(parsed?.identity || '').trim().toLowerCase()
  const explicitParcelId = String(payload.parcela_id || payload.parcel_id || '').trim().toLowerCase()
  const parcelId = explicitParcelId || (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(parsedIdentity) ? parsedIdentity : '')
  const fractionValue = payload.parcela_nome || payload.fracao || ''

  return {
    token: `${index}:${key || 'selection'}`,
    key,
    filename: normalizeFilename(payload.arquivo || payload.filename || parsed?.filename || ''),
    line: String(payload.linha_retorno ?? payload.linha ?? parsed?.line ?? '').trim(),
    identity: String(payload.identidade || parsedIdentity || '').trim().toLowerCase(),
    parcelId,
    nossoNumero: onlyDigits(payload.nosso_numero || payload.boleto || ''),
    clienteNome: normalizeText(payload.cliente_nome || payload.cliente || ''),
    parcelaNome: String(fractionValue || '').trim(),
    parcelaFracao: fraction(fractionValue),
    obra: normalizeText(payload.obra || ''),
    unidade: normalizeText(payload.unidade || ''),
    // O frontend envia os índices exatos aprovados na tela. Eles são a
    // referência primária na aplicação; a linha física do CNAB é apenas dado
    // bancário e pode variar conforme o parser/cabeçalho.
    itemIndex: Number.isInteger(Number(payload.item)) ? Number(payload.item) : null,
    parcelIndex: Number.isInteger(Number(payload.parcela)) ? Number(payload.parcela) : null,
    jurosAjustados: asMoney(payload.juros_ajustados),
    descontoAjustado: asMoney(payload.desconto_ajustado),
  }
}

function analysisSelectionDescriptor(filename, analysisItem, parcelAnalysis) {
  const row = parcelAnalysis?.relatorio || {}
  const parcelId = String(parcelAnalysis?.parcela?.id || '').trim().toLowerCase()
  return {
    key: stableSelectionKey(filename, analysisItem, parcelAnalysis),
    filename: normalizeFilename(filename),
    line: String(analysisItem?.linha ?? '').trim(),
    identity: parcelSelectionIdentity(analysisItem, parcelAnalysis),
    parcelId,
    nossoNumero: onlyDigits(analysisItem?.boleto || row.boleto || ''),
    clienteNome: normalizeText(row.cliente_nome || parcelAnalysis?.cliente?.nome || ''),
    parcelaNome: String(row.parcela || '').trim(),
    parcelaFracao: fraction(row.parcela),
    obra: normalizeText(row.obra || ''),
    unidade: normalizeText(row.unidade || ''),
  }
}

function selectionMatchesParcel(selection, current) {
  if (!selection || !current) return false
  if (selection.key && selection.key === current.key) return true
  if (selection.parcelId && current.parcelId && selection.parcelId === current.parcelId) return true
  if (selection.identity && current.identity && selection.identity === current.identity) return true

  if (selection.filename && current.filename && selection.filename !== current.filename) return false
  if (!selection.nossoNumero || !selection.clienteNome || !selection.parcelaFracao) return false
  if (!bankIdentifierEquivalent(selection.nossoNumero, current.nossoNumero)) return false
  if (selection.clienteNome !== current.clienteNome) return false
  if (!fractionsEquivalent(selection.parcelaFracao, current.parcelaFracao)) return false
  if (selection.obra && current.obra && selection.obra !== current.obra) return false
  if (selection.unidade && current.unidade && selection.unidade !== current.unidade) return false
  return true
}

function resolveSelectionDescriptor({
  descriptors,
  consumedSelections,
  filename,
  analysisItem,
  parcelAnalysis,
}) {
  const current = analysisSelectionDescriptor(filename, analysisItem, parcelAnalysis)
  const available = descriptors.filter(entry => !consumedSelections.has(entry.token))
  const exact = available.find(entry => entry.key && entry.key === current.key)
  if (exact) return exact
  const byParcel = available.find(entry => entry.parcelId && current.parcelId && entry.parcelId === current.parcelId)
  if (byParcel) return byParcel
  const byIdentity = available.find(entry => entry.identity && entry.identity === current.identity)
  if (byIdentity) return byIdentity
  const composite = available.filter(entry => selectionMatchesParcel(entry, current))
  if (composite.length === 1) return composite[0]

  // A tela de conferência pode ter sido aberta com uma análise anterior e o
  // backend recalcula a mesma linha antes de aplicar. Quando a parcela candidata
  // muda entre as duas análises, a linha do retorno continua sendo a referência
  // estável aprovada pelo operador. Aceita a seleção quando existe somente uma
  // seleção pendente para a mesma linha/arquivo.
  const sameLine = available.filter(entry => {
    if (!entry.line || !current.line || entry.line !== current.line) return false
    if (entry.filename && current.filename && entry.filename !== current.filename) return false
    return true
  })
  return sameLine.length === 1 ? sameLine[0] : null
}

function eligibleAction(parcelAnalysis) {
  return [
    'BAIXAR_PARCELA',
    'ATUALIZAR_E_BAIXAR',
    'CRIAR_PARCELA_E_BAIXAR',
    'ATUALIZAR_RECEBIMENTO_EXISTENTE',
  ].includes(String(parcelAnalysis?.acao_proposta || ''))
}

function hardBlocked(parcelAnalysis) {
  return [
    'CLIENTE_AUSENTE', 'CLIENTE_AMBIGUO',
    'CONTRATO_AUSENTE', 'CONTRATO_AMBIGUO',
    'PARCELA_AMBIGUA',
  ].includes(String(parcelAnalysis?.classificacao || ''))
}

function appendNote(current, note) {
  const before = String(current || '').trim()
  return before ? `${before}\n${note}` : note
}

function movementHash({ tenantId, returnHash, line, parcelId }) {
  return crypto.createHash('sha256')
    .update(`${tenantId}|${returnHash}|${line}|${parcelId}|strato-ai-0.6.6`)
    .digest('hex')
}

async function ensureBatch(client, {
  tenantId, userId, filename, content, parsed, context, reportMetadata,
}) {
  const { rows: [existing] } = await client.query(
    `SELECT * FROM fin_retornos_cobranca
      WHERE tenant_id=$1 AND sha256=$2
      LIMIT 1
      FOR UPDATE`,
    [tenantId, parsed.sha256],
  )
  if (existing) return existing

  const receiptDate = null
  const { rows: [batch] } = await client.query(
    `INSERT INTO fin_retornos_cobranca (
       tenant_id, config_id, banco_codigo, nome_arquivo, data_arquivo,
       quantidade_registros, sha256, conteudo, processado_por, baixa_automatica,
       empresa, banco_conta_id, dados
     ) VALUES ($1,$2,'237',$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11::jsonb)
     RETURNING *`,
    [
      tenantId,
      context.config?.id || null,
      filename,
      parsed.header?.fileDate || null,
      parsed.recordCount || parsed.details?.length || 0,
      parsed.sha256,
      content,
      userId || null,
      context.company,
      context.bankAccount?.id || null,
      JSON.stringify({
        header: parsed.header || {},
        relatorios_strato: reportMetadata,
        fluxo_inteligente: { versao: '0.7.2', criado_em: new Date().toISOString() },
        data_recebimento_padrao: receiptDate,
      }),
    ],
  )
  return batch
}

async function ensureReturnItem(client, {
  batch, tenantId, company, returnItem, analysisItem,
}) {
  const line = Number(returnItem?.lineNumber || analysisItem?.linha || 0)
  const { rows: [existing] } = await client.query(
    `SELECT * FROM fin_retornos_cobranca_itens
      WHERE retorno_id=$1 AND tenant_id=$2
        AND CASE
              WHEN COALESCE(dados->>'lineNumber','') ~ '^[0-9]+$'
                THEN (dados->>'lineNumber')::int
              ELSE 0
            END = $3
      ORDER BY id
      LIMIT 1
      FOR UPDATE`,
    [batch.id, tenantId, line],
  )
  if (existing) return existing

  const { rows: [inserted] } = await client.query(
    `INSERT INTO fin_retornos_cobranca_itens (
       retorno_id, tenant_id, parcela_id, remessa_item_id,
       nosso_numero, nosso_numero_dv, controle_participante,
       ocorrencia, ocorrencia_descricao, data_ocorrencia, data_credito,
       data_vencimento, valor_titulo, valor_pago, valor_juros,
       valor_desconto, motivos_rejeicao, status_processamento, dados,
       movimento_id, metodo_conciliacao, divergencia_valor, empresa
     ) VALUES (
       $1,$2,NULL,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,0,$13,
       'aguarda_revisao',$14::jsonb,NULL,'analise_strato_0_7_2',NULL,$15
     ) RETURNING *`,
    [
      batch.id,
      tenantId,
      returnItem?.nossoNumero || null,
      returnItem?.nossoNumeroDv || null,
      returnItem?.participantControl || null,
      returnItem?.occurrence || null,
      returnItem?.occurrenceLabel || null,
      returnItem?.occurrenceDate || null,
      returnItem?.creditDate || null,
      returnItem?.dueDate || null,
      asMoney(returnItem?.titleAmount),
      asMoney(returnItem?.paidAmount || returnItem?.titleAmount),
      returnItem?.rejectionReasons || null,
      JSON.stringify({
        ...returnItem,
        lineNumber: line,
        analise_inteligente: {
          boleto: analysisItem?.boleto || null,
          quantidade_parcelas: analysisItem?.quantidade_parcelas || 0,
          arquivo_relatorio: analysisItem?.arquivo_relatorio || null,
        },
      }),
      company || null,
    ],
  )
  return inserted
}

async function createMissingParcel(client, { tenantId, parcelAnalysis, analysisItem }) {
  const contractId = parcelAnalysis?.contrato?.id
  if (!contractId) throw new Error('Contrato não localizado; a parcela não pode ser criada automaticamente.')
  const row = parcelAnalysis.relatorio || {}
  const frac = fraction(row.parcela)
  if (!frac || !isoDate(row.vencimento)) {
    throw new Error(`Parcela ${row.parcela || 'sem fração'} sem fração ou vencimento válido.`)
  }

  const { rows: [contract] } = await client.query(
    `SELECT id, numero, codigo_legado, obra_codigo_legado, unidade_codigo_legado
       FROM com_contratos
      WHERE id=$1::uuid AND tenant_id=$2
      FOR UPDATE`,
    [contractId, tenantId],
  )
  if (!contract) throw new Error('Contrato não encontrado durante a aplicação.')

  const { rows: [counter] } = await client.query(
    `SELECT COALESCE(MAX(numero),0)+1 AS numero
       FROM com_parcelas
      WHERE tenant_id=$1 AND contrato_id=$2::uuid`,
    [tenantId, contractId],
  )
  const base = String(contract.codigo_legado || contract.numero || '').replace(/^STR-/i, '').split('-')[0] || 'STRATO'
  const document = `${base} ${String(frac.number).padStart(3, '0')}/${String(frac.total).padStart(3, '0')}`

  const { rows: [parcel] } = await client.query(
    `INSERT INTO com_parcelas (
       tenant_id, contrato_id, numero, tipo, vencimento,
       valor_nominal, valor_correcao, valor_multa, valor_juros_mora,
       valor_desconto, status, documento_legado, documento_base_legado,
       parcela_numero_legado, parcela_total_legado, obra_codigo_legado,
       unidade_codigo_legado, valor_convertido, valor_residuo, valor_moras,
       valor_seguro, valor_juros_financiamento, valor_total_relatorio,
       origem, codigo_legado, dados_adicionais
     ) VALUES (
       $1,$2,$3,$4,$5,$6,0,0,$7,$8,'aberta',$9,$10,$11,$12,$13,$14,
       $6,$15,$16,$17,$18,$19,'strato_retorno',$20,$21::jsonb
     ) RETURNING *`,
    [
      tenantId,
      contractId,
      Number(counter?.numero || 1),
      expectedParcelType(analysisItem?.documento) || 'parcela',
      isoDate(row.vencimento),
      asMoney(parcelAnalysis.valor_nominal),
      asMoney(parcelAnalysis.valor_juros_financeiro) + asMoney(parcelAnalysis.valor_moras),
      asMoney(parcelAnalysis.valor_desconto),
      document,
      base,
      frac.number,
      frac.total,
      Number(row.obra || contract.obra_codigo_legado || 0) || null,
      String(row.unidade || contract.unidade_codigo_legado || '').trim() || null,
      asMoney(parcelAnalysis.valor_residuo),
      asMoney(parcelAnalysis.valor_moras),
      asMoney(parcelAnalysis.valor_seguro),
      asMoney(parcelAnalysis.valor_juros_financeiro),
      asMoney(parcelAnalysis.valor_pago),
      `STRATO-${row.cliente_codigo || ''}-${row.unidade || ''}-${row.parcela || ''}`.slice(0, 120),
      JSON.stringify({
        origem: 'analise_inteligente_strato_0_8_0',
        boleto: analysisItem?.boleto || row.boleto || null,
        criado_em: new Date().toISOString(),
      }),
    ],
  )
  return parcel
}

async function lockParcel(client, { tenantId, parcelId }) {
  const { rows: [parcel] } = await client.query(
    `SELECT p.*,
            c.numero AS contrato_numero,
            c.codigo_legado AS contrato_codigo_legado,
            c.titulo AS contrato_titulo,
            c.obra_codigo_legado AS contrato_obra_codigo,
            c.unidade_codigo_legado AS contrato_unidade_codigo,
            COALESCE(cp.nome,cp.razao_social,c.comprador_nome,'Cliente não identificado') AS cliente_nome,
            COALESCE(obra.nome,'Obra ' || COALESCE(p.obra_codigo_legado::text,c.obra_codigo_legado::text,'')) AS obra_nome,
            r.titulo AS receita_titulo,
            r.numero_documento AS receita_documento,
            pc.codigo AS plano_codigo,
            pc.descricao AS plano_descricao
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
       LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
       LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
       LEFT JOIN fin_receitas r ON r.id=p.receita_id
       LEFT JOIN fin_plano_contas pc ON pc.id=r.plano_conta_id
       LEFT JOIN cad_produtos unidade ON unidade.id=p.produto_id
       LEFT JOIN cad_produtos obra ON obra.id=unidade.produto_pai_id
      WHERE p.id=$1::uuid AND p.tenant_id=$2
      FOR UPDATE OF p`,
    [parcelId, tenantId],
  )
  return parcel || null
}

async function createMovement(client, {
  tenantId, filename, parsed, analysisItem, parcelAnalysis, parcel,
  context, line,
}) {
  const paymentDate = isoDate(analysisItem.data_recebimento || parcelAnalysis.relatorio?.data_pagamento || analysisItem.data_ocorrencia)
  if (!paymentDate) throw new Error(`Data de recebimento não identificada na linha ${line}.`)
  const paidValue = asMoney(parcelAnalysis.valor_pago)
  if (paidValue <= 0) throw new Error(`Valor recebido inválido na parcela ${parcelAnalysis.relatorio?.parcela || ''}.`)
  const hash = movementHash({ tenantId, returnHash: parsed.sha256, line, parcelId: parcel.id })

  // Evita duas requisições concorrentes criarem movimentos para a mesma parcela.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [hash])

  const { rows: [existing] } = await client.query(
    `SELECT * FROM fin_movimento WHERE hash_importacao=$1 LIMIT 1 FOR UPDATE`,
    [hash],
  )
  if (existing) return { movement: existing, created: false, paymentDate }

  const [year, month, day] = paymentDate.split('-').map(Number)
  const clientName = String(parcel.cliente_nome || parcelAnalysis.cliente?.nome || 'Cliente não identificado').trim()
  const reference = String(parcel.receita_titulo || parcel.contrato_titulo || parcel.contrato_numero || 'Conta a receber').trim()
  const document = String(analysisItem.documento || parcel.receita_documento || parcel.documento_legado || parcel.contrato_numero || '').trim().slice(0, 100) || null
  const project = String(parcel.obra_nome || `Obra ${parcel.obra_codigo_legado || parcel.contrato_obra_codigo || ''}`).trim() || null
  const history = [
    'Liquidação via análise inteligente Strato',
    parcelAnalysis.relatorio?.parcela ? `parcela ${parcelAnalysis.relatorio.parcela}` : null,
    document,
    reference,
    clientName,
  ].filter(Boolean).join(' - ')
  const bankName = String(context.bankAccount?.banco_nome || 'BRADESCO').trim().slice(0, 60)

  const { rows: [movement] } = await client.query(
    `INSERT INTO fin_movimento (
       data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
       conta_contabil, centro_custo, obra, natureza_financeira,
       dia, mes, ano, tipo_lancamento, vencimento, banco_conta_id,
       lote_importacao, arquivo_origem, linha_origem, hash_importacao, importado_em
     ) VALUES (
       $1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'financeiro',$15,$16,
       $17,$18,$19,$20,NOW()
     ) RETURNING *`,
    [
      paymentDate,
      context.company,
      bankName,
      paidValue,
      clientName,
      history,
      document,
      String(parcel.plano_descricao || 'VENDA DE IMÓVEIS').trim(),
      project,
      project,
      String(parcel.plano_codigo || '1.1').trim().slice(0, 20),
      day,
      month,
      year,
      parcel.vencimento,
      context.bankAccount.id,
      `CR-STRATO-AI-${paymentDate.replace(/-/g, '')}`,
      filename,
      line,
      hash,
    ],
  )
  return { movement, created: true, paymentDate }
}

async function decideReturnIdentifierPersistence(client, {
  tenantId, parcelId, returnItem, requested,
}) {
  const nossoNumero = String(returnItem?.nossoNumero || '').trim()
  if (!requested || !nossoNumero) {
    return { persist: false, nossoNumero: nossoNumero || null, ownerParcelId: null }
  }

  // O índice uq_com_parcelas_nosso_numero permite apenas uma parcela por
  // tenant para cada nosso número. Em boleto consolidado, várias parcelas
  // compartilham o mesmo identificador bancário; o vínculo das demais fica
  // registrado em fin_retornos_cobranca_item_parcelas e no movimento.
  // A trava consultiva evita corrida entre duas aplicações simultâneas.
  await client.query(
    'SELECT pg_advisory_xact_lock(hashtext($1))',
    [`strato:nosso_numero:${tenantId}:${nossoNumero}`],
  )

  const { rows: [owner] } = await client.query(
    `SELECT id
       FROM com_parcelas
      WHERE tenant_id=$1
        AND nosso_numero=$2
        AND id<>$3::uuid
      LIMIT 1`,
    [tenantId, nossoNumero, parcelId],
  )

  return {
    persist: !owner,
    nossoNumero,
    ownerParcelId: owner?.id || null,
  }
}

async function updateAndPayParcel(client, {
  tenantId, userId, filename, parsed, returnItem, analysisItem,
  parcelAnalysis, parcel, movement, paymentDate, storeIdentifier,
}) {
  const row = parcelAnalysis.relatorio || {}
  const nominal = asMoney(parcel.valor_nominal)
  const discount = asMoney(parcelAnalysis.valor_desconto)
  const jfct = asMoney(parcelAnalysis.valor_juros_financeiro)
  const moras = asMoney(parcelAnalysis.valor_moras)
  const insurance = asMoney(parcelAnalysis.valor_seguro)
  const residue = asMoney(parcelAnalysis.valor_residuo)
  const paid = asMoney(parcelAnalysis.valor_pago)
  const totalInterest = roundMoney(jfct + moras)
  const identifierDecision = await decideReturnIdentifierPersistence(client, {
    tenantId,
    parcelId: parcel.id,
    returnItem,
    requested: Boolean(storeIdentifier),
  })
  const note = `Strato ${filename} — parcela ${row.parcela || parcel.documento_legado || '—'} — juros ajustados ${totalInterest.toFixed(2)} — desconto ajustado ${discount.toFixed(2)} — recebido ${paid.toFixed(2)} em ${paymentDate} — crédito bancário ${analysisItem.data_credito || 'não informado'}`
  const reconciliation = {
    origem: 'analise_inteligente_strato_0_8_0',
    arquivo: filename,
    retorno_sha256: parsed.sha256,
    linha_retorno: analysisItem.linha,
    boleto: analysisItem.boleto,
    parcela_strato: row.parcela || null,
    cliente_strato: row.cliente_nome || parcelAnalysis.cliente?.nome || null,
    data_recebimento: paymentDate,
    data_credito: analysisItem.data_credito || null,
    valor_nominal_preservado: nominal,
    valor_desconto_ajustado: discount,
    valor_juros_financeiro_ajustado: jfct,
    valor_moras_ajustado: moras,
    valor_juros_total_ajustado: totalInterest,
    valor_seguro: insurance,
    valor_residuo: residue,
    valor_recebido: paid,
    movimento_id: Number(movement.id),
    identificador_bancario_anterior: {
      nosso_numero: parcel.nosso_numero || null,
      nosso_numero_dv: parcel.nosso_numero_dv || null,
      controle_participante: parcel.controle_participante || null,
    },
    identificador_bancario_confirmado: storeIdentifier ? {
      nosso_numero: returnItem?.nossoNumero || null,
      nosso_numero_dv: returnItem?.nossoNumeroDv || null,
      boleto_completo: onlyDigits(`${returnItem?.nossoNumero || ''}${returnItem?.nossoNumeroDv || ''}`) || null,
      persistido_nesta_parcela: identifierDecision.persist,
      parcela_principal_identificador: identifierDecision.ownerParcelId || (identifierDecision.persist ? parcel.id : null),
      regra: 'uq_com_parcelas_nosso_numero_multiparcelas_0_8_0',
    } : null,
    usuario_id: userId || null,
    aplicado_em: new Date().toISOString(),
  }

  const { rows: [updated] } = await client.query(
    `UPDATE com_parcelas
        SET valor_juros_financiamento=$1,
            valor_moras=$2,
            valor_juros_mora=$3,
            valor_seguro=$4,
            valor_desconto=$5,
            valor_residuo=$6,
            valor_total_relatorio=$7,
            valor_recalculado=NULL,
            status='paga',
            pago_em=$8::date,
            valor_pago=$7,
            forma_pagamento='Boleto',
            observacoes_baixa=$9,
            movimento_id=$10,
            origem_baixa='retorno_bradesco',
            conciliado_em=NOW(),
            boleto_status='liquidado',
            conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $11::jsonb,
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $12::jsonb,
            nosso_numero=CASE WHEN $13::boolean THEN $14 ELSE nosso_numero END,
            nosso_numero_dv=CASE WHEN $13::boolean THEN $15 ELSE nosso_numero_dv END,
            controle_participante=CASE WHEN $13::boolean THEN COALESCE(controle_participante,NULLIF($16,'')) ELSE controle_participante END,
            updated_at=NOW()
      WHERE id=$17::uuid AND tenant_id=$18
        AND movimento_id IS NULL
        AND LOWER(COALESCE(status,'')) NOT IN ('paga','pago','baixada','baixado','cancelada','cancelado')
      RETURNING *`,
    [
      jfct,
      moras,
      totalInterest,
      insurance,
      discount,
      residue,
      paid,
      paymentDate,
      appendNote(parcel.observacoes_baixa, note),
      movement.id,
      JSON.stringify(reconciliation),
      JSON.stringify({ strato_0_8_0: reconciliation }),
      Boolean(identifierDecision.persist),
      identifierDecision.nossoNumero || null,
      returnItem?.nossoNumeroDv || null,
      returnItem?.participantControl || '',
      parcel.id,
      tenantId,
    ],
  )
  if (!updated) throw new Error(`A parcela ${row.parcela || parcel.id} mudou de estado durante a aplicação.`)
  return updated
}

async function correctExistingPaidParcel(client, {
  tenantId, userId, filename, parsed, returnItem, analysisItem,
  parcelAnalysis, parcel,
}) {
  const movementId = parcel?.movimento_id
  if (!movementId) throw new Error('A parcela recebida não possui Movimento Bancário para corrigir.')

  const { rows: [usage] } = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM com_parcelas
      WHERE tenant_id=$1 AND movimento_id=$2`,
    [tenantId, movementId],
  )
  if (Number(usage?.total || 0) !== 1) {
    throw new Error('O Movimento Bancário está compartilhado por mais de um título e não pode ser corrigido individualmente nesta tela.')
  }

  const { rows: [movement] } = await client.query(
    `SELECT * FROM fin_movimento WHERE id=$1 FOR UPDATE`,
    [movementId],
  )
  if (!movement) throw new Error('O Movimento Bancário vinculado à parcela não foi encontrado.')

  const row = parcelAnalysis.relatorio || {}
  const paymentDate = isoDate(analysisItem.data_recebimento || row.data_pagamento || analysisItem.data_ocorrencia || parcel.pago_em)
  if (!paymentDate) throw new Error('A data de recebimento não foi identificada para corrigir a baixa.')

  const discount = asMoney(parcelAnalysis.valor_desconto)
  const jfct = asMoney(parcelAnalysis.valor_juros_financeiro)
  const moras = asMoney(parcelAnalysis.valor_moras)
  const insurance = asMoney(parcelAnalysis.valor_seguro)
  const residue = asMoney(parcelAnalysis.valor_residuo)
  const paid = asMoney(parcelAnalysis.valor_pago)
  const totalInterest = roundMoney(jfct + moras)
  if (paid <= 0) throw new Error('O valor recebido recalculado é inválido.')

  const [year, month, day] = paymentDate.split('-').map(Number)
  const note = `Correção Strato ${filename} — juros ${totalInterest.toFixed(2)} — desconto ${discount.toFixed(2)} — recebido ${paid.toFixed(2)} em ${paymentDate}`
  const reconciliation = {
    origem: 'correcao_recebimento_strato_0_7_7',
    arquivo: filename,
    retorno_sha256: parsed.sha256,
    linha_retorno: analysisItem.linha,
    boleto: analysisItem.boleto,
    parcela_strato: row.parcela || null,
    data_recebimento: paymentDate,
    data_credito: analysisItem.data_credito || null,
    valor_juros_financeiro_ajustado: jfct,
    valor_moras_ajustado: moras,
    valor_juros_total_ajustado: totalInterest,
    valor_seguro: insurance,
    valor_desconto_ajustado: discount,
    valor_residuo: residue,
    valor_recebido: paid,
    movimento_id: Number(movementId),
    usuario_id: userId || null,
    aplicado_em: new Date().toISOString(),
  }

  const { rows: [updatedMovement] } = await client.query(
    `UPDATE fin_movimento
        SET data=$1::date,
            entradas=$2,
            saidas=0,
            dia=$3,
            mes=$4,
            ano=$5,
            vencimento=$1::date,
            arquivo_origem=COALESCE(NULLIF($6,''),arquivo_origem),
            linha_origem=COALESCE($7,linha_origem),
            historico=CASE
              WHEN COALESCE(historico,'') LIKE '%' || $8 || '%' THEN historico
              WHEN COALESCE(historico,'')='' THEN $8
              ELSE historico || ' | ' || $8
            END
      WHERE id=$9
      RETURNING *`,
    [paymentDate, paid, day, month, year, filename, Number(analysisItem.linha || returnItem?.lineNumber || 0) || null, note, movementId],
  )
  if (!updatedMovement) throw new Error('O Movimento Bancário mudou durante a correção.')

  const { rows: [updatedParcel] } = await client.query(
    `UPDATE com_parcelas
        SET valor_juros_financiamento=$1,
            valor_moras=$2,
            valor_juros_mora=$3,
            valor_seguro=$4,
            valor_desconto=$5,
            valor_residuo=$6,
            valor_total_relatorio=$7,
            valor_recalculado=NULL,
            status='paga',
            pago_em=$8::date,
            valor_pago=$7,
            forma_pagamento='Boleto',
            observacoes_baixa=$9,
            origem_baixa='retorno_bradesco',
            conciliado_em=NOW(),
            boleto_status='liquidado',
            conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $10::jsonb,
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $11::jsonb,
            updated_at=NOW()
      WHERE id=$12::uuid AND tenant_id=$13
        AND movimento_id=$14
        AND LOWER(COALESCE(status,'')) IN ('paga','pago','baixada','baixado')
      RETURNING *`,
    [
      jfct,
      moras,
      totalInterest,
      insurance,
      discount,
      residue,
      paid,
      paymentDate,
      appendNote(parcel.observacoes_baixa, note),
      JSON.stringify(reconciliation),
      JSON.stringify({ strato_0_7_7: reconciliation }),
      parcel.id,
      tenantId,
      movementId,
    ],
  )
  if (!updatedParcel) throw new Error('A parcela mudou durante a correção do recebimento.')

  return { parcel: updatedParcel, movement: updatedMovement, paymentDate }
}

async function upsertRelation(client, {
  tenantId, returnItemId, order, parcelAnalysis, parcelId, movementId,
  analysisItem, status, blocked,
}) {
  const row = parcelAnalysis.relatorio || {}
  const evidence = {
    classificacao: parcelAnalysis.classificacao || null,
    divergencias: parcelAnalysis.divergencias || [],
    confianca: parcelAnalysis.confianca ?? null,
    ajuste_arredondamento: analysisItem.ajuste_arredondamento || null,
  }
  // O banco possui unicidade por (item, ordem) e também por (item, parcela).
  // Reprocessamentos e versões antigas podem ter deixado uma ordem apontando
  // para outra parcela. Limpamos somente os dois conflitos do mesmo item antes
  // de regravar a relação aprovada, mantendo a operação atômica.
  await client.query(
    `DELETE FROM fin_retornos_cobranca_item_parcelas
      WHERE retorno_item_id=$1
        AND (ordem=$2 OR ($3::uuid IS NOT NULL AND parcela_id=$3::uuid))`,
    [returnItemId, order, parcelId || null],
  )

  const { rows: [saved] } = await client.query(
    `INSERT INTO fin_retornos_cobranca_item_parcelas (
       tenant_id, retorno_item_id, parcela_id, movimento_id, ordem,
       fonte, metodo_relacionamento, confianca, obra_codigo, unidade,
       cliente_codigo_legado, cliente_nome, contrato_codigo_legado,
       documento_parcela, controle_participante, vencimento,
       data_recebimento, data_credito, valor_nominal,
       valor_juros_financeiro, valor_seguro, valor_moras, valor_desconto,
       valor_residuo, valor_total, valor_pago, valor_diferenca,
       status, acao_proposta, bloqueado, evidencias, dados, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,'relatorio_strato','analise_inteligente_0_8_2',$6,$7,$8,$9,$10,$11,$12,$13,$14,
       $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29::jsonb,$30::jsonb,NOW()
     )
     ON CONFLICT (retorno_item_id, ordem) DO UPDATE SET
       parcela_id=EXCLUDED.parcela_id,
       movimento_id=EXCLUDED.movimento_id,
       confianca=EXCLUDED.confianca,
       vencimento=EXCLUDED.vencimento,
       data_recebimento=EXCLUDED.data_recebimento,
       data_credito=EXCLUDED.data_credito,
       valor_nominal=EXCLUDED.valor_nominal,
       valor_juros_financeiro=EXCLUDED.valor_juros_financeiro,
       valor_seguro=EXCLUDED.valor_seguro,
       valor_moras=EXCLUDED.valor_moras,
       valor_desconto=EXCLUDED.valor_desconto,
       valor_residuo=EXCLUDED.valor_residuo,
       valor_total=EXCLUDED.valor_total,
       valor_pago=EXCLUDED.valor_pago,
       valor_diferenca=EXCLUDED.valor_diferenca,
       status=EXCLUDED.status,
       acao_proposta=EXCLUDED.acao_proposta,
       bloqueado=EXCLUDED.bloqueado,
       evidencias=EXCLUDED.evidencias,
       dados=EXCLUDED.dados,
       updated_at=NOW()
     RETURNING *`,
    [
      tenantId,
      returnItemId,
      parcelId || null,
      movementId || null,
      order,
      parcelAnalysis.confianca ?? null,
      Number(row.obra || 0) || null,
      String(row.unidade || '').trim() || null,
      String(row.cliente_codigo || parcelAnalysis.cliente?.codigo_legado || '').trim() || null,
      String(row.cliente_nome || parcelAnalysis.cliente?.nome || '').trim() || null,
      String(parcelAnalysis.contrato?.codigo_legado || parcelAnalysis.contrato?.numero || '').trim() || null,
      String(row.parcela || '').trim() || null,
      String(parcelAnalysis.identificadores_retorno?.controle_participante || '').trim() || null,
      isoDate(row.vencimento),
      isoDate(analysisItem.data_recebimento || row.data_pagamento),
      isoDate(analysisItem.data_credito),
      asMoney(parcelAnalysis.valor_nominal),
      asMoney(parcelAnalysis.valor_juros_financeiro),
      asMoney(parcelAnalysis.valor_seguro),
      asMoney(parcelAnalysis.valor_moras),
      asMoney(parcelAnalysis.valor_desconto),
      asMoney(parcelAnalysis.valor_residuo),
      asMoney(parcelAnalysis.valor_total),
      asMoney(parcelAnalysis.valor_pago),
      asMoney(parcelAnalysis.valor_diferenca),
      status,
      parcelAnalysis.acao_proposta || null,
      Boolean(blocked),
      JSON.stringify(evidence),
      JSON.stringify({ relatorio: row, analise: { classificacao: parcelAnalysis.classificacao } }),
    ],
  )
  return saved
}

async function finalizeReturnItem(client, {
  parent, analysisItem, appliedRows, allRows,
}) {
  const firstApplied = appliedRows[0] || allRows.find(row => row.parcelId) || null
  const totalDiscount = roundMoney(allRows.reduce((sum, row) => sum + asMoney(row.parcelAnalysis.valor_desconto), 0))
  const totalInterest = roundMoney(allRows.reduce((sum, row) => sum + asMoney(row.parcelAnalysis.valor_juros_financeiro) + asMoney(row.parcelAnalysis.valor_moras), 0))
  const selectedCount = appliedRows.length
  const pending = allRows.some(row => row.pending)
  const completed = allRows.length > 0
    && allRows.every(row => ['liquidado', 'liquidado_corrigido', 'ja_baixada', 'ja_baixado'].includes(String(row.status || '')))
  const status = completed
    ? (selectedCount > 0 ? 'liquidado' : 'ja_baixado')
    : selectedCount > 0
      ? 'parcialmente_liquidado'
      : 'aguarda_revisao'
  const method = allRows.length > 1 ? 'relatorio_strato_multiparcelas_0_8_2' : 'relatorio_strato_inteligente_0_8_2'

  await client.query(
    `UPDATE fin_retornos_cobranca_itens
        SET parcela_id=COALESCE($1::uuid,parcela_id),
            movimento_id=COALESCE($2,movimento_id),
            status_processamento=$3,
            metodo_conciliacao=$4,
            divergencia_valor=$5,
            valor_juros=$6,
            valor_desconto=$7,
            dados=COALESCE(dados,'{}'::jsonb) || $8::jsonb
      WHERE id=$9`,
    [
      firstApplied?.parcelId || null,
      firstApplied?.movementId || null,
      status,
      method,
      asMoney(analysisItem.diferenca_soma),
      totalInterest,
      totalDiscount,
      JSON.stringify({
        aplicacao_inteligente_0_8_2: {
          parcelas_total: allRows.length,
          parcelas_aplicadas: selectedCount,
          movimentos_individuais: appliedRows.map(row => row.movementId).filter(Boolean),
          aplicado_em: selectedCount ? new Date().toISOString() : null,
        },
      }),
      parent.id,
    ],
  )
}

async function updateBatchSummary(client, { batchId, tenantId, appliedCount, movementCount, totalPaid }) {
  await client.query(
    `WITH agg AS (
       SELECT
         COUNT(*) FILTER (WHERE status_processamento IN ('liquidado','ja_baixado','parcialmente_liquidado'))::int AS conciliados,
         COUNT(*) FILTER (WHERE status_processamento IN ('nao_localizado','aguarda_revisao'))::int AS nao_localizados,
         COALESCE(SUM(valor_pago) FILTER (WHERE status_processamento IN ('liquidado','ja_baixado','parcialmente_liquidado')),0)::numeric AS valor_liquidado
       FROM fin_retornos_cobranca_itens
       WHERE retorno_id=$1 AND tenant_id=$2
     )
     UPDATE fin_retornos_cobranca r
        SET quantidade_conciliada=agg.conciliados,
            quantidade_nao_localizada=agg.nao_localizados,
            valor_liquidado=agg.valor_liquidado,
            dados=COALESCE(r.dados,'{}'::jsonb) || $3::jsonb
       FROM agg
      WHERE r.id=$1 AND r.tenant_id=$2`,
    [batchId, tenantId, JSON.stringify({
      fluxo_inteligente_0_7_2: {
        parcelas_aplicadas_ultima_execucao: appliedCount,
        movimentos_criados_ultima_execucao: movementCount,
        valor_recebido_ultima_execucao: totalPaid,
        aplicado_em: new Date().toISOString(),
      },
    })],
  )
}


function resolveReturnItemForSelection(parsed, selection) {
  const details = Array.isArray(parsed?.details) ? parsed.details : []
  const selectedLine = Number(selection?.line || 0)
  if (!selectedLine) return null

  const exact = details.find(item => Number(item?.lineNumber || 0) === selectedLine)
  if (exact) return exact

  // Em CNAB400 o cabeçalho ocupa a linha 1; a chave da conferência guarda
  // a linha física do arquivo. Mantemos este fallback apenas para retornos
  // antigos cujo parser não persistiu lineNumber corretamente.
  const byPhysicalPosition = details[selectedLine - 2]
  return byPhysicalPosition || null
}

function selectionBelongsToAnalysisItem(selection, filename, analysisItem, parsed = null) {
  if (!selection || !analysisItem) return false
  const selectionFile = normalizeFilename(selection.filename || '')
  const currentFile = normalizeFilename(filename || '')
  if (selectionFile && currentFile && selectionFile !== currentFile) return false

  if (selection.line && Number(selection.line) === Number(analysisItem.linha)) return true

  const selectedParcelId = String(selection.parcelId || '').trim().toLowerCase()
  if (selectedParcelId) {
    const parcelFound = (analysisItem.parcelas || []).some(candidate =>
      String(candidate?.parcela?.id || '').trim().toLowerCase() === selectedParcelId,
    )
    if (parcelFound) return true
  }

  const returnItem = resolveReturnItemForSelection(parsed, selection)
  if (!returnItem) return false

  const returnBoleto = onlyDigits(`${returnItem?.nossoNumero || ''}${returnItem?.nossoNumeroDv || ''}`)
  const analysisBoleto = onlyDigits(analysisItem?.boleto || '')
  if (!bankIdentifierEquivalent(returnBoleto, analysisBoleto)) return false

  const returnOccurrence = String(returnItem?.occurrence || '').trim()
  const analysisOccurrence = String(analysisItem?.ocorrencia || '').trim()
  if (returnOccurrence && analysisOccurrence && returnOccurrence !== analysisOccurrence) return false

  const returnDocument = normalizeText(returnItem?.documentNumber || '')
  const analysisDocument = normalizeText(analysisItem?.documento || '')
  if (returnDocument && analysisDocument && returnDocument !== analysisDocument) {
    const returnFraction = fraction(returnItem?.documentNumber)
    const analysisFraction = fraction(analysisItem?.documento)
    if (!fractionsEquivalent(returnFraction, analysisFraction)) return false
  }

  return true
}

function parcelLegacyFraction(parcel) {
  const number = Number(parcel?.parcela_numero_legado || 0)
  const total = Number(parcel?.parcela_total_legado || 0)
  if (number > 0 && total > 0) return { number, total }
  return fraction(parcel?.documento_legado || '')
}

function chooseDirectFinancialSource(analysisItem, selection, parcel) {
  const candidates = Array.isArray(analysisItem?.parcelas) ? analysisItem.parcelas : []
  const selectedId = String(selection?.parcelId || '').trim().toLowerCase()

  // Caminho principal: usa exatamente a posição da parcela que o operador
  // aprovou no frontend. Não depende de linha física do RET, nome, fração ou
  // de uma nova tentativa de casamento.
  if (Number.isInteger(selection?.parcelIndex)
    && selection.parcelIndex >= 0
    && candidates[selection.parcelIndex]) {
    return {
      parcelAnalysis: candidates[selection.parcelIndex],
      order: selection.parcelIndex + 1,
      synthetic: false,
      source: 'INDICE_APROVADO_NO_FRONTEND',
    }
  }

  const exact = candidates.find(candidate =>
    String(candidate?.parcela?.id || '').trim().toLowerCase() === selectedId,
  )
  if (exact) return { parcelAnalysis: exact, order: candidates.indexOf(exact) + 1, synthetic: false }

  if (candidates.length === 1) {
    return { parcelAnalysis: candidates[0], order: 1, synthetic: false }
  }

  const selectedFraction = parcelLegacyFraction(parcel)
  if (selectedFraction) {
    const equivalent = candidates.filter(candidate =>
      fractionsEquivalent(selectedFraction, fraction(candidate?.relatorio?.parcela)),
    )
    if (equivalent.length === 1) {
      const candidate = equivalent[0]
      return { parcelAnalysis: candidate, order: candidates.indexOf(candidate) + 1, synthetic: false }
    }
  }

  const selectedClient = normalizeText(parcel?.cliente_nome || '')
  const selectedUnit = normalizeText(parcel?.unidade_codigo_legado || parcel?.contrato_unidade_codigo || '')
  const selectedProject = normalizeText(parcel?.obra_codigo_legado || parcel?.contrato_obra_codigo || '')
  const byIdentity = candidates.filter(candidate => {
    const row = candidate?.relatorio || {}
    if (selectedClient && normalizeText(row.cliente_nome || candidate?.cliente?.nome || '') !== selectedClient) return false
    if (selectedUnit && normalizeText(row.unidade || '') !== selectedUnit) return false
    if (selectedProject && normalizeText(row.obra || '') !== selectedProject) return false
    return Boolean(selectedClient || selectedUnit || selectedProject)
  })
  if (byIdentity.length === 1) {
    const candidate = byIdentity[0]
    return { parcelAnalysis: candidate, order: candidates.indexOf(candidate) + 1, synthetic: false }
  }

  const totals = analysisItem?.totais_relatorio || {}
  const canUseLineTotals = Number(analysisItem?.quantidade_parcelas || candidates.length || 0) <= 1
  if (!canUseLineTotals) return null

  const paid = asMoney(totals.valor_pago ?? analysisItem?.valor_retorno)
  if (paid <= 0) return null

  const rowFraction = fraction(analysisItem?.documento)
  const rowFractionText = rowFraction
    ? `${String(rowFraction.number).padStart(3, '0')}/${String(rowFraction.total).padStart(3, '0')}`
    : String(parcel?.documento_legado || '').trim()

  return {
    order: 1,
    synthetic: true,
    parcelAnalysis: {
      valor_nominal: asMoney(totals.valor_nominal ?? analysisItem?.valor_titulo_retorno ?? parcel?.valor_nominal),
      valor_juros_financeiro: asMoney(totals.valor_juros_financeiro),
      valor_seguro: asMoney(totals.valor_seguro),
      valor_moras: asMoney(totals.valor_moras),
      valor_desconto: asMoney(totals.valor_desconto),
      valor_residuo: asMoney(totals.valor_residuo),
      valor_total: asMoney(totals.valor_total ?? paid),
      valor_pago: paid,
      valor_diferenca: asMoney(totals.valor_diferenca),
      relatorio: {
        obra: parcel?.obra_codigo_legado || parcel?.contrato_obra_codigo || null,
        unidade: parcel?.unidade_codigo_legado || parcel?.contrato_unidade_codigo || null,
        parcela: rowFractionText || null,
        boleto: analysisItem?.boleto || null,
        vencimento: isoDate(parcel?.vencimento),
        valor_titulo: asMoney(totals.valor_nominal ?? analysisItem?.valor_titulo_retorno ?? parcel?.valor_nominal),
        valor_a_pagar: asMoney(totals.valor_nominal ?? analysisItem?.valor_titulo_retorno ?? parcel?.valor_nominal),
        juros_financeiro: asMoney(totals.valor_juros_financeiro),
        seguro: asMoney(totals.valor_seguro),
        moras: asMoney(totals.valor_moras),
        valor_desconto_previsto: asMoney(totals.valor_desconto),
        valor_residuo_previsto: asMoney(totals.valor_residuo),
        valor_total_original: asMoney(totals.valor_total ?? paid),
        cliente_nome: parcel?.cliente_nome || null,
        data_pagamento: isoDate(analysisItem?.data_recebimento || analysisItem?.data_ocorrencia),
        valor_pago_total: paid,
        valor_pago: paid,
        valor_diferenca: asMoney(totals.valor_diferenca),
        ocorrencia: analysisItem?.ocorrencia || null,
      },
      cliente: { nome: parcel?.cliente_nome || null },
      contrato: {
        id: parcel?.contrato_id || null,
        numero: parcel?.contrato_numero || null,
        codigo_legado: parcel?.contrato_codigo_legado || null,
      },
      parcela: {
        id: parcel?.id || selection?.parcelId || null,
        movimento_id: parcel?.movimento_id || null,
      },
      classificacao: 'SELECAO_DIRETA_OPERADOR',
      acao_proposta: 'ATUALIZAR_E_BAIXAR',
      bloqueado: false,
      confianca: 1,
      divergencias: [],
      natureza_financeira: {
        codigo: asMoney(totals.valor_desconto) > 0 ? 'DESCONTO' : 'JUROS_MORAS_OU_ACRESCIMOS',
        origem: 'RELATORIO_STRATO',
        valor_acrescimos: roundMoney(asMoney(totals.valor_juros_financeiro) + asMoney(totals.valor_moras)),
        valor_desconto: asMoney(totals.valor_desconto),
      },
      confirmacao_recomendada: false,
      evidencias_correspondencia: ['SELECAO_DIRETA_DO_OPERADOR', 'LINHA_DO_RETORNO'],
    },
  }
}

function getAnalysisItems(analysis) {
  if (Array.isArray(analysis?.itens)) return analysis.itens
  if (Array.isArray(analysis?.items)) return analysis.items
  return []
}

async function applyStratoIntelligentReturn({
  client,
  tenantId,
  userId,
  filename,
  content,
  parsed,
  analysis,
  stratoReports,
  explicitCompany,
  selections,
  fileIndex,
}) {
  const consumedSelections = new Set()
  // O analisador retorna a coleção como "itens". Versões anteriores da
  // aplicação procuravam apenas "items", portanto o laço não executava e
  // todas as seleções terminavam como não encontradas.
  const analysisItems = getAnalysisItems(analysis)
  const normalizedFile = normalizeFilename(filename)
  const selectionDescriptors = (selections || [])
    .map((selection, index) => normalizeSelectionDescriptor(selection, index))
    .filter(selection => !selection.filename || selection.filename === normalizedFile || selection.key.startsWith(`${fileIndex}:`))
  const context = await inferReturnContext(client, tenantId, parsed, explicitCompany)
  if (!context.company) throw new Error('Empresa do retorno não identificada.')
  if (!context.bankAccount) {
    throw new Error(context.bankAccountAmbiguous
      ? 'Há mais de uma conta Bradesco ativa para a empresa. Defina a conta antes de aplicar.'
      : 'Conta Bradesco ativa da empresa não encontrada.')
  }

  const reportMetadata = (stratoReports || []).map(report => ({
    nome_arquivo_relatorio: report.nome_arquivo_relatorio || null,
    arquivo_retorno: report.arquivo_retorno || null,
    provider: report.provider || null,
    titulos: Array.isArray(report.titulos) ? report.titulos.length : 0,
  }))
  const batch = await ensureBatch(client, {
    tenantId, userId, filename, content, parsed, context, reportMetadata,
  })

  let appliedCount = 0
  let acknowledgedCount = 0
  let movementCount = 0
  let totalPaid = 0
  const warnings = []
  const applied = []

  const details = Array.isArray(parsed.details) ? parsed.details : []
  for (let itemIndex = 0; itemIndex < analysisItems.length; itemIndex += 1) {
    const analysisItem = analysisItems[itemIndex]
    const pendingDirectSelections = selectionDescriptors.filter(selection => {
      if (consumedSelections.has(selection.token) || !selection.parcelId) return false
      // O índice do item enviado pelo frontend prevalece. Essa é a mesma lista
      // exibida e confirmada pelo operador, portanto não há necessidade de
      // reencontrar a linha por número físico do CNAB.
      if (Number.isInteger(selection.itemIndex)) return selection.itemIndex === itemIndex
      return selectionBelongsToAnalysisItem(selection, filename, analysisItem, parsed)
    })
    const returnItem = details.find(item => Number(item.lineNumber) === Number(analysisItem.linha))
      || details[itemIndex]
    if (!returnItem) continue
    const parent = await ensureReturnItem(client, {
      batch, tenantId, company: context.company, returnItem, analysisItem,
    })
    const appliedRows = []
    const allRows = []

    for (let parcelIndex = 0; parcelIndex < (analysisItem.parcelas || []).length; parcelIndex += 1) {
      const parcelAnalysis = analysisItem.parcelas[parcelIndex]
      const generatedKey = stableSelectionKey(filename, analysisItem, parcelAnalysis)
      const matchedSelection = resolveSelectionDescriptor({
        // Seleções com UUID pertencem ao modo direto abaixo. Elas não podem
        // ser consumidas por uma candidata recalculada diferente.
        descriptors: selectionDescriptors.filter(selection => !selection.parcelId),
        consumedSelections,
        filename,
        analysisItem,
        parcelAnalysis,
      })
      const key = matchedSelection?.key || generatedKey
      const wantsApply = Boolean(matchedSelection)
      if (wantsApply) consumedSelections.add(matchedSelection.token)
      // O ID enviado pela seleção é o vínculo aprovado no frontend. A análise
      // recalculada pode escolher outra parcela equivalente; não deve substituir
      // a escolha do operador.
      let parcelId = matchedSelection?.parcelId || parcelAnalysis.parcela?.id || null
      let movementId = parcelAnalysis.parcela?.movimento_id || null
      let status = String(parcelAnalysis.classificacao || '').startsWith('JA_BAIXADA') ? 'ja_baixada' : 'analisado'
      let blockedRow = Boolean(parcelAnalysis.bloqueado)
      let pending = eligibleAction(parcelAnalysis)

      if (wantsApply) {
        let parcel = null
        if (parcelId) {
          parcel = await lockParcel(client, { tenantId, parcelId })
        } else if (parcelAnalysis.classificacao === 'PARCELA_AUSENTE' && parcelAnalysis?.contrato?.id) {
          parcel = await createMissingParcel(client, { tenantId, parcelAnalysis, analysisItem })
          parcelId = parcel.id
          parcel = await lockParcel(client, { tenantId, parcelId })
        }

        if (!parcel) {
          warnings.push({ key, motivo: 'Parcela não localizada para o vínculo aprovado pelo operador.' })
        } else if (parcel.movimento_id || ['paga', 'pago', 'baixada', 'baixado'].includes(String(parcel.status || '').toLowerCase())) {
          if (String(parcel.origem_baixa || '').toLowerCase() === 'retorno_bradesco') {
            movementId = parcel.movimento_id
            if (String(parcelAnalysis.acao_proposta || '') === 'ATUALIZAR_RECEBIMENTO_EXISTENTE') {
              const corrected = await correctExistingPaidParcel(client, {
                tenantId, userId, filename, parsed, returnItem, analysisItem,
                parcelAnalysis, parcel,
              })
              parcelId = corrected.parcel.id
              movementId = corrected.movement.id
              status = 'liquidado_corrigido'
              appliedCount += 1
              totalPaid = roundMoney(totalPaid + asMoney(parcelAnalysis.valor_pago))
              appliedRows.push({ key, parcelId, movementId, parcelAnalysis })
              applied.push({
                key,
                parcela_id: parcelId,
                movimento_id: movementId,
                valor_pago: asMoney(parcelAnalysis.valor_pago),
                juros_ajustados: roundMoney(asMoney(parcelAnalysis.valor_juros_financeiro) + asMoney(parcelAnalysis.valor_moras)),
                desconto_ajustado: asMoney(parcelAnalysis.valor_desconto),
                vinculo: 'CORRECAO_DE_BAIXA_EXISTENTE',
              })
            } else {
              status = 'ja_baixada'
            }
            blockedRow = false
            pending = false
            acknowledgedCount += 1
          } else {
            warnings.push({ key, motivo: 'A parcela já possui baixa por outra origem e não foi alterada.' })
          }
        } else {
          const movementResult = await createMovement(client, {
            tenantId, filename, parsed, analysisItem, parcelAnalysis, parcel,
            context, line: returnItem.lineNumber,
          })
          movementId = movementResult.movement.id
          const returnFullBoleto = onlyDigits(`${returnItem?.nossoNumero || ''}${returnItem?.nossoNumeroDv || ''}`)
          const reportFullBoleto = onlyDigits(parcelAnalysis?.relatorio?.boleto || analysisItem?.boleto || '')
          const identifierConfirmed = Boolean(returnFullBoleto)
            && bankIdentifierEquivalent(returnFullBoleto, reportFullBoleto)
          const updated = await updateAndPayParcel(client, {
            tenantId, userId, filename, parsed, returnItem, analysisItem,
            parcelAnalysis, parcel, movement: movementResult.movement,
            paymentDate: movementResult.paymentDate,
            storeIdentifier: identifierConfirmed,
          })
          parcelId = updated.id
          status = 'liquidado'
          blockedRow = false
          pending = false
          appliedCount += 1
          acknowledgedCount += 1
          if (movementResult.created) movementCount += 1
          totalPaid = roundMoney(totalPaid + asMoney(parcelAnalysis.valor_pago))
          appliedRows.push({ key, parcelId, movementId, parcelAnalysis })
          applied.push({
            key,
            parcela_id: parcelId,
            movimento_id: movementId,
            valor_pago: asMoney(parcelAnalysis.valor_pago),
            juros_ajustados: roundMoney(asMoney(parcelAnalysis.valor_juros_financeiro) + asMoney(parcelAnalysis.valor_moras)),
            desconto_ajustado: asMoney(parcelAnalysis.valor_desconto),
          })
        }
      }

      await upsertRelation(client, {
        tenantId,
        returnItemId: parent.id,
        order: parcelIndex + 1,
        parcelAnalysis,
        parcelId,
        movementId,
        analysisItem,
        status,
        blocked: blockedRow,
      })
      allRows.push({ key, parcelId, movementId, parcelAnalysis, pending, status })
    }

    // Modo direto: a chave aprovada já contém linha do RET e ID da parcela.
    // Se a reanálise não devolver candidatos em "parcelas", não tentamos
    // reencontrar nome, nosso número ou fração. Usamos diretamente o ID
    // escolhido pelo operador e os valores financeiros da linha aprovada.
    const directSelections = pendingDirectSelections.filter(selection =>
      !consumedSelections.has(selection.token),
    )

    for (const directSelection of directSelections) {
      const key = directSelection.key || directSelection.token
      consumedSelections.add(directSelection.token)

      // A posição item/parcela enviada pelo frontend identifica a linha exata
      // aprovada. Em versões anteriores, três linhas de um boleto consolidado
      // podiam carregar o UUID da primeira parcela; por isso o UUID recalculado
      // da própria linha tem prioridade quando existe.
      let directSource = chooseDirectFinancialSource(analysisItem, directSelection, null)
      const sourceParcelId = String(directSource?.parcelAnalysis?.parcela?.id || '').trim()
      const effectiveParcelId = sourceParcelId || directSelection.parcelId

      const parcel = await lockParcel(client, {
        tenantId,
        parcelId: effectiveParcelId,
      })
      if (!parcel) {
        warnings.push({
          key,
          motivo: 'A parcela aprovada não existe mais. Nenhuma parcela alternativa foi utilizada.',
        })
        continue
      }

      // A linha física não decide o vínculo. Para a parcela aprovada neste item,
      // usamos o registro bancário já associado ao item recalculado.
      const directReturnItem = returnItem
      if (!directSource?.parcelAnalysis) {
        directSource = chooseDirectFinancialSource(analysisItem, directSelection, parcel)
      }
      if (!directSource?.parcelAnalysis) {
        warnings.push({
          key,
          motivo: 'A linha selecionada não possui valores financeiros individuais para aplicar.',
        })
        continue
      }

      const parcelAnalysis = directSource.parcelAnalysis
      let parcelId = parcel.id
      let movementId = parcel.movimento_id || null
      let status = 'analisado'
      let blockedRow = false
      let pending = true

      if (parcel.movimento_id || ['paga', 'pago', 'baixada', 'baixado'].includes(String(parcel.status || '').toLowerCase())) {
        if (String(parcel.origem_baixa || '').toLowerCase() === 'retorno_bradesco') {
          if (String(parcelAnalysis.acao_proposta || '') === 'ATUALIZAR_RECEBIMENTO_EXISTENTE') {
            const corrected = await correctExistingPaidParcel(client, {
              tenantId,
              userId,
              filename,
              parsed,
              returnItem: directReturnItem,
              analysisItem,
              parcelAnalysis,
              parcel,
            })
            parcelId = corrected.parcel.id
            movementId = corrected.movement.id
            status = 'liquidado_corrigido'
            appliedCount += 1
            totalPaid = roundMoney(totalPaid + asMoney(parcelAnalysis.valor_pago))
            appliedRows.push({ key, parcelId, movementId, parcelAnalysis })
            applied.push({
              key,
              parcela_id: parcelId,
              movimento_id: movementId,
              valor_pago: asMoney(parcelAnalysis.valor_pago),
              juros_ajustados: roundMoney(asMoney(parcelAnalysis.valor_juros_financeiro) + asMoney(parcelAnalysis.valor_moras)),
              desconto_ajustado: asMoney(parcelAnalysis.valor_desconto),
              vinculo: 'CORRECAO_DE_BAIXA_EXISTENTE_ID_DIRETO',
            })
          } else {
            status = 'ja_baixada'
          }
          pending = false
          acknowledgedCount += 1
        } else {
          warnings.push({
            key,
            motivo: 'A parcela já possui baixa por outra origem e não foi alterada.',
          })
        }
      } else {
        const movementResult = await createMovement(client, {
          tenantId,
          filename,
          parsed,
          analysisItem,
          parcelAnalysis,
          parcel,
          context,
          line: directReturnItem.lineNumber,
        })
        movementId = movementResult.movement.id

        const returnFullBoleto = onlyDigits(`${directReturnItem?.nossoNumero || ''}${directReturnItem?.nossoNumeroDv || ''}`)
        const reportFullBoleto = onlyDigits(parcelAnalysis?.relatorio?.boleto || analysisItem?.boleto || '')
        const identifierConfirmed = Boolean(returnFullBoleto)
          && bankIdentifierEquivalent(returnFullBoleto, reportFullBoleto)

        const updated = await updateAndPayParcel(client, {
          tenantId,
          userId,
          filename,
          parsed,
          returnItem: directReturnItem,
          analysisItem,
          parcelAnalysis,
          parcel,
          movement: movementResult.movement,
          paymentDate: movementResult.paymentDate,
          storeIdentifier: identifierConfirmed,
        })
        parcelId = updated.id
        status = 'liquidado'
        pending = false
        appliedCount += 1
        acknowledgedCount += 1
        if (movementResult.created) movementCount += 1
        totalPaid = roundMoney(totalPaid + asMoney(parcelAnalysis.valor_pago))

        appliedRows.push({ key, parcelId, movementId, parcelAnalysis })
        applied.push({
          key,
          parcela_id: parcelId,
          movimento_id: movementId,
          valor_pago: asMoney(parcelAnalysis.valor_pago),
          juros_ajustados: roundMoney(
            asMoney(parcelAnalysis.valor_juros_financeiro)
            + asMoney(parcelAnalysis.valor_moras),
          ),
          desconto_ajustado: asMoney(parcelAnalysis.valor_desconto),
          vinculo: 'ID_DIRETO_E_INDICES_APROVADOS_NO_FRONTEND',
        })
      }

      const directRow = {
        key,
        parcelId,
        movementId,
        parcelAnalysis,
        pending,
        status,
      }
      const targetIndex = Math.max(0, Number(directSource.order || 1) - 1)
      if (allRows[targetIndex]) allRows[targetIndex] = directRow
      else allRows.push(directRow)

      await upsertRelation(client, {
        tenantId,
        returnItemId: parent.id,
        order: Number(directSource.order || 1),
        parcelAnalysis,
        parcelId,
        movementId,
        analysisItem,
        status,
        blocked: blockedRow,
      })
    }

    await finalizeReturnItem(client, { parent, analysisItem, appliedRows, allRows })
  }

  const unmatchedSelections = selectionDescriptors.filter(selection => !consumedSelections.has(selection.token))
  unmatchedSelections.forEach(selection => {
    const selectedReturnItem = resolveReturnItemForSelection(parsed, selection)
    warnings.push({
      key: selection.key || selection.token,
      motivo: selectedReturnItem
        ? 'A seleção chegou ao backend, mas não encontrou a análise correspondente ao mesmo boleto/ocorrência.'
        : 'A linha indicada pela seleção não existe no RET enviado.',
      linha_selecionada: Number(selection.line || 0) || null,
      linha_ret_encontrada: selectedReturnItem?.lineNumber || null,
      boleto_ret_encontrado: selectedReturnItem
        ? onlyDigits(`${selectedReturnItem.nossoNumero || ''}${selectedReturnItem.nossoNumeroDv || ''}`)
        : null,
    })
  })

  if (selectionDescriptors.length > 0 && acknowledgedCount === 0) {
    const error = new Error('Nenhuma parcela selecionada foi aplicada pelo backend 0.8.2.')
    error.statusCode = 409
    error.details = warnings
    throw error
  }

  await updateBatchSummary(client, {
    batchId: batch.id,
    tenantId,
    appliedCount,
    movementCount,
    totalPaid,
  })
  const persisted = await loadPersistedReturnResult(client, { tenantId, returnId: batch.id })
  return {
    ...persisted,
    duplicated: false,
    applied_intelligent: true,
    parcelas_aplicadas: appliedCount,
    parcelas_reconhecidas: acknowledgedCount,
    movimentos_criados: movementCount,
    valor_baixado: totalPaid,
    bloqueios_aplicacao: warnings,
    avisos_aplicacao: warnings,
    aplicacoes: applied,
    versao_aplicacao_strato: '0.8.2',
  }
}

module.exports = {
  applyStratoIntelligentReturn,
  getAnalysisItems,
  stableSelectionKey,
  parcelSelectionIdentity,
  parseStableSelectionKey,
  normalizeFilename,
  normalizeSelectionDescriptor,
  analysisSelectionDescriptor,
  selectionMatchesParcel,
  resolveSelectionDescriptor,
  selectionBelongsToAnalysisItem,
  resolveReturnItemForSelection,
  parcelLegacyFraction,
  chooseDirectFinancialSource,
  bankIdentifierEquivalent,
  fractionsEquivalent,
  eligibleAction,
  hardBlocked,
  correctExistingPaidParcel,
  decideReturnIdentifierPersistence,
}
