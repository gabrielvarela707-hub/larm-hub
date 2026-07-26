'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Search, X, Check, FileText, Loader2, Sparkles, Pencil, Trash2, ChevronsUpDown, RotateCcw, Download, Eye, Landmark, CreditCard, Percent } from 'lucide-react'
import TableFloatingNav from '@/components/table-floating-nav'
import { apiClient } from '@/lib/auth-store'
import { BANCOS_BR } from '@/lib/bancos-br'
import { cn } from '@/lib/utils'
import FornecedorFormModal, { type Fornecedor as FornecedorCompleto } from '@/components/financeiro/FornecedorFormModal'
import BancoSearchSelect from '@/components/financeiro/BancoSearchSelect'

interface FornecedorOption {
  id: number
  razao_social: string
  empresa: string
  cnpj_cpf?: string | null
  nome_fantasia?: string | null
  chave_pix?: string | null
  banco_nome?: string | null
  codigo_banco?: string | null
  agencia?: string | null
  conta?: string | null
  digito?: string | null
  tipo_conta?: string | null
}
type ModalidadePagamento =
  | ''
  | 'PIX'
  | 'BOLETO'
  | 'TED'
  | 'DOC'
  | 'TRANSFERENCIA'
  | 'DEBITO_AUTOMATICO'
  | 'DINHEIRO'
  | 'CARTAO'
  | 'OUTRO'
interface BoletoNovo {
  temp_id: string
  nome: string
  mime: string
  tamanho_bytes: number
  arquivo_base64: string
}
interface BoletoExistente {
  id: number
  nome: string
  mime: string
  tamanho_bytes: number
  created_at?: string | null
}
interface BancoConta { id: number; empresa: string; banco_nome: string; agencia: string | null; conta: string | null; digito?: string | null }
interface PlanoConta  { id: number; codigo: string; descricao: string; tipo: string }
interface TipoDocumento { id: number; nome: string }
type DocumentoParcelaId = number | string | null
type RetencaoKey = 'retencao_iss' | 'retencao_pis' | 'retencao_cofins' | 'retencao_csll' | 'retencao_irrf' | 'retencao_inss'
interface Parcela     {
  id?: number
  numero: number
  valor: number | string
  vencimento: string
  status: string
  tipo_documento_id?: DocumentoParcelaId
  tipo_documento_nome?: string | null
  numero_documento?: string | null
  acrescimo?: number | string
  multa?: number | string
  juros?: number | string
  desconto?: number | string
  retencao_iss?: number | string
  retencao_pis?: number | string
  retencao_cofins?: number | string
  retencao_csll?: number | string
  retencao_irrf?: number | string
  retencao_inss?: number | string
  valor_final?: number | string
}
interface NovoFornecedorForm {
  razao_social: string
  nome_fantasia: string
  cnpj_cpf: string
  tipo_pessoa: 'PJ' | 'PF'
  empresa: string
  codigo: string
  email: string
  telefone: string
  cep: string
  endereco: string
  cidade_uf: string
  codigo_banco: string
  banco_nome: string
  agencia: string
  conta: string
  digito: string
  tipo_conta: string
  chave_pix: string
  tipo_pix: string
}
type SortKey = 'empresa' | 'fornecedor' | 'tipo_documento' | 'numero' | 'parcela' | 'valor' | 'emissao' | 'vencimento' | 'pagamento' | 'status'
interface AiContaPagarResult {
  fornecedor_nome?: string | null
  fornecedor_cnpj?: string | null
  tipo_documento?: string | null
  numero_documento?: string | null
  historico?: string | null
  data_emissao?: string | null
  data_vencimento?: string | null
  valor_total?: number | null
  parcelas?: { numero: number; valor: number; vencimento: string }[]
}

interface RateioFormItem {
  plano_contas_id: string
  centro_custo: string
  historico: string
  percentual: string
  valor: string
}

interface Lancamento {
  id: number; empresa: string; historico: string; produto_servico: string | null
  rateio_id?: number | string | null
  rateio_contabil_id?: number | string | null
  rateio_contabil_total_itens?: number | null
  banco_conta_id?: number | null; banco_agencia?: string | null; banco_conta?: string | null
  tipo_documento_id?: number | null; tipo_documento_nome?: string | null
  nf_doc: string | null; documento_nome?: string | null; dt_emissao: string | null; valor_total: number
  qtd_parcelas: number; status: string; conta_contabil: string | null
  descricao_conta: string | null; centro_custo: string | null; obs: string | null
  fornecedor_nome: string | null; banco_nome: string | null; proximo_venc: string | null
  parcela_id?: number | null; parcela_numero?: number | null; parcela_valor?: number | null
  parcela_tipo_documento_id?: number | null; parcela_tipo_documento_nome?: string | null
  parcela_numero_documento?: string | null
  parcela_vencimento?: string | null; parcela_status?: string | null; parcela_dt_pagamento?: string | null
  parcela_motivo_baixa?: string | null; parcela_acrescimo?: number | null; parcela_desconto?: number | null
  parcela_juros?: number | null; parcela_multa?: number | null; parcela_valor_final?: number | null
  parcela_retencao_ipi?: number | null; parcela_retencao_iss?: number | null; parcela_retencao_icms?: number | null
  parcela_retencao_pis?: number | null; parcela_retencao_cofins?: number | null; parcela_retencao_csll?: number | null
  parcela_retencao_irrf?: number | null; parcela_retencao_inss?: number | null
  parcela_baixa_acrescimo?: number | null; parcela_baixa_desconto?: number | null
  parcela_baixa_juros?: number | null; parcela_baixa_multa?: number | null; parcela_baixa_valor_final?: number | null
  parcela_forma_pagamento?: string | null
}

interface BaixaForm {
  valor_parcela: string
  motivo_baixa: string
  acrescimo: string
  desconto: string
  juros: string
  multa: string
  valor_final: string
  forma_pagamento: string
  banco_conta_id: string
  dt_pagamento: string
}

const EMPRESAS = ['LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  pago:     'bg-green-100 text-green-700',
  vencido:  'bg-red-100 text-red-700',
  cancelado:'bg-slate-100 text-slate-500',
}

const RETENCOES: Array<{ key: RetencaoKey; label: string }> = [
  { key: 'retencao_iss', label: 'ISS' },
  { key: 'retencao_pis', label: 'PIS' },
  { key: 'retencao_cofins', label: 'COFINS' },
  { key: 'retencao_csll', label: 'CSL / CSLL' },
  { key: 'retencao_irrf', label: 'IRRF' },
  { key: 'retencao_inss', label: 'INSS' },
]
const RETENCAO_KEYS = RETENCOES.map(item => item.key)

const R$ = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const toDateInputValue = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
const todayISO = () => toDateInputValue()
const dateOnly = (value: string | null | undefined) => {
  if (!value) return ''
  const raw = String(value).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const dt = new Date(value)
  return Number.isNaN(dt.getTime()) ? '' : toDateInputValue(dt)
}
const addMonthsDateOnly = (baseDate: string, months: number) => {
  const [ano, mes, dia] = (dateOnly(baseDate) || todayISO()).split('-').map(Number)
  const dt = new Date(ano, mes - 1, dia)
  dt.setMonth(dt.getMonth() + months)
  return toDateInputValue(dt)
}
const moneyToNumber = (v: string | number | null | undefined) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0

  const raw = String(v ?? '').trim()
  if (!raw) return 0

  // Campo type=number normalmente envia decimal com ponto (500.00).
  // Campo digitado em PT-BR pode vir com vírgula (500,00).
  // Antes removíamos todo ponto, o que transformava 500.00 em 50000.
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw

  const n = Number(normalized.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const fmtDate = (d: string | null | undefined) => {
  const iso = dateOnly(d)
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
const toFiniteNumber = (v: string | number | null | undefined, fallback = 0) => {
  const n = moneyToNumber(v)
  return Number.isFinite(n) ? n : fallback
}
const decimalInputValue = (v: string | number | null | undefined) => {
  if (v === undefined || v === null || v === '') return ''

  if (typeof v === 'string') {
    const raw = v.trim()
    if (!raw) return ''

    // Valores vindos do PostgreSQL podem chegar como string decimal técnico,
    // ex.: "1500.0000". Nesse caso, formatamos para PT-BR.
    // Valores digitados pelo usuário com vírgula ou sem separador são preservados
    // para não atrapalhar a digitação.
    if (/^-?\d+\.\d+$/.test(raw) && !raw.includes(',')) {
      const n = moneyToNumber(raw)
      if (n === 0) return ''
      return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    return raw
  }

  const n = toFiniteNumber(v, 0)
  if (n === 0) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const RATEIO_PERCENT_SCALE = 1_000_000
const RATEIO_HUNDRED_PERCENT = 100 * RATEIO_PERCENT_SCALE
const rateioMoneyToCents = (value: string | number | null | undefined) =>
  Math.round((moneyToNumber(value) + Number.EPSILON) * 100)
const rateioPercentToScaled = (value: string | number | null | undefined) =>
  Math.round(moneyToNumber(value) * RATEIO_PERCENT_SCALE)
const rateioMoneyInput = (cents: number) =>
  (Math.max(0, cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rateioPercentInput = (scaled: number) =>
  (Math.max(0, scaled) / RATEIO_PERCENT_SCALE).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
const calculaTotalRetencoes = (p: Partial<Parcela>) =>
  RETENCAO_KEYS.reduce((total, key) => total + toFiniteNumber(p[key]), 0)
const calculaValorFinalParcela = (p: Partial<Parcela>) =>
  Math.max(
    0,
    toFiniteNumber(p.valor)
      + toFiniteNumber(p.acrescimo)
      + toFiniteNumber(p.multa)
      + toFiniteNumber(p.juros)
      - toFiniteNumber(p.desconto)
      - calculaTotalRetencoes(p),
  )
const normalizaParcelaPayload = (p: Parcela, idx: number): Parcela => {
  const next: Parcela = {
    id: p.id,
    numero: Number(p.numero) || idx + 1,
    valor: toFiniteNumber(p.valor),
    vencimento: dateOnly(p.vencimento) || todayISO(),
    status: p.status || 'pendente',
    tipo_documento_id: p.tipo_documento_id ? String(p.tipo_documento_id) : null,
    numero_documento: String(p.numero_documento || '').trim() || null,
    acrescimo: toFiniteNumber(p.acrescimo),
    multa: toFiniteNumber(p.multa),
    juros: toFiniteNumber(p.juros),
    desconto: toFiniteNumber(p.desconto),
    retencao_iss: toFiniteNumber(p.retencao_iss),
    retencao_pis: toFiniteNumber(p.retencao_pis),
    retencao_cofins: toFiniteNumber(p.retencao_cofins),
    retencao_csll: toFiniteNumber(p.retencao_csll),
    retencao_irrf: toFiniteNumber(p.retencao_irrf),
    retencao_inss: toFiniteNumber(p.retencao_inss),
  }
  next.valor_final = calculaValorFinalParcela(next)
  return next
}
const sortText = (v: unknown) => String(v ?? '').toLocaleLowerCase('pt-BR')
const sortDate = (v: string | null | undefined) => v ? (Date.parse(v) || 0) : 0
const calculaTotalRetencoesLancamento = (l: Lancamento) =>
  Number(l.parcela_retencao_iss || 0)
  + Number(l.parcela_retencao_pis || 0)
  + Number(l.parcela_retencao_cofins || 0)
  + Number(l.parcela_retencao_csll || 0)
  + Number(l.parcela_retencao_irrf || 0)
  + Number(l.parcela_retencao_inss || 0)
const getSortValue = (l: Lancamento, key: SortKey): string | number => {
  switch (key) {
    case 'empresa': return sortText(l.empresa)
    case 'fornecedor': return sortText(l.fornecedor_nome)
    case 'tipo_documento': return sortText(l.parcela_tipo_documento_nome || l.tipo_documento_nome)
    case 'numero': return sortText(l.parcela_numero_documento || l.nf_doc)
    case 'parcela': return Number(l.parcela_numero || 0)
    case 'valor': {
      const valor = Number(l.parcela_valor ?? l.valor_total ?? 0)
      const final = l.parcela_valor_final === null || l.parcela_valor_final === undefined
        ? valor + Number(l.parcela_acrescimo || 0) + Number(l.parcela_multa || 0) + Number(l.parcela_juros || 0) - Number(l.parcela_desconto || 0) - calculaTotalRetencoesLancamento(l)
        : Number(l.parcela_valor_final)
      return Number.isFinite(final) ? final : valor
    }
    case 'emissao': return sortDate(l.dt_emissao)
    case 'vencimento': return sortDate(l.parcela_vencimento || l.proximo_venc)
    case 'pagamento': return sortDate(l.parcela_dt_pagamento)
    case 'status': return sortText(l.parcela_status || l.status)
    default: return ''
  }
}

const getFornecedorDisplay = (l: Lancamento) => {
  const nome = String(l.fornecedor_nome || '').trim()
  const semFornecedor = !nome || nome.toLocaleLowerCase('pt-BR').includes('não identificado')
  if (semFornecedor) return l.historico?.trim() || nome || '—'
  return nome
}

const getFornecedorSubtitle = (l: Lancamento) => {
  const nome = String(l.fornecedor_nome || '').trim()
  const semFornecedor = !nome || nome.toLocaleLowerCase('pt-BR').includes('não identificado')
  if (semFornecedor && l.historico?.trim()) return nome || 'Fornecedor não identificado'
  return l.banco_nome || ''
}


// ─── PlanoContasSelect ───────────────────────────────────────────────────────
function PlanoContasSelect({ value, onChange, contas, inp }: { value: string; onChange: (v: string) => void; contas: PlanoConta[]; inp: string }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const termo = busca.toLowerCase().trim()
  const filtered = contas.filter(c =>
    c.codigo.includes(busca) || c.descricao.toLowerCase().includes(termo)
  ).slice(0, 80)
  const selected = contas.find(c => c.codigo === value)

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(inp, 'flex items-center justify-between gap-2 text-left')}>
        <span className={cn('truncate', selected ? 'text-slate-700' : 'text-slate-400')}>
          {selected ? `${selected.codigo} — ${selected.descricao}` : 'Selecione o plano…'}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-[70] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código ou descrição…"
              className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 bg-white outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setBusca('') }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50">— Nenhum —</button>
            {filtered.map(c => (
              <button key={c.codigo} type="button"
                onClick={() => { onChange(c.codigo); setOpen(false); setBusca('') }}
                className={cn('w-full text-left px-3 py-2 text-xs hover:bg-blue-50', value === c.codigo && 'bg-blue-50 font-medium')}>
                <span className="font-mono text-blue-600 mr-2">{c.codigo}</span>{c.descricao}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">Nenhum plano encontrado</p>}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── FornecedorSelect ───────────────────────────────────────────────────────
function fornecedorLabel(f: FornecedorOption) {
  const nome = f.nome_fantasia?.trim() || f.razao_social
  const doc = f.cnpj_cpf ? ` · ${f.cnpj_cpf}` : ''
  return `${nome}${doc}`
}

function FornecedorSelect({
  value,
  onChange,
  fornecedores,
  inp,
  placeholder = 'Selecione (opcional)',
  emptyLabel = '— Nenhum —',
}: {
  value: string
  onChange: (v: string) => void
  fornecedores: FornecedorOption[]
  inp: string
  placeholder?: string
  emptyLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const termo = busca.toLowerCase().trim()
  const filtered = fornecedores.filter(f => {
    const campos = [f.razao_social, f.nome_fantasia, f.cnpj_cpf, f.empresa]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return !termo || campos.includes(termo)
  }).slice(0, 80)
  const selected = fornecedores.find(f => String(f.id) === String(value))

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(inp, 'flex items-center justify-between gap-2 text-left')}>
        <span className={cn('truncate', selected ? 'text-slate-700' : 'text-slate-400')}>
          {selected ? fornecedorLabel(selected) : placeholder}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-[70] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, fantasia, CNPJ ou empresa…"
              className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 bg-white outline-none" />
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setBusca('') }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50">{emptyLabel}</button>
            {filtered.map(f => (
              <button key={f.id} type="button"
                onClick={() => { onChange(String(f.id)); setOpen(false); setBusca('') }}
                className={cn('w-full text-left px-3 py-2 text-xs hover:bg-blue-50', String(value) === String(f.id) && 'bg-blue-50 font-medium')}>
                <span className="block truncate text-slate-700">{f.razao_social}</span>
                <span className="block truncate text-[10px] text-slate-400">
                  {[f.nome_fantasia, f.cnpj_cpf, f.empresa].filter(Boolean).join(' · ') || 'Sem dados complementares'}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">Nenhum fornecedor encontrado</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PagarPage() {
  const [lista,     setLista]     = useState<Lancamento[]>([])
  const [total,     setTotal]     = useState(0)
  const [totalVlr,  setTotalVlr]  = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [showFornecedorModal, setShowFornecedorModal] = useState(false)
  const [editingFornecedorId, setEditingFornecedorId] = useState<number | null>(null)
  const [editingFornecedorData, setEditingFornecedorData] = useState<Partial<FornecedorCompleto> | undefined>(undefined)
  const [savingFornecedor, setSavingFornecedor] = useState(false)
  const [fornecedorErrors, setFornecedorErrors] = useState<Record<string, string>>({})
  const [showBaixaModal, setShowBaixaModal] = useState(false)
  const [savingBaixa, setSavingBaixa] = useState(false)
  const [baixaErrors, setBaixaErrors] = useState<Record<string, string>>({})
  // ── edit / delete ──────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletingLoading, setDeletingLoading] = useState(false)
  const [cancelandoBaixa, setCancelandoBaixa] = useState<string | null>(null)
  const [baixaParcela, setBaixaParcela] = useState<Lancamento | null>(null)
  const [baixaForm, setBaixaForm] = useState<BaixaForm>({
    valor_parcela: '',
    motivo_baixa: '',
    acrescimo: '0',
    desconto: '0',
    juros: '0',
    multa: '0',
    valor_final: '',
    forma_pagamento: '',
    banco_conta_id: '',
    dt_pagamento: todayISO(),
  })

  // Listas para selects
  const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([])
  const [bancos,       setBancos]       = useState<BancoConta[]>([])
  const [plano,        setPlano]        = useState<PlanoConta[]>([])
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([])

  // Filtros
  const [fEmpresa, setFEmpresa] = useState('')
  const [fFornecedorFiltro, setFFornecedorFiltro] = useState('')
  const [fTipoDocFiltro, setFTipoDocFiltro] = useState('')
  const [fPeriodoInicio, setFPeriodoInicio] = useState('')
  const [fPeriodoFim, setFPeriodoFim] = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fBusca,   setFBusca]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('vencimento')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const topTableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableMinWidth = 1280

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  // Form state
  const [fEmp,     setFEmp]     = useState('')
  const [fForn,    setFForn]    = useState('')
  const [fBanco,   setFBanco]   = useState('')
  const [fConta,   setFConta]   = useState('')
  const [fHistorico, setFHistorico] = useState('')
  const [fTipoDoc, setFTipoDoc] = useState('')
  const [fNF,      setFNF]      = useState('')
  const [fEmissao, setFEmissao] = useState(todayISO())
  const [fValor,   setFValor]   = useState('')
  const [fNParc,   setFNParc]   = useState(1)
  const [fRateioAtivo, setFRateioAtivo] = useState(false)
  const [rateios, setRateios] = useState<RateioFormItem[]>([])
  const [fCC,      setFCC]      = useState('')
  const [fObs,     setFObs]     = useState('')
  const [fModalidadePagamento, setFModalidadePagamento] = useState<ModalidadePagamento>('')
  const [fChavePixPagamento, setFChavePixPagamento] = useState('')
  const [fBancoPagamentoNome, setFBancoPagamentoNome] = useState('')
  const [fBancoPagamentoCodigo, setFBancoPagamentoCodigo] = useState('')
  const [fAgenciaPagamento, setFAgenciaPagamento] = useState('')
  const [fContaPagamento, setFContaPagamento] = useState('')
  const [fDigitoPagamento, setFDigitoPagamento] = useState('')
  const [fTipoContaPagamento, setFTipoContaPagamento] = useState('')
  const [fLinhaDigitavelBoleto, setFLinhaDigitavelBoleto] = useState('')
  const [boletosNovos, setBoletosNovos] = useState<BoletoNovo[]>([])
  const [boletosExistentes, setBoletosExistentes] = useState<BoletoExistente[]>([])
  const [boletosRemovidos, setBoletosRemovidos] = useState<number[]>([])
  const [boletoErro, setBoletoErro] = useState('')
  const [novoFornecedor, setNovoFornecedor] = useState<NovoFornecedorForm>({
    razao_social: '', nome_fantasia: '', cnpj_cpf: '',
    tipo_pessoa: 'PJ', empresa: '', codigo: '', email: '', telefone: '',
    cep: '', endereco: '', cidade_uf: '', codigo_banco: '', banco_nome: '',
    agencia: '', conta: '', digito: '', tipo_conta: 'Corrente', chave_pix: '', tipo_pix: '',
  })
  const [fDocumentoNome,   setFDocumentoNome]   = useState('')
  const [fDocumentoMime,   setFDocumentoMime]   = useState('')
  const [fDocumentoBase64, setFDocumentoBase64] = useState('')
  const [fDocumentoErro,   setFDocumentoErro]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const aiParcelasRef = useRef<Parcela[] | null>(null)
  const parcelaTipoDocAnteriorRef = useRef('')
  const parcelaNumeroDocAnteriorRef = useRef('')
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [retencoesAbertas, setRetencoesAbertas] = useState<Record<number, boolean>>({})
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (fEmpresa) params.empresa = fEmpresa
      if (fFornecedorFiltro) params.fornecedor_id = fFornecedorFiltro
      if (fTipoDocFiltro) params.tipo_documento_id = fTipoDocFiltro
      if (fPeriodoInicio) params.venc_inicio = fPeriodoInicio
      if (fPeriodoFim) params.venc_fim = fPeriodoFim
      if (fStatus)  params.status  = fStatus
      if (fBusca)   params.busca   = fBusca
      const r = await apiClient.get('/financeiro/lancamentos-cp', { params })
      setLista(r.data.data)
      setTotal(r.data.total)
      setTotalVlr(r.data.total_valor)
    } catch { }
    finally { setLoading(false) }
  }, [fEmpresa, fFornecedorFiltro, fTipoDocFiltro, fPeriodoInicio, fPeriodoFim, fStatus, fBusca])


  const exportarExcel = async () => {
    const params: Record<string, string> = {}
    if (fEmpresa) params.empresa = fEmpresa
    if (fFornecedorFiltro) params.fornecedor_id = fFornecedorFiltro
    if (fTipoDocFiltro) params.tipo_documento_id = fTipoDocFiltro
    if (fPeriodoInicio) params.venc_inicio = fPeriodoInicio
    if (fPeriodoFim) params.venc_fim = fPeriodoFim
    if (fStatus) params.status = fStatus
    if (fBusca) params.busca = fBusca

    const r = await apiClient.get('/financeiro/lancamentos-cp/exportar', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([r.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = 'contas-a-pagar.xls'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      apiClient.get('/financeiro/fornecedores/select'),
      apiClient.get('/financeiro/bancos/select'),
      apiClient.get('/financeiro/plano-contas'),
      apiClient.get('/financeiro/tipos-documento/ativos', { params: { modulo: 'pagar' } }),
    ]).then(([f, b, p, td]) => {
      setFornecedores(f.data.data)
      setBancos(b.data.data)
      setPlano(p.data.data.filter((c: PlanoConta) => c.tipo === 'A'))
      setTiposDocumento(td.data.data || [])
    }).catch(() => {})
  }, [])

  const totalRateioPercentualScaled = useMemo(
    () => rateios.reduce((totalAtual, item) => totalAtual + rateioPercentToScaled(item.percentual), 0),
    [rateios],
  )
  const totalRateioCentavos = useMemo(
    () => rateios.reduce((totalAtual, item) => totalAtual + rateioMoneyToCents(item.valor), 0),
    [rateios],
  )

  function distribuirRateiosIgualmente(itens: RateioFormItem[], valorDocumento = fValor) {
    if (!itens.length) return itens
    const totalCentavos = Math.max(0, rateioMoneyToCents(valorDocumento))
    const percentualBase = Math.floor(RATEIO_HUNDRED_PERCENT / itens.length)
    const percentualResto = RATEIO_HUNDRED_PERCENT - percentualBase * itens.length
    const valorBase = Math.floor(totalCentavos / itens.length)
    const valorResto = totalCentavos - valorBase * itens.length

    return itens.map((item, index) => ({
      ...item,
      percentual: rateioPercentInput(percentualBase + (index < percentualResto ? 1 : 0)),
      valor: rateioMoneyInput(valorBase + (index < valorResto ? 1 : 0)),
    }))
  }

  function recalcularValoresRateio(itens: RateioFormItem[], valorDocumento = fValor) {
    const totalCentavos = Math.max(0, rateioMoneyToCents(valorDocumento))
    if (totalCentavos <= 0) return itens.map(item => ({ ...item, valor: '' }))

    const percentuais = itens.map(item => Math.max(0, rateioPercentToScaled(item.percentual)))
    const valores = percentuais.map(percentual =>
      Math.round(totalCentavos * (percentual / RATEIO_HUNDRED_PERCENT)),
    )
    if (percentuais.reduce((totalAtual, percentual) => totalAtual + percentual, 0) === RATEIO_HUNDRED_PERCENT && valores.length) {
      const soma = valores.reduce((totalAtual, valor) => totalAtual + valor, 0)
      valores[valores.length - 1] += totalCentavos - soma
    }
    return itens.map((item, index) => ({ ...item, valor: rateioMoneyInput(valores[index] || 0) }))
  }

  function recalcularPercentuaisRateio(itens: RateioFormItem[], valorDocumento = fValor) {
    const totalCentavos = Math.max(0, rateioMoneyToCents(valorDocumento))
    if (totalCentavos <= 0) return itens.map(item => ({ ...item, percentual: '' }))

    const valores = itens.map(item => Math.max(0, rateioMoneyToCents(item.valor)))
    const percentuais = valores.map(valor =>
      Math.round((valor / totalCentavos) * RATEIO_HUNDRED_PERCENT),
    )
    if (valores.reduce((totalAtual, valor) => totalAtual + valor, 0) === totalCentavos && percentuais.length) {
      const soma = percentuais.reduce((totalAtual, percentual) => totalAtual + percentual, 0)
      percentuais[percentuais.length - 1] += RATEIO_HUNDRED_PERCENT - soma
    }
    return itens.map((item, index) => ({ ...item, percentual: rateioPercentInput(percentuais[index] || 0) }))
  }

  function alternarRateio(ativo: boolean) {
    if (editingId) return
    setFRateioAtivo(ativo)
    setErrors(prev => {
      const next = { ...prev }
      delete next.rateio
      return next
    })
    if (!ativo) {
      const primeiroPlano = rateios[0]
      if (primeiroPlano) {
        const planoSelecionado = plano.find(
          conta => String(conta.id) === String(primeiroPlano.plano_contas_id),
        )
        if (planoSelecionado) setFConta(planoSelecionado.codigo)
        if (primeiroPlano.centro_custo) setFCC(primeiroPlano.centro_custo)
      }
      setRateios([])
      return
    }

    const planoAtual = plano.find(conta => conta.codigo === fConta)
    setRateios(distribuirRateiosIgualmente([
      {
        plano_contas_id: planoAtual ? String(planoAtual.id) : '',
        centro_custo: fCC,
        historico: '',
        percentual: '',
        valor: '',
      },
      {
        plano_contas_id: '',
        centro_custo: fCC,
        historico: '',
        percentual: '',
        valor: '',
      },
    ]))
  }

  function adicionarItemRateio() {
    if (rateios.length >= 20) return
    setRateios(prev => [...prev, {
      plano_contas_id: '',
      centro_custo: fCC,
      historico: '',
      percentual: '',
      valor: '',
    }])
  }

  function removerItemRateio(index: number) {
    if (rateios.length <= 2) return
    setRateios(prev => prev.filter((_, itemIndex) => itemIndex !== index))
  }

  function atualizarCampoRateio(
    index: number,
    campo: 'plano_contas_id' | 'centro_custo' | 'historico',
    valor: string,
  ) {
    setRateios(prev => prev.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [campo]: valor } : item))
  }

  function atualizarPercentualRateio(index: number, percentual: string) {
    setRateios(prev => recalcularValoresRateio(prev.map((item, itemIndex) => itemIndex === index
      ? { ...item, percentual }
      : item)))
  }

  function atualizarValorRateio(index: number, valor: string) {
    setRateios(prev => recalcularPercentuaisRateio(prev.map((item, itemIndex) => itemIndex === index
      ? { ...item, valor }
      : item)))
  }

  useEffect(() => {
    if (!fRateioAtivo || rateios.length === 0) return
    setRateios(prev => recalcularValoresRateio(prev, fValor))
    // Recalcula somente os valores; os percentuais escolhidos permanecem intactos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fValor, fRateioAtivo])

  // Recalcula parcelas ao mudar valor ou nparcs
  useEffect(() => {
    if (aiParcelasRef.current) {
      setParcelas(aiParcelasRef.current)
      aiParcelasRef.current = null
      return
    }

    const vlr = moneyToNumber(fValor) || 0
    const n   = fNParc || 1
    if (vlr <= 0) { setParcelas([]); return }
    const totalParcelasCentavos = Math.round((vlr + Number.EPSILON) * 100)
    const parcelaBaseCentavos = Math.floor(totalParcelasCentavos / n)
    const parcelaRestoCentavos = totalParcelasCentavos - (parcelaBaseCentavos * n)
    const ps: Parcela[] = Array.from({ length: n }, (_, i) => {
      const valor = (parcelaBaseCentavos + (i < parcelaRestoCentavos ? 1 : 0)) / 100
      return {
        numero: i + 1,
        valor,
        vencimento: addMonthsDateOnly(fEmissao || todayISO(), i + 1),
        status: 'pendente',
        tipo_documento_id: fTipoDoc || null,
        numero_documento: fNF || null,
        acrescimo: 0,
        multa: 0,
        juros: 0,
        desconto: 0,
        retencao_iss: 0,
        retencao_pis: 0,
        retencao_cofins: 0,
        retencao_csll: 0,
        retencao_irrf: 0,
        retencao_inss: 0,
        valor_final: valor,
      }
    })

    setParcelas(prev => ps.map((base, i) => {
      const atual = prev[i]
      if (!atual) return base

      const next: Parcela = {
        ...base,
        id: atual.id,
        vencimento: atual.vencimento || base.vencimento,
        status: atual.status || base.status,
        tipo_documento_id: atual.tipo_documento_id ?? base.tipo_documento_id,
        numero_documento: atual.numero_documento ?? base.numero_documento,
        acrescimo: atual.acrescimo ?? 0,
        multa: atual.multa ?? 0,
        juros: atual.juros ?? 0,
        desconto: atual.desconto ?? 0,
        retencao_iss: atual.retencao_iss ?? 0,
        retencao_pis: atual.retencao_pis ?? 0,
        retencao_cofins: atual.retencao_cofins ?? 0,
        retencao_csll: atual.retencao_csll ?? 0,
        retencao_irrf: atual.retencao_irrf ?? 0,
        retencao_inss: atual.retencao_inss ?? 0,
      }
      next.valor_final = calculaValorFinalParcela(next)
      return next
    }))
  }, [fValor, fNParc, fEmissao])

  // Mantém os documentos das parcelas sincronizados com o documento principal
  // enquanto a pessoa ainda não personalizou o valor daquela parcela.
  useEffect(() => {
    const tipoAnterior = parcelaTipoDocAnteriorRef.current
    const numeroAnterior = parcelaNumeroDocAnteriorRef.current

    setParcelas(atual => atual.map(parcela => {
      const tipoAtual = parcela.tipo_documento_id == null ? '' : String(parcela.tipo_documento_id)
      const numeroAtual = String(parcela.numero_documento || '')
      return {
        ...parcela,
        tipo_documento_id: (!tipoAtual || tipoAtual === tipoAnterior) ? (fTipoDoc || null) : parcela.tipo_documento_id,
        numero_documento: (!numeroAtual || numeroAtual === numeroAnterior) ? (fNF || null) : parcela.numero_documento,
      }
    }))

    parcelaTipoDocAnteriorRef.current = fTipoDoc
    parcelaNumeroDocAnteriorRef.current = fNF
  }, [fTipoDoc, fNF])

  function updateParcela(i: number, key: keyof Parcela, val: string | number) {
    setParcelas(p => p.map((x, idx) => {
      if (idx !== i) return x
      const next = { ...x, [key]: val } as Parcela
      if (['valor', 'acrescimo', 'multa', 'juros', 'desconto', ...RETENCAO_KEYS].includes(String(key))) {
        next.valor_final = calculaValorFinalParcela(next)
      }
      return next
    }))
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDir(key === 'valor' ? 'desc' : 'asc')
  }

  function fornecedorSelecionado(id = fForn) {
    return fornecedores.find(f => String(f.id) === String(id)) || null
  }

  function preencherPagamentoDoFornecedor(modalidade: ModalidadePagamento, fornecedorId = fForn) {
    const fornecedor = fornecedorSelecionado(fornecedorId)

    if (modalidade === 'PIX') {
      setFChavePixPagamento(fornecedor?.chave_pix || '')
    }

    if (modalidade === 'TED' || modalidade === 'DOC' || modalidade === 'TRANSFERENCIA') {
      setFBancoPagamentoNome(fornecedor?.banco_nome || '')
      setFBancoPagamentoCodigo(fornecedor?.codigo_banco || '')
      setFAgenciaPagamento(fornecedor?.agencia || '')
      setFContaPagamento(fornecedor?.conta || '')
      setFDigitoPagamento(fornecedor?.digito || '')
      setFTipoContaPagamento(fornecedor?.tipo_conta || '')
    }
  }

  function atualizarFornecedorLocalPagamento() {
    const fornecedorId = Number(fForn)
    if (!Number.isInteger(fornecedorId) || fornecedorId <= 0) return

    setFornecedores(prev => prev.map(fornecedor => {
      if (fornecedor.id !== fornecedorId) return fornecedor
      if (fModalidadePagamento === 'PIX') {
        return { ...fornecedor, chave_pix: fChavePixPagamento.trim() || null }
      }
      if (fModalidadePagamento === 'TED' || fModalidadePagamento === 'DOC' || fModalidadePagamento === 'TRANSFERENCIA') {
        return {
          ...fornecedor,
          banco_nome: fBancoPagamentoNome.trim() || null,
          codigo_banco: fBancoPagamentoCodigo.trim() || null,
          agencia: fAgenciaPagamento.trim() || null,
          conta: fContaPagamento.trim() || null,
          digito: fDigitoPagamento.trim() || null,
          tipo_conta: fTipoContaPagamento.trim() || null,
        }
      }
      return fornecedor
    }))
  }

  function handleFornecedorChange(value: string) {
    setFForn(value)
    preencherPagamentoDoFornecedor(fModalidadePagamento, value)
  }

  function handleModalidadeChange(value: ModalidadePagamento) {
    setFModalidadePagamento(value)
    preencherPagamentoDoFornecedor(value)
  }

  function openFornecedorModal() {
    setEditingFornecedorId(null)
    setEditingFornecedorData(undefined)
    setFornecedorErrors({})
    setNovoFornecedor({
      razao_social: '', nome_fantasia: '', cnpj_cpf: '',
      tipo_pessoa: 'PJ', empresa: fEmp || 'TODOS', codigo: '', email: '', telefone: '',
      cep: '', endereco: '', cidade_uf: '', codigo_banco: '', banco_nome: '',
      agencia: '', conta: '', digito: '', tipo_conta: 'Corrente', chave_pix: '', tipo_pix: '',
    })
    setShowFornecedorModal(true)
  }

  async function openEditarFornecedorModal() {
    const fornecedorId = Number(fForn)
    if (!Number.isInteger(fornecedorId) || fornecedorId <= 0) return

    setFornecedorErrors({})
    try {
      const r = await apiClient.get(`/financeiro/fornecedores/${fornecedorId}`)
      setEditingFornecedorId(fornecedorId)
      setEditingFornecedorData(r.data.data || undefined)
      setShowFornecedorModal(true)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Não foi possível carregar o fornecedor.'
      setErrors({ _geral: message })
    }
  }

  function closeFornecedorModal() {
    if (savingFornecedor) return
    setShowFornecedorModal(false)
    setEditingFornecedorId(null)
    setEditingFornecedorData(undefined)
    setFornecedorErrors({})
  }

  async function saveFornecedorRapido() {
    const e: Record<string, string> = {}
    if (!novoFornecedor.razao_social.trim()) e.razao_social = 'Obrigatório'
    if (!novoFornecedor.empresa) e.empresa = 'Obrigatório'
    if (novoFornecedor.codigo && novoFornecedor.codigo.replace(/\D/g, '').length > 0 && novoFornecedor.codigo.replace(/\D/g, '').length < 6)
      e.codigo = 'Mínimo 6 dígitos'
    setFornecedorErrors(e)
    if (Object.keys(e).length) return

    setSavingFornecedor(true)
    try {
      const bancoSelecionado = BANCOS_BR.find(b => b.codigo === novoFornecedor.codigo_banco)
      const payload = {
        razao_social: novoFornecedor.razao_social.trim(),
        nome_fantasia: novoFornecedor.nome_fantasia.trim() || null,
        cnpj_cpf: novoFornecedor.cnpj_cpf.trim() || null,
        tipo_pessoa: novoFornecedor.tipo_pessoa,
        empresa: novoFornecedor.empresa,
        codigo: novoFornecedor.codigo.trim() || null,
        email: novoFornecedor.email.trim() || null,
        telefone: novoFornecedor.telefone.trim() || null,
        cep: novoFornecedor.cep.trim() || null,
        endereco: novoFornecedor.endereco.trim() || null,
        cidade_uf: novoFornecedor.cidade_uf.trim() || null,
        banco_nome: bancoSelecionado?.nome || novoFornecedor.banco_nome || null,
        codigo_banco: novoFornecedor.codigo_banco || null,
        agencia: novoFornecedor.agencia.trim() || null,
        conta: novoFornecedor.conta.trim() || null,
        digito: novoFornecedor.digito.trim() || null,
        tipo_conta: novoFornecedor.tipo_conta || null,
        chave_pix: novoFornecedor.chave_pix.trim() || null,
        tipo_pix: novoFornecedor.tipo_pix || null,
        categoria: null,
      }
      const r = await apiClient.post('/financeiro/fornecedores', payload)
      const criado = r.data.data as FornecedorOption
      const sel = await apiClient.get('/financeiro/fornecedores/select')
      setFornecedores(sel.data.data || [])
      setFForn(String(criado.id))
      if (!fEmp && criado.empresa && criado.empresa !== 'TODOS') setFEmp(criado.empresa)
      setShowFornecedorModal(false)
      setFornecedorErrors({})
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao cadastrar fornecedor'
      setFornecedorErrors({ _geral: msg })
    } finally {
      setSavingFornecedor(false)
    }
  }

  function openNew() { setShowForm(true); setErrors({}) }
  function closeForm() {
    setShowForm(false)
    setFEmp(''); setFForn(''); setFBanco(''); setFConta(''); setFHistorico('')
    setFTipoDoc(''); setFNF(''); setFValor(''); setFNParc(1); setFCC(''); setFObs('')
    setFDocumentoNome(''); setFDocumentoMime(''); setFDocumentoBase64(''); setFDocumentoErro('')
    setFModalidadePagamento(''); setFChavePixPagamento('')
    setFBancoPagamentoNome(''); setFBancoPagamentoCodigo(''); setFAgenciaPagamento('')
    setFContaPagamento(''); setFDigitoPagamento(''); setFTipoContaPagamento('')
    setFLinhaDigitavelBoleto(''); setBoletosNovos([]); setBoletosExistentes([])
    setBoletosRemovidos([]); setBoletoErro('')
    setAiMessage(''); setAiLoading(false); aiParcelasRef.current = null
    parcelaTipoDocAnteriorRef.current = ''; parcelaNumeroDocAnteriorRef.current = ''
    setParcelas([]); setRetencoesAbertas({}); setErrors({})
    setFRateioAtivo(false); setRateios([])
    setShowFornecedorModal(false); setEditingFornecedorId(null); setEditingFornecedorData(undefined); setFornecedorErrors({})
    setShowBaixaModal(false); setBaixaParcela(null); setBaixaErrors({})
    setEditingId(null)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fEmp)       e.empresa   = 'Obrigatório'
    if (!fHistorico) e.historico = 'Obrigatório'
    if (!fValor || moneyToNumber(fValor) <= 0) e.valor = 'Informe um valor válido'
    if (fNF && fNF.trim().length < 1)
      e.nf_doc = 'Mínimo 1 caractere'

    if (fModalidadePagamento === 'PIX' && !fChavePixPagamento.trim())
      e.modalidade_pagamento = 'Informe ou cadastre a chave PIX do fornecedor.'
    if ((fModalidadePagamento === 'TED' || fModalidadePagamento === 'DOC' || fModalidadePagamento === 'TRANSFERENCIA')
      && (!fBancoPagamentoNome.trim() || !fAgenciaPagamento.trim() || !fContaPagamento.trim()))
      e.modalidade_pagamento = 'Informe banco, agência e conta do fornecedor.'
    if (fModalidadePagamento === 'BOLETO'
      && !fLinhaDigitavelBoleto.trim()
      && boletosNovos.length === 0
      && boletosExistentes.length === 0)
      e.modalidade_pagamento = 'Digite a linha do boleto ou anexe ao menos um PDF/imagem.'

    if (fRateioAtivo) {
      const planosSelecionados = rateios
        .map(item => String(item.plano_contas_id || ''))
        .filter(Boolean)
      const totalDocumentoCentavos = rateioMoneyToCents(fValor)
      const itemIncompleto = rateios.find(item => {
        const planoSelecionado = plano.find(
          conta => String(conta.id) === String(item.plano_contas_id),
        )
        return !item.plano_contas_id || !planoSelecionado
          || rateioPercentToScaled(item.percentual) <= 0
          || rateioMoneyToCents(item.valor) <= 0
      })
      const itemIncompativel = rateios.find(item => {
        const percentual = rateioPercentToScaled(item.percentual)
        const valorCentavos = rateioMoneyToCents(item.valor)
        const valorEsperado = totalDocumentoCentavos * (percentual / RATEIO_HUNDRED_PERCENT)
        return Math.abs(valorCentavos - valorEsperado) > 1
      })

      if (editingId) e.rateio = 'O rateio contábil só pode ser definido na criação do documento.'
      else if (rateios.length < 2) e.rateio = 'Adicione pelo menos dois planos de contas ao rateio.'
      else if (rateios.length > 20) e.rateio = 'O rateio aceita no máximo 20 planos de contas.'
      else if (itemIncompleto) e.rateio = 'Preencha plano de contas, percentual e valor em todas as linhas do rateio.'
      else if (new Set(planosSelecionados).size !== planosSelecionados.length) e.rateio = 'O mesmo plano de contas não pode aparecer mais de uma vez no rateio.'
      else if (totalRateioPercentualScaled !== RATEIO_HUNDRED_PERCENT) e.rateio = 'A soma dos percentuais deve ser exatamente 100%.'
      else if (totalRateioCentavos !== totalDocumentoCentavos) e.rateio = 'A soma dos valores deve ser igual ao valor total do documento.'
      else if (itemIncompativel) e.rateio = 'Existe uma linha em que o percentual não corresponde ao valor informado.'
    }

    const parcelaDocumentoIncompleto = parcelas.find((parcela) => {
      const temTipo = Boolean(parcela.tipo_documento_id)
      const temNumero = Boolean(String(parcela.numero_documento || '').trim())
      return temTipo !== temNumero
    })
    if (parcelaDocumentoIncompleto) {
      e.parcelas_documento = 'Informe o tipo e o número do documento na mesma parcela.'
    }

    if (Object.keys(e).length) {
      e._geral = parcelaDocumentoIncompleto
        ? `Parcela ${parcelaDocumentoIncompleto.numero}: informe o tipo e o número do documento.`
        : e.rateio || 'Revise os campos: algum deles está impedindo o envio das informações.'
    }
    setErrors(e)
    return Object.keys(e).filter(k => k !== '_geral').length === 0
  }

  function handleDocumentoChange(file: File | null) {
    setFDocumentoErro('')
    setAiMessage('')
    setFDocumentoNome('')
    setFDocumentoMime('')
    setFDocumentoBase64('')

    if (!file) return

    const permitido = file.type === 'application/pdf' || file.type.startsWith('image/')
    if (!permitido) {
      setFDocumentoErro('Envie apenas PDF ou imagem')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setFDocumentoErro('Arquivo muito grande. Limite sugerido: 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      setFDocumentoNome(file.name)
      setFDocumentoMime(file.type)
      setFDocumentoBase64(base64)
    }
    reader.onerror = () => setFDocumentoErro('Não foi possível ler o arquivo')
    reader.readAsDataURL(file)
  }

  function formatFileSize(bytes: number) {
    if (!bytes) return '0 KB'
    if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function abrirArquivoBase64(nome: string, mime: string, base64: string) {
    const binary = window.atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    const url = window.URL.createObjectURL(new Blob([bytes], { type: mime }))
    const popup = window.open(url, '_blank', 'noopener,noreferrer')
    if (!popup) {
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
  }

  async function handleBoletosChange(files: FileList | null) {
    setBoletoErro('')
    const selecionados = Array.from(files || [])
    if (!selecionados.length) return

    const invalid = selecionados.find(file => file.type !== 'application/pdf' && !file.type.startsWith('image/'))
    if (invalid) {
      setBoletoErro(`O arquivo ${invalid.name} não é PDF nem imagem.`)
      return
    }

    const oversized = selecionados.find(file => file.size > 6 * 1024 * 1024)
    if (oversized) {
      setBoletoErro(`O arquivo ${oversized.name} ultrapassa o limite de 6MB.`)
      return
    }

    try {
      const novos = await Promise.all(selecionados.map(file => new Promise<BoletoNovo>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = String(reader.result || '')
          resolve({
            temp_id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            nome: file.name,
            mime: file.type,
            tamanho_bytes: file.size,
            arquivo_base64: result.includes(',') ? result.split(',')[1] : result,
          })
        }
        reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`))
        reader.readAsDataURL(file)
      })))

      const total = [...boletosNovos, ...novos].reduce((sum, file) => sum + file.tamanho_bytes, 0)
      if (total > 20 * 1024 * 1024) {
        setBoletoErro('O total dos novos boletos ultrapassa o limite de 20MB.')
        return
      }
      setBoletosNovos(prev => [...prev, ...novos])
    } catch (err) {
      setBoletoErro(err instanceof Error ? err.message : 'Não foi possível ler os boletos.')
    }
  }

  function removerBoletoExistente(id: number) {
    setBoletosExistentes(prev => prev.filter(item => item.id !== id))
    setBoletosRemovidos(prev => prev.includes(id) ? prev : [...prev, id])
  }

  async function abrirBoletoExistente(boleto: BoletoExistente) {
    if (!editingId) return
    try {
      const r = await apiClient.get(`/financeiro/lancamentos-cp/${editingId}/boletos/${boleto.id}`)
      const file = r.data.data
      abrirArquivoBase64(file.nome, file.mime, file.arquivo_base64)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Não foi possível abrir o boleto.'
      setBoletoErro(message)
    }
  }

  function findFornecedorByAi(data: AiContaPagarResult) {
    const cnpjDigits = String(data.fornecedor_cnpj || '').replace(/\D/g, '')
    if (cnpjDigits) {
      const byDoc = fornecedores.find(f => String(f.cnpj_cpf || '').replace(/\D/g, '') === cnpjDigits)
      if (byDoc) return byDoc
    }

    const nome = String(data.fornecedor_nome || '').trim().toLowerCase()
    if (!nome) return null
    return fornecedores.find(f => {
      const razao = String(f.razao_social || '').toLowerCase().trim()
      const fantasia = String(f.nome_fantasia || '').toLowerCase().trim()
      return (razao.length > 2 && (razao.includes(nome) || nome.includes(razao)))
        || (fantasia.length > 2 && (fantasia.includes(nome) || nome.includes(fantasia)))
    }) || null
  }

  function applyAiResult(data: AiContaPagarResult) {
    const fornecedor = findFornecedorByAi(data)
    if (fornecedor) {
      handleFornecedorChange(String(fornecedor.id))
      if (!fEmp && fornecedor.empresa) setFEmp(fornecedor.empresa)
    }

    if (data.tipo_documento) {
      const tipo = tiposDocumento.find(t => {
        const a = t.nome.toLowerCase()
        const b = String(data.tipo_documento || '').toLowerCase()
        return a.includes(b) || b.includes(a)
      })
      if (tipo) setFTipoDoc(String(tipo.id))
    }

    if (data.numero_documento) setFNF(data.numero_documento)
    if (data.historico) setFHistorico(data.historico)
    if (data.data_emissao) setFEmissao(data.data_emissao)

    const valor = Number(data.valor_total || 0)
    if (valor > 0) setFValor(valor.toFixed(2))

    const aiParcelas = Array.isArray(data.parcelas) && data.parcelas.length
      ? data.parcelas
      : (data.data_vencimento && valor > 0 ? [{ numero: 1, valor, vencimento: data.data_vencimento }] : [])

    if (aiParcelas.length) {
      aiParcelasRef.current = aiParcelas.map((p, idx) => {
        const valorParcela = Number(p.valor) || valor || 0
        return {
          numero: Number(p.numero) || idx + 1,
          valor: valorParcela,
          vencimento: p.vencimento,
          status: 'pendente',
          acrescimo: 0,
          multa: 0,
          juros: 0,
          desconto: 0,
          valor_final: valorParcela,
        }
      })
      setFNParc(aiParcelasRef.current.length)
    }
  }

  async function analisarDocumentoIA() {
    if (!fDocumentoBase64 || !fDocumentoMime) {
      setAiMessage('Selecione primeiro um PDF ou imagem da conta.')
      return
    }

    setAiLoading(true)
    setAiMessage('')
    try {
      const r = await apiClient.post<{ ok: boolean; data: AiContaPagarResult; provider?: string; message?: string }>('/financeiro/lancamentos-cp/analisar-documento', {
        documento_nome: fDocumentoNome,
        documento_mime: fDocumentoMime,
        documento_base64: fDocumentoBase64,
      })

      applyAiResult(r.data.data || {})
      const prov = r.data.provider === 'gemini' ? 'Gemini' : 'OpenAI'
      setAiMessage(`Dados lidos com ${prov}. Confira antes de salvar.`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
        || 'Não foi possível analisar o documento com IA.'
      setAiMessage(msg)
    } finally {
      setAiLoading(false)
    }
  }

  async function handleEdit(l: Lancamento) {
    if (l.rateio_id || l.rateio_contabil_id) {
      alert('Este lançamento possui rateio e não pode ser editado sem preservar sua composição contábil.')
      return
    }

    try {
      const r = await apiClient.get(`/financeiro/lancamentos-cp/${l.id}`)
      const d = r.data.data
      setFEmp(d.empresa || '')
      setFForn(d.fornecedor_id ? String(d.fornecedor_id) : '')
      setFBanco(d.banco_conta_id ? String(d.banco_conta_id) : '')
      setFHistorico(d.historico || '')
      setFTipoDoc(d.tipo_documento_id ? String(d.tipo_documento_id) : '')
      setFNF(d.nf_doc || '')
      setFEmissao(dateOnly(d.dt_emissao) || todayISO())
      setFValor(decimalInputValue(d.valor_total))
      setFNParc(d.qtd_parcelas || 1)
      setFConta(d.conta_contabil || '')
      setFCC(d.centro_custo || '')
      setFObs(d.obs || '')
      setFModalidadePagamento((d.modalidade_pagamento || '') as ModalidadePagamento)
      setFChavePixPagamento(d.chave_pix_pagamento || '')
      setFBancoPagamentoNome(d.banco_pagamento_nome || '')
      setFBancoPagamentoCodigo(d.banco_pagamento_codigo || '')
      setFAgenciaPagamento(d.agencia_pagamento || '')
      setFContaPagamento(d.conta_pagamento || '')
      setFDigitoPagamento(d.digito_pagamento || '')
      setFTipoContaPagamento(d.tipo_conta_pagamento || '')
      setFLinhaDigitavelBoleto(d.linha_digitavel_boleto || '')
      setBoletosExistentes(Array.isArray(d.boletos) ? d.boletos : [])
      setBoletosNovos([])
      setBoletosRemovidos([])
      setBoletoErro('')
      if (d.parcelas?.length) {
        const loadedParcelas = d.parcelas.map((p: Parcela, idx: number) =>
          normalizaParcelaPayload({
            id: p.id,
            numero: p.numero,
            valor: toFiniteNumber(p.valor),
            vencimento: dateOnly(p.vencimento),
            status: p.status || 'pendente',
            tipo_documento_id: p.tipo_documento_id ? String(p.tipo_documento_id) : (d.tipo_documento_id ? String(d.tipo_documento_id) : null),
            tipo_documento_nome: p.tipo_documento_nome || null,
            numero_documento: p.numero_documento || d.nf_doc || null,
            acrescimo: toFiniteNumber(p.acrescimo),
            multa: toFiniteNumber(p.multa),
            juros: toFiniteNumber(p.juros),
            desconto: toFiniteNumber(p.desconto),
                    retencao_iss: toFiniteNumber(p.retencao_iss),
                    retencao_pis: toFiniteNumber(p.retencao_pis),
            retencao_cofins: toFiniteNumber(p.retencao_cofins),
            retencao_csll: toFiniteNumber(p.retencao_csll),
            retencao_irrf: toFiniteNumber(p.retencao_irrf),
            retencao_inss: toFiniteNumber(p.retencao_inss),
            valor_final: toFiniteNumber(p.valor_final),
          }, idx)
        )
        // Evita o efeito automático de parcelamento sobrescrever os valores
        // carregados do banco com multa/juros/desconto zerados.
        aiParcelasRef.current = loadedParcelas
        setParcelas(loadedParcelas)
        setRetencoesAbertas(Object.fromEntries(
          loadedParcelas.map((p: Parcela, idx: number) => [idx, calculaTotalRetencoes(p) > 0]),
        ))
      }
      setEditingId(l.id)
      setShowForm(true)
    } catch { alert('Erro ao carregar lançamento') }
  }

  async function handleDeleteConfirm() {
    if (!deletingId) return
    setDeletingLoading(true)
    try {
      await apiClient.delete(`/financeiro/lancamentos-cp/${deletingId}`)
      setDeletingId(null)
      load()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao excluir')
    } finally { setDeletingLoading(false) }
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      const contaObj = plano.find(p => p.codigo === fConta)
      const payload: Record<string, unknown> = {
        empresa:         fEmp,
        fornecedor_id:   fForn   || null,
        banco_conta_id:  fBanco  || null,
        conta_contabil:  fRateioAtivo ? null : (fConta || null),
        descricao_conta: fRateioAtivo ? null : (contaObj?.descricao || null),
        historico:       fHistorico,
        tipo_documento_id: fTipoDoc || null,
        produto_servico: null,
        nf_doc:          fNF      || null,
        documento_nome:  fDocumentoNome   || null,
        documento_mime:  fDocumentoMime   || null,
        documento_base64:fDocumentoBase64 || null,
        dt_emissao:      dateOnly(fEmissao) || null,
        valor_total:     moneyToNumber(fValor),
        qtd_parcelas:    fNParc,
        centro_custo:    fCC      || null,
        obs:             fObs     || null,
        modalidade_pagamento: fModalidadePagamento || null,
        chave_pix_pagamento: fChavePixPagamento || null,
        banco_pagamento_nome: fBancoPagamentoNome || null,
        banco_pagamento_codigo: fBancoPagamentoCodigo || null,
        agencia_pagamento: fAgenciaPagamento || null,
        conta_pagamento: fContaPagamento || null,
        digito_pagamento: fDigitoPagamento || null,
        tipo_conta_pagamento: fTipoContaPagamento || null,
        linha_digitavel_boleto: fLinhaDigitavelBoleto || null,
        boletos_novos: fModalidadePagamento === 'BOLETO'
          ? boletosNovos.map(({ temp_id, ...file }) => file)
          : [],
        boletos_removidos: boletosRemovidos,
        parcelas:        parcelas.map((p, idx) => normalizaParcelaPayload(p, idx)),
      }
      if (!editingId && fRateioAtivo) {
        payload.rateios = rateios.map(item => ({
          plano_contas_id: Number(item.plano_contas_id),
          centro_custo: item.centro_custo || null,
          historico: item.historico || null,
          percentual: moneyToNumber(item.percentual),
          valor: moneyToNumber(item.valor),
        }))
      }
      if (editingId) {
        await apiClient.put(`/financeiro/lancamentos-cp/${editingId}`, payload)
      } else {
        await apiClient.post('/financeiro/lancamentos-cp', payload)
      }
      atualizarFornecedorLocalPagamento()
      closeForm()
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message
        || (err instanceof Error ? err.message : 'Erro ao salvar')
        || 'Erro ao salvar'
      setErrors({ _geral: msg })
    } finally {
      setSaving(false)
    }
  }

  function calculaValorFinalBaixa(form: BaixaForm) {
    const valor = moneyToNumber(form.valor_parcela)
    const acrescimo = moneyToNumber(form.acrescimo)
    const juros = moneyToNumber(form.juros)
    const multa = moneyToNumber(form.multa)
    const desconto = moneyToNumber(form.desconto)
    return Math.max(0, valor + acrescimo + juros + multa - desconto)
  }

  function openBaixaModal(l: Lancamento) {
    if (!l.parcela_id) return
    const valor = getValorFinalLancamento(l)
    const baixaValorFinal = getBaixaValor(l, 'valor_final')
    const form: BaixaForm = {
      valor_parcela: valor.toFixed(2),
      motivo_baixa: l.parcela_motivo_baixa || '',
      acrescimo: String(getBaixaValor(l, 'acrescimo')),
      desconto: String(getBaixaValor(l, 'desconto')),
      juros: String(getBaixaValor(l, 'juros')),
      multa: String(getBaixaValor(l, 'multa')),
      valor_final: String((baixaValorFinal || valor).toFixed(2)),
      forma_pagamento: l.parcela_forma_pagamento || '',
      banco_conta_id: l.banco_conta_id ? String(l.banco_conta_id) : '',
      dt_pagamento: dateOnly(l.parcela_dt_pagamento) || todayISO(),
    }
    if (!baixaValorFinal) form.valor_final = calculaValorFinalBaixa(form).toFixed(2)
    setBaixaParcela(l)
    setBaixaForm(form)
    setBaixaErrors({})
    setShowBaixaModal(true)
  }

  function updateBaixaForm<K extends keyof BaixaForm>(key: K, value: BaixaForm[K]) {
    setBaixaForm(prev => {
      const next = { ...prev, [key]: value }
      if (['valor_parcela', 'acrescimo', 'desconto', 'juros', 'multa'].includes(key)) {
        next.valor_final = calculaValorFinalBaixa(next).toFixed(2)
      }
      return next
    })
  }

  function closeBaixaModal() {
    if (savingBaixa) return
    setShowBaixaModal(false)
    setBaixaParcela(null)
    setBaixaErrors({})
  }

  async function salvarBaixa() {
    if (!baixaParcela?.id || !baixaParcela.parcela_id) return
    const e: Record<string, string> = {}
    if (!baixaForm.dt_pagamento) e.dt_pagamento = 'Obrigatório'
    if (!baixaForm.banco_conta_id) e.banco_conta_id = 'Obrigatório'
    if (!baixaForm.forma_pagamento.trim()) e.forma_pagamento = 'Obrigatório'
    setBaixaErrors(e)
    if (Object.keys(e).length) return

    setSavingBaixa(true)
    try {
      await apiClient.put(`/financeiro/lancamentos-cp/${baixaParcela.id}/parcelas/${baixaParcela.parcela_id}/pagar`, {
        dt_pagamento: dateOnly(baixaForm.dt_pagamento),
        valor_parcela: moneyToNumber(baixaForm.valor_parcela),
        motivo_baixa: baixaForm.motivo_baixa.trim() || null,
        acrescimo: moneyToNumber(baixaForm.acrescimo),
        desconto: moneyToNumber(baixaForm.desconto),
        juros: moneyToNumber(baixaForm.juros),
        multa: moneyToNumber(baixaForm.multa),
        valor_final: moneyToNumber(baixaForm.valor_final),
        forma_pagamento: baixaForm.forma_pagamento.trim(),
        banco_conta_id: baixaForm.banco_conta_id,
      })
      closeBaixaModal()
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao dar baixa na parcela'
      setBaixaErrors({ _geral: msg })
    } finally {
      setSavingBaixa(false)
    }
  }

  async function cancelarBaixa(l: Lancamento) {
    if (!l.id || !l.parcela_id) return
    const ok = window.confirm('Cancelar a baixa desta parcela? O lançamento voltará para pendente e o movimento bancário gerado pela baixa será removido.')
    if (!ok) return

    const key = `${l.id}-${l.parcela_id}`
    setCancelandoBaixa(key)
    try {
      await apiClient.put(`/financeiro/lancamentos-cp/${l.id}/parcelas/${l.parcela_id}/cancelar-baixa`)
      load()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao cancelar baixa')
    } finally {
      setCancelandoBaixa(null)
    }
  }

  function getValorFinalLancamento(l: Lancamento) {
    const valor = Number(l.parcela_valor ?? l.valor_total ?? 0)
    const calculado = valor
      + Number(l.parcela_acrescimo || 0)
      + Number(l.parcela_multa || 0)
      + Number(l.parcela_juros || 0)
      - Number(l.parcela_desconto || 0)
      - calculaTotalRetencoesLancamento(l)
    const final = l.parcela_valor_final === null || l.parcela_valor_final === undefined
      ? calculado
      : Number(l.parcela_valor_final)
    return Math.max(0, Number.isFinite(final) ? final : valor)
  }

  function hasAjustesLancamento(l: Lancamento) {
    const valor = Number(l.parcela_valor ?? l.valor_total ?? 0)
    const final = getValorFinalLancamento(l)
    return Number(l.parcela_acrescimo || 0) !== 0
      || Number(l.parcela_multa || 0) !== 0
      || Number(l.parcela_juros || 0) !== 0
      || Number(l.parcela_desconto || 0) !== 0
      || calculaTotalRetencoesLancamento(l) !== 0
      || Math.abs(final - valor) > 0.009
  }

  function getBaixaValor(l: Lancamento, key: 'acrescimo' | 'desconto' | 'juros' | 'multa' | 'valor_final') {
    const baixaKey = `parcela_baixa_${key}` as keyof Lancamento
    const baixaValue = l[baixaKey]
    if (baixaValue !== null && baixaValue !== undefined) return Number(baixaValue || 0)

    // Compatibilidade com baixas antigas, antes da separação entre valor do lançamento e valor da baixa.
    if ((l.parcela_status || l.status) === 'pago') {
      const legacyKey = key === 'valor_final' ? 'parcela_valor_final' : `parcela_${key}`
      const legacyValue = l[legacyKey as keyof Lancamento]
      if (legacyValue !== null && legacyValue !== undefined) return Number(legacyValue || 0)
    }

    return 0
  }

  const inp = 'w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
  const F = useCallback(({ label, name, required, children, full }: { label: string; name: string; required?: boolean; children: React.ReactNode; full?: boolean }) => (
    <div className={cn('flex flex-col gap-1', full && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500">{errors[name]}</p>}
    </div>
  ), [errors])

  const sortedLista = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...lista].sort((a, b) => {
      const av = getSortValue(a, sortKey)
      const bv = getSortValue(b, sortKey)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir
    })
  }, [lista, sortKey, sortDir])

  const TH = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' | 'center' }) => (
    <th className={cn('px-3 py-2.5 font-semibold whitespace-nowrap', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
      <button type="button" onClick={() => sortBy(k)} className={cn('inline-flex items-center gap-1 hover:text-blue-100', align === 'right' && 'justify-end w-full', align === 'center' && 'justify-center w-full')}>
        {label}
        <span className="text-[10px] opacity-70">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )


  const bancosBaixa = baixaParcela
    ? bancos.filter(b => b.empresa === baixaParcela.empresa)
    : bancos

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Contas a Pagar</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} parcelas · {R$(totalVlr)} em aberto</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button type="button" onClick={exportarExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors">
            <Download className="w-3.5 h-3.5" /> Exportar Excel
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> Novo Lançamento
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 items-end">
          <div className="md:col-span-2 xl:col-span-2">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={fBusca} onChange={e => setFBusca(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                placeholder="Fornecedor, histórico ou documento…"
                className="pl-9 pr-4 py-2 w-full text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Fornecedor</label>
            <FornecedorSelect
              value={fFornecedorFiltro}
              onChange={setFFornecedorFiltro}
              fornecedores={fornecedores.filter(f => !fEmpresa || f.empresa === fEmpresa || f.empresa === 'TODOS')}
              inp="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
              placeholder="Todos fornecedores"
              emptyLabel="Todos fornecedores"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Tipo de documento</label>
            <select value={fTipoDocFiltro} onChange={e => setFTipoDocFiltro(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
              <option value="">Todos tipos</option>
              {tiposDocumento.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vencimento de</label>
            <input value={fPeriodoInicio} onChange={e => setFPeriodoInicio(e.target.value)} type="date"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700" />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vencimento até</label>
            <input value={fPeriodoFim} onChange={e => setFPeriodoFim(e.target.value)} type="date"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700" />
          </div>

          <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Empresa</label>
              <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
                <option value="">Todas</option>
                {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
              </select>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">O período filtra pela data de vencimento das parcelas.</p>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          ref={topTableScrollRef}
          onScroll={(e) => syncHorizontalScroll(e.currentTarget, tableScrollRef.current)}
          className="h-4 overflow-x-auto overflow-y-hidden border-b border-slate-100 bg-slate-50/70"
          title="Barra de rolagem horizontal da tabela"
        >
          <div style={{ width: tableMinWidth }} className="h-1" />
        </div>
        <div
          ref={tableScrollRef}
          onScroll={(e) => syncHorizontalScroll(e.currentTarget, topTableScrollRef.current)}
          className="max-h-[70vh] overflow-auto"
        >
          <table className="w-full table-fixed text-xs" style={{ minWidth: tableMinWidth }}>
            <colgroup>
              <col style={{ width: 112 }} />
              <col style={{ width: 86 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 145 }} />
              <col style={{ width: 78 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 112 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 115 }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d1b2a] text-white">
                <TH label="Vencimento" k="vencimento" />
                <TH label="Empresa" k="empresa" />
                <TH label="Fornecedor" k="fornecedor" />
                <TH label="Tipo de documento" k="tipo_documento" />
                <TH label="Número" k="numero" />
                <TH label="Parcela" k="parcela" align="center" />
                <TH label="Valor" k="valor" align="right" />
                <TH label="Emissão" k="emissao" />
                <TH label="Pagamento" k="pagamento" />
                <TH label="Status" k="status" />
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(6)].map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(10)].map((_,j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50+((i*11+j*9)%40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && lista.length === 0 && (
                <tr><td colSpan={10} className="text-center text-slate-400 py-12 text-sm">
                  Nenhum lançamento encontrado
                </td></tr>
              )}
              {!loading && sortedLista.map(l => {
                const statusParcela = l.parcela_status || l.status
                const valorParcela = Number(l.parcela_valor ?? l.valor_total ?? 0)
                const valorFinalLancamento = getValorFinalLancamento(l)
                const valorFinalBaixa = getBaixaValor(l, 'valor_final') || valorFinalLancamento
                const mostrarBaixa = statusParcela === 'pago'
                const mostrarAjustesLancamento = hasAjustesLancamento(l)
                const cancelKey = `${l.id}-${l.parcela_id}`
                const fornecedorDisplay = getFornecedorDisplay(l)
                const fornecedorSubtitulo = getFornecedorSubtitle(l)
                return (
                  <tr key={`${l.id}-${l.parcela_id || l.parcela_numero || 'sem-parcela'}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap font-semibold text-slate-700">{fmtDate(l.parcela_vencimento || l.proximo_venc)}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{l.empresa}</span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-700 truncate" title={fornecedorDisplay}>{fornecedorDisplay}</p>
                      {fornecedorSubtitulo && <p className="text-slate-400 text-[10px] truncate" title={fornecedorSubtitulo}>{fornecedorSubtitulo}</p>}
                      {l.rateio_contabil_id && (
                        <p className="mt-0.5 text-[10px] font-semibold text-blue-600">
                          Rateio contábil · {l.rateio_contabil_total_itens || 0} planos
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 max-w-[150px] text-slate-600 truncate">{l.parcela_tipo_documento_nome || l.tipo_documento_nome || '—'}</td>
                    <td className="px-3 py-2 max-w-[130px] text-slate-600 truncate">
                      <p className="truncate">{l.parcela_numero_documento || l.nf_doc || '—'}</p>
                      {l.documento_nome && <p className="text-slate-400 text-[10px] truncate">Anexo: {l.documento_nome}</p>}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 whitespace-nowrap">
                      {l.parcela_numero ? `${l.parcela_numero}/${l.qtd_parcelas || 1}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800 whitespace-nowrap align-top">
                      <p className="font-semibold">{R$(valorFinalLancamento)}</p>
                      {mostrarAjustesLancamento && (
                        <div className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-400 font-normal">
                          <p>Base: {R$(valorParcela)}</p>
                          <p>Multa {R$(Number(l.parcela_multa || 0))} · Juros {R$(Number(l.parcela_juros || 0))}</p>
                          <p>Desc. {R$(Number(l.parcela_desconto || 0))} · Acrésc. {R$(Number(l.parcela_acrescimo || 0))}</p>
                          {calculaTotalRetencoesLancamento(l) > 0 && (
                            <p title="ISS, PIS, COFINS, CSL/CSLL, IRRF e INSS">Imp. retidos {R$(calculaTotalRetencoesLancamento(l))}</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.dt_emissao)}</td>
                    <td className="px-3 py-2 text-slate-500 align-top">
                      <p className="whitespace-nowrap">{fmtDate(l.parcela_dt_pagamento)}</p>
                      {mostrarBaixa && (
                        <div className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-400">
                          <p>Forma: {l.parcela_forma_pagamento || '—'}</p>
                          <p>Multa {R$(getBaixaValor(l, 'multa'))} · Juros {R$(getBaixaValor(l, 'juros'))}</p>
                          <p>Desc. {R$(getBaixaValor(l, 'desconto'))} · Acrésc. {R$(getBaixaValor(l, 'acrescimo'))}</p>
                          <p className="font-semibold text-slate-500">Valor final da baixa: {R$(valorFinalBaixa)}</p>
                          {l.parcela_motivo_baixa && <p className="truncate max-w-[110px]">Motivo: {l.parcela_motivo_baixa}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', STATUS_COLORS[statusParcela] || STATUS_COLORS.cancelado)}>
                          {statusParcela || '—'}
                        </span>
                        {statusParcela !== 'pago' && statusParcela !== 'cancelado' && l.parcela_id && (
                          <button
                            type="button"
                            onClick={() => openBaixaModal(l)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Dar baixa
                          </button>
                        )}
                        {statusParcela === 'pago' && l.parcela_id && (
                          <button
                            type="button"
                            onClick={() => cancelarBaixa(l)}
                            disabled={cancelandoBaixa === cancelKey}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                          >
                            <RotateCcw className="w-3 h-3" />
                            {cancelandoBaixa === cancelKey ? 'Cancelando…' : 'Cancelar baixa'}
                          </button>
                        )}
                        <div className="flex items-center gap-1 mt-1">
                          <button type="button" onClick={() => handleEdit(l)} title="Editar"
                            className="p-1 rounded hover:bg-blue-50 text-blue-500">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => setDeletingId(l.id)} title="Excluir"
                            className="p-1 rounded hover:bg-red-50 text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <TableFloatingNav scrollRef={tableScrollRef} />

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editingId ? 'Editar' : 'Novo'} Lançamento — Contas a Pagar</h2>
                <p className="text-xs text-slate-500 mt-0.5">Preencha os dados do lançamento e suas parcelas</p>
              </div>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._geral}</div>
              )}

              {/* Dados principais */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados do Lançamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Empresa" name="empresa" required>
                    <select className={inp} value={fEmp} onChange={e => setFEmp(e.target.value)}>
                      <option value="">Selecione</option>
                      {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </F>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-slate-600">Fornecedor</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={openEditarFornecedorModal}
                          disabled={!fForn}
                          className="text-[10px] font-semibold text-amber-700 hover:text-amber-900 disabled:cursor-not-allowed disabled:text-slate-300"
                        >
                          Editar fornecedor
                        </button>
                        <button type="button" onClick={openFornecedorModal} className="text-[10px] font-semibold text-blue-700 hover:text-blue-900">
                          + Novo fornecedor
                        </button>
                      </div>
                    </div>
                    <FornecedorSelect
                      value={fForn}
                      onChange={handleFornecedorChange}
                      fornecedores={fornecedores.filter(f => !fEmp || f.empresa === fEmp || f.empresa === 'TODOS')}
                      inp={inp}
                    />
                  </div>
                  <div className="col-span-2">
                    <F label="Histórico" name="historico" required>
                      <input className={inp} value={fHistorico} onChange={e => setFHistorico(e.target.value)}
                        placeholder="Descrição do lançamento" />
                    </F>
                  </div>
                  <F label="Tipo de Documento" name="tipo_documento_id">
                    <select className={inp} value={fTipoDoc} onChange={e => setFTipoDoc(e.target.value)}>
                      <option value="">Selecione</option>
                      {tiposDocumento.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </F>
                  <F label="Número do Documento" name="nf_doc">
                    <input className={cn(inp, errors.nf_doc && 'border-red-300')} value={fNF} onChange={e => setFNF(e.target.value)} placeholder="Mín. 1 caractere" />
                  </F>
                  <F label="Documento em PDF ou imagem" name="documento_arquivo" full>
                    <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{fDocumentoNome || 'Selecionar arquivo PDF ou imagem'}</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={e => handleDocumentoChange(e.target.files?.[0] || null)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={analisarDocumentoIA}
                        disabled={aiLoading || !fDocumentoBase64}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {aiLoading ? 'Lendo documento...' : 'Ler dados com IA'}
                      </button>
                      {aiMessage && <span className={cn('text-[10px]', aiMessage.includes('Confira') ? 'text-emerald-600' : 'text-amber-600')}>{aiMessage}</span>}
                    </div>
                    {fDocumentoErro && <p className="text-[10px] text-red-500">{fDocumentoErro}</p>}
                  </F>
                  <F label="Plano de Contas" name="conta_contabil">
                    {fRateioAtivo ? (
                      <div className="flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs text-blue-700">
                        Definido individualmente no rateio contábil abaixo
                      </div>
                    ) : (
                      <PlanoContasSelect value={fConta} onChange={setFConta} contas={plano} inp={inp} />
                    )}
                  </F>
                  <F label="Data de Emissão" name="dt_emissao">
                    <input className={inp} type="date" value={fEmissao} onChange={e => setFEmissao(e.target.value)} />
                  </F>
                  <F label="Centro de Custo" name="centro_custo">
                    <input className={inp} value={fCC} onChange={e => setFCC(e.target.value)} placeholder="Opcional" />
                  </F>
                </div>
              </div>

              {!editingId && (
                <div className={cn('rounded-xl border p-4', fRateioAtivo ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-slate-50/60')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div className={cn('mt-0.5 rounded-lg p-2', fRateioAtivo ? 'bg-blue-100 text-blue-700' : 'bg-white text-slate-500')}>
                        <Percent className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">Rateio contábil</p>
                        <p className="mt-0.5 max-w-2xl text-[10px] leading-4 text-slate-500">
                          Será criado um único título e uma única baixa bancária. No Movimento Bancário e no Cashflow, o valor será detalhado entre os planos de contas informados.
                        </p>
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-blue-700">
                      <input
                        type="checkbox"
                        checked={fRateioAtivo}
                        onChange={e => alternarRateio(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                      />
                      Dividir entre vários planos de contas
                    </label>
                  </div>

                  {fRateioAtivo && (
                    <div className="mt-4 space-y-3">
                      <div className="overflow-x-auto rounded-lg border border-blue-100 bg-white">
                        <div className="min-w-[1120px]">
                          <div className="grid grid-cols-[42px_minmax(250px,1.5fr)_170px_minmax(230px,1.3fr)_120px_145px_38px] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            <span>Item</span>
                            <span>Plano de contas</span>
                            <span>Centro de custo</span>
                            <span>Histórico complementar</span>
                            <span className="text-right">Percentual</span>
                            <span className="text-right">Valor</span>
                            <span />
                          </div>
                          <div className="divide-y divide-slate-100">
                            {rateios.map((item, index) => (
                              <div
                                key={`rateio-contabil-${index}`}
                                className="grid grid-cols-[42px_minmax(250px,1.5fr)_170px_minmax(230px,1.3fr)_120px_145px_38px] items-center gap-2 px-3 py-2.5"
                              >
                                <div className="text-center">
                                  <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold', index === 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                                    {index + 1}
                                  </span>
                                </div>
                                <select
                                  value={item.plano_contas_id}
                                  onChange={e => atualizarCampoRateio(index, 'plano_contas_id', e.target.value)}
                                  className={cn(inp, 'text-[11px]', errors.rateio && !item.plano_contas_id && 'border-red-300')}
                                >
                                  <option value="">Selecione um plano analítico</option>
                                  {plano.map(conta => (
                                    <option key={conta.id} value={conta.id}>
                                      {conta.codigo} — {conta.descricao}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={item.centro_custo}
                                  onChange={e => atualizarCampoRateio(index, 'centro_custo', e.target.value)}
                                  className={cn(inp, 'text-[11px]')}
                                  placeholder="Opcional"
                                />
                                <input
                                  type="text"
                                  value={item.historico}
                                  onChange={e => atualizarCampoRateio(index, 'historico', e.target.value)}
                                  className={cn(inp, 'text-[11px]')}
                                  placeholder="Ex.: reembolso combustível"
                                />
                                <div className="relative">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.percentual}
                                    onChange={e => atualizarPercentualRateio(index, e.target.value)}
                                    className={cn(inp, 'pr-7 text-right text-[11px] tabular-nums', errors.rateio && rateioPercentToScaled(item.percentual) <= 0 && 'border-red-300')}
                                    placeholder="0,00"
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">%</span>
                                </div>
                                <div className="relative">
                                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">R$</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.valor}
                                    onChange={e => atualizarValorRateio(index, e.target.value)}
                                    className={cn(inp, 'pl-7 text-right text-[11px] tabular-nums', errors.rateio && rateioMoneyToCents(item.valor) <= 0 && 'border-red-300')}
                                    placeholder="0,00"
                                  />
                                </div>
                                <button
                                  type="button"
                                  title={rateios.length <= 2 ? 'O rateio precisa ter pelo menos dois planos' : 'Remover plano'}
                                  disabled={rateios.length <= 2}
                                  onClick={() => removerItemRateio(index)}
                                  className="rounded p-1.5 text-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={rateios.length >= 20}
                            onClick={adicionarItemRateio}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            <Plus className="h-3.5 w-3.5" /> Adicionar plano
                          </button>
                          <button
                            type="button"
                            onClick={() => setRateios(prev => distribuirRateiosIgualmente(prev))}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Distribuir igualmente
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <span className={cn('font-semibold', totalRateioPercentualScaled === RATEIO_HUNDRED_PERCENT ? 'text-emerald-700' : 'text-red-600')}>
                            Percentual: {(totalRateioPercentualScaled / RATEIO_PERCENT_SCALE).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}%
                          </span>
                          <span className={cn('font-semibold', totalRateioCentavos === rateioMoneyToCents(fValor) ? 'text-emerald-700' : 'text-red-600')}>
                            Rateado: {R$(totalRateioCentavos / 100)} de {R$(rateioMoneyToCents(fValor) / 100)}
                          </span>
                        </div>
                      </div>
                      {errors.rateio && <p className="text-[10px] font-medium text-red-500">{errors.rateio}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Forma / modalidade de pagamento */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#1e3a5f]" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Forma de pagamento / modalidade</p>
                    <p className="text-[10px] text-slate-400">Os dados abaixo ficam gravados no lançamento como instrução de pagamento.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <F label="Modalidade" name="modalidade_pagamento">
                    <select
                      className={cn(inp, errors.modalidade_pagamento && 'border-red-300')}
                      value={fModalidadePagamento}
                      onChange={e => handleModalidadeChange(e.target.value as ModalidadePagamento)}
                    >
                      <option value="">Não informada</option>
                      <option value="PIX">PIX</option>
                      <option value="BOLETO">Boleto</option>
                      <option value="TED">TED</option>
                      <option value="DOC">DOC</option>
                      <option value="TRANSFERENCIA">Transferência</option>
                      <option value="DEBITO_AUTOMATICO">Débito automático</option>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="CARTAO">Cartão</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  </F>

                  {fModalidadePagamento === 'PIX' && (
                    <F label="Chave PIX do fornecedor" name="chave_pix_pagamento">
                      <input
                        className={cn(inp, errors.modalidade_pagamento && 'border-red-300')}
                        value={fChavePixPagamento}
                        onChange={e => setFChavePixPagamento(e.target.value)}
                        placeholder="Chave PIX cadastrada no fornecedor"
                      />
                      <p className="mt-1 text-[10px] text-slate-400">
                        A chave é trazida do fornecedor. Ao salvar, o valor informado também atualiza o cadastro do fornecedor.
                      </p>
                    </F>
                  )}
                </div>

                {(fModalidadePagamento === 'TED' || fModalidadePagamento === 'DOC' || fModalidadePagamento === 'TRANSFERENCIA') && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Landmark className="h-3.5 w-3.5 text-slate-500" />
                      <p className="text-[11px] font-semibold text-slate-600">Dados bancários do fornecedor</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="sm:col-span-2 lg:col-span-2">
                        <label className="mb-1 block text-[10px] text-slate-500">Banco</label>
                        <BancoSearchSelect
                          value={fBancoPagamentoNome}
                          codigo={fBancoPagamentoCodigo}
                          onChange={banco => {
                            setFBancoPagamentoNome(banco.nome)
                            setFBancoPagamentoCodigo(banco.codigo)
                          }}
                          className={cn(inp, errors.modalidade_pagamento && 'border-red-300')}
                          placeholder="Selecione o banco"
                          clearLabel="Nenhum banco"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">Agência</label>
                        <input className={cn(inp, errors.modalidade_pagamento && 'border-red-300')} value={fAgenciaPagamento} onChange={e => setFAgenciaPagamento(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">Conta</label>
                        <input className={cn(inp, errors.modalidade_pagamento && 'border-red-300')} value={fContaPagamento} onChange={e => setFContaPagamento(e.target.value)} />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-500">Dígito</label>
                        <input className={inp} value={fDigitoPagamento} onChange={e => setFDigitoPagamento(e.target.value)} />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">Os dados são trazidos do fornecedor. Ao salvar, banco, agência, conta e dígito também atualizam o cadastro do fornecedor.</p>
                  </div>
                )}

                {fModalidadePagamento === 'BOLETO' && (
                  <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">Linha digitável / código do boleto</label>
                      <textarea
                        className={cn(inp, 'min-h-[58px] resize-y', errors.modalidade_pagamento && 'border-red-300')}
                        value={fLinhaDigitavelBoleto}
                        onChange={e => setFLinhaDigitavelBoleto(e.target.value)}
                        placeholder="Digite ou cole a linha digitável do boleto"
                      />
                    </div>

                    <div>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span>Selecionar um ou mais boletos em PDF ou imagem</span>
                        <input
                          type="file"
                          multiple
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={e => {
                            handleBoletosChange(e.target.files)
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                      <p className="mt-1 text-[10px] text-slate-400">Até 6MB por arquivo e 20MB no total dos novos boletos.</p>
                    </div>

                    {(boletosExistentes.length > 0 || boletosNovos.length > 0) && (
                      <div className="space-y-2">
                        {boletosExistentes.map(boleto => (
                          <div key={`existente-${boleto.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-700">{boleto.nome}</p>
                              <p className="text-[10px] text-slate-400">Salvo · {formatFileSize(Number(boleto.tamanho_bytes || 0))}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => abrirBoletoExistente(boleto)} title="Abrir boleto" className="rounded p-1.5 text-blue-600 hover:bg-blue-50">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => removerBoletoExistente(boleto.id)} title="Remover boleto" className="rounded p-1.5 text-red-500 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {boletosNovos.map(boleto => (
                          <div key={boleto.temp_id} className="flex items-center justify-between gap-3 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-slate-700">{boleto.nome}</p>
                              <p className="text-[10px] text-emerald-600">Novo · {formatFileSize(boleto.tamanho_bytes)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button type="button" onClick={() => abrirArquivoBase64(boleto.nome, boleto.mime, boleto.arquivo_base64)} title="Abrir boleto" className="rounded p-1.5 text-blue-600 hover:bg-blue-50">
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => setBoletosNovos(prev => prev.filter(item => item.temp_id !== boleto.temp_id))} title="Remover boleto" className="rounded p-1.5 text-red-500 hover:bg-red-50">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {boletoErro && <p className="text-[10px] text-red-500">{boletoErro}</p>}
                  </div>
                )}

                {errors.modalidade_pagamento && (
                  <p className="mt-2 text-[10px] font-medium text-red-500">{errors.modalidade_pagamento}</p>
                )}
              </div>

              {/* Valor e parcelas */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Valor e Parcelas</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <F label="Valor Total (R$)" name="valor" required>
                    <input className={inp} type="text" inputMode="decimal"
                      value={fValor} onChange={e => setFValor(e.target.value)} placeholder="0,00" />
                  </F>
                  <F label="Número de Parcelas" name="qtd_parcelas">
                    <select className={inp} value={fNParc} onChange={e => setFNParc(parseInt(e.target.value))}>
                      {[1,2,3,4,5,6,7,8,9,10,11,12,18,24,36].map(n => (
                        <option key={n} value={n}>{n === 1 ? '1 (à vista)' : `${n}x`}</option>
                      ))}
                    </select>
                  </F>
                </div>

                {parcelas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-2">Parcelas e Vencimentos</p>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {parcelas.map((p, i) => (
                        <div key={i} className="overflow-x-auto bg-slate-50 rounded-lg px-3 py-2">
                          <div className="grid min-w-[820px] grid-cols-[60px_1fr_95px_80px_80px_80px_110px_105px] items-end gap-2">
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">Parcela</label>
                              <div className="text-xs font-semibold text-slate-600">{p.numero || i + 1}/{parcelas.length}</div>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">Vencimento</label>
                              <input type="date" value={p.vencimento}
                                onChange={e => updateParcela(i, 'vencimento', e.target.value)}
                                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">Valor</label>
                              <input type="text" inputMode="decimal" value={decimalInputValue(p.valor)}
                                onChange={e => updateParcela(i, 'valor', e.target.value)}
                                className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full text-right tabular-nums" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-red-400 mb-1">Multa</label>
                              <input type="text" inputMode="decimal" value={decimalInputValue(p.multa)} placeholder="0,00"
                                onChange={e => updateParcela(i, 'multa', e.target.value)}
                                className="text-xs border border-red-200 rounded px-2 py-1 bg-white w-full text-right tabular-nums text-red-600" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-orange-400 mb-1">Juros</label>
                              <input type="text" inputMode="decimal" value={decimalInputValue(p.juros)} placeholder="0,00"
                                onChange={e => updateParcela(i, 'juros', e.target.value)}
                                className="text-xs border border-orange-200 rounded px-2 py-1 bg-white w-full text-right tabular-nums text-orange-600" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-green-500 mb-1">Desconto</label>
                              <input type="text" inputMode="decimal" value={decimalInputValue(p.desconto)} placeholder="0,00"
                                onChange={e => updateParcela(i, 'desconto', e.target.value)}
                                className="text-xs border border-green-200 rounded px-2 py-1 bg-white w-full text-right tabular-nums text-green-700" />
                            </div>
                            <div>
                              <label className="block text-[10px] text-violet-500 mb-1">Imp. retidos</label>
                              <button
                                type="button"
                                aria-expanded={Boolean(retencoesAbertas[i])}
                                onClick={() => setRetencoesAbertas(prev => ({ ...prev, [i]: !prev[i] }))}
                                className="flex w-full items-center justify-between gap-1 rounded border border-violet-200 bg-white px-2 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-50"
                              >
                                <span>{calculaTotalRetencoes(p) > 0 ? R$(calculaTotalRetencoes(p)) : 'Adicionar'}</span>
                                <ChevronsUpDown className="h-3 w-3 shrink-0" />
                              </button>
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-500 mb-1">Final</label>
                              <div className="text-xs border border-slate-200 rounded px-2 py-1 bg-slate-100 w-full text-right tabular-nums font-semibold text-slate-700">
                                {R$(calculaValorFinalParcela(p))}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 grid min-w-[820px] grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-[10px] font-medium text-slate-500">Tipo de documento da parcela</label>
                              <select
                                value={p.tipo_documento_id == null ? '' : String(p.tipo_documento_id)}
                                onChange={e => updateParcela(i, 'tipo_documento_id', e.target.value || '')}
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                              >
                                <option value="">Selecione</option>
                                {tiposDocumento.map(tipo => <option key={tipo.id} value={tipo.id}>{tipo.nome}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-[10px] font-medium text-slate-500">Número do documento da parcela</label>
                              <input
                                type="text"
                                value={p.numero_documento || ''}
                                onChange={e => updateParcela(i, 'numero_documento', e.target.value)}
                                placeholder="Número específico desta parcela"
                                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-100"
                              />
                            </div>
                          </div>

                          {retencoesAbertas[i] && (
                            <div className="mt-2 rounded-lg border border-violet-100 bg-white p-3">
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold text-slate-700">Impostos retidos na fonte</p>
                                  <p className="text-[10px] text-slate-400">Informe os valores retidos. O total será subtraído do valor final da parcela.</p>
                                </div>
                                <span className="text-xs font-semibold text-violet-700">Total: {R$(calculaTotalRetencoes(p))}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {RETENCOES.map(imposto => (
                                  <div key={imposto.key}>
                                    <label className="mb-1 block text-[10px] font-medium text-slate-500">{imposto.label}</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={decimalInputValue(p[imposto.key])}
                                      placeholder="0,00"
                                      onChange={e => updateParcela(i, imposto.key, e.target.value)}
                                      className="w-full rounded border border-violet-100 bg-white px-2 py-1 text-right text-xs tabular-nums text-violet-700 focus:border-violet-300 focus:outline-none focus:ring-1 focus:ring-violet-100"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Obs */}
              <F label="Observações" name="obs">
                <textarea className={cn(inp, 'min-h-[56px] resize-none')}
                  value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Notas adicionais..." />
              </F>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={closeForm} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60">
                {saving ? 'Salvando…' : <><Check className="w-3.5 h-3.5" /> Salvar Lançamento</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBaixaModal && baixaParcela && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Baixa da Parcela</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {baixaParcela.fornecedor_nome || 'Fornecedor não informado'} · Parcela {baixaParcela.parcela_numero || '—'}/{baixaParcela.qtd_parcelas || 1}
                </p>
              </div>
              <button type="button" onClick={closeBaixaModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {baixaErrors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{baixaErrors._geral}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Valor da parcela</label>
                  <input className={inp} type="text" inputMode="decimal"
                    value={baixaForm.valor_parcela} onChange={e => updateBaixaForm('valor_parcela', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Data de pagamento <span className="text-red-500">*</span></label>
                  <input className={cn(inp, baixaErrors.dt_pagamento && 'border-red-300')} type="date"
                    value={baixaForm.dt_pagamento} onChange={e => updateBaixaForm('dt_pagamento', e.target.value)} />
                  {baixaErrors.dt_pagamento && <p className="text-[10px] text-red-500 mt-1">{baixaErrors.dt_pagamento}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Acréscimos</label>
                  <input className={inp} type="text" inputMode="decimal"
                    value={baixaForm.acrescimo} onChange={e => updateBaixaForm('acrescimo', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Descontos</label>
                  <input className={inp} type="text" inputMode="decimal"
                    value={baixaForm.desconto} onChange={e => updateBaixaForm('desconto', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Juros</label>
                  <input className={inp} type="text" inputMode="decimal"
                    value={baixaForm.juros} onChange={e => updateBaixaForm('juros', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Multa</label>
                  <input className={inp} type="text" inputMode="decimal"
                    value={baixaForm.multa} onChange={e => updateBaixaForm('multa', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Valor final</label>
                  <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none"
                    type="text" inputMode="decimal" value={baixaForm.valor_final} readOnly />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600">Banco / agência / conta de pagamento <span className="text-red-500">*</span></label>
                  <select className={cn(inp, baixaErrors.banco_conta_id && 'border-red-300')}
                    value={baixaForm.banco_conta_id} onChange={e => updateBaixaForm('banco_conta_id', e.target.value)}>
                    <option value="">Selecione a conta bancária</option>
                    {(bancosBaixa.length ? bancosBaixa : bancos).map(b => (
                      <option key={b.id} value={b.id}>
                        {b.empresa} · {b.banco_nome} · Ag. {b.agencia || '—'} · Conta {b.conta || '—'}
                      </option>
                    ))}
                  </select>
                  {baixaErrors.banco_conta_id && <p className="text-[10px] text-red-500 mt-1">{baixaErrors.banco_conta_id}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Forma de pagamento <span className="text-red-500">*</span></label>
                  <select className={cn(inp, baixaErrors.forma_pagamento && 'border-red-300')}
                    value={baixaForm.forma_pagamento} onChange={e => updateBaixaForm('forma_pagamento', e.target.value)}>
                    <option value="">Selecione</option>
                    <option value="Pix">Pix</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Débito automático">Débito automático</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Outro">Outro</option>
                  </select>
                  {baixaErrors.forma_pagamento && <p className="text-[10px] text-red-500 mt-1">{baixaErrors.forma_pagamento}</p>}
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600">Motivo da baixa</label>
                  <textarea className={cn(inp, 'min-h-[58px] resize-none')}
                    value={baixaForm.motivo_baixa} onChange={e => updateBaixaForm('motivo_baixa', e.target.value)}
                    placeholder="Ex.: pagamento realizado conforme boleto / ajuste manual / negociação" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button type="button" onClick={closeBaixaModal} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={salvarBaixa} disabled={savingBaixa}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-60">
                {savingBaixa ? 'Baixando…' : <><Check className="w-3.5 h-3.5" /> Confirmar baixa</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <FornecedorFormModal
        open={showFornecedorModal}
        editId={editingFornecedorId}
        initialData={editingFornecedorData}
        onClose={closeFornecedorModal}
        onSaved={salvo => {
          apiClient.get('/financeiro/fornecedores/select').then(sel => {
            const options = sel.data.data || []
            setFornecedores(options)
            setFForn(String(salvo.id))
            const atualizado = options.find((item: FornecedorOption) => Number(item.id) === Number(salvo.id))
            if (fModalidadePagamento === 'PIX') setFChavePixPagamento(atualizado?.chave_pix || salvo.chave_pix || '')
            if (fModalidadePagamento === 'TED' || fModalidadePagamento === 'DOC') {
              setFBancoPagamentoNome(atualizado?.banco_nome || salvo.banco_nome || '')
              setFBancoPagamentoCodigo(atualizado?.codigo_banco || salvo.codigo_banco || '')
              setFAgenciaPagamento(atualizado?.agencia || salvo.agencia || '')
              setFContaPagamento(atualizado?.conta || salvo.conta || '')
              setFDigitoPagamento(atualizado?.digito || salvo.digito || '')
              setFTipoContaPagamento(atualizado?.tipo_conta || salvo.tipo_conta || '')
            }
            if (!fEmp && salvo.empresa && salvo.empresa !== 'TODOS') setFEmp(salvo.empresa)
          })
          closeFornecedorModal()
        }}
      />


      {/* ── Modal confirmar exclusão ── */}
      {deletingId !== null && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5">
            <h3 className="font-bold text-slate-800 mb-2">Excluir lançamento?</h3>
            <p className="text-xs text-slate-500 mb-4">Esta ação não pode ser desfeita. Se houver baixa vinculada, o movimento bancário gerado por ela também será removido.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-xs rounded-lg border border-slate-200 hover:bg-slate-50">Cancelar</button>
              <button onClick={handleDeleteConfirm} disabled={deletingLoading}
                className="px-4 py-2 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold disabled:opacity-60">
                {deletingLoading ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
