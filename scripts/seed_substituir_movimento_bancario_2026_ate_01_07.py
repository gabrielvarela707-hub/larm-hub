#!/usr/bin/env python3
"""
Substituição controlada do Movimento Bancário realizado de 2026 até 01/07/2026.

Segurança:
- prévia por padrão;
- aceita somente a planilha validada pelo SHA-256;
- exige o estado do banco analisado (2.249 importados + 11 protegidos);
- preserva todos os registros sem lote_importacao;
- reconcilia 3 linhas da planilha com movimentos já vinculados ao Contas a Pagar;
- verifica referências antes de remover o lote anterior;
- gera backup JSON compactado e backup transacional no banco;
- usa transação, lock e validações finais antes do COMMIT.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

try:
    import pandas as pd
    from dotenv import load_dotenv
except ImportError as exc:
    print(
        "Dependência ausente para ler a planilha (pandas, openpyxl e python-dotenv).\n"
        f"Detalhe: {exc}",
        file=sys.stderr,
    )
    raise SystemExit(1)

try:
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import RealDictCursor, execute_values
except ImportError:
    psycopg2 = None
    sql = None
    RealDictCursor = None
    execute_values = None

load_dotenv()

YEAR = 2026
CUTOFF = date(2026, 7, 1)
SOURCE_NAME = "movimento-bancario-2026-larmhub-01-07.xlsx"
SOURCE_SHA256 = "dca0081529c42181d8f34c57ad6b4662d37d600666d32fc7babe98264ac51c05"
OLD_LOT = "MOV-2026-20260617220743"
OLD_FILE = "movimento-bancario-2026-atualizado.xlsx"

EXPECTED = {
    "source_all_year": 3727,
    "source_through_cutoff": 2372,
    "source_after_cutoff": 1355,
    "source_insert": 2369,
    "source_insert_entries": Decimal("6852733.7120"),
    "source_insert_outflows": Decimal("8426215.0620"),
    "current_imported": 2249,
    "current_imported_entries": Decimal("6357965.3920"),
    "current_imported_outflows": Decimal("8085657.9620"),
    "current_protected": 11,
    "current_protected_entries": Decimal("1671297.2200"),
    "current_protected_outflows": Decimal("102730.9900"),
    "final_count": 2380,
    "final_entries": Decimal("8524030.9320"),
    "final_outflows": Decimal("8528946.0520"),
}

PROTECTED_IDS = {
    98041, 98042, 98043, 98044, 98045, 98046,
    98047, 98048, 98049, 98050, 98051,
}

# Linhas já representadas por movimentos vinculados ao Contas a Pagar.
# Elas são retiradas da inserção e aplicadas nos IDs existentes, mantendo os vínculos.
RECONCILIATIONS = {
    1671: {
        "movement_id": 98050,
        "expected_source": {
            "data": date(2026, 5, 4),
            "empresa": "LARM",
            "saidas": Decimal("40131.6500"),
            "fornecedor": "Amil Assistencia Medica Internacional S/A",
            "natureza": "4.12.2",
        },
        "expected_current": {
            "data": date(2026, 5, 1),
            "saidas": Decimal("40131.6500"),
            "fornecedor_id": 807,
            "banco_conta_id": 1,
        },
    },
    2017: {
        "movement_id": 98051,
        "expected_source": {
            "data": date(2026, 6, 1),
            "empresa": "LARM",
            "saidas": Decimal("40131.6500"),
            "fornecedor": "Amil Assistencia Medica Internacional S/A",
            "natureza": "4.12.2",
        },
        "expected_current": {
            "data": date(2026, 6, 1),
            "saidas": Decimal("40131.6500"),
            "fornecedor_id": 807,
            "banco_conta_id": 1,
        },
    },
    2293: {
        "movement_id": 98049,
        "expected_source": {
            "data": date(2026, 6, 23),
            "empresa": "LUCKY",
            "saidas": Decimal("850.4400"),
            "fornecedor": "Serasa S/A",
            "natureza": "4.8.2",
        },
        "expected_current": {
            "data": date(2026, 6, 12),
            "saidas": Decimal("850.4400"),
            "fornecedor_id": 698,
            "banco_conta_id": 2,
        },
    },
}

ALIASES = {
    "Data": ["Data", "DATA"],
    "Empresa": ["Empresa", "EMPRESA"],
    "Banco": ["Banco", "BANCO"],
    "Entradas": ["Entradas", "Entrada", "ENTRADAS"],
    "Saídas": ["Saídas", "Saidas", "Saída", "Saida", "SAÍDAS", "SAIDAS"],
    "Fornecedor": ["Fornecedor", "FORNECEDOR"],
    "Histórico": ["Histórico", "Historico", "HISTÓRICO", "HISTORICO"],
    "NF/DOC": ["NF/DOC", "NF DOC", "NF_DOC", "Documento", "DOCUMENTO"],
    "Emissão DOC": ["Emissão DOC", "Emissao DOC", "Emissão", "Emissao", "Data Emissão", "Data Emissao"],
    "Conta Contábil": ["Conta Contábil", "Conta Contabil", "CONTA CONTÁBIL", "CONTA CONTABIL"],
    "Centro de Custo": ["Centro de Custo", "CENTRO DE CUSTO"],
    "Obra": ["Obra", "OBRA"],
    "Natureza Financeira": ["Natureza Financeira", "NATUREZA FINANCEIRA", "Natureza"],
    "N. Cheque": ["N. Cheque", "N Cheque", "Cheque", "Nº Cheque"],
    "Saldo": ["Saldo", "SALDO"],
}
REQUIRED_COLUMNS = [
    "Data", "Empresa", "Entradas", "Saídas", "Histórico",
    "Conta Contábil", "Natureza Financeira",
]
DESC_OVERRIDE = {"CONTRIBUICAO SINDICAL": "4.1.8"}


def connect():
    if psycopg2 is None:
        raise RuntimeError(
            "Dependência psycopg2 ausente. Use o mesmo ambiente Python dos imports do LarmHub "
            "ou instale psycopg2-binary."
        )
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "larmhub_prod"),
        user=os.getenv("DB_USER", "larmhub"),
        password=os.getenv("DB_PASSWORD"),
        sslmode="require" if os.getenv("DB_SSL") == "true" else "prefer",
    )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = re.sub(r"\s+", " ", str(value).strip())
    return None if text in ("", "nan", "None", "#N/D", "#N/A") else text


def normalized_text(value: Any) -> str:
    text = clean_text(value) or ""
    text = "".join(
        ch for ch in unicodedata.normalize("NFD", text.upper())
        if unicodedata.category(ch) != "Mn"
    )
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", text)).strip()


def decimal_value(value: Any) -> Decimal:
    if value is None:
        return Decimal("0.0000")
    try:
        if pd.isna(value):
            return Decimal("0.0000")
    except Exception:
        pass
    if isinstance(value, str):
        text = value.strip()
        if text in ("", "nan", "None", "#N/D", "#N/A"):
            return Decimal("0.0000")
        if "," in text:
            text = text.replace(".", "").replace(",", ".")
    else:
        text = str(value)
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise RuntimeError(f"Valor numérico inválido: {value!r}") from exc
    if not number.is_finite():
        return Decimal("0.0000")
    return number.quantize(Decimal("0.0001"))


def date_value(value: Any) -> date | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and value > 20000:
        parsed = pd.to_datetime(value, unit="D", origin="1899-12-30", errors="coerce")
    else:
        parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")
    return None if pd.isna(parsed) else parsed.date()


def code_value(value: Any) -> str | None:
    text = clean_text(value)
    if not text or text in ("0", "-", "#N/A", "#N/D"):
        return None
    return re.sub(r"\s+", "", text.replace(",", "."))


def normalize_headers(frame: pd.DataFrame) -> pd.DataFrame:
    frame = frame.copy()
    frame.columns = [str(col).strip() for col in frame.columns]
    existing = {str(col).strip().lower(): col for col in frame.columns}
    rename = {}
    for canonical, options in ALIASES.items():
        for option in options:
            if option.lower() in existing:
                rename[existing[option.lower()]] = canonical
                break
    return frame.rename(columns=rename)


def read_plan_codes(path: Path) -> tuple[set[str], dict[str, list[str]]]:
    frame = pd.read_excel(path, sheet_name="Estrutura", dtype=object)
    codes: set[str] = set()
    by_description: dict[str, list[str]] = defaultdict(list)
    for _, row in frame.iterrows():
        code = code_value(row.iloc[1] if len(row) > 1 else None)
        description = clean_text(row.iloc[2] if len(row) > 2 else None)
        if not code:
            continue
        codes.add(code)
        if description:
            by_description[normalized_text(description)].append(code)
    return codes, by_description


def row_hash(row: dict[str, Any]) -> str:
    payload = {
        key: (
            value.isoformat() if isinstance(value, date)
            else str(value) if isinstance(value, Decimal)
            else value
        )
        for key, value in row.items()
        if key not in ("line", "hash")
    }
    encoded = json.dumps(
        payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def read_source(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    actual_hash = sha256_file(path)
    if actual_hash != SOURCE_SHA256:
        raise RuntimeError(
            "A planilha não é a versão validada. "
            f"SHA esperado: {SOURCE_SHA256}; encontrado: {actual_hash}."
        )

    plan_codes, plan_by_description = read_plan_codes(path)
    frame = normalize_headers(
        pd.read_excel(
            path,
            sheet_name="Movimento",
            dtype={"NF/DOC": object, "N. Cheque": object, "Natureza Financeira": object},
        )
    ).dropna(how="all")

    missing = [name for name in REQUIRED_COLUMNS if name not in frame.columns]
    if missing:
        raise RuntimeError(f"Colunas ausentes na planilha: {', '.join(missing)}")

    all_year: list[dict[str, Any]] = []
    through_cutoff: list[dict[str, Any]] = []
    after_cutoff = 0
    invalid: list[str] = []

    for index, source in frame.iterrows():
        line = int(index) + 2
        movement_date = date_value(source.get("Data"))
        entries = decimal_value(source.get("Entradas"))
        outflows = decimal_value(source.get("Saídas"))
        history = clean_text(source.get("Histórico"))

        if movement_date is None and entries == 0 and outflows == 0 and not history:
            continue
        if movement_date is None or movement_date.year != YEAR:
            continue

        nature = code_value(source.get("Natureza Financeira"))
        account = clean_text(source.get("Conta Contábil"))
        if nature not in plan_codes:
            candidates = plan_by_description.get(normalized_text(account), [])
            chosen = DESC_OVERRIDE.get(normalized_text(account))
            if chosen in plan_codes:
                nature = chosen
            elif len(candidates) == 1:
                nature = candidates[0]
            else:
                invalid.append(
                    f"linha {line}: natureza={nature!r}, conta={account!r}, candidatos={candidates}"
                )
                continue

        row = {
            "line": line,
            "data": movement_date,
            "empresa": (clean_text(source.get("Empresa")) or "SEM_EMPRESA").upper(),
            "banco": clean_text(source.get("Banco")),
            "entradas": entries,
            "saidas": outflows,
            "fornecedor": clean_text(source.get("Fornecedor")),
            "historico": history,
            "nf_doc": clean_text(source.get("NF/DOC")),
            "emissao_doc": date_value(source.get("Emissão DOC")),
            "conta_contabil": account,
            "centro_custo": clean_text(source.get("Centro de Custo")),
            "obra": clean_text(source.get("Obra")),
            "natureza": nature,
            "n_cheque": clean_text(source.get("N. Cheque")),
            # Sempre derivados da data principal; nunca usa as fórmulas auxiliares da planilha.
            "dia": movement_date.day,
            "mes": movement_date.month,
            "ano": YEAR,
            "saldo": decimal_value(source.get("Saldo")),
            "tipo": "financeiro",
        }
        row["hash"] = row_hash(row)
        all_year.append(row)
        if movement_date <= CUTOFF:
            through_cutoff.append(row)
        else:
            after_cutoff += 1

    if invalid:
        sample = "\n".join(invalid[:20])
        raise RuntimeError(f"Planilha possui {len(invalid)} linha(s) inválida(s):\n{sample}")

    if len(all_year) != EXPECTED["source_all_year"]:
        raise RuntimeError(
            f"Total anual divergente: esperado {EXPECTED['source_all_year']}, encontrado {len(all_year)}."
        )
    if len(through_cutoff) != EXPECTED["source_through_cutoff"]:
        raise RuntimeError(
            "Total até 01/07 divergente: "
            f"esperado {EXPECTED['source_through_cutoff']}, encontrado {len(through_cutoff)}."
        )
    if after_cutoff != EXPECTED["source_after_cutoff"]:
        raise RuntimeError(
            f"Total após 01/07 divergente: esperado {EXPECTED['source_after_cutoff']}, encontrado {after_cutoff}."
        )

    by_line = {row["line"]: row for row in through_cutoff}
    for line, reconciliation in RECONCILIATIONS.items():
        row = by_line.get(line)
        if row is None:
            raise RuntimeError(f"Linha de reconciliação {line} não foi encontrada.")
        expected = reconciliation["expected_source"]
        for field, value in expected.items():
            source_field = "natureza" if field == "natureza" else field
            if row[source_field] != value:
                raise RuntimeError(
                    f"Linha {line} divergente em {field}: esperado {value!r}, encontrado {row[source_field]!r}."
                )

    insert_rows = [row for row in through_cutoff if row["line"] not in RECONCILIATIONS]
    entries = sum((row["entradas"] for row in insert_rows), Decimal("0"))
    outflows = sum((row["saidas"] for row in insert_rows), Decimal("0"))

    if len(insert_rows) != EXPECTED["source_insert"]:
        raise RuntimeError(
            f"Linhas para inserir divergentes: esperado {EXPECTED['source_insert']}, encontrado {len(insert_rows)}."
        )
    if entries != EXPECTED["source_insert_entries"] or outflows != EXPECTED["source_insert_outflows"]:
        raise RuntimeError(
            "Totais da planilha divergentes. "
            f"Entradas {entries} / Saídas {outflows}."
        )

    return insert_rows, [by_line[line] for line in RECONCILIATIONS], after_cutoff


def money(value: Decimal | Any) -> str:
    number = Decimal(str(value or 0)).quantize(Decimal("0.01"))
    formatted = f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def totals(rows: list[dict[str, Any]]) -> tuple[int, Decimal, Decimal]:
    return (
        len(rows),
        sum((row["entradas"] for row in rows), Decimal("0")),
        sum((row["saidas"] for row in rows), Decimal("0")),
    )


def query_stats(cursor, condition: str, params: tuple[Any, ...] = ()) -> dict[str, Any]:
    cursor.execute(
        f"""
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(entradas), 0)::numeric AS entries,
               COALESCE(SUM(saidas), 0)::numeric AS outflows,
               MIN(data) AS min_date,
               MAX(data) AS max_date
          FROM fin_movimento
         WHERE {condition}
        """,
        params,
    )
    return dict(cursor.fetchone())


def decimal_db(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.0001"))


def assert_stats(label: str, actual: dict[str, Any], count: int, entries: Decimal, outflows: Decimal):
    if int(actual["count"]) != count:
        raise RuntimeError(f"{label}: quantidade esperada {count}, encontrada {actual['count']}.")
    if decimal_db(actual["entries"]) != entries or decimal_db(actual["outflows"]) != outflows:
        raise RuntimeError(
            f"{label}: totais divergentes. "
            f"Entradas {actual['entries']} / Saídas {actual['outflows']}."
        )


def check_references(cursor):
    cursor.execute(
        """
        SELECT table_schema, table_name
          FROM information_schema.columns
         WHERE column_name = 'movimento_id'
           AND table_schema NOT IN ('pg_catalog', 'information_schema')
           AND table_name <> 'fin_movimento'
         ORDER BY table_schema, table_name
        """
    )
    conflicts = []
    for reference in cursor.fetchall():
        table_schema = reference["table_schema"]
        table_name = reference["table_name"]
        statement = sql.SQL("""
            SELECT COUNT(*)::int AS count
              FROM {}.{} ref
              JOIN fin_movimento mov ON mov.id = ref.movimento_id
             WHERE COALESCE(mov.ano, EXTRACT(YEAR FROM mov.data)::int) = %s
               AND NULLIF(BTRIM(mov.lote_importacao), '') IS NOT NULL
        """).format(sql.Identifier(table_schema), sql.Identifier(table_name))
        cursor.execute(statement, (YEAR,))
        count = int(cursor.fetchone()["count"])
        if count:
            conflicts.append(f"{table_schema}.{table_name}: {count}")
    if conflicts:
        raise RuntimeError(
            "O lote importado passou a ter vínculos e não pode ser substituído automaticamente: "
            + ", ".join(conflicts)
        )


def fetch_current_state(cursor) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    imported = query_stats(
        cursor,
        "COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s "
        "AND NULLIF(BTRIM(lote_importacao), '') IS NOT NULL",
        (YEAR,),
    )
    protected = query_stats(
        cursor,
        "COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s "
        "AND NULLIF(BTRIM(lote_importacao), '') IS NULL",
        (YEAR,),
    )
    assert_stats(
        "Lote importado atual",
        imported,
        EXPECTED["current_imported"],
        EXPECTED["current_imported_entries"],
        EXPECTED["current_imported_outflows"],
    )
    assert_stats(
        "Registros protegidos",
        protected,
        EXPECTED["current_protected"],
        EXPECTED["current_protected_entries"],
        EXPECTED["current_protected_outflows"],
    )

    cursor.execute(
        """
        SELECT DISTINCT lote_importacao, arquivo_origem
          FROM fin_movimento
         WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s
           AND NULLIF(BTRIM(lote_importacao), '') IS NOT NULL
        """,
        (YEAR,),
    )
    lots = [(row["lote_importacao"], row["arquivo_origem"]) for row in cursor.fetchall()]
    if lots != [(OLD_LOT, OLD_FILE)]:
        raise RuntimeError(f"Lote atual divergente do analisado: {lots!r}.")

    cursor.execute(
        """
        SELECT id, data, empresa, banco, entradas, saidas, fornecedor, historico,
               nf_doc, conta_contabil, centro_custo, obra, natureza_financeira,
               n_cheque, dia, mes, ano, saldo, created_at, tipo_lancamento,
               vencimento, fornecedor_id, banco_conta_id, emissao_doc,
               lote_importacao, arquivo_origem, linha_origem, hash_importacao, importado_em
          FROM fin_movimento
         WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s
           AND NULLIF(BTRIM(lote_importacao), '') IS NULL
         ORDER BY id
        """,
        (YEAR,),
    )
    protected_rows = [dict(row) for row in cursor.fetchall()]
    ids = {int(row["id"]) for row in protected_rows}
    if ids != PROTECTED_IDS:
        raise RuntimeError(
            f"IDs protegidos divergentes. Esperados {sorted(PROTECTED_IDS)}; encontrados {sorted(ids)}."
        )

    by_id = {int(row["id"]): row for row in protected_rows}
    for reconciliation in RECONCILIATIONS.values():
        movement_id = reconciliation["movement_id"]
        current = by_id[movement_id]
        expected = reconciliation["expected_current"]
        for field, value in expected.items():
            actual = current[field]
            if field == "saidas":
                actual = decimal_db(actual)
            if actual != value:
                raise RuntimeError(
                    f"Movimento protegido {movement_id} divergente em {field}: "
                    f"esperado {value!r}, encontrado {actual!r}."
                )

        cursor.execute(
            "SELECT COUNT(*)::int AS count FROM fin_parcelas_cp WHERE movimento_id = %s",
            (movement_id,),
        )
        if int(cursor.fetchone()["count"]) != 1:
            raise RuntimeError(
                f"Movimento protegido {movement_id} não possui exatamente um vínculo em fin_parcelas_cp."
            )

    check_references(cursor)
    return imported, protected, protected_rows


def monthly_summary(rows: list[dict[str, Any]], protected_rows: list[dict[str, Any]]):
    months: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"count": 0, "entries": Decimal("0"), "outflows": Decimal("0")}
    )
    for row in rows:
        month = row["data"].strftime("%Y-%m")
        months[month]["count"] += 1
        months[month]["entries"] += row["entradas"]
        months[month]["outflows"] += row["saidas"]
    for row in protected_rows:
        month = row["data"].strftime("%Y-%m")
        months[month]["count"] += 1
        months[month]["entries"] += decimal_db(row["entradas"])
        months[month]["outflows"] += decimal_db(row["saidas"])

    print("\nResultado previsto por mês (inclui os 11 protegidos):")
    print("Mês      Registros        Entradas            Saídas")
    for month in sorted(months):
        item = months[month]
        print(
            f"{month}   {int(item['count']):>8}   "
            f"{money(item['entries']):>17}   {money(item['outflows']):>17}"
        )


def json_safe(value: Any):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f"Tipo não serializável: {type(value).__name__}")


def create_external_backup(cursor, lot_id: str, script_dir: Path) -> Path:
    cursor.execute(
        """
        SELECT *
          FROM fin_movimento
         WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s
           AND (
                lote_importacao = %s
                OR id = ANY(%s)
           )
         ORDER BY id
        """,
        (YEAR, OLD_LOT, list(sorted({item["movement_id"] for item in RECONCILIATIONS.values()}))),
    )
    rows = [dict(row) for row in cursor.fetchall()]
    if len(rows) != EXPECTED["current_imported"] + len(RECONCILIATIONS):
        raise RuntimeError(
            f"Backup externo teria {len(rows)} registros; esperado "
            f"{EXPECTED['current_imported'] + len(RECONCILIATIONS)}."
        )
    backup_dir = script_dir / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    path = backup_dir / f"{lot_id}-antes.json.gz"
    payload = {
        "lote_novo": lot_id,
        "gerado_em": datetime.utcnow().isoformat() + "Z",
        "ano": YEAR,
        "corte": CUTOFF.isoformat(),
        "lote_removido": OLD_LOT,
        "registros": rows,
    }
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2, default=json_safe)
    return path


def backup_to_database(cursor, lot_id: str) -> tuple[int, int]:
    cursor.execute(
        """
        INSERT INTO fin_importacao_backup(lote_id, tabela_origem, registro_id, dados)
        SELECT %s, 'fin_movimento', id, to_jsonb(mov)
          FROM fin_movimento mov
         WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s
           AND lote_importacao = %s
        """,
        (lot_id, YEAR, OLD_LOT),
    )
    imported_backed = cursor.rowcount

    protected_ids = sorted({item["movement_id"] for item in RECONCILIATIONS.values()})
    cursor.execute(
        """
        INSERT INTO fin_importacao_backup(lote_id, tabela_origem, registro_id, dados)
        SELECT %s, 'fin_movimento_reconciliado', id, to_jsonb(mov)
          FROM fin_movimento mov
         WHERE id = ANY(%s)
        """,
        (lot_id, protected_ids),
    )
    protected_backed = cursor.rowcount
    return imported_backed, protected_backed


def insert_rows(cursor, rows: list[dict[str, Any]], lot_id: str, source_name: str):
    now = datetime.utcnow()
    values = []
    for row in rows:
        values.append(
            (
                row["data"], row["empresa"], row["banco"],
                row["entradas"] if row["entradas"] != 0 else None,
                row["saidas"] if row["saidas"] != 0 else None,
                row["fornecedor"], row["historico"], row["nf_doc"],
                row["conta_contabil"], row["centro_custo"], row["obra"],
                row["natureza"], row["n_cheque"], row["dia"], row["mes"],
                row["ano"], row["saldo"], row["tipo"], row["emissao_doc"],
                lot_id, source_name, row["line"], row["hash"], now,
            )
        )
    execute_values(
        cursor,
        """
        INSERT INTO fin_movimento(
            data, empresa, banco, entradas, saidas, fornecedor, historico, nf_doc,
            conta_contabil, centro_custo, obra, natureza_financeira, n_cheque,
            dia, mes, ano, saldo, tipo_lancamento, emissao_doc,
            lote_importacao, arquivo_origem, linha_origem, hash_importacao, importado_em
        ) VALUES %s
        """,
        values,
        page_size=500,
    )


def reconcile_protected(cursor, source_rows: list[dict[str, Any]]):
    by_line = {row["line"]: row for row in source_rows}
    for line, config in RECONCILIATIONS.items():
        row = by_line[line]
        movement_id = config["movement_id"]
        # Campos de vínculo, vencimento e documento existente são preservados.
        # NF/DOC e Emissão DOC só mudam quando a planilha traz valor explícito.
        cursor.execute(
            """
            UPDATE fin_movimento
               SET data = %s,
                   empresa = %s,
                   banco = %s,
                   entradas = %s,
                   saidas = %s,
                   fornecedor = %s,
                   historico = %s,
                   nf_doc = COALESCE(%s, nf_doc),
                   conta_contabil = %s,
                   centro_custo = %s,
                   obra = %s,
                   natureza_financeira = %s,
                   n_cheque = %s,
                   dia = %s,
                   mes = %s,
                   ano = %s,
                   saldo = %s,
                   emissao_doc = COALESCE(%s, emissao_doc)
             WHERE id = %s
               AND NULLIF(BTRIM(lote_importacao), '') IS NULL
            """,
            (
                row["data"], row["empresa"], row["banco"],
                row["entradas"] if row["entradas"] != 0 else None,
                row["saidas"] if row["saidas"] != 0 else None,
                row["fornecedor"], row["historico"], row["nf_doc"],
                row["conta_contabil"], row["centro_custo"], row["obra"],
                row["natureza"], row["n_cheque"], row["dia"], row["mes"],
                row["ano"], row["saldo"], row["emissao_doc"], movement_id,
            ),
        )
        if cursor.rowcount != 1:
            raise RuntimeError(f"Falha ao reconciliar o movimento protegido {movement_id}.")


def verify_final(cursor, lot_id: str):
    inserted = query_stats(cursor, "lote_importacao = %s", (lot_id,))
    assert_stats(
        "Novo lote",
        inserted,
        EXPECTED["source_insert"],
        EXPECTED["source_insert_entries"],
        EXPECTED["source_insert_outflows"],
    )

    current = query_stats(
        cursor,
        "COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s",
        (YEAR,),
    )
    assert_stats(
        "Movimento 2026 após atualização",
        current,
        EXPECTED["final_count"],
        EXPECTED["final_entries"],
        EXPECTED["final_outflows"],
    )

    cursor.execute(
        "SELECT COUNT(*)::int AS count FROM fin_movimento WHERE lote_importacao = %s",
        (OLD_LOT,),
    )
    if int(cursor.fetchone()["count"]) != 0:
        raise RuntimeError("O lote anterior ainda possui registros após a substituição.")

    cursor.execute(
        "SELECT COUNT(*)::int AS count FROM fin_movimento WHERE lote_importacao = %s AND data > %s",
        (lot_id, CUTOFF),
    )
    if int(cursor.fetchone()["count"]) != 0:
        raise RuntimeError("O novo lote contém registros posteriores a 01/07/2026.")

    cursor.execute(
        """
        SELECT COUNT(*)::int AS count
          FROM fin_movimento
         WHERE id = ANY(%s)
           AND NULLIF(BTRIM(lote_importacao), '') IS NULL
        """,
        (sorted({item["movement_id"] for item in RECONCILIATIONS.values()}),),
    )
    if int(cursor.fetchone()["count"]) != len(RECONCILIATIONS):
        raise RuntimeError("Um ou mais movimentos reconciliados perderam a proteção/vínculo.")


def run(args):
    script_dir = Path(__file__).resolve().parent
    source_path = Path(args.arquivo).resolve() if args.arquivo else script_dir / "imports" / SOURCE_NAME
    if not source_path.exists():
        raise RuntimeError(f"Planilha não encontrada: {source_path}")

    insertable, reconciliation_rows, ignored_after = read_source(source_path)
    source_count, source_entries, source_outflows = totals(insertable)

    print("=" * 76)
    print("MOVIMENTO BANCÁRIO 2026 — SUBSTITUIÇÃO SEGURA ATÉ 01/07/2026")
    print("=" * 76)
    print(f"Planilha validada: {source_path.name}")
    print(f"SHA-256: {SOURCE_SHA256}")
    print(f"Linhas até o corte: {EXPECTED['source_through_cutoff']}")
    print(f"Linhas reconciliadas com Contas a Pagar: {len(RECONCILIATIONS)}")
    print(f"Linhas que serão inseridas: {source_count}")
    print(f"Entradas do novo lote: {money(source_entries)}")
    print(f"Saídas do novo lote: {money(source_outflows)}")
    print(f"Linhas posteriores ao corte ignoradas: {ignored_after}")

    if args.validar_arquivo:
        print("\n✅ Arquivo validado. Banco de dados não foi acessado.")
        return

    connection = connect()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            imported, protected, protected_rows = fetch_current_state(cursor)
            print("\nBanco atual validado:")
            print(
                f"- lote anterior: {imported['count']} registros | "
                f"entradas {money(imported['entries'])} | saídas {money(imported['outflows'])}"
            )
            print(
                f"- protegidos: {protected['count']} registros | "
                f"entradas {money(protected['entries'])} | saídas {money(protected['outflows'])}"
            )
            print("- referências no lote removível: nenhuma")

            monthly_summary(insertable, protected_rows)

            print("\nReconciliações preservando IDs e vínculos:")
            for line, config in RECONCILIATIONS.items():
                source = next(row for row in reconciliation_rows if row["line"] == line)
                print(
                    f"- linha {line} -> movimento {config['movement_id']}: "
                    f"{source['data'].strftime('%d/%m/%Y')} | "
                    f"{source['fornecedor']} | {money(source['saidas'])}"
                )

            print("\nResultado final previsto:")
            print(f"- registros: {EXPECTED['final_count']}")
            print(f"- entradas: {money(EXPECTED['final_entries'])}")
            print(f"- saídas: {money(EXPECTED['final_outflows'])}")
            print(
                f"- saldo líquido: {money(EXPECTED['final_entries'] - EXPECTED['final_outflows'])}"
            )

            if not args.execute:
                print("\nModo prévia: nenhum registro foi alterado.")
                print(
                    "Após conferir, execute com: "
                    "--execute --confirmar=2380"
                )
                return

            if args.confirmar != EXPECTED["final_count"]:
                raise RuntimeError(
                    "Confirmação inválida. Use exatamente --confirmar=2380."
                )

        # Encerra a transação somente de leitura da prévia e inicia a execução exclusiva.
        connection.rollback()
        connection.autocommit = False
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("BEGIN")
            cursor.execute("SELECT pg_try_advisory_xact_lock(202607010376)")
            if not cursor.fetchone()["pg_try_advisory_xact_lock"]:
                raise RuntimeError("Outro processo de atualização financeira está em execução.")
            cursor.execute("LOCK TABLE fin_movimento IN SHARE ROW EXCLUSIVE MODE")

            # Revalida dentro do lock para impedir corrida entre prévia e execução.
            imported, protected, protected_rows = fetch_current_state(cursor)

            lot_id = f"MOV-2026-ATE-0107-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            external_backup = create_external_backup(cursor, lot_id, script_dir)

            cursor.execute(
                """
                INSERT INTO fin_importacao_lotes(
                    lote_id, ano, status, arquivo_realizado, data_limite_realizado,
                    qtd_realizado, qtd_preservados, total_entradas_realizado,
                    total_saidas_realizado, observacoes
                ) VALUES (%s, %s, 'em_execucao', %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    lot_id, YEAR, source_path.name, CUTOFF,
                    EXPECTED["source_insert"], EXPECTED["current_protected"],
                    EXPECTED["source_insert_entries"], EXPECTED["source_insert_outflows"],
                    "Substituição segura do lote realizado até 01/07/2026; "
                    "3 linhas reconciliadas com movimentos vinculados ao Contas a Pagar.",
                ),
            )

            backed_imported, backed_reconciled = backup_to_database(cursor, lot_id)
            if backed_imported != EXPECTED["current_imported"] or backed_reconciled != len(RECONCILIATIONS):
                raise RuntimeError(
                    f"Backup transacional divergente: {backed_imported} importados e "
                    f"{backed_reconciled} reconciliados."
                )

            cursor.execute(
                """
                DELETE FROM fin_movimento
                 WHERE COALESCE(ano, EXTRACT(YEAR FROM data)::int) = %s
                   AND lote_importacao = %s
                """,
                (YEAR, OLD_LOT),
            )
            if cursor.rowcount != EXPECTED["current_imported"]:
                raise RuntimeError(
                    f"Exclusão divergente: esperado {EXPECTED['current_imported']}, removido {cursor.rowcount}."
                )

            reconcile_protected(cursor, reconciliation_rows)
            insert_rows(cursor, insertable, lot_id, source_path.name)
            verify_final(cursor, lot_id)

            cursor.execute(
                """
                UPDATE fin_importacao_lotes
                   SET status = 'concluido',
                       finalizado_em = NOW(),
                       observacoes = %s
                 WHERE lote_id = %s
                """,
                (
                    f"Removidos {EXPECTED['current_imported']} registros do lote {OLD_LOT}; "
                    f"inseridos {EXPECTED['source_insert']}; preservados {EXPECTED['current_protected']}; "
                    f"reconciliados {len(RECONCILIATIONS)}; "
                    f"ignorados após 01/07: {EXPECTED['source_after_cutoff']}; "
                    f"backup externo: {external_backup.name}",
                    lot_id,
                ),
            )

            connection.commit()
            print("\n✅ Atualização concluída com sucesso.")
            print(f"Novo lote: {lot_id}")
            print(f"Backup externo: {external_backup}")
            print(f"Registros finais em 2026: {EXPECTED['final_count']}")
            print(f"Entradas finais: {money(EXPECTED['final_entries'])}")
            print(f"Saídas finais: {money(EXPECTED['final_outflows'])}")

    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(
        description="Substitui com segurança o Movimento Bancário de 2026 até 01/07/2026."
    )
    parser.add_argument(
        "--arquivo",
        help="Caminho alternativo para a mesma planilha validada pelo SHA-256.",
    )
    parser.add_argument(
        "--validar-arquivo",
        action="store_true",
        help="Valida apenas a planilha, sem conectar ao banco.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Executa a substituição. Sem esta opção, funciona somente como prévia.",
    )
    parser.add_argument(
        "--confirmar",
        type=int,
        help="Confirmação obrigatória na execução: 2380.",
    )
    args = parser.parse_args()
    if args.validar_arquivo and args.execute:
        parser.error("--validar-arquivo não pode ser usado junto com --execute")
    try:
        run(args)
    except Exception as exc:
        print(f"\n❌ Operação cancelada: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
