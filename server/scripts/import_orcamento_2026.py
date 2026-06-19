#!/usr/bin/env python3
"""
scripts/import_orcamento_2026.py

Importa o Orçamento 2026 a partir da planilha de Movimento Bancário Orçado.

Regra desta versão:
- A planilha Movimento Bancário-2026-orçado é a fonte do PREVISTO.
- O movimento orçado fica separado em fin_orcamento_movimento.
- O previsto exibido em Orçamento é agregado por Natureza Financeira/mês em fin_orcamento_valores.
- Nada é gravado em fin_movimento realizado.

Uso:
  python3 scripts/import_orcamento_2026.py scripts/imports/orcamento-movimento-2026.xlsx --ano=2026 --limpar

Compatibilidade:
  Também aceita o formato antigo com dois arquivos e usa sempre o último arquivo informado como Movimento Orçado.
"""
import os
import sys
import math
from datetime import datetime, date
from collections import defaultdict

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

SHEET_MOVIMENTO = 'Movimento'

ORCAMENTO_LINHAS = [
    (4, None, '(A) Saldo Inicial', 1, 'header'),
    (6, '1.', 'Receitas Brutas', 1, 'total'),
    (7, '1.1', 'VENDA DE IMÓVEIS', 2, 'item'),
    (8, '1.2', 'ALUGUÉIS', 2, 'item'),
    (9, '1.3', 'VENDA DE MERCADORIAS/GADO', 2, 'item'),
    (10, '1.4', 'OUTRAS RECEITAS OPERACIONAIS', 2, 'item'),
    (11, None, 'Deduções das Receitas', 2, 'subtotal'),
    (12, '1.9', 'VENDAS CANCELADAS', 2, 'item'),
    (13, '2.1', 'IMPOSTOS S/ VENDAS', 2, 'item'),
    (15, None, 'Receita Líquida', 1, 'total'),
    (17, '4.', 'Despesas Gerais e Administrativas', 1, 'total'),
    (18, '4.1', 'DESPESAS COM PESSOAL (1)', 2, 'item'),
    (19, '4.2', 'OCUPACÃO (2)', 2, 'item'),
    (20, '4.3', 'UTILIDADES E SERVICOS (3)', 2, 'item'),
    (21, '4.4', 'DESPESAS GERAIS/TERCEIROS (4)', 2, 'item'),
    (22, '4.5', 'SERVICOS PROFISSIONAIS (5)', 2, 'item'),
    (23, '4.6', 'DESPESAS DE VIAGENS (6)', 2, 'item'),
    (24, '4.7', 'DESPESAS COM VEÍCULOS (7)', 2, 'item'),
    (25, '4.8', 'DESPESAS COMERCIAIS (8)', 2, 'item'),
    (26, '4.9', 'IMPOSTOS E TAXAS (9)', 2, 'item'),
    (27, '4.10', 'DESPESAS INDEDUTIVEIS (10)', 2, 'item'),
    (28, '4.11', 'CUSTO DO GADO (11)', 2, 'item'),
    (29, '4.12', 'DESPESAS MÉDICAS (12)', 2, 'item'),
    (30, '6.1', 'RECEITAS/DESPESAS NÃO OPERACIONAIS', 2, 'item'),
    (32, None, 'Resultado Financeiro', 1, 'total'),
    (33, None, 'Receitas Financeiras', 2, 'subtotal'),
    (34, '5.1', 'RECEITAS FINANCEIRAS', 2, 'item'),
    (35, None, 'Despesas Financeiras', 2, 'subtotal'),
    (36, '5.2', 'DESPESAS FINANCEIRAS', 2, 'item'),
    (37, None, 'Emprestimos e Financiamentos', 2, 'subtotal'),
    (38, '7.4', 'Emprestimos e Financiamentos', 2, 'subtotal'),
    (41, None, 'Geração de Caixa', 1, 'total'),
    (43, '7.', 'Investimentos', 1, 'total'),
    (44, '7.3', 'ATIVO IMOBILIZADO', 2, 'item'),
    (45, '7.2', 'OUTROS INVESTIMENTOS', 2, 'item'),
    (46, '8.1', 'ED. FCO. MELAO-CJ 23', 2, 'item'),
    (47, '8.2', 'ED. VENDOME-AP 131', 2, 'item'),
    (48, '8.3', 'FAZENDA-SÃO MANOEL', 2, 'item'),
    (49, '8.4', 'LOTEAMENTO-RES. SANTA CLARA', 2, 'item'),
    (50, '8.5', 'LOTEAMENTO-RES. SANTA CLARA QY', 2, 'item'),
    (51, '8.6', 'LOTEAMENTO-RES. SANTA CLARA QZ', 2, 'item'),
    (52, '8.7', 'LOTEAMENTO-RES. SANTA CLARA II', 2, 'item'),
    (53, '8.10', 'SEMOVENTES', 2, 'item'),
    (54, '8.11', 'CASA2-ESPERANÇA', 2, 'item'),
    (55, '8.12', 'BRASIL AGRO II', 2, 'item'),
    (56, '8.13', 'BRASIL AGRO III', 2, 'item'),
    (58, None, 'Distribuição de Lucros', 1, 'total'),
    (59, '9.1', 'Lucros distribuidos', 2, 'item'),
    (61, None, 'Sucessão', 1, 'total'),
    (62, '10.1', 'Impostos/ Taxas / Comissões', 2, 'item'),
    (65, None, 'SALDO FINAL', 1, 'header'),
    (67, None, 'Saldos Bancários em C/C', 2, 'subtotal'),
    (68, None, 'Aplicações Financeiras', 2, 'subtotal'),
    (70, None, 'Curto Prazo', 2, 'subtotal'),
    (71, 'CDB1', 'CDB CEF', 3, 'item'),
    (72, 'CDB2', 'CDB Daycoval', 3, 'item'),
    (73, 'LCA2', 'LCA Daycoval - Pós', 3, 'item'),
    (74, 'LCI Pós', 'LCI Pós', 3, 'item'),
    (75, 'FI', 'DAYCOVAL CLASSIC F.I. R.F. C.P', 3, 'item'),
    (76, None, 'Longo Prazo', 2, 'subtotal'),
    (77, 'LCA', 'LCA Daycoval - Pós', 3, 'item'),
    (78, 'LCA V', 'LCA Brasil Agro - F.I.P', 3, 'item'),
    (79, 'CDBG', 'CDB Daycoval (Garantido)', 3, 'item'),
    (80, 'LCI', 'Debêntures', 3, 'item'),
]

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

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS fin_orcamento_linhas (
  id          SERIAL PRIMARY KEY,
  row_idx     INTEGER NOT NULL UNIQUE,
  codigo      VARCHAR(20),
  descricao   TEXT NOT NULL,
  nivel       INTEGER DEFAULT 1,
  tipo        VARCHAR(20) DEFAULT 'item',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fin_orcamento_valores (
  id          SERIAL PRIMARY KEY,
  linha_id    INTEGER NOT NULL REFERENCES fin_orcamento_linhas(id) ON DELETE CASCADE,
  empresa     VARCHAR(30) NOT NULL,
  ano         INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  previsto    NUMERIC(18,4) DEFAULT 0,
  origem      VARCHAR(80) DEFAULT 'movimento_orcado_agregado',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE (linha_id, empresa, ano, mes)
);

CREATE TABLE IF NOT EXISTS fin_orcamento_movimento (
  id                   BIGSERIAL PRIMARY KEY,
  data                 DATE,
  empresa              VARCHAR(30),
  banco                VARCHAR(120),
  entradas             NUMERIC(18,4),
  saidas               NUMERIC(18,4),
  fornecedor           TEXT,
  historico            TEXT,
  nf_doc               VARCHAR(120),
  emissao_doc          DATE,
  conta_contabil       TEXT,
  centro_custo         TEXT,
  obra                 TEXT,
  natureza_financeira  TEXT,
  n_cheque             VARCHAR(120),
  dia                  INTEGER,
  mes                  INTEGER,
  ano                  INTEGER,
  saldo                NUMERIC(18,4),
  tipo_lancamento      VARCHAR(20) DEFAULT 'orcado',
  origem               VARCHAR(80) DEFAULT 'movimento_orcado',
  created_at           TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_linhas_row_idx ON fin_orcamento_linhas(row_idx);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_valores_unique ON fin_orcamento_valores(linha_id, empresa, ano, mes);
CREATE INDEX IF NOT EXISTS idx_orcamento_valores_empresa_ano ON fin_orcamento_valores(empresa, ano);
CREATE INDEX IF NOT EXISTS idx_orcamento_mov_empresa_ano ON fin_orcamento_movimento(empresa, ano);
CREATE INDEX IF NOT EXISTS idx_orcamento_mov_data ON fin_orcamento_movimento(data);
CREATE INDEX IF NOT EXISTS idx_orcamento_mov_mes ON fin_orcamento_movimento(ano, mes);
"""


def get_conn():
    return psycopg2.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        port=os.getenv('DB_PORT', '5432'),
        dbname=os.getenv('DB_NAME', 'larmhub_prod'),
        user=os.getenv('DB_USER', 'larmhub'),
        password=os.getenv('DB_PASSWORD'),
    )


def safe_str(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, float) and v.is_integer():
        s = str(int(v))
    else:
        s = str(v).strip()
    return None if s in ('', 'nan', 'None', '#N/D', '#N/A') else s


def safe_num(v):
    if v is None:
        return 0
    try:
        if pd.isna(v):
            return 0
    except (TypeError, ValueError):
        pass
    if isinstance(v, str):
        s = v.strip()
        if s in ('', 'nan', 'None', '#N/D', '#N/A'):
            return 0
        if ',' in s:
            s = s.replace('.', '').replace(',', '.')
        try:
            f = float(s)
        except ValueError:
            return 0
    else:
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 0
    return 0 if math.isnan(f) else f


def safe_int(v):
    n = safe_num(v)
    try:
        return int(n)
    except (TypeError, ValueError):
        return None


def safe_date(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, (int, float)) and v > 20000:
        try:
            return pd.to_datetime(v, unit='D', origin='1899-12-30').date()
        except Exception:
            pass
    try:
        return pd.to_datetime(v, dayfirst=True).date()
    except Exception:
        return None


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


def normalize_empresa(v):
    s = safe_str(v)
    return s.upper() if s else None


def normalize_codigo(v):
    s = safe_str(v)
    if not s:
        return None
    s = s.replace(',', '.').strip()
    if s.endswith('.0'):
        s = s[:-2]
    return s


def code_matches(natureza, prefix):
    if not natureza or not prefix:
        return False
    n = str(natureza).strip()
    p = str(prefix).strip()
    if p.endswith('.'):
        return n == p[:-1] or n.startswith(p)
    return n == p or n.startswith(p + '.')


def ensure_schema(cur):
    cur.execute(SCHEMA_SQL)


def ensure_linhas(cur, conn):
    execute_values(cur,
        """INSERT INTO fin_orcamento_linhas (row_idx, codigo, descricao, nivel, tipo)
           VALUES %s
           ON CONFLICT (row_idx) DO UPDATE
           SET codigo = EXCLUDED.codigo,
               descricao = EXCLUDED.descricao,
               nivel = EXCLUDED.nivel,
               tipo = EXCLUDED.tipo,
               updated_at = NOW()""",
        ORCAMENTO_LINHAS,
    )
    conn.commit()
    cur.execute('SELECT row_idx, id, codigo, descricao FROM fin_orcamento_linhas')
    return {row_idx: {'id': linha_id, 'codigo': codigo, 'descricao': descricao} for row_idx, linha_id, codigo, descricao in cur.fetchall()}


def get_saldos_iniciais_bancos(cur, ano):
    try:
        cur.execute("""
            SELECT empresa, COALESCE(SUM(COALESCE(saldo_inicial, 0)), 0)::float AS saldo
              FROM fin_bancos_contas
             WHERE COALESCE(ativo, true) = true
               AND (data_saldo_inicial IS NULL OR EXTRACT(YEAR FROM data_saldo_inicial)::int = %s)
             GROUP BY empresa
        """, (ano,))
    except Exception:
        return {'CONSOLIDADO': 0}

    saldos = {'CONSOLIDADO': 0}
    for empresa, saldo in cur.fetchall():
        emp = normalize_empresa(empresa) or 'SEM_EMPRESA'
        val = float(saldo or 0)
        saldos[emp] = val
        saldos['CONSOLIDADO'] += val
    return saldos


def import_movimento_orcado(cur, conn, xlsx_path, ano=2026, limpar=False):
    print(f"\nImportando Movimento Bancário Orçado: {xlsx_path}")
    if limpar:
        cur.execute('DELETE FROM fin_orcamento_valores WHERE ano = %s', (ano,))
        cur.execute('DELETE FROM fin_orcamento_movimento WHERE ano = %s', (ano,))
        conn.commit()
        print(f"  Orçamento e movimento orçado do ano {ano} removidos.")

    xls = pd.ExcelFile(xlsx_path)
    if SHEET_MOVIMENTO not in xls.sheet_names:
        raise RuntimeError(f"Aba obrigatória '{SHEET_MOVIMENTO}' não encontrada.")

    dtype = {'NF/DOC': str, 'N. Cheque': str, 'Natureza Financeira': str}
    df = pd.read_excel(xlsx_path, sheet_name=SHEET_MOVIMENTO, dtype=dtype)
    df = normalize_headers(df).dropna(how='all')

    movimento_rows = []
    skipped = 0
    base_por_codigo = defaultdict(float)   # (empresa, mes, codigo) -> valor
    total_movimento = defaultdict(float)   # (empresa, mes) -> valor líquido total

    for _, r in df.iterrows():
        data_mov = safe_date(get_val(r, 'Data'))
        entrada = safe_num(get_val(r, 'Entradas'))
        saida = safe_num(get_val(r, 'Saídas'))
        historico = safe_str(get_val(r, 'Histórico'))

        if data_mov is None and entrada == 0 and saida == 0 and not historico:
            skipped += 1
            continue
        if data_mov is None or data_mov.year != ano:
            skipped += 1
            continue

        empresa = normalize_empresa(get_val(r, 'Empresa')) or 'SEM_EMPRESA'
        natureza = normalize_codigo(get_val(r, 'Natureza Financeira'))
        mes = data_mov.month
        dia = data_mov.day
        valor_liquido = entrada - saida

        movimento_rows.append((
            data_mov,
            empresa,
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
            natureza,
            safe_str(get_val(r, 'N. Cheque')),
            dia,
            mes,
            ano,
            safe_num(get_val(r, 'Saldo')),
            'orcado',
            'movimento_orcado',
        ))

        for emp_key in (empresa, 'CONSOLIDADO'):
            total_movimento[(emp_key, mes)] += valor_liquido
            if natureza:
                base_por_codigo[(emp_key, mes, natureza)] += valor_liquido

    if movimento_rows:
        execute_values(cur,
            """INSERT INTO fin_orcamento_movimento
               (data, empresa, banco, entradas, saidas, fornecedor, historico,
                nf_doc, emissao_doc, conta_contabil, centro_custo, obra,
                natureza_financeira, n_cheque, dia, mes, ano, saldo,
                tipo_lancamento, origem)
               VALUES %s""",
            movimento_rows,
            page_size=500,
        )
        conn.commit()

    print(f"  Movimento orçado importado: {len(movimento_rows)} registros")
    if skipped:
        print(f"  Linhas ignoradas: {skipped}")

    return base_por_codigo, total_movimento, len(movimento_rows)


def sum_prefix(base, empresa, mes, prefixes):
    total = 0.0
    for (emp, m, cod), valor in base.items():
        if emp != empresa or m != mes:
            continue
        if any(code_matches(cod, p) for p in prefixes):
            total += valor
    return total


def code_value(base, empresa, mes, codigo):
    if not codigo:
        return 0.0
    if codigo == '1.':
        return sum_prefix(base, empresa, mes, ['1.1', '1.2', '1.3', '1.4'])
    if codigo == '4.':
        return sum_prefix(base, empresa, mes, ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7', '4.8', '4.9', '4.10', '4.11', '4.12', '6.1'])
    if codigo == '7.':
        return sum_prefix(base, empresa, mes, ['7.2', '7.3', '8.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.10', '8.11', '8.12', '8.13'])
    # CDB/FI/LCA não vêm como Natureza Financeira nesta planilha de movimento.
    if not any(ch.isdigit() for ch in codigo):
        return 0.0
    return sum_prefix(base, empresa, mes, [codigo])


def build_previstos(base_por_codigo, total_movimento, saldos_iniciais, row_id_map, ano):
    empresas = sorted({emp for emp, _, _ in base_por_codigo.keys()} | {'CONSOLIDADO'})
    previstos = []

    # Mapa auxiliar por descrição/código para montar totais compostos.
    for empresa in empresas:
        saldo_mes = float(saldos_iniciais.get(empresa, 0) or 0)
        for mes in range(1, 13):
            values_by_desc = {}
            values_by_row = {}

            for row_idx, codigo, descricao, nivel, tipo in ORCAMENTO_LINHAS:
                valor = code_value(base_por_codigo, empresa, mes, codigo)
                values_by_desc[descricao] = valor
                values_by_row[row_idx] = valor

            receitas_brutas = sum(values_by_desc.get(d, 0) for d in [
                'VENDA DE IMÓVEIS', 'ALUGUÉIS', 'VENDA DE MERCADORIAS/GADO', 'OUTRAS RECEITAS OPERACIONAIS'
            ])
            deducoes = values_by_desc.get('VENDAS CANCELADAS', 0) + values_by_desc.get('IMPOSTOS S/ VENDAS', 0)
            receita_liquida = receitas_brutas + deducoes
            despesas_gerais = sum(values_by_desc.get(d, 0) for d in [
                'DESPESAS COM PESSOAL (1)', 'OCUPACÃO (2)', 'UTILIDADES E SERVICOS (3)',
                'DESPESAS GERAIS/TERCEIROS (4)', 'SERVICOS PROFISSIONAIS (5)', 'DESPESAS DE VIAGENS (6)',
                'DESPESAS COM VEÍCULOS (7)', 'DESPESAS COMERCIAIS (8)', 'IMPOSTOS E TAXAS (9)',
                'DESPESAS INDEDUTIVEIS (10)', 'CUSTO DO GADO (11)', 'DESPESAS MÉDICAS (12)',
                'RECEITAS/DESPESAS NÃO OPERACIONAIS'
            ])
            receitas_financeiras = values_by_desc.get('RECEITAS FINANCEIRAS', 0)
            despesas_financeiras = values_by_desc.get('DESPESAS FINANCEIRAS', 0)
            emprestimos = values_by_desc.get('Emprestimos e Financiamentos', 0)
            resultado_financeiro = receitas_financeiras + despesas_financeiras + emprestimos
            geracao = receita_liquida + despesas_gerais + resultado_financeiro
            investimentos = sum(values_by_desc.get(d, 0) for d in [
                'ATIVO IMOBILIZADO', 'OUTROS INVESTIMENTOS', 'ED. FCO. MELAO-CJ 23', 'ED. VENDOME-AP 131',
                'FAZENDA-SÃO MANOEL', 'LOTEAMENTO-RES. SANTA CLARA', 'LOTEAMENTO-RES. SANTA CLARA QY',
                'LOTEAMENTO-RES. SANTA CLARA QZ', 'LOTEAMENTO-RES. SANTA CLARA II', 'SEMOVENTES',
                'CASA2-ESPERANÇA', 'BRASIL AGRO II', 'BRASIL AGRO III'
            ])
            distribuicao = values_by_desc.get('Lucros distribuidos', 0)
            sucessao = values_by_desc.get('Impostos/ Taxas / Comissões', 0)
            saldo_final = saldo_mes + float(total_movimento.get((empresa, mes), 0) or 0)

            override = {
                '(A) Saldo Inicial': saldo_mes,
                'Receitas Brutas': receitas_brutas,
                'Deduções das Receitas': deducoes,
                'Receita Líquida': receita_liquida,
                'Despesas Gerais e Administrativas': despesas_gerais,
                'Resultado Financeiro': resultado_financeiro,
                'Receitas Financeiras': receitas_financeiras,
                'Despesas Financeiras': despesas_financeiras,
                'Geração de Caixa': geracao,
                'Investimentos': investimentos,
                'Distribuição de Lucros': distribuicao,
                'Sucessão': sucessao,
                'SALDO FINAL': saldo_final,
                'Saldos Bancários em C/C': saldo_final,
            }

            for row_idx, codigo, descricao, nivel, tipo in ORCAMENTO_LINHAS:
                valor = override.get(descricao, values_by_row.get(row_idx, 0))
                if abs(valor) < 0.0001:
                    continue
                linha_id = row_id_map[row_idx]['id']
                previstos.append((linha_id, empresa, ano, mes, round(float(valor), 4), 'movimento_orcado_agregado'))

            saldo_mes = saldo_final

    return previstos


def import_previstos_agregados(cur, conn, previstos):
    if not previstos:
        print('  Nenhum valor previsto agregado para gravar.')
        return 0

    execute_values(cur,
        """INSERT INTO fin_orcamento_valores (linha_id, empresa, ano, mes, previsto, origem)
           VALUES %s
           ON CONFLICT (linha_id, empresa, ano, mes) DO UPDATE
           SET previsto = EXCLUDED.previsto,
               origem = EXCLUDED.origem,
               updated_at = NOW()""",
        previstos,
        page_size=500,
    )
    conn.commit()
    print(f"  Valores previstos agregados do movimento: {len(previstos)}")
    return len(previstos)


def parse_flags(flags):
    ano = 2026
    limpar = False
    for f in flags:
        if f == '--limpar':
            limpar = True
        elif f.startswith('--ano='):
            ano = int(f.split('=', 1)[1])
    return ano, limpar


if __name__ == '__main__':
    files = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    if not files:
        print(__doc__)
        sys.exit(1)

    # Se vier no formato antigo: cashflow.xlsx movimento.xlsx, usa o último arquivo como movimento.
    movimento_path = files[-1]
    ano, limpar = parse_flags(flags)

    conn = get_conn()
    cur = conn.cursor()
    try:
        ensure_schema(cur)
        conn.commit()
        row_id_map = ensure_linhas(cur, conn)
        saldos = get_saldos_iniciais_bancos(cur, ano)
        base, total_mov, total_movimento = import_movimento_orcado(cur, conn, movimento_path, ano=ano, limpar=limpar)
        previstos = build_previstos(base, total_mov, saldos, row_id_map, ano)
        total_previstos = import_previstos_agregados(cur, conn, previstos)
        print(f"\n✅ Orçamento {ano} importado a partir do Movimento Orçado: {total_previstos} valores previstos e {total_movimento} movimentos orçados.")
    except Exception as exc:
        conn.rollback()
        print(f"❌ Erro ao importar orçamento: {exc}")
        raise
    finally:
        cur.close()
        conn.close()
