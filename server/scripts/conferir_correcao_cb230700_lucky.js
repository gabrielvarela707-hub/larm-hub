#!/usr/bin/env node
'use strict'

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const { PLAN, allParcelEntries, moneyBrFromCents } = require('./cb230700_lucky_plan')

function cents(value) { return Math.round(Number(value || 0) * 100) }
function dateOnly(value) { return value == null ? null : String(value).slice(0, 10) }
function money(value) { return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function totals() {
  return allParcelEntries().reduce((acc, entry) => {
    acc.nominal += entry.parcel.proposed.nominalCents
    acc.discount += entry.parcel.proposed.discountCents
    acc.interest += entry.parcel.proposed.interestCents
    acc.paid += entry.parcel.proposed.paidCents
    return acc
  }, { nominal: 0, discount: 0, interest: 0, paid: 0 })
}

async function main() {
  await connectDB()
  const client = await pool.connect()
  try {
    await client.query('BEGIN TRANSACTION READ ONLY')

    const ids = allParcelEntries().map(entry => entry.parcel.id)
    const { rows: parcels } = await client.query(
      `SELECT p.id, p.documento_legado, p.parcela_numero_legado, p.parcela_total_legado,
              to_char(p.vencimento::date,'YYYY-MM-DD') AS vencimento,
              p.valor_nominal, p.valor_desconto, p.valor_juros_mora, p.valor_pago,
              p.status, to_char(p.pago_em::date,'YYYY-MM-DD') AS pago_em,
              p.movimento_id, p.nosso_numero, p.nosso_numero_dv, p.controle_participante,
              p.origem_baixa, p.boleto_status, p.conciliacao_dados,
              c.numero AS contrato,
              COALESCE(cp.nome, cp.razao_social, c.comprador_nome) AS cliente,
              to_char(m.data::date,'YYYY-MM-DD') AS movimento_data, m.entradas, m.saidas, m.lote_importacao,
              m.banco_conta_id, m.historico
         FROM com_parcelas p
         JOIN com_contratos c ON c.id=p.contrato_id
         LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
         LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
         LEFT JOIN fin_movimento m ON m.id=p.movimento_id
        WHERE p.tenant_id=$1::uuid AND p.id=ANY($2::uuid[])
        ORDER BY c.numero, p.parcela_numero_legado`,
      [PLAN.tenantId, ids],
    )

    const expectedById = new Map(allParcelEntries().map(entry => [entry.parcel.id, entry]))
    const errors = []
    for (const row of parcels) {
      const entry = expectedById.get(String(row.id))
      if (!entry) continue
      const p = entry.parcel.proposed
      if (row.documento_legado !== p.document) errors.push(`${entry.parcel.stratoFraction}: documento`)
      if (Number(row.parcela_numero_legado) !== p.number || Number(row.parcela_total_legado) !== p.total) errors.push(`${entry.parcel.stratoFraction}: fração`)
      if (dateOnly(row.vencimento) !== p.dueDate) errors.push(`${entry.parcel.stratoFraction}: vencimento`)
      if (cents(row.valor_nominal) !== p.nominalCents) errors.push(`${entry.parcel.stratoFraction}: nominal`)
      if (cents(row.valor_desconto) !== p.discountCents) errors.push(`${entry.parcel.stratoFraction}: desconto`)
      if (cents(row.valor_juros_mora) !== p.interestCents) errors.push(`${entry.parcel.stratoFraction}: juros`)
      if (cents(row.valor_pago) !== p.paidCents) errors.push(`${entry.parcel.stratoFraction}: valor pago`)
      if (String(row.status).toLowerCase() !== 'paga') errors.push(`${entry.parcel.stratoFraction}: status`)
      if (dateOnly(row.pago_em) !== PLAN.receiptDate) errors.push(`${entry.parcel.stratoFraction}: data recebimento`)
      if (dateOnly(row.movimento_data) !== PLAN.receiptDate) errors.push(`${entry.parcel.stratoFraction}: data movimento`)
      if (cents(row.entradas) !== p.paidCents || cents(row.saidas) !== 0) errors.push(`${entry.parcel.stratoFraction}: movimento`)
      if (row.lote_importacao !== PLAN.batch) errors.push(`${entry.parcel.stratoFraction}: lote`)
      if (row.origem_baixa !== 'retorno_bradesco') errors.push(`${entry.parcel.stratoFraction}: origem baixa`)
      if (row.boleto_status !== 'liquidado') errors.push(`${entry.parcel.stratoFraction}: boleto status`)
    }

    if (parcels.length !== ids.length) errors.push(`quantidade de parcelas ${parcels.length}/${ids.length}`)
    const movementIds = parcels.map(row => row.movimento_id).filter(Boolean)
    if (new Set(movementIds.map(String)).size !== PLAN.expectedMovements) errors.push('movimentos não são individuais')

    const { rows: [summary] } = await client.query(
      `SELECT COUNT(*)::int AS parcelas,
              COUNT(DISTINCT movimento_id)::int AS movimentos,
              COALESCE(SUM(valor_nominal),0)::numeric AS nominal,
              COALESCE(SUM(valor_desconto),0)::numeric AS desconto,
              COALESCE(SUM(valor_juros_mora),0)::numeric AS juros,
              COALESCE(SUM(valor_pago),0)::numeric AS recebido
         FROM com_parcelas
        WHERE tenant_id=$1::uuid AND id=ANY($2::uuid[])`,
      [PLAN.tenantId, ids],
    )
    const expected = totals()
    if (summary.parcelas !== ids.length) errors.push('resumo parcelas')
    if (summary.movimentos !== PLAN.expectedMovements) errors.push('resumo movimentos')
    if (cents(summary.nominal) !== expected.nominal) errors.push('resumo nominal')
    if (cents(summary.desconto) !== expected.discount) errors.push('resumo desconto')
    if (cents(summary.juros) !== expected.interest) errors.push('resumo juros')
    if (cents(summary.recebido) !== expected.paid) errors.push('resumo recebido')

    const { rows: items } = await client.query(
      `SELECT id, status_processamento, parcela_id, movimento_id, metodo_conciliacao,
              valor_juros, valor_desconto, dados
         FROM fin_retornos_cobranca_itens
        WHERE retorno_id=$1::uuid AND tenant_id=$2::uuid AND id=ANY($3::bigint[])
        ORDER BY id`,
      [PLAN.returnId, PLAN.tenantId, PLAN.targets.map(target => target.returnItemId)],
    )
    for (const item of items) {
      if (item.status_processamento !== 'liquidado') errors.push(`item ${item.id}: status`)
      if (!item.parcela_id || !item.movimento_id) errors.push(`item ${item.id}: vínculos`)
      if (item.metodo_conciliacao !== 'reparo_strato_sqlserver_0_5_9') errors.push(`item ${item.id}: método`)
    }
    if (items.length !== PLAN.targets.length) errors.push('itens do retorno')

    const { rows: [ret] } = await client.query(
      `SELECT quantidade_registros, quantidade_conciliada, quantidade_nao_localizada,
              valor_liquidado, dados
         FROM fin_retornos_cobranca
        WHERE id=$1::uuid AND tenant_id=$2::uuid`,
      [PLAN.returnId, PLAN.tenantId],
    )
    if (!ret) errors.push('retorno não encontrado')
    else {
      if (Number(ret.quantidade_conciliada) !== 6) errors.push(`retorno conciliados=${ret.quantidade_conciliada}`)
      if (Number(ret.quantidade_nao_localizada) !== 0) errors.push(`retorno não localizados=${ret.quantidade_nao_localizada}`)
    }

    console.log('CONFERÊNCIA CB230700 LUCKY — 0.5.9')
    console.table(parcels.map(row => ({
      cliente: row.cliente,
      parcela: `${row.parcela_numero_legado}/${row.parcela_total_legado}`,
      nominal: `R$ ${money(row.valor_nominal)}`,
      desconto: `R$ ${money(row.valor_desconto)}`,
      juros: `R$ ${money(row.valor_juros_mora)}`,
      recebido: `R$ ${money(row.valor_pago)}`,
      data: row.pago_em,
      movimento: row.movimento_id,
      lote: row.lote_importacao,
    })))
    console.log(`Parcelas: ${summary.parcelas}/${ids.length}`)
    console.log(`Movimentos individuais: ${summary.movimentos}/${PLAN.expectedMovements}`)
    console.log(`Total nominal: R$ ${moneyBrFromCents(expected.nominal)}`)
    console.log(`Total desconto: R$ ${moneyBrFromCents(expected.discount)}`)
    console.log(`Total juros: R$ ${moneyBrFromCents(expected.interest)}`)
    console.log(`Total recebido: R$ ${moneyBrFromCents(expected.paid)}`)
    console.log(`Retorno: ${ret?.quantidade_conciliada || 0} conciliados; ${ret?.quantidade_nao_localizada || 0} não localizados.`)

    await client.query('ROLLBACK')
    if (errors.length) {
      throw new Error(`Conferência encontrou divergências:\n- ${errors.join('\n- ')}`)
    }
    console.log('✅ Correção conferida: 11 baixas e 11 movimentos individuais em 22/07/2026, com descontos e juros separados.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`\nERRO: ${error.message}`)
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
