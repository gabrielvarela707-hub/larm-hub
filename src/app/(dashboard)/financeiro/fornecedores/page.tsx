"use client";

/**
 * src/app/(dashboard)/financeiro/fornecedores/page.tsx
 * → larmhub-web/src/app/(dashboard)/financeiro/fornecedores/page.tsx
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  Pencil,
  X,
  Check,
  Loader2,
  Building2,
  History,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingDown,
  Upload,
  Download,
  FileSignature,
  CalendarClock,
  Trash2,
  Save,
  Paperclip,
  ExternalLink,
} from "lucide-react";
import * as XLSX from "xlsx";
import { apiClient } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import TableFloatingNav from "@/components/table-floating-nav";
import BancoSearchSelect from "@/components/financeiro/BancoSearchSelect";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Fornecedor {
  id: number;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  tipo_pessoa: string;
  categoria: string | null;
  email: string | null;
  telefone: string | null;
  empresa: string;
  cep: string | null;
  endereco: string | null;
  cidade_uf: string | null;
  banco_nome: string | null;
  codigo_banco?: string | null;
  agencia: string | null;
  conta: string | null;
  digito?: string | null;
  tipo_conta: string;
  chave_pix: string | null;
  obs: string | null;
  ativo: boolean;
}

interface HistoricoItem {
  id: number;
  descricao: string;
  vencimento: string;
  valor: number;
  status: "pago" | "aberto" | "vencido";
  pago_em: string | null;
  empresa: string;
}

interface HistoricoResumo {
  total_contas: number;
  total_pago: number;
  total_aberto: number;
  total_vencido: number;
  itens: HistoricoItem[];
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

interface FornecedorContrato {
  id: number;
  fornecedor_id: number;
  titulo: string;
  numero_contrato: string | null;
  status: string;
  data_assinatura: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  data_renovacao: string | null;
  indice_correcao: string | null;
  valor_mensal: number;
  valor_total: number;
  valor_pago: number;
  servicos: string | null;
  responsavel: string | null;
  observacoes: string | null;
  arquivo_nome: string | null;
  arquivo_mime?: string | null;
  arquivo_base64?: string | null;
  tem_arquivo?: boolean;
  ativo: boolean;
}

type FormTab = "dados" | "historico" | "contratos";

interface ContratoImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

type FornecedorImportField =
  | "razao_social"
  | "nome_fantasia"
  | "cnpj_cpf"
  | "tipo_pessoa"
  | "categoria"
  | "empresa"
  | "email"
  | "telefone"
  | "cep"
  | "endereco"
  | "cidade_uf"
  | "codigo_banco"
  | "banco_nome"
  | "agencia"
  | "conta"
  | "digito"
  | "tipo_conta"
  | "chave_pix"
  | "obs"
  | "ativo";

type ContratoImportField =
  | "titulo"
  | "numero_contrato"
  | "status"
  | "data_assinatura"
  | "data_inicio"
  | "data_fim"
  | "data_renovacao"
  | "indice_correcao"
  | "valor_mensal"
  | "valor_total"
  | "valor_pago"
  | "servicos"
  | "responsavel"
  | "observacoes";

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY: Partial<Fornecedor> = {
  razao_social: "",
  nome_fantasia: "",
  cnpj_cpf: "",
  tipo_pessoa: "PJ",
  categoria: "",
  email: "",
  telefone: "",
  empresa: "TODOS",
  cep: "",
  endereco: "",
  cidade_uf: "",
  banco_nome: "",
  codigo_banco: "",
  agencia: "",
  conta: "",
  digito: "",
  tipo_conta: "Corrente",
  chave_pix: "",
  obs: "",
  ativo: true,
};

const EMPRESAS = ["TODOS", "LARM", "LUCKY", "LM", "HOLDING", "RM"];
const CATEGORIAS = [
  "Serviços",
  "Materiais",
  "Condomínio / Imóvel",
  "Prestador de Serviços (PF)",
  "Órgão Público",
  "Outros",
];

const CONTRATO_STATUS = [
  { value: "ativo", label: "Ativo" },
  { value: "pendente_assinatura", label: "Pendente assinatura" },
  { value: "em_renovacao", label: "Em renovação" },
  { value: "vencido", label: "Vencido" },
  { value: "encerrado", label: "Encerrado" },
  { value: "cancelado", label: "Cancelado" },
];

const EMPTY_CONTRATO: Partial<FornecedorContrato> = {
  titulo: "",
  numero_contrato: "",
  status: "ativo",
  data_assinatura: "",
  data_inicio: "",
  data_fim: "",
  data_renovacao: "",
  indice_correcao: "",
  valor_mensal: 0,
  valor_total: 0,
  valor_pago: 0,
  servicos: "",
  responsavel: "",
  observacoes: "",
  arquivo_nome: "",
  arquivo_mime: "",
  arquivo_base64: "",
  ativo: true,
};


const IMPORT_COLUMNS: { label: string; key: FornecedorImportField; required?: boolean; example: string }[] = [
  { label: "Razão Social *", key: "razao_social", required: true, example: "Fornecedor Exemplo LTDA" },
  { label: "Nome Fantasia", key: "nome_fantasia", example: "Fornecedor Exemplo" },
  { label: "CNPJ/CPF", key: "cnpj_cpf", example: "12.345.678/0001-90" },
  { label: "Tipo Pessoa", key: "tipo_pessoa", example: "PJ" },
  { label: "Categoria", key: "categoria", example: "Serviços" },
  { label: "Empresa *", key: "empresa", required: true, example: "TODOS" },
  { label: "E-mail", key: "email", example: "financeiro@fornecedor.com.br" },
  { label: "Telefone", key: "telefone", example: "(11) 99999-9999" },
  { label: "CEP", key: "cep", example: "01001-000" },
  { label: "Endereço", key: "endereco", example: "Rua Exemplo, 100" },
  { label: "Cidade/UF", key: "cidade_uf", example: "São Paulo - SP" },
  { label: "Código Banco", key: "codigo_banco", example: "341" },
  { label: "Banco", key: "banco_nome", example: "Itaú" },
  { label: "Agência", key: "agencia", example: "1234" },
  { label: "Conta", key: "conta", example: "12345" },
  { label: "Dígito", key: "digito", example: "6" },
  { label: "Tipo Conta", key: "tipo_conta", example: "Corrente" },
  { label: "Chave PIX", key: "chave_pix", example: "12.345.678/0001-90" },
  { label: "Observações", key: "obs", example: "Fornecedor importado por planilha" },
  { label: "Ativo", key: "ativo", example: "Sim" },
];

const CONTRATO_IMPORT_COLUMNS: { label: string; key: ContratoImportField; required?: boolean; example: string }[] = [
  { label: "Título / Serviço *", key: "titulo", required: true, example: "Contrato de manutenção" },
  { label: "Número do contrato", key: "numero_contrato", example: "CTR-2026-001" },
  { label: "Status", key: "status", example: "Ativo" },
  { label: "Data assinatura", key: "data_assinatura", example: "28/06/2026" },
  { label: "Data início", key: "data_inicio", example: "01/07/2026" },
  { label: "Data fim", key: "data_fim", example: "30/06/2027" },
  { label: "Data renovação", key: "data_renovacao", example: "01/06/2027" },
  { label: "Índice correção", key: "indice_correcao", example: "IPCA" },
  { label: "Valor mensal", key: "valor_mensal", example: "1500,00" },
  { label: "Valor total", key: "valor_total", example: "18000,00" },
  { label: "Valor pago", key: "valor_pago", example: "3000,00" },
  { label: "Serviços", key: "servicos", example: "Manutenção preventiva mensal" },
  { label: "Responsável", key: "responsavel", example: "Financeiro" },
  { label: "Observações", key: "observacoes", example: "Contrato importado por planilha" },
];

const CONTRATO_HEADER_ALIASES: Record<string, ContratoImportField> = {
  titulo: "titulo",
  tituloservico: "titulo",
  servicotitulo: "titulo",
  contrato: "titulo",
  numerocontrato: "numero_contrato",
  numerodocontrato: "numero_contrato",
  ncontrato: "numero_contrato",
  numero_contrato: "numero_contrato",
  status: "status",
  dataassinatura: "data_assinatura",
  assinatura: "data_assinatura",
  data_assinatura: "data_assinatura",
  datainicio: "data_inicio",
  inicio: "data_inicio",
  data_inicio: "data_inicio",
  datafim: "data_fim",
  fim: "data_fim",
  vencimento: "data_fim",
  data_fim: "data_fim",
  datarenovacao: "data_renovacao",
  renovacao: "data_renovacao",
  data_renovacao: "data_renovacao",
  indicecorrecao: "indice_correcao",
  indice: "indice_correcao",
  reajuste: "indice_correcao",
  indice_correcao: "indice_correcao",
  valormensal: "valor_mensal",
  mensal: "valor_mensal",
  valor_mensal: "valor_mensal",
  valortotal: "valor_total",
  total: "valor_total",
  valor_total: "valor_total",
  valorpago: "valor_pago",
  pago: "valor_pago",
  valor_pago: "valor_pago",
  servicos: "servicos",
  servico: "servicos",
  responsavel: "responsavel",
  observacoes: "observacoes",
  obs: "observacoes",
};

const IMPORT_HEADER_ALIASES: Record<string, FornecedorImportField> = {
  razaosocial: "razao_social",
  razaosocialfantasia: "razao_social",
  razaosocialobrigatorio: "razao_social",
  razao_social: "razao_social",
  nomefantasia: "nome_fantasia",
  fantasia: "nome_fantasia",
  nome_fantasia: "nome_fantasia",
  cnpjcpf: "cnpj_cpf",
  cnpj: "cnpj_cpf",
  cpf: "cnpj_cpf",
  cnpj_cpf: "cnpj_cpf",
  tipopessoa: "tipo_pessoa",
  tipo: "tipo_pessoa",
  tipo_pessoa: "tipo_pessoa",
  categoria: "categoria",
  empresa: "empresa",
  empresaobrigatorio: "empresa",
  email: "email",
  "e-mail": "email",
  telefone: "telefone",
  celular: "telefone",
  cep: "cep",
  endereco: "endereco",
  cidadeuf: "cidade_uf",
  cidade: "cidade_uf",
  cidade_uf: "cidade_uf",
  codigobanco: "codigo_banco",
  codbanco: "codigo_banco",
  codigo_banco: "codigo_banco",
  banco: "banco_nome",
  banconome: "banco_nome",
  banco_nome: "banco_nome",
  agencia: "agencia",
  conta: "conta",
  digito: "digito",
  tipoConta: "tipo_conta",
  tipoconta: "tipo_conta",
  tipo_conta: "tipo_conta",
  chavepix: "chave_pix",
  pix: "chave_pix",
  chave_pix: "chave_pix",
  observacoes: "obs",
  obs: "obs",
  ativo: "ativo",
  status: "ativo",
};

// ─── Masks ────────────────────────────────────────────────────────────────────
function maskCNPJ(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
function maskCPF(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1-$2");
}
function maskCEP(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, "$1-$2");
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d)/, "($1) $2-$3");
  return d.replace(/(\d{2})(\d{5})(\d)/, "($1) $2-$3");
}
function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}
function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}


function normalizeImportHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[*()/.\\\s-]/g, "")
    .toLowerCase()
    .trim();
}

function cellToString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  return String(value).trim();
}

function parseImportAtivo(value: string) {
  const normalized = normalizeImportHeader(value);
  if (!normalized) return true;
  return !["nao", "n", "0", "false", "falso", "inativo", "inativa"].includes(normalized);
}

function normalizeImportRow(row: Record<string, unknown>) {
  const mapped: Partial<Record<FornecedorImportField, string>> = {};

  Object.entries(row).forEach(([header, value]) => {
    const key = IMPORT_HEADER_ALIASES[normalizeImportHeader(header)];
    if (key) mapped[key] = cellToString(value);
  });

  const docDigits = onlyDigits(mapped.cnpj_cpf || "");
  const tipoInformado = (mapped.tipo_pessoa || "").toUpperCase().trim();
  const tipoPessoa = tipoInformado === "PF" || tipoInformado === "PJ"
    ? tipoInformado
    : docDigits.length === 11
      ? "PF"
      : "PJ";
  const tipoConta = /poup/i.test(mapped.tipo_conta || "") ? "Poupança" : "Corrente";

  return {
    razao_social: mapped.razao_social || "",
    nome_fantasia: mapped.nome_fantasia || "",
    cnpj_cpf: mapped.cnpj_cpf || "",
    tipo_pessoa: tipoPessoa,
    categoria: mapped.categoria || "",
    empresa: (mapped.empresa || "TODOS").toUpperCase(),
    email: mapped.email || "",
    telefone: mapped.telefone || "",
    cep: mapped.cep || "",
    endereco: mapped.endereco || "",
    cidade_uf: mapped.cidade_uf || "",
    codigo_banco: mapped.codigo_banco || "",
    banco_nome: mapped.banco_nome || "",
    agencia: mapped.agencia || "",
    conta: mapped.conta || "",
    digito: mapped.digito || "",
    tipo_conta: tipoConta,
    chave_pix: mapped.chave_pix || "",
    obs: mapped.obs || "",
    ativo: parseImportAtivo(mapped.ativo || "Sim"),
  } satisfies Partial<Fornecedor>;
}

function parseMoneyInput(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value)
    .replace(/\s/g, "")
    .replace(/R\$/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDateInput(value: unknown) {
  const raw = cellToString(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10);
  return "";
}

function fmtData(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function statusContratoLabel(status?: string | null) {
  return CONTRATO_STATUS.find((s) => s.value === status)?.label || "Ativo";
}

function normalizeContratoStatus(value: string) {
  const normalized = normalizeImportHeader(value);
  if (["pendenteassinatura", "pendente", "aguardandoassinatura"].includes(normalized)) return "pendente_assinatura";
  if (["emrenovacao", "renovacao", "renovar"].includes(normalized)) return "em_renovacao";
  if (["vencido", "vencida"].includes(normalized)) return "vencido";
  if (["encerrado", "encerrada", "finalizado", "finalizada"].includes(normalized)) return "encerrado";
  if (["cancelado", "cancelada"].includes(normalized)) return "cancelado";
  return "ativo";
}

function normalizeContratoImportRow(row: Record<string, unknown>) {
  const mapped: Partial<Record<ContratoImportField, string>> = {};

  Object.entries(row).forEach(([header, value]) => {
    const key = CONTRATO_HEADER_ALIASES[normalizeImportHeader(header)];
    if (key) mapped[key] = cellToString(value);
  });

  return {
    titulo: mapped.titulo || mapped.servicos || "",
    numero_contrato: mapped.numero_contrato || "",
    status: normalizeContratoStatus(mapped.status || "ativo"),
    data_assinatura: normalizeDateInput(mapped.data_assinatura),
    data_inicio: normalizeDateInput(mapped.data_inicio),
    data_fim: normalizeDateInput(mapped.data_fim),
    data_renovacao: normalizeDateInput(mapped.data_renovacao),
    indice_correcao: mapped.indice_correcao || "",
    valor_mensal: parseMoneyInput(mapped.valor_mensal),
    valor_total: parseMoneyInput(mapped.valor_total),
    valor_pago: parseMoneyInput(mapped.valor_pago),
    servicos: mapped.servicos || "",
    responsavel: mapped.responsavel || "",
    observacoes: mapped.observacoes || "",
    ativo: true,
  } satisfies Partial<FornecedorContrato>;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ─── MaskedInput ─────────────────────────────────────────────────────────────
// TOTALMENTE NÃO-CONTROLADO: nunca passa value= para o <input>.
// Usa ref para ler/escrever o DOM diretamente — zero re-render durante a digitação.
// Quando o valor externo muda (ex: BrasilAPI preenche), atualiza o DOM via ref.
function MaskedInput({
  externalValue,
  onCommit,
  onComplete,
  mask,
  placeholder,
  className,
  inputMode,
  icon,
}: {
  externalValue: string; // valor vindo do pai (para sync externo)
  onCommit: (v: string) => void; // notifica o pai do novo valor
  onComplete?: (v: string) => void;
  mask: (v: string) => string;
  placeholder?: string;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  icon?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // Aplica valor externo no DOM (BrasilAPI / ViaCEP preenche os campos)
  // Só atualiza se diferente do que está no input para não travar o cursor
  useEffect(() => {
    if (ref.current && mask(ref.current.value) !== mask(externalValue)) {
      ref.current.value = mask(externalValue);
    }
  }, [externalValue, mask]);

  return (
    <div className="relative">
      <input
        ref={ref}
        defaultValue={mask(externalValue)}
        className={cn(className, icon && "pr-8")}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => {
          // Aplica máscara diretamente no DOM — sem setState, sem re-render.
          // Mantém o cursor no final para evitar perder dígitos quando a máscara insere ./-
          const masked = mask(e.target.value);
          e.target.value = masked;
          try {
            e.target.setSelectionRange(masked.length, masked.length);
          } catch {}
          // Notifica o pai (cause re-render do pai, mas não deste input)
          onCommit(masked);
          const digits = masked.replace(/\D/g, "");
          if (onComplete && (digits.length === 14 || digits.length === 8))
            onComplete(masked);
        }}
      />
      {icon && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {icon}
        </span>
      )}
    </div>
  );
}

// ─── Field Wrapper (FORA do componente — identidade estável, evita perda de foco) ──
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

// ─── Normalização de dados bancários ──────────────────────────────────────────
function normalizeFornecedorForm(data?: Partial<Fornecedor>) {
  const merged: Partial<Fornecedor> = { ...EMPTY, ...(data || {}) };
  const conta = String(merged.conta || "");
  if (!merged.digito && conta.includes("-")) {
    const [numero, digito] = conta.split("-", 2);
    merged.conta = numero.replace(/\D/g, "");
    merged.digito = String(digito || "")
      .replace(/\D/g, "")
      .slice(0, 2);
  }
  return merged;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FornecedoresPage() {
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<Fornecedor>>(() =>
    normalizeFornecedorForm(),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formTab, setFormTab] = useState<FormTab>("dados");

  // Lookups
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjStatus, setCnpjStatus] = useState<"idle" | "ok" | "err">("idle");
  const [cnpjDupError, setCnpjDupError] = useState("");

  // Histórico
  const [historico, setHistorico] = useState<HistoricoResumo | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  // Filtros
  const [fBusca, setFBusca] = useState("");
  const [fEmpresa, setFEmpresa] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [ordenacao, setOrdenacao] = useState("nome:asc");

  function toggleOrdenacao(campo: 'codigo' | 'nome' | 'categoria') {
    setOrdenacao((atual) => {
      const [campoAtual, direcaoAtual] = atual.split(':');
      const proximaDirecao = campoAtual === campo && direcaoAtual === 'asc' ? 'desc' : 'asc';
      return `${campo}:${proximaDirecao}`;
    });
  }

  function sortIcon(campo: 'codigo' | 'nome' | 'categoria') {
    const [campoAtual, direcaoAtual] = ordenacao.split(':');
    const ativo = campoAtual === campo;
    const simbolo = ativo ? (direcaoAtual === 'asc' ? '↑' : '↓') : '↕';

    return (
      <span
        aria-hidden="true"
        className={`ml-1 inline-block min-w-3 text-center text-sm font-bold leading-none ${ativo ? 'text-blue-200' : 'text-slate-300'}`}
      >
        {simbolo}
      </span>
    );
  }
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // Importação
  const importInputRef = useRef<HTMLInputElement>(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importRows, setImportRows] = useState<Partial<Fornecedor>[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Contratos do fornecedor
  const contratoImportInputRef = useRef<HTMLInputElement>(null);
  const contratoPdfInputRef = useRef<HTMLInputElement>(null);
  const [contratos, setContratos] = useState<FornecedorContrato[]>([]);
  const [contratosLoading, setContratosLoading] = useState(false);
  const [contratoSaving, setContratoSaving] = useState(false);
  const [contratoEditId, setContratoEditId] = useState<number | null>(null);
  const [contratoForm, setContratoForm] = useState<Partial<FornecedorContrato>>({ ...EMPTY_CONTRATO });
  const [contratoErrors, setContratoErrors] = useState<string[]>([]);
  const [contratoImportRows, setContratoImportRows] = useState<Partial<FornecedorContrato>[]>([]);
  const [contratoImportFileName, setContratoImportFileName] = useState("");
  const [contratoImporting, setContratoImporting] = useState(false);
  const [contratoImportResult, setContratoImportResult] = useState<ContratoImportResult | null>(null);

  // Prevent re-render on every keystroke: use uncontrolled input + ref pattern for masks

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (fBusca) params.busca = fBusca;
      if (fEmpresa) params.empresa = fEmpresa;
      if (fCategoria) params.categoria = fCategoria;
      const [ordenar, direcao] = ordenacao.split(":");
      params.ordenar = ordenar;
      params.direcao = direcao;
      const r = await apiClient.get("/financeiro/fornecedores", { params });
      setLista(r.data.data ?? []);
      setTotal(r.data.total ?? 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [fBusca, fEmpresa, fCategoria, ordenacao]);

  useEffect(() => {
    load();
  }, [load]);

  // ── BrasilAPI CNPJ lookup ──────────────────────────────────────────────────
  async function lookupCNPJ(raw: string) {
    const digits = onlyDigits(raw);
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    setCnpjStatus("idle");
    setCnpjDupError("");
    try {
      // Check uniqueness first
      const dupCheck = await apiClient
        .get("/financeiro/fornecedores/check-cnpj", {
          params: { cnpj: digits, exclude_id: editId ?? "" },
        })
        .catch(() => null);
      if (dupCheck?.data?.exists) {
        setCnpjDupError("CNPJ já cadastrado no sistema");
        setCnpjStatus("err");
        return;
      }

      const resp = await fetch(
        `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
      );
      if (!resp.ok) throw new Error("não encontrado");
      const d = await resp.json();

      setForm((p) => ({
        ...p,
        razao_social: d.razao_social ?? p.razao_social,
        nome_fantasia: d.nome_fantasia || p.nome_fantasia,
        email: d.email || p.email,
        telefone: d.ddd_telefone_1
          ? maskPhone(d.ddd_telefone_1.replace(/\D/g, ""))
          : p.telefone,
        cep: d.cep ? maskCEP(d.cep) : p.cep,
        endereco:
          [d.logradouro, d.numero, d.complemento, d.bairro]
            .filter(Boolean)
            .join(", ") || p.endereco,
        cidade_uf:
          d.municipio && d.uf ? `${d.municipio} - ${d.uf}` : p.cidade_uf,
      }));
      setCnpjStatus("ok");
    } catch {
      setCnpjStatus("err");
    } finally {
      setCnpjLoading(false);
    }
  }

  // ── ViaCEP lookup ──────────────────────────────────────────────────────────
  async function lookupCEP(raw: string) {
    const digits = onlyDigits(raw);
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await resp.json();
      if (d.erro) return;
      setForm((p) => ({
        ...p,
        endereco:
          [d.logradouro, d.bairro].filter(Boolean).join(", ") || p.endereco,
        cidade_uf:
          d.localidade && d.uf ? `${d.localidade} - ${d.uf}` : p.cidade_uf,
      }));
    } catch {
    } finally {
      setCepLoading(false);
    }
  }

  // ── Histórico ──────────────────────────────────────────────────────────────
  async function loadHistorico(id: number) {
    setHistLoading(true);
    try {
      const r = await apiClient.get(`/financeiro/fornecedores/${id}/historico`);
      setHistorico(r.data.data);
    } catch {
      setHistorico({
        total_contas: 0,
        total_pago: 0,
        total_aberto: 0,
        total_vencido: 0,
        itens: [],
      });
    } finally {
      setHistLoading(false);
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null);
    setForm(normalizeFornecedorForm());
    setErrors({});
    setCnpjStatus("idle");
    setCnpjDupError("");
    setFormTab("dados");
    setHistorico(null);
    setContratos([]);
    setContratoEditId(null);
    setContratoForm({ ...EMPTY_CONTRATO });
    setContratoErrors([]);
    setShowForm(true);
  }

  function openEdit(f: Fornecedor) {
    setEditId(f.id);
    setForm(normalizeFornecedorForm(f));
    setErrors({});
    setCnpjStatus("idle");
    setCnpjDupError("");
    setFormTab("dados");
    setHistorico(null);
    setContratos([]);
    setContratoEditId(null);
    setContratoForm({ ...EMPTY_CONTRATO });
    setContratoErrors([]);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditId(null);
    setForm(normalizeFornecedorForm());
    setErrors({});
    setCnpjStatus("idle");
    setCnpjDupError("");
    setHistorico(null);
    setContratos([]);
    setContratoEditId(null);
    setContratoForm({ ...EMPTY_CONTRATO });
    setContratoErrors([]);
  }

  function set(key: keyof Fornecedor, val: string | boolean) {
    setForm((p) => ({ ...p, [key]: val }));
    if (errors[key]) setErrors((p) => ({ ...p, [key]: "" }));
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.razao_social?.trim()) e.razao_social = "Obrigatório";
    if (!form.empresa) e.empresa = "Obrigatório";
    if (cnpjDupError) e.cnpj_cpf = cnpjDupError;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      if (editId) {
        await apiClient.put(`/financeiro/fornecedores/${editId}`, form);
      } else {
        await apiClient.post("/financeiro/fornecedores", form);
      }
      closeForm();
      load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? "Erro ao salvar";
      if (
        msg.toLowerCase().includes("cnpj") ||
        msg.toLowerCase().includes("cpf")
      ) {
        setErrors({ cnpj_cpf: msg });
        setFormTab("dados");
      } else {
        setErrors({ _geral: msg });
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(f: Fornecedor) {
    try {
      await apiClient.put(`/financeiro/fornecedores/${f.id}`, {
        ...f,
        ativo: !f.ativo,
      });
      load();
    } catch {}
  }

  function resetImportState() {
    setImportFileName("");
    setImportRows([]);
    setImportErrors([]);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = "";
  }

  function closeImport() {
    setShowImport(false);
    resetImportState();
  }

  function downloadModeloFornecedores() {
    const header = IMPORT_COLUMNS.map((c) => c.label);
    const example = IMPORT_COLUMNS.map((c) => c.example);
    const worksheet = XLSX.utils.aoa_to_sheet([header, example]);
    worksheet["!cols"] = IMPORT_COLUMNS.map((c) => ({ wch: Math.max(16, c.label.length + 4) }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fornecedores");
    XLSX.writeFile(workbook, "modelo_importacao_fornecedores.xlsx");
  }

  async function handleImportFile(file?: File) {
    resetImportState();
    if (!file) return;

    setImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        defval: "",
      });

      const mappedRows: Partial<Fornecedor>[] = [];
      const rowErrors: string[] = [];

      rawRows.forEach((row, idx) => {
        const excelLine = idx + 2;
        const normalized = normalizeImportRow(row);
        const hasAnyValue = Object.values(normalized).some((value) => String(value ?? "").trim() !== "");
        if (!hasAnyValue) return;

        if (!normalized.razao_social?.trim()) {
          rowErrors.push(`Linha ${excelLine}: Razão Social é obrigatória.`);
          return;
        }

        if (!normalized.empresa?.trim()) {
          rowErrors.push(`Linha ${excelLine}: Empresa é obrigatória.`);
          return;
        }

        mappedRows.push(normalized);
      });

      setImportRows(mappedRows);
      setImportErrors(rowErrors);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Arquivo inválido";
      setImportErrors([`Não foi possível ler a planilha: ${msg}`]);
    }
  }

  async function importarFornecedores() {
    if (!importRows.length) {
      setImportErrors(["Selecione uma planilha com fornecedores válidos antes de importar."]);
      return;
    }

    setImporting(true);
    setImportResult(null);
    const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    try {
      for (let i = 0; i < importRows.length; i += 100) {
        const chunk = importRows.slice(i, i + 100);
        const response = await apiClient.post("/financeiro/fornecedores/importar", {
          fornecedores: chunk,
        });
        const data = response.data?.data || {};
        result.created += Number(data.created || 0);
        result.updated += Number(data.updated || 0);
        result.skipped += Number(data.skipped || 0);
        result.errors.push(...(Array.isArray(data.errors) ? data.errors : []));
      }

      setImportResult(result);
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err instanceof Error ? err.message : "Erro ao importar fornecedores");
      setImportErrors([msg]);
    } finally {
      setImporting(false);
    }
  }

  async function exportarFornecedores() {
    try {
      const response = await apiClient.get("/financeiro/fornecedores/exportar", {
        params: {
          format: "csv",
          ativo: "all",
          empresa: fEmpresa || undefined,
        },
        responseType: "blob",
      });
      const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: "text/csv;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fornecedores.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setImportErrors(["Não foi possível exportar fornecedores. Verifique se o backend v0.3.8 está aplicado."]);
      setShowImport(true);
    }
  }

  async function loadContratos(id: number) {
    setContratosLoading(true);
    setContratoErrors([]);
    try {
      const r = await apiClient.get(`/financeiro/fornecedores/${id}/contratos`);
      setContratos(r.data.data ?? []);
    } catch {
      setContratos([]);
      setContratoErrors(["Não foi possível carregar contratos deste fornecedor."]);
    } finally {
      setContratosLoading(false);
    }
  }

  function setContrato(key: keyof FornecedorContrato, value: string | number | boolean | null) {
    setContratoForm((prev) => ({ ...prev, [key]: value }));
    if (contratoErrors.length) setContratoErrors([]);
  }

  function resetContratoForm() {
    setContratoEditId(null);
    setContratoForm({ ...EMPTY_CONTRATO });
    setContratoErrors([]);
    if (contratoPdfInputRef.current) contratoPdfInputRef.current.value = "";
  }

  async function handleContratoPdf(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setContratoErrors(["Anexe apenas contrato em PDF."]);
      return;
    }
    const base64 = await fileToBase64(file);
    setContratoForm((prev) => ({
      ...prev,
      arquivo_nome: file.name,
      arquivo_mime: file.type,
      arquivo_base64: base64,
    }));
  }

  function editContrato(c: FornecedorContrato) {
    setContratoEditId(c.id);
    setContratoForm({
      ...EMPTY_CONTRATO,
      ...c,
      valor_mensal: Number(c.valor_mensal || 0),
      valor_total: Number(c.valor_total || 0),
      valor_pago: Number(c.valor_pago || 0),
      arquivo_base64: "",
    });
    setContratoErrors([]);
  }

  async function salvarContrato() {
    if (!editId) {
      setContratoErrors(["Salve o fornecedor antes de cadastrar contratos."]);
      return;
    }
    if (!String(contratoForm.titulo || "").trim()) {
      setContratoErrors(["Título / serviço do contrato é obrigatório."]);
      return;
    }

    setContratoSaving(true);
    setContratoErrors([]);
    const payload = {
      ...contratoForm,
      valor_mensal: parseMoneyInput(contratoForm.valor_mensal),
      valor_total: parseMoneyInput(contratoForm.valor_total),
      valor_pago: parseMoneyInput(contratoForm.valor_pago),
    };

    try {
      if (contratoEditId) {
        await apiClient.put(`/financeiro/fornecedores/${editId}/contratos/${contratoEditId}`, payload);
      } else {
        await apiClient.post(`/financeiro/fornecedores/${editId}/contratos`, payload);
      }
      resetContratoForm();
      await loadContratos(editId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err instanceof Error ? err.message : "Erro ao salvar contrato");
      setContratoErrors([msg]);
    } finally {
      setContratoSaving(false);
    }
  }

  async function inativarContrato(c: FornecedorContrato) {
    if (!editId) return;
    if (!window.confirm("Inativar este contrato?")) return;
    try {
      await apiClient.delete(`/financeiro/fornecedores/${editId}/contratos/${c.id}`);
      await loadContratos(editId);
      if (contratoEditId === c.id) resetContratoForm();
    } catch {
      setContratoErrors(["Não foi possível inativar o contrato."]);
    }
  }

  async function abrirContratoPdf(c: FornecedorContrato) {
    if (!editId) return;
    try {
      const r = await apiClient.get(`/financeiro/fornecedores/${editId}/contratos/${c.id}/arquivo`);
      const data = r.data?.data;
      if (!data?.arquivo_base64) return;
      const url = `data:${data.arquivo_mime || "application/pdf"};base64,${data.arquivo_base64}`;
      const win = window.open();
      win?.document.write(`<iframe src="${url}" style="width:100%;height:100%;border:0"></iframe>`);
    } catch {
      setContratoErrors(["Não foi possível abrir o PDF do contrato."]);
    }
  }

  function downloadModeloContratos() {
    const header = CONTRATO_IMPORT_COLUMNS.map((c) => c.label);
    const example = CONTRATO_IMPORT_COLUMNS.map((c) => c.example);
    const worksheet = XLSX.utils.aoa_to_sheet([header, example]);
    worksheet["!cols"] = CONTRATO_IMPORT_COLUMNS.map((c) => ({ wch: Math.max(16, c.label.length + 4) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contratos");
    XLSX.writeFile(workbook, "modelo_importacao_contratos_fornecedor.xlsx");
  }

  function exportarContratosExcel() {
    const rows = contratos.map((c) => ({
      "Título / Serviço": c.titulo,
      "Número do contrato": c.numero_contrato || "",
      Status: statusContratoLabel(c.status),
      "Data assinatura": c.data_assinatura ? fmtData(c.data_assinatura) : "",
      "Data início": c.data_inicio ? fmtData(c.data_inicio) : "",
      "Data fim": c.data_fim ? fmtData(c.data_fim) : "",
      "Data renovação": c.data_renovacao ? fmtData(c.data_renovacao) : "",
      "Índice correção": c.indice_correcao || "",
      "Valor mensal": Number(c.valor_mensal || 0),
      "Valor total": Number(c.valor_total || 0),
      "Valor pago": Number(c.valor_pago || 0),
      Serviços: c.servicos || "",
      Responsável: c.responsavel || "",
      Observações: c.observacoes || "",
      "Arquivo PDF": c.arquivo_nome || "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contratos");
    XLSX.writeFile(workbook, "contratos_fornecedor.xlsx");
  }

  async function handleContratoImportFile(file?: File) {
    setContratoImportRows([]);
    setContratoImportResult(null);
    setContratoErrors([]);
    if (!file) return;
    setContratoImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", raw: false });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      const mappedRows: Partial<FornecedorContrato>[] = [];
      const rowErrors: string[] = [];

      rawRows.forEach((row, idx) => {
        const excelLine = idx + 2;
        const normalized = normalizeContratoImportRow(row);
        const hasAnyValue = Object.values(normalized).some((value) => String(value ?? "").trim() !== "");
        if (!hasAnyValue) return;
        if (!normalized.titulo?.trim()) {
          rowErrors.push(`Linha ${excelLine}: Título / Serviço é obrigatório.`);
          return;
        }
        mappedRows.push(normalized);
      });

      setContratoImportRows(mappedRows);
      setContratoErrors(rowErrors);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Arquivo inválido";
      setContratoErrors([`Não foi possível ler a planilha de contratos: ${msg}`]);
    } finally {
      if (contratoImportInputRef.current) contratoImportInputRef.current.value = "";
    }
  }

  async function importarContratos() {
    if (!editId) return;
    if (!contratoImportRows.length) {
      setContratoErrors(["Selecione uma planilha com contratos válidos antes de importar."]);
      return;
    }
    setContratoImporting(true);
    setContratoImportResult(null);
    const result: ContratoImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    try {
      for (let i = 0; i < contratoImportRows.length; i += 100) {
        const chunk = contratoImportRows.slice(i, i + 100);
        const response = await apiClient.post(`/financeiro/fornecedores/${editId}/contratos/importar`, {
          contratos: chunk,
        });
        const data = response.data?.data || {};
        result.created += Number(data.created || 0);
        result.updated += Number(data.updated || 0);
        result.skipped += Number(data.skipped || 0);
        result.errors.push(...(Array.isArray(data.errors) ? data.errors : []));
      }
      setContratoImportResult(result);
      setContratoImportRows([]);
      setContratoImportFileName("");
      await loadContratos(editId);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message ||
        (err instanceof Error ? err.message : "Erro ao importar contratos");
      setContratoErrors([msg]);
    } finally {
      setContratoImporting(false);
    }
  }

  // ── Helpers UI ─────────────────────────────────────────────────────────────
  // Field wrapper (defined at module level below to avoid re-render on focus loss)

  const inp =
    "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors";
  const sel = inp;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fornecedores</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} cadastros</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportarFornecedores}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-[#1e3a5f] border border-slate-200 text-sm font-semibold rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" /> Exportar fornecedores
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 text-[#1e3a5f] border border-slate-200 text-sm font-semibold rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" /> Importar fornecedores
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo Fornecedor
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={fBusca}
            onChange={(e) => setFBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Buscar por nome ou CNPJ/CPF…"
            className="pl-9 pr-4 py-2 w-full text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={fEmpresa}
          onChange={(e) => setFEmpresa(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
        >
          <option value="">Todas empresas</option>
          {EMPRESAS.filter((e) => e !== "TODOS").map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <select
          value={fCategoria}
          onChange={(e) => setFCategoria(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
        >
          <option value="">Todas categorias</option>
          {CATEGORIAS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={ordenacao}
          onChange={(e) => setOrdenacao(e.target.value)}
          aria-label="Ordenar fornecedores"
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700"
        >
          <option value="nome:asc">Nome: A–Z</option>
          <option value="nome:desc">Nome: Z–A</option>
          <option value="codigo:asc">Código: menor–maior</option>
          <option value="codigo:desc">Código: maior–menor</option>
          <option value="categoria:asc">Categoria: A–Z</option>
          <option value="categoria:desc">Categoria: Z–A</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm" style={{ minWidth: 1060 }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d1b2a] text-white">
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap" aria-sort={ordenacao.startsWith('codigo:') ? (ordenacao.endsWith(':asc') ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleOrdenacao('codigo')} className="inline-flex items-center gap-1.5 hover:text-blue-200" title="Ordenar por código">
                    Código {sortIcon('codigo')}
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap" aria-sort={ordenacao.startsWith('nome:') ? (ordenacao.endsWith(':asc') ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleOrdenacao('nome')} className="inline-flex items-center gap-1.5 hover:text-blue-200" title="Ordenar por razão social ou fantasia">
                    Razão Social / Fantasia {sortIcon('nome')}
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap">CNPJ/CPF</th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap" aria-sort={ordenacao.startsWith('categoria:') ? (ordenacao.endsWith(':asc') ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleOrdenacao('categoria')} className="inline-flex items-center gap-1.5 hover:text-blue-200" title="Ordenar por categoria">
                    Categoria {sortIcon('categoria')}
                  </button>
                </th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap">Empresa</th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap">Banco</th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap">Status</th>
                <th className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div
                          className="h-3 bg-slate-100 rounded animate-pulse"
                          style={{ width: `${50 + ((i * 11 + j * 9) % 40)}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && lista.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center text-slate-400 py-12 text-sm"
                  >
                    Nenhum fornecedor cadastrado
                  </td>
                </tr>
              )}
              {!loading &&
                lista.map((f) => (
                  <tr
                    key={f.id}
                    className={cn(
                      "border-b border-slate-50 hover:bg-slate-50 transition-colors",
                      !f.ativo && "opacity-50",
                    )}
                  >
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{f.id}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800 text-xs">
                        {f.razao_social}
                      </p>
                      {f.nome_fantasia && (
                        <p className="text-slate-400 text-[10px]">
                          {f.nome_fantasia}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {f.cnpj_cpf || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {f.categoria || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">
                        {f.empresa}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {f.banco_nome
                        ? `${f.banco_nome}${f.agencia ? ` ag.${f.agencia}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleAtivo(f)}
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium",
                          f.ativo
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500",
                        )}
                      >
                        {f.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(f)}
                          title="Editar fornecedor"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleAtivo(f)}
                          title={f.ativo ? "Inativar fornecedor" : "Reativar fornecedor"}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
                            f.ativo
                              ? "text-red-600 hover:bg-red-50"
                              : "text-green-700 hover:bg-green-50",
                          )}
                        >
                          {f.ativo ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                          <span>{f.ativo ? "Inativar" : "Reativar"}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <TableFloatingNav scrollRef={tableScrollRef} />

      {/* ── Modal Importação ────────────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">Importar Fornecedores</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Use o modelo da planilha. A importação é enviada em ciclos de 100 fornecedores.
                </p>
              </div>
              <button
                onClick={closeImport}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                <p className="font-semibold mb-1">Modelo obrigatório</p>
                <p>
                  Campos obrigatórios: <strong>Razão Social</strong> e <strong>Empresa</strong>. Se o CNPJ/CPF já existir,
                  o sistema atualiza o fornecedor; se não existir, cria um novo cadastro.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={downloadModeloFornecedores}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" /> Baixar modelo da planilha
                </button>
                <label className="flex items-center justify-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" /> Selecionar planilha
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(e) => handleImportFile(e.target.files?.[0])}
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Colunas aceitas no modelo
                </div>
                <div className="p-3 flex flex-wrap gap-2">
                  {IMPORT_COLUMNS.map((col) => (
                    <span
                      key={col.key}
                      className={cn(
                        "px-2 py-1 rounded-full text-[10px] border",
                        col.required
                          ? "bg-red-50 text-red-700 border-red-100"
                          : "bg-slate-50 text-slate-600 border-slate-100",
                      )}
                    >
                      {col.label}
                    </span>
                  ))}
                </div>
              </div>

              {importFileName && (
                <div className="rounded-xl border border-slate-100 px-4 py-3 text-sm text-slate-600">
                  <p>
                    Arquivo: <strong>{importFileName}</strong>
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Fornecedores válidos encontrados: <strong>{importRows.length}</strong>
                  </p>
                </div>
              )}

              {importErrors.length > 0 && (
                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700 max-h-32 overflow-y-auto">
                  <p className="font-semibold mb-1">Atenção</p>
                  {importErrors.slice(0, 12).map((error) => (
                    <p key={error}>• {error}</p>
                  ))}
                  {importErrors.length > 12 && <p>• ...</p>}
                </div>
              )}

              {importResult && (
                <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700">
                  <p className="font-semibold">Importação concluída</p>
                  <p className="text-xs mt-1">
                    Criados: <strong>{importResult.created}</strong> · Atualizados: <strong>{importResult.updated}</strong> · Ignorados: <strong>{importResult.skipped}</strong>
                  </p>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      {importResult.errors.slice(0, 8).map((error) => (
                        <p key={error}>• {error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button
                onClick={closeImport}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={importarFornecedores}
                disabled={importing || importRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg transition-colors disabled:opacity-60"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Importando…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Importar {importRows.length || ""}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Form ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {editId ? "Editar Fornecedor" : "Novo Fornecedor"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Campos com * são obrigatórios
                </p>
              </div>
              <button
                onClick={closeForm}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6">
              {[
                { id: "dados", label: "Dados", icon: Building2 },
                {
                  id: "historico",
                  label: "Histórico",
                  icon: History,
                  onClick: () => {
                    if (editId) loadHistorico(editId);
                  },
                },
                {
                  id: "contratos",
                  label: "Contratos",
                  icon: FileSignature,
                  onClick: () => {
                    if (editId) loadContratos(editId);
                  },
                },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setFormTab(t.id as FormTab);
                    t.onClick?.();
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                    formTab === t.id
                      ? "border-[#1e3a5f] text-[#1e3a5f]"
                      : "border-transparent text-slate-500 hover:text-slate-700",
                  )}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {(t.id === "historico" || t.id === "contratos") && !editId && (
                    <span className="ml-1 text-[10px] text-slate-400">
                      (salve primeiro)
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab: Dados ── */}
            {formTab === "dados" && (
              <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                {errors._geral && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                    {errors._geral}
                  </div>
                )}

                {/* DADOS PRINCIPAIS */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Dados Principais
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* CNPJ/CPF — primeiro campo com lookup */}
                    <Field label="CNPJ / CPF" name="cnpj_cpf" errors={errors}>
                      <MaskedInput
                        externalValue={form.cnpj_cpf || ""}
                        mask={(v) =>
                          form.tipo_pessoa === "PF" ? maskCPF(v) : maskCNPJ(v)
                        }
                        onCommit={(v) => {
                          setForm((p) => ({ ...p, cnpj_cpf: v }));
                          setCnpjDupError("");
                        }}
                        onComplete={(v) => {
                          if (form.tipo_pessoa !== "PF")
                            lookupCNPJ(onlyDigits(v));
                        }}
                        inputMode="numeric"
                        placeholder={
                          form.tipo_pessoa === "PF"
                            ? "000.000.000-00"
                            : "00.000.000/0000-00"
                        }
                        className={cn(inp, errors.cnpj_cpf && "border-red-300")}
                        icon={
                          cnpjLoading ? (
                            <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                          ) : cnpjStatus === "ok" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : cnpjStatus === "err" || cnpjDupError ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          ) : undefined
                        }
                      />
                      {cnpjDupError && (
                        <p className="text-[10px] text-red-500 mt-0.5">
                          {cnpjDupError}
                        </p>
                      )}
                    </Field>

                    <Field
                      label="Tipo de Pessoa"
                      name="tipo_pessoa"
                      required
                      errors={errors}
                    >
                      <select
                        className={sel}
                        value={form.tipo_pessoa || "PJ"}
                        onChange={(e) => {
                          set("tipo_pessoa", e.target.value);
                          setCnpjStatus("idle");
                        }}
                      >
                        <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                        <option value="PF">Pessoa Física (CPF)</option>
                      </select>
                    </Field>

                    <Field
                      label="Razão Social"
                      name="razao_social"
                      required
                      errors={errors}
                    >
                      <input
                        className={cn(
                          inp,
                          errors.razao_social && "border-red-300",
                        )}
                        value={form.razao_social || ""}
                        onChange={(e) => set("razao_social", e.target.value)}
                        placeholder="Nome completo / razão social"
                      />
                    </Field>

                    <Field
                      label="Nome Fantasia"
                      name="nome_fantasia"
                      errors={errors}
                    >
                      <input
                        className={inp}
                        value={form.nome_fantasia || ""}
                        onChange={(e) => set("nome_fantasia", e.target.value)}
                        placeholder="Nome fantasia"
                      />
                    </Field>

                    <Field label="Categoria" name="categoria" errors={errors}>
                      <select
                        className={sel}
                        value={form.categoria || ""}
                        onChange={(e) => set("categoria", e.target.value)}
                      >
                        <option value="">Selecione</option>
                        {CATEGORIAS.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label="Empresa"
                      name="empresa"
                      required
                      errors={errors}
                    >
                      <select
                        className={cn(sel, errors.empresa && "border-red-300")}
                        value={form.empresa || "TODOS"}
                        onChange={(e) => set("empresa", e.target.value)}
                      >
                        {EMPRESAS.map((e) => (
                          <option key={e}>{e}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="E-mail" name="email" errors={errors}>
                      <input
                        className={inp}
                        type="email"
                        value={form.email || ""}
                        onChange={(e) => set("email", e.target.value)}
                        placeholder="email@fornecedor.com"
                      />
                    </Field>

                    <Field label="Telefone" name="telefone" errors={errors}>
                      <MaskedInput
                        externalValue={form.telefone || ""}
                        mask={maskPhone}
                        onCommit={(v) => set("telefone", v)}
                        inputMode="numeric"
                        placeholder="(11) 99999-9999"
                        className={inp}
                      />
                    </Field>
                  </div>
                </div>

                {/* ENDEREÇO */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Endereço
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CEP" name="cep" errors={errors}>
                      <div className="relative">
                        <MaskedInput
                          externalValue={form.cep || ""}
                          mask={maskCEP}
                          onCommit={(v) => set("cep", v)}
                          onComplete={(v) => {
                            if (onlyDigits(v).length === 8) lookupCEP(v);
                          }}
                          inputMode="numeric"
                          placeholder="00000-000"
                          className={inp}
                          icon={
                            cepLoading ? (
                              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                            ) : undefined
                          }
                        />
                      </div>
                    </Field>

                    <Field label="Cidade / UF" name="cidade_uf" errors={errors}>
                      <input
                        className={inp}
                        value={form.cidade_uf || ""}
                        onChange={(e) => set("cidade_uf", e.target.value)}
                        placeholder="São Paulo - SP"
                      />
                    </Field>

                    <Field
                      label="Endereço completo"
                      name="endereco"
                      col2
                      errors={errors}
                    >
                      <input
                        className={inp}
                        value={form.endereco || ""}
                        onChange={(e) => set("endereco", e.target.value)}
                        placeholder="Rua, número, complemento, bairro"
                      />
                    </Field>
                  </div>
                </div>

                {/* DADOS BANCÁRIOS */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Dados Bancários
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Banco" name="banco_nome" errors={errors}>
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
                      label="Tipo de Conta"
                      name="tipo_conta"
                      errors={errors}
                    >
                      <select
                        className={sel}
                        value={form.tipo_conta || "Corrente"}
                        onChange={(e) => set("tipo_conta", e.target.value)}
                      >
                        <option>Corrente</option>
                        <option>Poupança</option>
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
                        placeholder="00000"
                      />
                    </Field>

                    <Field label="Dígito" name="digito" errors={errors}>
                      <input
                        className={inp}
                        value={form.digito || ""}
                        onChange={(e) =>
                          set(
                            "digito",
                            e.target.value.replace(/\D/g, "").slice(0, 2),
                          )
                        }
                        inputMode="numeric"
                        placeholder="0"
                        maxLength={2}
                      />
                    </Field>

                    <Field
                      label="Chave PIX"
                      name="chave_pix"
                      col2
                      errors={errors}
                    >
                      <input
                        className={inp}
                        value={form.chave_pix || ""}
                        onChange={(e) => set("chave_pix", e.target.value)}
                        placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
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
                </div>
              </div>
            )}

            {/* ── Tab: Histórico ── */}
            {formTab === "historico" && (
              <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-4">
                {!editId ? (
                  <p className="text-sm text-slate-400 text-center py-10">
                    Salve o fornecedor primeiro para ver o histórico.
                  </p>
                ) : histLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  </div>
                ) : historico ? (
                  <>
                    {/* Cards resumo */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        {
                          label: "Total contas",
                          value: historico.total_contas,
                          icon: FileText,
                          color: "bg-blue-50   text-blue-700",
                        },
                        {
                          label: "Total pago",
                          value: fmtMoeda(historico.total_pago),
                          icon: CheckCircle2,
                          color: "bg-green-50  text-green-700",
                        },
                        {
                          label: "Em aberto",
                          value: fmtMoeda(historico.total_aberto),
                          icon: Clock,
                          color: "bg-yellow-50 text-yellow-700",
                        },
                        {
                          label: "Vencido",
                          value: fmtMoeda(historico.total_vencido),
                          icon: TrendingDown,
                          color: "bg-red-50    text-red-700",
                        },
                      ].map((c) => (
                        <div
                          key={c.label}
                          className={cn(
                            "rounded-xl p-3 flex items-center gap-3",
                            c.color,
                          )}
                        >
                          <c.icon className="w-5 h-5 flex-shrink-0 opacity-70" />
                          <div>
                            <p className="text-[10px] font-semibold uppercase opacity-70">
                              {c.label}
                            </p>
                            <p className="text-sm font-bold">{c.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela de lançamentos */}
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">
                              Descrição
                            </th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">
                              Vencimento
                            </th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">
                              Valor
                            </th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">
                              Status
                            </th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">
                              Pago em
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {historico.itens.length === 0 && (
                            <tr>
                              <td
                                colSpan={5}
                                className="text-center text-slate-400 py-8"
                              >
                                Nenhum lançamento encontrado
                              </td>
                            </tr>
                          )}
                          {historico.itens.map((item) => (
                            <tr
                              key={item.id}
                              className="border-b border-slate-50 hover:bg-slate-50"
                            >
                              <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate">
                                {item.descricao}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                {new Date(
                                  item.vencimento + "T00:00:00",
                                ).toLocaleDateString("pt-BR")}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                                {fmtMoeda(item.valor)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={cn(
                                    "px-2 py-0.5 rounded-full text-[10px] font-medium",
                                    {
                                      "bg-green-100 text-green-700":
                                        item.status === "pago",
                                      "bg-yellow-100 text-yellow-700":
                                        item.status === "aberto",
                                      "bg-red-100 text-red-600":
                                        item.status === "vencido",
                                    },
                                  )}
                                >
                                  {item.status.charAt(0).toUpperCase() +
                                    item.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                {item.pago_em
                                  ? new Date(
                                      item.pago_em + "T00:00:00",
                                    ).toLocaleDateString("pt-BR")
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">
                    Clique na aba Histórico para carregar.
                  </p>
                )}
              </div>
            )}

            {/* ── Tab: Contratos ── */}
            {formTab === "contratos" && (
              <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-4">
                {!editId ? (
                  <p className="text-sm text-slate-400 text-center py-10">
                    Salve o fornecedor primeiro para cadastrar contratos.
                  </p>
                ) : (
                  <>
                    {contratoErrors.length > 0 && (
                      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700 max-h-32 overflow-y-auto">
                        {contratoErrors.slice(0, 8).map((error) => (
                          <p key={error}>• {error}</p>
                        ))}
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                            Gestão de contratos
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Assinatura, renovação, índice de correção, valores, serviços e PDF assinado.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={downloadModeloContratos}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            <Download className="w-3.5 h-3.5" /> Modelo
                          </button>
                          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" /> Importar
                            <input
                              ref={contratoImportInputRef}
                              type="file"
                              accept=".xlsx,.xls,.csv"
                              className="hidden"
                              onChange={(e) => handleContratoImportFile(e.target.files?.[0])}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={exportarContratosExcel}
                            disabled={contratos.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" /> Exportar
                          </button>
                        </div>
                      </div>

                      {contratoImportFileName && (
                        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-center justify-between gap-2 flex-wrap">
                          <span>
                            Planilha: <strong>{contratoImportFileName}</strong> · {contratoImportRows.length} contratos válidos
                          </span>
                          <button
                            type="button"
                            onClick={importarContratos}
                            disabled={contratoImporting || contratoImportRows.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg font-semibold disabled:opacity-60"
                          >
                            {contratoImporting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            Importar contratos
                          </button>
                        </div>
                      )}

                      {contratoImportResult && (
                        <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-xs text-green-700">
                          Criados: <strong>{contratoImportResult.created}</strong> · Atualizados: <strong>{contratoImportResult.updated}</strong> · Ignorados: <strong>{contratoImportResult.skipped}</strong>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Título / Serviço" name="contrato_titulo" required errors={{}}>
                          <input
                            className={inp}
                            value={contratoForm.titulo || ""}
                            onChange={(e) => setContrato("titulo", e.target.value)}
                            placeholder="Ex: Contrato de manutenção"
                          />
                        </Field>
                        <Field label="Número do contrato" name="numero_contrato" errors={{}}>
                          <input
                            className={inp}
                            value={contratoForm.numero_contrato || ""}
                            onChange={(e) => setContrato("numero_contrato", e.target.value)}
                            placeholder="CTR-2026-001"
                          />
                        </Field>
                        <Field label="Status" name="status" errors={{}}>
                          <select
                            className={sel}
                            value={contratoForm.status || "ativo"}
                            onChange={(e) => setContrato("status", e.target.value)}
                          >
                            {CONTRATO_STATUS.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Índice de correção" name="indice_correcao" errors={{}}>
                          <input
                            className={inp}
                            value={contratoForm.indice_correcao || ""}
                            onChange={(e) => setContrato("indice_correcao", e.target.value)}
                            placeholder="IPCA, IGPM, fixo..."
                          />
                        </Field>
                        <Field label="Data assinatura" name="data_assinatura" errors={{}}>
                          <input type="date" className={inp} value={contratoForm.data_assinatura || ""} onChange={(e) => setContrato("data_assinatura", e.target.value)} />
                        </Field>
                        <Field label="Data início" name="data_inicio" errors={{}}>
                          <input type="date" className={inp} value={contratoForm.data_inicio || ""} onChange={(e) => setContrato("data_inicio", e.target.value)} />
                        </Field>
                        <Field label="Data fim" name="data_fim" errors={{}}>
                          <input type="date" className={inp} value={contratoForm.data_fim || ""} onChange={(e) => setContrato("data_fim", e.target.value)} />
                        </Field>
                        <Field label="Renovação" name="data_renovacao" errors={{}}>
                          <input type="date" className={inp} value={contratoForm.data_renovacao || ""} onChange={(e) => setContrato("data_renovacao", e.target.value)} />
                        </Field>
                        <Field label="Valor mensal" name="valor_mensal" errors={{}}>
                          <input
                            className={inp}
                            inputMode="decimal"
                            value={String(contratoForm.valor_mensal ?? "")}
                            onChange={(e) => setContrato("valor_mensal", e.target.value)}
                            placeholder="0,00"
                          />
                        </Field>
                        <Field label="Valor total" name="valor_total" errors={{}}>
                          <input
                            className={inp}
                            inputMode="decimal"
                            value={String(contratoForm.valor_total ?? "")}
                            onChange={(e) => setContrato("valor_total", e.target.value)}
                            placeholder="0,00"
                          />
                        </Field>
                        <Field label="Valor pago" name="valor_pago" errors={{}}>
                          <input
                            className={inp}
                            inputMode="decimal"
                            value={String(contratoForm.valor_pago ?? "")}
                            onChange={(e) => setContrato("valor_pago", e.target.value)}
                            placeholder="0,00"
                          />
                        </Field>
                        <Field label="Responsável" name="responsavel" errors={{}}>
                          <input
                            className={inp}
                            value={contratoForm.responsavel || ""}
                            onChange={(e) => setContrato("responsavel", e.target.value)}
                            placeholder="Responsável interno"
                          />
                        </Field>
                        <Field label="Serviços contratados" name="servicos" col2 errors={{}}>
                          <textarea
                            className={cn(inp, "min-h-[62px] resize-none")}
                            value={contratoForm.servicos || ""}
                            onChange={(e) => setContrato("servicos", e.target.value)}
                            placeholder="Descreva os serviços vinculados ao contrato"
                          />
                        </Field>
                        <Field label="Observações" name="observacoes" col2 errors={{}}>
                          <textarea
                            className={cn(inp, "min-h-[56px] resize-none")}
                            value={contratoForm.observacoes || ""}
                            onChange={(e) => setContrato("observacoes", e.target.value)}
                            placeholder="Renovação, reajuste, cláusulas importantes..."
                          />
                        </Field>
                        <div className="col-span-2 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-slate-200 bg-white px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5" /> PDF assinado
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {contratoForm.arquivo_nome || "Nenhum PDF anexado"}
                            </p>
                          </div>
                          <label className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer">
                            Anexar PDF
                            <input
                              ref={contratoPdfInputRef}
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              onChange={(e) => handleContratoPdf(e.target.files?.[0])}
                            />
                          </label>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={resetContratoForm}
                          className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          onClick={salvarContrato}
                          disabled={contratoSaving}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60"
                        >
                          {contratoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {contratoEditId ? "Atualizar contrato" : "Salvar contrato"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-600">Contratos cadastrados</p>
                        <span className="text-[10px] text-slate-400">{contratos.length} registros</span>
                      </div>
                      {contratosLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-500">
                                <th className="text-left px-3 py-2 font-semibold">Contrato</th>
                                <th className="text-left px-3 py-2 font-semibold">Status</th>
                                <th className="text-left px-3 py-2 font-semibold">Renovação</th>
                                <th className="text-right px-3 py-2 font-semibold">Valor pago</th>
                                <th className="text-left px-3 py-2 font-semibold">PDF</th>
                                <th className="text-left px-3 py-2 font-semibold">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {contratos.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="text-center text-slate-400 py-8">
                                    Nenhum contrato cadastrado
                                  </td>
                                </tr>
                              )}
                              {contratos.map((c) => (
                                <tr key={c.id} className={cn("border-b border-slate-50 hover:bg-slate-50", !c.ativo && "opacity-50")}>
                                  <td className="px-3 py-2.5 max-w-[220px]">
                                    <p className="font-medium text-slate-700 truncate">{c.titulo}</p>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {c.numero_contrato || "Sem número"} · {c.servicos || "Sem descrição"}
                                    </p>
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                                      {statusContratoLabel(c.status)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1">
                                      <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> {fmtData(c.data_renovacao || c.data_fim)}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-medium text-slate-700 whitespace-nowrap">
                                    {fmtMoeda(Number(c.valor_pago || 0))}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    {c.arquivo_nome || c.tem_arquivo ? (
                                      <button
                                        type="button"
                                        onClick={() => abrirContratoPdf(c)}
                                        className="inline-flex items-center gap-1 text-[#1e3a5f] hover:underline"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" /> PDF
                                      </button>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => editContrato(c)}
                                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                                      title="Editar contrato"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => inativarContrato(c)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                                      title="Inativar contrato"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button
                onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !!cnpjDupError}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg transition-colors disabled:opacity-60"
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
    </div>
  );
}
