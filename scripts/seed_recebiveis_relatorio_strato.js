/**
 * Versão 0.3.44 — Importação dos contratos, receitas e parcelas em aberto
 * do relatório Strato com posição em 01/06/2026.
 *
 * Prévia:
 *   node scripts/seed_recebiveis_relatorio_strato.js --preview --tenant=<UUID>
 *
 * Execução:
 *   node scripts/seed_recebiveis_relatorio_strato.js --execute --tenant=<UUID>
 */

require('dotenv').config()

const fs = require('fs')
const path = require('path')
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const execute = process.argv.includes('--execute')
const tenantArg = (process.argv.find(arg => arg.startsWith('--tenant=')) || '').split('=')[1] || null
const importPath = path.join(__dirname, 'imports', 'recebiveis-strato-2026-06-01.json')

const TYPE_TO_PARCELA = {
  ENTRADA: 'entrada',
  PARCELA: 'parcela',
  ANUAL: 'anual',
  RENEGOCIACAO: 'renegociacao',
  INTERMEDIARIA: 'intermediaria',
  TAXA: 'taxa',
  CONDOMINIO: 'condominio',
  ADITIVO: 'aditivo',
  OUTROS: 'outros',
  COMISSAO: 'comissao',
}

function clean(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return text || null
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeCode(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function jsonObject(value) {
  return JSON.stringify(value || {})
}

function periodicityFor(item) {
  if (item.revenue_type === 'ANUAL') return 'anual'
  if (['PARCELA', 'CONDOMINIO', 'TAXA'].includes(item.revenue_type) && item.installments.length > 1) return 'mensal'
  if (item.installments.length > 1) return 'personalizada'
  return 'unica'
}

function mapIndexCode(value) {
  const code = String(value || '').toUpperCase().trim()
  if (code.startsWith('IPCA')) return 'IPCA'
  if (code.startsWith('IGPM') || code.startsWith('IGP-M')) return 'IGPM'
  return null
}

async function tableExists(client, table) {
  const { rows: [row] } = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`])
  return Boolean(row?.relation)
}

async function columnExists(client, table, column) {
  const { rows: [row] } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2
     ) AS existe`,
    [table, column],
  )
  return Boolean(row?.existe)
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

  throw new Error(
    `Existem ${rows.length} tenants. Informe explicitamente --tenant=<UUID>. ` +
    `IDs disponíveis: ${rows.map(row => row.id).join(', ')}`,
  )
}

async function assertStructure(client) {
  const tables = [
    'cad_pessoas', 'cad_clientes', 'cad_produtos', 'fin_tipos_receita',
    'com_contratos', 'com_contrato_itens', 'fin_receitas', 'com_parcelas',
  ]
  const missing = []
  for (const table of tables) {
    if (!(await tableExists(client, table))) missing.push(table)
  }
  if (missing.length) {
    throw new Error(`Tabelas ausentes: ${missing.join(', ')}. Rode primeiro as migrations das Fases 1 e 2.`)
  }

  if (!(await columnExists(client, 'com_parcelas', 'receita_id'))) {
    throw new Error('A coluna com_parcelas.receita_id não existe. Rode migrate_receitas_parcelas_fase2.js.')
  }
}

async function loadClientIndex(client) {
  const { rows } = await client.query(`
    SELECT cl.id AS cliente_id, cl.codigo AS cliente_codigo,
           cl.ativo AS cliente_ativo,
           p.id AS pessoa_id, p.nome, p.nome_normalizado, p.razao_social,
           p.nome_fantasia, p.cpf_cnpj, p.telefone, p.celular, p.email,
           p.ativo AS pessoa_ativa
      FROM cad_clientes cl
      JOIN cad_pessoas p ON p.id = cl.pessoa_id
     ORDER BY cl.id
  `)

  const index = new Map()
  for (const row of rows) {
    const names = [row.nome_normalizado, row.nome, row.razao_social, row.nome_fantasia]
    for (const value of names) {
      const key = normalizeName(value)
      if (!key) continue
      if (!index.has(key)) index.set(key, [])
      if (!index.get(key).some(item => item.cliente_id === row.cliente_id)) index.get(key).push(row)
    }
  }
  return index
}

async function loadLookupMaps(client, tenantId) {
  const revenueTypes = new Map()
  const { rows: typeRows } = await client.query(
    'SELECT id, codigo, nome FROM fin_tipos_receita WHERE tenant_id=$1 AND ativo IS TRUE',
    [tenantId],
  )
  for (const row of typeRows) revenueTypes.set(String(row.codigo).toUpperCase(), row)

  const indices = new Map()
  if (await tableExists(client, 'fin_indice_tipos')) {
    const { rows } = await client.query(
      'SELECT id, codigo, nome FROM fin_indice_tipos WHERE tenant_id=$1 AND ativo IS TRUE',
      [tenantId],
    )
    for (const row of rows) indices.set(String(row.codigo).toUpperCase(), row)
  }

  return { revenueTypes, indices }
}

async function countExisting(client, table, tenantId, codes, origin = 'strato_receber') {
  if (!codes.length) return 0
  const { rows: [row] } = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM ${table}
      WHERE tenant_id=$1 AND origem=$2 AND codigo_legado = ANY($3::text[])`,
    [tenantId, origin, codes],
  )
  return Number(row.total || 0)
}

async function countExistingProducts(client, tenantId, legacyCodes) {
  if (!legacyCodes.length) return 0
  const { rows: [row] } = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM cad_produtos
      WHERE tenant_id=$1
        AND origem_legada='strato_receber_unidade'
        AND codigo_legado = ANY($2::text[])`,
    [tenantId, legacyCodes],
  )
  return Number(row.total || 0)
}

async function resolveOrCreateObra(client, tenantId, obraCode) {
  const { rows } = await client.query(
    `SELECT * FROM cad_produtos
      WHERE tenant_id=$1
        AND codigo_legado=$2
        AND origem_legada IN ('tb2_obra','strato_receber_obra')
      ORDER BY CASE WHEN origem_legada='tb2_obra' THEN 0 ELSE 1 END, id
      LIMIT 1`,
    [tenantId, String(obraCode)],
  )
  if (rows[0]) return rows[0]

  const code = `OBRA-${safeCode(obraCode)}`.slice(0, 60)
  const { rows: [created] } = await client.query(
    `INSERT INTO cad_produtos
       (tenant_id, codigo, nome, tipo, origem_legada, codigo_legado, dados_adicionais, ativo)
     VALUES ($1,$2,$3,'obra','strato_receber_obra',$4,$5::jsonb,TRUE)
     ON CONFLICT (tenant_id, origem_legada, codigo_legado)
       WHERE origem_legada IS NOT NULL AND codigo_legado IS NOT NULL
     DO UPDATE SET updated_at=NOW()
     RETURNING *`,
    [tenantId, code, `Obra ${obraCode}`, String(obraCode), jsonObject({ criado_pelo_relatorio_receber: true })],
  )
  return created
}

async function resolveOrCreateUnit(client, tenantId, contract, obra) {
  const legacyCode = `${contract.obra_code}|${contract.unit_code}`
  const code = `OBRA-${safeCode(contract.obra_code)}-UN-${safeCode(contract.unit_code)}`.slice(0, 60)
  const name = `${obra.nome || `Obra ${contract.obra_code}`} — Unidade ${contract.unit_code}`

  const { rows: [unit] } = await client.query(
    `INSERT INTO cad_produtos
       (tenant_id, codigo, nome, descricao, tipo, produto_pai_id, unidade_medida,
        origem_legada, codigo_legado, dados_adicionais, ativo)
     VALUES ($1,$2,$3,$4,'unidade',$5,'UN','strato_receber_unidade',$6,$7::jsonb,TRUE)
     ON CONFLICT (tenant_id, origem_legada, codigo_legado)
       WHERE origem_legada IS NOT NULL AND codigo_legado IS NOT NULL
     DO UPDATE SET
       nome=EXCLUDED.nome,
       descricao=COALESCE(NULLIF(cad_produtos.descricao,''), EXCLUDED.descricao),
       produto_pai_id=COALESCE(cad_produtos.produto_pai_id, EXCLUDED.produto_pai_id),
       dados_adicionais=COALESCE(cad_produtos.dados_adicionais,'{}'::jsonb) || EXCLUDED.dados_adicionais,
       updated_at=NOW()
     RETURNING *`,
    [
      tenantId,
      code,
      name,
      `Unidade ${contract.unit_code} vinculada à obra ${contract.obra_code}.`,
      obra.id,
      legacyCode,
      jsonObject({ obra_codigo_legado: contract.obra_code, unidade_codigo_legado: contract.unit_code }),
    ],
  )
  return unit
}

async function upsertContract(client, tenantId, contract, customer, obra, unit, indexId, metadata) {
  const title = `${contract.contract_type === 'aluguel' ? 'Aluguel' : 'Contrato'} — ${obra.nome || `Obra ${contract.obra_code}`} / ${contract.unit_code}`
  const observations = `Importado do relatório Strato de valores a receber, posição ${metadata.report_position}. O valor do contrato representa o saldo em aberto disponível no relatório.`

  const { rows: [saved] } = await client.query(
    `INSERT INTO com_contratos
       (tenant_id, numero, lot_id, lot_number, empreendimento_id,
        comprador_nome, comprador_cpf, comprador_phone, comprador_email,
        valor_total, valor_entrada, parcelas_count, taxa_juros_mes, financiamento_tipo,
        status, observacoes, cliente_id, titulo, tipo_contrato, data_inicio, data_fim,
        indice_reajuste_id, codigo_legado, origem, obra_codigo_legado,
        unidade_codigo_legado, dados_adicionais)
     VALUES
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,'price','assinado',$13,$14,$15,$16,$17,$18,$19,$20,'strato_receber',$21,$22,$23::jsonb)
     ON CONFLICT (tenant_id, origem, codigo_legado)
       WHERE codigo_legado IS NOT NULL
     DO UPDATE SET
       cliente_id=EXCLUDED.cliente_id,
       comprador_nome=EXCLUDED.comprador_nome,
       comprador_cpf=COALESCE(NULLIF(com_contratos.comprador_cpf,''), EXCLUDED.comprador_cpf),
       comprador_phone=COALESCE(NULLIF(com_contratos.comprador_phone,''), EXCLUDED.comprador_phone),
       comprador_email=COALESCE(NULLIF(com_contratos.comprador_email,''), EXCLUDED.comprador_email),
       titulo=EXCLUDED.titulo,
       tipo_contrato=EXCLUDED.tipo_contrato,
       data_inicio=LEAST(COALESCE(com_contratos.data_inicio, EXCLUDED.data_inicio), EXCLUDED.data_inicio),
       data_fim=GREATEST(COALESCE(com_contratos.data_fim, EXCLUDED.data_fim), EXCLUDED.data_fim),
       indice_reajuste_id=COALESCE(com_contratos.indice_reajuste_id, EXCLUDED.indice_reajuste_id),
       obra_codigo_legado=EXCLUDED.obra_codigo_legado,
       unidade_codigo_legado=EXCLUDED.unidade_codigo_legado,
       lot_id=COALESCE(NULLIF(com_contratos.lot_id,''), EXCLUDED.lot_id),
       lot_number=COALESCE(NULLIF(com_contratos.lot_number,''), EXCLUDED.lot_number),
       empreendimento_id=COALESCE(NULLIF(com_contratos.empreendimento_id,''), EXCLUDED.empreendimento_id),
       valor_total=CASE WHEN com_contratos.status='quitado' THEN com_contratos.valor_total ELSE EXCLUDED.valor_total END,
       valor_entrada=CASE WHEN com_contratos.status='quitado' THEN com_contratos.valor_entrada ELSE EXCLUDED.valor_entrada END,
       parcelas_count=GREATEST(com_contratos.parcelas_count, EXCLUDED.parcelas_count),
       observacoes=COALESCE(NULLIF(com_contratos.observacoes,''), EXCLUDED.observacoes),
       dados_adicionais=COALESCE(com_contratos.dados_adicionais,'{}'::jsonb) || EXCLUDED.dados_adicionais,
       updated_at=NOW()
     RETURNING *`,
    [
      tenantId,
      contract.number,
      `${contract.obra_code}/${contract.unit_code}`,
      contract.unit_code,
      String(obra.id),
      customer.nome || contract.client_name,
      customer.cpf_cnpj,
      customer.celular || customer.telefone,
      customer.email,
      contract.total_open_value,
      contract.entry_open_value,
      contract.installment_count,
      observations,
      customer.cliente_id,
      title,
      contract.contract_type,
      contract.start_date,
      contract.end_date,
      indexId,
      contract.legacy_key,
      Number(contract.obra_code) || null,
      contract.unit_code,
      jsonObject({
        origem_relatorio: metadata.source_file,
        posicao_relatorio: metadata.report_position,
        numero_documento_principal: contract.primary_document,
        saldo_em_aberto_importado: contract.total_open_value,
        valor_total_contratual_desconhecido: true,
        produto_unidade_id: unit.id,
      }),
    ],
  )
  return saved
}

async function upsertContractItem(client, tenantId, contractId, item, unitId, typeId, indexId) {
  const periodicity = periodicityFor(item)
  const { rows: [saved] } = await client.query(
    `INSERT INTO com_contrato_itens
       (tenant_id, contrato_id, produto_id, tipo_receita_id, descricao,
        quantidade, valor_unitario, valor_total, periodicidade, dia_vencimento,
        data_inicio, data_fim, indice_reajuste_id, gera_recebiveis,
        ordem, dados_adicionais, ativo, origem, codigo_legado)
     VALUES ($1,$2,$3,$4,$5,1,$6,$6,$7,$8,$9,$10,$11,TRUE,$12,$13::jsonb,TRUE,'strato_receber',$14)
     ON CONFLICT (tenant_id, origem, codigo_legado)
       WHERE codigo_legado IS NOT NULL
     DO UPDATE SET
       contrato_id=EXCLUDED.contrato_id,
       produto_id=EXCLUDED.produto_id,
       tipo_receita_id=EXCLUDED.tipo_receita_id,
       descricao=EXCLUDED.descricao,
       valor_unitario=EXCLUDED.valor_unitario,
       valor_total=EXCLUDED.valor_total,
       periodicidade=EXCLUDED.periodicidade,
       dia_vencimento=EXCLUDED.dia_vencimento,
       data_inicio=EXCLUDED.data_inicio,
       data_fim=EXCLUDED.data_fim,
       indice_reajuste_id=COALESCE(com_contrato_itens.indice_reajuste_id, EXCLUDED.indice_reajuste_id),
       dados_adicionais=COALESCE(com_contrato_itens.dados_adicionais,'{}'::jsonb) || EXCLUDED.dados_adicionais,
       updated_at=NOW()
     RETURNING *`,
    [
      tenantId,
      contractId,
      unitId,
      typeId,
      item.revenue_type_label,
      item.total_value,
      periodicity,
      item.due_day,
      item.start_date,
      item.end_date,
      indexId,
      Object.keys(TYPE_TO_PARCELA).indexOf(item.revenue_type),
      jsonObject({ quantidade_parcelas_relatorio: item.installments.length }),
      item.legacy_key,
    ],
  )
  return saved
}

async function upsertRevenue(client, tenantId, customerId, contractId, contractItemId, unitId, item, typeId, indexId, obra, unitCode, metadata) {
  const periodicity = periodicityFor(item)
  const title = `${item.revenue_type_label} — ${obra.nome || 'Obra'} / Unidade ${unitCode}`
  const { rows: [saved] } = await client.query(
    `INSERT INTO fin_receitas
       (tenant_id, cliente_id, contrato_id, contrato_item_id, produto_id,
        tipo_receita_id, titulo, descricao, numero_documento, valor_total,
        competencia_inicio, competencia_fim, periodicidade, dia_vencimento,
        indice_reajuste_id, status, origem, codigo_legado, dados_adicionais)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'ativa','strato_receber',$16,$17::jsonb)
     ON CONFLICT (tenant_id, origem, codigo_legado)
       WHERE codigo_legado IS NOT NULL
     DO UPDATE SET
       cliente_id=EXCLUDED.cliente_id,
       contrato_id=EXCLUDED.contrato_id,
       contrato_item_id=EXCLUDED.contrato_item_id,
       produto_id=EXCLUDED.produto_id,
       tipo_receita_id=EXCLUDED.tipo_receita_id,
       titulo=EXCLUDED.titulo,
       descricao=COALESCE(NULLIF(fin_receitas.descricao,''), EXCLUDED.descricao),
       numero_documento=COALESCE(NULLIF(fin_receitas.numero_documento,''), EXCLUDED.numero_documento),
       valor_total=CASE WHEN fin_receitas.status='encerrada' THEN fin_receitas.valor_total ELSE EXCLUDED.valor_total END,
       competencia_inicio=EXCLUDED.competencia_inicio,
       competencia_fim=EXCLUDED.competencia_fim,
       periodicidade=EXCLUDED.periodicidade,
       dia_vencimento=EXCLUDED.dia_vencimento,
       indice_reajuste_id=COALESCE(fin_receitas.indice_reajuste_id, EXCLUDED.indice_reajuste_id),
       dados_adicionais=COALESCE(fin_receitas.dados_adicionais,'{}'::jsonb) || EXCLUDED.dados_adicionais,
       updated_at=NOW()
     RETURNING *`,
    [
      tenantId,
      customerId,
      contractId,
      contractItemId,
      unitId,
      typeId,
      title,
      `Receita importada do relatório Strato com posição ${metadata.report_position}.`,
      item.installments[0]?.document_base || null,
      item.total_value,
      item.start_date,
      item.end_date,
      periodicity,
      item.due_day,
      indexId,
      item.legacy_key,
      jsonObject({
        origem_relatorio: metadata.source_file,
        posicao_relatorio: metadata.report_position,
        quantidade_parcelas: item.installments.length,
      }),
    ],
  )
  return saved
}

async function upsertParcelChunk(client, rows) {
  if (!rows.length) return

  const columns = [
    'tenant_id', 'contrato_id', 'numero', 'tipo', 'vencimento', 'valor_nominal',
    'valor_correcao', 'valor_multa', 'valor_juros_mora', 'valor_desconto', 'status',
    'receita_id', 'contrato_item_id', 'produto_id', 'tipo_receita_id',
    'documento_legado', 'documento_base_legado', 'parcela_numero_legado',
    'parcela_total_legado', 'obra_codigo_legado', 'unidade_codigo_legado',
    'indice_codigo_legado', 'valor_convertido', 'valor_residuo', 'valor_moras',
    'valor_seguro', 'valor_juros_financiamento', 'valor_total_relatorio',
    'origem', 'codigo_legado', 'posicao_relatorio', 'dados_adicionais',
  ]

  const values = []
  const params = []
  let position = 1
  for (const row of rows) {
    const rowValues = columns.map(column => row[column])
    params.push(`(${rowValues.map(() => `$${position++}`).join(',')})`)
    values.push(...rowValues)
  }

  await client.query(
    `INSERT INTO com_parcelas (${columns.join(',')})
     VALUES ${params.join(',')}
     ON CONFLICT (tenant_id, origem, codigo_legado)
       WHERE codigo_legado IS NOT NULL
     DO UPDATE SET
       contrato_id=EXCLUDED.contrato_id,
       receita_id=EXCLUDED.receita_id,
       contrato_item_id=EXCLUDED.contrato_item_id,
       produto_id=EXCLUDED.produto_id,
       tipo_receita_id=EXCLUDED.tipo_receita_id,
       numero=EXCLUDED.numero,
       tipo=EXCLUDED.tipo,
       vencimento=EXCLUDED.vencimento,
       valor_nominal=CASE WHEN com_parcelas.status='paga' THEN com_parcelas.valor_nominal ELSE EXCLUDED.valor_nominal END,
       status=CASE WHEN com_parcelas.status='paga' THEN 'paga' ELSE EXCLUDED.status END,
       documento_legado=EXCLUDED.documento_legado,
       documento_base_legado=EXCLUDED.documento_base_legado,
       parcela_numero_legado=EXCLUDED.parcela_numero_legado,
       parcela_total_legado=EXCLUDED.parcela_total_legado,
       obra_codigo_legado=EXCLUDED.obra_codigo_legado,
       unidade_codigo_legado=EXCLUDED.unidade_codigo_legado,
       indice_codigo_legado=EXCLUDED.indice_codigo_legado,
       valor_convertido=EXCLUDED.valor_convertido,
       valor_residuo=EXCLUDED.valor_residuo,
       valor_moras=EXCLUDED.valor_moras,
       valor_seguro=EXCLUDED.valor_seguro,
       valor_juros_financiamento=EXCLUDED.valor_juros_financiamento,
       valor_total_relatorio=EXCLUDED.valor_total_relatorio,
       posicao_relatorio=EXCLUDED.posicao_relatorio,
       dados_adicionais=COALESCE(com_parcelas.dados_adicionais,'{}'::jsonb) || EXCLUDED.dados_adicionais,
       updated_at=NOW()`,
    values,
  )
}

async function main() {
  if (!fs.existsSync(importPath)) {
    throw new Error(`Arquivo de importação não encontrado: ${importPath}`)
  }

  const payload = JSON.parse(fs.readFileSync(importPath, 'utf8'))
  const metadata = payload.metadata || {}
  const contracts = Array.isArray(payload.contracts) ? payload.contracts : []

  await connectDB()
  const client = await pool.connect()

  try {
    await assertStructure(client)
    const tenantId = await resolveTenant(client)
    const clientIndex = await loadClientIndex(client)
    const { revenueTypes, indices } = await loadLookupMaps(client, tenantId)

    const missingRevenueTypes = [...new Set(
      contracts.flatMap(contract => contract.items.map(item => item.revenue_type)),
    )].filter(code => !revenueTypes.has(code))
    if (missingRevenueTypes.length) {
      throw new Error(`Tipos de receita não cadastrados: ${missingRevenueTypes.join(', ')}. Rode novamente a migration da Fase 1.`)
    }

    const matched = []
    const unmatched = []
    const ambiguous = []

    for (const contract of contracts) {
      const candidates = clientIndex.get(normalizeName(contract.client_name_normalized || contract.client_name)) || []
      if (candidates.length === 1) matched.push({ contract, customer: candidates[0] })
      else if (!candidates.length) unmatched.push(contract)
      else ambiguous.push({ contract, candidates })
    }

    const matchedInactive = matched.filter(({ customer }) =>
      customer.cliente_ativo === false || customer.pessoa_ativa === false,
    )

    const unitCodes = contracts.map(contract => `${contract.obra_code}|${contract.unit_code}`)
    const contractCodes = contracts.map(contract => contract.legacy_key)
    const revenueCodes = contracts.flatMap(contract => contract.items.map(item => item.legacy_key))
    const parcelCodes = contracts.flatMap(contract => contract.items.flatMap(item => item.installments.map(row => row.legacy_key)))

    const existingUnits = await countExistingProducts(client, tenantId, unitCodes)
    const existingContracts = await countExisting(client, 'com_contratos', tenantId, contractCodes)
    const existingRevenues = await countExisting(client, 'fin_receitas', tenantId, revenueCodes)
    const existingParcels = await countExisting(client, 'com_parcelas', tenantId, parcelCodes)

    console.log('='.repeat(78))
    console.log('IMPORTAÇÃO DE CONTRATOS, RECEITAS E PARCELAS — STRATO — FASE 2')
    console.log('='.repeat(78))
    console.log(`Modo: ${execute ? 'EXECUÇÃO' : 'PRÉVIA — nenhuma gravação será feita'}`)
    console.log(`Tenant: ${tenantId}`)
    console.log(`Arquivo: ${metadata.source_file || path.basename(importPath)}`)
    console.log(`Posição do relatório: ${metadata.report_position || '—'}`)
    console.log(`Clientes distintos no relatório: ${metadata.clients || 0}`)
    console.log(`Clientes/contratos vinculados por nome exato normalizado: ${matched.length}`)
    console.log(`Contratos vinculados a clientes inativos: ${matchedInactive.length}`)
    console.log(`Contratos sem cliente localizado: ${unmatched.length}`)
    console.log(`Contratos com cliente ambíguo: ${ambiguous.length}`)
    console.log(`Unidades/produtos do relatório: ${metadata.units || unitCodes.length}`)
    console.log(`  Já cadastradas: ${existingUnits}`)
    console.log(`  Novas estimadas: ${Math.max(0, unitCodes.length - existingUnits)}`)
    console.log(`Contratos do relatório: ${metadata.contracts || contracts.length}`)
    console.log(`  Já cadastrados: ${existingContracts}`)
    console.log(`  Novos estimados: ${Math.max(0, contractCodes.length - existingContracts)}`)
    console.log(`Receitas do relatório: ${metadata.revenues || revenueCodes.length}`)
    console.log(`  Já cadastradas: ${existingRevenues}`)
    console.log(`  Novas estimadas: ${Math.max(0, revenueCodes.length - existingRevenues)}`)
    console.log(`Parcelas do relatório: ${metadata.detail_rows || parcelCodes.length}`)
    console.log(`  Já cadastradas: ${existingParcels}`)
    console.log(`  Novas estimadas: ${Math.max(0, parcelCodes.length - existingParcels)}`)
    console.log(`Saldo em aberto do relatório: R$ ${Number(metadata.total_open_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)

    if (unmatched.length) {
      console.log('\nCLIENTES NÃO LOCALIZADOS:')
      for (const contract of unmatched.slice(0, 30)) {
        console.log(`  - ${contract.client_name} | obra ${contract.obra_code} | unidade ${contract.unit_code}`)
      }
    }
    if (ambiguous.length) {
      console.log('\nCLIENTES AMBÍGUOS:')
      for (const item of ambiguous.slice(0, 30)) {
        console.log(`  - ${item.contract.client_name}: IDs ${item.candidates.map(c => c.cliente_id).join(', ')}`)
      }
    }

    if (!execute) {
      console.log('\nUse --execute para confirmar a importação após conferir os números acima.')
      return
    }

    if (unmatched.length || ambiguous.length) {
      throw new Error(
        'Execução cancelada para evitar contratos sem cliente correto. ' +
        `Não localizados: ${unmatched.length}; ambíguos: ${ambiguous.length}.`,
      )
    }

    await client.query('BEGIN')

    const obraCache = new Map()
    let unitsProcessed = 0
    let contractsProcessed = 0
    let revenuesProcessed = 0
    let parcelsProcessed = 0
    const parcelBuffer = []
    const today = new Date().toISOString().slice(0, 10)

    for (const { contract, customer } of matched) {
      let obra = obraCache.get(contract.obra_code)
      if (!obra) {
        obra = await resolveOrCreateObra(client, tenantId, contract.obra_code)
        obraCache.set(contract.obra_code, obra)
      }

      const unit = await resolveOrCreateUnit(client, tenantId, contract, obra)
      unitsProcessed += 1

      const contractIndexCode = mapIndexCode(contract.index_code)
      const contractIndexId = contractIndexCode ? indices.get(contractIndexCode)?.id || null : null
      const savedContract = await upsertContract(
        client,
        tenantId,
        contract,
        customer,
        obra,
        unit,
        contractIndexId,
        metadata,
      )
      contractsProcessed += 1

      for (const item of contract.items) {
        const revenueType = revenueTypes.get(item.revenue_type)
        const indexCode = mapIndexCode(item.index_code)
        const indexId = indexCode ? indices.get(indexCode)?.id || null : null
        const contractItem = await upsertContractItem(
          client,
          tenantId,
          savedContract.id,
          item,
          unit.id,
          revenueType.id,
          indexId,
        )
        const revenue = await upsertRevenue(
          client,
          tenantId,
          customer.cliente_id,
          savedContract.id,
          contractItem.id,
          unit.id,
          item,
          revenueType.id,
          indexId,
          obra,
          contract.unit_code,
          metadata,
        )
        revenuesProcessed += 1

        item.installments.forEach((row, index) => {
          parcelBuffer.push({
            tenant_id: tenantId,
            contrato_id: savedContract.id,
            numero: index + 1,
            tipo: TYPE_TO_PARCELA[item.revenue_type] || 'parcela',
            vencimento: row.due_date,
            valor_nominal: row.total_value,
            valor_correcao: 0,
            valor_multa: 0,
            valor_juros_mora: 0,
            valor_desconto: 0,
            status: row.due_date < today ? 'atrasada' : 'aberta',
            receita_id: revenue.id,
            contrato_item_id: contractItem.id,
            produto_id: unit.id,
            tipo_receita_id: revenueType.id,
            documento_legado: row.document,
            documento_base_legado: row.document_base,
            parcela_numero_legado: row.installment_number,
            parcela_total_legado: row.installment_count,
            obra_codigo_legado: Number(row.obra_code) || null,
            unidade_codigo_legado: row.unit_code,
            indice_codigo_legado: row.index_code,
            valor_convertido: row.converted_value,
            valor_residuo: row.residue_value,
            valor_moras: row.mora_value,
            valor_seguro: row.insurance_value,
            valor_juros_financiamento: row.financing_interest_value,
            valor_total_relatorio: row.total_value,
            origem: 'strato_receber',
            codigo_legado: row.legacy_key,
            posicao_relatorio: metadata.report_position,
            dados_adicionais: jsonObject({
              linha_relatorio: row.source_row,
              tipo_legado: row.legacy_type,
              desconto_legado: row.discount_value,
              composicao_total: {
                convertido: row.converted_value,
                residuo: row.residue_value,
                moras: row.mora_value,
                desconto: row.discount_value,
                seguro: row.insurance_value,
                juros_financiamento: row.financing_interest_value,
                total: row.total_value,
              },
            }),
          })

          if (parcelBuffer.length >= 200) {
            // O flush ocorre abaixo, fora do callback síncrono.
          }
        })

        while (parcelBuffer.length >= 200) {
          const chunk = parcelBuffer.splice(0, 200)
          await upsertParcelChunk(client, chunk)
          parcelsProcessed += chunk.length
        }
      }
    }

    if (parcelBuffer.length) {
      await upsertParcelChunk(client, parcelBuffer)
      parcelsProcessed += parcelBuffer.length
    }

    await client.query('COMMIT')

    console.log('\nIMPORTAÇÃO CONCLUÍDA')
    console.log(`Unidades processadas: ${unitsProcessed}`)
    console.log(`Contratos processados: ${contractsProcessed}`)
    console.log(`Receitas processadas: ${revenuesProcessed}`)
    console.log(`Parcelas processadas: ${parcelsProcessed}`)
    console.log('A importação é idempotente: uma nova execução atualiza os mesmos vínculos sem duplicar registros.')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`❌ Erro na importação dos recebíveis Strato: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => {
  logger.error(`❌ Falha inesperada: ${error.message}`)
  process.exitCode = 1
})
