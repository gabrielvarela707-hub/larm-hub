"use client";

/**
 * src/app/(dashboard)/financeiro/bancos/page.tsx
 * → larmhub-web/src/app/(dashboard)/financeiro/bancos/page.tsx
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Pencil,
  X,
  Check,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { apiClient } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import BancoSearchSelect from "@/components/financeiro/BancoSearchSelect";
import TableFloatingNav from "@/components/table-floating-nav";

// ─── Types ────────────────────────────────────────────────────────────────────
type LancamentoTipo = "saldo_inicial" | "taxa" | "rendimento" | "aplicacao";

interface BancoConta {
  id: number;
  empresa: string;
  banco_nome: string;
  codigo_banco: string | null;
  agencia: string | null;
  conta: string | null;
  digito: string | null;
  tipo_conta: string;
  saldo_inicial: number | string;
  data_saldo_inicial: string | null;
  ativo: boolean;
  obs: string | null;
}

interface LancamentoBanco {
  id: number;
  tipo: LancamentoTipo;
  descricao: string;
  valor: number;
  data: string;
  obs: string | null;
}

interface LancamentoBancoForm {
  tipo: LancamentoTipo;
  descricao: string;
  valor: number;
  data: string;
  obs: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPRESAS = ["LARM", "LUCKY", "LM", "HOLDING", "RM"];

const EMPTY: Partial<BancoConta> = {
  empresa: "",
  banco_nome: "",
  codigo_banco: "",
  agencia: "",
  conta: "",
  digito: "",
  tipo_conta: "Corrente",
  saldo_inicial: 0,
  data_saldo_inicial: "",
  ativo: true,
  obs: "",
};

const EMPTY_LANC: LancamentoBancoForm = {
  tipo: "saldo_inicial",
  descricao: "",
  valor: 0,
  data: "",
  obs: "",
};

const TIPO_LANC_LABELS: Record<LancamentoTipo, string> = {
  saldo_inicial: "Saldo Inicial",
  taxa: "Taxa Bancária",
  rendimento: "Rendimento de Conta",
  aplicacao: "Rendimento de Aplicação",
};
const TIPO_LANC_COLORS: Record<LancamentoTipo, string> = {
  saldo_inicial: "bg-blue-100 text-blue-700",
  taxa: "bg-red-100 text-red-600",
  rendimento: "bg-green-100 text-green-700",
  aplicacao: "bg-emerald-100 text-emerald-700",
};

// ─── Field Wrapper (FORA do componente — identidade estável) ──────────────────
function Field({
  label,
  name,
  required,
  children,
  errors,
  col2,
}: {
  label: string;
  name: string;
  required?: boolean;
  children: React.ReactNode;
  errors: Record<string, string>;
  col2?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1", col2 && "col-span-2")}>
      <label className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {errors[name] && (
        <p className="text-[10px] text-red-500 mt-0.5">{errors[name]}</p>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const moneyToNumber = (v: number | string | null | undefined) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const raw = String(v ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const n = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const R$ = (v: number | string | null | undefined) =>
  moneyToNumber(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const dateOnly = (value: string | null | undefined) => {
  if (!value) return "";
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
};

const todayISO = () => {
  const dt = new Date();
  const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const fmtDate = (d: string | null) => {
  const iso = dateOnly(d);
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BancosPage() {
  const [lista, setLista] = useState<BancoConta[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<BancoConta>>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fEmpresa, setFEmpresa] = useState("");
  const [fStatus, setFStatus] = useState<"ativas" | "inativas" | "todas">("ativas");
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // Lançamentos extras (taxas, rendimentos)
  const [showLancModal, setShowLancModal] = useState(false);
  const [lancContaId, setLancContaId] = useState<number | null>(null);
  const [lancContaNome, setLancContaNome] = useState("");
  const [lancamentos, setLancamentos] = useState<LancamentoBanco[]>([]);
  const [lancLoading, setLancLoading] = useState(false);
  const [lancForm, setLancForm] = useState(EMPTY_LANC);
  const [lancSaving, setLancSaving] = useState(false);
  const [lancErrors, setLancErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fEmpresa) params.empresa = fEmpresa;
      if (fStatus === "ativas") params.ativo = "true";
      if (fStatus === "inativas") params.ativo = "false";
      const r = await apiClient.get("/financeiro/bancos", { params });
      setLista(r.data.data ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [fEmpresa, fStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadLancamentos(contaId: number) {
    setLancLoading(true);
    try {
      const r = await apiClient.get(
        `/financeiro/bancos/${contaId}/lancamentos`,
      );
      setLancamentos(r.data.data ?? []);
    } catch {
      setLancamentos([]);
    } finally {
      setLancLoading(false);
    }
  }

  // ── CRUD Conta ─────────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY });
    setErrors({});
    setShowForm(true);
  }
  function openEdit(b: BancoConta) {
    setEditId(b.id);
    setForm({ ...b, data_saldo_inicial: dateOnly(b.data_saldo_inicial) });
    setErrors({});
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm({ ...EMPTY });
    setErrors({});
  }

  function set(key: keyof BancoConta, val: string | number | boolean) {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.empresa?.trim()) e.empresa = "Obrigatório";
    if (!form.banco_nome?.trim()) e.banco_nome = "Obrigatório";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        saldo_inicial: moneyToNumber(form.saldo_inicial),
        data_saldo_inicial: dateOnly(form.data_saldo_inicial) || null,
      };
      if (editId) {
        await apiClient.put(`/financeiro/bancos/${editId}`, payload);
      } else {
        await apiClient.post("/financeiro/bancos", payload);
      }
      closeForm();
      load();
    } catch (err: unknown) {
      setErrors({
        _geral:
          (err as { response?: { data?: { message?: string } } }).response?.data
            ?.message ?? "Erro ao salvar",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Lançamentos extras ─────────────────────────────────────────────────────
  function openLancamentos(conta: BancoConta) {
    setLancContaId(conta.id);
    setLancContaNome(`${conta.banco_nome} — ${conta.empresa}`);
    setLancForm({ ...EMPTY_LANC, data: todayISO() });
    setLancErrors({});
    setShowLancModal(true);
    loadLancamentos(conta.id);
  }

  function closeLancModal() {
    setShowLancModal(false);
    setLancContaId(null);
    setLancamentos([]);
  }

  async function saveLancamento() {
    const e: Record<string, string> = {};
    if (!lancForm.descricao.trim()) e.descricao = "Obrigatório";
    if (!lancForm.valor) e.valor = "Obrigatório";
    if (!lancForm.data) e.data = "Obrigatório";
    setLancErrors(e);
    if (Object.keys(e).length) return;

    setLancSaving(true);
    try {
      await apiClient.post(
        `/financeiro/bancos/${lancContaId}/lancamentos`,
        lancForm,
      );
      setLancForm({ ...EMPTY_LANC, data: todayISO() });
      await loadLancamentos(lancContaId!);
      load(); // atualiza saldo na listagem
    } catch {
    } finally {
      setLancSaving(false);
    }
  }

  async function deleteLancamento(id: number) {
    try {
      await apiClient.delete(
        `/financeiro/bancos/${lancContaId}/lancamentos/${id}`,
      );
      await loadLancamentos(lancContaId!);
      load();
    } catch {}
  }

  async function toggleContaStatus(conta: BancoConta) {
    const proximoStatus = !conta.ativo;
    const acao = conta.ativo ? "inativar" : "reativar";
    const mensagem = conta.ativo
      ? "Inativar esta conta bancária? Ela sairá das listagens padrão, mas o histórico financeiro será preservado."
      : "Reativar esta conta bancária? Ela voltará a aparecer nas listagens padrão.";

    if (!window.confirm(mensagem)) return;

    setStatusLoadingId(conta.id);
    try {
      await apiClient.patch(`/financeiro/bancos/${conta.id}/status`, {
        ativo: proximoStatus,
      });
      await load();
    } catch (err: unknown) {
      alert(
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? `Erro ao ${acao} a conta bancária.`,
      );
    } finally {
      setStatusLoadingId(null);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const saldoTotal = lista.reduce(
    (s, b) => s + moneyToNumber(b.saldo_inicial),
    0,
  );

  const inp =
    "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors";

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Bancos e Contas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Contas bancárias, saldos e movimentações
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      {/* Cards por empresa */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {EMPRESAS.map((emp) => {
          const contas = lista.filter((b) => b.empresa === emp && b.ativo);
          if (!contas.length) return null;
          return (
            <div
              key={emp}
              className="bg-white rounded-xl border border-slate-100 shadow-sm p-4"
            >
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                {emp}
              </p>
              <p className="text-sm font-bold text-slate-800">
                {R$(
                  contas.reduce(
                    (s, b) => s + moneyToNumber(b.saldo_inicial),
                    0,
                  ),
                )}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {contas.length} conta{contas.length > 1 ? "s" : ""}
              </p>
            </div>
          );
        })}
        <div className="bg-[#1e3a5f] rounded-xl p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-1">
            Total Consolidado
          </p>
          <p className="text-sm font-bold">{R$(saldoTotal)}</p>
          <p className="text-[10px] opacity-60 mt-0.5">
            {lista.filter((b) => b.ativo).length} contas ativas
          </p>
        </div>
      </div>

      {/* Filtro */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap gap-3">
        <select
          value={fEmpresa}
          onChange={(e) => setFEmpresa(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
        >
          <option value="">Todas empresas</option>
          {EMPRESAS.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>

        <select
          value={fStatus}
          onChange={(e) =>
            setFStatus(e.target.value as "ativas" | "inativas" | "todas")
          }
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
        >
          <option value="ativas">Contas ativas</option>
          <option value="inativas">Contas inativas</option>
          <option value="todas">Todas as contas</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto">
          <table className="w-full text-xs" style={{ minWidth: 980 }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d1b2a] text-white">
                {[
                  "Empresa",
                  "Banco",
                  "Agência",
                  "Conta",
                  "Tipo",
                  "Saldo",
                  "Data Saldo",
                  "Status",
                  "Ações",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 font-semibold whitespace-nowrap text-xs"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(4)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {[...Array(9)].map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div
                          className="h-3 bg-slate-100 rounded animate-pulse"
                          style={{ width: `${50 + ((i * 11 + j * 7) % 40)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && lista.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center text-slate-400 py-12 text-sm"
                  >
                    Nenhuma conta cadastrada. Clique em <b>Nova Conta</b> para
                    começar.
                  </td>
                </tr>
              )}
              {!loading &&
                lista.map((b) => (
                  <tr
                    key={b.id}
                    className={cn(
                      "border-b border-slate-50 hover:bg-slate-50 transition-colors",
                      !b.ativo && "opacity-50",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-semibold">
                        {b.empresa}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">
                      {b.banco_nome}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {b.agencia || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {b.conta}
                      {b.digito ? `-${b.digito}` : ""}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{b.tipo_conta}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
                      {R$(b.saldo_inicial)}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {fmtDate(b.data_saldo_inicial)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium",
                          b.ativo
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {b.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td className="px-3 py-2 flex items-center gap-1">
                      <button
                        onClick={() => openLancamentos(b)}
                        disabled={!b.ativo}
                        title={
                          b.ativo
                            ? "Lançamentos extras"
                            : "Reative a conta para lançar movimentações"
                        }
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEdit(b)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        title="Editar conta"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleContaStatus(b)}
                        disabled={statusLoadingId === b.id}
                        title={b.ativo ? "Inativar conta" : "Reativar conta"}
                        className={cn(
                          "p-1.5 rounded-lg transition-colors disabled:opacity-60",
                          b.ativo
                            ? "text-slate-400 hover:bg-red-50 hover:text-red-500"
                            : "text-slate-400 hover:bg-green-50 hover:text-green-600",
                        )}
                      >
                        {statusLoadingId === b.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : b.ativo ? (
                          <Trash2 className="w-3.5 h-3.5" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <TableFloatingNav scrollRef={tableScrollRef} />

      {/* ── Modal Nova/Editar Conta ─────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {editId ? "Editar Conta" : "Nova Conta Bancária"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  * campos obrigatórios
                </p>
              </div>
              <button
                onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                  {errors._geral}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Empresa" name="empresa" required errors={errors}>
                  <select
                    className={inp}
                    value={form.empresa || ""}
                    onChange={(e) => set("empresa", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {EMPRESAS.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Banco" name="banco_nome" required errors={errors}>
                  <BancoSearchSelect
                    className={inp}
                    value={form.banco_nome || ""}
                    codigo={form.codigo_banco || ""}
                    onChange={(banco) => {
                      set("banco_nome", banco.nome);
                      set("codigo_banco", banco.codigo);
                    }}
                  />
                </Field>

                <Field
                  label="Código do Banco"
                  name="codigo_banco"
                  errors={errors}
                >
                  <input
                    className={inp}
                    value={form.codigo_banco || ""}
                    onChange={(e) => set("codigo_banco", e.target.value)}
                    placeholder="000"
                  />
                </Field>

                <Field label="Tipo de Conta" name="tipo_conta" errors={errors}>
                  <select
                    className={inp}
                    value={form.tipo_conta || "Corrente"}
                    onChange={(e) => set("tipo_conta", e.target.value)}
                  >
                    <option>Corrente</option>
                    <option>Poupança</option>
                    <option>Investimento</option>
                    <option>PIX</option>
                  </select>
                </Field>

                <Field label="Agência" name="agencia" errors={errors}>
                  <input
                    className={inp}
                    value={form.agencia || ""}
                    onChange={(e) =>
                      set("agencia", e.target.value.replace(/\D/g, ""))
                    }
                    inputMode="numeric"
                    placeholder="0000"
                  />
                </Field>

                <Field label="Conta" name="conta" errors={errors}>
                  <input
                    className={inp}
                    value={form.conta || ""}
                    onChange={(e) =>
                      set("conta", e.target.value.replace(/\D/g, ""))
                    }
                    inputMode="numeric"
                    placeholder="000000"
                  />
                </Field>

                <Field label="Dígito" name="digito" errors={errors}>
                  <input
                    className={inp}
                    value={form.digito || ""}
                    onChange={(e) => set("digito", e.target.value)}
                    placeholder="0"
                    maxLength={2}
                  />
                </Field>

                <div />

                {/* Saldo e data são opcionais */}
                <Field
                  label="Saldo Inicial (R$)"
                  name="saldo_inicial"
                  errors={errors}
                >
                  <input
                    className={inp}
                    type="text"
                    inputMode="decimal"
                    value={form.saldo_inicial ?? ""}
                    onChange={(e) => set("saldo_inicial", e.target.value)}
                    placeholder="0,00"
                  />
                </Field>

                <Field
                  label="Data do Saldo Inicial"
                  name="data_saldo_inicial"
                  errors={errors}
                >
                  <input
                    className={inp}
                    type="date"
                    value={dateOnly(form.data_saldo_inicial) || ""}
                    onChange={(e) => set("data_saldo_inicial", e.target.value)}
                  />
                </Field>

                <Field label="Observações" name="obs" col2 errors={errors}>
                  <textarea
                    className={cn(inp, "min-h-[60px] resize-none")}
                    value={form.obs || ""}
                    onChange={(e) => set("obs", e.target.value)}
                    placeholder="Notas adicionais…"
                  />
                </Field>
              </div>

              <p className="text-[10px] text-slate-400 -mt-1">
                Saldo inicial e data são opcionais — podem ser inseridos depois
                via lançamentos extras (ícone{" "}
                <span className="font-semibold">$</span> na lista).
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvando…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />{" "}
                    {editId ? "Atualizar" : "Salvar"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Lançamentos Extras ──────────────────────────────────────────── */}
      {showLancModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  Lançamentos da Conta
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{lancContaNome}</p>
              </div>
              <button
                onClick={closeLancModal}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Formulário de novo lançamento */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Novo Lançamento
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-xs font-medium text-slate-600">
                      Tipo *
                    </label>
                    <select
                      className={inp}
                      value={lancForm.tipo}
                      onChange={(e) =>
                        setLancForm((p) => ({
                          ...p,
                          tipo: e.target.value as LancamentoTipo,
                        }))
                      }
                    >
                      {Object.entries(TIPO_LANC_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-xs font-medium text-slate-600">
                      Descrição *
                    </label>
                    <input
                      className={cn(
                        inp,
                        lancErrors.descricao && "border-red-300",
                      )}
                      value={lancForm.descricao}
                      onChange={(e) =>
                        setLancForm((p) => ({
                          ...p,
                          descricao: e.target.value,
                        }))
                      }
                      placeholder="Ex: Taxa de manutenção, Rendimento março…"
                    />
                    {lancErrors.descricao && (
                      <p className="text-[10px] text-red-500">
                        {lancErrors.descricao}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600">
                      Valor (R$) *
                      <span className="text-slate-400 font-normal ml-1">
                        {lancForm.tipo === "taxa"
                          ? "(negativo = débito)"
                          : "(positivo = crédito)"}
                      </span>
                    </label>
                    <input
                      className={cn(inp, lancErrors.valor && "border-red-300")}
                      type="number"
                      step="0.01"
                      value={lancForm.valor || ""}
                      onChange={(e) =>
                        setLancForm((p) => ({
                          ...p,
                          valor: parseFloat(e.target.value) || 0,
                        }))
                      }
                      placeholder={
                        lancForm.tipo === "taxa" ? "-25.00" : "150.00"
                      }
                    />
                    {lancErrors.valor && (
                      <p className="text-[10px] text-red-500">
                        {lancErrors.valor}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-slate-600">
                      Data *
                    </label>
                    <input
                      className={cn(inp, lancErrors.data && "border-red-300")}
                      type="date"
                      value={lancForm.data}
                      onChange={(e) =>
                        setLancForm((p) => ({ ...p, data: e.target.value }))
                      }
                    />
                    {lancErrors.data && (
                      <p className="text-[10px] text-red-500">
                        {lancErrors.data}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-xs font-medium text-slate-600">
                      Obs
                    </label>
                    <input
                      className={inp}
                      value={lancForm.obs || ""}
                      onChange={(e) =>
                        setLancForm((p) => ({ ...p, obs: e.target.value }))
                      }
                      placeholder="Observação opcional"
                    />
                  </div>
                </div>
                <button
                  onClick={saveLancamento}
                  disabled={lancSaving}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60 mt-1"
                >
                  {lancSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Salvando…
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Adicionar
                    </>
                  )}
                </button>
              </div>

              {/* Lista de lançamentos */}
              {lancLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                </div>
              ) : lancamentos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  Nenhum lançamento nesta conta ainda.
                </p>
              ) : (
                <div className="space-y-2">
                  {lancamentos.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3"
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0",
                          l.valor >= 0 ? "bg-green-50" : "bg-red-50",
                        )}
                      >
                        {l.valor >= 0 ? (
                          <TrendingUp className="w-4 h-4 text-green-600" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {l.descricao}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                              TIPO_LANC_COLORS[l.tipo],
                            )}
                          >
                            {TIPO_LANC_LABELS[l.tipo]}
                          </span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {fmtDate(l.data)}
                          </span>
                        </div>
                      </div>
                      <p
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          l.valor >= 0 ? "text-green-700" : "text-red-600",
                        )}
                      >
                        {l.valor >= 0 ? "+" : ""}
                        {R$(l.valor)}
                      </p>
                      <button
                        onClick={() => deleteLancamento(l.id)}
                        className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
