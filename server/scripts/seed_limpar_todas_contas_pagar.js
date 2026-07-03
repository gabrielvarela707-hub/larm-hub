/**
 * Limpa integralmente Contas a Pagar para novo lançamento manual a partir de 01/07/2026.
 * O Movimento Bancário é preservado.
 *
 * Prévia:
 *   node scripts/seed_limpar_todas_contas_pagar.js
 * Execução (use a quantidade mostrada na prévia):
 *   node scripts/seed_limpar_todas_contas_pagar.js --execute --confirmar=QUANTIDADE
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { pool, connectDB } = require('../src/config/database')

function arg(name){const p=`--${name}=`;return process.argv.find(x=>x.startsWith(p))?.slice(p.length)}
function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4})}
async function exists(client,name){const {rows}=await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`,[`public.${name}`]);return rows[0].ok}

async function main(){
  await connectDB()
  const execute=process.argv.includes('--execute')
  const client=await pool.connect()
  try{
    const [lanc,parc,bol]=await Promise.all([
      client.query(`SELECT COUNT(*)::int count,COALESCE(SUM(valor_total),0)::numeric total FROM fin_lancamentos_cp`),
      client.query(`SELECT COUNT(*)::int count,COALESCE(SUM(valor),0)::numeric total,COUNT(movimento_id)::int linked FROM fin_parcelas_cp`),
      exists(client,'fin_lancamentos_cp_boletos').then(ok=>ok?client.query(`SELECT COUNT(*)::int count FROM fin_lancamentos_cp_boletos`):{rows:[{count:0}]})
    ])
    const count=Number(lanc.rows[0].count)
    console.log('\nLIMPEZA TOTAL — CONTAS A PAGAR')
    console.log(`Lançamentos: ${count} | Valor: ${money(lanc.rows[0].total)}`)
    console.log(`Parcelas: ${parc.rows[0].count} | Valor: ${money(parc.rows[0].total)}`)
    console.log(`Parcelas vinculadas ao Movimento Bancário: ${parc.rows[0].linked}`)
    console.log(`Boletos/anexos: ${bol.rows[0].count}`)
    console.log('Movimento Bancário: SERÁ PRESERVADO.')
    if(!execute){console.log(`\nModo prévia: nada foi apagado. Para executar: --execute --confirmar=${count}`);return}
    if(Number(arg('confirmar'))!==count)throw new Error(`Confirmação inválida. Use --confirmar=${count}.`)
    if(!count)throw new Error('Contas a Pagar já está vazia.')

    await client.query('BEGIN')
    const hasBoletos = await exists(client,'fin_lancamentos_cp_boletos')
    await client.query(hasBoletos
      ? 'LOCK TABLE fin_lancamentos_cp, fin_parcelas_cp, fin_lancamentos_cp_boletos IN ACCESS EXCLUSIVE MODE'
      : 'LOCK TABLE fin_lancamentos_cp, fin_parcelas_cp IN ACCESS EXCLUSIVE MODE')
    const {rows:[lockedCount]}=await client.query('SELECT COUNT(*)::int count FROM fin_lancamentos_cp')
    if(Number(lockedCount.count)!==count)throw new Error(`A quantidade mudou entre a prévia e o bloqueio (${count} -> ${lockedCount.count}). Execute a prévia novamente.`)

    const backupDir=path.join(__dirname,'backups');fs.mkdirSync(backupDir,{recursive:true})
    const stamp=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)
    const backupLot=`CP-LIMPEZA-TOTAL-0379-${stamp}`
    const backupPath=path.join(backupDir,`contas-pagar-tudo-antes-0379-${stamp}.json.gz`)
    const snapshot={generated_at:new Date().toISOString(),release:'0.3.79',lancamentos:(await client.query('SELECT * FROM fin_lancamentos_cp ORDER BY id')).rows,parcelas:(await client.query('SELECT * FROM fin_parcelas_cp ORDER BY id')).rows}
    if(hasBoletos)snapshot.boletos=(await client.query('SELECT * FROM fin_lancamentos_cp_boletos ORDER BY id')).rows
    fs.writeFileSync(backupPath,zlib.gzipSync(JSON.stringify(snapshot,null,2)))

    const hasBackupTable = await exists(client,'fin_importacao_backup')
    if(hasBackupTable){
      await client.query(`INSERT INTO fin_importacao_backup(lote_id,tabela_origem,registro_id,dados)
        SELECT $1,'fin_lancamentos_cp',id,to_jsonb(x) FROM fin_lancamentos_cp x`,[backupLot])
      await client.query(`INSERT INTO fin_importacao_backup(lote_id,tabela_origem,registro_id,dados)
        SELECT $1,'fin_parcelas_cp',id,to_jsonb(x) FROM fin_parcelas_cp x`,[backupLot])
      if(hasBoletos)await client.query(`INSERT INTO fin_importacao_backup(lote_id,tabela_origem,registro_id,dados)
        SELECT $1,'fin_lancamentos_cp_boletos',id,to_jsonb(x) FROM fin_lancamentos_cp_boletos x`,[backupLot])
    }

    if(hasBoletos)await client.query('DELETE FROM fin_lancamentos_cp_boletos')
    await client.query('DELETE FROM fin_parcelas_cp')
    await client.query('DELETE FROM fin_lancamentos_cp')
    const {rows:[check]}=await client.query(`SELECT (SELECT COUNT(*) FROM fin_lancamentos_cp)::int lancamentos,(SELECT COUNT(*) FROM fin_parcelas_cp)::int parcelas`)
    if(check.lancamentos!==0||check.parcelas!==0)throw new Error('Validação final falhou; transação será revertida.')
    await client.query('COMMIT')
    console.log('\nLimpeza concluída. Contas a Pagar ficou vazia.')
    console.log(`Backup externo: ${backupPath}`)
    console.log(`Lote de backup no banco: ${backupLot}`)
    console.log('Movimento Bancário não foi alterado.')
  }catch(e){try{await client.query('ROLLBACK')}catch{};throw e}finally{client.release();await pool.end()}
}
main().catch(e=>{console.error(`\nERRO: ${e.message}`);process.exit(1)})
