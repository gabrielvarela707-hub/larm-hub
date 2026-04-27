'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

const R$ = (v: number | null | undefined) => {
  const n = v ?? 0
  if (n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_SHORT = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Mov {
  id: number; data: string; empresa: string; banco: string
  entradas: number; saidas: number; saldo: number
  fornecedor: string; historico: string; nf_doc: string
  conta_contabil: string; centro_custo: string; natureza_financeira: string
  dia: number; mes: number; ano: number
}

interface Filtros { empresas: string[]; bancos: string[]; anos: number[]; contas: Array<{ conta_contabil: string; natureza_financeira: string }> }
interface Pagination { page: number; pages: number; total: number; limit: number }
interface Summary { total_entradas: number; total_saidas: number; saldo_periodo: number }
interface ResumoMensal { mensal: Array<{ mes: number; entradas: number; saidas: number; saldo: number }>; por_empresa: Array<{ empresa: string; entradas: number; saidas: number }>; top_despesas: Array<{ conta_contabil: string; total: number }> }

const LIMIT = 50

// ─── Pagination component ─────────────────────────────────────────────────────

function Pager({ page, pages, total, limit, loading, onChange }: { page: number; pages: number; total: number; limit: number; loading: boolean; onChange: (p: number) => void }) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
      <p className="text-xs text-slate-400">
        {((page-1)*limit)+1}–{Math.min(page*limit, total)} de <b>{total.toLocaleString('pt-BR')}</b>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page-1)} disabled={page<=1||loading}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs px-2 text-slate-600">{page}/{pages}</span>
        <button onClick={() => onChange(page+1)} disabled={page>=pages||loading}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-30">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Skeletons ────────────────────────────────────────────────────────────────
function Skel({ cols }: { cols: number }) {
  return <>{[...Array(8)].map((_,i) => (
    <tr key={i} className="border-b border-slate-50">
      {[...Array(cols)].map((_,j) => (
        <td key={j} className="px-3 py-2.5">
          <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${55+((i*13+j*7)%40)}%` }} />
        </td>
      ))}
    </tr>
  ))}</>
}

export default function MovimentoPage() {
  const [filtros,    setFiltros]    = useState<Filtros | null>(null)
  const [movs,       setMovs]       = useState<Mov[]>([])
  const [pag,        setPag]        = useState<Pagination>({ page:1, pages:1, total:0, limit:LIMIT })
  const [summary,    setSummary]    = useState<Summary | null>(null)
  const [resumo,     setResumo]     = useState<ResumoMensal | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [activeTab,  setActiveTab]  = useState<'lista'|'resumo'>('lista')

  // Filtros ativos
  const [fEmpresa,   setFEmpresa]   = useState('')
  const [fBanco,     setFBanco]     = useState('')
  const [fAno,       setFAno]       = useState<number>(2026)
  const [fMes,       setFMes]       = useState<number | null>(null)
  const [fTipo,      setFTipo]      = useState('') // entrada|saida
  const [busca,      setBusca]      = useState('')
  const [page,       setPage]       = useState(1)

  // Carrega filtros disponíveis
  useEffect(() => {
    apiClient.get('/financeiro/movimento/filtros')
      .then(r => setFiltros(r.data.data))
      .catch(() => {})
  }, [])

  const loadMovs = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: pg, limit: LIMIT, ano: fAno }
      if (fEmpresa) params.empresa  = fEmpresa
      if (fBanco)   params.banco    = fBanco
      if (fMes)     params.mes      = fMes
      if (fTipo)    params.tipo     = fTipo
      if (busca)    params.busca    = busca

      const r = await apiClient.get('/financeiro/movimento', { params })
      setMovs(r.data.data)
      setPag(r.data.pagination)
      setSummary(r.data.summary)
      setPage(pg)
    } catch { }
    finally { setLoading(false) }
  }, [fEmpresa, fBanco, fAno, fMes, fTipo, busca])

  const loadResumo = useCallback(async () => {
    try {
      const params: Record<string, unknown> = { ano: fAno }
      if (fEmpresa) params.empresa = fEmpresa
      const r = await apiClient.get('/financeiro/movimento/resumo', { params })
      setResumo(r.data.data)
    } catch { }
  }, [fAno, fEmpresa])

  useEffect(() => {
    if (activeTab === 'lista') loadMovs(1)
    else loadResumo()
  }, [fEmpresa, fBanco, fAno, fMes, fTipo, activeTab])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Movimento Bancário</h1>
          <p className="text-sm text-slate-500 mt-0.5">Todas as movimentações por empresa e banco</p>
        </div>
        <div className="flex gap-2">
          {['lista', 'resumo'].map(t => (
            <button key={t} onClick={() => setActiveTab(t as 'lista'|'resumo')}
              className={cn('px-4 py-2 rounded-lg text-xs font-medium transition-colors',
                activeTab === t ? 'bg-[#1e3a5f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {t === 'lista' ? 'Extrato' : 'Resumo'}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        {/* Empresa */}
        <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
          <option value="">Todas empresas</option>
          {(filtros?.empresas ?? []).map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        {/* Banco */}
        <select value={fBanco} onChange={e => setFBanco(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
          <option value="">Todos bancos</option>
          {(filtros?.bancos ?? []).map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Ano */}
        <select value={fAno} onChange={e => setFAno(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
          {(filtros?.anos ?? [2026, 2025, 2024]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* Mês */}
        <select value={fMes ?? ''} onChange={e => setFMes(e.target.value ? Number(e.target.value) : null)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
          <option value="">Todos meses</option>
          {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>

        {/* Tipo */}
        <div className="flex gap-1">
          {[{v:'',l:'Todos'},{v:'entrada',l:'Entradas'},{v:'saida',l:'Saídas'}].map(o => (
            <button key={o.v} onClick={() => setFTipo(o.v)}
              className={cn('px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                fTipo === o.v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── ABA EXTRATO ─────────────────────────────────────────────────────── */}
      {activeTab === 'lista' && (
        <>
          {/* Busca + summary */}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadMovs(1)}
                  placeholder="Fornecedor, histórico ou conta…"
                  className="pl-9 pr-4 py-2 w-72 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
              <button onClick={() => loadMovs(1)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                Buscar
              </button>
            </div>

            {summary && (
              <div className="flex gap-3 flex-wrap">
                {[
                  { label: 'Entradas', value: summary.total_entradas, color: 'text-green-600', icon: TrendingUp },
                  { label: 'Saídas',   value: summary.total_saidas,   color: 'text-red-600',   icon: TrendingDown },
                  { label: 'Saldo',    value: summary.saldo_periodo,  color: summary.saldo_periodo >= 0 ? 'text-blue-600' : 'text-orange-600', icon: DollarSign },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-lg border border-slate-100 px-3 py-2 flex items-center gap-2">
                    <s.icon className={cn('w-4 h-4', s.color)} />
                    <div>
                      <p className="text-[10px] text-slate-400">{s.label}</p>
                      <p className={cn('text-sm font-bold', s.color)}>{R$(s.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0d1b2a] text-white">
                    {['Data','Empresa','Banco','Fornecedor / Histórico','Conta','Entradas','Saídas','Saldo'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <Skel cols={8} />}
                  {!loading && movs.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-slate-400 py-12 text-sm">Nenhuma transação encontrada</td></tr>
                  )}
                  {!loading && movs.map(m => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(m.data)}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{m.empresa}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{m.banco}</td>
                      <td className="px-3 py-2 max-w-[260px]">
                        <p className="font-medium text-slate-700 truncate">{m.fornecedor || '—'}</p>
                        {m.historico && <p className="text-slate-400 truncate">{m.historico}</p>}
                      </td>
                      <td className="px-3 py-2 text-slate-500 max-w-[140px] truncate">{m.conta_contabil || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.entradas ? <span className="font-semibold text-green-600">{R$(m.entradas)}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {m.saidas ? <span className="font-semibold text-red-600">{R$(m.saidas)}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums font-medium',
                        (m.saldo ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600')}>
                        {R$(m.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...pag} loading={loading} onChange={p => loadMovs(p)} />
          </div>
        </>
      )}

      {/* ── ABA RESUMO ──────────────────────────────────────────────────────── */}
      {activeTab === 'resumo' && (
        <div className="space-y-4">
          {/* Gráfico mensal */}
          {resumo?.mensal && resumo.mensal.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">Entradas vs Saídas por Mês — {fAno}</h3>
              <div className="overflow-x-auto">
                <div className="flex items-end gap-3 h-36 min-w-max pb-1">
                  {resumo.mensal.map(m => {
                    const maxVal = Math.max(...resumo.mensal.map(x => Math.max(x.entradas, x.saidas)))
                    const pctE = maxVal > 0 ? (m.entradas / maxVal) * 100 : 0
                    const pctS = maxVal > 0 ? (m.saidas   / maxVal) * 100 : 0
                    return (
                      <div key={m.mes} className="flex flex-col items-center gap-1">
                        <div className="flex items-end gap-0.5 h-28">
                          <div className="w-5 rounded-t bg-green-400 hover:bg-green-500 transition-colors"
                            style={{ height: `${Math.max(pctE, 2)}%` }}
                            title={`Entradas: ${R$(m.entradas)}`} />
                          <div className="w-5 rounded-t bg-red-400 hover:bg-red-500 transition-colors"
                            style={{ height: `${Math.max(pctS, 2)}%` }}
                            title={`Saídas: ${R$(m.saidas)}`} />
                        </div>
                        <span className="text-[9px] text-slate-400">{MESES_SHORT[m.mes]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><div className="w-3 h-3 rounded bg-green-400" />Entradas</div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500"><div className="w-3 h-3 rounded bg-red-400" />Saídas</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Por empresa */}
            {resumo?.por_empresa && resumo.por_empresa.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Por Empresa</h3>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100">
                    {['Empresa','Entradas','Saídas','Saldo'].map(h => (
                      <th key={h} className="text-left py-1.5 text-slate-500 font-medium">{h}</th>
                    ))}
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

            {/* Top despesas */}
            {resumo?.top_despesas && resumo.top_despesas.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Top 10 Categorias de Despesa</h3>
                <div className="space-y-2">
                  {resumo.top_despesas.map((d, i) => {
                    const max = resumo.top_despesas[0].total
                    const pct = (d.total / max) * 100
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
