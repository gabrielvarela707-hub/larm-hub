'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, RefreshCw, TrendingUp, DollarSign,
  Users, MapPin, ChevronLeft, ChevronRight, BarChart2,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const R$ = (v: number | null | undefined) => {
  const n = v ?? 0
  if (n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

const EMPRESA_COLOR: Record<string, string> = {
  'LARM':         'bg-blue-100 text-blue-700',
  'LUCKY':        'bg-green-100 text-green-700',
  'LUCKY - Y & Z':'bg-emerald-100 text-emerald-700',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Venda {
  id: number; ano: number; num_contrato: number | null
  data_venda: string; empresa: string; unidade: string
  cliente_codigo: string; cliente_nome: string
  valor_prazo: number; valor_vista: number; entrada: number
  parcelado: number; num_parcelas: number
  area_m2: number; preco_m2: number; comissao: number
  data_receber_entrada: string | null
}

interface Summary {
  total_contratos: number; total_prazo: number
  total_vista: number; total_entrada: number; total_comissao: number
}

interface Pagination { page: number; pages: number; total: number; limit: number }

interface Resumo {
  por_ano: Array<{ ano: number; contratos: number; total_prazo: number; total_vista: number; total_entrada: number; area_total: number; preco_m2_medio: number }>
  por_empresa: Array<{ empresa: string; contratos: number; total_prazo: number; total_vista: number; area_total: number }>
  recentes: Array<{ id: number; data_venda: string; empresa: string; unidade: string; cliente_nome: string; valor_prazo: number; entrada: number; num_parcelas: number }>
  total: { total_contratos: number; total_prazo: number; total_entrada: number; area_total: number; primeira_venda: string; ultima_venda: string }
}

const LIMIT = 50

// ─── Paginação ────────────────────────────────────────────────────────────────

function Pager({ page, pages, total, limit, loading, onChange }: {
  page: number; pages: number; total: number; limit: number; loading: boolean; onChange: (p: number) => void
}) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
      <p className="text-xs text-slate-400">
        {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} de <b>{total.toLocaleString('pt-BR')}</b>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1 || loading}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs px-2 text-slate-600">{page} / {pages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= pages || loading}
          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 disabled:opacity-30">
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
          <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50 + ((i * 11 + j * 7) % 45)}%` }} />
        </td>
      ))}
    </tr>
  ))}</>
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MapaVendasPage() {
  const [tab, setTab]       = useState<'tabela' | 'resumo'>('resumo')
  const [vendas, setVendas] = useState<Venda[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [pag, setPag]       = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: LIMIT })
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [anos, setAnos]     = useState<Array<{ ano: number; contratos: number }>>([])
  const [loading, setLoading] = useState(false)

  // Filtros
  const [fAno,     setFAno]     = useState<number | null>(null)
  const [fEmpresa, setFEmpresa] = useState('')
  const [busca,    setBusca]    = useState('')
  const [page,     setPage]     = useState(1)

  // Carrega anos disponíveis
  useEffect(() => {
    apiClient.get('/mapa-vendas/anos')
      .then(r => setAnos(r.data.data))
      .catch(() => {})

    apiClient.get('/mapa-vendas/resumo')
      .then(r => setResumo(r.data.data))
      .catch(() => {})
  }, [])

  const loadVendas = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: pg, limit: LIMIT }
      if (fAno)     params.ano     = fAno
      if (fEmpresa) params.empresa = fEmpresa
      if (busca)    params.busca   = busca

      const r = await apiClient.get('/mapa-vendas', { params })
      setVendas(r.data.data)
      setPag(r.data.pagination)
      setSummary(r.data.summary)
      setPage(pg)
    } catch {}
    finally { setLoading(false) }
  }, [fAno, fEmpresa, busca])

  useEffect(() => {
    if (tab === 'tabela') loadVendas(1)
  }, [fAno, fEmpresa, tab])

  const empresas = resumo?.por_empresa.map(e => e.empresa) ?? []

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Mapa de Vendas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Loteamento Residencial Santa Clara · {resumo?.total?.total_contratos ?? 0} contratos
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {['resumo', 'tabela'].map(t => (
            <button key={t} onClick={() => setTab(t as 'tabela' | 'resumo')}
              className={cn('px-4 py-2 rounded-lg text-xs font-medium transition-colors',
                tab === t ? 'bg-[#1e3a5f] text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
              {t === 'resumo' ? 'Resumo' : 'Todas as Vendas'}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros globais */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        {/* Ano */}
        <div className="flex gap-1">
          <button onClick={() => setFAno(null)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              fAno === null ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            Todos anos
          </button>
          {anos.map(a => (
            <button key={a.ano} onClick={() => setFAno(a.ano)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                fAno === a.ano ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {a.ano}
              <span className="ml-1 opacity-60 text-[10px]">({a.contratos})</span>
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* Empresa */}
        <div className="flex gap-1">
          <button onClick={() => setFEmpresa('')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              fEmpresa === '' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            Todas
          </button>
          {empresas.map(e => (
            <button key={e} onClick={() => setFEmpresa(e)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                fEmpresa === e ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* ── ABA RESUMO ──────────────────────────────────────────────────────── */}
      {tab === 'resumo' && (
        <div className="space-y-4">
          {/* Cards totais */}
          {resumo && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Total de Contratos</p>
                      <p className="text-2xl font-bold text-slate-800">{resumo.total.total_contratos}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmtDate(resumo.total.primeira_venda)} → {fmtDate(resumo.total.ultima_venda)}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">VGV a Prazo</p>
                      <p className="text-xl font-bold text-slate-800">{R$(resumo.total.total_prazo)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Valor Geral de Vendas</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-50 text-green-600">
                      <DollarSign className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Total de Entradas</p>
                      <p className="text-xl font-bold text-green-600">{R$(resumo.total.total_entrada)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {resumo.total.total_prazo > 0
                          ? `${((resumo.total.total_entrada / resumo.total.total_prazo) * 100).toFixed(1)}% do VGV`
                          : '—'}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Área Total Vendida</p>
                      <p className="text-xl font-bold text-slate-800">
                        {Number(resumo.total.area_total ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">em {resumo.total.total_contratos} lotes</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-50 text-purple-600">
                      <MapPin className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Por ano */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-blue-500" /> Vendas por Ano
                    </h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-100 bg-slate-50">
                      {['Ano','Contratos','VGV Prazo','Entradas','Área (m²)','R$/m²'].map(h => (
                        <th key={h} className="text-left px-4 py-2 font-semibold text-slate-500">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {resumo.por_ano.map(r => (
                        <tr key={r.ano} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-bold text-slate-700">{r.ano}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-bold">{r.contratos}</span>
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700 tabular-nums">{R$(r.total_prazo)}</td>
                          <td className="px-4 py-2.5 text-green-600 tabular-nums">{R$(r.total_entrada)}</td>
                          <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                            {Number(r.area_total ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                            {Number(r.preco_m2_medio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Por empresa */}
                <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">Por Empresa</h3>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-100 bg-slate-50">
                      {['Empresa','Contratos','VGV Prazo','Área (m²)'].map(h => (
                        <th key={h} className="text-left px-4 py-2 font-semibold text-slate-500">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {resumo.por_empresa.map(e => (
                        <tr key={e.empresa} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', EMPRESA_COLOR[e.empresa] ?? 'bg-slate-100 text-slate-600')}>
                              {e.empresa}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-slate-700">{e.contratos}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-700 tabular-nums">{R$(e.total_prazo)}</td>
                          <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                            {Number(e.area_total ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Últimas vendas */}
              <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700">Últimas Vendas</h3>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-slate-100 bg-slate-50">
                    {['Data','Empresa','Unidade','Cliente','Valor a Prazo','Entrada','Parcelas'].map(h => (
                      <th key={h} className="text-left px-4 py-2 font-semibold text-slate-500">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {resumo.recentes.map(v => (
                      <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(v.data_venda)}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', EMPRESA_COLOR[v.empresa] ?? 'bg-slate-100 text-slate-600')}>
                            {v.empresa}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-slate-700">{v.unidade}</td>
                        <td className="px-4 py-2.5 text-slate-700">{v.cliente_nome}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-700 tabular-nums">{R$(v.valor_prazo)}</td>
                        <td className="px-4 py-2.5 text-green-600 tabular-nums">{R$(v.entrada)}</td>
                        <td className="px-4 py-2.5 text-center text-slate-500">{v.num_parcelas ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!resumo && (
            <div className="flex items-center justify-center gap-2 h-40 text-slate-400 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando…
            </div>
          )}
        </div>
      )}

      {/* ── ABA TABELA ──────────────────────────────────────────────────────── */}
      {tab === 'tabela' && (
        <>
          {/* Busca + summary */}
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadVendas(1)}
                  placeholder="Cliente, unidade ou código…"
                  className="pl-9 pr-4 py-2 w-72 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
              </div>
              <button onClick={() => loadVendas(1)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                Buscar
              </button>
            </div>

            {summary && (
              <div className="flex gap-3 text-xs">
                <span className="text-slate-500">{summary.total_contratos} contratos</span>
                <span className="text-slate-300">|</span>
                <span className="font-semibold text-slate-700">VGV: {R$(summary.total_prazo)}</span>
                <span className="text-slate-300">|</span>
                <span className="text-green-600">Entradas: {R$(summary.total_entrada)}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#0d1b2a] text-white">
                    {['#','Data','Empresa','Unidade','Cliente','Valor Prazo','Valor Vista','Entrada','Parcelas','Área m²','R$/m²','Comissão'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <Skel cols={12} />}
                  {!loading && vendas.length === 0 && (
                    <tr><td colSpan={12} className="text-center py-12 text-slate-400 text-sm">Nenhuma venda encontrada</td></tr>
                  )}
                  {!loading && vendas.map(v => (
                    <tr key={v.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 text-slate-400 tabular-nums">{v.num_contrato ?? v.id}</td>
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(v.data_venda)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', EMPRESA_COLOR[v.empresa] ?? 'bg-slate-100 text-slate-600')}>
                          {v.empresa}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-700">{v.unidade}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-700">{v.cliente_nome}</p>
                        {v.cliente_codigo && <p className="text-slate-400 text-[10px]">#{v.cliente_codigo}</p>}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-slate-700 tabular-nums">{R$(v.valor_prazo)}</td>
                      <td className="px-3 py-2.5 text-slate-500 tabular-nums">{R$(v.valor_vista)}</td>
                      <td className="px-3 py-2.5 text-green-600 tabular-nums">{R$(v.entrada)}</td>
                      <td className="px-3 py-2.5 text-center text-slate-500">{v.num_parcelas ?? '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                        {v.area_m2 ? `${Number(v.area_m2).toLocaleString('pt-BR')}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                        {v.preco_m2 ? Number(v.preco_m2).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-amber-600 tabular-nums">{R$(v.comissao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager {...pag} loading={loading} onChange={p => loadVendas(p)} />
          </div>
        </>
      )}
    </div>
  )
}
