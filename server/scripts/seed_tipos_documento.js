/**
 * scripts/seed_tipos_documento.js
 * → server/scripts/seed_tipos_documento.js  (novo)
 * Rodar: node scripts/seed_tipos_documento.js
 */
require('dotenv').config()
const { pool, connectDB } = require('../src/config/database')
const logger = require('../src/config/logger')

const TIPOS = [
  { nome: 'Nota Fiscal',              descricao: 'NF-e, NFS-e ou nota fiscal avulsa',      usado_em: ['pagar','receber'] },
  { nome: 'Boleto',                   descricao: 'Boleto bancário',                          usado_em: ['pagar','receber'] },
  { nome: 'Recibo',                   descricao: 'Recibo de pagamento ou recebimento',       usado_em: ['pagar','receber'] },
  { nome: 'Contrato',                 descricao: 'Documento contratual',                     usado_em: ['pagar','receber'] },
  { nome: 'Fatura',                   descricao: 'Fatura de serviços ou produtos',           usado_em: ['pagar','receber'] },
  { nome: 'Duplicata',                descricao: 'Duplicata mercantil',                      usado_em: ['pagar','receber'] },
  { nome: 'Cheque',                   descricao: 'Cheque pré-datado ou à vista',             usado_em: ['pagar','receber'] },
  { nome: 'Comprovante de Pagamento', descricao: 'Comprovante de TED, PIX ou DOC',          usado_em: ['pagar','receber'] },
  { nome: 'Proposta Comercial',       descricao: 'Proposta ou orçamento aprovado',           usado_em: ['pagar','receber'] },
  { nome: 'Ordem de Serviço',         descricao: 'OS emitida para prestador',                usado_em: ['pagar'] },
  { nome: 'Outros',                   descricao: 'Outros tipos de documento',                usado_em: ['pagar','receber'] },
]

async function seed() {
  await connectDB()
  const { rows: tenants } = await pool.query('SELECT id, name FROM hub_tenants')
  logger.info(`Seeding tipos de documento para ${tenants.length} tenant(s)...`)
  let created = 0, skipped = 0

  for (const tenant of tenants) {
    for (const t of TIPOS) {
      const { rows: ex } = await pool.query(
        'SELECT id FROM fin_tipos_documento WHERE tenant_id=$1 AND nome=$2',
        [tenant.id, t.nome]
      )
      if (ex.length) { skipped++; continue }
      await pool.query(
        'INSERT INTO fin_tipos_documento (tenant_id, nome, descricao, usado_em) VALUES ($1,$2,$3,$4)',
        [tenant.id, t.nome, t.descricao, t.usado_em]
      )
      logger.info(`  ✅  [${tenant.name}] ${t.nome}`)
      created++
    }
  }

  logger.info(`\n✅  Concluído: ${created} criados, ${skipped} já existiam`)
  await pool.end()
}

seed().catch(err => {
  logger.error('Erro: ' + err.message)
  process.exit(1)
})
