"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { BANCOS_BR } from "@/lib/bancos-br";
import { cn } from "@/lib/utils";

export interface BancoSearchValue {
  codigo: string;
  nome: string;
  label: string;
}

interface BancoSearchSelectProps {
  value?: string | null;
  codigo?: string | null;
  onChange: (value: BancoSearchValue) => void;
  className?: string;
  placeholder?: string;
  clearLabel?: string;
}

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function bancoLabel(codigo: string, nome: string) {
  return `${codigo} - ${nome}`;
}

export default function BancoSearchSelect({
  value,
  codigo,
  onChange,
  className,
  placeholder = "Selecione",
  clearLabel = "Nenhum banco",
}: BancoSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => {
    const valueNorm = normalize(value);
    const code = String(codigo || "").trim();
    return BANCOS_BR.find(
      (b) =>
        b.codigo === code ||
        normalize(b.nome) === valueNorm ||
        normalize(bancoLabel(b.codigo, b.nome)) === valueNorm,
    );
  }, [codigo, value]);

  const display = selected
    ? bancoLabel(selected.codigo, selected.nome)
    : String(value || "").trim();

  const filtered = useMemo(() => {
    const q = normalize(busca);
    if (!q) return BANCOS_BR;
    return BANCOS_BR.filter(
      (b) =>
        b.codigo.includes(q) ||
        normalize(b.nome).includes(q) ||
        normalize(bancoLabel(b.codigo, b.nome)).includes(q),
    );
  }, [busca]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function selectBanco(banco: (typeof BANCOS_BR)[number]) {
    onChange({
      codigo: banco.codigo,
      nome: banco.nome,
      label: bancoLabel(banco.codigo, banco.nome),
    });
    setBusca("");
    setOpen(false);
  }

  function clearBanco() {
    onChange({ codigo: "", nome: "", label: "" });
    setBusca("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          className,
          "flex items-center justify-between gap-2 text-left",
        )}
      >
        <span
          className={cn(
            "truncate",
            display ? "text-slate-700" : "text-slate-400",
          )}
        >
          {display || placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-[90] mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar por código ou nome..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-8 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={clearBanco}
              className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50"
            >
              {clearLabel}
            </button>
            {filtered.map((banco) => (
              <button
                key={banco.codigo}
                type="button"
                onClick={() => selectBanco(banco)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-blue-50",
                  selected?.codigo === banco.codigo &&
                    "bg-blue-50 font-medium text-blue-700",
                )}
              >
                <span className="font-semibold tabular-nums">
                  {banco.codigo}
                </span>
                <span className="text-slate-400"> — </span>
                <span>{banco.nome}</span>
              </button>
            ))}
            {!filtered.length && (
              <div className="px-3 py-3 text-sm text-slate-400">
                Nenhum banco encontrado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
