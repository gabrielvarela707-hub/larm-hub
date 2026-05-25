'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Search, X, Check, FileText, Loader2, Sparkles, Pencil, Trash2, ChevronsUpDown, RotateCcw } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { BANCOS_BR } from '@/lib/bancos-br'
import { cn } from '@/lib/utils'
import FornecedorFormModal from '@/components/financeiro/FornecedorFormModal'

interface Fornecedor { id: number; razao_social: string; empresa: string; cnpj_cpf?: string | null; nome_fantasia?: string | null }
interface BancoConta { id: number; empresa: string; banco_nome: string; agencia: string | null; conta: string | null }
interface PlanoConta  { id: number; codigo: string; descricao: string; tipo: string }
interface TipoDocumento { id: number; nome: string }
interface Parcela     { id?: number; numero: number; valor: number | string; vencimento: string; status: string; acrescimo?: number | string; multa?: number | string; juros?: number | string; desconto?: number | string; valor_final?: number | string }
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

interface Lancamento {
  id: number; empresa: string; historico: string; produto_servico: string | null
  tipo_documento_id?: number | null; tipo_documento_nome?: string | null
  nf_doc: string | null; documento_nome?: string | null; dt_emissao: string | null; valor_total: number
  qtd_parcelas: number; status: string; conta_contabil: string | null
  descricao_conta: string | null; centro_custo: string | null; obs: string | null
  fornecedor_nome: string | null; banco_nome: string | null; proximo_venc: string | null
  parcela_id?: number | null; parcela_numero?: number | null; parcela_valor?: number | null
  parcela_vencimento?: string | null; parcela_status?: string | null; parcela_dt_pagamento?: string | null
  parcela_motivo_baixa?: string | null; parcela_acrescimo?: number | null; parcela_desconto?: number | null
  parcela_juros?: number | null; parcela_multa?: number | null; parcela_valor_final?: number | null
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
  dt_pagamento: string
}

const EMPRESAS = ['LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  pago:     'bg-green-100 text-green-700',
  vencido:  'bg-red-100 text-red-700',
  cancelado:'bg-slate-100 text-slate-500',
}

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
const calculaValorFinalParcela = (p: Pick<Parcela, 'valor' | 'acrescimo' | 'multa' | 'juros' | 'desconto'>) =>
  Math.max(0, toFiniteNumber(p.valor) + toFiniteNumber(p.acrescimo) + toFiniteNumber(p.multa) + toFiniteNumber(p.juros) - toFiniteNumber(p.desconto))
const normalizaParcelaPayload = (p: Parcela, idx: number): Parcela => {
  const next: Parcela = {
    id: p.id,
    numero: Number(p.numero) || idx + 1,
    valor: toFiniteNumber(p.valor),
    vencimento: dateOnly(p.vencimento) || todayISO(),
    status: p.status || 'pendente',
    acrescimo: toFiniteNumber(p.acrescimo),
    multa: toFiniteNumber(p.multa),
    juros: toFiniteNumber(p.juros),
    desconto: toFiniteNumber(p.desconto),
  }
  next.valor_final = calculaValorFinalParcela(next)
  return next
}
const sortText = (v: unknown) => String(v ?? '').toLocaleLowerCase('pt-BR')
const sortDate = (v: string | null | undefined) => v ? (Date.parse(v) || 0) : 0
const getSortValue = (l: Lancamento, key: SortKey): string | number => {
  switch (key) {
    case 'empresa': return sortText(l.empresa)
    case 'fornecedor': return sortText(l.fornecedor_nome)
    case 'tipo_documento': return sortText(l.tipo_documento_nome)
    case 'numero': return sortText(l.nf_doc)
    case 'parcela': return Number(l.parcela_numero || 0)
    case 'valor': {
      const valor = Number(l.parcela_valor ?? l.valor_total ?? 0)
      const final = l.parcela_valor_final === null || l.parcela_valor_final === undefined
        ? valor + Number(l.parcela_acrescimo || 0) + Number(l.parcela_multa || 0) + Number(l.parcela_juros || 0) - Number(l.parcela_desconto || 0)
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


// ─── BancoSelect ─────────────────────────────────────────────────────────────
function BancoSelect({ value, onChange, inp }: { value: string; onChange: (v: string) => void; inp: string }) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const filtered = BANCOS_BR.filter(b =>
    b.codigo.includes(busca) || b.nome.toLowerCase().includes(busca.toLowerCase())
  ).slice(0, 60)
  const selected = BANCOS_BR.find(b => b.codigo === value)
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(inp, 'flex items-center justify-between gap-2 text-left')}>
        <span className={selected ? 'text-slate-700' : 'text-slate-400'}>
          {selected ? `${selected.codigo} — ${selected.nome}` : 'Selecione o banco…'}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-[70] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código ou nome…"
              className="w-full px-2 py-1.5 text-xs rounded border border-slate-200 bg-white outline-none" />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setBusca('') }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50">— Nenhum —</button>
            {filtered.map(b => (
              <button key={b.codigo} type="button"
                onClick={() => { onChange(b.codigo); setOpen(false); setBusca('') }}
                className={cn('w-full text-left px-3 py-2 text-xs hover:bg-blue-50', value === b.codigo && 'bg-blue-50 font-medium')}>
                <span className="font-mono text-blue-600 mr-2">{b.codigo}</span>{b.nome}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">Nenhum banco encontrado</p>}
          </div>
        </div>
      )}

    </div>
  )
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
function fornecedorLabel(f: Fornecedor) {
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
  fornecedores: Fornecedor[]
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
  // banco brasileiro selecionado (código BACEN)
  const [fBancoCodigo, setFBancoCodigo] = useState('')
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
    dt_pagamento: todayISO(),
  })

  // Listas para selects
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
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
  const [fCC,      setFCC]      = useState('')
  const [fObs,     setFObs]     = useState('')
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
  const [parcelas, setParcelas] = useState<Parcela[]>([])
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
    const ps: Parcela[] = Array.from({ length: n }, (_, i) => {
      const valor = parseFloat((vlr / n).toFixed(2))
      return {
        numero: i + 1,
        valor,
        vencimento: addMonthsDateOnly(fEmissao || todayISO(), i + 1),
        status: 'pendente',
        acrescimo: 0,
        multa: 0,
        juros: 0,
        desconto: 0,
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
        acrescimo: atual.acrescimo ?? 0,
        multa: atual.multa ?? 0,
        juros: atual.juros ?? 0,
        desconto: atual.desconto ?? 0,
      }
      next.valor_final = calculaValorFinalParcela(next)
      return next
    }))
  }, [fValor, fNParc, fEmissao])

  function updateParcela(i: number, key: keyof Parcela, val: string | number) {
    setParcelas(p => p.map((x, idx) => {
      if (idx !== i) return x
      const next = { ...x, [key]: val } as Parcela
      if (['valor', 'acrescimo', 'multa', 'juros', 'desconto'].includes(String(key))) {
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

  function openFornecedorModal() {
    setFornecedorErrors({})
    setNovoFornecedor({
      razao_social: '', nome_fantasia: '', cnpj_cpf: '',
      tipo_pessoa: 'PJ', empresa: fEmp || 'TODOS', codigo: '', email: '', telefone: '',
      cep: '', endereco: '', cidade_uf: '', codigo_banco: '', banco_nome: '',
      agencia: '', conta: '', digito: '', tipo_conta: 'Corrente', chave_pix: '', tipo_pix: '',
    })
    setShowFornecedorModal(true)
  }

  function closeFornecedorModal() {
    if (savingFornecedor) return
    setShowFornecedorModal(false)
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
      const criado = r.data.data as Fornecedor
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
    setAiMessage(''); setAiLoading(false); aiParcelasRef.current = null
    setParcelas([]); setErrors({})
    setShowFornecedorModal(false); setFornecedorErrors({})
    setShowBaixaModal(false); setBaixaParcela(null); setBaixaErrors({})
    setFBancoCodigo(''); setEditingId(null)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fEmp)       e.empresa   = 'Obrigatório'
    if (!fHistorico) e.historico = 'Obrigatório'
    if (!fValor || moneyToNumber(fValor) <= 0) e.valor = 'Informe um valor válido'
    if (fNF && fNF.replace(/\D/g, '').length > 0 && fNF.replace(/\D/g, '').length < 9)
      e.nf_doc = 'Mínimo 9 dígitos numéricos'
    if (Object.keys(e).length) {
      e._geral = 'Revise os campos: algum deles está impedindo o envio das informações.'
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
      setFForn(String(fornecedor.id))
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
      if (d.parcelas?.length) {
        const loadedParcelas = d.parcelas.map((p: { id?: number; numero: number; valor: number | string; vencimento: string; status: string; acrescimo?: number | string; multa?: number | string; juros?: number | string; desconto?: number | string; valor_final?: number | string }, idx: number) =>
          normalizaParcelaPayload({
            id: p.id,
            numero: p.numero,
            valor: toFiniteNumber(p.valor),
            vencimento: dateOnly(p.vencimento),
            status: p.status || 'pendente',
            acrescimo: toFiniteNumber(p.acrescimo),
            multa: toFiniteNumber(p.multa),
            juros: toFiniteNumber(p.juros),
            desconto: toFiniteNumber(p.desconto),
            valor_final: toFiniteNumber(p.valor_final),
          }, idx)
        )
        // Evita o efeito automático de parcelamento sobrescrever os valores
        // carregados do banco com multa/juros/desconto zerados.
        aiParcelasRef.current = loadedParcelas
        setParcelas(loadedParcelas)
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
      const payload = {
        empresa:         fEmp,
        fornecedor_id:   fForn   || null,
        banco_conta_id:  fBanco  || null,
        conta_contabil:  fConta  || null,
        descricao_conta: contaObj?.descricao || null,
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
        parcelas:        parcelas.map((p, idx) => normalizaParcelaPayload(p, idx)),
      }
      if (editingId) {
        await apiClient.put(`/financeiro/lancamentos-cp/${editingId}`, payload)
      } else {
        await apiClient.post('/financeiro/lancamentos-cp', payload)
      }
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Contas a Pagar</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} parcelas · {R$(totalVlr)} em aberto</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo Lançamento
        </button>
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
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                <TH label="Empresa" k="empresa" />
                <TH label="Fornecedor" k="fornecedor" />
                <TH label="Tipo de documento" k="tipo_documento" />
                <TH label="Número" k="numero" />
                <TH label="Parcela" k="parcela" align="center" />
                <TH label="Valor" k="valor" align="right" />
                <TH label="Emissão" k="emissao" />
                <TH label="Vencimento" k="vencimento" />
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
                return (
                  <tr key={`${l.id}-${l.parcela_id || l.parcela_numero || 'sem-parcela'}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{l.empresa}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <p className="font-medium text-slate-700 truncate">{l.fornecedor_nome || '—'}</p>
                      {l.banco_nome && <p className="text-slate-400 text-[10px] truncate">{l.banco_nome}</p>}
                    </td>
                    <td className="px-3 py-2 max-w-[150px] text-slate-600 truncate">{l.tipo_documento_nome || '—'}</td>
                    <td className="px-3 py-2 max-w-[130px] text-slate-600 truncate">
                      <p className="truncate">{l.nf_doc || '—'}</p>
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
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.dt_emissao)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.parcela_vencimento || l.proximo_venc)}</td>
                    <td className="px-3 py-2 min-w-[210px] text-slate-500 align-top">
                      <p className="whitespace-nowrap">{fmtDate(l.parcela_dt_pagamento)}</p>
                      {mostrarBaixa && (
                        <div className="mt-1 space-y-0.5 text-[10px] leading-4 text-slate-400">
                          <p>Forma: {l.parcela_forma_pagamento || '—'}</p>
                          <p>Multa {R$(getBaixaValor(l, 'multa'))} · Juros {R$(getBaixaValor(l, 'juros'))}</p>
                          <p>Desc. {R$(getBaixaValor(l, 'desconto'))} · Acrésc. {R$(getBaixaValor(l, 'acrescimo'))}</p>
                          <p className="font-semibold text-slate-500">Valor final da baixa: {R$(valorFinalBaixa)}</p>
                          {l.parcela_motivo_baixa && <p className="truncate max-w-[190px]">Motivo: {l.parcela_motivo_baixa}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
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
                      <button type="button" onClick={openFornecedorModal} className="text-[10px] font-semibold text-blue-700 hover:text-blue-900">
                        + Novo fornecedor
                      </button>
                    </div>
                    <FornecedorSelect
                      value={fForn}
                      onChange={setFForn}
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
                    <input className={cn(inp, errors.nf_doc && 'border-red-300')} value={fNF} onChange={e => setFNF(e.target.value)} placeholder="Mín. 9 dígitos numéricos" />
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
                    <PlanoContasSelect value={fConta} onChange={setFConta} contas={plano} inp={inp} />
                  </F>
                  <F label="Banco para Pagamento" name="banco_conta_id">
                    <BancoSelect
                      value={fBancoCodigo}
                      onChange={v => {
                        setFBancoCodigo(v)
                        const match = bancos.find(b => b.banco_nome?.toLowerCase().includes(BANCOS_BR.find(x=>x.codigo===v)?.nome?.split(' ')[0]?.toLowerCase()||'__') || String(b.id) === v)
                        setFBanco(match ? String(match.id) : '')
                      }}
                      inp={inp}
                    />
                    {bancos.filter(b => !fEmp || b.empresa === fEmp).length > 0 && (
                      <select className={cn(inp,'mt-1 text-[10px] text-slate-500')} value={fBanco} onChange={e => setFBanco(e.target.value)}>
                        <option value="">Conta cadastrada (opcional)</option>
                        {bancos.filter(b => !fEmp || b.empresa === fEmp)
                          .map(b => <option key={b.id} value={b.id}>{b.empresa} – {b.banco_nome} {b.agencia ? `ag.${b.agencia}` : ''} {b.conta || ''}</option>)}
                      </select>
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
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {parcelas.map((p, i) => (
                        <div key={i} className="grid grid-cols-[60px_1fr_95px_85px_85px_85px_105px] items-end gap-2 bg-slate-50 rounded-lg px-3 py-2">
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
                            <label className="block text-[10px] text-slate-500 mb-1">Final</label>
                            <div className="text-xs border border-slate-200 rounded px-2 py-1 bg-slate-100 w-full text-right tabular-nums font-semibold text-slate-700">
                              {R$(calculaValorFinalParcela(p))}
                            </div>
                          </div>
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
        onClose={closeFornecedorModal}
        onSaved={criado => {
          apiClient.get('/financeiro/fornecedores/select').then(sel => {
            setFornecedores(sel.data.data || [])
            setFForn(String(criado.id))
            if (!fEmp && criado.empresa && criado.empresa !== 'TODOS') setFEmp(criado.empresa)
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
