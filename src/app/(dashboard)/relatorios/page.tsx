'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Download, RefreshCw, TrendingUp, DollarSign, AlertTriangle, Users, FileText, BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  vendas:          { total_vendas: number; vendas_ativas: number; vendas_canceladas: number; valor_total_vendas: number; valor_vendas_ativas: number; ticket_medio: number }
  boletos:         { total_boletos: number; boletos_pagos: number; boletos_em_aberto: number; boletos_vencidos: number; valor_recebido: number; valor_em_aberto: number; valor_vencido: number }
  clientes:        { total_clientes: number; pessoas_fisicas: number; pessoas_juridicas: number }
  receita_mensal:  Array<{ mes: string; qtd_boletos: number; valor_recebido: number }>
  vendas_por_mes:  Array<{ mes: string; qtd_vendas: number; valor_total: number }>
  vendas_recentes: Array<{ vend1_cod: string; vend1_dat_ven: string; vend1_val_ven: number; cliente: string; telefone: string; email: string }>
}

interface Venda {
  vend1_cod: string; vend1_dat_ven: string; vend1_dat_can: string | null
  vend1_val_ven: number; vend1_val_ent: number; vend1_val_sal: number
  cliente: string; telefone: string; email: string; corretor: string; situ1_cod: string
}

interface Boleto {
  bole1_cod: string; vencimento: string; data_pagamento: string | null
  valor: number; num_parcela: string; cliente: string; cpf: string; status: string
  codigo_barras: string; contrato_cod: string
}

interface Inadimplente {
  cliente: string; cpf: string; email: string; contrato: string
  boletos_vencidos: number; valor_total_vencido: number
  vencimento_mais_antigo: string; dias_em_atraso: number
}

interface Cliente {
  pess2_cod: string; pess2_nom: string; pess2_email: string
  celular: string; whatsapp: string; bairro: string; pessoa_fisica: string; data_cadastro: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const R$ = (v: number | string) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (!n || isNaN(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d }
}

const STATUS_BOLETO: Record<string, { label: string; color: string }> = {
  pago:      { label: 'Pago',       color: 'bg-green-100 text-green-700' },
  em_aberto: { label: 'Em Aberto',  color: 'bg-blue-100 text-blue-700' },
  vencido:   { label: 'Vencido',    color: 'bg-red-100 text-red-700' },
  cancelado: { label: 'Cancelado',  color: 'bg-slate-100 text-slate-500' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-slate-100">
        {cols.map(c => (
          <th key={c} className="text-left text-xs font-semibold text-slate-500 px-4 py-3 whitespace-nowrap">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center text-slate-400 text-sm py-12">
        Nenhum registro encontrado
      </td>
    </tr>
  )
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-slate-50">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'resumo' | 'vendas' | 'boletos' | 'inadimplencia' | 'clientes'

export default function RelatoriosPage() {
  const [tab, setTab]             = useState<Tab>('resumo')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [vendas, setVendas]       = useState<Venda[]>([])
  const [boletos, setBoletos]     = useState<Boleto[]>([])
  const [inadimp, setInadimp]     = useState<Inadimplente[]>([])
  const [clientes, setClientes]   = useState<Cliente[]>([])
  const [loading, setLoading]     = useState(false)
  const [busca, setBusca]         = useState('')
  const [boletoStatus, setBoletoStatus] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortAsc, setSortAsc]     = useState(true)

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'resumo',         label: 'Resumo',         icon: BarChart2 },
    { id: 'vendas',         label: 'Vendas',          icon: TrendingUp },
    { id: 'boletos',        label: 'Boletos',         icon: DollarSign },
    { id: 'inadimplencia',  label: 'Inadimplência',   icon: AlertTriangle },
    { id: 'clientes',       label: 'Clientes',        icon: Users },
  ]

  const loadData = useCallback(async (currentTab: Tab) => {
    setLoading(true)
    try {
      if (currentTab === 'resumo' && !dashboard) {
        const r = await apiClient.get('/strato/dashboard')
        setDashboard(r.data.data)
      }
      if (currentTab === 'vendas') {
        const r = await apiClient.get('/strato/vendas', { params: { busca, limit: 50 } })
        setVendas(r.data.data)
      }
      if (currentTab === 'boletos') {
        const r = await apiClient.get('/strato/boletos', {
          params: { status: boletoStatus || undefined, busca, limit: 50 }
        })
        setBoletos(r.data.data)
      }
      if (currentTab === 'inadimplencia') {
        const r = await apiClient.get('/strato/inadimplencia')
        setInadimp(r.data.data)
      }
      if (currentTab === 'clientes') {
        const r = await apiClient.get('/strato/clientes', { params: { busca, limit: 50 } })
        setClientes(r.data.data)
      }
    } catch (err) {
      console.error('Erro ao carregar relatório:', err)
    } finally {
      setLoading(false)
    }
  }, [busca, boletoStatus, dashboard])

  useEffect(() => { loadData(tab) }, [tab])

  function handleSearch() { loadData(tab) }

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(v => !v)
    else { setSortField(field); setSortAsc(true) }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
    return sortAsc
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />
  }

  // ── Resumo ──────────────────────────────────────────────────────────────────
  const ResumoTab = () => (
    <div className="space-y-6">
      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={TrendingUp}    label="Vendas Ativas"    value={dashboard?.vendas?.vendas_ativas?.toString() ?? '…'}    sub={R$(dashboard?.vendas?.valor_vendas_ativas ?? 0)}    color="bg-blue-50 text-blue-600" />
        <MetricCard icon={DollarSign}    label="Receita Recebida" value={R$(dashboard?.boletos?.valor_recebido ?? 0)}               sub={`${dashboard?.boletos?.boletos_pagos ?? 0} boletos pagos`} color="bg-green-50 text-green-600" />
        <MetricCard icon={AlertTriangle} label="Valor Vencido"    value={R$(dashboard?.boletos?.valor_vencido ?? 0)}                sub={`${dashboard?.boletos?.boletos_vencidos ?? 0} boletos`}     color="bg-red-50 text-red-600" />
        <MetricCard icon={Users}         label="Clientes"         value={dashboard?.clientes?.total_clientes?.toString() ?? '…'}  sub={`${dashboard?.clientes?.pessoas_fisicas ?? 0} PF · ${dashboard?.clientes?.pessoas_juridicas ?? 0} PJ`} color="bg-purple-50 text-purple-600" />
      </div>

      {/* Segunda linha */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={FileText}   label="Total de Vendas"   value={dashboard?.vendas?.total_vendas?.toString() ?? '…'}   sub={`${dashboard?.vendas?.vendas_canceladas ?? 0} canceladas`} color="bg-slate-50 text-slate-600" />
        <MetricCard icon={DollarSign} label="Ticket Médio"      value={R$(dashboard?.vendas?.ticket_medio ?? 0)}              sub="por contrato"                                                color="bg-amber-50 text-amber-600" />
        <MetricCard icon={DollarSign} label="Em Aberto"         value={R$(dashboard?.boletos?.valor_em_aberto ?? 0)}          sub={`${dashboard?.boletos?.boletos_em_aberto ?? 0} boletos`}    color="bg-blue-50 text-blue-600" />
        <MetricCard icon={FileText}   label="Total Boletos"     value={dashboard?.boletos?.total_boletos?.toString() ?? '…'} sub="gerados no sistema"                                          color="bg-slate-50 text-slate-600" />
      </div>

      {/* Receita mensal */}
      {dashboard?.receita_mensal && dashboard.receita_mensal.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Receita Mensal — Últimos 12 meses</h3>
          <div className="overflow-x-auto">
            <div className="flex items-end gap-2 h-32 min-w-max">
              {(() => {
                const max = Math.max(...dashboard.receita_mensal.map(r => Number(r.valor_recebido)))
                return dashboard.receita_mensal.map(r => {
                  const pct = max > 0 ? (Number(r.valor_recebido) / max) * 100 : 0
                  return (
                    <div key={r.mes} className="flex flex-col items-center gap-1 group">
                      <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                        {R$(Number(r.valor_recebido))}
                      </span>
                      <div
                        className="w-10 rounded-t-sm bg-blue-500 hover:bg-blue-600 transition-colors cursor-default"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={R$(Number(r.valor_recebido))}
                      />
                      <span className="text-[9px] text-slate-400">{r.mes.slice(5)}/{r.mes.slice(2,4)}</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Vendas recentes */}
      {dashboard?.vendas_recentes && dashboard.vendas_recentes.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Vendas Recentes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <TableHead cols={['Cód.', 'Cliente', 'Telefone', 'Valor', 'Data', 'Status']} />
              <tbody>
                {dashboard.vendas_recentes.map(v => (
                  <tr key={v.vend1_cod} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.vend1_cod}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{v.cliente ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{v.telefone ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-green-600">{R$(v.vend1_val_ven)}</td>
                    <td className="px-4 py-3 text-slate-500">{fmtDate(v.vend1_dat_ven)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Ativo</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && !dashboard && (
        <div className="flex items-center justify-center h-40 text-slate-400 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados do Strato…
        </div>
      )}
    </div>
  )

  // ── Vendas ──────────────────────────────────────────────────────────────────
  const VendasTab = () => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead cols={['Cód.', 'Cliente', 'Contato', 'Corretor', 'Valor Venda', 'Entrada', 'Saldo', 'Data', 'Status']} />
          <tbody>
            {loading && <LoadingRow cols={9} />}
            {!loading && vendas.length === 0 && <EmptyRow cols={9} />}
            {!loading && vendas.map(v => (
              <tr key={v.vend1_cod} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.vend1_cod}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-700">{v.cliente ?? '—'}</p>
                  {v.email && <p className="text-xs text-slate-400">{v.email}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{v.telefone ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{v.corretor ?? '—'}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{R$(v.vend1_val_ven)}</td>
                <td className="px-4 py-3 text-green-600">{R$(v.vend1_val_ent)}</td>
                <td className="px-4 py-3 text-blue-600">{R$(v.vend1_val_sal)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(v.vend1_dat_ven)}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs',
                    v.vend1_dat_can ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700')}>
                    {v.vend1_dat_can ? 'Cancelado' : 'Ativo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // ── Boletos ─────────────────────────────────────────────────────────────────
  const BoletosTab = () => (
    <div className="space-y-4">
      {/* Filtros de status */}
      <div className="flex gap-2 flex-wrap">
        {[
          { v: '',          l: 'Todos' },
          { v: 'em_aberto', l: 'Em Aberto' },
          { v: 'vencido',   l: 'Vencidos' },
          { v: 'pago',      l: 'Pagos' },
          { v: 'cancelado', l: 'Cancelados' },
        ].map(opt => (
          <button
            key={opt.v}
            onClick={() => { setBoletoStatus(opt.v); setTimeout(() => loadData('boletos'), 100) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              boletoStatus === opt.v
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {opt.l}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <TableHead cols={['Cód.', 'Cliente', 'CPF', 'Parcela', 'Valor', 'Vencimento', 'Pagamento', 'Status']} />
            <tbody>
              {loading && <LoadingRow cols={8} />}
              {!loading && boletos.length === 0 && <EmptyRow cols={8} />}
              {!loading && boletos.map(b => {
                const st = STATUS_BOLETO[b.status] ?? { label: b.status, color: 'bg-slate-100 text-slate-500' }
                return (
                  <tr key={b.bole1_cod} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{b.bole1_cod}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{b.cliente ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{b.cpf ?? '—'}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{b.num_parcela ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{R$(b.valor)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{fmtDate(b.vencimento)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-green-600">{fmtDate(b.data_pagamento)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', st.color)}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // ── Inadimplência ────────────────────────────────────────────────────────────
  const InadimTab = () => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead cols={['Cliente', 'CPF', 'Contrato', 'Boletos', 'Valor Vencido', 'Primeiro Venc.', 'Dias em Atraso']} />
          <tbody>
            {loading && <LoadingRow cols={7} />}
            {!loading && inadimp.length === 0 && <EmptyRow cols={7} />}
            {!loading && inadimp.map((i, idx) => (
              <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-700">{i.cliente}</p>
                  {i.email && <p className="text-xs text-slate-400">{i.email}</p>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{i.cpf ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{i.contrato ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-bold">
                    {i.boletos_vencidos}
                  </span>
                </td>
                <td className="px-4 py-3 font-bold text-red-600">{R$(i.valor_total_vencido)}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(i.vencimento_mais_antigo)}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-semibold',
                    Number(i.dias_em_atraso) > 90 ? 'bg-red-100 text-red-700' :
                    Number(i.dias_em_atraso) > 30 ? 'bg-orange-100 text-orange-700' :
                    'bg-yellow-100 text-yellow-700')}>
                    {i.dias_em_atraso} dias
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  // ── Clientes ─────────────────────────────────────────────────────────────────
  const ClientesTab = () => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <TableHead cols={['Nome / Razão', 'E-mail', 'Celular', 'WhatsApp', 'Bairro', 'Tipo', 'Cadastro']} />
          <tbody>
            {loading && <LoadingRow cols={7} />}
            {!loading && clientes.length === 0 && <EmptyRow cols={7} />}
            {!loading && clientes.map(c => (
              <tr key={c.pess2_cod} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-700">{c.pess2_nom}</p>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{c.pess2_email ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{c.celular ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500">{c.whatsapp ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{c.bairro ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs',
                    c.pessoa_fisica === 'S' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                    {c.pessoa_fisica === 'S' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtDate(c.data_cadastro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Relatórios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Dados em tempo real do sistema Strato</p>
        </div>
        <button
          onClick={() => { setDashboard(null); loadData(tab) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-100 rounded-xl p-1 shadow-sm w-fit">
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

      {/* Barra de busca (exceto resumo) */}
      {tab !== 'resumo' && tab !== 'inadimplencia' && (
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder={
                tab === 'clientes' ? 'Nome, e-mail ou celular…' :
                tab === 'vendas'   ? 'Nome ou código…' :
                'Nome ou CPF…'
              }
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Buscar
          </button>
        </div>
      )}

      {/* Conteúdo da tab */}
      {tab === 'resumo'        && <ResumoTab />}
      {tab === 'vendas'        && <VendasTab />}
      {tab === 'boletos'       && <BoletosTab />}
      {tab === 'inadimplencia' && <InadimTab />}
      {tab === 'clientes'      && <ClientesTab />}
    </div>
  )
}
