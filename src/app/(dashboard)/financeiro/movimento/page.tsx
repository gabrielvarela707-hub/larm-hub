'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { Search, TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

const DEFAULT_YEAR = 2026

const moneyNumber = (value: unknown, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw || raw === '—' || raw === '-') return fallback
    const cleaned = raw.replace(/R\$/gi, '').replace(/\s/g, '')
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned
    const n = Number(normalized.replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) ? n : fallback
  }
  if (value === null || value === undefined) return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

const R$ = (v: number | string | null | undefined, showZero = false) => {
  const n = moneyNumber(v, 0)
  if (n === 0 && !showZero) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const raw = String(d).slice(0, 10)
  const parts = raw.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_SHORT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Mov {
  id: number
  data: string | null
  empresa: string | null
  banco: string | null
  entradas: number
  saidas: number
  fornecedor: string | null
  historico: string | null
  nf_doc: string | null
  emissao_doc: string | null
  conta_contabil: string | null
  centro_custo: string | null
  obra: string | null
  natureza_financeira: string | null
  n_cheque: string | null
  saldo: number | null
  status: string | null
  mes: number
  ano: number
}

interface SelectOption { id: number | string; nome: string }
interface ContaOption { id: number | string; label: string }
interface BancoConta { id: number | string; empresa?: string | null; banco_nome?: string | null; saldo_inicial?: number | string | null; data_saldo_inicial?: string | null }
interface Filtros {
  empresas: string[]
  bancos: string[]
  contas: ContaOption[]
  anos: number[]
  fornecedores: SelectOption[]
  tipos_documento: SelectOption[]
  status: string[]
}
interface Pagination { page: number; pages: number; total: number; limit: number }
interface Summary { total_entradas: number; total_saidas: number; saldo_inicial_bancos?: number; saldo_inicial?: number; saldo_inicial_ano?: number; saldo_movimento?: number; saldo_periodo?: number; saldo_final?: number }
interface ResumoMensal {
  mensal: Array<{ mes: number; entradas: number; saidas: number; saldo: number }>
  por_empresa: Array<{ empresa: string; entradas: number; saidas: number }>
  top_despesas: Array<{ conta_contabil: string; total: number }>
}

type SortKey =
  | 'data'
  | 'empresa'
  | 'banco'
  | 'entradas'
  | 'saidas'
  | 'fornecedor'
  | 'historico'
  | 'nf_doc'
  | 'emissao_doc'
  | 'conta_contabil'
  | 'centro_custo'
  | 'obra'
  | 'natureza_financeira'
  | 'n_cheque'
  | 'saldo'

type SortDir = 'asc' | 'desc'

const LIMIT = 50

const labelStatus = (status: string | null | undefined) => {
  const s = String(status || '').toLowerCase()
  if (s === 'pago' || s === 'paga') return 'Pago'
  if (s === 'recebido' || s === 'recebida') return 'Recebido'
  return status || '—'
}

const statusClass = (status: string | null | undefined) => {
  const s = String(status || '').toLowerCase()
  if (s === 'pago' || s === 'paga') return 'bg-red-50 text-red-700'
  if (s === 'recebido' || s === 'recebida') return 'bg-emerald-50 text-emerald-700'
  return 'bg-slate-100 text-slate-600'
}

function syncHorizontalScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
  if (!target || target.scrollLeft === source.scrollLeft) return
  target.scrollLeft = source.scrollLeft
}

function Pager({ page, pages, total, limit, loading, onChange }: {
  page: number; pages: number; total: number; limit: number; loading: boolean; onChange: (p: number) => void
}) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
      <p className="text-xs text-slate-400">
        {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} de <b>{total.toLocaleString('pt-BR')}</b>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1 || loading}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs px-2 text-slate-600">{page}/{pages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= pages || loading}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-30">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function Skel({ cols }: { cols: number }) {
  return <>{[...Array(8)].map((_, i) => (
    <tr key={i} className="border-b border-slate-50">
      {[...Array(cols)].map((_, j) => (
        <td key={j} className="px-3 py-2.5">
          <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${55 + ((i * 13 + j * 7) % 40)}%` }} />
        </td>
      ))}
    </tr>
  ))}</>
}

function FilterField({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('space-y-1.5', className)}>
      <span className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  )
}

export default function MovimentoPage() {
  const [filtros, setFiltros] = useState<Filtros | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [pag, setPag] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: LIMIT })
  const [summary, setSummary] = useState<Summary | null>(null)
  const [saldoInicialBancosFallback, setSaldoInicialBancosFallback] = useState(0)
  const [resumo, setResumo] = useState<ResumoMensal | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'lista' | 'resumo'>('lista')

  const [fEmpresa, setFEmpresa] = useState('')
  const [fBanco, setFBanco] = useState('')
  const [fConta, setFConta] = useState('')
  const [fFornecedor, setFFornecedor] = useState('')
  const [fTipoDocumento, setFTipoDocumento] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fDataDe, setFDataDe] = useState('')
  const [fDataAte, setFDataAte] = useState('')
  const [fAno, setFAno] = useState<number>(DEFAULT_YEAR)
  const [fMes, setFMes] = useState<number | null>(null)
  const [fTipo, setFTipo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('data')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [busca, setBusca] = useState('')
  const topTableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableMinWidth = 1900

  const inp = 'w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400'

  useEffect(() => {
    apiClient.get('/financeiro/movimento/filtros').then(r => {
      setFiltros(r.data.data as Filtros)
    }).catch(() => {})
  }, [])

  const ordenar = `${sortKey}_${sortDir}`

  const yearOptions = Array.from(new Set([
    ...Array.from({ length: DEFAULT_YEAR - 2021 + 1 }, (_, i) => 2021 + i),
    ...(filtros?.anos ?? []),
  ]))
    .filter(a => Number.isFinite(Number(a)) && Number(a) >= 2021)
    .map(Number)
    .sort((a, b) => a - b)

  const loadMovs = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: pg, limit: LIMIT, ordenar, ano: fAno }
      if (fEmpresa) params.empresa = fEmpresa
      if (fBanco) params.banco = fBanco
      if (fConta) params.conta_id = fConta
      if (fFornecedor) params.fornecedor_id = fFornecedor
      if (fTipoDocumento) params.tipo_documento_id = fTipoDocumento
      if (fStatus) params.status = fStatus
      if (fDataDe) params.data_de = fDataDe
      if (fDataAte) params.data_ate = fDataAte
      if (fTipo) params.tipo = fTipo
      if (busca) params.busca = busca
      const r = await apiClient.get('/financeiro/movimento', { params })
      setMovs(r.data.data)
      setPag(r.data.pagination)
      setSummary(r.data.summary)
    } catch { }
    finally { setLoading(false) }
  }, [ordenar, fAno, fEmpresa, fBanco, fConta, fFornecedor, fTipoDocumento, fStatus, fDataDe, fDataAte, fTipo, busca])

  const loadResumo = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { ano: fAno }
      if (fEmpresa) params.empresa = fEmpresa
      if (fMes) params.mes = fMes
      const r = await apiClient.get('/financeiro/movimento/resumo', { params })
      setResumo(r.data.data)
    } catch { }
  }, [fAno, fEmpresa, fMes])

  const loadSaldoInicialBancos = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { ano: fAno }
      if (fEmpresa) params.empresa = fEmpresa
      if (fBanco) params.banco = fBanco
      if (fConta) params.conta_id = fConta

      const r = await apiClient.get('/financeiro/movimento/saldo-inicial-bancos', { params })
      const value = r.data?.data?.saldo_inicial ?? r.data?.saldo_inicial ?? r.data?.summary?.saldo_inicial_bancos
      setSaldoInicialBancosFallback(moneyNumber(value, 0))
      return
    } catch {
      // Fallback proposital: usa a mesma origem que já alimenta Financeiro > Bancos e Contas.
    }

    try {
      const params: Record<string, unknown> = {}
      if (fEmpresa) params.empresa = fEmpresa

      const r = await apiClient.get('/financeiro/bancos', { params })
      const contas = (r.data?.data ?? []) as BancoConta[]
      const total = contas
        .filter(c => !fConta || String(c.id) === String(fConta))
        .filter(c => !fBanco || String(c.banco_nome || '').toLowerCase().includes(String(fBanco).toLowerCase()))
        .filter(c => {
          const data = String(c.data_saldo_inicial || '')
          return !data || data.slice(0, 4) === String(fAno)
        })
        .reduce((acc, c) => acc + moneyNumber(c.saldo_inicial, 0), 0)

      setSaldoInicialBancosFallback(total)
    } catch {
      setSaldoInicialBancosFallback(0)
    }
  }, [fAno, fEmpresa, fBanco, fConta])

  useEffect(() => {
    loadSaldoInicialBancos()
  }, [loadSaldoInicialBancos])

  useEffect(() => {
    if (activeTab === 'lista') loadMovs(1)
    else loadResumo()
  }, [fAno, fEmpresa, fBanco, fConta, fFornecedor, fTipoDocumento, fStatus, fDataDe, fDataAte, fTipo, ordenar, activeTab, loadMovs, loadResumo])

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'data' || key === 'emissao_doc' ? 'desc' : 'asc')
    }
  }

  const SortTh = ({ k, children, align = 'left' }: { k: SortKey; children: ReactNode; align?: 'left' | 'right' | 'center' }) => (
    <th
      onClick={() => changeSort(k)}
      className={cn('px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className="text-white/70">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  )

  const resetFiltros = () => {
    setFEmpresa('')
    setFBanco('')
    setFConta('')
    setFFornecedor('')
    setFTipoDocumento('')
    setFStatus('')
    setFDataDe('')
    setFDataAte('')
    setFTipo('')
    setBusca('')
    setFAno(DEFAULT_YEAR)
    setFMes(null)
  }


  const exportarExcel = async () => {
    const params: Record<string, unknown> = { ano: fAno }
    if (fEmpresa) params.empresa = fEmpresa
    if (fBanco) params.banco = fBanco
    if (fConta) params.conta_id = fConta
    if (fFornecedor) params.fornecedor_id = fFornecedor
    if (fTipoDocumento) params.tipo_documento_id = fTipoDocumento
    if (fStatus) params.status = fStatus
    if (fDataDe) params.data_de = fDataDe
    if (fDataAte) params.data_ate = fDataAte
    if (fTipo) params.tipo = fTipo
    if (busca) params.busca = busca

    const r = await apiClient.get('/financeiro/movimento/exportar', { params, responseType: 'blob' })
    const url = window.URL.createObjectURL(new Blob([r.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `movimento-bancario-${fAno}.xls`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Movimento Bancário</h1>
          <p className="text-sm text-slate-500 mt-0.5">Movimentações realizadas por empresa, banco e conta</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {activeTab === 'lista' && (
            <button type="button" onClick={exportarExcel}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50">
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </button>
          )}
          {(['lista', 'resumo'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={cn('px-4 py-2 rounded-lg text-xs font-medium transition-colors',
                activeTab === t ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {t === 'lista' ? 'Extrato' : 'Resumo'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Filtro por ano</p>
          <p className="text-xs text-slate-400">Selecione o ano importado para consultar o movimento bancário</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {yearOptions.map(year => (
            <button key={year} type="button" onClick={() => setFAno(year)}
              className={cn('px-4 py-2 rounded-lg text-xs font-semibold transition-colors border',
                fAno === year
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100')}>
              {year}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <FilterField label="Busca" className="xl:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadMovs(1)}
                placeholder="Fornecedor, documento, histórico ou banco..."
                className={cn(inp, 'pl-9')} />
            </div>
          </FilterField>

          <FilterField label="Fornecedor">
            <select value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} className={inp}>
              <option value="">Todos fornecedores</option>
              {(filtros?.fornecedores ?? []).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </FilterField>

          <FilterField label="Tipo de documento">
            <select value={fTipoDocumento} onChange={e => setFTipoDocumento(e.target.value)} className={inp}>
              <option value="">Todos tipos</option>
              {(filtros?.tipos_documento ?? []).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </FilterField>

          <FilterField label="Data de">
            <input type="date" value={fDataDe} onChange={e => setFDataDe(e.target.value)} className={inp} />
          </FilterField>

          <FilterField label="Data até">
            <input type="date" value={fDataAte} onChange={e => setFDataAte(e.target.value)} className={inp} />
          </FilterField>

          <FilterField label="Empresa">
            <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)} className={inp}>
              <option value="">Todas empresas</option>
              {(filtros?.empresas ?? []).map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </FilterField>

          <FilterField label="Status">
            <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={inp}>
              <option value="">Todos status</option>
              {['pago', 'recebido'].map(s => (
                <option key={s} value={s}>{labelStatus(s)}</option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Banco">
            <select value={fBanco} onChange={e => setFBanco(e.target.value)} className={inp}>
              <option value="">Todos bancos</option>
              {(filtros?.bancos ?? []).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </FilterField>

          <FilterField label="Conta">
            <select value={fConta} onChange={e => setFConta(e.target.value)} className={inp}>
              <option value="">Todas contas</option>
              {(filtros?.contas ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </FilterField>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-3">
          <div className="flex gap-1.5">
            {[{ v: '', l: 'Todos' }, { v: 'entrada', l: 'Entradas' }, { v: 'saida', l: 'Saídas' }].map(o => (
              <button key={o.v} onClick={() => setFTipo(o.v)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  fTipo === o.v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                {o.l}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={resetFiltros}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg">
              Limpar filtros
            </button>
            <button onClick={() => activeTab === 'lista' ? loadMovs(1) : loadResumo()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
              Buscar
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'lista' && (
        <>
          {summary && (() => {
            const saldoInicialApi = moneyNumber(summary.saldo_inicial_bancos ?? summary.saldo_inicial_ano ?? summary.saldo_inicial, 0)
            const saldoInicial = saldoInicialApi !== 0 ? saldoInicialApi : saldoInicialBancosFallback
            const totalEntradas = moneyNumber(summary.total_entradas, 0)
            const totalSaidas = moneyNumber(summary.total_saidas, 0)
            const saldoMovimento = moneyNumber(summary.saldo_movimento, totalEntradas - totalSaidas)
            const saldoFinal = saldoInicial + saldoMovimento
            const cards = [
              { label: `Saldo Inicial ${fAno}`, value: saldoInicial, color: saldoInicial >= 0 ? 'text-blue-600' : 'text-orange-600', icon: DollarSign },
              { label: 'Entradas', value: totalEntradas, color: 'text-green-600', icon: TrendingUp },
              { label: 'Saídas', value: totalSaidas, color: 'text-red-600', icon: TrendingDown },
              { label: 'Saldo Final', value: saldoFinal, color: saldoFinal >= 0 ? 'text-blue-600' : 'text-orange-600', icon: DollarSign },
            ]

            return (
              <div className="flex gap-3 flex-wrap justify-end">
                {cards.map(s => (
                  <div key={s.label} className="bg-white rounded-lg border border-slate-100 px-3 py-2 flex items-center gap-2">
                    <s.icon className={cn('w-4 h-4', s.color)} />
                    <div>
                      <p className="text-[10px] text-slate-400">{s.label}</p>
                      <p className={cn('text-sm font-bold', s.color)}>{R$(s.value, s.label.startsWith('Saldo Inicial'))}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}

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
              className="overflow-x-auto"
            >
              <table className="w-full text-xs" style={{ minWidth: tableMinWidth }}>
                <thead>
                  <tr className="bg-[#0d1b2a] text-white">
                    <SortTh k="data">Data</SortTh>
                    <SortTh k="empresa">Empresa</SortTh>
                    <SortTh k="banco">Banco</SortTh>
                    <SortTh k="entradas" align="right">Entradas</SortTh>
                    <SortTh k="saidas" align="right">Saídas</SortTh>
                    <SortTh k="fornecedor">Fornecedor</SortTh>
                    <SortTh k="historico">Histórico</SortTh>
                    <SortTh k="nf_doc">NF/DOC</SortTh>
                    <SortTh k="emissao_doc">Emissão DOC</SortTh>
                    <SortTh k="conta_contabil">Conta Contábil</SortTh>
                    <SortTh k="centro_custo">Centro de Custo</SortTh>
                    <SortTh k="obra">Obra</SortTh>
                    <SortTh k="natureza_financeira">Natureza Financeira</SortTh>
                    <SortTh k="n_cheque">N. Cheque</SortTh>
                    <SortTh k="saldo" align="right">Saldo</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {loading && <Skel cols={15} />}
                  {!loading && movs.length === 0 && (
                    <tr><td colSpan={15} className="text-center text-slate-400 py-12 text-sm">Nenhuma movimentação encontrada para {fAno}</td></tr>
                  )}
                  {!loading && movs.map(m => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(m.data)}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{m.empresa || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{m.banco || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-green-600">{R$(m.entradas)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-600">{R$(m.saidas)}</td>
                      <td className="px-3 py-2 max-w-[180px]">
                        <p className="font-medium text-slate-700 truncate">{m.fornecedor || '—'}</p>
                        {m.status && <span className={cn('inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-medium', statusClass(m.status))}>{labelStatus(m.status)}</span>}
                      </td>
                      <td className="px-3 py-2 max-w-[360px]"><p className="text-slate-700 truncate" title={m.historico || ''}>{m.historico || '—'}</p></td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{m.nf_doc || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(m.emissao_doc)}</td>
                      <td className="px-3 py-2 max-w-[180px]"><p className="text-slate-600 truncate" title={m.conta_contabil || ''}>{m.conta_contabil || '—'}</p></td>
                      <td className="px-3 py-2 max-w-[180px]"><p className="text-slate-600 truncate" title={m.centro_custo || ''}>{m.centro_custo || '—'}</p></td>
                      <td className="px-3 py-2 max-w-[160px]"><p className="text-slate-600 truncate" title={m.obra || ''}>{m.obra || '—'}</p></td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{m.natureza_financeira || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{m.n_cheque || '—'}</td>
                      <td className={cn('px-3 py-2 text-right tabular-nums font-medium', (m.saldo ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600')}>{R$(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...pag} loading={loading} onChange={p => loadMovs(p)} />
          </div>
        </>
      )}

      {activeTab === 'resumo' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex gap-3 flex-wrap">
            <FilterField label="Ano">
              <select value={fAno} onChange={e => setFAno(Number(e.target.value))} className={inp}>
                {yearOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </FilterField>
            <FilterField label="Mês">
              <select value={fMes ?? ''} onChange={e => setFMes(e.target.value ? Number(e.target.value) : null)} className={inp}>
                <option value="">Todos meses</option>
                {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </FilterField>
          </div>

          {resumo?.mensal && resumo.mensal.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Entradas vs Saídas — {fAno}</h3>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-3 h-36 min-w-max pb-1">
                  {resumo.mensal.map(m => {
                    const maxVal = Math.max(...resumo.mensal.map(x => Math.max(x.entradas, x.saidas)))
                    const pctE = maxVal > 0 ? (m.entradas / maxVal) * 100 : 0
                    const pctS = maxVal > 0 ? (m.saidas / maxVal) * 100 : 0
                    return (
                      <div key={m.mes} className="flex flex-col items-center gap-1">
                        <div className="flex items-end gap-0.5 h-28">
                          <div className="w-5 rounded-t bg-green-400" style={{ height: `${Math.max(pctE, 2)}%` }} title={`Entradas: ${R$(m.entradas)}`} />
                          <div className="w-5 rounded-t bg-red-400" style={{ height: `${Math.max(pctS, 2)}%` }} title={`Saídas: ${R$(m.saidas)}`} />
                        </div>
                        <span className="text-[9px] text-slate-400">{MESES_SHORT[m.mes]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {resumo?.por_empresa && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Empresa</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100">
                    {['Empresa', 'Entradas', 'Saídas', 'Saldo'].map(h => <th key={h} className="text-left py-1.5 text-slate-500 font-medium">{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {resumo.por_empresa.map(e => (
                      <tr key={e.empresa} className="border-b border-slate-50">
                        <td className="py-2 font-medium text-slate-700">{e.empresa}</td>
                        <td className="py-2 text-green-600 tabular-nums">{R$(e.entradas)}</td>
                        <td className="py-2 text-red-600 tabular-nums">{R$(e.saidas)}</td>
                        <td className={cn('py-2 tabular-nums font-semibold', (e.entradas - e.saidas) >= 0 ? 'text-blue-600' : 'text-orange-600')}>
                          {R$(e.entradas - e.saidas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {resumo?.top_despesas && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Top Categorias de Despesa</h3>
                <div className="space-y-2">
                  {resumo.top_despesas.map((d, i) => {
                    const pct = resumo.top_despesas[0]?.total ? (d.total / resumo.top_despesas[0].total) * 100 : 0
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 truncate max-w-[180px]">{d.conta_contabil}</span>
                          <span className="text-red-600 font-medium tabular-nums ml-2">{R$(d.total)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
