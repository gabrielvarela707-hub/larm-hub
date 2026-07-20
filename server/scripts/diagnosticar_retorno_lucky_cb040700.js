#!/usr/bin/env node
'use strict'

/**
 * Diagnóstico seguro — Retorno Bradesco LUCKY CB040700.RET.
 *
 * Não altera dados. Procura as linhas não localizadas do retorno de 03/07/2026:
 * - BRUNO PEDOTT
 * - INEZ PALANDI
 *
 * Uso:
 *   node scripts/diagnosticar_retorno_lucky_cb040700.js
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')

const TARGETS = [
  {
    ref: 'INEZ_P_059_120',
    cliente_relatorio: 'INEZ PALANDI',
    codigo_legado_cliente: '1310',
    linha: 3,
    ocorrencia: '06',
    nosso_numero: '26000038970',
    nosso_numero_dv: '0',
    controle: '97687',
    documento: 'P 059/120',
    vencimento: '2026-06-26',
    valor: 1466.72,
  },
  {
    ref: 'BRUNO_P_059_120',
    cliente_relatorio: 'BRUNO PEDOTT',
    codigo_legado_cliente: '1311',
    linha: 4,
    ocorrencia: '06',
    nosso_numero: '26000038971',
    nosso_numero_dv: '9',
    controle: '97828',
    documento: 'P 059/120',
    vencimento: '2026-06-26',
    valor: 1466.72,
  },
  {
    ref: 'INEZ_BOLETO_CONSOLIDADO_005_010_060_120',
    cliente_relatorio: 'INEZ PALANDI',
    codigo_legado_cliente: '1310',
    linha: 5,
    ocorrencia: '06',
    nosso_numero: '26000039081',
    nosso_numero_dv: '4',
    controle: '98048',
    documento: 'A 005/010',
    documentos_possiveis: ['A 005/010', '005/010', 'P 060/120', '060/120'],
    vencimento: '2026-07-26',
    valor: 3497.43,
    observacao: 'No relatório Strato esse boleto aparece dividido em 2 parcelas: 2.053,15 + 1.444,28.',
  },
  {
    ref: 'BRUNO_BOLETO_CONSOLIDADO_005_010_060_120',
    cliente_relatorio: 'BRUNO PEDOTT',
    codigo_legado_cliente: '1311',
    linha: 6,
    ocorrencia: '06',
    nosso_numero: '26000039082',
    nosso_numero_dv: '2',
    controle: '97829',
    documento: 'P 060/120',
    documentos_possiveis: ['A 005/010', '005/010', 'P 060/120', '060/120'],
    vencimento: '2026-07-26',
    valor: 3497.43,
    observacao: 'No relatório Strato esse boleto aparece dividido em 2 parcelas: 2.053,15 + 1.444,28.',
  },
]

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

function tokens(value) {
  return normalizeText(value).split(' ').filter(token => token.length >= 3)
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

function billingCompanySql(parcelAlias = 'p', contractAlias = 'c') {
  return `CASE
    WHEN COALESCE(${contractAlias}.obra_codigo_legado, ${parcelAlias}.obra_codigo_legado) = 7698 THEN 'LUCKY'
    WHEN COALESCE(${contractAlias}.obra_codigo_legado, ${parcelAlias}.obra_codigo_legado) IN (7700, 7701) THEN 'LARM'
    ELSE NULL
  END`
}

async function tableExists(client, tableName) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`])
  return Boolean(row?.reg)
}

function baseSelect() {
  return `SELECT
    p.id AS parcela_id,
    p.status,
    p.vencimento::date AS vencimento,
    p.tipo,
    p.numero,
    p.valor_nominal,
    ${receivableValueSql('p')}::numeric AS valor_atual,
    p.valor_pago,
    p.pago_em,
    p.movimento_id,
    p.nosso_numero,
    p.nosso_numero_dv,
    p.controle_participante,
    p.documento_legado,
    p.parcela_numero_legado,
    p.parcela_total_legado,
    c.numero AS contrato,
    c.titulo AS contrato_titulo,
    c.obra_codigo_legado,
    COALESCE(cp.nome, cp.razao_social, c.comprador_nome, 'Cliente não identificado') AS cliente,
    ${billingCompanySql('p','c')} AS empresa
  FROM com_parcelas p
  JOIN com_contratos c ON c.id=p.contrato_id
  LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
  LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id`
}

async function byIdentifiers(client, target) {
  const fullNosso = `${target.nosso_numero}${target.nosso_numero_dv || ''}`
  const params = [target.nosso_numero, fullNosso, target.controle || '', target.documento, target.vencimento, target.valor]
  const { rows } = await client.query(
    `${baseSelect()}
     WHERE ${billingCompanySql('p','c')}='LUCKY'
       AND (
         regexp_replace(COALESCE(p.nosso_numero,''), '[^0-9]', '', 'g') IN ($1, $2)
         OR NULLIF($3,'') IS NOT NULL AND p.controle_participante=$3
         OR (
           p.vencimento::date=$5::date
           AND ABS(${receivableValueSql('p')} - $6::numeric) < 0.02
           AND (
             COALESCE(p.documento_legado,'') ILIKE $4
             OR COALESCE(p.documento_legado,'') ILIKE '%' || replace($4, ' ', '') || '%'
           )
         )
       )
     ORDER BY
       CASE WHEN regexp_replace(COALESCE(p.nosso_numero,''), '[^0-9]', '', 'g') IN ($1,$2) THEN 0 ELSE 1 END,
       CASE WHEN NULLIF($3,'') IS NOT NULL AND p.controle_participante=$3 THEN 0 ELSE 1 END,
       CASE WHEN p.vencimento::date=$5::date THEN 0 ELSE 1 END,
       ABS(${receivableValueSql('p')} - $6::numeric)
     LIMIT 25`,
    params,
  )
  return rows
}

async function byName(client, target) {
  const ts = tokens(target.cliente_relatorio)
  if (!ts.length) return []
  const params = [target.vencimento, target.valor, ...ts.map(token => `%${token}%`)]
  const nameConditions = ts.map((_, index) => {
    const param = `$${index + 3}`
    return `(COALESCE(cp.nome,'') ILIKE ${param} OR COALESCE(cp.razao_social,'') ILIKE ${param} OR COALESCE(c.comprador_nome,'') ILIKE ${param})`
  }).join(' AND ')

  const { rows } = await client.query(
    `${baseSelect()}
     WHERE ${billingCompanySql('p','c')}='LUCKY'
       AND ${nameConditions}
       AND LOWER(COALESCE(p.status,'')) NOT IN ('cancelada','cancelado','c')
     ORDER BY
       CASE WHEN p.vencimento::date=$1::date THEN 0 ELSE 1 END,
       ABS(${receivableValueSql('p')} - $2::numeric),
       p.vencimento,
       p.id
     LIMIT 30`,
    params,
  )
  return rows
}

async function bySplitSum(client, target) {
  const ts = tokens(target.cliente_relatorio)
  if (!ts.length) return []
  const fullNosso = `${target.nosso_numero}${target.nosso_numero_dv || ''}`
  const params = [target.nosso_numero, fullNosso, target.controle || '', target.vencimento, target.valor, ...ts.map(token => `%${token}%`)]
  const nameConditions = ts.map((_, index) => {
    const param = `$${index + 6}`
    return `(COALESCE(cp.nome,'') ILIKE ${param} OR COALESCE(cp.razao_social,'') ILIKE ${param} OR COALESCE(c.comprador_nome,'') ILIKE ${param})`
  }).join(' AND ')

  const { rows } = await client.query(
    `SELECT
       c.id AS contrato_id,
       c.numero AS contrato,
       COALESCE(cp.nome, cp.razao_social, c.comprador_nome, 'Cliente não identificado') AS cliente,
       p.vencimento::date AS vencimento,
       regexp_replace(COALESCE(p.nosso_numero,''), '[^0-9]', '', 'g') AS nosso_numero,
       p.controle_participante,
       COUNT(*)::int AS qtd_parcelas,
       SUM(${receivableValueSql('p')})::numeric AS soma_valor,
       ARRAY_AGG(p.id ORDER BY p.id) AS parcelas,
       ARRAY_AGG(COALESCE(p.documento_legado, CONCAT(p.tipo, ' ', p.numero)) ORDER BY p.id) AS documentos,
       ARRAY_AGG(COALESCE(p.status,'') ORDER BY p.id) AS status
     FROM com_parcelas p
     JOIN com_contratos c ON c.id=p.contrato_id
     LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
     LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
     WHERE ${billingCompanySql('p','c')}='LUCKY'
       AND p.vencimento::date=$4::date
       AND (${nameConditions})
       AND (
         regexp_replace(COALESCE(p.nosso_numero,''), '[^0-9]', '', 'g') IN ($1,$2)
         OR NULLIF($3,'') IS NOT NULL AND p.controle_participante=$3
         OR TRUE
       )
     GROUP BY c.id, c.numero, cliente, p.vencimento::date, regexp_replace(COALESCE(p.nosso_numero,''), '[^0-9]', '', 'g'), p.controle_participante
     HAVING ABS(SUM(${receivableValueSql('p')}) - $5::numeric) < 0.05
     ORDER BY qtd_parcelas DESC, ABS(SUM(${receivableValueSql('p')}) - $5::numeric)
     LIMIT 20`,
    params,
  )
  return rows
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name=$1
      ORDER BY ordinal_position`,
    [tableName],
  )
  return rows.map(row => row.column_name)
}

function firstExisting(columns, candidates) {
  return candidates.find(column => columns.includes(column)) || null
}

function sqlTextColumn(column, alias = '') {
  if (!column) return `NULL`
  return `${alias}${column}::text`
}

function sqlNumericColumn(column, alias = '') {
  if (!column) return `NULL::numeric`
  return `NULLIF(regexp_replace(${alias}${column}::text, '[^0-9,.-]', '', 'g'), '')::numeric`
}

function sqlDateColumn(column, alias = '') {
  if (!column) return `NULL::date`
  return `${alias}${column}::date`
}

async function legacyRows(client, target) {
  if (!(await tableExists(client, 'ts1_core'))) return []

  const columns = await getColumns(client, 'ts1_core')

  const colControle = firstExisting(columns, ['core1_cod', 'core1_controle', 'core1_num_contr', 'core1_nosso_numero'])
  const colBoleto = firstExisting(columns, ['core1_bol', 'core1_boleto', 'core1_nosnum', 'core1_nos_num', 'core1_nosso_numero'])
  const colVencimento = firstExisting(columns, ['core1_dat_ven', 'core1_vencimento', 'core1_venc', 'core1_dtvenc'])
  const colDocumento = firstExisting(columns, ['core1_doc_num', 'core1_documento', 'core1_doc', 'core1_parcela'])
  const colValor = firstExisting(columns, [
    'core1_valor',
    'core1_vlr',
    'core1_val',
    'core1_vlrpar',
    'core1_vlr_par',
    'core1_valpar',
    'core1_val_par',
    'core1_vlr_tit',
    'core1_val_tit',
    'core1_total',
    'core1_vlrtot',
  ])
  const colClienteCodigo = firstExisting(columns, ['vend1_cod', 'cli1_cod', 'cust1_cod', 'cliente_cod'])

  const fullNosso = `${target.nosso_numero}${target.nosso_numero_dv || ''}`

  const whereParts = []
  const orderParts = []
  const params = []

  if (colControle) {
    params.push(target.controle || '')
    whereParts.push(`(NULLIF($${params.length},'') IS NOT NULL AND ${colControle}::text=$${params.length})`)
    orderParts.push(`CASE WHEN NULLIF($${params.length},'') IS NOT NULL AND ${colControle}::text=$${params.length} THEN 0 ELSE 1 END`)
  }

  if (colBoleto) {
    params.push(target.nosso_numero)
    const pNosso = params.length
    params.push(fullNosso)
    const pFullNosso = params.length
    whereParts.push(`regexp_replace(COALESCE(${colBoleto}::text,''), '[^0-9]', '', 'g') IN ($${pNosso}, $${pFullNosso})`)
    orderParts.push(`CASE WHEN regexp_replace(COALESCE(${colBoleto}::text,''), '[^0-9]', '', 'g') IN ($${pNosso}, $${pFullNosso}) THEN 0 ELSE 1 END`)
  }

  if (colVencimento && colValor) {
    params.push(target.vencimento)
    const pVenc = params.length
    params.push(target.valor)
    const pValor = params.length
    whereParts.push(`(${colVencimento}::date=$${pVenc}::date AND ABS(COALESCE(${sqlNumericColumn(colValor)},0) - $${pValor}::numeric) < 0.10)`)
    orderParts.push(`CASE WHEN ${colVencimento}::date=$${pVenc}::date THEN 0 ELSE 1 END`)
    orderParts.push(`ABS(COALESCE(${sqlNumericColumn(colValor)},0) - $${pValor}::numeric)`)
  } else if (colVencimento) {
    params.push(target.vencimento)
    const pVenc = params.length
    whereParts.push(`${colVencimento}::date=$${pVenc}::date`)
    orderParts.push(`CASE WHEN ${colVencimento}::date=$${pVenc}::date THEN 0 ELSE 1 END`)
  }

  if (!whereParts.length) {
    return [{
      legacy_note: `ts1_core existe, mas não encontrei colunas conhecidas. Colunas disponíveis: ${columns.slice(0, 80).join(', ')}`,
    }]
  }

  const sql = `SELECT
        ${sqlTextColumn(colClienteCodigo)} AS vend1_cod,
        ${sqlTextColumn(colControle)} AS core1_cod,
        regexp_replace(COALESCE(${sqlTextColumn(colBoleto)}, ''), '[^0-9]', '', 'g') AS core1_bol,
        ${sqlDateColumn(colVencimento)} AS vencimento,
        ${sqlTextColumn(colDocumento)} AS documento,
        ${sqlNumericColumn(colValor)} AS valor
       FROM ts1_core
      WHERE ${whereParts.join(' OR ')}
      ORDER BY ${orderParts.length ? orderParts.join(', ') : '1'}
      LIMIT 30`

  const { rows } = await client.query(sql, params)

  if (!rows.length) {
    rows.push({
      legacy_note:
        `Nenhum registro encontrado em ts1_core. Colunas usadas: ` +
        `controle=${colControle || '-'}, boleto=${colBoleto || '-'}, vencimento=${colVencimento || '-'}, ` +
        `documento=${colDocumento || '-'}, valor=${colValor || '-'}, cliente=${colClienteCodigo || '-'}`,
    })
  }

  return rows
}

function printRows(rows) {
  if (!rows.length) {
    console.log('  - nenhum registro encontrado')
    return
  }
  for (const row of rows) {
    console.log(`  - parcela=${row.parcela_id || '-'} contrato=${row.contrato || '-'} cliente=${row.cliente || '-'} status=${row.status || '-'} venc=${String(row.vencimento || '').slice(0,10) || '-'} valor=${money(row.valor_atual ?? row.valor)} nosso=${row.nosso_numero || row.core1_bol || '-'} controle=${row.controle_participante || row.core1_cod || '-'} mov=${row.movimento_id || '-'}`)
  }
}

function printSplitRows(rows) {
  if (!rows.length) {
    console.log('  - nenhuma combinação de parcelas somando o valor do boleto foi encontrada')
    return
  }
  for (const row of rows) {
    console.log(`  - contrato=${row.contrato || '-'} cliente=${row.cliente || '-'} venc=${String(row.vencimento || '').slice(0,10)} soma=R$ ${money(row.soma_valor)} qtd=${row.qtd_parcelas} nosso=${row.nosso_numero || '-'} controle=${row.controle_participante || '-'} parcelas=${JSON.stringify(row.parcelas)} docs=${JSON.stringify(row.documentos)} status=${JSON.stringify(row.status)}`)
  }
}

async function main() {
  await connectDB()
  const client = await pool.connect()
  try {
    console.log('DIAGNÓSTICO — LUCKY / CB040700.RET / NÃO LOCALIZADOS')
    console.log('Modo somente leitura. Nenhuma baixa será criada.\n')

    for (const target of TARGETS) {
      console.log(`========== linha ${target.linha} | ${target.ref} | ${target.cliente_relatorio} ==========`)
      console.log(`Documento: ${target.documento} | vencimento: ${target.vencimento} | valor: R$ ${money(target.valor)} | nosso: ${target.nosso_numero}-${target.nosso_numero_dv || ''} | controle: ${target.controle || '-'}`)
      if (target.observacao) console.log(`OBS: ${target.observacao}`)

      console.log('Por nosso número / controle / documento:')
      printRows(await byIdentifiers(client, target))

      console.log('Por nome do relatório Strato/Bradesco:')
      printRows(await byName(client, target))

      console.log('Combinações de parcelas que somam o valor do boleto:')
      printSplitRows(await bySplitSum(client, target))

      console.log('Na base legada ts1_core, se existir:')
      const legacy = await legacyRows(client, target)
      if (!legacy.length) console.log('  - nenhum registro encontrado')
      for (const row of legacy) {
        if (row.legacy_note) {
          console.log(`  - ${row.legacy_note}`)
          continue
        }
        console.log(`  - vend1_cod=${row.vend1_cod || '-'} core1_cod=${row.core1_cod || '-'} bol=${row.core1_bol || '-'} venc=${String(row.vencimento || '').slice(0,10) || '-'} doc=${row.documento || '-'} valor=${money(row.valor)}`)
      }
      console.log('')
    }

    console.log('LEITURA ESPERADA')
    console.log('- Se aparecer em "Por nome" ou "Combinações", o cliente/contrato existe e falta ajustar identificador ou baixa consolidada.')
    console.log('- Se aparecer só em ts1_core, a carga do legado não levou essa parcela para com_parcelas.')
    console.log('- Se não aparecer em nenhum bloco, precisa importar contrato/recebível desses clientes antes de baixar.')
  } catch (error) {
    console.error(`ERRO: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
