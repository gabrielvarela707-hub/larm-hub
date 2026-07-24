/**
 * Aplicação transacional da análise inteligente Strato — v0.6.7.
 *
 * Regras de segurança:
 * - o backend sempre recalcula a análise a partir do RET + relatório enviado;
 * - a seleção do frontend identifica somente linhas/parcelas, nunca valores;
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

function fileSelectionPrefix(filename) {
  return `v2|${selectionPart(filename)}|`
}

function buildIdentityCounts(analysis) {
  const counts = new Map()
  for (const item of analysis?.items || []) {
    for (const parcel of item?.parcelas || []) {
      const identity = parcelSelectionIdentity(item, parcel)
      counts.set(identity, Number(counts.get(identity) || 0) + 1)
    }
  }
  return counts
}

function resolveSelectionKey({
  selected,
  descriptors,
  consumedSelections,
  filename,
  analysisItem,
  parcelAnalysis,
  identityCounts,
}) {
  const exactKey = stableSelectionKey(filename, analysisItem, parcelAnalysis)
  if (selected.has(exactKey)) return exactKey

  const identity = parcelSelectionIdentity(analysisItem, parcelAnalysis)
  if (Number(identityCounts.get(identity) || 0) !== 1) return null

  const normalizedFilename = String(filename || '').trim().toLowerCase()
  const candidates = descriptors.filter(entry =>
    entry.filename === normalizedFilename
      && entry.identity === identity
      && !consumedSelections.has(entry.key),
  )
  return candidates.length === 1 ? candidates[0].key : null
}

function eligibleAction(parcelAnalysis) {
  return ['BAIXAR_PARCELA', 'ATUALIZAR_E_BAIXAR', 'CRIAR_PARCELA_E_BAIXAR']
    .includes(String(parcelAnalysis?.acao_proposta || ''))
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
        fluxo_inteligente: { versao: '0.6.6', criado_em: new Date().toISOString() },
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
       'aguarda_revisao',$14::jsonb,NULL,'analise_strato_0_6_6',NULL,$15
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
        origem: 'analise_inteligente_strato_0_6_6',
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

async function updateAndPayParcel(client, {
  tenantId, userId, filename, parsed, returnItem, analysisItem,
  parcelAnalysis, parcel, movement, paymentDate, storeIdentifier,
}) {
  const row = parcelAnalysis.relatorio || {}
  const frac = fraction(row.parcela)
  const nominal = asMoney(parcelAnalysis.valor_nominal)
  const discount = asMoney(parcelAnalysis.valor_desconto)
  const jfct = asMoney(parcelAnalysis.valor_juros_financeiro)
  const moras = asMoney(parcelAnalysis.valor_moras)
  const insurance = asMoney(parcelAnalysis.valor_seguro)
  const residue = asMoney(parcelAnalysis.valor_residuo)
  const paid = asMoney(parcelAnalysis.valor_pago)
  const note = `Strato ${filename} — parcela ${row.parcela || '—'} — nominal ${nominal.toFixed(2)} — desconto ${discount.toFixed(2)} — J.FCT ${jfct.toFixed(2)} — moras ${moras.toFixed(2)} — seguro ${insurance.toFixed(2)} — resíduo ${residue.toFixed(2)} — recebido ${paid.toFixed(2)} em ${paymentDate} — crédito bancário ${analysisItem.data_credito || 'não informado'}`
  const base = String(parcel.documento_base_legado || parcel.contrato_codigo_legado || parcel.documento_legado || '').split(' ')[0] || 'STRATO'
  const document = frac ? `${base} ${String(frac.number).padStart(3, '0')}/${String(frac.total).padStart(3, '0')}` : parcel.documento_legado
  const reconciliation = {
    origem: 'analise_inteligente_strato_0_6_6',
    arquivo: filename,
    retorno_sha256: parsed.sha256,
    linha_retorno: analysisItem.linha,
    boleto: analysisItem.boleto,
    parcela_strato: row.parcela || null,
    data_recebimento: paymentDate,
    data_credito: analysisItem.data_credito || null,
    valor_nominal: nominal,
    valor_desconto: discount,
    valor_juros_financeiro: jfct,
    valor_moras: moras,
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
    } : null,
    usuario_id: userId || null,
    aplicado_em: new Date().toISOString(),
  }

  const { rows: [updated] } = await client.query(
    `UPDATE com_parcelas
        SET documento_legado=$1,
            parcela_numero_legado=COALESCE($2,parcela_numero_legado),
            parcela_total_legado=COALESCE($3,parcela_total_legado),
            vencimento=COALESCE($4::date,vencimento),
            valor_nominal=$5,
            valor_convertido=$5,
            valor_juros_financiamento=$6,
            valor_moras=$7,
            valor_juros_mora=$8,
            valor_seguro=$9,
            valor_desconto=$10,
            valor_residuo=$11,
            valor_total_relatorio=$12,
            valor_recalculado=NULL,
            status='paga',
            pago_em=$13::date,
            valor_pago=$12,
            forma_pagamento='Boleto',
            observacoes_baixa=$14,
            movimento_id=$15,
            origem_baixa='retorno_bradesco',
            conciliado_em=NOW(),
            boleto_status='liquidado',
            conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $16::jsonb,
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $17::jsonb,
            nosso_numero=CASE WHEN $18::boolean THEN $19 ELSE nosso_numero END,
            nosso_numero_dv=CASE WHEN $18::boolean THEN $20 ELSE nosso_numero_dv END,
            controle_participante=CASE WHEN $18::boolean THEN COALESCE(controle_participante,NULLIF($21,'')) ELSE controle_participante END,
            updated_at=NOW()
      WHERE id=$22::uuid AND tenant_id=$23
        AND movimento_id IS NULL
        AND LOWER(COALESCE(status,'')) NOT IN ('paga','pago','baixada','baixado','cancelada','cancelado')
      RETURNING *`,
    [
      document,
      frac?.number || null,
      frac?.total || null,
      isoDate(row.vencimento),
      nominal,
      jfct,
      moras,
      roundMoney(jfct + moras),
      insurance,
      discount,
      residue,
      paid,
      paymentDate,
      appendNote(parcel.observacoes_baixa, note),
      movement.id,
      JSON.stringify(reconciliation),
      JSON.stringify({ strato_0_6_6: reconciliation }),
      Boolean(storeIdentifier),
      returnItem?.nossoNumero || null,
      returnItem?.nossoNumeroDv || null,
      returnItem?.participantControl || '',
      parcel.id,
      tenantId,
    ],
  )
  if (!updated) throw new Error(`A parcela ${row.parcela || parcel.id} mudou de estado durante a aplicação.`)
  return updated
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
       $1,$2,$3,$4,$5,'relatorio_strato','analise_inteligente_0_6_6',$6,$7,$8,$9,$10,$11,$12,$13,$14,
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
    && allRows.every(row => ['liquidado', 'ja_baixada'].includes(String(row.status || '')))
  const status = completed
    ? (selectedCount > 0 ? 'liquidado' : 'ja_baixado')
    : selectedCount > 0
      ? 'parcialmente_liquidado'
      : 'aguarda_revisao'
  const method = allRows.length > 1 ? 'relatorio_strato_multiparcelas_0_6_6' : 'relatorio_strato_inteligente_0_6_6'

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
        aplicacao_inteligente_0_6_6: {
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
      fluxo_inteligente_0_6_6: {
        parcelas_aplicadas_ultima_execucao: appliedCount,
        movimentos_criados_ultima_execucao: movementCount,
        valor_recebido_ultima_execucao: totalPaid,
        aplicado_em: new Date().toISOString(),
      },
    })],
  )
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
  const selected = new Set((selections || []).map(String))
  const consumedSelections = new Set()
  const stablePrefix = fileSelectionPrefix(filename)
  const legacyPrefix = `${fileIndex}:`
  const relevantSelections = [...selected].filter(key =>
    key.startsWith(stablePrefix) || key.startsWith(legacyPrefix),
  )
  const selectionDescriptors = relevantSelections
    .map(parseStableSelectionKey)
    .filter(Boolean)
  const identityCounts = buildIdentityCounts(analysis)
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
  let movementCount = 0
  let totalPaid = 0
  const blocked = []
  const applied = []

  const details = Array.isArray(parsed.details) ? parsed.details : []
  for (let itemIndex = 0; itemIndex < (analysis.items || []).length; itemIndex += 1) {
    const analysisItem = analysis.items[itemIndex]
    const returnItem = details.find(item => Number(item.lineNumber) === Number(analysisItem.linha)) || details[itemIndex]
    if (!returnItem) continue
    const parent = await ensureReturnItem(client, {
      batch, tenantId, company: context.company, returnItem, analysisItem,
    })
    const appliedRows = []
    const allRows = []

    for (let parcelIndex = 0; parcelIndex < (analysisItem.parcelas || []).length; parcelIndex += 1) {
      const parcelAnalysis = analysisItem.parcelas[parcelIndex]
      const generatedKey = stableSelectionKey(filename, analysisItem, parcelAnalysis)
      const matchedSelectionKey = resolveSelectionKey({
        selected,
        descriptors: selectionDescriptors,
        consumedSelections,
        filename,
        analysisItem,
        parcelAnalysis,
        identityCounts,
      })
      const key = matchedSelectionKey || generatedKey
      const wantsApply = Boolean(matchedSelectionKey)
      if (wantsApply) consumedSelections.add(matchedSelectionKey)
      let parcelId = parcelAnalysis.parcela?.id || null
      let movementId = parcelAnalysis.parcela?.movimento_id || null
      let status = String(parcelAnalysis.classificacao || '').startsWith('JA_BAIXADA') ? 'ja_baixada' : 'analisado'
      let blockedRow = Boolean(parcelAnalysis.bloqueado)
      let pending = eligibleAction(parcelAnalysis)

      if (wantsApply) {
        if (!analysisItem.soma_confere_com_retorno) {
          blocked.push({ key, motivo: 'A soma das parcelas diverge do retorno.' })
        } else if (!eligibleAction(parcelAnalysis)) {
          blocked.push({ key, motivo: 'Ação não elegível para aplicação.' })
        } else if (hardBlocked(parcelAnalysis)) {
          blocked.push({ key, motivo: 'Cliente ou contrato ausente/ambíguo exige cadastro completo antes da baixa.' })
        } else {
          let parcel = null
          if (parcelId) parcel = await lockParcel(client, { tenantId, parcelId })
          else if (parcelAnalysis.classificacao === 'PARCELA_AUSENTE') {
            parcel = await createMissingParcel(client, { tenantId, parcelAnalysis, analysisItem })
            parcelId = parcel.id
            parcel = await lockParcel(client, { tenantId, parcelId })
          }
          if (!parcel) {
            blocked.push({ key, motivo: 'Parcela não localizada durante a aplicação.' })
          } else if (parcel.movimento_id || String(parcel.status || '').toLowerCase() === 'paga') {
            if (String(parcel.origem_baixa || '').toLowerCase() === 'retorno_bradesco') {
              movementId = parcel.movimento_id
              status = 'ja_baixada'
              blockedRow = false
              pending = false
            } else {
              blocked.push({ key, motivo: 'A parcela já foi baixada por outra origem.' })
            }
          } else {
            const movementResult = await createMovement(client, {
              tenantId, filename, parsed, analysisItem, parcelAnalysis, parcel,
              context, line: returnItem.lineNumber,
            })
            movementId = movementResult.movement.id
            const returnFullBoleto = onlyDigits(`${returnItem?.nossoNumero || ''}${returnItem?.nossoNumeroDv || ''}`)
            const reportFullBoleto = onlyDigits(parcelAnalysis?.relatorio?.boleto || analysisItem?.boleto || '')
            const identifierConfirmed = parcelIndex === 0
              && Boolean(returnFullBoleto)
              && returnFullBoleto === reportFullBoleto
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
            if (movementResult.created) movementCount += 1
            totalPaid = roundMoney(totalPaid + asMoney(parcelAnalysis.valor_pago))
            appliedRows.push({ key, parcelId, movementId, parcelAnalysis })
            applied.push({ key, parcela_id: parcelId, movimento_id: movementId, valor_pago: asMoney(parcelAnalysis.valor_pago) })
          }
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

    await finalizeReturnItem(client, { parent, analysisItem, appliedRows, allRows })
  }

  const unmatchedSelections = relevantSelections.filter(key => !consumedSelections.has(key))
  if (unmatchedSelections.length) {
    unmatchedSelections.forEach(key => blocked.push({
      key,
      motivo: key.startsWith(legacyPrefix)
        ? 'A seleção usa o identificador antigo por posição. Atualize o frontend para a versão 0.6.6 e tente novamente.'
        : 'A parcela selecionada não correspondeu à análise recalculada. Reabra a conferência antes de aplicar.',
    }))
  }

  if (blocked.length) {
    const error = new Error(`A aplicação foi cancelada: ${blocked.length} parcela(s) selecionada(s) não passaram nas validações finais.`)
    error.statusCode = 409
    error.details = blocked
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
    movimentos_criados: movementCount,
    valor_baixado: totalPaid,
    bloqueios_aplicacao: blocked,
    aplicacoes: applied,
  }
}

module.exports = {
  applyStratoIntelligentReturn,
  stableSelectionKey,
  parcelSelectionIdentity,
  parseStableSelectionKey,
  fileSelectionPrefix,
  buildIdentityCounts,
  resolveSelectionKey,
  eligibleAction,
  hardBlocked,
}
