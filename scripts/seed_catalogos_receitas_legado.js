/**
 * Versão 0.3.43 — Seed opcional dos catálogos comerciais a partir do legado.
 *
 * Fontes:
 * - tb2_obra  -> cad_produtos (tipo obra)
 * - ts1_prod  -> cad_produtos (tipo produto), quando houver registros
 * - ts1_serv  -> cad_servicos
 *
 * Este script NÃO importa contratos, receitas nem parcelas.
 *
 * Prévia (padrão):
 *   node scripts/seed_catalogos_receitas_legado.js --preview
 *
 * Execução:
 *   node scripts/seed_catalogos_receitas_legado.js --execute
 *   node scripts/seed_catalogos_receitas_legado.js --execute --tenant=<UUID>
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const tenantArg = args.find(arg => arg.startsWith('--tenant='))?.split('=')[1] || null

function clean(value) {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function jsonObject(value) {
  return JSON.stringify(value || {})
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
  if (rows.length === 0) throw new Error('Nenhum tenant cadastrado em hub_tenants.')

  throw new Error(
    `Existem ${rows.length} tenants. Informe explicitamente --tenant=<UUID>. ` +
    `IDs disponíveis: ${rows.map(row => row.id).join(', ')}`,
  )
}

async function countExisting(client, table, tenantId, origem, codes) {
  if (!codes.length) return 0
  const { rows: [row] } = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM ${table}
      WHERE tenant_id=$1
        AND origem_legada=$2
        AND codigo_legado = ANY($3::text[])`,
    [tenantId, origem, codes],
  )
  return Number(row.total || 0)
}

async function upsertProduct(client, tenantId, item) {
  const { rows } = await client.query(
    `SELECT id
       FROM cad_produtos
      WHERE tenant_id=$1 AND origem_legada=$2 AND codigo_legado=$3
      LIMIT 1`,
    [tenantId, item.origem_legada, item.codigo_legado],
  )

  if (rows.length) {
    await client.query(
      `UPDATE cad_produtos
          SET codigo = COALESCE(NULLIF(BTRIM(codigo), ''), $1),
              nome = CASE WHEN NULLIF(BTRIM(nome), '') IS NULL THEN $2 ELSE nome END,
              descricao = COALESCE(NULLIF(BTRIM(descricao), ''), $3),
              unidade_medida = COALESCE(NULLIF(BTRIM(unidade_medida), ''), $4),
              valor_padrao = COALESCE(valor_padrao, $5),
              dados_adicionais = COALESCE(dados_adicionais, '{}'::jsonb) || $6::jsonb,
              updated_at = NOW()
        WHERE id=$7`,
      [
        item.codigo,
        item.nome,
        item.descricao,
        item.unidade_medida,
        item.valor_padrao,
        jsonObject(item.dados_adicionais),
        rows[0].id,
      ],
    )
    return 'updated'
  }

  await client.query(
    `INSERT INTO cad_produtos
       (tenant_id, codigo, nome, descricao, tipo, unidade_medida, valor_padrao,
        origem_legada, codigo_legado, dados_adicionais, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
    [
      tenantId,
      item.codigo,
      item.nome,
      item.descricao,
      item.tipo,
      item.unidade_medida,
      item.valor_padrao,
      item.origem_legada,
      item.codigo_legado,
      jsonObject(item.dados_adicionais),
      item.ativo,
    ],
  )
  return 'inserted'
}

async function upsertService(client, tenantId, item) {
  const { rows } = await client.query(
    `SELECT id
       FROM cad_servicos
      WHERE tenant_id=$1 AND origem_legada=$2 AND codigo_legado=$3
      LIMIT 1`,
    [tenantId, item.origem_legada, item.codigo_legado],
  )

  if (rows.length) {
    await client.query(
      `UPDATE cad_servicos
          SET codigo = COALESCE(NULLIF(BTRIM(codigo), ''), $1),
              nome = CASE WHEN NULLIF(BTRIM(nome), '') IS NULL THEN $2 ELSE nome END,
              descricao = COALESCE(NULLIF(BTRIM(descricao), ''), $3),
              codigo_fiscal = COALESCE(NULLIF(BTRIM(codigo_fiscal), ''), $4),
              item_lista_servico = COALESCE(NULLIF(BTRIM(item_lista_servico), ''), $5),
              dados_adicionais = COALESCE(dados_adicionais, '{}'::jsonb) || $6::jsonb,
              updated_at = NOW()
        WHERE id=$7`,
      [
        item.codigo,
        item.nome,
        item.descricao,
        item.codigo_fiscal,
        item.item_lista_servico,
        jsonObject(item.dados_adicionais),
        rows[0].id,
      ],
    )
    return 'updated'
  }

  await client.query(
    `INSERT INTO cad_servicos
       (tenant_id, codigo, nome, descricao, codigo_fiscal, item_lista_servico,
        periodicidade_padrao, gera_receita_recorrente, origem_legada,
        codigo_legado, dados_adicionais, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,'unica',FALSE,$7,$8,$9::jsonb,$10)`,
    [
      tenantId,
      item.codigo,
      item.nome,
      item.descricao,
      item.codigo_fiscal,
      item.item_lista_servico,
      item.origem_legada,
      item.codigo_legado,
      jsonObject(item.dados_adicionais),
      item.ativo,
    ],
  )
  return 'inserted'
}

async function loadLegacy(client) {
  const products = []
  const services = []
  const sources = {}

  if (await tableExists(client, 'tb2_obra')) {
    const { rows } = await client.query(`
      SELECT obra2_cod, obra2_nom, obra2_nom_res, obra2_ide, obra2_obs,
             obra2_are, obra2_are_tot, obra2_end, obra2_end_num, obra2_bai,
             obra2_cep, obra2_cnpj, obra2_email, cemp1_cod, cida2_cod,
             tpob1_cod, emob1_cod, obra2_tip_con
        FROM tb2_obra
       WHERE obra2_cod IS NOT NULL
       ORDER BY obra2_cod
    `)
    sources.tb2_obra = rows.length
    for (const row of rows) {
      const code = String(row.obra2_cod)
      const nome = clean(row.obra2_nom) || clean(row.obra2_nom_res) || `Obra ${code}`
      products.push({
        origem_legada: 'tb2_obra',
        codigo_legado: code,
        codigo: `OBRA-${code}`,
        nome,
        descricao: clean(row.obra2_obs),
        tipo: 'obra',
        unidade_medida: null,
        valor_padrao: null,
        ativo: true,
        dados_adicionais: {
          identificacao: clean(row.obra2_ide),
          nome_resumido: clean(row.obra2_nom_res),
          area: row.obra2_are,
          area_total: row.obra2_are_tot,
          endereco: clean(row.obra2_end),
          numero: clean(row.obra2_end_num),
          bairro: clean(row.obra2_bai),
          cep: clean(row.obra2_cep),
          cnpj: clean(row.obra2_cnpj),
          email: clean(row.obra2_email),
          empresa_legada: row.cemp1_cod,
          cidade_legada: row.cida2_cod,
          tipo_obra_legado: row.tpob1_cod,
          empreendimento_legado: row.emob1_cod,
          tipo_contrato_legado: clean(row.obra2_tip_con),
        },
      })
    }
  } else {
    sources.tb2_obra = 0
  }

  if (await tableExists(client, 'ts1_prod')) {
    const { rows } = await client.query(`
      SELECT prod1_cod, cprod_cprod, cprod_xprod, nfel1_cod, prod1_seq_ite
        FROM ts1_prod
       WHERE prod1_cod IS NOT NULL
       ORDER BY prod1_cod
    `)
    sources.ts1_prod = rows.length
    for (const row of rows) {
      const code = String(row.prod1_cod)
      const nome = clean(row.cprod_xprod) || clean(row.cprod_cprod) || `Produto ${code}`
      products.push({
        origem_legada: 'ts1_prod',
        codigo_legado: code,
        codigo: clean(row.cprod_cprod) || `PROD-${code}`,
        nome,
        descricao: null,
        tipo: 'produto',
        unidade_medida: null,
        valor_padrao: null,
        ativo: true,
        dados_adicionais: {
          nfe_codigo_legado: row.nfel1_cod,
          sequencia_item_legada: row.prod1_seq_ite,
        },
      })
    }
  } else {
    sources.ts1_prod = 0
  }

  if (await tableExists(client, 'ts1_serv')) {
    const { rows } = await client.query(`
      SELECT serv1_cod, serv1_flg_atv, serv1_ide, serv1_ide_agr, serv1_nom
        FROM ts1_serv
       WHERE serv1_cod IS NOT NULL
       ORDER BY serv1_cod
    `)
    sources.ts1_serv = rows.length
    for (const row of rows) {
      const code = String(row.serv1_cod)
      services.push({
        origem_legada: 'ts1_serv',
        codigo_legado: code,
        codigo: clean(row.serv1_ide) || `SERV-${code}`,
        nome: clean(row.serv1_nom) || `Serviço ${code}`,
        descricao: null,
        codigo_fiscal: clean(row.serv1_ide),
        item_lista_servico: clean(row.serv1_ide_agr),
        ativo: code !== '0' && clean(row.serv1_flg_atv) === '1',
        dados_adicionais: {
          flag_ativo_legado: clean(row.serv1_flg_atv),
        },
      })
    }
  } else {
    sources.ts1_serv = 0
  }

  return { products, services, sources }
}

async function main() {
  await connectDB()
  const client = await pool.connect()

  try {
    for (const required of ['cad_produtos', 'cad_servicos']) {
      if (!(await tableExists(client, required))) {
        throw new Error(`Tabela ${required} não existe. Rode primeiro migrate_receitas_contratos_fase1.js.`)
      }
    }

    const tenantId = await resolveTenant(client)
    const { products, services, sources } = await loadLegacy(client)

    const productGroups = products.reduce((acc, row) => {
      acc[row.origem_legada] ||= []
      acc[row.origem_legada].push(row.codigo_legado)
      return acc
    }, {})
    const serviceGroups = services.reduce((acc, row) => {
      acc[row.origem_legada] ||= []
      acc[row.origem_legada].push(row.codigo_legado)
      return acc
    }, {})

    let existingProducts = 0
    for (const [origin, codes] of Object.entries(productGroups)) {
      existingProducts += await countExisting(client, 'cad_produtos', tenantId, origin, codes)
    }
    let existingServices = 0
    for (const [origin, codes] of Object.entries(serviceGroups)) {
      existingServices += await countExisting(client, 'cad_servicos', tenantId, origin, codes)
    }

    console.log('='.repeat(72))
    console.log('SEED DOS CATÁLOGOS COMERCIAIS — FASE 1')
    console.log('='.repeat(72))
    console.log(`Modo: ${execute ? 'EXECUÇÃO' : 'PRÉVIA — nenhuma gravação será feita'}`)
    console.log(`Tenant: ${tenantId}`)
    console.log(`Fontes encontradas: ${JSON.stringify(sources)}`)
    console.log(`Produtos/obras lidos: ${products.length}`)
    console.log(`  Já cadastrados pelo vínculo legado: ${existingProducts}`)
    console.log(`  Novos estimados: ${Math.max(0, products.length - existingProducts)}`)
    console.log(`Serviços lidos: ${services.length}`)
    console.log(`  Já cadastrados pelo vínculo legado: ${existingServices}`)
    console.log(`  Novos estimados: ${Math.max(0, services.length - existingServices)}`)
    console.log('Contratos, receitas e parcelas NÃO serão importados por este script.')

    if (!execute) {
      console.log('\nUse --execute para confirmar a importação dos catálogos.')
      return
    }

    await client.query('BEGIN')
    const result = {
      productsInserted: 0,
      productsUpdated: 0,
      servicesInserted: 0,
      servicesUpdated: 0,
    }

    for (const product of products) {
      const action = await upsertProduct(client, tenantId, product)
      if (action === 'inserted') result.productsInserted += 1
      else result.productsUpdated += 1
    }
    for (const service of services) {
      const action = await upsertService(client, tenantId, service)
      if (action === 'inserted') result.servicesInserted += 1
      else result.servicesUpdated += 1
    }

    await client.query('COMMIT')
    console.log('\n✅ Catálogos importados com sucesso:')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.error(`❌ Erro no seed dos catálogos: ${error.message}`)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
