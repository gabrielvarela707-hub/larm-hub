#!/usr/bin/env node
'use strict'

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { pool, connectDB } = require('../src/config/database')
const { PLAN, allParcelEntries, centsToNumber, moneyBrFromCents, stableHash } = require('./cb230700_lucky_plan')

const EXECUTE = process.argv.includes('--execute')
const args = new Map(
  process.argv.slice(2)
    .filter(arg => arg.startsWith('--') && arg.includes('='))
    .map(arg => {
      const [key, ...rest] = arg.slice(2).split('=')
      return [key, rest.join('=')]
    }),
)
const CONFIRMAR = args.has('confirmar') ? Number(args.get('confirmar')) : null
const BACKUP_DIR = args.get('backup-dir') || '/var/backups/larmhub/cb230700-lucky'

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function cents(value) {
  return Math.round(Number(value || 0) * 100)
}

function dateOnly(value) {
  return value == null ? null : String(value).slice(0, 10)
}

function normalizeText(value) {
  return value == null ? null : String(value).trim()
}

function jsonSafe(value) {
  return JSON.parse(JSON.stringify(value))
}

function appendNote(current, note) {
  const before = String(current || '').trim()
  return before ? `${before}\n${note}` : note
}

async function tableExists(client, tableName) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`])
  return Boolean(row?.reg)
}

async function loadReturn(client) {
  const { rows } = await client.query(
    `SELECT id, tenant_id, nome_arquivo, sha256, data_arquivo, quantidade_registros,
            quantidade_conciliada, quantidade_nao_localizada, valor_liquidado,
            banco_conta_id, empresa, dados
       FROM fin_retornos_cobranca
      WHERE id=$1::uuid AND tenant_id=$2::uuid
      FOR UPDATE`,
    [PLAN.returnId, PLAN.tenantId],
  )
  if (rows.length !== 1) throw new Error('Retorno CB230700 LUCKY não foi localizado de forma única.')
  const row = rows[0]
  if (row.sha256 !== PLAN.returnSha256) throw new Error(`SHA-256 do retorno diverge. Esperado ${PLAN.returnSha256}, encontrado ${row.sha256}.`)
  if (normalizeText(row.nome_arquivo) !== PLAN.returnFile) throw new Error(`Nome do retorno diverge: ${row.nome_arquivo}.`)
  if (normalizeText(row.empresa).toUpperCase() !== PLAN.company) throw new Error(`Empresa do retorno diverge: ${row.empresa}.`)
  return row
}

async function loadBankAccount(client, returnRow) {
  if (returnRow.banco_conta_id != null) {
    const { rows } = await client.query(
      `SELECT id, empresa, banco_nome, codigo_banco, agencia, conta, digito, ativo
         FROM fin_bancos_contas
        WHERE id=$1 AND ativo IS DISTINCT FROM FALSE`,
      [returnRow.banco_conta_id],
    )
    if (rows.length === 1) return rows[0]
  }

  const { rows } = await client.query(
    `SELECT id, empresa, banco_nome, codigo_banco, agencia, conta, digito, ativo
       FROM fin_bancos_contas
      WHERE ativo IS DISTINCT FROM FALSE
        AND UPPER(COALESCE(empresa,''))=$1
        AND (
          regexp_replace(COALESCE(codigo_banco,''), '[^0-9]', '', 'g')=$2
          OR UPPER(COALESCE(banco_nome,'')) LIKE '%BRADESCO%'
        )
      ORDER BY CASE WHEN regexp_replace(COALESCE(codigo_banco,''), '[^0-9]', '', 'g')=$2 THEN 0 ELSE 1 END, id`,
    [PLAN.company, PLAN.bankCode],
  )
  if (rows.length !== 1) throw new Error(`Conta Bradesco ativa da LUCKY não foi identificada de forma única. Encontradas: ${rows.length}.`)
  return rows[0]
}

async function loadReturnItems(client) {
  const ids = PLAN.targets.map(target => target.returnItemId)
  const { rows } = await client.query(
    `SELECT id, retorno_id, tenant_id, parcela_id, nosso_numero, nosso_numero_dv,
            controle_participante, ocorrencia,
            to_char(data_ocorrencia::date,'YYYY-MM-DD') AS data_ocorrencia,
            to_char(data_credito::date,'YYYY-MM-DD') AS data_credito,
            to_char(data_vencimento::date,'YYYY-MM-DD') AS data_vencimento, valor_titulo, valor_pago, valor_juros, valor_desconto,
            status_processamento, dados, movimento_id, metodo_conciliacao,
            divergencia_valor, empresa
       FROM fin_retornos_cobranca_itens
      WHERE retorno_id=$1::uuid AND tenant_id=$2::uuid AND id=ANY($3::bigint[])
      ORDER BY id
      FOR UPDATE`,
    [PLAN.returnId, PLAN.tenantId, ids],
  )
  if (rows.length !== ids.length) throw new Error(`Itens do retorno incompletos. Esperados ${ids.length}, encontrados ${rows.length}.`)
  return rows
}

async function loadParcels(client) {
  const ids = allParcelEntries().map(entry => entry.parcel.id)
  const { rows } = await client.query(
    `SELECT
        p.id, p.tenant_id, p.contrato_id, p.numero, p.tipo,
        to_char(p.vencimento::date, 'YYYY-MM-DD') AS vencimento,
        p.valor_nominal, p.valor_convertido, p.valor_total_relatorio,
        p.valor_correcao, p.valor_multa, p.valor_juros_mora,
        p.valor_outros_acrescimos, p.valor_seguro, p.valor_desconto,
        p.valor_recalculado, p.data_recalculo, p.status,
        to_char(p.pago_em::date, 'YYYY-MM-DD') AS pago_em,
        p.valor_pago, p.forma_pagamento, p.observacoes_baixa,
        p.movimento_id, p.origem_baixa, p.conciliado_em,
        p.conciliacao_dados, p.dados_adicionais, p.recalculo_dados,
        p.documento_legado, p.documento_base_legado,
        p.parcela_numero_legado, p.parcela_total_legado,
        p.nosso_numero, p.nosso_numero_dv, p.controle_participante,
        p.linha_digitavel, p.codigo_barras, p.boleto_status,
        p.codigo_legado, p.origem, p.updated_at,
        c.numero AS contrato_numero,
        c.titulo AS contrato_titulo,
        COALESCE(cp.nome, cp.razao_social, c.comprador_nome, 'Cliente não identificado') AS cliente_nome,
        rec.titulo AS receita_titulo,
        rec.numero_documento AS receita_documento,
        pc.codigo AS plano_codigo,
        pc.descricao AS plano_descricao,
        COALESCE(
          obra.nome,
          CASE WHEN unidade.tipo='obra' THEN unidade.nome END,
          'Obra ' || COALESCE(p.obra_codigo_legado::text, c.obra_codigo_legado::text, '')
        ) AS obra_nome
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
       LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
       LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
       LEFT JOIN fin_receitas rec ON rec.id=p.receita_id
       LEFT JOIN fin_plano_contas pc ON pc.id=rec.plano_conta_id
       LEFT JOIN cad_produtos unidade ON unidade.id=p.produto_id
       LEFT JOIN cad_produtos obra ON obra.id=unidade.produto_pai_id
      WHERE p.tenant_id=$1::uuid AND p.id=ANY($2::uuid[])
      ORDER BY p.id
      FOR UPDATE OF p`,
    [PLAN.tenantId, ids],
  )
  if (rows.length !== ids.length) throw new Error(`Parcelas incompletas. Esperadas ${ids.length}, encontradas ${rows.length}.`)
  return rows
}

async function loadBatchMovements(client) {
  const { rows } = await client.query(
    `SELECT id, to_char(data::date,'YYYY-MM-DD') AS data, empresa, banco, entradas, saidas, fornecedor, historico,
            nf_doc, conta_contabil, centro_custo, obra, natureza_financeira,
            dia, mes, ano, tipo_lancamento, vencimento, banco_conta_id,
            lote_importacao, arquivo_origem, linha_origem, hash_importacao,
            importado_em, created_at
       FROM fin_movimento
      WHERE lote_importacao=$1
      ORDER BY id
      FOR UPDATE`,
    [PLAN.batch],
  )
  return rows
}

function proposedStateMatches(row, entry, batchMovementById) {
  const p = entry.parcel.proposed
  const movement = row.movimento_id == null ? null : batchMovementById.get(String(row.movimento_id))
  return (
    normalizeText(row.documento_legado) === p.document &&
    Number(row.parcela_numero_legado) === p.number &&
    Number(row.parcela_total_legado) === p.total &&
    dateOnly(row.vencimento) === p.dueDate &&
    cents(row.valor_nominal) === p.nominalCents &&
    cents(row.valor_convertido) === p.nominalCents &&
    cents(row.valor_desconto) === p.discountCents &&
    cents(row.valor_juros_mora) === p.interestCents &&
    cents(row.valor_pago) === p.paidCents &&
    dateOnly(row.pago_em) === PLAN.receiptDate &&
    String(row.status || '').toLowerCase() === 'paga' &&
    normalizeText(row.origem_baixa) === 'retorno_bradesco' &&
    Boolean(movement) &&
    dateOnly(movement.data) === PLAN.receiptDate &&
    cents(movement.entradas) === p.paidCents &&
    cents(movement.saidas) === 0
  )
}

function validateCurrentState(parcelRows, returnItems, batchMovements) {
  const rowById = new Map(parcelRows.map(row => [String(row.id), row]))
  const itemById = new Map(returnItems.map(row => [Number(row.id), row]))
  const batchMovementById = new Map(batchMovements.map(row => [String(row.id), row]))
  const entries = allParcelEntries()

  const alreadyFlags = entries.map(entry => proposedStateMatches(rowById.get(entry.parcel.id), entry, batchMovementById))
  const allAlready = alreadyFlags.every(Boolean) && batchMovements.length === PLAN.expectedMovements
  const anyAlready = alreadyFlags.some(Boolean) || batchMovements.length > 0

  if (allAlready) return { alreadyApplied: true, rowById, itemById }
  if (anyAlready) throw new Error('Foi detectada aplicação parcial da correção 0.5.9. Nada será continuado automaticamente; execute a conferência antes de qualquer ação.')

  const errors = []
  for (const entry of entries) {
    const row = rowById.get(entry.parcel.id)
    const current = entry.parcel.current
    if (!row) {
      errors.push(`${entry.parcel.stratoFraction}: parcela não encontrada.`)
      continue
    }
    if (normalizeText(row.contrato_numero) !== entry.target.contract) errors.push(`${entry.parcel.stratoFraction}: contrato ${row.contrato_numero} diverge de ${entry.target.contract}.`)
    if (normalizeText(row.documento_legado) !== current.document) errors.push(`${entry.parcel.stratoFraction}: documento atual ${row.documento_legado} diverge de ${current.document}.`)
    if (Number(row.parcela_numero_legado) !== current.number || Number(row.parcela_total_legado) !== current.total) errors.push(`${entry.parcel.stratoFraction}: fração atual diverge de ${current.number}/${current.total}.`)
    if (dateOnly(row.vencimento) !== current.dueDate) errors.push(`${entry.parcel.stratoFraction}: vencimento ${dateOnly(row.vencimento)} diverge de ${current.dueDate}.`)
    if (cents(row.valor_nominal) !== current.nominalCents) errors.push(`${entry.parcel.stratoFraction}: nominal atual R$ ${money(row.valor_nominal)} diverge de R$ ${moneyBrFromCents(current.nominalCents)}.`)
    if (cents(row.valor_convertido) !== current.nominalCents) errors.push(`${entry.parcel.stratoFraction}: valor convertido atual diverge.`)
    if (String(row.status || '').toLowerCase() !== current.status) errors.push(`${entry.parcel.stratoFraction}: status atual ${row.status} diverge de ${current.status}.`)
    if (row.movimento_id != null) errors.push(`${entry.parcel.stratoFraction}: já possui movimento ${row.movimento_id}.`)
    if (row.pago_em != null || row.valor_pago != null) errors.push(`${entry.parcel.stratoFraction}: já possui dados de pagamento.`)
    if (cents(row.valor_desconto) !== 0 || cents(row.valor_juros_mora) !== 0) errors.push(`${entry.parcel.stratoFraction}: desconto/juros atuais não estão zerados.`)
    if (row.valor_recalculado != null) errors.push(`${entry.parcel.stratoFraction}: possui valor_recalculado e não pode ser sobrescrita automaticamente.`)
    if (row.nosso_numero != null || row.controle_participante != null) errors.push(`${entry.parcel.stratoFraction}: já possui identificador bancário e exige conferência manual.`)
  }

  for (const target of PLAN.targets) {
    const item = itemById.get(target.returnItemId)
    if (!item) {
      errors.push(`Item ${target.returnItemId} do retorno não encontrado.`)
      continue
    }
    if (String(item.status_processamento || '').toLowerCase() !== 'nao_localizado') errors.push(`Item ${target.returnItemId}: status ${item.status_processamento} diverge de nao_localizado.`)
    if (item.parcela_id != null || item.movimento_id != null) errors.push(`Item ${target.returnItemId}: já possui parcela ou movimento vinculado.`)
    if (normalizeText(item.nosso_numero) !== target.nossoNumero) errors.push(`Item ${target.returnItemId}: nosso número diverge.`)
    if (dateOnly(item.data_ocorrencia) !== PLAN.receiptDate) errors.push(`Item ${target.returnItemId}: data de ocorrência diverge de ${PLAN.receiptDate}.`)
    if (dateOnly(item.data_credito) !== PLAN.creditDate) errors.push(`Item ${target.returnItemId}: data de crédito diverge de ${PLAN.creditDate}.`)
  }

  if (errors.length) throw new Error(`Pré-condições divergentes:\n- ${errors.join('\n- ')}`)
  return { alreadyApplied: false, rowById, itemById }
}

function planTotals() {
  const entries = allParcelEntries()
  return entries.reduce((acc, entry) => {
    acc.nominalCents += entry.parcel.proposed.nominalCents
    acc.discountCents += entry.parcel.proposed.discountCents
    acc.interestCents += entry.parcel.proposed.interestCents
    acc.paidCents += entry.parcel.proposed.paidCents
    return acc
  }, { nominalCents: 0, discountCents: 0, interestCents: 0, paidCents: 0 })
}

function printPreview(parcelRows, bankAccount) {
  const rowById = new Map(parcelRows.map(row => [String(row.id), row]))
  console.log('CORREÇÃO CB230700 LUCKY — ETAPA C')
  console.log(`Modo: ${EXECUTE ? 'EXECUÇÃO CONTROLADA' : 'PRÉVIA SOMENTE LEITURA'}`)
  console.log(`Lote: ${PLAN.batch}`)
  console.log(`Data do recebimento e do Movimento Bancário: ${PLAN.receiptDate}`)
  console.log(`Data de crédito preservada para auditoria: ${PLAN.creditDate}`)
  console.log(`Conta: #${bankAccount.id} ${bankAccount.empresa || ''} ${bankAccount.banco_nome || ''} Ag. ${bankAccount.agencia || '—'} C/C ${bankAccount.conta || '—'}${bankAccount.digito ? `-${bankAccount.digito}` : ''}`)
  console.log('')
  console.table(allParcelEntries().map(entry => {
    const row = rowById.get(entry.parcel.id)
    const p = entry.parcel.proposed
    return {
      cliente: entry.target.client,
      parcela: entry.parcel.stratoFraction,
      atual: `R$ ${money(row.valor_nominal)}`,
      nominal: `R$ ${moneyBrFromCents(p.nominalCents)}`,
      desconto: `R$ ${moneyBrFromCents(p.discountCents)}`,
      juros: `R$ ${moneyBrFromCents(p.interestCents)}`,
      recebido: `R$ ${moneyBrFromCents(p.paidCents)}`,
      data: PLAN.receiptDate,
      movimento: 'individual',
    }
  }))
  const totals = planTotals()
  console.log(`Parcelas a baixar: ${allParcelEntries().length}`)
  console.log(`Movimentos individuais a criar: ${PLAN.expectedMovements}`)
  console.log(`Total nominal: R$ ${moneyBrFromCents(totals.nominalCents)}`)
  console.log(`Total de descontos: R$ ${moneyBrFromCents(totals.discountCents)}`)
  console.log(`Total de juros: R$ ${moneyBrFromCents(totals.interestCents)}`)
  console.log(`Total recebido: R$ ${moneyBrFromCents(totals.paidCents)}`)
}

function makeBackupPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return path.join(BACKUP_DIR, `${PLAN.batch}-${stamp}-antes.json`)
}

function writeBackup(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { mode: 0o600 })
  fs.chmodSync(filePath, 0o600)
}

function movementHash(entry) {
  return crypto.createHash('sha256')
    .update(`${PLAN.batch}|${entry.parcel.id}|${entry.parcel.proposed.paidCents}`)
    .digest('hex')
}

async function createMovement(client, entry, parcelRow, bankAccount) {
  const p = entry.parcel.proposed
  const [year, month, day] = PLAN.receiptDate.split('-').map(Number)
  const bankName = normalizeText(bankAccount.banco_nome) || 'BRADESCO'
  const account = normalizeText(parcelRow.plano_descricao) || 'VENDA DE IMÓVEIS'
  const nature = normalizeText(parcelRow.plano_codigo) || '1.1'
  const project = normalizeText(parcelRow.obra_nome) || 'VENDA DE IMÓVEIS'
  const document = entry.target.key.startsWith('MARCIA')
    ? entry.target.documentReturn
    : `${entry.target.documentReturn} / ${entry.parcel.stratoFraction}`
  const history = [
    `Recebimento Strato ${PLAN.returnFile}`,
    `parcela ${entry.parcel.stratoFraction}`,
    `nominal R$ ${moneyBrFromCents(p.nominalCents)}`,
    p.discountCents ? `desconto R$ ${moneyBrFromCents(p.discountCents)}` : null,
    p.interestCents ? `juros R$ ${moneyBrFromCents(p.interestCents)}` : null,
    `líquido R$ ${moneyBrFromCents(p.paidCents)}`,
    `boleto ${entry.target.boleto}`,
    `recebido em ${PLAN.receiptDate}`,
    entry.target.client,
  ].filter(Boolean).join(' - ')
  const lineOrigin = entry.target.returnLine === 2 ? 2 : 70000 + p.number

  const { rows } = await client.query(
    `INSERT INTO fin_movimento
      (data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
       conta_contabil, centro_custo, obra, natureza_financeira,
       dia, mes, ano, tipo_lancamento, vencimento, banco_conta_id,
       lote_importacao, arquivo_origem, linha_origem, hash_importacao, importado_em)
     VALUES
      ($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'financeiro',$15,$16,$17,$18,$19,$20,NOW())
     RETURNING id, to_char(data::date,'YYYY-MM-DD') AS data, entradas, saidas, lote_importacao, hash_importacao`,
    [
      PLAN.receiptDate,
      PLAN.company,
      bankName,
      centsToNumber(p.paidCents),
      entry.target.client,
      history,
      document,
      account,
      project,
      project,
      nature,
      day,
      month,
      year,
      p.dueDate,
      bankAccount.id,
      PLAN.batch,
      `${PLAN.returnFile} | ${PLAN.stratoReport} | SQL Server STRATO`,
      lineOrigin,
      movementHash(entry),
    ],
  )
  if (rows.length !== 1) throw new Error(`Falha ao criar movimento da parcela ${entry.parcel.stratoFraction}.`)
  return rows[0]
}

async function updateParcel(client, entry, parcelRow, movement) {
  const p = entry.parcel.proposed
  const reconciliation = {
    origem: 'correcao_cb230700_lucky_0_5_9',
    lote: PLAN.batch,
    arquivo_retorno: PLAN.returnFile,
    sha256_retorno: PLAN.returnSha256,
    relatorio_strato: PLAN.stratoReport,
    retorno_id: PLAN.returnId,
    retorno_item_id: entry.target.returnItemId,
    linha_retorno: entry.target.returnLine,
    boleto: entry.target.boleto,
    nosso_numero: entry.target.nossoNumero,
    nosso_numero_dv: entry.target.nossoNumeroDv,
    controle_participante: entry.target.controleParticipante,
    parcela_strato: entry.parcel.stratoFraction,
    data_recebimento: PLAN.receiptDate,
    data_credito: PLAN.creditDate,
    valor_nominal: centsToNumber(p.nominalCents),
    valor_desconto: centsToNumber(p.discountCents),
    valor_juros: centsToNumber(p.interestCents),
    valor_recebido: centsToNumber(p.paidCents),
    movimento_id: Number(movement.id),
    movimento_individual: true,
    evidencia_sqlserver: PLAN.sourceEvidence,
    aplicado_em: new Date().toISOString(),
  }
  const note = `Strato ${PLAN.returnFile} — parcela ${entry.parcel.stratoFraction} — nominal R$ ${moneyBrFromCents(p.nominalCents)} — desconto R$ ${moneyBrFromCents(p.discountCents)} — juros R$ ${moneyBrFromCents(p.interestCents)} — recebido R$ ${moneyBrFromCents(p.paidCents)} em ${PLAN.receiptDate} — crédito bancário ${PLAN.creditDate}`
  const additional = {
    strato_confirmacao_0_5_9: {
      banco: 'STRATO',
      core_data_recebimento: PLAN.receiptDate,
      parcela: entry.parcel.stratoFraction,
      desconto_exibivel: centsToNumber(p.discountCents),
      juros_exibiveis: centsToNumber(p.interestCents),
      valor_recebido: centsToNumber(p.paidCents),
      lote: PLAN.batch,
    },
  }

  const { rows } = await client.query(
    `UPDATE com_parcelas
        SET documento_legado=$1,
            parcela_numero_legado=$2,
            parcela_total_legado=$3,
            valor_nominal=$4,
            valor_convertido=$4,
            valor_total_relatorio=$5,
            valor_juros_mora=$6,
            valor_desconto=$7,
            valor_recalculado=NULL,
            status='paga',
            pago_em=$8::date,
            valor_pago=$9,
            forma_pagamento='Boleto',
            observacoes_baixa=$10,
            movimento_id=$11,
            origem_baixa='retorno_bradesco',
            conciliado_em=NOW(),
            conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $12::jsonb,
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $13::jsonb,
            nosso_numero=CASE WHEN $14::boolean THEN $15 ELSE nosso_numero END,
            nosso_numero_dv=CASE WHEN $14::boolean THEN $16 ELSE nosso_numero_dv END,
            controle_participante=CASE WHEN $14::boolean THEN $17 ELSE controle_participante END,
            boleto_status='liquidado',
            updated_at=NOW()
      WHERE id=$18::uuid
        AND tenant_id=$19::uuid
        AND movimento_id IS NULL
        AND LOWER(COALESCE(status,'')) NOT IN ('paga','pago','baixada','baixado','cancelada','cancelado')
      RETURNING id, status, to_char(pago_em::date,'YYYY-MM-DD') AS pago_em,
                valor_nominal, valor_desconto, valor_juros_mora, valor_pago,
                movimento_id, nosso_numero, nosso_numero_dv, controle_participante`,
    [
      p.document,
      p.number,
      p.total,
      centsToNumber(p.nominalCents),
      centsToNumber(p.paidCents),
      centsToNumber(p.interestCents),
      centsToNumber(p.discountCents),
      PLAN.receiptDate,
      centsToNumber(p.paidCents),
      appendNote(parcelRow.observacoes_baixa, note),
      movement.id,
      JSON.stringify(reconciliation),
      JSON.stringify(additional),
      entry.storeBankIdentifier,
      entry.target.nossoNumero,
      entry.target.nossoNumeroDv,
      entry.target.controleParticipante,
      entry.parcel.id,
      PLAN.tenantId,
    ],
  )
  if (rows.length !== 1) throw new Error(`Parcela ${entry.parcel.stratoFraction} não foi atualizada; o estado pode ter mudado durante a execução.`)
  return rows[0]
}

async function updateReturnItems(client, movementsByParcelId) {
  for (const target of PLAN.targets) {
    const parcels = target.parcels || [target.parcel]
    const details = parcels.map(parcel => ({
      parcela_id: parcel.id,
      parcela: parcel.stratoFraction,
      movimento_id: Number(movementsByParcelId.get(parcel.id).id),
      valor_nominal: centsToNumber(parcel.proposed.nominalCents),
      desconto: centsToNumber(parcel.proposed.discountCents),
      juros: centsToNumber(parcel.proposed.interestCents),
      valor_recebido: centsToNumber(parcel.proposed.paidCents),
      data_recebimento: PLAN.receiptDate,
    }))
    const first = details[0]
    const totalDiscountCents = parcels.reduce((sum, parcel) => sum + parcel.proposed.discountCents, 0)
    const totalInterestCents = parcels.reduce((sum, parcel) => sum + parcel.proposed.interestCents, 0)
    const data = {
      reparo_larmhub_0_5_9: {
        lote: PLAN.batch,
        movimento_individual_por_parcela: true,
        data_recebimento: PLAN.receiptDate,
        data_credito: PLAN.creditDate,
        desconto_total: centsToNumber(totalDiscountCents),
        juros_total: centsToNumber(totalInterestCents),
        parcelas: details,
        evidencia_sqlserver: PLAN.sourceEvidence,
        aplicado_em: new Date().toISOString(),
      },
    }
    const { rowCount } = await client.query(
      `UPDATE fin_retornos_cobranca_itens
          SET parcela_id=$1::uuid,
              movimento_id=$2,
              status_processamento='liquidado',
              metodo_conciliacao='reparo_strato_sqlserver_0_5_9',
              divergencia_valor=0,
              valor_juros=$3,
              valor_desconto=$4,
              dados=COALESCE(dados,'{}'::jsonb) || $5::jsonb
        WHERE id=$6
          AND retorno_id=$7::uuid
          AND tenant_id=$8::uuid
          AND status_processamento='nao_localizado'`,
      [first.parcela_id, first.movimento_id, centsToNumber(totalInterestCents), centsToNumber(totalDiscountCents), JSON.stringify(data), target.returnItemId, PLAN.returnId, PLAN.tenantId],
    )
    if (rowCount !== 1) throw new Error(`Item ${target.returnItemId} do retorno não foi atualizado.`)
  }
}

async function updateReturnSummary(client, movementIds) {
  const repairData = {
    reparo_cb230700_lucky_0_5_9: {
      lote: PLAN.batch,
      data_recebimento: PLAN.receiptDate,
      data_credito: PLAN.creditDate,
      movimentos_individuais: movementIds.map(Number),
      parcelas_baixadas: allParcelEntries().length,
      descontos_total: centsToNumber(planTotals().discountCents),
      juros_total: centsToNumber(planTotals().interestCents),
      valor_recebido_total: centsToNumber(planTotals().paidCents),
      evidencia_sqlserver: PLAN.sourceEvidence,
      aplicado_em: new Date().toISOString(),
    },
  }
  const { rowCount } = await client.query(
    `WITH agg AS (
       SELECT
         COUNT(*) FILTER (WHERE status_processamento IN ('liquidado','ja_baixado'))::int AS conciliados,
         COUNT(*) FILTER (WHERE status_processamento='nao_localizado')::int AS nao_localizados,
         COALESCE(SUM(valor_pago) FILTER (WHERE status_processamento IN ('liquidado','ja_baixado')),0)::numeric AS valor_liquidado
       FROM fin_retornos_cobranca_itens
       WHERE retorno_id=$1::uuid AND tenant_id=$2::uuid
     )
     UPDATE fin_retornos_cobranca r
        SET quantidade_conciliada=agg.conciliados,
            quantidade_nao_localizada=agg.nao_localizados,
            valor_liquidado=agg.valor_liquidado,
            dados=COALESCE(r.dados,'{}'::jsonb) || $3::jsonb
       FROM agg
      WHERE r.id=$1::uuid AND r.tenant_id=$2::uuid`,
    [PLAN.returnId, PLAN.tenantId, JSON.stringify(repairData)],
  )
  if (rowCount !== 1) throw new Error('Resumo do retorno não foi atualizado.')
}

async function validateInsideTransaction(client, movementIds) {
  const entries = allParcelEntries()
  const ids = entries.map(entry => entry.parcel.id)
  const { rows: [summary] } = await client.query(
    `SELECT
       COUNT(*)::int AS parcelas,
       COUNT(DISTINCT movimento_id)::int AS movimentos_distintos,
       COALESCE(SUM(valor_nominal),0)::numeric AS nominal,
       COALESCE(SUM(valor_desconto),0)::numeric AS desconto,
       COALESCE(SUM(valor_juros_mora),0)::numeric AS juros,
       COALESCE(SUM(valor_pago),0)::numeric AS recebido,
       COUNT(*) FILTER (WHERE status='paga' AND pago_em::date=$3::date)::int AS pagas_na_data
       FROM com_parcelas
      WHERE tenant_id=$1::uuid AND id=ANY($2::uuid[])`,
    [PLAN.tenantId, ids, PLAN.receiptDate],
  )
  const totals = planTotals()
  const errors = []
  if (summary.parcelas !== entries.length) errors.push(`parcelas=${summary.parcelas}`)
  if (summary.movimentos_distintos !== PLAN.expectedMovements) errors.push(`movimentos_distintos=${summary.movimentos_distintos}`)
  if (cents(summary.nominal) !== totals.nominalCents) errors.push(`nominal=${summary.nominal}`)
  if (cents(summary.desconto) !== totals.discountCents) errors.push(`desconto=${summary.desconto}`)
  if (cents(summary.juros) !== totals.interestCents) errors.push(`juros=${summary.juros}`)
  if (cents(summary.recebido) !== totals.paidCents) errors.push(`recebido=${summary.recebido}`)
  if (summary.pagas_na_data !== entries.length) errors.push(`pagas_na_data=${summary.pagas_na_data}`)

  const { rows: [mov] } = await client.query(
    `SELECT COUNT(*)::int AS quantidade,
            COALESCE(SUM(entradas),0)::numeric AS total,
            COUNT(*) FILTER (WHERE data=$2::date)::int AS na_data,
            COUNT(*) FILTER (WHERE COALESCE(saidas,0)=0)::int AS sem_saida
       FROM fin_movimento
      WHERE id=ANY($1::bigint[]) AND lote_importacao=$3`,
    [movementIds, PLAN.receiptDate, PLAN.batch],
  )
  if (mov.quantidade !== PLAN.expectedMovements) errors.push(`movimentos_criados=${mov.quantidade}`)
  if (cents(mov.total) !== totals.paidCents) errors.push(`total_movimentos=${mov.total}`)
  if (mov.na_data !== PLAN.expectedMovements) errors.push(`movimentos_na_data=${mov.na_data}`)
  if (mov.sem_saida !== PLAN.expectedMovements) errors.push(`movimentos_com_saida=${PLAN.expectedMovements - mov.sem_saida}`)

  if (errors.length) throw new Error(`Validação transacional falhou: ${errors.join(', ')}.`)
}

async function main() {
  await connectDB()
  const client = await pool.connect()
  let backupPath = null
  let committed = false

  try {
    await client.query('BEGIN')

    for (const table of ['com_parcelas', 'com_contratos', 'fin_movimento', 'fin_bancos_contas', 'fin_retornos_cobranca', 'fin_retornos_cobranca_itens']) {
      if (!(await tableExists(client, table))) throw new Error(`Tabela obrigatória ausente: ${table}.`)
    }

    const returnRow = await loadReturn(client)
    const bankAccount = await loadBankAccount(client, returnRow)
    const returnItems = await loadReturnItems(client)
    const parcelRows = await loadParcels(client)
    const batchMovements = await loadBatchMovements(client)
    const state = validateCurrentState(parcelRows, returnItems, batchMovements)

    if (state.alreadyApplied) {
      await client.query('ROLLBACK')
      console.log('A correção 0.5.9 já está aplicada integralmente. Nenhum dado foi alterado.')
      return
    }

    printPreview(parcelRows, bankAccount)

    if (!EXECUTE) {
      await client.query('ROLLBACK')
      console.log('')
      console.log('Prévia concluída. Nenhum INSERT, UPDATE ou DELETE foi mantido.')
      console.log(`Para executar: npm run db:fix:cb230700-lucky -- --execute --confirmar=${PLAN.expectedMovements}`)
      return
    }

    if (CONFIRMAR !== PLAN.expectedMovements) {
      throw new Error(`Confirmação inválida. Use --confirmar=${PLAN.expectedMovements}.`)
    }

    backupPath = makeBackupPath()
    const backup = {
      schema: 'larmhub-cb230700-lucky-backup-v1',
      version: PLAN.version,
      batch: PLAN.batch,
      createdAt: new Date().toISOString(),
      status: 'prepared',
      planHash: stableHash(PLAN),
      plan: PLAN,
      returnRow: jsonSafe(returnRow),
      returnItems: jsonSafe(returnItems),
      parcels: jsonSafe(parcelRows),
      batchMovementsBefore: jsonSafe(batchMovements),
    }
    writeBackup(backupPath, backup)

    const movementIds = []
    const movementsByParcelId = new Map()
    const parcelRowById = new Map(parcelRows.map(row => [String(row.id), row]))

    for (const entry of allParcelEntries()) {
      const parcelRow = parcelRowById.get(entry.parcel.id)
      const movement = await createMovement(client, entry, parcelRow, bankAccount)
      movementIds.push(Number(movement.id))
      movementsByParcelId.set(entry.parcel.id, movement)
      await updateParcel(client, entry, parcelRow, movement)
    }

    await updateReturnItems(client, movementsByParcelId)
    await updateReturnSummary(client, movementIds)
    await validateInsideTransaction(client, movementIds)

    await client.query('COMMIT')
    committed = true

    try {
      const finalized = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
      finalized.status = 'committed'
      finalized.committedAt = new Date().toISOString()
      finalized.movementIds = movementIds
      finalized.executionHash = stableHash({ batch: PLAN.batch, movementIds, planHash: finalized.planHash })
      writeBackup(backupPath, finalized)
    } catch (backupError) {
      console.warn(`ATENÇÃO: correção aplicada, mas não foi possível atualizar o status do backup: ${backupError.message}`)
    }

    const totals = planTotals()
    console.log('')
    console.log('CORREÇÃO APLICADA COM SUCESSO')
    console.log(`Parcelas baixadas individualmente: ${allParcelEntries().length}`)
    console.log(`Movimentos bancários individuais: ${movementIds.length}`)
    console.log(`Data de recebimento/movimento: ${PLAN.receiptDate}`)
    console.log(`Desconto total registrado: R$ ${moneyBrFromCents(totals.discountCents)}`)
    console.log(`Juros total registrado: R$ ${moneyBrFromCents(totals.interestCents)}`)
    console.log(`Valor recebido total: R$ ${moneyBrFromCents(totals.paidCents)}`)
    console.log(`Backup para rollback: ${backupPath}`)
    console.log(`Movimentos: ${movementIds.join(', ')}`)
  } catch (error) {
    if (!committed) await client.query('ROLLBACK').catch(() => {})
    console.error(`\nERRO: ${error.message}`)
    if (backupPath) console.error(`Backup preparado: ${backupPath}`)
    console.error(committed ? 'A transação já havia sido confirmada; execute a conferência.' : 'Nada foi gravado no PostgreSQL.')
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error(`\nERRO: ${error.message}`)
  process.exitCode = 1
})
