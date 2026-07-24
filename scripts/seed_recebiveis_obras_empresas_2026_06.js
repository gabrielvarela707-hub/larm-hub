/**
 * Versão 0.3.58 — Contas a Receber: separação LARM x LUCKY.
 *
 * Fonte validada no legado convertido:
 *   obra 7698 / cemp1_cod 2 = LUCKY CAPITAL EMPREENDIMENTOS LTDA
 *   obra 7700 / cemp1_cod 1 = LARM PARTICIPAÇÕES LTDA
 *   obra 7701 / cemp1_cod 1 = LARM (aluguel, não é lote)
 *
 * O seed é idempotente e não altera valores pagos, baixas, remessas ou retornos.
 * Ele corrige vínculos de obra/unidade/empresa e atualiza o status de vencimento
 * até a data informada. Boletos LUCKY emitidos com a configuração LARM são
 * limpos somente quando ainda não foram remetidos, pagos ou liquidados.
 *
 * Prévia:
 *   node scripts/seed_recebiveis_obras_empresas_2026_06.js --preview --tenant=<UUID> --as-of=2026-06-23
 *
 * Execução:
 *   node scripts/seed_recebiveis_obras_empresas_2026_06.js --execute --tenant=<UUID> --as-of=2026-06-23
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const execute = process.argv.includes('--execute')
const tenantArg = (process.argv.find(arg => arg.startsWith('--tenant=')) || '').split('=')[1] || null
const asOfArg = (process.argv.find(arg => arg.startsWith('--as-of=')) || '').split('=')[1] || '2026-06-23'

const OBRA_COMPANY = Object.freeze({
  '7698': {
    empresa: 'LUCKY',
    empresaCodigoLegado: 2,
    empresaNome: 'LUCKY CAPITAL EMPREENDIMENTOS LTDA',
    tipo: 'loteamento',
  },
  '7700': {
    empresa: 'LARM',
    empresaCodigoLegado: 1,
    empresaNome: 'LARM PARTICIPAÇÕES LTDA',
    tipo: 'loteamento',
  },
  '7701': {
    empresa: 'LARM',
    empresaCodigoLegado: 1,
    empresaNome: 'LARM PARTICIPAÇÕES LTDA',
    tipo: 'aluguel',
  },
})

const LOT_OBRAS = ['7698', '7700']
const ALL_OBRAS = Object.keys(OBRA_COMPANY)

function parseDate(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`Data inválida em --as-of: ${value}`)
  const date = new Date(`${text}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`Data inválida em --as-of: ${value}`)
  return text
}

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
  if (rows.length === 1) return rows[0].id
  if (!rows.length) throw new Error('Nenhum tenant cadastrado em hub_tenants.')
  throw new Error(`Existem ${rows.length} tenants. Informe --tenant=<UUID>. IDs: ${rows.map(row => row.id).join(', ')}`)
}

async function assertStructure(client) {
  const required = [
    'hub_tenants', 'tb2_obra', 'ts1_cemp', 'cad_produtos', 'com_contratos',
    'com_contrato_itens', 'fin_receitas', 'com_parcelas', 'fin_cobranca_bancaria_config',
  ]
  const missing = []
  for (const table of required) {
    if (!(await tableExists(client, table))) missing.push(table)
  }
  if (missing.length) throw new Error(`Tabelas obrigatórias ausentes: ${missing.join(', ')}`)
}

async function validateLegacyOwnership(client) {
  const { rows } = await client.query(
    `SELECT o.obra2_cod::text AS obra_codigo,
            o.cemp1_cod AS empresa_codigo,
            TRIM(o.obra2_nom) AS obra_nome,
            TRIM(e.cemp1_nom) AS empresa_nome
       FROM tb2_obra o
       LEFT JOIN ts1_cemp e ON e.cemp1_cod=o.cemp1_cod
      WHERE o.obra2_cod = ANY($1::int[])
      ORDER BY o.obra2_cod`,
    [ALL_OBRAS.map(Number)],
  )

  const found = new Map(rows.map(row => [String(row.obra_codigo), row]))
  for (const obraCode of ALL_OBRAS) {
    const expected = OBRA_COMPANY[obraCode]
    const actual = found.get(obraCode)
    if (!actual) throw new Error(`Obra ${obraCode} não encontrada em tb2_obra.`)
    if (Number(actual.empresa_codigo) !== expected.empresaCodigoLegado) {
      throw new Error(
        `Propriedade divergente para a obra ${obraCode}: esperado cemp1_cod=${expected.empresaCodigoLegado}, ` +
        `encontrado ${actual.empresa_codigo}. Operação cancelada.`,
      )
    }
  }
  return rows
}

async function collectSummary(client, tenantId, asOf) {
  const { rows } = await client.query(
    `WITH obras AS (
       SELECT UNNEST($2::text[]) AS obra_codigo
     ), contratos AS (
       SELECT obra_codigo_legado::text AS obra_codigo, COUNT(*)::int AS total
         FROM com_contratos
        WHERE tenant_id=$1 AND obra_codigo_legado::text = ANY($2::text[])
        GROUP BY obra_codigo_legado
     ), unidades AS (
       SELECT SPLIT_PART(codigo_legado, '|', 1) AS obra_codigo, COUNT(*)::int AS total
         FROM cad_produtos
        WHERE tenant_id=$1
          AND origem_legada='strato_receber_unidade'
          AND SPLIT_PART(codigo_legado, '|', 1) = ANY($2::text[])
        GROUP BY SPLIT_PART(codigo_legado, '|', 1)
     ), parcelas AS (
       SELECT COALESCE(c.obra_codigo_legado, p.obra_codigo_legado)::text AS obra_codigo,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE p.status IN ('aberta','atrasada'))::int AS em_aberto,
              COUNT(*) FILTER (WHERE p.status='paga')::int AS pagas,
              COUNT(*) FILTER (WHERE p.vencimento BETWEEN DATE '2026-03-01' AND $3::date)::int AS marco_ate_data,
              COUNT(*) FILTER (WHERE p.boleto_status IS NOT NULL)::int AS com_status_boleto,
              COALESCE(SUM(CASE WHEN p.status IN ('aberta','atrasada') THEN
                COALESCE(p.valor_recalculado, p.valor_total_relatorio, p.valor_nominal, 0) ELSE 0 END),0)::numeric(16,2) AS saldo_aberto
         FROM com_parcelas p
         JOIN com_contratos c ON c.id=p.contrato_id
        WHERE p.tenant_id=$1
          AND COALESCE(c.obra_codigo_legado, p.obra_codigo_legado)::text = ANY($2::text[])
        GROUP BY COALESCE(c.obra_codigo_legado, p.obra_codigo_legado)
     )
     SELECT o.obra_codigo,
            COALESCE(c.total,0) AS contratos,
            COALESCE(u.total,0) AS unidades,
            COALESCE(p.total,0) AS parcelas,
            COALESCE(p.em_aberto,0) AS em_aberto,
            COALESCE(p.pagas,0) AS pagas,
            COALESCE(p.marco_ate_data,0) AS marco_ate_data,
            COALESCE(p.com_status_boleto,0) AS com_status_boleto,
            COALESCE(p.saldo_aberto,0)::text AS saldo_aberto
       FROM obras o
       LEFT JOIN contratos c USING (obra_codigo)
       LEFT JOIN unidades u USING (obra_codigo)
       LEFT JOIN parcelas p USING (obra_codigo)
      ORDER BY o.obra_codigo`,
    [tenantId, ALL_OBRAS, asOf],
  )

  return rows.map(row => ({
    ...row,
    empresa: OBRA_COMPANY[row.obra_codigo]?.empresa || null,
    classificacao: OBRA_COMPANY[row.obra_codigo]?.tipo || null,
  }))
}

async function collectBillingAudit(client, tenantId) {
  const hasRemittanceItems = await tableExists(client, 'fin_remessas_cobranca_itens')
  const remittanceJoin = hasRemittanceItems
    ? 'LEFT JOIN fin_remessas_cobranca_itens ri ON ri.tenant_id=p.tenant_id AND ri.parcela_id=p.id'
    : ''
  const remittanceCount = hasRemittanceItems ? 'COUNT(ri.id)::int' : '0::int'

  const { rows: [row] } = await client.query(
    `WITH billing AS (
       SELECT p.id,
              COALESCE(c.obra_codigo_legado,p.obra_codigo_legado) AS obra_codigo,
              p.status,
              p.boleto_status,
              UPPER(COALESCE(p.dados_adicionais->>'boleto_empresa','')) AS boleto_empresa,
              (p.nosso_numero IS NOT NULL OR p.linha_digitavel IS NOT NULL OR
               p.codigo_barras IS NOT NULL OR p.boleto_emitido_em IS NOT NULL) AS possui_dados_bancarios,
              ${remittanceCount} AS remessas
         FROM com_parcelas p
         JOIN com_contratos c ON c.id=p.contrato_id
         ${remittanceJoin}
        WHERE p.tenant_id=$1
        GROUP BY p.id, c.obra_codigo_legado
     )
     SELECT
       COUNT(*) FILTER (
         WHERE obra_codigo=7698
           AND possui_dados_bancarios
           AND status <> 'paga'
           AND COALESCE(boleto_status,'') <> 'liquidado'
           AND boleto_empresa <> 'LUCKY'
           AND remessas=0
       )::int AS lucky_reemissao_segura,
       COUNT(*) FILTER (
         WHERE obra_codigo=7698
           AND possui_dados_bancarios
           AND (status='paga' OR boleto_status='liquidado' OR remessas>0)
       )::int AS lucky_revisao_manual
       FROM billing`,
    [tenantId],
  )

  const { rows: configs } = await client.query(
    `SELECT UPPER(TRIM(empresa)) AS empresa, ativo, homologado,
            beneficiario_nome, beneficiario_documento, agencia, conta, conta_dv, carteira
       FROM fin_cobranca_bancaria_config
      WHERE tenant_id=$1 AND banco_codigo='237'
      ORDER BY empresa, id`,
    [tenantId],
  )

  return { ...row, configs }
}

async function collectMarchJuneSummary(client, tenantId, asOf) {
  const { rows } = await client.query(
    `SELECT COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text AS obra_codigo,
            TO_CHAR(DATE_TRUNC('month',p.vencimento),'YYYY-MM') AS mes,
            COUNT(*)::int AS parcelas,
            COALESCE(SUM(COALESCE(p.valor_total_relatorio,p.valor_nominal,0)),0)::numeric(16,2)::text AS valor
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
      WHERE p.tenant_id=$1
        AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text = ANY($2::text[])
        AND p.vencimento BETWEEN DATE '2026-03-01' AND $3::date
      GROUP BY COALESCE(c.obra_codigo_legado,p.obra_codigo_legado), DATE_TRUNC('month',p.vencimento)
      ORDER BY obra_codigo, mes`,
    [tenantId, ALL_OBRAS, asOf],
  )
  return rows.map(row => ({
    ...row,
    empresa: OBRA_COMPANY[row.obra_codigo]?.empresa || null,
  }))
}

async function collectLegacyFreshness(client) {
  if (!(await tableExists(client, 'ts1_core'))) return null
  const { rows: [row] } = await client.query(
    `SELECT MAX(core1_dat_pgt)::date AS ultimo_pagamento,
            MAX(core1_dat_cri)::date AS ultima_criacao,
            MAX(core1_dat_cob)::date AS ultima_cobranca
       FROM ts1_core`,
  )
  return row || null
}

async function normalizeObra(client, tenantId, obraCode, mapping) {
  const metadata = JSON.stringify({
    empresa: mapping.empresa,
    empresa_codigo_legado: mapping.empresaCodigoLegado,
    empresa_nome: mapping.empresaNome,
    obra_codigo_legado: obraCode,
    separacao_recebiveis_versao: '0.3.58',
  })

  const { rows: [obra] } = await client.query(
    `UPDATE cad_produtos
        SET dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $3::jsonb,
            updated_at=NOW()
      WHERE tenant_id=$1
        AND tipo='obra'
        AND codigo_legado=$2
        AND origem_legada IN ('tb2_obra','strato_receber_obra')
      RETURNING id, nome`,
    [tenantId, obraCode, metadata],
  )
  if (!obra) throw new Error(`Produto/obra ${obraCode} não encontrado em cad_produtos.`)

  const unitResult = await client.query(
    `UPDATE cad_produtos
        SET produto_pai_id=$3,
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $4::jsonb,
            updated_at=NOW()
      WHERE tenant_id=$1
        AND tipo='unidade'
        AND origem_legada='strato_receber_unidade'
        AND SPLIT_PART(codigo_legado,'|',1)=$2`,
    [tenantId, obraCode, obra.id, metadata],
  )

  const contractResult = await client.query(
    `UPDATE com_contratos
        SET empreendimento_id=$3::text,
            dados_adicionais=COALESCE(dados_adicionais,'{}'::jsonb) || $4::jsonb,
            updated_at=NOW()
      WHERE tenant_id=$1 AND obra_codigo_legado::text=$2`,
    [tenantId, obraCode, obra.id, metadata],
  )

  const itemResult = await client.query(
    `UPDATE com_contrato_itens ci
        SET produto_id=u.id,
            updated_at=NOW()
       FROM com_contratos c
       JOIN cad_produtos u
         ON u.tenant_id=c.tenant_id
        AND u.origem_legada='strato_receber_unidade'
        AND u.codigo_legado=(c.obra_codigo_legado::text || '|' || c.unidade_codigo_legado)
      WHERE ci.contrato_id=c.id
        AND ci.tenant_id=$1
        AND c.obra_codigo_legado::text=$2
        AND ci.produto_id IS DISTINCT FROM u.id`,
    [tenantId, obraCode],
  )

  const revenueResult = await client.query(
    `UPDATE fin_receitas r
        SET produto_id=u.id,
            dados_adicionais=COALESCE(r.dados_adicionais,'{}'::jsonb) || $3::jsonb,
            updated_at=NOW()
       FROM com_contratos c
       JOIN cad_produtos u
         ON u.tenant_id=c.tenant_id
        AND u.origem_legada='strato_receber_unidade'
        AND u.codigo_legado=(c.obra_codigo_legado::text || '|' || c.unidade_codigo_legado)
      WHERE r.contrato_id=c.id
        AND r.tenant_id=$1
        AND c.obra_codigo_legado::text=$2`,
    [tenantId, obraCode, metadata],
  )

  const parcelResult = await client.query(
    `UPDATE com_parcelas p
        SET obra_codigo_legado=c.obra_codigo_legado,
            unidade_codigo_legado=c.unidade_codigo_legado,
            produto_id=u.id,
            updated_at=NOW()
       FROM com_contratos c
       JOIN cad_produtos u
         ON u.tenant_id=c.tenant_id
        AND u.origem_legada='strato_receber_unidade'
        AND u.codigo_legado=(c.obra_codigo_legado::text || '|' || c.unidade_codigo_legado)
      WHERE p.contrato_id=c.id
        AND p.tenant_id=$1
        AND c.obra_codigo_legado::text=$2
        AND (
          p.obra_codigo_legado IS DISTINCT FROM c.obra_codigo_legado OR
          p.unidade_codigo_legado IS DISTINCT FROM c.unidade_codigo_legado OR
          p.produto_id IS DISTINCT FROM u.id
        )`,
    [tenantId, obraCode],
  )

  return {
    obra: obra.nome,
    unidades: unitResult.rowCount,
    contratos: contractResult.rowCount,
    itens: itemResult.rowCount,
    receitas: revenueResult.rowCount,
    parcelas: parcelResult.rowCount,
  }
}

async function updateDueStatuses(client, tenantId, asOf) {
  const overdue = await client.query(
    `UPDATE com_parcelas p
        SET status='atrasada', updated_at=NOW()
       FROM com_contratos c
      WHERE p.contrato_id=c.id
        AND p.tenant_id=$1
        AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text = ANY($2::text[])
        AND p.status='aberta'
        AND p.vencimento < $3::date`,
    [tenantId, ALL_OBRAS, asOf],
  )
  const future = await client.query(
    `UPDATE com_parcelas p
        SET status='aberta', updated_at=NOW()
       FROM com_contratos c
      WHERE p.contrato_id=c.id
        AND p.tenant_id=$1
        AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text = ANY($2::text[])
        AND p.status='atrasada'
        AND p.vencimento >= $3::date`,
    [tenantId, ALL_OBRAS, asOf],
  )
  return { marcadas_atrasadas: overdue.rowCount, reabertas_futuras: future.rowCount }
}

async function resetSafeLuckyBoletos(client, tenantId) {
  const hasRemittanceItems = await tableExists(client, 'fin_remessas_cobranca_itens')
  const notRemitted = hasRemittanceItems
    ? `AND NOT EXISTS (
         SELECT 1 FROM fin_remessas_cobranca_itens ri
          WHERE ri.tenant_id=p.tenant_id AND ri.parcela_id=p.id
       )`
    : ''

  const { rows } = await client.query(
    `UPDATE com_parcelas p
        SET nosso_numero=NULL,
            nosso_numero_dv=NULL,
            controle_participante=NULL,
            linha_digitavel=NULL,
            codigo_barras=NULL,
            boleto_emitido_em=NULL,
            boleto_status='aguardando_configuracao_lucky',
            dados_adicionais=(COALESCE(p.dados_adicionais,'{}'::jsonb)
              - 'boleto_empresa' - 'boleto_config_id' - 'boleto_separacao_versao') ||
              jsonb_build_object(
                'boleto_reemissao_motivo','configuracao_larm_aplicada_em_parcela_lucky',
                'boleto_reemissao_versao','0.3.58',
                'boleto_reemissao_em',NOW()
              ),
            updated_at=NOW()
       FROM com_contratos c
      WHERE p.contrato_id=c.id
        AND p.tenant_id=$1
        AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)=7698
        AND p.status <> 'paga'
        AND COALESCE(p.boleto_status,'') <> 'liquidado'
        AND UPPER(COALESCE(p.dados_adicionais->>'boleto_empresa','')) <> 'LUCKY'
        AND (p.nosso_numero IS NOT NULL OR p.linha_digitavel IS NOT NULL OR
             p.codigo_barras IS NOT NULL OR p.boleto_emitido_em IS NOT NULL)
        ${notRemitted}
      RETURNING p.id`,
    [tenantId],
  )
  return rows.length
}

async function validateFinalLinks(client, tenantId) {
  const { rows: [row] } = await client.query(
    `SELECT COUNT(*)::int AS divergencias
       FROM com_parcelas p
       JOIN com_contratos c ON c.id=p.contrato_id
       LEFT JOIN cad_produtos u ON u.id=p.produto_id
      WHERE p.tenant_id=$1
        AND COALESCE(c.obra_codigo_legado,p.obra_codigo_legado)::text = ANY($2::text[])
        AND (
          p.obra_codigo_legado IS DISTINCT FROM c.obra_codigo_legado OR
          p.unidade_codigo_legado IS DISTINCT FROM c.unidade_codigo_legado OR
          u.id IS NULL OR
          SPLIT_PART(COALESCE(u.codigo_legado,''),'|',1) <> c.obra_codigo_legado::text OR
          SPLIT_PART(COALESCE(u.codigo_legado,''),'|',2) <> COALESCE(c.unidade_codigo_legado,'')
        )`,
    [tenantId, ALL_OBRAS],
  )
  if (Number(row.divergencias) > 0) {
    throw new Error(`Ainda existem ${row.divergencias} parcelas vinculadas a unidade/obra divergente. Operação cancelada.`)
  }
}

async function run() {
  const asOf = parseDate(asOfArg)
  await connectDB()
  const client = await pool.connect()

  try {
    await assertStructure(client)
    const tenantId = await resolveTenant(client)
    const legacyOwnership = await validateLegacyOwnership(client)
    const before = await collectSummary(client, tenantId, asOf)
    const marchJune = await collectMarchJuneSummary(client, tenantId, asOf)
    const legacyFreshness = await collectLegacyFreshness(client)
    const billingBefore = await collectBillingAudit(client, tenantId)

    logger.info(`Contas a Receber 0.3.58 — modo ${execute ? 'EXECUÇÃO' : 'PRÉVIA'} — posição operacional ${asOf}`)
    logger.info(`Tenant: ${tenantId}`)
    logger.info(`Propriedade no legado: ${JSON.stringify(legacyOwnership)}`)
    logger.info(`Resumo anterior: ${JSON.stringify(before)}`)
    logger.info(`Vencimentos de 2026-03-01 até ${asOf}: ${JSON.stringify(marchJune)}`)
    logger.info(`Atualização disponível em ts1_core: ${JSON.stringify(legacyFreshness)}`)
    logger.info(`Cobrança anterior: ${JSON.stringify(billingBefore)}`)

    const luckyConfig = billingBefore.configs.find(config => config.empresa === 'LUCKY' && config.ativo)
    if (!luckyConfig) {
      logger.warn('A configuração bancária Bradesco da LUCKY não existe. O seed não copiará os dados bancários da LARM.')
    }

    if (!execute) {
      logger.info('Prévia concluída. Nenhum registro foi alterado. Use --execute para aplicar.')
      return
    }

    await client.query('BEGIN')
    const changes = {}
    for (const obraCode of ALL_OBRAS) {
      changes[obraCode] = await normalizeObra(client, tenantId, obraCode, OBRA_COMPANY[obraCode])
    }
    changes.status = await updateDueStatuses(client, tenantId, asOf)
    changes.boletos_lucky_liberados_para_reemissao = await resetSafeLuckyBoletos(client, tenantId)

    await validateFinalLinks(client, tenantId)
    const after = await collectSummary(client, tenantId, asOf)
    const billingAfter = await collectBillingAudit(client, tenantId)
    await client.query('COMMIT')

    logger.info(`Alterações aplicadas: ${JSON.stringify(changes)}`)
    logger.info(`Resumo final: ${JSON.stringify(after)}`)
    logger.info(`Cobrança final: ${JSON.stringify(billingAfter)}`)

    const lotSummary = after.filter(row => LOT_OBRAS.includes(row.obra_codigo))
    logger.info(`Lotes separados: ${JSON.stringify(lotSummary)}`)
    if (!billingAfter.configs.some(config => config.empresa === 'LUCKY' && config.ativo)) {
      logger.warn('Pendente: cadastrar a configuração Bradesco real da LUCKY antes de emitir boleto/remessa da obra 7698.')
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`Falha no seed de separação LARM/LUCKY: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

run()
