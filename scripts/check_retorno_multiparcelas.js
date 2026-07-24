/**
 * v0.6.1 — Conferência somente leitura da estrutura multiparcelas.
 */

require('dotenv').config()

const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const EXPECTED_COLUMNS = [
  'id', 'tenant_id', 'retorno_item_id', 'parcela_id', 'movimento_id', 'ordem',
  'fonte', 'metodo_relacionamento', 'confianca', 'obra_codigo', 'unidade',
  'cliente_codigo_legado', 'cliente_nome', 'contrato_codigo_legado',
  'documento_parcela', 'controle_participante', 'vencimento',
  'data_recebimento', 'data_credito', 'valor_nominal',
  'valor_juros_financeiro', 'valor_seguro', 'valor_moras', 'valor_desconto',
  'valor_residuo', 'valor_total', 'valor_pago', 'valor_diferenca', 'status',
  'acao_proposta', 'bloqueado', 'evidencias', 'dados', 'created_at', 'updated_at'
]

const EXPECTED_CONSTRAINTS = [
  'fin_retornos_cobranca_item_parcelas_pkey',
  'fin_retornos_cobranca_item_parcelas_tenant_id_fkey',
  'fin_retornos_cobranca_item_parcelas_retorno_item_id_fkey',
  'fin_retornos_cobranca_item_parcelas_parcela_id_fkey',
  'fin_retornos_cobranca_item_parcelas_movimento_id_fkey',
  'uq_fin_retorno_item_parcela_ordem',
  'ck_fin_retorno_item_parcela_ordem',
  'ck_fin_retorno_item_parcela_confianca',
  'ck_fin_retorno_item_parcela_valores'
]

const EXPECTED_INDEXES = [
  'uq_fin_retorno_item_parcela_vinculo',
  'idx_fin_retorno_item_parcelas_tenant_item',
  'idx_fin_retorno_item_parcelas_parcela',
  'idx_fin_retorno_item_parcelas_movimento',
  'idx_fin_retorno_item_parcelas_controle',
  'idx_fin_retorno_item_parcelas_status'
]

async function check() {
  await connectDB()
  const client = await pool.connect()

  try {
    await client.query('BEGIN READ ONLY')

    const { rows: [table] } = await client.query(`
      SELECT to_regclass('public.fin_retornos_cobranca_item_parcelas') AS name
    `)
    if (!table?.name) throw new Error('Tabela fin_retornos_cobranca_item_parcelas não encontrada.')
    logger.info('Tabela fin_retornos_cobranca_item_parcelas: OK')

    const { rows: columns } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'fin_retornos_cobranca_item_parcelas'
      ORDER BY ordinal_position
    `)
    const columnSet = new Set(columns.map((row) => row.column_name))
    const missingColumns = EXPECTED_COLUMNS.filter((column) => !columnSet.has(column))
    if (missingColumns.length) throw new Error(`Colunas ausentes: ${missingColumns.join(', ')}`)
    logger.info(`Colunas: ${EXPECTED_COLUMNS.length}/${EXPECTED_COLUMNS.length} OK`)

    const { rows: constraints } = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.fin_retornos_cobranca_item_parcelas'::regclass
    `)
    const constraintSet = new Set(constraints.map((row) => row.conname))
    const missingConstraints = EXPECTED_CONSTRAINTS.filter((name) => !constraintSet.has(name))
    if (missingConstraints.length) throw new Error(`Constraints ausentes: ${missingConstraints.join(', ')}`)
    logger.info(`Constraints: ${EXPECTED_CONSTRAINTS.length}/${EXPECTED_CONSTRAINTS.length} OK`)

    const { rows: indexes } = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'fin_retornos_cobranca_item_parcelas'
    `)
    const indexSet = new Set(indexes.map((row) => row.indexname))
    const missingIndexes = EXPECTED_INDEXES.filter((name) => !indexSet.has(name))
    if (missingIndexes.length) throw new Error(`Índices ausentes: ${missingIndexes.join(', ')}`)
    logger.info(`Índices adicionais: ${EXPECTED_INDEXES.length}/${EXPECTED_INDEXES.length} OK`)

    const { rows: [counts] } = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE parcela_id IS NOT NULL)::int AS vinculadas,
        COUNT(*) FILTER (WHERE movimento_id IS NOT NULL)::int AS com_movimento,
        COUNT(*) FILTER (WHERE bloqueado)::int AS bloqueadas,
        COUNT(*) FILTER (
          WHERE valor_nominal < 0
             OR valor_juros_financeiro < 0
             OR valor_seguro < 0
             OR valor_moras < 0
             OR valor_desconto < 0
             OR valor_total < 0
             OR valor_pago < 0
        )::int AS valores_invalidos
      FROM fin_retornos_cobranca_item_parcelas
    `)
    if (counts.valores_invalidos !== 0) throw new Error(`Valores inválidos encontrados: ${counts.valores_invalidos}`)

    const { rows: [orphans] } = await client.query(`
      SELECT COUNT(*)::int AS total
      FROM fin_retornos_cobranca_item_parcelas rp
      LEFT JOIN fin_retornos_cobranca_itens ri ON ri.id = rp.retorno_item_id
      WHERE ri.id IS NULL
    `)
    if (orphans.total !== 0) throw new Error(`Relacionamentos órfãos encontrados: ${orphans.total}`)

    logger.info(`Relacionamentos cadastrados: ${counts.total}`)
    logger.info(`Relacionamentos com parcela: ${counts.vinculadas}`)
    logger.info(`Relacionamentos com movimento: ${counts.com_movimento}`)
    logger.info(`Relacionamentos bloqueados: ${counts.bloqueadas}`)
    logger.info('Relacionamentos órfãos: 0')
    logger.info('✅ Estrutura multiparcelas conferida sem alterar nenhum lançamento.')

    await client.query('ROLLBACK')
  } catch (error) {
    try { await client.query('ROLLBACK') } catch (_) {}
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

check().catch((error) => {
  logger.error(`Falha na conferência multiparcelas: ${error.message}`)
  process.exit(1)
})
