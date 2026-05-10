#!/usr/bin/env python3
"""
scripts/import_financeiro.py
Importa CashFlow_Consolidado e Movimento_Bancário para o PostgreSQL.

Uso:
  python3 scripts/import_financeiro.py cashflow  /caminho/CashFlow.xlsx
  python3 scripts/import_financeiro.py movimento /caminho/Movimento.xlsx
  python3 scripts/import_financeiro.py ambos     /caminho/CashFlow.xlsx /caminho/Movimento.xlsx

Flags:
  --limpar       Apaga dados antes de importar (recarga completa)
  --ano=2026     Importa apenas o ano especificado (somente movimento)
"""
import sys, os
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from datetime import datetime, date

load_dotenv()

def get_conn():
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        dbname=os.getenv('DB_NAME', 'lotemobile_prod'),
        user=os.getenv('DB_USER', 'lotemobile'),
        password=os.getenv('DB_PASSWORD'),
    )

# ── Classificação financeiro vs administrativo ────────────────────────────────
def classificar_tipo(natureza):
    if natureza is None: return 'administrativo'
    s = str(natureza).strip().lower()
    if s in ('', 'nan', 'none', '#n/a', '0'): return 'administrativo'
    return 'financeiro'

# ── Helpers ───────────────────────────────────────────────────────────────────
def safe_str(v):
    if v is None: return None
    try:
        if pd.isna(v): return None
    except (TypeError, ValueError):
        pass
    s = str(v).strip()
    return None if s in ('', 'nan', 'None') else s

def safe_num(v):
    if v is None: return None
    try:
        f = float(v)
        import math
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None

def safe_date(v):
    if v is None: return None
    try:
        if pd.isna(v): return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, date) and not isinstance(v, datetime): return v
    if isinstance(v, datetime): return v.date()
    try: return pd.to_datetime(v).date()
    except Exception: return None

# ── CASHFLOW ──────────────────────────────────────────────────────────────────
TIPO_POR_DESC = {
    '(A) Saldo Inicial':                 ('header',   1),
    'Receitas Brutas':                   ('total',    1),
    'Deduções das Receitas':             ('subtotal', 2),
    'Receita Líquida':                   ('total',    1),
    'Despesas Gerais e Administrativas': ('total',    1),
    'Resultado Financeiro':              ('total',    1),
    'Receitas Financeiras':              ('subtotal', 2),
    'Despesas Financeiras':              ('subtotal', 2),
    'Emprestimos e Financiamentos':      ('subtotal', 2),
    'Geração de Caixa':                  ('total',    1),
    'Investimentos':                     ('total',    1),
    'Distribuição de Lucros':            ('total',    1),
    'Sucessão':                          ('total',    1),
    'SALDO FINAL':                       ('header',   1),
    'Saldos Bancários em C/C':           ('subtotal', 2),
    'Aplicações Financeiras':            ('subtotal', 2),
    'Curto Prazo':                       ('subtotal', 3),
    'Longo Prazo':                       ('subtotal', 3),
}

def get_nivel_tipo(codigo, descricao):
    if descricao in TIPO_POR_DESC:
        return TIPO_POR_DESC[descricao]
    if pd.isna(codigo) or str(codigo).strip() == '':
        return ('item', 2)
    code_str = str(codigo).strip()
    if code_str.endswith('.') and len(code_str) <= 3:
        return ('total', 1)
    parts = code_str.replace('(','').replace(')','').split('.')
    nivel = len([p for p in parts if p.strip()]) + 1
    return ('item', min(nivel, 3))

EMPRESAS_CF = ['Consolidado','LARM','LUCKY','LM','HOLDING','RM']

def import_cashflow(xlsx_path, limpar=False):
    print(f"\n{'='*60}\nImportando CashFlow: {xlsx_path}\n{'='*60}")
    conn = get_conn(); cur = conn.cursor()

    if limpar:
        cur.execute("DELETE FROM fin_cashflow_valores")
        cur.execute("DELETE FROM fin_cashflow_linhas")
        conn.commit()
        print("Dados anteriores removidos.")

    xls = pd.ExcelFile(xlsx_path)
    linhas_inseridas = False

    for sheet_nome in EMPRESAS_CF:
        if sheet_nome not in xls.sheet_names:
            print(f"  '{sheet_nome}' não encontrada — pulando."); continue

        empresa = sheet_nome.upper()
        print(f"\nProcessando: {empresa}")
        df = pd.read_excel(xlsx_path, sheet_name=sheet_nome, header=None)

        date_cols = {}
        for col in range(4, df.shape[1]):
            val = df.iloc[2, col]
            if pd.notna(val) and isinstance(val, datetime):
                date_cols[col] = val.date()
        print(f"  Colunas de data: {len(date_cols)}")

        if not linhas_inseridas:
            linhas = []
            for row_i in range(4, df.shape[0]):
                codigo    = df.iloc[row_i, 1]
                descricao = df.iloc[row_i, 2]
                if pd.isna(descricao) or str(descricao).strip() == '': continue
                desc_str = str(descricao).strip()
                cod_str  = None if pd.isna(codigo) or str(codigo).strip()=='' else str(codigo).strip()
                tipo, nivel = get_nivel_tipo(codigo, desc_str)
                linhas.append((row_i, cod_str, desc_str, nivel, tipo))

            execute_values(cur,
                """INSERT INTO fin_cashflow_linhas (row_idx, codigo, descricao, nivel, tipo)
                   VALUES %s ON CONFLICT (row_idx) DO UPDATE
                   SET codigo=EXCLUDED.codigo, descricao=EXCLUDED.descricao,
                       nivel=EXCLUDED.nivel, tipo=EXCLUDED.tipo""",
                linhas)
            conn.commit()
            print(f"  Linhas: {len(linhas)}")
            linhas_inseridas = True

        cur.execute("SELECT row_idx, id FROM fin_cashflow_linhas")
        row_id_map = {r: lid for r, lid in cur.fetchall()}

        vals = {}
        for col_i, dt in date_cols.items():
            ano, mes = dt.year, dt.month
            for row_i, linha_id in row_id_map.items():
                try: val = df.iloc[row_i, col_i]
                except IndexError: continue
                if pd.isna(val) or val == 0: continue
                key = (linha_id, ano, mes)
                vals[key] = vals.get(key, 0) + float(val)

        rows_val = [(lid, empresa, ano, mes, round(v, 4))
                    for (lid, ano, mes), v in vals.items() if abs(v) > 0.001]

        if rows_val:
            execute_values(cur,
                """INSERT INTO fin_cashflow_valores (linha_id, empresa, ano, mes, valor)
                   VALUES %s ON CONFLICT (linha_id, empresa, ano, mes)
                   DO UPDATE SET valor=EXCLUDED.valor""",
                rows_val)
            conn.commit()
            print(f"  Valores: {len(rows_val)}")

    cur.close(); conn.close()
    print("\n✅  CashFlow importado!")

# ── MOVIMENTO ─────────────────────────────────────────────────────────────────
SHEETS_HIST = ['2021','2022','2023','2024','2025']

def _import_df(cur, conn, df, label):
    if df is None or len(df) == 0:
        print(f"  '{label}' vazia — pulando."); return 0

    # Remove anos que já existem no banco para evitar duplicatas
    anos = set()
    if 'ano' in df.columns:
        anos = set(int(a) for a in df['ano'].dropna().unique())
    elif 'Data' in df.columns:
        anos = set(pd.to_datetime(df['Data'], errors='coerce').dropna().dt.year.unique())
    for a in anos:
        cur.execute("DELETE FROM fin_movimento WHERE ano=%s", (a,))
    conn.commit()

    rows = []
    for _, r in df.iterrows():
        nat  = safe_str(r.get('Natureza Financeira'))
        tipo = classificar_tipo(nat)
        rows.append((
            safe_date(r.get('Data')),
            safe_str(r.get('Empresa')),
            safe_str(r.get('Banco')),
            safe_num(r.get('Entradas')),
            safe_num(r.get('Saídas')),
            safe_str(r.get('Fornecedor')),
            safe_str(r.get('Histórico')),
            safe_str(r.get('NF/DOC')),
            safe_str(r.get('Conta Contábil')),
            safe_str(r.get('Centro de Custo')),
            safe_str(r.get('Obra')),
            nat,
            safe_str(r.get('N. Cheque')),
            safe_num(r.get('dia')),
            safe_num(r.get('mês')),
            safe_num(r.get('ano')),
            safe_num(r.get('Saldo')),
            tipo,
        ))

    if rows:
        execute_values(cur,
            """INSERT INTO fin_movimento
               (data, empresa, banco, entradas, saidas, fornecedor, historico,
                nf_doc, conta_contabil, centro_custo, obra, natureza_financeira,
                n_cheque, dia, mes, ano, saldo, tipo_lancamento)
               VALUES %s""",
            rows, page_size=500)
        conn.commit()
    return len(rows)

def import_movimento(xlsx_path, limpar=False, apenas_ano=None):
    print(f"\n{'='*60}\nImportando Movimento: {xlsx_path}\n{'='*60}")
    conn = get_conn(); cur = conn.cursor()

    if limpar:
        if apenas_ano:
            cur.execute("DELETE FROM fin_movimento WHERE ano=%s", (apenas_ano,))
            print(f"Dados do ano {apenas_ano} removidos.")
        else:
            cur.execute("DELETE FROM fin_movimento")
            print("Todos os dados de movimento removidos.")
        conn.commit()

    xls    = pd.ExcelFile(xlsx_path)
    sheets = xls.sheet_names
    total  = 0
    dtype  = {'NF/DOC': str, 'N. Cheque': str, 'Natureza Financeira': str}

    # Sheet principal (ano atual / orçado)
    if 'Movimento' in sheets:
        print(f"\nSheet: Movimento (principal)")
        df = pd.read_excel(xlsx_path, sheet_name='Movimento', dtype=dtype)
        if apenas_ano and 'ano' in df.columns:
            df = df[df['ano'] == apenas_ano]
        n = _import_df(cur, conn, df, 'Movimento')
        print(f"  ✅ {n} registros"); total += n

    # Sheets históricas
    for sheet in SHEETS_HIST:
        if sheet not in sheets: continue
        if apenas_ano and str(apenas_ano) != sheet: continue
        print(f"\nSheet: {sheet} (histórico)")
        df = pd.read_excel(xlsx_path, sheet_name=sheet, dtype=dtype)
        n  = _import_df(cur, conn, df, sheet)
        print(f"  ✅ {n} registros"); total += n

    # Pagamentos fora do orçado (sem filtro de ano)
    if 'Pgtos fora orçado' in sheets and not apenas_ano:
        print(f"\nSheet: Pgtos fora orçado")
        try:
            df = pd.read_excel(xlsx_path, sheet_name='Pgtos fora orçado', dtype=dtype, header=1)
            df = df.dropna(how='all')
            if len(df) > 0 and 'Data' in df.columns:
                n  = _import_df(cur, conn, df, 'Pgtos fora orçado')
                print(f"  ✅ {n} registros"); total += n
        except Exception as e:
            print(f"  ⚠  Erro ao ler 'Pgtos fora orçado': {e}")

    cur.close(); conn.close()
    print(f"\n✅  Total: {total} transações importadas!")
    fin = int(conn.closed == 0)  # apenas para evitar warning

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)

    args       = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags      = [a for a in sys.argv[1:] if a.startswith('--')]
    limpar     = '--limpar' in flags
    apenas_ano = next((int(f.split('=')[1]) for f in flags if f.startswith('--ano=')), None)
    cmd        = args[0].lower() if args else ''

    if cmd == 'cashflow':
        import_cashflow(args[1], limpar=limpar)
    elif cmd == 'movimento':
        import_movimento(args[1], limpar=limpar, apenas_ano=apenas_ano)
    elif cmd == 'ambos':
        if len(args) < 3:
            print("Uso: python3 import_financeiro.py ambos <cashflow.xlsx> <movimento.xlsx>"); sys.exit(1)
        import_cashflow(args[1], limpar=limpar)
        import_movimento(args[2], limpar=limpar, apenas_ano=apenas_ano)
    else:
        print(f"Comando desconhecido: {cmd}\nUse: cashflow | movimento | ambos"); sys.exit(1)