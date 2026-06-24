/**
 * Versão 0.3.61 — Atualiza a base de TESTE de Contas a Receber até 23/06/2026.
 *
 * A origem das baixas após a posição do relatório é o Movimento Bancário.
 * Como os lançamentos "Liquidação de cobrança" e "Vendas PMT" são agregados e
 * não possuem CPF/nosso número, a execução exige --test-fifo. O vínculo é uma
 * aproximação controlada para homologação: tenta combinação exata por valor e,
 * quando não encontra, liquida as parcelas mais antigas que cabem no movimento.
 * Todas as alterações ficam identificadas em conciliacao_dados e na tabela de auditoria.
 *
 * Prévia:
 *   node scripts/seed_recebiveis_posicao_2026_06_23.js --preview --tenant=<UUID> --as-of=2026-06-23
 * Execução em base de teste:
 *   node scripts/seed_recebiveis_posicao_2026_06_23.js --execute --test-fifo --tenant=<UUID> --as-of=2026-06-23
 */
require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const execute = process.argv.includes('--execute')
const allowTestFifo = process.argv.includes('--test-fifo')
const tenantArg = (process.argv.find(arg => arg.startsWith('--tenant=')) || '').split('=')[1] || null
const asOf = (process.argv.find(arg => arg.startsWith('--as-of=')) || '').split('=')[1] || '2026-06-23'
const OBRA_EMPRESA = Object.freeze({ 7698: 'LUCKY', 7700: 'LARM', 7701: 'LARM' })
const RECEIPT_HISTORY = ['LIQUIDAÇÃO DE COBRANÇA', 'LIQUIDACAO DE COBRANCA', 'VENDAS PMT']
const PROTECTED_CONTRACTS = ['STR-1334-O-14'] // Valério: dívida anterior precisa permanecer disponível para o teste de recálculo acumulado.

function assertIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error(`Data inválida: ${value}`)
  return value
}
function cents(value) { return Math.round(Number(value || 0) * 100) }
function money(valueCents) { return Number((valueCents / 100).toFixed(2)) }

async function tableExists(client, table) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`])
  return Boolean(row?.relation)
}

async function resolveTenant(client) {
  if (tenantArg) {
    const { rows } = await client.query('SELECT id FROM hub_tenants WHERE id=$1', [tenantArg])
    if (!rows.length) throw new Error(`Tenant não encontrado: ${tenantArg}`)
    return rows[0].id
  }
  const { rows } = await client.query('SELECT id FROM hub_tenants ORDER BY id')
  if (rows.length !== 1) throw new Error('Informe --tenant=<UUID>.')
  return rows[0].id
}

async function ensureAuditTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS fin_recebiveis_atualizacao_teste (
      id BIGSERIAL PRIMARY KEY,
      tenant_id UUID NOT NULL REFERENCES hub_tenants(id) ON DELETE CASCADE,
      movimento_id BIGINT NOT NULL REFERENCES fin_movimento(id) ON DELETE RESTRICT,
      empresa VARCHAR(20) NOT NULL,
      data_movimento DATE NOT NULL,
      valor_movimento NUMERIC(16,2) NOT NULL,
      valor_alocado NUMERIC(16,2) NOT NULL DEFAULT 0,
      valor_nao_alocado NUMERIC(16,2) NOT NULL DEFAULT 0,
      metodo VARCHAR(30) NOT NULL,
      parcelas_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_fin_recebiveis_atualizacao_teste UNIQUE (tenant_id, movimento_id)
    )
  `)
}

async function getPositionDate(client, tenantId) {
  const { rows: [row] } = await client.query(
    `SELECT COALESCE(MAX(posicao_relatorio), DATE '2026-06-01') AS posicao
       FROM com_parcelas WHERE tenant_id=$1 AND origem='strato_receber'`,
    [tenantId],
  )
  return String(row.posicao).slice(0, 10)
}

async function getMovements(client, tenantId, startDate, endDate) {
  // fin_movimento é uma tabela financeira legada/global e não possui tenant_id.
  // O tenant é aplicado somente na auditoria, quando ela já existe.
  const hasAudit = await tableExists(client, 'fin_recebiveis_atualizacao_teste')
  const params = [startDate, endDate, RECEIPT_HISTORY]
  let skipAudit = ''

  if (hasAudit) {
    params.push(tenantId)
    skipAudit = `AND NOT EXISTS (
      SELECT 1
        FROM fin_recebiveis_atualizacao_teste a
       WHERE a.tenant_id = $4::uuid
         AND a.movimento_id = fm.id
    )`
  }

  const { rows } = await client.query(
    `SELECT fm.id, fm.data::date, UPPER(TRIM(fm.empresa)) AS empresa,
            COALESCE(fm.entradas,0)::numeric(16,2) AS valor,
            TRIM(fm.historico) AS historico
       FROM fin_movimento fm
      WHERE fm.data > $1::date AND fm.data <= $2::date
        AND UPPER(TRIM(fm.empresa)) IN ('LARM','LUCKY')
        AND COALESCE(fm.entradas,0) > 0
        AND UPPER(TRANSLATE(TRIM(fm.historico),'ÇÃÁÀÂÉÊÍÓÔÕÚ','CAAAAEEIOOOU')) = ANY($3::text[])
        ${skipAudit}
      ORDER BY fm.data, fm.id`,
    params,
  )
  return rows
}

async function getCandidates(client, tenantId, company, movementDate) {
  const obras = Object.entries(OBRA_EMPRESA).filter(([, value]) => value === company).map(([key]) => Number(key))
  const { rows } = await client.query(
    `SELECT p.id, p.vencimento::date, p.documento_legado, p.contrato_id,
            COALESCE(p.valor_recalculado,p.valor_total_relatorio,p.valor_convertido,p.valor_nominal,0)::numeric(14,2) AS valor,
            COALESCE(cp.nome,cp.razao_social,c.comprador_nome) AS cliente_nome,
            c.numero AS contrato_numero
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
       LEFT JOIN cad_clientes cl ON cl.id=c.cliente_id
       LEFT JOIN cad_pessoas cp ON cp.id=cl.pessoa_id
      WHERE p.tenant_id=$1
        AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)=ANY($2::int[])
        AND p.status IN ('aberta','atrasada')
        AND p.vencimento <= $3::date
        AND p.movimento_id IS NULL
        AND NOT (c.numero = ANY($4::text[]))
      ORDER BY p.vencimento, p.created_at, p.id`,
    [tenantId, obras, movementDate, PROTECTED_CONTRACTS],
  )
  return rows
}

function exactSubset(candidates, targetCents) {
  // Limita a busca às parcelas mais antigas e a 120 mil estados para não travar o seed.
  const pool = candidates.slice(0, 60)
  const states = new Map([[0, []]])
  for (let index = 0; index < pool.length; index += 1) {
    const value = cents(pool[index].valor)
    if (value <= 0 || value > targetCents) continue
    const snapshot = Array.from(states.entries())
    for (const [sum, indexes] of snapshot) {
      const next = sum + value
      if (next > targetCents || states.has(next)) continue
      const combination = [...indexes, index]
      if (next === targetCents) return combination.map(i => pool[i])
      states.set(next, combination)
      if (states.size > 120000) return null
    }
  }
  return null
}

function fifoSubset(candidates, targetCents) {
  const selected = []
  let remaining = targetCents
  for (const candidate of candidates) {
    const value = cents(candidate.valor)
    if (value <= 0) continue
    if (value <= remaining) {
      selected.push(candidate)
      remaining -= value
    }
    if (remaining <= 0) break
  }
  return selected
}

async function simulateOrApplyMovement(client, tenantId, movement, excludedParcelIds = new Set()) {
  const target = cents(movement.valor)
  const candidates = (await getCandidates(client, tenantId, movement.empresa, movement.data))
    .filter(row => !excludedParcelIds.has(row.id))
  let selected = exactSubset(candidates, target)
  let method = selected?.length ? 'combinacao_exata' : 'fifo_teste'
  if (!selected?.length) selected = fifoSubset(candidates, target)
  const allocated = selected.reduce((sum, row) => sum + cents(row.valor), 0)
  const remainder = Math.max(0, target - allocated)
  selected.forEach(row => excludedParcelIds.add(row.id))

  if (execute && selected.length) {
    for (const parcel of selected) {
      const details = {
        versao: '0.3.61',
        base_teste: true,
        metodo: method,
        movimento_id: movement.id,
        movimento_data: movement.data,
        movimento_valor_agregado: Number(movement.valor),
        historico: movement.historico,
        observacao: 'Vínculo aproximado para homologação; movimento bancário agregado sem identificação individual do pagador.',
      }
      await client.query(
        `UPDATE com_parcelas
            SET status='paga', pago_em=$1::date, valor_pago=$2,
                forma_pagamento='Boleto/PMT', movimento_id=$3,
                origem_baixa='atualizacao_teste_movimento', conciliado_em=NOW(),
                boleto_status=CASE WHEN boleto_status IS NULL THEN 'liquidado_teste' ELSE boleto_status END,
                conciliacao_dados=COALESCE(conciliacao_dados,'{}'::jsonb) || $4::jsonb,
                updated_at=NOW()
          WHERE id=$5 AND tenant_id=$6 AND status IN ('aberta','atrasada') AND movimento_id IS NULL`,
        [movement.data, Number(parcel.valor), movement.id, JSON.stringify(details), parcel.id, tenantId],
      )
    }
    await client.query(
      `INSERT INTO fin_recebiveis_atualizacao_teste (
         tenant_id,movimento_id,empresa,data_movimento,valor_movimento,
         valor_alocado,valor_nao_alocado,metodo,parcelas_ids,detalhes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)
       ON CONFLICT (tenant_id,movimento_id) DO NOTHING`,
      [tenantId, movement.id, movement.empresa, movement.data, movement.valor,
       money(allocated), money(remainder), method,
       JSON.stringify(selected.map(row => row.id)),
       JSON.stringify({ historico: movement.historico, candidatos: candidates.length, versao: '0.3.61' })],
    )
  }

  return {
    movimento_id: movement.id,
    data: String(movement.data).slice(0, 10),
    empresa: movement.empresa,
    historico: movement.historico,
    valor_movimento: Number(movement.valor),
    metodo: method,
    candidatos: candidates.length,
    parcelas: selected.length,
    valor_alocado: money(allocated),
    valor_nao_alocado: money(remainder),
  }
}

async function updateStatuses(client, tenantId, date) {
  const overdue = await client.query(
    `UPDATE com_parcelas SET status='atrasada',updated_at=NOW()
      WHERE tenant_id=$1 AND status='aberta' AND vencimento < $2::date`, [tenantId, date],
  )
  const open = await client.query(
    `UPDATE com_parcelas SET status='aberta',updated_at=NOW()
      WHERE tenant_id=$1 AND status='atrasada' AND vencimento >= $2::date`, [tenantId, date],
  )
  return { atrasadas: overdue.rowCount, reabertas: open.rowCount }
}

async function valerioSummary(client, tenantId, date) {
  const { rows } = await client.query(
    `SELECT p.id,p.vencimento::date,p.status,
            COALESCE(p.valor_recalculado,p.valor_total_relatorio,p.valor_nominal,0)::numeric(14,2) AS valor,
            p.documento_legado,c.numero AS contrato
       FROM com_parcelas p JOIN com_contratos c ON c.id=p.contrato_id
      WHERE p.tenant_id=$1 AND UPPER(c.comprador_nome) LIKE '%VALERIO DONIZETE%'
        AND p.vencimento <= $2::date
      ORDER BY p.vencimento`,
    [tenantId, date],
  )
  return rows
}

async function run() {
  assertIsoDate(asOf)
  if (execute && !allowTestFifo) {
    throw new Error('Esta atualização é exclusiva da base de teste. Para executar, acrescente --test-fifo.')
  }
  await connectDB()
  const client = await pool.connect()
  try {
    for (const table of ['hub_tenants','com_parcelas','com_contratos','fin_movimento']) {
      if (!(await tableExists(client, table))) throw new Error(`Tabela obrigatória ausente: ${table}`)
    }
    const tenantId = await resolveTenant(client)
    const positionDate = await getPositionDate(client, tenantId)
    if (execute) {
      await client.query('BEGIN')
      await ensureAuditTable(client)
    }
    const movements = await getMovements(client, tenantId, positionDate, asOf)
    const results = []
    const simulatedParcelIds = new Set()
    for (const movement of movements) results.push(await simulateOrApplyMovement(client, tenantId, movement, simulatedParcelIds))
    const statusResult = execute ? await updateStatuses(client, tenantId, asOf) : null
    const valerio = await valerioSummary(client, tenantId, asOf)
    if (execute) await client.query('COMMIT')

    const totals = results.reduce((acc, item) => {
      const key = item.empresa
      acc[key] ||= { movimentos: 0, parcelas: 0, valor_movimento: 0, valor_alocado: 0, valor_nao_alocado: 0 }
      acc[key].movimentos += 1
      acc[key].parcelas += item.parcelas
      acc[key].valor_movimento += item.valor_movimento
      acc[key].valor_alocado += item.valor_alocado
      acc[key].valor_nao_alocado += item.valor_nao_alocado
      return acc
    }, {})
    Object.values(totals).forEach(item => {
      item.valor_movimento = Number(item.valor_movimento.toFixed(2))
      item.valor_alocado = Number(item.valor_alocado.toFixed(2))
      item.valor_nao_alocado = Number(item.valor_nao_alocado.toFixed(2))
    })

    logger.info(`Recebíveis 0.3.61 — ${execute ? 'EXECUÇÃO TESTE' : 'PRÉVIA'} — posição ${positionDate} → ${asOf}`)
    logger.info(`Movimentos considerados: ${JSON.stringify(totals)}`)
    logger.info(`Detalhes da simulação: ${JSON.stringify(results)}`)
    logger.info(`Valério até ${asOf}: ${JSON.stringify(valerio)}`)
    if (statusResult) logger.info(`Status atualizados: ${JSON.stringify(statusResult)}`)
    if (!execute) logger.warn('Nenhuma baixa foi aplicada. Execute com --execute --test-fifo somente na base de teste.')
  } catch (error) {
    if (execute) await client.query('ROLLBACK').catch(() => {})
    logger.error(`Falha na atualização de recebíveis 0.3.61: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(error => {
  logger.error(error.message)
  process.exitCode = 1
})
