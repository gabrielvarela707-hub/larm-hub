#!/usr/bin/env python3
"""
scripts/import_contas_pagar_futuro.py
Importa uma planilha de lançamentos futuros para Contas a Pagar.

Regra importante:
- NÃO grava em fin_movimento.
- Grava em fin_lancamentos_cp + fin_parcelas_cp como pendente.
- O movimento bancário só será gerado pelo rito normal do sistema quando a parcela for paga/baixada.

Uso:
  python3 scripts/import_contas_pagar_futuro.py scripts/imports/2026-contas-pagar.xlsx --ano=2026 --de=2026-06-29

Flags:
  --ano=2026              importa somente vencimentos do ano informado
  --de=2026-06-29         importa somente vencimentos a partir desta data
  --ate=2026-12-31        importa somente vencimentos até esta data
  --limpar-importados     remove importações anteriores geradas por este script no período informado, desde que ainda estejam pendentes
"""
import hashlib
import os
import re
import sys
import unicodedata
from datetime import date, datetime

import pandas as pd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

SOURCE_PREFIX = "Importado do Excel contas a pagar futuro 2026"

COLUMN_ALIASES = {
    "Data": ["Data", "DATA", "Vencimento", "Data Vencimento"],
    "Empresa": ["Empresa", "EMPRESA"],
    "Banco": ["Banco", "BANCO"],
    "Entradas": ["Entradas", "Entrada", "ENTRADAS"],
    "Saídas": ["Saídas", "Saidas", "Saída", "Saida", "SAÍDAS", "SAIDAS"],
    "Fornecedor": ["Fornecedor", "FORNECEDOR"],
    "Histórico": ["Histórico", "Historico", "HISTÓRICO", "HISTORICO", "Descrição"],
    "NF/DOC": ["NF/DOC", "NF DOC", "NF_DOC", "Documento", "DOCUMENTO"],
    "Emissão DOC": ["Emissão DOC", "Emissao DOC", "Emissão", "Emissao", "Data Emissão", "Data Emissao"],
    "Conta Contábil": ["Conta Contábil", "Conta Contabil", "CONTA CONTÁBIL", "CONTA CONTABIL"],
    "Centro de Custo": ["Centro de Custo", "CENTRO DE CUSTO"],
    "Obra": ["Obra", "OBRA"],
    "Natureza Financeira": ["Natureza Financeira", "NATUREZA FINANCEIRA", "Natureza"],
    "N. Cheque": ["N. Cheque", "N Cheque", "Cheque", "Nº Cheque"],
}


def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "larmhub_prod"),
        user=os.getenv("DB_USER", "larmhub"),
        password=os.getenv("DB_PASSWORD"),
    )


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
    return None if s in ("", "nan", "None", "#N/D", "#N/A") else s


def safe_num(v):
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(v, str):
        s = v.strip()
        if s in ("", "nan", "None", "#N/D", "#N/A"):
            return None
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
    try:
        return float(v)
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
            return pd.to_datetime(v, unit="D", origin="1899-12-30").date()
        except Exception:
            pass
    try:
        return pd.to_datetime(v, dayfirst=True).date()
    except Exception:
        return None


def normalize_key(value):
    s = safe_str(value) or ""
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^A-Za-z0-9]+", " ", s.upper()).strip()
    s = re.sub(r"\b(LTDA|ME|EPP|EIRELI|S A|SA|CPF|CNPJ)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def hash_row(*values):
    raw = "|".join(str(v or "") for v in values)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def get_or_create_fornecedor(cur, nome):
    nome = safe_str(nome) or "Fornecedor não identificado"
    key = normalize_key(nome)

    cur.execute(
        """
        SELECT id
          FROM fin_fornecedores
         WHERE UPPER(TRIM(COALESCE(razao_social, ''))) = UPPER(TRIM(%s))
            OR UPPER(TRIM(COALESCE(nome_fantasia, ''))) = UPPER(TRIM(%s))
         LIMIT 1
        """,
        (nome, nome),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute(
        """
        INSERT INTO fin_fornecedores
          (razao_social, nome_fantasia, tipo_pessoa, categoria, empresa, tipo_conta, obs, ativo)
        VALUES (%s, %s, 'PJ', 'Não classificado', 'TODOS', 'Corrente', %s, true)
        RETURNING id
        """,
        (
            nome,
            nome,
            f"Criado automaticamente pela importação de contas a pagar futuras. Dados cadastrais pendentes. Chave: {key}",
        ),
    )
    return cur.fetchone()[0]


def find_banco_conta(cur, empresa, banco):
    empresa = (safe_str(empresa) or "").upper().strip()
    banco = safe_str(banco) or ""
    banco_key = normalize_key(banco)
    if not empresa or not banco_key:
        return None

    aliases = {
        "BRADESCO": "BRADESCO",
        "ITAU": "ITA",
        "ITAÚ": "ITA",
        "DAYCOVAL": "DAYCOVAL",
        "CAIXA": "CAIXA",
        "SANTANDER": "SANTANDER",
        "BANCO DO BRASIL": "BRASIL",
    }
    token = next((v for k, v in aliases.items() if k in banco_key), banco_key.split()[0])

    cur.execute(
        """
        SELECT id
          FROM fin_bancos_contas
         WHERE UPPER(TRIM(COALESCE(empresa, ''))) = %s
           AND UPPER(COALESCE(banco_nome, '')) ILIKE %s
           AND ativo = true
         ORDER BY id
         LIMIT 1
        """,
        (empresa, f"%{token}%"),
    )
    row = cur.fetchone()
    return row[0] if row else None


def limpar_importados(cur, data_de, data_ate):
    params = [SOURCE_PREFIX + "%"]
    cond = ["COALESCE(l.obs, '') LIKE %s"]
    if data_de:
        params.append(data_de)
        cond.append(f"p.vencimento >= %s")
    if data_ate:
        params.append(data_ate)
        cond.append(f"p.vencimento <= %s")

    where = " AND ".join(cond)
    cur.execute(
        f"""
        SELECT DISTINCT l.id
          FROM fin_lancamentos_cp l
          JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
         WHERE {where}
           AND COALESCE(p.status, 'pendente') <> 'pago'
           AND p.movimento_id IS NULL
        """,
        params,
    )
    ids = [r[0] for r in cur.fetchall()]
    if ids:
        cur.execute("DELETE FROM fin_lancamentos_cp WHERE id = ANY(%s)", (ids,))
    return len(ids)


def load_rows(xlsx_path, ano=None, data_de=None, data_ate=None):
    xls = pd.ExcelFile(xlsx_path)
    sheet = "Movimento" if "Movimento" in xls.sheet_names else xls.sheet_names[0]
    df = pd.read_excel(xlsx_path, sheet_name=sheet, dtype={"NF/DOC": str, "N. Cheque": str, "Natureza Financeira": str})
    df = normalize_headers(df).dropna(how="all")

    rows = []
    for idx, r in df.iterrows():
        venc = safe_date(get_val(r, "Data"))
        if not venc:
            continue
        if ano and venc.year != ano:
            continue
        if data_de and venc < data_de:
            continue
        if data_ate and venc > data_ate:
            continue

        saida = safe_num(get_val(r, "Saídas")) or 0
        if abs(saida) < 0.001:
            continue

        valor = abs(saida)
        empresa = (safe_str(get_val(r, "Empresa")) or "LARM").upper().strip()
        fornecedor = safe_str(get_val(r, "Fornecedor")) or "Fornecedor não identificado"
        historico = safe_str(get_val(r, "Histórico")) or fornecedor
        nf_doc = safe_str(get_val(r, "NF/DOC")) or f"FUT-{venc.strftime('%Y%m%d')}-{idx + 2}"
        emissao = safe_date(get_val(r, "Emissão DOC")) or venc
        conta_codigo = safe_str(get_val(r, "Natureza Financeira"))
        conta_desc = safe_str(get_val(r, "Conta Contábil"))
        centro = safe_str(get_val(r, "Centro de Custo"))
        obra = safe_str(get_val(r, "Obra"))
        n_cheque = safe_str(get_val(r, "N. Cheque"))
        banco = safe_str(get_val(r, "Banco"))
        origem_hash = hash_row(empresa, fornecedor, historico, nf_doc, venc.isoformat(), valor, conta_codigo, idx + 2)

        rows.append({
            "row_excel": idx + 2,
            "empresa": empresa,
            "banco": banco,
            "fornecedor": fornecedor,
            "historico": historico,
            "nf_doc": nf_doc,
            "emissao": emissao,
            "vencimento": venc,
            "valor": round(valor, 4),
            "conta_codigo": conta_codigo,
            "conta_desc": conta_desc,
            "centro_custo": centro,
            "obra": obra,
            "n_cheque": n_cheque,
            "hash": origem_hash,
        })
    return rows


def importar(xlsx_path, ano=None, data_de=None, data_ate=None, limpar=False):
    rows = load_rows(xlsx_path, ano=ano, data_de=data_de, data_ate=data_ate)
    print(f"Linhas elegíveis para Contas a Pagar: {len(rows)}")

    conn = get_conn()
    cur = conn.cursor()
    inserted = 0
    skipped = 0
    removed = 0

    try:
        conn.autocommit = False
        if limpar:
            removed = limpar_importados(cur, data_de, data_ate)
            print(f"Importações pendentes removidas: {removed}")

        for item in rows:
            fornecedor_id = get_or_create_fornecedor(cur, item["fornecedor"])
            banco_conta_id = find_banco_conta(cur, item["empresa"], item["banco"])
            obs = (
                f"{SOURCE_PREFIX}. Linha Excel: {item['row_excel']}. Hash: {item['hash']}. "
                "Este registro entra como pendente e só gera movimento bancário quando for baixado/pago."
            )

            cur.execute(
                """
                SELECT l.id
                  FROM fin_lancamentos_cp l
                  JOIN fin_parcelas_cp p ON p.lancamento_id = l.id
                 WHERE l.empresa = %s
                   AND l.fornecedor_id = %s
                   AND COALESCE(l.nf_doc, '') = %s
                   AND COALESCE(l.historico, '') = %s
                   AND p.vencimento = %s
                   AND ABS(COALESCE(p.valor, 0) - %s) < 0.01
                 LIMIT 1
                """,
                (
                    item["empresa"], fornecedor_id, item["nf_doc"], item["historico"],
                    item["vencimento"], item["valor"],
                ),
            )
            if cur.fetchone():
                skipped += 1
                continue

            cur.execute(
                """
                INSERT INTO fin_lancamentos_cp
                  (empresa, fornecedor_id, banco_conta_id, conta_contabil, descricao_conta,
                   historico, produto_servico, nf_doc, dt_emissao, valor_total, qtd_parcelas,
                   status, centro_custo, obra, n_cheque, obs)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,'pendente',%s,%s,%s,%s)
                RETURNING id
                """,
                (
                    item["empresa"], fornecedor_id, banco_conta_id, item["conta_codigo"], item["conta_desc"],
                    item["historico"], item["conta_desc"], item["nf_doc"], item["emissao"], item["valor"],
                    item["centro_custo"], item["obra"], item["n_cheque"], obs,
                ),
            )
            lancamento_id = cur.fetchone()[0]
            cur.execute(
                """
                INSERT INTO fin_parcelas_cp
                  (lancamento_id, numero, valor, vencimento, status, acrescimo, desconto, juros, multa, valor_final)
                VALUES (%s, 1, %s, %s, 'pendente', 0, 0, 0, 0, %s)
                """,
                (lancamento_id, item["valor"], item["vencimento"], item["valor"]),
            )
            inserted += 1

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    print(f"Importados: {inserted}")
    print(f"Duplicados ignorados: {skipped}")
    print("Movimento bancário: 0 registros criados por este script")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    flags = [a for a in sys.argv[2:] if a.startswith("--")]
    ano = next((int(f.split("=", 1)[1]) for f in flags if f.startswith("--ano=")), None)
    data_de = next((safe_date(f.split("=", 1)[1]) for f in flags if f.startswith("--de=")), None)
    data_ate = next((safe_date(f.split("=", 1)[1]) for f in flags if f.startswith("--ate=")), None)
    limpar = "--limpar-importados" in flags

    importar(sys.argv[1], ano=ano, data_de=data_de, data_ate=data_ate, limpar=limpar)
