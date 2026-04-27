'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, RefreshCw, TrendingUp, DollarSign,
  AlertTriangle, Users, FileText, BarChart2,
  MapPin, ChevronLeft, ChevronRight, Layers,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const R$ = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : (v ?? 0)
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

const STATUS_COLOR: Record<string, string> = {
  pago:      'bg-green-100 text-green-700',
  em_aberto: 'bg-blue-100  text-blue-700',
  vencido:   'bg-red-100   text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
}
const STATUS_LABEL: Record<string, string> = {
  pago: 'Pago', em_aberto: 'Em Aberto', vencido: 'Vencido', cancelado: 'Cancelado',
}

// ─── Pagination component ─────────────────────────────────────────────────────

function Pagination({
  page, pages, total, limit, loading, onChange,
}: {
  page: number; pages: number; total: number; limit: number
  loading: boolean; onChange: (p: number) => void
}) {
  if (total === 0) return null
  const from = (page - 1) * limit + 1
  const to   = Math.min(page * limit, total)

  // Gera lista de páginas visíveis: sempre mostra 1, last e vizinhos do atual
  const visible: (number | '…')[] = []
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) {
      visible.push(i)
    } else if (visible[visible.length - 1] !== '…') {
      visible.push('…')
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
      <p className="text-xs text-slate-400">
        {from}–{to} de <span className="font-semibold text-slate-600">{total.toLocaleString('pt-BR')}</span> registros
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1 || loading}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {visible.map((v, i) =>
          v === '…' ? (
            <span key={`e${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-slate-400">…</span>
          ) : (
            <button
              key={v}
              onClick={() => onChange(Number(v))}
              disabled={loading}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium transition-colors',
                v === page
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'border border-slate-200 text-slate-600 hover:bg-white'
              )}
            >
              {v}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages || loading}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Skeleton rows ────────────────────────────────────────────────────────────

function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="border-b border-slate-50">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-3.5 bg-slate-100 rounded animate-pulse"
                style={{ width: `${50 + ((i * 13 + j * 17) % 40)}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-slate-400 text-sm py-16">
        Nenhum registro encontrado
      </td>
    </tr>
  )
}

// ─── Card métrica ─────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Pagination { page: number; pages: number; total: number; limit: number }

interface DashboardData {
  vendas:          { total_vendas: number; vendas_ativas: number; vendas_canceladas: number; valor_total_vendas: number; valor_vendas_ativas: number; ticket_medio: number }
  boletos:         { total_boletos: number; boletos_pagos: number; boletos_em_aberto: number; boletos_vencidos: number; valor_recebido: number; valor_em_aberto: number; valor_vencido: number }
  clientes:        { total_clientes: number; pessoas_fisicas: number; pessoas_juridicas: number }
  receita_mensal:  Array<{ mes: string; qtd_boletos: number; valor_recebido: number }>
  vendas_recentes: Array<{ vend1_cod: string; vend1_dat_ven: string; vend1_val_ven: number; cliente: string; telefone: string; situ1_cod: string }>
}

type Tab = 'resumo' | 'vendas' | 'boletos' | 'cobrancas' | 'inadimplencia' | 'lotes' | 'clientes'

// ─── Página principal ─────────────────────────────────────────────────────────

const LIMIT = 20

export default function RelatoriosPage() {
  const [tab, setTab] = useState<Tab>('resumo')

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)

  // Cada aba tem seu próprio estado de dados + paginação + busca + loading
  const mkState = <T,>() => ({
    data:    [] as T[],
    pag:     { page: 1, pages: 1, total: 0, limit: LIMIT } as Pagination,
    page:    1,
    busca:   '',
    status:  '',
    loading: false,
  })

  const [vendas,   setVendas]   = useState(mkState<Record<string, unknown>>())
  const [boletos,  setBoletos]  = useState(mkState<Record<string, unknown>>())
  const [cobranc,  setCobranc]  = useState(mkState<Record<string, unknown>>())
  const [inadimp,  setInadimp]  = useState(mkState<Record<string, unknown>>())
  const [lotes,    setLotes]    = useState(mkState<Record<string, unknown>>())
  const [clientes, setClientes] = useState(mkState<Record<string, unknown>>())

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      const r = await apiClient.get('/strato/dashboard')
      setDashboard(r.data.data)
    } catch {}
  }, [])

  async function loadVendas(page: number, busca: string) {
    setVendas(s => ({ ...s, loading: true }))
    try {
      const r = await apiClient.get('/strato/vendas', { params: { page, busca, limit: LIMIT } })
      setVendas(s => ({ ...s, data: r.data.data, pag: r.data.pagination, page, busca, loading: false }))
    } catch { setVendas(s => ({ ...s, loading: false })) }
  }

  async function loadBoletos(page: number, busca: string, status: string) {
    setBoletos(s => ({ ...s, loading: true }))
    try {
      const r = await apiClient.get('/strato/boletos', {
        params: { page, busca, status: status || undefined, limit: LIMIT },
      })
      setBoletos(s => ({ ...s, data: r.data.data, pag: { ...s.pag, ...r.data.pagination }, page, busca, status, loading: false }))
    } catch { setBoletos(s => ({ ...s, loading: false })) }
  }

  async function loadCobranc(page: number, busca: string, status: string) {
    setCobranc(s => ({ ...s, loading: true }))
    try {
      const r = await apiClient.get('/strato/cobrancas', {
        params: { page, busca, status: status || undefined, limit: LIMIT },
      })
      setCobranc(s => ({ ...s, data: r.data.data, pag: r.data.pagination, page, busca, status, loading: false }))
    } catch { setCobranc(s => ({ ...s, loading: false })) }
  }

  async function loadInadimp() {
    setInadimp(s => ({ ...s, loading: true }))
    try {
      const r = await apiClient.get('/strato/inadimplencia')
      setInadimp(s => ({
        ...s, data: r.data.data, loading: false,
        pag: { page: 1, pages: 1, total: r.data.data.length, limit: 100 },
      }))
    } catch { setInadimp(s => ({ ...s, loading: false })) }
  }

  async function loadLotes(page: number, busca: string) {
    setLotes(s => ({ ...s, loading: true }))
    try {
      const r = await apiClient.get('/strato/lotes', { params: { page, busca, limit: LIMIT } })
      setLotes(s => ({ ...s, data: r.data.data, pag: r.data.pagination, page, busca, loading: false }))
    } catch { setLotes(s => ({ ...s, loading: false })) }
  }

  async function loadClientes(page: number, busca: string) {
    setClientes(s => ({ ...s, loading: true }))
    try {
      const r = await apiClient.get('/strato/clientes', { params: { page, busca, limit: LIMIT } })
      setClientes(s => ({ ...s, data: r.data.data, pag: r.data.pagination, page, busca, loading: false }))
    } catch { setClientes(s => ({ ...s, loading: false })) }
  }

  // ── Carga ao trocar aba ────────────────────────────────────────────────────

  useEffect(() => {
    if (tab === 'resumo'        && !dashboard)         loadDashboard()
    if (tab === 'vendas'        && !vendas.data.length)   loadVendas(1, '')
    if (tab === 'boletos'       && !boletos.data.length)  loadBoletos(1, '', '')
    if (tab === 'cobrancas'     && !cobranc.data.length)  loadCobranc(1, '', '')
    if (tab === 'inadimplencia' && !inadimp.data.length)  loadInadimp()
    if (tab === 'lotes'         && !lotes.data.length)    loadLotes(1, '')
    if (tab === 'clientes'      && !clientes.data.length) loadClientes(1, '')
  }, [tab])

  // ── Busca ──────────────────────────────────────────────────────────────────

  function SearchBar({
    value, onChange, onSearch, placeholder,
  }: { value: string; onChange: (v: string) => void; onSearch: () => void; placeholder: string }) {
    return (
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch()}
            placeholder={placeholder}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <button
          onClick={onSearch}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Buscar
        </button>
      </div>
    )
  }

  // ── Filtros de status ──────────────────────────────────────────────────────

  function StatusFilter({
    value, onChange, opts,
  }: { value: string; onChange: (v: string) => void; opts: { v: string; l: string }[] }) {
    return (
      <div className="flex gap-1.5 flex-wrap mb-4">
        {opts.map(o => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              value === o.v
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESUMO
  // ─────────────────────────────────────────────────────────────────────────────

  const ResumoTab = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={TrendingUp}    label="Vendas Ativas"     value={String(dashboard?.vendas?.vendas_ativas ?? '…')}   sub={R$(dashboard?.vendas?.valor_vendas_ativas)}  color="bg-blue-50 text-blue-600" />
        <MetricCard icon={DollarSign}    label="Receita Recebida"  value={R$(dashboard?.boletos?.valor_recebido)}             sub={`${dashboard?.boletos?.boletos_pagos ?? 0} boletos pagos`} color="bg-green-50 text-green-600" />
        <MetricCard icon={AlertTriangle} label="Valor Vencido"     value={R$(dashboard?.boletos?.valor_vencido)}              sub={`${dashboard?.boletos?.boletos_vencidos ?? 0} boletos vencidos`} color="bg-red-50 text-red-600" />
        <MetricCard icon={Users}         label="Clientes"          value={String(dashboard?.clientes?.total_clientes ?? '…')} sub={`${dashboard?.clientes?.pessoas_fisicas ?? 0} PF · ${dashboard?.clientes?.pessoas_juridicas ?? 0} PJ`} color="bg-purple-50 text-purple-600" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={FileText}   label="Total de Vendas"  value={String(dashboard?.vendas?.total_vendas ?? '…')}   sub={`${dashboard?.vendas?.vendas_canceladas ?? 0} canceladas`} color="bg-slate-50 text-slate-600" />
        <MetricCard icon={DollarSign} label="Ticket Médio"     value={R$(dashboard?.vendas?.ticket_medio)}              sub="por contrato"                                               color="bg-amber-50 text-amber-600" />
        <MetricCard icon={DollarSign} label="Em Aberto"        value={R$(dashboard?.boletos?.valor_em_aberto)}          sub={`${dashboard?.boletos?.boletos_em_aberto ?? 0} boletos`}   color="bg-sky-50 text-sky-600" />
        <MetricCard icon={FileText}   label="Total de Boletos" value={String(dashboard?.boletos?.total_boletos ?? '…')} sub="gerados no sistema"                                        color="bg-slate-50 text-slate-600" />
      </div>

      {/* Gráfico de receita */}
      {(dashboard?.receita_mensal?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Receita Mensal — Últimos 12 meses</h3>
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-2 h-28 min-w-max">
              {(() => {
                const max = Math.max(...(dashboard?.receita_mensal ?? []).map(r => Number(r.valor_recebido)))
                return (dashboard?.receita_mensal ?? []).map(r => {
                  const pct = max > 0 ? (Number(r.valor_recebido) / max) * 100 : 0
                  return (
                    <div key={r.mes} className="flex flex-col items-center gap-1 group cursor-default">
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {R$(Number(r.valor_recebido))}
                      </span>
                      <div className="w-9 rounded-t bg-blue-500 hover:bg-blue-600 transition-colors"
                        style={{ height: `${Math.max(pct, 3)}%` }} />
                      <span className="text-[9px] text-slate-400">{r.mes.slice(5)}/{r.mes.slice(2, 4)}</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Vendas recentes */}
      {(dashboard?.vendas_recentes?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Vendas Recentes</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Cód.','Cliente','Telefone','Valor','Data'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-2.5">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(dashboard?.vendas_recentes ?? []).map(v => (
                <tr key={v.vend1_cod} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{v.vend1_cod}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-700">{v.cliente ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{v.telefone ?? '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-green-600">{R$(v.vend1_val_ven)}</td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(v.vend1_dat_ven)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!dashboard && (
        <div className="flex items-center justify-center gap-2 h-40 text-slate-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados…
        </div>
      )}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // VENDAS
  // ─────────────────────────────────────────────────────────────────────────────

  const [vendaBusca, setVendaBusca] = useState('')
  const VendasTab = () => {
    const d = vendas
    return (
      <>
        <SearchBar value={vendaBusca} onChange={setVendaBusca} onSearch={() => loadVendas(1, vendaBusca)} placeholder="Nome ou código…" />
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                {['Cód.','Cliente','Contato','Corretor','Valor','Entrada','Saldo','Data','Status'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.loading && <SkeletonRows cols={9} />}
                {!d.loading && d.data.length === 0 && <EmptyRow cols={9} />}
                {!d.loading && d.data.map((v: Record<string, unknown>, i) => (
                  <tr key={String(v.vend1_cod ?? i)} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(v.vend1_cod ?? '—')}</td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-700">{String(v.cliente ?? '—')}</p>{v.email && <p className="text-xs text-slate-400">{String(v.email)}</p>}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{String(v.telefone ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{String(v.corretor ?? '—')}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{R$(v.vend1_val_ven as number)}</td>
                    <td className="px-4 py-3 text-green-600">{R$(v.vend1_val_ent as number)}</td>
                    <td className="px-4 py-3 text-blue-600">{R$(v.vend1_val_sal as number)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(v.vend1_dat_ven as string)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', v.vend1_dat_can ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700')}>
                        {v.vend1_dat_can ? 'Cancelado' : 'Ativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...d.pag} loading={d.loading} onChange={p => loadVendas(p, vendaBusca)} />
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BOLETOS
  // ─────────────────────────────────────────────────────────────────────────────

  const [boletosBusca, setBoletosBusca]     = useState('')
  const [boletosStatus, setBoletosStatus]   = useState('')

  const BoletosTab = () => {
    const d = boletos
    return (
      <>
        <StatusFilter value={boletosStatus} onChange={s => { setBoletosStatus(s); loadBoletos(1, boletosBusca, s) }}
          opts={[{v:'',l:'Todos'},{v:'em_aberto',l:'Em Aberto'},{v:'vencido',l:'Vencidos'},{v:'pago',l:'Pagos'},{v:'cancelado',l:'Cancelados'}]} />
        <SearchBar value={boletosBusca} onChange={setBoletosBusca} onSearch={() => loadBoletos(1, boletosBusca, boletosStatus)} placeholder="Nome ou CPF…" />
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                {['Cód.','Cliente','CPF','Parcela','Valor','Vencimento','Pagamento','Status'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.loading && <SkeletonRows cols={8} />}
                {!d.loading && d.data.length === 0 && <EmptyRow cols={8} />}
                {!d.loading && d.data.map((b: Record<string, unknown>, i) => {
                  const st = String(b.status ?? 'em_aberto')
                  return (
                    <tr key={String(b.bole1_cod ?? i)} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(b.bole1_cod ?? '—')}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{String(b.cliente ?? '—')}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{String(b.cpf ?? '—')}</td>
                      <td className="px-4 py-3 text-center text-slate-500">{String(b.num_parcela ?? '—')}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{R$(b.valor as number)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(b.vencimento as string)}</td>
                      <td className="px-4 py-3 text-green-600 whitespace-nowrap">{fmtDate(b.data_pagamento as string)}</td>
                      <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[st] ?? 'bg-slate-100 text-slate-500')}>{STATUS_LABEL[st] ?? st}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...d.pag} loading={d.loading} onChange={p => loadBoletos(p, boletosBusca, boletosStatus)} />
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COBRANÇAS (ts1_core)
  // ─────────────────────────────────────────────────────────────────────────────

  const [cobrancBusca, setCobrancBusca]   = useState('')
  const [cobrancStatus, setCobrancStatus] = useState('')

  const CobranTab = () => {
    const d = cobranc
    return (
      <>
        <StatusFilter value={cobrancStatus} onChange={s => { setCobrancStatus(s); loadCobranc(1, cobrancBusca, s) }}
          opts={[{v:'',l:'Todas'},{v:'aberto',l:'Em Aberto'},{v:'vencido',l:'Vencidas'},{v:'pago',l:'Pagas'}]} />
        <SearchBar value={cobrancBusca} onChange={setCobrancBusca} onSearch={() => loadCobranc(1, cobrancBusca, cobrancStatus)} placeholder="Nome ou código…" />
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                {['Cód.','Parcela','Valor','Vencimento','Pagamento','Status'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.loading && <SkeletonRows cols={6} />}
                {!d.loading && d.data.length === 0 && <EmptyRow cols={6} />}
                {!d.loading && d.data.map((c: Record<string, unknown>, i) => {
                  const st = String(c.status ?? 'em_aberto')
                  return (
                    <tr key={String(c.core1_cod ?? i)} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(c.core1_cod ?? '—')}</td>
                      <td className="px-4 py-3 text-center text-slate-600">{String(c.parcela ?? '—')}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{R$(c.valor as number)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(c.vencimento as string)}</td>
                      <td className="px-4 py-3 text-green-600 whitespace-nowrap">{fmtDate(c.pagamento as string)}</td>
                      <td className="px-4 py-3"><span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLOR[st] ?? 'bg-slate-100 text-slate-500')}>{STATUS_LABEL[st] ?? st}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...d.pag} loading={d.loading} onChange={p => loadCobranc(p, cobrancBusca, cobrancStatus)} />
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INADIMPLÊNCIA
  // ─────────────────────────────────────────────────────────────────────────────

  const InadimTab = () => {
    const d = inadimp
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {d.loading && <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Carregando…</div>}
        {!d.loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                {['Cliente','CPF','E-mail','Contrato','Boletos','Valor Vencido','Desde','Atraso'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.data.length === 0 && <EmptyRow cols={8} />}
                {d.data.map((r: Record<string, unknown>, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{String(r.cliente ?? '—')}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{String(r.cpf ?? '—')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{String(r.email ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500">{String(r.contrato ?? '—')}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-bold">{String(r.boletos_vencidos)}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600">{R$(r.valor_total_vencido as number)}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(r.vencimento_mais_antigo as string)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold',
                        Number(r.dias_em_atraso) > 90 ? 'bg-red-100 text-red-700' :
                        Number(r.dias_em_atraso) > 30 ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700')}>
                        {r.dias_em_atraso} dias
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.pag.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
            <p className="text-xs text-slate-400">{d.pag.total.toLocaleString('pt-BR')} clientes inadimplentes</p>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOTES
  // ─────────────────────────────────────────────────────────────────────────────

  const [lotesBusca, setLotesBusca] = useState('')
  const LotesTab = () => {
    const d = lotes
    return (
      <>
        <SearchBar value={lotesBusca} onChange={setLotesBusca} onSearch={() => loadLotes(1, lotesBusca)} placeholder="Quadra ou lote…" />
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                {['Cód.','Quadra','Lote','Área (m²)','Valor','Situação','Tipo'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.loading && <SkeletonRows cols={7} />}
                {!d.loading && d.data.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-400 text-sm py-16">
                    {lotes.pag.total === 0 ? 'Tabela ts1_univ não encontrada ou sem dados' : 'Nenhum resultado'}
                  </td></tr>
                )}
                {!d.loading && d.data.map((l: Record<string, unknown>, i) => (
                  <tr key={String(l.univ1_cod ?? i)} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(l.univ1_cod ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-700">{String(l.quadra ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-700">{String(l.lote ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500">{l.area ? `${Number(l.area).toLocaleString('pt-BR')} m²` : '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{R$(l.valor as number)}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{String(l.situacao ?? '—')}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{String(l.tipo ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...d.pag} loading={d.loading} onChange={p => loadLotes(p, lotesBusca)} />
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLIENTES
  // ─────────────────────────────────────────────────────────────────────────────

  const [clientesBusca, setClientesBusca] = useState('')
  const ClientesTab = () => {
    const d = clientes
    return (
      <>
        <SearchBar value={clientesBusca} onChange={setClientesBusca} onSearch={() => loadClientes(1, clientesBusca)} placeholder="Nome, e-mail ou celular…" />
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100">
                {['Nome','E-mail','Celular','WhatsApp','Bairro','Tipo','Cadastro'].map(c => (
                  <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">{c}</th>
                ))}
              </tr></thead>
              <tbody>
                {d.loading && <SkeletonRows cols={7} />}
                {!d.loading && d.data.length === 0 && <EmptyRow cols={7} />}
                {!d.loading && d.data.map((c: Record<string, unknown>, i) => (
                  <tr key={String(c.pess2_cod ?? i)} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-700">{String(c.pess2_nom ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{String(c.pess2_email ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500">{String(c.celular ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500">{String(c.whatsapp ?? '—')}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{String(c.bairro ?? '—')}</td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs', c.pessoa_fisica === 'S' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                        {c.pessoa_fisica === 'S' ? 'PF' : 'PJ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(c.data_cadastro as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...d.pag} loading={d.loading} onChange={p => loadClientes(p, clientesBusca)} />
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  const TABS = [
    { id: 'resumo'        as Tab, label: 'Resumo',        icon: BarChart2      },
    { id: 'vendas'        as Tab, label: 'Vendas',         icon: TrendingUp     },
    { id: 'boletos'       as Tab, label: 'Boletos',        icon: DollarSign     },
    { id: 'cobrancas'     as Tab, label: 'Cobranças',      icon: FileText       },
    { id: 'inadimplencia' as Tab, label: 'Inadimplência',  icon: AlertTriangle  },
    { id: 'lotes'         as Tab, label: 'Lotes',          icon: MapPin         },
    { id: 'clientes'      as Tab, label: 'Clientes',       icon: Users          },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Relatórios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Dados em tempo real · Strato PostgreSQL</p>
        </div>
        <button
          onClick={() => {
            setDashboard(null)
            if (tab === 'resumo')        loadDashboard()
            if (tab === 'vendas')        loadVendas(vendas.page, vendaBusca)
            if (tab === 'boletos')       loadBoletos(boletos.page, boletosBusca, boletosStatus)
            if (tab === 'cobrancas')     loadCobranc(cobranc.page, cobrancBusca, cobrancStatus)
            if (tab === 'inadimplencia') loadInadimp()
            if (tab === 'lotes')         loadLotes(lotes.page, lotesBusca)
            if (tab === 'clientes')      loadClientes(clientes.page, clientesBusca)
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-100 rounded-xl p-1 shadow-sm flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
              tab === t.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {tab === 'resumo'        && <ResumoTab />}
      {tab === 'vendas'        && <VendasTab />}
      {tab === 'boletos'       && <BoletosTab />}
      {tab === 'cobrancas'     && <CobranTab />}
      {tab === 'inadimplencia' && <InadimTab />}
      {tab === 'lotes'         && <LotesTab />}
      {tab === 'clientes'      && <ClientesTab />}
    </div>
  )
}
