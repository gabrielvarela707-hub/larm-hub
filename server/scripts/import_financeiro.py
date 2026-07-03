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
  --ate=2026-06-28 Importa movimentos somente até a data informada (somente movimento)
"""
import sys, os, re
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
        dbname=os.getenv('DB_NAME', 'larmhub_prod'),
        user=os.getenv('DB_USER', 'larmhub'),
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

MESES_PT = {
    'jan': 1, 'fev': 2, 'mar': 3, 'abr': 4, 'mai': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'set': 9, 'out': 10, 'nov': 11, 'dez': 12,
}


def get_month_summary_columns(df):
    """Localiza a primeira coluna-resumo de cada mês (Jan-26, Fev-26...)."""
    result = {}
    if df.shape[0] <= 2:
        return result

    for col in range(4, df.shape[1]):
        value = df.iloc[2, col]
        if pd.isna(value):
            continue
        text = str(value).strip().lower()
        match = re.search(r'\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[-/ ](\d{2}|\d{4})\b', text)
        if not match:
            continue
        year = int(match.group(2))
        if year < 100:
            year += 2000
        key = (year, MESES_PT[match.group(1)])
        # A planilha possui mais de um bloco-resumo. O primeiro é o fechamento
        # mensal exibido na tela e deve prevalecer.
        result.setdefault(key, col)
    return result


def get_position_rows(df):
    """Saldo Inicial e todas as linhas a partir de SALDO FINAL são posições."""
    rows = set()
    saldo_final_row = None
    for row_i in range(4, df.shape[0]):
        descricao = safe_str(df.iloc[row_i, 2])
        if descricao == '(A) Saldo Inicial':
            rows.add(row_i)
        if descricao == 'SALDO FINAL':
            saldo_final_row = row_i
            break
    if saldo_final_row is not None:
        for row_i in range(saldo_final_row, df.shape[0]):
            descricao = safe_str(df.iloc[row_i, 2])
            if descricao:
                rows.add(row_i)
    return rows

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
        month_summary_cols = get_month_summary_columns(df)
        position_rows = get_position_rows(df)
        print(f"  Colunas diárias: {len(date_cols)} | fechamentos mensais: {len(month_summary_cols)}")

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
        position_value_keys = set()
        daily_cols_by_month = {}
        for col_i, dt in date_cols.items():
            daily_cols_by_month.setdefault((dt.year, dt.month), []).append(col_i)

        for row_i, linha_id in row_id_map.items():
            if row_i in position_rows:
                # Posições mensais não podem ser somadas dia a dia. Usa a coluna
                # de fechamento do mês; se ela não existir, usa o último saldo
                # diário disponível daquele mês.
                months = set(month_summary_cols) | set(daily_cols_by_month)
                for ano_mes in months:
                    ano, mes = ano_mes
                    val = None
                    summary_col = month_summary_cols.get(ano_mes)
                    if summary_col is not None:
                        try:
                            val = df.iloc[row_i, summary_col]
                        except IndexError:
                            val = None
                    if val is None or pd.isna(val):
                        for daily_col in reversed(daily_cols_by_month.get(ano_mes, [])):
                            try:
                                candidate = df.iloc[row_i, daily_col]
                            except IndexError:
                                continue
                            if pd.notna(candidate):
                                val = candidate
                                break
                    number = safe_num(val)
                    if number is None:
                        continue
                    key = (linha_id, ano, mes)
                    vals[key] = float(number)
                    position_value_keys.add(key)
                continue

            for col_i, dt in date_cols.items():
                try:
                    val = df.iloc[row_i, col_i]
                except IndexError:
                    continue
                if pd.isna(val) or val == 0:
                    continue
                key = (linha_id, dt.year, dt.month)
                vals[key] = vals.get(key, 0) + float(val)

        rows_val = [(lid, empresa, ano, mes, round(v, 4))
                    for (lid, ano, mes), v in vals.items()
                    if (lid, ano, mes) in position_value_keys or abs(v) > 0.001]

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
SHEETS_HIST = ['2021','2022','2023','2024','2025','2026']

COLUMN_ALIASES = {
    'Data': ['Data', 'DATA'],
    'Empresa': ['Empresa', 'EMPRESA'],
    'Banco': ['Banco', 'BANCO'],
    'Entradas': ['Entradas', 'Entrada', 'ENTRADAS'],
    'Saídas': ['Saídas', 'Saidas', 'Saída', 'Saida', 'SAÍDAS', 'SAIDAS'],
    'Fornecedor': ['Fornecedor', 'FORNECEDOR'],
    'Histórico': ['Histórico', 'Historico', 'HISTÓRICO', 'HISTORICO'],
    'NF/DOC': ['NF/DOC', 'NF DOC', 'NF_DOC', 'Documento', 'DOCUMENTO'],
    'Emissão DOC': ['Emissão DOC', 'Emissao DOC', 'Emissão', 'Emissao', 'Data Emissão', 'Data Emissao'],
    'Conta Contábil': ['Conta Contábil', 'Conta Contabil', 'CONTA CONTÁBIL', 'CONTA CONTABIL'],
    'Centro de Custo': ['Centro de Custo', 'CENTRO DE CUSTO'],
    'Obra': ['Obra', 'OBRA'],
    'Natureza Financeira': ['Natureza Financeira', 'NATUREZA FINANCEIRA', 'Natureza'],
    'N. Cheque': ['N. Cheque', 'N Cheque', 'Cheque', 'Nº Cheque'],
    'Saldo': ['Saldo', 'SALDO'],
}

def normalize_headers(df):
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    rename = {}
    existing = {str(c).strip().lower(): c for c in df.columns}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            key = alias.strip().lower()
            if key in existing:
                rename[existing[key]] = canonical
                break
    return df.rename(columns=rename)

def get_val(row, col):
    return row.get(col) if col in row else None

def safe_int(v):
    n = safe_num(v)
    if n is None: return None
    try: return int(n)
    except (TypeError, ValueError): return None

def safe_num(v):
    if v is None: return None
    try:
        if pd.isna(v): return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, str):
        s = v.strip()
        if s in ('', 'nan', 'None', '#N/D', '#N/A'): return None
        # Suporta número no formato brasileiro: 1.234,56
        if ',' in s:
            s = s.replace('.', '').replace(',', '.')
        try:
            f = float(s)
        except ValueError:
            return None
    else:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
    import math
    return None if math.isnan(f) else f

def safe_str(v):
    if v is None: return None
    try:
        if pd.isna(v): return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, float) and v.is_integer():
        s = str(int(v))
    else:
        s = str(v).strip()
    return None if s in ('', 'nan', 'None', '#N/D', '#N/A') else s

def safe_date(v):
    if v is None: return None
    try:
        if pd.isna(v): return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, date) and not isinstance(v, datetime): return v
    if isinstance(v, datetime): return v.date()
    if isinstance(v, (int, float)) and v > 20000:
        try:
            return pd.to_datetime(v, unit='D', origin='1899-12-30').date()
        except Exception:
            pass
    try:
        return pd.to_datetime(v, dayfirst=True).date()
    except Exception:
        return None

def sheet_year(label):
    s = str(label or '').strip()
    return int(s) if s.isdigit() and len(s) == 4 else None

def _import_df(cur, conn, df, label, import_year=None, filter_year=None, data_ate=None):
    if df is None or len(df) == 0:
        print(f"  '{label}' vazia — pulando."); return 0

    df = normalize_headers(df).dropna(how='all')
    if len(df) == 0:
        print(f"  '{label}' sem linhas úteis — pulando."); return 0

    if 'Data' in df.columns:
        if filter_year and import_year is None:
            datas = df['Data'].apply(safe_date)
            df = df[datas.apply(lambda d: d is not None and d.year == filter_year)].copy()

        if data_ate:
            antes = len(df)
            datas = df['Data'].apply(safe_date)
            df = df[datas.apply(lambda d: d is not None and d <= data_ate)].copy()
            removidas = antes - len(df)
            if removidas:
                print(f"  Recorte por data: {removidas} linhas após {data_ate.strftime('%d/%m/%Y')} ignoradas.")

    rows = []
    skipped = 0
    for _, r in df.iterrows():
        data_mov = safe_date(get_val(r, 'Data'))
        entrada = safe_num(get_val(r, 'Entradas')) or 0
        saida = safe_num(get_val(r, 'Saídas')) or 0
        historico = safe_str(get_val(r, 'Histórico'))

        if data_mov is None and entrada == 0 and saida == 0 and not historico:
            skipped += 1
            continue

        nat  = safe_str(get_val(r, 'Natureza Financeira'))
        tipo = classificar_tipo(nat)
        dia  = data_mov.day if data_mov else safe_int(get_val(r, 'dia'))
        mes  = data_mov.month if data_mov else safe_int(get_val(r, 'mês'))
        ano  = import_year or (data_mov.year if data_mov else safe_int(get_val(r, 'ano')))

        rows.append((
            data_mov,
            safe_str(get_val(r, 'Empresa')),
            safe_str(get_val(r, 'Banco')),
            entrada if entrada != 0 else None,
            saida if saida != 0 else None,
            safe_str(get_val(r, 'Fornecedor')),
            historico,
            safe_str(get_val(r, 'NF/DOC')),
            safe_date(get_val(r, 'Emissão DOC')),
            safe_str(get_val(r, 'Conta Contábil')),
            safe_str(get_val(r, 'Centro de Custo')),
            safe_str(get_val(r, 'Obra')),
            nat,
            safe_str(get_val(r, 'N. Cheque')),
            dia,
            mes,
            ano,
            safe_num(get_val(r, 'Saldo')),
            tipo,
        ))

    if rows:
        execute_values(cur,
            """INSERT INTO fin_movimento
               (data, empresa, banco, entradas, saidas, fornecedor, historico,
                nf_doc, emissao_doc, conta_contabil, centro_custo, obra,
                natureza_financeira, n_cheque, dia, mes, ano, saldo, tipo_lancamento)
               VALUES %s""",
            rows, page_size=500)
        conn.commit()

    if skipped:
        print(f"  Linhas ignoradas: {skipped}")
    return len(rows)

def import_movimento(xlsx_path, limpar=False, apenas_ano=None, data_ate=None):
    print(f"\n{'='*60}\nImportando Movimento: {xlsx_path}\n{'='*60}")
    conn = get_conn(); cur = conn.cursor()

    if limpar:
        if apenas_ano:
            cur.execute("DELETE FROM fin_movimento WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int)=%s", (apenas_ano,))
            print(f"Dados do ano {apenas_ano} removidos antes da importação.")
        else:
            cur.execute("DELETE FROM fin_movimento")
            print("Todos os dados de movimento removidos antes da importação.")
        conn.commit()

    xls    = pd.ExcelFile(xlsx_path)
    sheets = xls.sheet_names
    total  = 0
    dtype  = {'NF/DOC': str, 'N. Cheque': str, 'Natureza Financeira': str}

    if data_ate:
        print(f"Filtro de data ativo: importando movimentos até {data_ate.strftime('%d/%m/%Y')}.")

    # Sheet principal (ano atual / orçado)
    if 'Movimento' in sheets:
        print(f"\nSheet: Movimento (principal)")
        df = pd.read_excel(xlsx_path, sheet_name='Movimento', dtype=dtype)
        n = _import_df(cur, conn, df, 'Movimento', import_year=apenas_ano, filter_year=apenas_ano, data_ate=data_ate)
        print(f"  ✅ {n} registros"); total += n

    # Sheets históricas por ano. Quando a aba é 2021, 2022 etc., o campo ano
    # fica igual ao ano da aba para permitir os botões de filtro por safra/importação.
    for sheet in SHEETS_HIST:
        if sheet not in sheets: continue
        sheet_ref_year = sheet_year(sheet)
        if apenas_ano and sheet_ref_year != apenas_ano: continue
        print(f"\nSheet: {sheet} (histórico)")
        df = pd.read_excel(xlsx_path, sheet_name=sheet, dtype=dtype)
        n  = _import_df(cur, conn, df, sheet, import_year=sheet_ref_year, data_ate=data_ate)
        print(f"  ✅ {n} registros"); total += n

    # Caso o arquivo tenha somente uma aba com outro nome, mas o usuário informe --ano.
    if total == 0 and apenas_ano:
        for sheet in sheets:
            if sheet in ('Movimento', 'Pgtos fora orçado') or sheet in SHEETS_HIST:
                continue
            print(f"\nSheet: {sheet} (importação genérica ano {apenas_ano})")
            df = pd.read_excel(xlsx_path, sheet_name=sheet, dtype=dtype)
            n = _import_df(cur, conn, df, sheet, import_year=apenas_ano, data_ate=data_ate)
            print(f"  ✅ {n} registros"); total += n
            break

    # Pagamentos fora do orçado (sem filtro de ano)
    if 'Pgtos fora orçado' in sheets and not apenas_ano:
        print(f"\nSheet: Pgtos fora orçado")
        try:
            df = pd.read_excel(xlsx_path, sheet_name='Pgtos fora orçado', dtype=dtype, header=1)
            df = df.dropna(how='all')
            if len(df) > 0 and 'Data' in [str(c).strip() for c in df.columns]:
                n  = _import_df(cur, conn, df, 'Pgtos fora orçado', data_ate=data_ate)
                print(f"  ✅ {n} registros"); total += n
        except Exception as e:
            print(f"  ⚠  Erro ao ler 'Pgtos fora orçado': {e}")

    cur.close(); conn.close()
    print(f"\n✅  Total: {total} transações importadas!")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)

    args       = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags      = [a for a in sys.argv[1:] if a.startswith('--')]
    limpar     = '--limpar' in flags
    apenas_ano = next((int(f.split('=')[1]) for f in flags if f.startswith('--ano=')), None)
    data_ate   = next((safe_date(f.split('=', 1)[1]) for f in flags if f.startswith('--ate=')), None)
    cmd        = args[0].lower() if args else ''

    if cmd == 'cashflow':
        import_cashflow(args[1], limpar=limpar)
    elif cmd == 'movimento':
        import_movimento(args[1], limpar=limpar, apenas_ano=apenas_ano, data_ate=data_ate)
    elif cmd == 'ambos':
        if len(args) < 3:
            print("Uso: python3 import_financeiro.py ambos <cashflow.xlsx> <movimento.xlsx>"); sys.exit(1)
        import_cashflow(args[1], limpar=limpar)
        import_movimento(args[2], limpar=limpar, apenas_ano=apenas_ano, data_ate=data_ate)
    else:
        print(f"Comando desconhecido: {cmd}\nUse: cashflow | movimento | ambos"); sys.exit(1)