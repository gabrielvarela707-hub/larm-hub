#!/usr/bin/env python3
"""Substituição controlada do movimento realizado e orçado de 2026."""
import argparse, hashlib, importlib.util, json, math, os, re, sys, unicodedata
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
load_dotenv()

ALIASES = {
 'Data':['Data','DATA'], 'Empresa':['Empresa','EMPRESA'], 'Banco':['Banco','BANCO'],
 'Entradas':['Entradas','Entrada','ENTRADAS'], 'Saídas':['Saídas','Saidas','Saída','Saida','SAÍDAS','SAIDAS'],
 'Fornecedor':['Fornecedor','FORNECEDOR'], 'Histórico':['Histórico','Historico','HISTÓRICO','HISTORICO'],
 'NF/DOC':['NF/DOC','NF DOC','NF_DOC','Documento','DOCUMENTO'],
 'Emissão DOC':['Emissão DOC','Emissao DOC','Emissão','Emissao','Data Emissão','Data Emissao'],
 'Conta Contábil':['Conta Contábil','Conta Contabil','CONTA CONTÁBIL','CONTA CONTABIL'],
 'Centro de Custo':['Centro de Custo','CENTRO DE CUSTO'], 'Obra':['Obra','OBRA'],
 'Natureza Financeira':['Natureza Financeira','NATUREZA FINANCEIRA','Natureza'],
 'N. Cheque':['N. Cheque','N Cheque','Cheque','Nº Cheque'], 'Saldo':['Saldo','SALDO']
}
REQUIRED = ['Data','Empresa','Entradas','Saídas','Histórico','Conta Contábil','Natureza Financeira']
DESC_OVERRIDE = {'CONTRIBUICAO SINDICAL':'4.1.8'}

def conn():
 return psycopg2.connect(host=os.getenv('DB_HOST','localhost'),port=os.getenv('DB_PORT','5432'),dbname=os.getenv('DB_NAME','larmhub_prod'),user=os.getenv('DB_USER','larmhub'),password=os.getenv('DB_PASSWORD'))

def s(v):
 if v is None: return None
 try:
  if pd.isna(v): return None
 except: pass
 if isinstance(v,float) and v.is_integer(): v=int(v)
 t=str(v).strip()
 return None if t in ('','nan','None','#N/D','#N/A') else t

def n(v):
 if v is None: return 0.0
 try:
  if pd.isna(v): return 0.0
 except: pass
 if isinstance(v,str):
  t=v.strip()
  if t in ('','nan','None','#N/D','#N/A'): return 0.0
  if ',' in t: t=t.replace('.','').replace(',','.')
  try: x=float(t)
  except: return 0.0
 else:
  try: x=float(v)
  except: return 0.0
 return 0.0 if math.isnan(x) else x

def d(v):
 if v is None: return None
 try:
  if pd.isna(v): return None
 except: pass
 if isinstance(v,date) and not isinstance(v,datetime): return v
 if isinstance(v,datetime): return v.date()
 if isinstance(v,(int,float)) and v>20000:
  try: return pd.to_datetime(v,unit='D',origin='1899-12-30').date()
  except: pass
 try: return pd.to_datetime(v,dayfirst=True).date()
 except: return None

def txt(v):
 t=s(v) or ''
 t=''.join(c for c in unicodedata.normalize('NFD',t.upper()) if unicodedata.category(c)!='Mn')
 return re.sub(r'\s+',' ',re.sub(r'[^A-Z0-9]+',' ',t)).strip()

def code(v):
 t=s(v)
 if not t or t in ('0','#N/A','#N/D'): return None
 return re.sub(r'\s+','',t.replace(',','.'))

def parent(c):
 p=(c[:-1] if c.endswith('.') else c).split('.')
 if len(p)<=1:return None
 return p[0]+'.' if len(p)==2 else '.'.join(p[:-1])

def norm_headers(df):
 df=df.copy(); df.columns=[str(x).strip() for x in df.columns]
 existing={str(x).strip().lower():x for x in df.columns}; ren={}
 for canon,opts in ALIASES.items():
  for opt in opts:
   if opt.lower() in existing: ren[existing[opt.lower()]]=canon; break
 return df.rename(columns=ren)

def read_plan(path):
 df=pd.read_excel(path,sheet_name='Estrutura',dtype=object)
 out={}
 for i,r in df.iterrows():
  c=code(r.iloc[1] if len(r)>1 else None); desc=s(r.iloc[2] if len(r)>2 else None); tp=(s(r.iloc[3] if len(r)>3 else None) or '').upper()
  if not c: continue
  if '.' not in c: c=c+'.'
  if not desc: desc=f'Conta {c}'
  level=len((c[:-1] if c.endswith('.') else c).split('.'))
  if tp not in ('T','S','A'): tp='T' if level==1 else ('S' if level==2 else 'A')
  out[c]={'codigo':c,'descricao':desc,'tipo':tp,'pai':parent(c)}
 missing=sorted({a['pai'] for a in out.values() if a['pai'] and a['pai'] not in out})
 for c in missing:
  p=parent(c); desc='Distribuição de Lucros' if c=='9.1' else f'Grupo {c}'
  out[c]={'codigo':c,'descricao':desc,'tipo':'S','pai':p}
 for a in out.values():
  if a['pai'] and a['pai'] not in out: raise RuntimeError(f"Pai inexistente no plano: {a['codigo']} -> {a['pai']}")
 return list(out.values())

def row_hash(r):
 p={k:(v.isoformat() if isinstance(v,date) else round(v,4) if isinstance(v,float) else v) for k,v in r.items() if k not in ('linha','hash')}
 return hashlib.sha256(json.dumps(p,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()

def read_moves(path,year,plan,cutoff=None):
 by_code={x['codigo']:x for x in plan}; by_desc=defaultdict(list)
 for x in plan: by_desc[txt(x['descricao'])].append(x['codigo'])
 df=norm_headers(pd.read_excel(path,sheet_name='Movimento',dtype={'NF/DOC':str,'N. Cheque':str,'Natureza Financeira':str})).dropna(how='all')
 miss=[x for x in REQUIRED if x not in df.columns]
 if miss: raise RuntimeError(f"{Path(path).name}: colunas ausentes: {', '.join(miss)}")
 out=[]; corrected=[]; after=0; errors=[]
 for i,r in df.iterrows():
  dt=d(r.get('Data')); ent=n(r.get('Entradas')); sai=n(r.get('Saídas')); hist=s(r.get('Histórico'))
  if dt is None and ent==0 and sai==0 and not hist: continue
  if dt is None or dt.year!=year: continue
  if cutoff and dt>cutoff: after+=1; continue
  cc=s(r.get('Conta Contábil')); nat=code(r.get('Natureza Financeira'))
  if nat not in by_code:
   opts=by_desc.get(txt(cc),[]); chosen=DESC_OVERRIDE.get(txt(cc))
   if chosen in by_code: pass
   elif len(opts)==1: chosen=opts[0]
   else: chosen=None
   if not chosen: errors.append((i+2,nat,cc,opts)); continue
   corrected.append((i+2,nat,chosen,cc)); nat=chosen
  rec={'linha':i+2,'data':dt,'empresa':(s(r.get('Empresa')) or 'SEM_EMPRESA').upper(),'banco':s(r.get('Banco')),
       'entradas':ent,'saidas':sai,'fornecedor':s(r.get('Fornecedor')),'historico':hist,'nf_doc':s(r.get('NF/DOC')),
       'emissao_doc':d(r.get('Emissão DOC')),'conta_contabil':cc,'centro_custo':s(r.get('Centro de Custo')),
       'obra':s(r.get('Obra')),'natureza':nat,'n_cheque':s(r.get('N. Cheque')),'dia':dt.day,'mes':dt.month,
       'ano':year,'saldo':n(r.get('Saldo')),'tipo':'financeiro'}
  rec['hash']=row_hash(rec); out.append(rec)
 if errors:
  sample='\n'.join(f'linha {a}: natureza={b!r}, conta={c!r}, candidatos={e}' for a,b,c,e in errors[:20])
  raise RuntimeError(f'{Path(path).name}: {len(errors)} linhas sem conta válida:\n{sample}')
 return out,corrected,after

def totals(rows):
 return len(rows),sum(Decimal(str(x['entradas'])) for x in rows),sum(Decimal(str(x['saidas'])) for x in rows)

def exists(cur,name):
 cur.execute('SELECT to_regclass(%s)',(name,)); return cur.fetchone()[0] is not None

def protected(cur,alias):
 q=[]
 if exists(cur,'fin_parcelas_cp'): q.append(f'EXISTS (SELECT 1 FROM fin_parcelas_cp p WHERE p.movimento_id={alias}.id)')
 if exists(cur,'fin_bancos_lancamentos'): q.append(f'EXISTS (SELECT 1 FROM fin_bancos_lancamentos b WHERE b.movimento_id={alias}.id)')
 return '('+' OR '.join(q)+')' if q else 'FALSE'

def backup(cur,lote,tabela,where='TRUE',params=()):
 cur.execute(f"INSERT INTO fin_importacao_backup(lote_id,tabela_origem,registro_id,dados) SELECT %s,%s,id,to_jsonb(x) FROM {tabela} x WHERE {where}",(lote,tabela,*params))
 return cur.rowcount

def update_plan(cur,plan):
 execute_values(cur,"INSERT INTO fin_plano_contas(codigo,descricao,tipo,ativo) VALUES %s ON CONFLICT(codigo) DO UPDATE SET descricao=EXCLUDED.descricao,tipo=EXCLUDED.tipo,ativo=TRUE",[(x['codigo'],x['descricao'],x['tipo'],True) for x in plan])
 for x in plan:
  if x['pai']:
   cur.execute("UPDATE fin_plano_contas a SET pai_id=p.id FROM fin_plano_contas p WHERE a.codigo=%s AND p.codigo=%s",(x['codigo'],x['pai']))
  else: cur.execute('UPDATE fin_plano_contas SET pai_id=NULL WHERE codigo=%s',(x['codigo'],))
 cur.execute('UPDATE fin_plano_contas SET ativo=FALSE WHERE NOT(codigo=ANY(%s))',([x['codigo'] for x in plan],))

def load_orc_module():
 p=Path(__file__).parent/'import_orcamento_2026.py'
 spec=importlib.util.spec_from_file_location('orc',p); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
class NoCommit:
 def commit(self): pass

def insert_real(cur,rows,lote,arquivo):
 vals=[]; now=datetime.utcnow()
 for x in rows:
  vals.append((x['data'],x['empresa'],x['banco'],x['entradas'] or None,x['saidas'] or None,x['fornecedor'],x['historico'],x['nf_doc'],x['emissao_doc'],x['conta_contabil'],x['centro_custo'],x['obra'],x['natureza'],x['n_cheque'],x['dia'],x['mes'],x['ano'],x['saldo'],x['tipo'],lote,arquivo,x['linha'],x['hash'],now))
 execute_values(cur,"""INSERT INTO fin_movimento(data,empresa,banco,entradas,saidas,fornecedor,historico,nf_doc,emissao_doc,conta_contabil,centro_custo,obra,natureza_financeira,n_cheque,dia,mes,ano,saldo,tipo_lancamento,lote_importacao,arquivo_origem,linha_origem,hash_importacao,importado_em) VALUES %s""",vals,page_size=500)

def insert_budget(cur,rows,lote,arquivo):
 vals=[]; base=defaultdict(float); total=defaultdict(float); now=datetime.utcnow()
 for x in rows:
  vals.append((x['data'],x['empresa'],x['banco'],x['entradas'] or None,x['saidas'] or None,x['fornecedor'],x['historico'],x['nf_doc'],x['emissao_doc'],x['conta_contabil'],x['centro_custo'],x['obra'],x['natureza'],x['n_cheque'],x['dia'],x['mes'],x['ano'],x['saldo'],'orcado','movimento_orcado',lote,arquivo,x['linha'],x['hash'],now))
  net=x['entradas']-x['saidas']
  for emp in (x['empresa'],'CONSOLIDADO'):
   base[(emp,x['mes'],x['natureza'])]+=net; total[(emp,x['mes'])]+=net
 execute_values(cur,"""INSERT INTO fin_orcamento_movimento(data,empresa,banco,entradas,saidas,fornecedor,historico,nf_doc,emissao_doc,conta_contabil,centro_custo,obra,natureza_financeira,n_cheque,dia,mes,ano,saldo,tipo_lancamento,origem,lote_importacao,arquivo_origem,linha_origem,hash_importacao,importado_em) VALUES %s""",vals,page_size=500)
 return base,total

def print_stats(label,rows,corrected,after=0):
 q,e,sai=totals(rows); print(f'\n{label}: {q} registros | entradas R$ {e:,.2f} | saídas R$ {sai:,.2f}')
 print(f'  fallbacks de conta: {len(corrected)}')
 if after: print(f'  linhas após a data limite ignoradas: {after}')

def run(a):
 real=str(Path(a.real).resolve()); orcado=str(Path(a.orcado).resolve()); cutoff=d(a.ate)
 plan=read_plan(real); plan_orc=read_plan(orcado)
 only_orc=sorted({x['codigo'] for x in plan_orc}-{x['codigo'] for x in plan})
 if only_orc: raise RuntimeError(f'Códigos somente no orçado: {only_orc}')
 rows_r,corr_r,after=read_moves(real,a.ano,plan,cutoff); rows_o,corr_o,_=read_moves(orcado,a.ano,plan,None)
 print('='*70); print('SUBSTITUIÇÃO CONTROLADA DOS MOVIMENTOS 2026'); print('='*70)
 print(f'Plano de contas: {len(plan)} códigos, atualizado pela chave COD')
 print_stats('REALIZADO',rows_r,corr_r,after); print_stats('ORÇADO',rows_o,corr_o)
 c=conn(); cur=c.cursor()
 try:
  guard=protected(cur,'m')
  cur.execute(f"SELECT COUNT(*) FILTER(WHERE NOT {guard}),COUNT(*) FILTER(WHERE {guard}) FROM fin_movimento m WHERE COALESCE(ano,EXTRACT(YEAR FROM data)::int)=%s",(a.ano,)); old_r=cur.fetchone()
  cur.execute('SELECT COUNT(*) FROM fin_orcamento_movimento WHERE ano=%s',(a.ano,)); old_o=cur.fetchone()[0]
  print(f'\nBanco atual: {old_r[0]} realizados removíveis, {old_r[1]} protegidos, {old_o} orçados.')
  if a.preview: print('\n✅ Prévia concluída. Nenhum dado alterado.'); return
  lote=f'MOV-{a.ano}-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}'
  tr=totals(rows_r); to=totals(rows_o); cur.execute('BEGIN')
  cur.execute("""INSERT INTO fin_importacao_lotes(lote_id,ano,status,arquivo_realizado,arquivo_orcado,data_limite_realizado,qtd_realizado,qtd_orcado,qtd_plano_contas,total_entradas_realizado,total_saidas_realizado,total_entradas_orcado,total_saidas_orcado) VALUES(%s,%s,'em_execucao',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",(lote,a.ano,Path(real).name,Path(orcado).name,cutoff,tr[0],to[0],len(plan),tr[1],tr[2],to[1],to[2]))
  backup(cur,lote,'fin_plano_contas')
  guard_b=protected(cur,'x'); where=f'COALESCE(x.ano,EXTRACT(YEAR FROM x.data)::int)=%s AND NOT {guard_b}'
  backed=backup(cur,lote,'fin_movimento',where,(a.ano,))
  backup(cur,lote,'fin_orcamento_movimento','x.ano=%s',(a.ano,)); backup(cur,lote,'fin_orcamento_valores','x.ano=%s',(a.ano,))
  update_plan(cur,plan)
  guard_d=protected(cur,'m'); cur.execute(f'DELETE FROM fin_movimento m WHERE COALESCE(ano,EXTRACT(YEAR FROM data)::int)=%s AND NOT {guard_d}',(a.ano,))
  if cur.rowcount!=backed: raise RuntimeError(f'Backup divergente: {backed} x {cur.rowcount}')
  orc=load_orc_module(); orc.ensure_schema(cur); row_map=orc.ensure_linhas(cur,NoCommit())
  cur.execute('DELETE FROM fin_orcamento_valores WHERE ano=%s',(a.ano,)); cur.execute('DELETE FROM fin_orcamento_movimento WHERE ano=%s',(a.ano,))
  insert_real(cur,rows_r,lote,Path(real).name); base,total=insert_budget(cur,rows_o,lote,Path(orcado).name)
  saldos=orc.get_saldos_iniciais_bancos(cur,a.ano); previstos=orc.build_previstos(base,total,saldos,row_map,a.ano); orc.import_previstos_agregados(cur,NoCommit(),previstos)
  cur.execute('SELECT COUNT(*),COALESCE(SUM(entradas),0),COALESCE(SUM(saidas),0) FROM fin_movimento WHERE lote_importacao=%s',(lote,)); chk_r=cur.fetchone()
  cur.execute('SELECT COUNT(*),COALESCE(SUM(entradas),0),COALESCE(SUM(saidas),0) FROM fin_orcamento_movimento WHERE lote_importacao=%s',(lote,)); chk_o=cur.fetchone()
  if int(chk_r[0])!=tr[0] or int(chk_o[0])!=to[0]: raise RuntimeError('Quantidade importada divergente')
  tol=Decimal('0.01')
  if abs(Decimal(str(chk_r[1]))-tr[1])>tol or abs(Decimal(str(chk_r[2]))-tr[2])>tol: raise RuntimeError('Totais realizados divergentes')
  if abs(Decimal(str(chk_o[1]))-to[1])>tol or abs(Decimal(str(chk_o[2]))-to[2])>tol: raise RuntimeError('Totais orçados divergentes')
  cur.execute("UPDATE fin_importacao_lotes SET status='concluido',qtd_preservados=%s,observacoes=%s,finalizado_em=NOW() WHERE lote_id=%s",(old_r[1],f'Realizados removidos: {backed}; valores orçados recalculados: {len(previstos)}',lote))
  c.commit(); print(f'\n✅ Concluído. Lote {lote}; {tr[0]} realizados; {to[0]} orçados; {old_r[1]} protegidos preservados.')
 except:
  c.rollback(); raise
 finally:
  cur.close(); c.close()

if __name__=='__main__':
 p=argparse.ArgumentParser()
 p.add_argument('real'); p.add_argument('orcado'); p.add_argument('--ano',type=int,default=2026); p.add_argument('--ate',default='2026-06-28')
 g=p.add_mutually_exclusive_group(required=True); g.add_argument('--preview',action='store_true'); g.add_argument('--execute',action='store_true')
 try: run(p.parse_args())
 except Exception as e:
  print(f'\n❌ Substituição cancelada: {e}',file=sys.stderr); sys.exit(1)
