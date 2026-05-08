#!/usr/bin/env python3
"""
scripts/import_financeiro.py
Importa CashFlow_Consolidado e Movimento_Bancário para o PostgreSQL.

Uso:
  python3 scripts/import_financeiro.py cashflow  /caminho/CashFlow_Consolidado_2026.xlsx
  python3 scripts/import_financeiro.py movimento /caminho/Movimento_Bancário-2026.xlsx
  python3 scripts/import_financeiro.py ambos     /caminho/CashFlow.xlsx /caminho/Movimento.xlsx
"""
import sys
import os
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# ─── Conexão ──────────────────────────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        dbname=os.getenv('DB_NAME', 'lotemobile_prod'),
        user=os.getenv('DB_USER', 'lotemobile'),
        password=os.getenv('DB_PASSWORD'),
    )

# ─── Definição de tipos de linhas ─────────────────────────────────────────────
# header = linha de categoria principal (negrito, sem código numérico)
# total  = linha de total/subtotal
# item   = linha de detalhe

TIPO_POR_DESC = {
    '(A) Saldo Inicial':         ('header', 1),
    'Receitas Brutas':           ('total',  1),
    'Deduções das Receitas':     ('subtotal',2),
    'Receita Líquida':           ('total',  1),
    'Despesas Gerais e Administrativas': ('total', 1),
    'Resultado Financeiro':      ('total',  1),
    'Receitas Financeiras':      ('subtotal',2),
    'Despesas Financeiras':      ('subtotal',2),
    'Emprestimos e Financiamentos': ('subtotal',2),
    'Geração de Caixa':          ('total',  1),
    'Investimentos':             ('total',  1),
    'Distribuição de Lucros':    ('total',  1),
    'Sucessão':                  ('total',  1),
    'SALDO FINAL':               ('header', 1),
    'Saldos Bancários em C/C':   ('subtotal',2),
    'Aplicações Financeiras':    ('subtotal',2),
    'Curto Prazo':               ('subtotal',3),
    'Longo Prazo':               ('subtotal',3),
}

def get_nivel_tipo(codigo, descricao):
    if descricao in TIPO_POR_DESC:
        return TIPO_POR_DESC[descricao]
    if pd.isna(codigo) or str(codigo).strip() == '':
        return ('item', 2)
    code_str = str(codigo).strip()
    if code_str.endswith('.') and '.' == code_str[-1] and len(code_str) <= 3:
        return ('total', 1)
    parts = code_str.replace('(', '').replace(')', '').split('.')
    nivel = len([p for p in parts if p.strip()]) + 1
    return ('item', min(nivel, 3))

# ─── IMPORTAR CASHFLOW ────────────────────────────────────────────────────────
EMPRESAS_CF = ['Consolidado', 'LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']

def import_cashflow(xlsx_path):
    print(f"\n{'='*60}")
    print(f"Importando CashFlow: {xlsx_path}")
    print('='*60)

    conn = get_conn()
    cur  = conn.cursor()

    # Limpa tabelas
    cur.execute("DELETE FROM fin_cashflow_valores")
    cur.execute("DELETE FROM fin_cashflow_linhas")
    conn.commit()
    print("Tabelas limpas.")

    # ── Lê todas as sheets ────────────────────────────────────────────────────
    xls = pd.ExcelFile(xlsx_path)
    linhas_inseridas = False

    for sheet_nome in EMPRESAS_CF:
        if sheet_nome not in xls.sheet_names:
            print(f"  Sheet '{sheet_nome}' não encontrada — pulando.")
            continue

        empresa = sheet_nome.upper()
        print(f"\nProcessando: {empresa}")

        df = pd.read_excel(xlsx_path, sheet_name=sheet_nome, header=None)

        # ── Identifica colunas de data (linha 2, índice 2) ────────────────────
        date_cols = {}  # col_index -> date
        for col in range(4, df.shape[1]):
            val = df.iloc[2, col]
            if pd.notna(val) and isinstance(val, datetime):
                date_cols[col] = val.date()

        print(f"  Colunas de data encontradas: {len(date_cols)}")

        # ── Insere linhas (apenas uma vez, baseado no Consolidado) ────────────
        if not linhas_inseridas:
            linhas = []
            for row_i in range(4, df.shape[0]):
                codigo  = df.iloc[row_i, 1]
                descricao = df.iloc[row_i, 2]
                if pd.isna(descricao) or str(descricao).strip() == '':
                    continue
                desc_str = str(descricao).strip()
                cod_str  = None if pd.isna(codigo) or str(codigo).strip() == '' else str(codigo).strip()
                tipo, nivel = get_nivel_tipo(codigo, desc_str)
                linhas.append((row_i, cod_str, desc_str, nivel, tipo))

            execute_values(cur,
                """INSERT INTO fin_cashflow_linhas (row_idx, codigo, descricao, nivel, tipo)
                   VALUES %s ON CONFLICT (row_idx) DO NOTHING""",
                linhas
            )
            conn.commit()
            print(f"  Linhas hierárquicas inseridas: {len(linhas)}")
            linhas_inseridas = True

        # ── Busca mapa row_idx -> linha_id ────────────────────────────────────
        cur.execute("SELECT row_idx, id FROM fin_cashflow_linhas")
        row_id_map = {row: lid for row, lid in cur.fetchall()}

        # ── Agrega por mês e insere valores ───────────────────────────────────
        valores_por_linha_mes = {}  # (linha_id, ano, mes) -> valor

        for col_i, dt in date_cols.items():
            ano, mes = dt.year, dt.month
            for row_i, linha_id in row_id_map.items():
                val = df.iloc[row_i, col_i]
                if pd.isna(val) or val == 0:
                    continue
                key = (linha_id, ano, mes)
                valores_por_linha_mes[key] = valores_por_linha_mes.get(key, 0) + float(val)

        # Insere valores
        rows_val = [
            (linha_id, empresa, ano, mes, round(valor, 4))
            for (linha_id, ano, mes), valor in valores_por_linha_mes.items()
            if abs(valor) > 0.001
        ]

        if rows_val:
            execute_values(cur,
                """INSERT INTO fin_cashflow_valores (linha_id, empresa, ano, mes, valor)
                   VALUES %s ON CONFLICT (linha_id, empresa, ano, mes)
                   DO UPDATE SET valor = EXCLUDED.valor""",
                rows_val
            )
            conn.commit()
            print(f"  Valores inseridos: {len(rows_val)}")
        else:
            print(f"  Nenhum valor não-zero encontrado.")

    cur.close()
    conn.close()
    print("\n✅  CashFlow importado com sucesso!")

# ─── IMPORTAR MOVIMENTO BANCÁRIO ──────────────────────────────────────────────

def import_movimento(xlsx_path):
    print(f"\n{'='*60}")
    print(f"Importando Movimento Bancário: {xlsx_path}")
    print('='*60)

    conn = get_conn()
    cur  = conn.cursor()

    # Apenas importa sheet "Movimento"
    df = pd.read_excel(xlsx_path, sheet_name='Movimento', dtype={
        'NF/DOC': str, 'N. Cheque': str, 'Natureza Financeira': str,
    })

    print(f"Linhas lidas: {len(df)}")

    # Limpa dados do ano presente no arquivo
    if len(df) > 0:
        anos = df['ano'].dropna().unique()
        for ano in anos:
            cur.execute("DELETE FROM fin_movimento WHERE ano = %s", (int(ano),))
        conn.commit()
        print(f"Dados anteriores removidos para anos: {sorted(anos.tolist())}")

    def safe(v):
        if pd.isna(v): return None
        return v

    def safe_num(v):
        if pd.isna(v): return None
        try: return float(v)
        except: return None

    def safe_date(v):
        if pd.isna(v): return None
        if isinstance(v, datetime): return v.date()
        try: return pd.to_datetime(v, origin='1899-12-30', unit='D').date()
        except: return None

    rows = []
    for _, r in df.iterrows():
        rows.append((
            safe_date(r.get('Data')),
            safe(r.get('Empresa')),
            safe(r.get('Banco')),
            safe_num(r.get('Entradas')),
            safe_num(r.get('Saídas')),
            safe(r.get('Fornecedor')),
            safe(r.get('Histórico')),
            safe(r.get('NF/DOC')),
            safe(r.get('Conta Contábil')),
            safe(r.get('Centro de Custo')),
            safe(r.get('Obra')),
            safe(r.get('Natureza Financeira')),
            safe(r.get('N. Cheque')),
            safe(r.get('dia')),
            safe(r.get('mês')),
            safe(r.get('ano')),
            safe_num(r.get('Saldo')),
        ))

    execute_values(cur,
        """INSERT INTO fin_movimento
           (data, empresa, banco, entradas, saidas, fornecedor, historico,
            nf_doc, conta_contabil, centro_custo, obra, natureza_financeira,
            n_cheque, dia, mes, ano, saldo)
           VALUES %s""",
        rows, page_size=500
    )
    conn.commit()
    print(f"✅  {len(rows)} transações importadas!")

    cur.close()
    conn.close()

# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == 'cashflow':
        import_cashflow(sys.argv[2])
    elif cmd == 'movimento':
        import_movimento(sys.argv[2])
    elif cmd == 'ambos':
        if len(sys.argv) < 4:
            print("Uso: python3 import_financeiro.py ambos <cashflow.xlsx> <movimento.xlsx>")
            sys.exit(1)
        import_cashflow(sys.argv[2])
        import_movimento(sys.argv[3])
    else:
        print(f"Comando desconhecido: {cmd}")
        print("Use: cashflow | movimento | ambos")
        sys.exit(1)
