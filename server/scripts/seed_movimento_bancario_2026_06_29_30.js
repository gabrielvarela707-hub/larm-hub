/**
 * v0.3.85 — Confere 26/06 apenas como referência e inclui somente os faltantes de 29 e 30/06/2026.
 *
 * Prévia:
 *   node scripts/seed_movimento_bancario_2026_06_29_30.js
 *
 * Execução:
 *   node scripts/seed_movimento_bancario_2026_06_29_30.js --execute --confirmar=N
 */
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const zlib = require('zlib')
const { pool, connectDB } = require('../src/config/database')

const RELEASE = '0.3.85'
const LOT = 'MOV-2026-20260629-30-0385'
const SOURCE = 'Movimento Bancário-2026 - LarmHub (1).xlsx'
const EXPECTED = { count: 20, entries: 129498.99, outflows: 143258.64 }

const ROWS = [
  ['2026-06-26','LARM','BRADESCO',2.10,0,'','Rendimento de aplicação','','REND. S/APLICACOES FINANCEIRAS','','','5.1.3','',2311],
  ['2026-06-26','LARM','BRADESCO',4984.32,0,'','Liquidação de cobrança','','VENDA DE IMÓVEIS','','','1.1.1','',2312],
  ['2026-06-26','LARM','BRADESCO',0,33665.21,'Sul America Companhia de Seguros','Mensalidade plano de saúde familia Monteiro','','ASSISTÊNCIA MÉDICA','','','4.12.2','',2313],
  ['2026-06-26','LARM','BRADESCO',0,3.07,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2314],
  ['2026-06-26','LARM','BRADESCO',0,12,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2315],
  ['2026-06-26','LARM','BRADESCO',0,3.37,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2316],
  ['2026-06-26','LUCKY','BRADESCO',1693.81,0,'','Liquidação de cobrança','','VENDA DE IMÓVEIS','','','1.1.1','',2317],
  ['2026-06-26','LUCKY','BRADESCO',0,3,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2318],
  ['2026-06-26','LUCKY','BRADESCO',0,3.06,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2319],
  ['2026-06-26','RM','DAYCOVAL',200932.91,0,'','Resgate de investimentos','','INVESTIMENTOS','','','7.1.1','',2320],
  ['2026-06-26','RM','Daycoval Invest.',0,200932.91,'','Resgate de investimentos','','INVESTIMENTOS','','','7.1.1','',2321],
  ['2026-06-29','LM','DAYCOVAL',0,3894.25,'Jose Vicente Prado','férias periodo aquisitivo: 02/6/25 a 01/6/26 perido das férias: 01/7/26 a 30/7/26','','FÉRIAS','','','4.1.4','',2322],
  ['2026-06-29','LM','DAYCOVAL',0,10445,'Oliveira Serviços de Segurança Ltda','Alvo Segurança - Lot. Sta. Clara ref. 21/05/26 a 20/06/26.','','SEGURANÇA E VIGILÂNCIA','Administrativo','','4.5.7','',2325],
  ['2026-06-29','LM','DAYCOVAL',0,13,'SRF','ITR/25 Faz. Do Cocho','','OUTROS IMPOSTOS E TAXAS','','','4.9.8','',2326],
  ['2026-06-29','LM','DAYCOVAL',0,255.46,'SRF','ITR/24 Faz. Do Cocho','','OUTROS IMPOSTOS E TAXAS','','','4.9.8','',2327],
  ['2026-06-29','LUCKY','BRADESCO',6354.31,0,'','Liquidação de cobrança','','VENDA DE IMÓVEIS','','','1.1.1','',2328],
  ['2026-06-29','LUCKY','BRADESCO',100000,0,'Rosa Maria Couto Monteiro','Empréstimo RM para Lucky','','EMPRÉSTIMOS','','','7.4.2','',2329],
  ['2026-06-29','LUCKY','BRADESCO',0,5000,'Dlocal Brasil IP S/A','recarga Facebook - Marketing - Lot. Sta Clara','','PROMOÇÃO DE VENDAS','','','4.8.1','',2330],
  ['2026-06-29','LUCKY','BRADESCO',0,3284.75,'Geoverde Engenharia Ltda','NF 1233 - ref. Relatorio area verde Quadra Z - Lot.Sta Clara','','LOTEAMENTO-RES. SANTA CLARA II','','','8.7.1','',2331],
  ['2026-06-29','LUCKY','BRADESCO',0,1500,'TBJR Informatica Ltda','NF 795 serviços prestados - informatica','','SISTEMA DE PROCESSAMENTO DE DADOS','','','7.3.9','',2332],
  ['2026-06-29','LUCKY','BRADESCO',0,6000,'TBJR Informatica Ltda','NF796 Proposta sistema BHUB empresas - informatica','','SISTEMA DE PROCESSAMENTO DE DADOS','','','7.3.9','',2333],
  ['2026-06-29','LUCKY','BRADESCO',0,6.12,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2334],
  ['2026-06-29','LUCKY','BRADESCO',0,12,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2335],
  ['2026-06-29','RM','DAYCOVAL',0,100000,'Lucky Capital Empreendimentos Ltda','Empréstimo RM para Lucky','','EMPRÉSTIMOS','','','7.4.2','',2336],
  ['2026-06-30','LARM','BRADESCO',0.24,0,'','Rendimento de aplicação','','REND. S/APLICACOES FINANCEIRAS','','','5.1.3','',2337],
  ['2026-06-30','LARM','BRADESCO',8675.59,0,'','Liquidação de cobrança','','VENDA DE IMÓVEIS','','','1.1.1','',2338],
  ['2026-06-30','LARM','BRADESCO',0,12800,'Mariana Mattedi','Despesas médicas LM, FCM e EC reembolsadas LM','','DESPESAS MÉDICAS','','','4.12.1','',2339],
  ['2026-06-30','LARM','BRADESCO',0,15,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2340],
  ['2026-06-30','LUCKY','BRADESCO',14468.85,0,'','Liquidação de cobrança','','VENDA DE IMÓVEIS','','','1.1.1','',2341],
  ['2026-06-30','LUCKY','BRADESCO',0,3.06,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2342],
  ['2026-06-30','LUCKY','BRADESCO',0,30,'','Tarifas bancárias','','DESPESAS BANCARIAS E COMISSOES','','','5.2.2','',2343],
].map(([data,empresa,banco,entradas,saidas,fornecedor,historico,nfDoc,conta,centro,obra,natureza,nCheque,line]) => ({data,empresa,banco,entradas,saidas,fornecedor,historico,nfDoc,conta,centro,obra,natureza,nCheque,line}))

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value || '').slice(0, 10)
}
function canonicalBank(value) {
  const bank = normalizeText(value)
  if (bank.includes('BRADESCO')) return 'BRADESCO'
  if (bank.includes('DAYCOVAL') && bank.includes('INVEST')) return 'DAYCOVAL INVEST'
  if (bank.includes('DAYCOVAL')) return 'DAYCOVAL'
  return bank
}
function amount(value) {
  return Number(value || 0).toFixed(2)
}
function exactKey(r) {
  return [
    isoDate(r.data), normalizeText(r.empresa), canonicalBank(r.banco),
    amount(r.entradas), amount(r.saidas), normalizeText(r.fornecedor),
    normalizeText(r.historico), normalizeText(r.natureza),
  ].join('|')
}
function safeKey(r) {
  // Chave deliberadamente conservadora para reconhecer um movimento já existente
  // mesmo quando fornecedor, natureza ou caixa do nome do banco foram gravados de
  // forma diferente. Data + empresa + banco + valores + histórico identificam com
  // segurança as 20 linhas de 29 e 30/06 desta carga.
  return [
    isoDate(r.data), normalizeText(r.empresa), canonicalBank(r.banco),
    amount(r.entradas), amount(r.saidas), normalizeText(r.historico),
  ].join('|')
}
function hash(r) { return crypto.createHash('sha256').update(exactKey(r)).digest('hex') }
function money(v) { return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:4}) }
function arg(name) { const p=`--${name}=`; const a=process.argv.find(x=>x.startsWith(p)); return a?.slice(p.length) }
function groupByDate(rows) {
  return rows.reduce((acc, row) => {
    const date = isoDate(row.data)
    acc[date] = (acc[date] || 0) + 1
    return acc
  }, {})
}
function countKeys(rows, keyFn) {
  const counts = new Map()
  for (const row of rows) {
    const k = keyFn(row)
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return counts
}
function findMissing(sourceRows, currentRows) {
  const exactCounts = countKeys(currentRows, exactKey)
  const safeCounts = countKeys(currentRows, safeKey)
  const missing = []
  const matched = []

  for (const row of sourceRows) {
    const ek = exactKey(row)
    const sk = safeKey(row)
    if ((exactCounts.get(ek) || 0) > 0) {
      exactCounts.set(ek, exactCounts.get(ek) - 1)
      safeCounts.set(sk, Math.max(0, (safeCounts.get(sk) || 0) - 1))
      matched.push({ row, method: 'exato' })
      continue
    }
    if ((safeCounts.get(sk) || 0) > 0) {
      safeCounts.set(sk, safeCounts.get(sk) - 1)
      matched.push({ row, method: 'seguro' })
      continue
    }
    missing.push(row)
  }
  return { missing, matched }
}

async function main() {
  await connectDB()
  const execute = process.argv.includes('--execute')
  const client = await pool.connect()
  try {
    const { rows: current } = await client.query(`SELECT * FROM fin_movimento WHERE data BETWEEN DATE '2026-06-26' AND DATE '2026-06-30' ORDER BY data,id`)
    const normalizedCurrent = current.map(r => ({
      data: isoDate(r.data), empresa:r.empresa, banco:r.banco,
      entradas:r.entradas, saidas:r.saidas, fornecedor:r.fornecedor,
      historico:r.historico, natureza:r.natureza_financeira,
    }))
    const referenceRows = ROWS.filter(r => r.data === '2026-06-26')
    const eligibleRows = ROWS.filter(r => r.data === '2026-06-29' || r.data === '2026-06-30')
    const referenceMatch = findMissing(referenceRows, normalizedCurrent)
    const eligibleMatch = findMissing(eligibleRows, normalizedCurrent)
    const missing = eligibleMatch.missing
    const existing = eligibleMatch.matched.length
    const entries = missing.reduce((sum,row)=>sum+Number(row.entradas||0),0)
    const outflows = missing.reduce((sum,row)=>sum+Number(row.saidas||0),0)

    const sourceByDate = groupByDate(ROWS)
    const existingByDate = groupByDate(eligibleMatch.matched.map(item => item.row))
    existingByDate['2026-06-26'] = referenceMatch.matched.length
    const missingByDate = groupByDate(missing)

    console.log('\nMOVIMENTO BANCÁRIO — CARGA SEGURA DE 29 E 30/06/2026')
    console.log(`Linhas de 26/06 usadas somente como conferência: ${referenceRows.length}`)
    console.log(`Reconhecidas em 26/06: ${referenceMatch.matched.length}`)
    if (referenceMatch.missing.length) {
      console.log(`AVISO: ${referenceMatch.missing.length} linha(s) de 26/06 não foram reconhecidas, mas NÃO serão inseridas por este seed.`)
    }
    console.log(`Registros elegíveis na fonte (29 e 30/06): ${eligibleRows.length}`)
    console.log(`Já existentes em 29 e 30/06: ${existing}`)
    console.log(`Faltantes para inserir: ${missing.length}`)
    console.log(`Entradas faltantes: ${money(entries)}`)
    console.log(`Saídas faltantes: ${money(outflows)}`)
    console.table(['2026-06-26','2026-06-27','2026-06-28','2026-06-29','2026-06-30'].map(data => ({
      data,
      planilha: sourceByDate[data] || 0,
      ja_existentes: existingByDate[data] || 0,
      faltantes: missingByDate[data] || 0,
    })))
    console.table(missing.map(r=>({data:r.data,empresa:r.empresa,banco:r.banco,entradas:money(r.entradas),saidas:money(r.saidas),historico:r.historico})))

    if (!execute) {
      console.log(`\nModo prévia: nada foi alterado. Para executar: --execute --confirmar=${missing.length}`)
      return
    }
    const confirmation = Number(arg('confirmar'))
    if (confirmation !== missing.length) throw new Error(`Confirmação inválida. Use --confirmar=${missing.length}.`)
    if (!missing.length) throw new Error('Nenhum registro faltante. A rotina não será executada novamente.')
    if (missing.length === EXPECTED.count && (Math.abs(entries-EXPECTED.entries)>0.01 || Math.abs(outflows-EXPECTED.outflows)>0.01)) {
      throw new Error('Totais divergentes das 20 linhas validadas de 29 e 30/06. Execução interrompida.')
    }
    if (missing.length > EXPECTED.count) {
      throw new Error(`Foram identificadas ${missing.length} linhas faltantes, acima do máximo seguro de ${EXPECTED.count}. Execução interrompida.`)
    }

    await client.query('BEGIN')
    await client.query('LOCK TABLE fin_movimento IN SHARE ROW EXCLUSIVE MODE')

    const { rows: lockedCurrent } = await client.query(`SELECT * FROM fin_movimento WHERE data BETWEEN DATE '2026-06-26' AND DATE '2026-06-30' ORDER BY data,id`)
    const lockedNormalized = lockedCurrent.map(r => ({
      data: isoDate(r.data), empresa:r.empresa, banco:r.banco,
      entradas:r.entradas, saidas:r.saidas, fornecedor:r.fornecedor,
      historico:r.historico, natureza:r.natureza_financeira,
    }))
    const lockedMissing = findMissing(eligibleRows, lockedNormalized).missing
    if (lockedMissing.length !== missing.length || lockedMissing.some((r,i) => safeKey(r) !== safeKey(missing[i]))) {
      throw new Error('Os movimentos de 29 e 30/06 mudaram entre a prévia e o bloqueio. Execute a prévia novamente.')
    }
    const { rows:[lotCheck] } = await client.query('SELECT COUNT(*)::int count FROM fin_movimento WHERE lote_importacao=$1',[LOT])
    if (Number(lotCheck.count) !== 0) throw new Error(`O lote ${LOT} já possui registros. Execução interrompida para evitar duplicidade.`)

    const backupDir = path.join(__dirname,'backups'); fs.mkdirSync(backupDir,{recursive:true})
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)
    const backupPath = path.join(backupDir,`movimento-29-30-antes-0385-${stamp}.json.gz`)
    fs.writeFileSync(backupPath,zlib.gzipSync(JSON.stringify({generated_at:new Date().toISOString(),current:lockedCurrent},null,2)))

    for (const r of lockedMissing) {
      const d = new Date(`${r.data}T12:00:00Z`)
      await client.query(`INSERT INTO fin_movimento(
        data,empresa,banco,entradas,saidas,fornecedor,historico,nf_doc,conta_contabil,centro_custo,obra,natureza_financeira,n_cheque,
        dia,mes,ano,saldo,tipo_lancamento,lote_importacao,arquivo_origem,linha_origem,hash_importacao,importado_em
      ) VALUES ($1,$2,$3,NULLIF($4::numeric,0::numeric),NULLIF($5::numeric,0::numeric),NULLIF($6::text,''),$7,NULLIF($8::text,''),$9,NULLIF($10::text,''),NULLIF($11::text,''),$12,NULLIF($13::text,''),$14,$15,$16,$17::numeric,'financeiro',$18,$19,$20,$21,NOW())`,[
        r.data,r.empresa,r.banco,r.entradas,r.saidas,r.fornecedor,r.historico,r.nfDoc,r.conta,r.centro,r.obra,r.natureza,r.nCheque,
        d.getUTCDate(),d.getUTCMonth()+1,d.getUTCFullYear(),Number(r.entradas||0)-Number(r.saidas||0),LOT,SOURCE,r.line,hash(r)
      ])
    }
    const { rows:[check] } = await client.query(`
      SELECT COUNT(*)::int count,
             COUNT(*) FILTER (WHERE data::date=DATE '2026-06-26')::int dia_26,
             COUNT(*) FILTER (WHERE data::date=DATE '2026-06-29')::int dia_29,
             COUNT(*) FILTER (WHERE data::date=DATE '2026-06-30')::int dia_30,
             COALESCE(SUM(entradas),0)::numeric entries,
             COALESCE(SUM(saidas),0)::numeric outflows
        FROM fin_movimento
       WHERE lote_importacao=$1`,[LOT])
    if (Number(check.count)!==lockedMissing.length) throw new Error('Validação final de quantidade falhou.')
    if (Number(check.dia_26)!==0 || Number(check.dia_29)+Number(check.dia_30)!==lockedMissing.length) throw new Error('Validação final das datas 29 e 30/06 falhou.')
    await client.query('COMMIT')
    console.log(`\nConcluído: ${check.count} registros inseridos.`)
    console.log(`Dia 29/06: ${check.dia_29} | Dia 30/06: ${check.dia_30}`)
    console.log(`Entradas: ${money(check.entries)} | Saídas: ${money(check.outflows)}`)
    console.log(`Backup: ${backupPath}`)
    console.log(`Lote: ${LOT} | versão ${RELEASE}`)
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    throw e
  } finally { client.release(); await pool.end() }
}
main().catch(e=>{console.error(`\nERRO: ${e.message}`);process.exit(1)})
