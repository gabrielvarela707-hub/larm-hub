#!/usr/bin/env node
'use strict'

/**
 * Reparo seguro — LUCKY / Bradesco / CB040700.RET.
 *
 * Resolve os quatro títulos não localizados do retorno LUCKY CB040700.RET:
 * - INEZ PALANDI  P 059/120  R$ 1.466,72
 * - BRUNO PEDOTT  P 059/120  R$ 1.466,72
 * - INEZ PALANDI  boleto consolidado 005/010 + 060/120  R$ 3.497,43
 * - BRUNO PEDOTT  boleto consolidado 005/010 + 060/120  R$ 3.497,43
 *
 * O diagnóstico mostrou que clientes/contratos/parcelas existem em com_parcelas,
 * mas estão sem nosso_numero/controle_participante. Dois boletos são consolidados
 * em duas parcelas no Strato.
 *
 * Uso:
 *   node scripts/seed_reparar_lucky_cb040700_nao_localizados.js
 *   node scripts/seed_reparar_lucky_cb040700_nao_localizados.js --execute --confirmar=N
 *   node scripts/seed_reparar_lucky_cb040700_nao_localizados.js --data-movimento=2026-07-03 --execute --confirmar=N
 */

require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')

const EXECUTE = process.argv.includes('--execute')
const args = new Map(
  process.argv.slice(2)
    .filter(arg => arg.startsWith('--') && arg.includes('='))
    .map(arg => {
      const [key, ...rest] = arg.slice(2).split('=')
      return [key, rest.join('=')]
    })
)
const CONFIRMAR = args.has('confirmar') ? Number(args.get('confirmar')) : null
const DATA_OCORRENCIA = args.get('data-ocorrencia') || '2026-07-03'
const DATA_CREDITO = args.get('data-credito') || '2026-07-04'
const DATA_MOVIMENTO_ARG = args.get('data-movimento') || null
const DRY_LIMIT_DETAILS = Number(args.get('detalhes') || 50)

const TARGETS = [
  {
    ref: 'INEZ_P_059_120',
    linha: 3,
    cliente: 'INEZ PALANDI',
    contrato: 'STR-1184-F-2',
    documento: 'P 059/120',
    vencimento: '2026-06-26',
    nosso_numero: '26000038970',
    nosso_numero_dv: '0',
    controle: '97687',
    valor_pago: 1466.72,
    componentes: [{ valor_parcela: 1444.28, valor_pago: 1466.72, documento: 'P 059/120' }],
  },
  {
    ref: 'BRUNO_P_059_120',
    linha: 4,
    cliente: 'BRUNO PEDOTT',
    contrato: 'STR-1185-F-3',
    documento: 'P 059/120',
    vencimento: '2026-06-26',
    nosso_numero: '26000038971',
    nosso_numero_dv: '9',
    controle: '97828',
    valor_pago: 1466.72,
    componentes: [{ valor_parcela: 1444.28, valor_pago: 1466.72, documento: 'P 059/120' }],
  },
  {
    ref: 'INEZ_CONSOLIDADO_005_010_060_120',
    linha: 5,
    cliente: 'INEZ PALANDI',
    contrato: 'STR-1184-F-2',
    documento: '005/010 + 060/120',
    vencimento: '2026-07-26',
    nosso_numero: '26000039081',
    nosso_numero_dv: '4',
    controle: '98048',
    valor_pago: 3497.43,
    componentes: [
      { valor_parcela: 2053.15, valor_pago: 2053.15, documento: '005/010' },
      { valor_parcela: 1444.28, valor_pago: 1444.28, documento: '060/120' },
    ],
  },
  {
    ref: 'BRUNO_CONSOLIDADO_005_010_060_120',
    linha: 6,
    cliente: 'BRUNO PEDOTT',
    contrato: 'STR-1185-F-3',
    documento: '005/010 + 060/120',
    vencimento: '2026-07-26',
    nosso_numero: '26000039082',
    nosso_numero_dv: '2',
    controle: '97829',
    valor_pago: 3497.43,
    componentes: [
      { valor_parcela: 2053.15, valor_pago: 2053.15, documento: '005/010' },
      { valor_parcela: 1444.28, valor_pago: 1444.28, documento: '060/120' },
    ],
  },
]

function isIsoDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) }
function roundMoney(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100 }
function moneyBr(value) { return Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function normalizeValue(value, max = 240) { const text = String(value || '').trim().replace(/\s+/g, ' '); return text.slice(0, max) || null }

async function tableExists(client, tableName) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS reg', [`public.${tableName}`])
  return Boolean(row?.reg)
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    [tableName],
  )
  return new Set(rows.map(row => row.column_name))
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

function statusOpenSql(alias = 'p') {
  return `LOWER(COALESCE(${alias}.status,'')) NOT IN ('cancelada','cancelado','c','paga','pago','baixada','baixado')`
}

async function getBankAccount(client) {
  const { rows } = await client.query(
    `SELECT id, empresa, banco_nome, codigo_banco, agencia, conta, digito, ativo
       FROM fin_bancos_contas
      WHERE ativo IS DISTINCT FROM FALSE
        AND UPPER(COALESCE(empresa,''))='LUCKY'
        AND (
          regexp_replace(COALESCE(codigo_banco,''), '[^0-9]', '', 'g')='237'
          OR banco_nome ILIKE '%BRADESCO%'
        )
      ORDER BY
        CASE WHEN regexp_replace(COALESCE(codigo_banco,''), '[^0-9]', '', 'g')='237' THEN 0 ELSE 1 END,
        id`,
  )
  if (rows.length === 1) return rows[0]
  const exact = rows.filter(row => String(row.codigo_banco || '').replace(/\D/g, '') === '237')
  if (exact.length === 1) return exact[0]
  throw new Error(`Conta bancária Bradesco da LUCKY não identificada de forma única. Encontradas: ${rows.length}.`)
}

async function inferMovementDate(client) {
  if (DATA_MOVIMENTO_ARG) return DATA_MOVIMENTO_ARG
  const knownValues = [1218.95, 1097.02, 1607.05, 1558.33]
  const { rows } = await client.query(
    `SELECT to_char(data::date, 'YYYY-MM-DD') AS data, COUNT(*)::int AS total
       FROM fin_movimento
      WHERE data::date BETWEEN '2026-07-03'::date AND '2026-07-05'::date
        AND UPPER(COALESCE(empresa,''))='LUCKY'
        AND (
          banco_conta_id IS NOT NULL
          OR UPPER(COALESCE(banco,'')) LIKE '%BRADESCO%'
        )
        AND COALESCE(saidas,0)=0
        AND EXISTS (
          SELECT 1 FROM unnest($1::numeric[]) AS v(valor)
          WHERE ABS(COALESCE(fin_movimento.entradas,0) - v.valor) < 0.02
        )
      GROUP BY data::date
      ORDER BY total DESC, data::date DESC
      LIMIT 1`,
    [knownValues],
  )
  return rows[0]?.data || DATA_CREDITO
}

async function getParcelCandidates(client, target, component) {
  const { rows } = await client.query(
    `SELECT
        p.id AS parcela_id,
        p.tenant_id,
        p.status,
        p.vencimento::date AS vencimento,
        p.numero,
        p.tipo,
        p.valor_nominal,
        p.valor_recalculado,
        p.valor_pago,
        p.pago_em,
        p.movimento_id,
        p.origem_baixa,
        p.forma_pagamento,
        p.observacoes_baixa,
        p.boleto_status,
        p.conciliacao_dados,
        p.documento_legado,
        p.parcela_numero_legado,
        p.parcela_total_legado,
        p.nosso_numero,
        p.nosso_numero_dv,
        p.controle_participante,
        c.id AS contrato_id,
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
        ) AS obra_nome,
        ${billingCompanySql('p','c')} AS empresa_cobranca,
        ${receivableValueSql('p')}::numeric AS valor_atual
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
       LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
       LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
       LEFT JOIN fin_receitas rec ON rec.id=p.receita_id
       LEFT JOIN fin_plano_contas pc ON pc.id=rec.plano_conta_id
       LEFT JOIN cad_produtos unidade ON unidade.id=p.produto_id
       LEFT JOIN cad_produtos obra ON obra.id=unidade.produto_pai_id
      WHERE ${billingCompanySql('p','c')}='LUCKY'
        AND c.numero=$1
        AND p.vencimento::date=$2::date
        AND ${statusOpenSql('p')}
        AND p.movimento_id IS NULL
        AND ABS(${receivableValueSql('p')}::numeric - $3::numeric) < 0.02
      ORDER BY p.id
      FOR UPDATE OF p`,
    [target.contrato, target.vencimento, roundMoney(component.valor_parcela)],
  )
  return rows
}

async function resolveTarget(client, target) {
  const selected = []
  const usedIds = new Set()
  const diagnostics = []

  for (const component of target.componentes) {
    const candidates = await getParcelCandidates(client, target, component)
      .then(rows => rows.filter(row => !usedIds.has(String(row.parcela_id))))

    diagnostics.push({ component, candidates: candidates.map(row => ({
      parcela_id: row.parcela_id,
      cliente: row.cliente_nome,
      contrato: row.contrato_numero,
      vencimento: String(row.vencimento).slice(0, 10),
      valor: Number(row.valor_atual || 0),
      status: row.status,
      movimento_id: row.movimento_id,
      nosso_numero: row.nosso_numero,
      controle_participante: row.controle_participante,
    })) })

    if (candidates.length !== 1) {
      return { ok: false, reason: `componente_${moneyBr(component.valor_parcela)}_candidatos_${candidates.length}`, diagnostics }
    }

    selected.push({ parcel: candidates[0], component })
    usedIds.add(String(candidates[0].parcela_id))
  }

  return { ok: true, selected, diagnostics }
}

async function findExactMovement(client, target, bankAccount, dataMovimento) {
  const firstName = String(target.cliente || '').split(' ')[0]
  const { rows } = await client.query(
    `SELECT id, to_char(data::date, 'YYYY-MM-DD') AS data, empresa, banco, entradas, saidas, fornecedor, historico, banco_conta_id
       FROM fin_movimento
      WHERE data::date=$1::date
        AND UPPER(COALESCE(empresa,''))='LUCKY'
        AND (
          banco_conta_id=$2
          OR UPPER(COALESCE(banco,'')) LIKE '%BRADESCO%'
        )
        AND ABS(COALESCE(entradas,0) - $3::numeric) < 0.02
        AND COALESCE(saidas,0)=0
        AND (
          COALESCE(fornecedor,'') ILIKE $4
          OR COALESCE(historico,'') ILIKE $4
          OR COALESCE(historico,'') ILIKE $5
          OR COALESCE(historico,'') ILIKE $6
        )
      ORDER BY CASE WHEN banco_conta_id=$2 THEN 0 ELSE 1 END, id
      LIMIT 3`,
    [
      dataMovimento,
      bankAccount.id,
      roundMoney(target.valor_pago),
      `%${firstName}%`,
      `%${target.documento}%`,
      `%${target.nosso_numero}%`,
    ],
  )
  return rows
}

async function createMovement(client, target, selected, bankAccount, dataMovimento) {
  const [year, month, day] = dataMovimento.split('-').map(Number)
  const firstParcel = selected[0].parcel
  const cliente = normalizeValue(firstParcel.cliente_nome, 160) || target.cliente
  const referencia = normalizeValue(firstParcel.receita_titulo || firstParcel.contrato_titulo || firstParcel.contrato_numero || 'Conta a receber', 180)
  const documento = normalizeValue(target.documento || firstParcel.receita_documento || firstParcel.documento_legado || firstParcel.contrato_numero, 120)
  const account = normalizeValue(firstParcel.plano_descricao || 'VENDA DE IMÓVEIS', 200)
  const nature = normalizeValue(firstParcel.plano_codigo || '1.1', 20)
  const project = normalizeValue(firstParcel.obra_nome, 180)
  const bankName = normalizeValue(bankAccount.banco_nome || 'BRADESCO', 60) || 'BRADESCO'
  const history = [
    'Liquidação via retorno Bradesco CB040700.RET',
    `pagamento ${DATA_OCORRENCIA}`,
    documento,
    `nosso ${target.nosso_numero}${target.nosso_numero_dv || ''}`,
    referencia,
    cliente,
  ].filter(Boolean).join(' - ')

  const { rows: [movement] } = await client.query(
    `INSERT INTO fin_movimento
      (data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
       conta_contabil, centro_custo, obra, natureza_financeira,
       dia, mes, ano, tipo_lancamento, vencimento, banco_conta_id)
     VALUES
      ($1,'LUCKY',$2,$3,0,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'financeiro',$14,$15)
     RETURNING id, to_char(data::date, 'YYYY-MM-DD') AS data, empresa, banco, entradas, fornecedor, historico, banco_conta_id`,
    [
      dataMovimento,
      bankName,
      roundMoney(target.valor_pago),
      cliente,
      history,
      documento,
      account,
      project,
      project,
      nature,
      day,
      month,
      year,
      target.vencimento,
      bankAccount.id,
    ],
  )
  return movement
}

async function linkParcel(client, target, item, movement, created, columns, gravarIdentificador) {
  const { parcel, component } = item
  const acrescimo = roundMoney(component.valor_pago - component.valor_parcela)
  const reconciliation = {
    origem: 'reparo_lucky_cb040700_nao_localizados_0.3.101',
    arquivo: 'CB040700.RET',
    relatorio: 'Critica Cobranca / Titulos Pagos por Conta Credito',
    linha_retorno: target.linha,
    data_ocorrencia: DATA_OCORRENCIA,
    data_credito: DATA_CREDITO,
    documento_retorno: target.documento,
    documento_parcela: component.documento,
    nosso_numero: target.nosso_numero,
    nosso_numero_dv: target.nosso_numero_dv,
    controle_participante: target.controle,
    valor_parcela: roundMoney(component.valor_parcela),
    valor_pago_parcela: roundMoney(component.valor_pago),
    valor_total_boleto: roundMoney(target.valor_pago),
    acrescimo,
    movimento_id: movement.id,
    movimento_criado: created,
    reparado_em: new Date().toISOString(),
  }

  const note = `Retorno Bradesco LUCKY CB040700.RET — pagamento ${DATA_OCORRENCIA} — ${target.documento} — nosso ${target.nosso_numero}${target.nosso_numero_dv || ''}`

  const setParts = [
    `status='paga'`,
    `pago_em=$1::date`,
    `valor_pago=$2`,
    `forma_pagamento='Boleto'`,
    `observacoes_baixa=COALESCE(observacoes_baixa,'') || CASE WHEN COALESCE(observacoes_baixa,'')='' THEN '' ELSE E'\n' END || $3`,
    `movimento_id=$4`,
    `origem_baixa='retorno_bradesco'`,
    `conciliado_em=COALESCE(conciliado_em, NOW())`,
    `boleto_status='liquidado'`,
    `conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $5::jsonb`,
    `updated_at=NOW()`,
  ]
  const params = [DATA_OCORRENCIA, roundMoney(component.valor_pago), note, movement.id, JSON.stringify(reconciliation)]

  /*
   * uq_com_parcelas_nosso_numero é único.
   * Em boleto consolidado, o mesmo nosso número quita mais de uma parcela.
   * Portanto gravamos o identificador bancário apenas na parcela principal
   * e mantemos o vínculo das demais pelo mesmo movimento_id + conciliacao_dados.
   */
  if (gravarIdentificador) {
    if (columns.has('nosso_numero')) setParts.push(`nosso_numero=$${params.push(target.nosso_numero)}`)
    if (columns.has('nosso_numero_dv')) setParts.push(`nosso_numero_dv=$${params.push(target.nosso_numero_dv || null)}`)
    if (columns.has('controle_participante')) setParts.push(`controle_participante=$${params.push(target.controle || null)}`)
  }

  params.push(parcel.parcela_id)
  const pIdIndex = params.length
  params.push(parcel.tenant_id)
  const tenantIndex = params.length

  const { rows: [updated] } = await client.query(
    `UPDATE com_parcelas
        SET ${setParts.join(', ')}
      WHERE id=$${pIdIndex}::uuid
        AND tenant_id=$${tenantIndex}
        AND movimento_id IS NULL
        AND ${statusOpenSql('com_parcelas')}
      RETURNING id, status, pago_em, valor_pago, movimento_id, nosso_numero, controle_participante`,
    params,
  )
  if (!updated) throw new Error(`Parcela ${parcel.parcela_id} não foi atualizada; pode ter sido baixada por outro processo.`)
  return updated
}

async function main() {
  if (!isIsoDate(DATA_OCORRENCIA) || !isIsoDate(DATA_CREDITO) || (DATA_MOVIMENTO_ARG && !isIsoDate(DATA_MOVIMENTO_ARG))) {
    throw new Error('Datas devem estar no formato YYYY-MM-DD.')
  }

  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    for (const table of ['com_parcelas', 'com_contratos', 'fin_movimento', 'fin_bancos_contas']) {
      if (!(await tableExists(client, table))) throw new Error(`Tabela obrigatória ausente: ${table}.`)
    }

    const parcelColumns = await getColumns(client, 'com_parcelas')
    const bankAccount = await getBankAccount(client)
    const DATA_MOVIMENTO = await inferMovementDate(client)

    const actions = []
    const skipped = []
    const already = []

    for (const target of TARGETS) {
      const resolved = await resolveTarget(client, target)
      if (!resolved.ok) {
        skipped.push({ ref: target.ref, cliente: target.cliente, valor: target.valor_pago, motivo: resolved.reason, diagnostics: resolved.diagnostics })
        continue
      }

      const exactMovements = await findExactMovement(client, target, bankAccount, DATA_MOVIMENTO)
      if (exactMovements.length > 1) {
        skipped.push({ ref: target.ref, cliente: target.cliente, valor: target.valor_pago, motivo: 'movimento_existente_ambiguo', movimentos: exactMovements })
        continue
      }

      // Se todas as parcelas já foram baixadas entre o diagnóstico e o reparo, apenas informa.
      const selected = resolved.selected
      const alreadyLinked = selected.filter(item => item.parcel.movimento_id)
      if (alreadyLinked.length === selected.length) {
        already.push({ ref: target.ref, cliente: target.cliente, parcelas: selected.map(item => item.parcel.parcela_id), movimento_id: selected[0].parcel.movimento_id })
        continue
      }
      if (alreadyLinked.length > 0) {
        skipped.push({ ref: target.ref, cliente: target.cliente, valor: target.valor_pago, motivo: 'parcialmente_baixado', parcelas: selected.map(item => ({ id: item.parcel.parcela_id, mov: item.parcel.movimento_id })) })
        continue
      }

      actions.push({ target, selected, method: exactMovements.length === 1 ? 'link_existing_movement' : 'create_movement', movement: exactMovements[0] || null })
    }

    console.log('REPARO LUCKY — CB040700.RET — TÍTULOS NÃO LOCALIZADOS')
    console.log(`Modo: ${EXECUTE ? 'EXECUÇÃO' : 'PRÉVIA'}`)
    console.log(`Data ocorrência / pago_em: ${DATA_OCORRENCIA}`)
    console.log(`Data crédito informada:     ${DATA_CREDITO}`)
    console.log(`Data do Movimento Bancário: ${DATA_MOVIMENTO}${DATA_MOVIMENTO_ARG ? ' (forçada)' : ' (inferida/padrão)'}`)
    console.log(`Conta bancária: #${bankAccount.id} ${bankAccount.empresa || ''} ${bankAccount.banco_nome || ''} ${bankAccount.agencia || ''}/${bankAccount.conta || ''}`)
    console.log('')
    console.log(`Títulos-alvo: ${TARGETS.length}`)
    console.log(`Ações possíveis agora: ${actions.length}`)
    console.log(`Já baixados/vinculados: ${already.length}`)
    console.log(`Ignorados por segurança: ${skipped.length}`)
    console.log('')

    if (actions.length) {
      console.log('AÇÕES')
      console.table(actions.slice(0, DRY_LIMIT_DETAILS).map(item => ({
        acao: item.method,
        linha: item.target.linha,
        ref: item.target.ref,
        cliente: item.target.cliente,
        contrato: item.target.contrato,
        vencimento: item.target.vencimento,
        valor_movimento: moneyBr(item.target.valor_pago),
        parcelas: item.selected.map(sel => sel.parcel.parcela_id).join(', '),
        valores_parcelas: item.selected.map(sel => moneyBr(sel.component.valor_pago)).join(' + '),
        movimento_existente: item.movement?.id || '',
        identificador_bancario: item.selected.length > 1 ? 'gravado só na 1ª parcela' : 'gravado na parcela',
      })))
    }

    if (already.length) {
      console.log('JÁ OK')
      console.table(already.slice(0, DRY_LIMIT_DETAILS))
    }

    if (skipped.length) {
      console.log('IGNORADOS')
      console.dir(skipped, { depth: 8 })
    }

    if (!EXECUTE) {
      await client.query('ROLLBACK')
      console.log('')
      console.log('Prévia concluída. Nada foi gravado.')
      console.log(`Para executar: node scripts/seed_reparar_lucky_cb040700_nao_localizados.js --execute --confirmar=${actions.length}`)
      if (!DATA_MOVIMENTO_ARG) console.log(`Se precisar forçar a data do Movimento: acrescente --data-movimento=YYYY-MM-DD`)
      return
    }

    if (CONFIRMAR !== actions.length) {
      throw new Error(`Confirmação inválida. Use --confirmar=${actions.length}. Nada foi gravado.`)
    }

    let created = 0
    let linked = 0
    let parcelsUpdated = 0

    for (const item of actions) {
      let movement = item.movement
      const createdNow = !movement
      if (!movement) {
        movement = await createMovement(client, item.target, item.selected, bankAccount, DATA_MOVIMENTO)
        created += 1
      } else {
        linked += 1
      }

      for (const [selectedIndex, selected] of item.selected.entries()) {
        const gravarIdentificador = selectedIndex === 0
        await linkParcel(client, item.target, selected, movement, createdNow, parcelColumns, gravarIdentificador)
        parcelsUpdated += 1
      }
    }

    await client.query('COMMIT')
    console.log('')
    console.log('Reparo concluído.')
    console.log(`Movimentos criados: ${created}`)
    console.log(`Movimentos existentes vinculados: ${linked}`)
    console.log(`Parcelas baixadas: ${parcelsUpdated}`)
    console.log(`Já estavam corretos antes: ${already.length}`)
    console.log(`Ignorados por segurança: ${skipped.length}`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error(`\nERRO: ${error.message}`)
    console.error('Nada foi gravado.')
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
