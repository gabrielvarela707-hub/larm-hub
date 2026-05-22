'use client'

import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  AlertCircle, ArrowUpRight, BarChart3, Eye, Globe,
  MapPin, Megaphone, MousePointerClick, Phone,
  Repeat2, Search, Target, TrendingUp, Users, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'google' | 'meta' | 'attribution' | 'calls' | 'audit'
type DateRange = '7d' | '30d' | '90d' | 'ano'

// ─── Mock data ────────────────────────────────────────────────────────────────

const MONTHLY_DATA = [
  { mes: 'Jan', impressoes: 38200, cliques: 4100, leads: 210, conversoes: 18, custo: 3800 },
  { mes: 'Fev', impressoes: 41500, cliques: 4700, leads: 248, conversoes: 22, custo: 4200 },
  { mes: 'Mar', impressoes: 52300, cliques: 6200, leads: 310, conversoes: 28, custo: 5500 },
  { mes: 'Abr', impressoes: 61000, cliques: 7800, leads: 380, conversoes: 35, custo: 6800 },
  { mes: 'Mai', impressoes: 75235, cliques: 9138, leads: 441, conversoes: 42, custo: 8085 },
]

const CAMPAIGNS_GOOGLE = [
  { nome: 'Santa Clara — Lancamento', status: 'ativo', cliques: 3852, custo: 627, receita: 34280, roi: 54673, cpc: 0.16, ctr: 0.00, vendas: 93, cps: 6.74, leads: 116, cpl: 5.41, impressoes: 43777, media: 36.86 },
  { nome: 'Santa Clara — Retargeting', status: 'ativo', cliques: 4833, custo: 582, receita: 25260, roi: 43404, cpc: 0.12, ctr: 0.00, vendas: 95, cps: 6.13, leads: 105, cpl: 5.54, impressoes: 29646, media: 26.59 },
  { nome: 'Residencial — Busca Local',  status: 'ativo', cliques: 5010, custo: 210, receita: 25650, roi: 121905, cpc: 0.04, ctr: 0.00, vendas: 88, cps: 2.39, leads: 118, cpl: 1.78, impressoes: 32188, media: 29.15 },
  { nome: 'Marca Santa Clara',          status: 'pausado', cliques: 3818, custo: 195, receita: 27310, roi: 140030, cpc: 0.05, ctr: 0.00, vendas: 72, cps: 2.71, leads: 114, cpl: 1.71, impressoes: 35827, media: 37.93 },
  { nome: 'Captacao Interior SP',       status: 'ativo', cliques: 3625, custo: 473, receita: 26730, roi: 56561, cpc: 0.13, ctr: 0.00, vendas: 94, cps: 5.03, leads: 77, cpl: 6.14, impressoes: 33797, media: 28.44 },
]

const CAMPAIGNS_META = [
  { nome: 'Santa Clara — Lancamento', status: 'ativo', cliques: 3852, custo: 627, receita: 30080, roi: 47974, cpc: 0.16, ctr: 2.99, vendas: 67, cps: 9.36, leads: 101, cpl: 6.21, impressoes: 43777, media: 44.90 },
  { nome: 'Residencial — Busca Local',  status: 'ativo', cliques: 5010, custo: 210, receita: 27800, roi: 132190, cpc: 0.04, ctr: 1.16, vendas: 74, cps: 2.84, leads: 103, cpl: 2.04, impressoes: 32118, media: 37.57 },
  { nome: 'Santa Clara — Retargeting', status: 'ativo', cliques: 4833, custo: 582, receita: 26560, roi: 45638, cpc: 0.12, ctr: 1.16, vendas: 59, cps: 9.86, leads: 103, cpl: 5.65, impressoes: 29646, media: 45.02 },
  { nome: 'Marca Santa Clara',          status: 'pausado', cliques: 3818, custo: 195, receita: 30750, roi: 157669, cpc: 0.05, ctr: 1.16, vendas: 54, cps: 3.61, leads: 101, cpl: 1.93, impressoes: 35827, media: 56.94 },
  { nome: 'Captacao Interior SP',       status: 'ativo', cliques: 3625, custo: 473, receita: 26440, roi: 55947, cpc: 0.13, ctr: 1.16, vendas: 95, cps: 4.97, leads: 106, cpl: 4.46, impressoes: 33797, media: 27.83 },
]

const ATTRIBUTION_EVENTS = [
  { tipo: 'Sessao organica', fonte: 'google', contato: 'Ana P. Ferreira',     campanha: 'Marca SC',         utm_meio: 'organic', utm_conteudo: '—', utm_fonte: 'google',   termos: '—',         indicador: '—',          url: '/lotes', criado: '21/05 14:32' },
  { tipo: 'Lead',            fonte: 'meta',   contato: 'Carlos M. Santos',     campanha: 'SC Lancamento',    utm_meio: 'cpc',     utm_conteudo: 'video_v3', utm_fonte: 'facebook', termos: '—',    indicador: '—',          url: '/proposta', criado: '21/05 13:18' },
  { tipo: 'Sessao paga',     fonte: 'google', contato: 'Fernanda C. Oliveira', campanha: 'Busca Local',      utm_meio: 'cpc',     utm_conteudo: 'txt_01',   utm_fonte: 'google',   termos: 'lote sp', indicador: 'retargeting', url: '/mapa', criado: '21/05 12:55' },
  { tipo: 'Lead',            fonte: 'google', contato: 'Roberto A. Lima',      campanha: 'SC Retargeting',   utm_meio: 'cpc',     utm_conteudo: 'banner_a', utm_fonte: 'google',   termos: '—',    indicador: 'novo',       url: '/lotes', criado: '20/05 16:40' },
  { tipo: 'Sessao paga',     fonte: 'meta',   contato: 'Patricia S. Moura',    campanha: 'Captacao Interior',utm_meio: 'cpc',     utm_conteudo: 'img_v2',   utm_fonte: 'instagram',termos: '—',   indicador: '—',          url: '/', criado: '20/05 11:22' },
]

const CALLS_DATA = [
  { name: 'Atendida',  value: 48, color: '#22c55e' },
  { name: 'Perdida',   value: 27, color: '#ef4444' },
  { name: 'Voicemail', value: 12, color: '#f59e0b' },
  { name: 'Ocupado',   value: 8,  color: '#94a3b8' },
]

const TOP_SOURCES = [
  { fonte: 'Google Ads',  ligacoes: 38, ganhos: 12, duracao: '3m 24s' },
  { fonte: 'Meta Ads',    ligacoes: 29, ganhos: 8,  duracao: '2m 51s' },
  { fonte: 'Orgânico',    ligacoes: 14, ganhos: 5,  duracao: '4m 12s' },
  { fonte: 'Indicação',   ligacoes: 9,  ganhos: 4,  duracao: '5m 08s' },
  { fonte: 'Direto',      ligacoes: 5,  ganhos: 1,  duracao: '1m 44s' },
]

const CALL_LOG = [
  { data: '21/05 15:34', contato: 'Ana Paula F.',   numero: '(11) 99123-4567', fonte: 'Google Ads',  status: 'Atendida', duracao: '4m 12s', palavra: 'lote sp' },
  { data: '21/05 14:18', contato: 'Carlos M.',      numero: '(11) 98765-4321', fonte: 'Meta Ads',    status: 'Perdida',  duracao: '—',       palavra: '—'       },
  { data: '21/05 13:45', contato: 'Desconhecido',   numero: '(19) 97654-3210', fonte: 'Orgânico',    status: 'Atendida', duracao: '2m 55s', palavra: '—'       },
  { data: '21/05 11:22', contato: 'Fernanda O.',    numero: '(11) 96543-2109', fonte: 'Google Ads',  status: 'Voicemail',duracao: '—',       palavra: 'loteamento barato' },
  { data: '20/05 17:10', contato: 'Roberto L.',     numero: '(11) 95432-1098', fonte: 'Indicação',   status: 'Atendida', duracao: '6m 33s', palavra: '—'       },
]

const AUDIT_POSITIONS = [
  { termo: 'loteamento Santa Clara SP',        pos: 2,  delta: '+1', vol: '1.9k' },
  { termo: 'lotes residenciais São Paulo',      pos: 5,  delta: '+3', vol: '3.4k' },
  { termo: 'comprar lote interior SP',          pos: 8,  delta: '0',  vol: '2.1k' },
  { termo: 'loteamento financiado direto',      pos: 12, delta: '-2', vol: '890'  },
  { termo: 'terreno Santa Clara loteamento',    pos: 4,  delta: '+2', vol: '560'  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
}

function pct(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

function kpiNum(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000)    return `${(value / 1000).toFixed(1)}k`
  return value.toLocaleString('pt-BR')
}

const TOTAL = MONTHLY_DATA.at(-1)!
const PREV  = MONTHLY_DATA.at(-2)!

function delta(curr: number, prev: number) {
  const d = prev > 0 ? ((curr - prev) / prev) * 100 : 0
  return { pct: Math.abs(d).toFixed(1), up: d >= 0 }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, up }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; up?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">{label}</p>
        <Icon className={cn('h-4 w-4', color)} />
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      {sub && (
        <p className={cn('mt-1 flex items-center gap-1 text-[11px]', up ? 'text-emerald-600' : 'text-red-500')}>
          <ArrowUpRight className={cn('h-3 w-3', !up && 'rotate-90')} />
          {sub}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ativo')   return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Ativo</span>
  if (status === 'pausado') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Pausado</span>
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{status}</span>
}

function CallStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Atendida':  'bg-emerald-50 text-emerald-700',
    'Perdida':   'bg-red-50 text-red-700',
    'Voicemail': 'bg-amber-50 text-amber-700',
  }
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', map[status] || 'bg-slate-100 text-slate-500')}>{status}</span>
}

function MockBanner({ platform }: { platform: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      Dados de amostra. Conecte sua conta {platform} nas configurações para ver dados reais.
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const [tab, setTab]           = useState<Tab>('overview')
  const [dateRange, setDateRange] = useState<DateRange>('30d')

  const TABS: [Tab, string][] = [
    ['overview',     'Visão Geral'],
    ['google',       'Google Ads'],
    ['meta',         'Meta Ads'],
    ['attribution',  'Atribuição'],
    ['calls',        'Ligações'],
    ['audit',        'Auditoria Local'],
  ]

  const totalCliques   = CAMPAIGNS_GOOGLE.reduce((s, c) => s + c.cliques, 0)
  const totalCusto     = CAMPAIGNS_GOOGLE.reduce((s, c) => s + c.custo, 0)
  const totalLeads     = CAMPAIGNS_GOOGLE.reduce((s, c) => s + c.leads, 0)
  const totalVendas    = CAMPAIGNS_GOOGLE.reduce((s, c) => s + c.vendas, 0)
  const totalReceita   = CAMPAIGNS_GOOGLE.reduce((s, c) => s + c.receita, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Marketing & Mídia</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Performance de campanhas, atribuição, ligações e auditoria de presença local.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
            {(['7d','30d','90d','ano'] as DateRange[]).map(r => (
              <button key={r} onClick={() => setDateRange(r)}
                className={cn('px-3 py-1.5 text-xs font-medium',
                  dateRange === r ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
                {r === 'ano' ? '1 ano' : `Últimos ${r.replace('d',' dias')}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 overflow-x-auto rounded-xl border border-slate-200 bg-white w-fit">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
              tab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
            {label}
          </button>
        ))}
      </div>

      {/* ── VISÃO GERAL ────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              { label: 'Impressões',  value: kpiNum(TOTAL.impressoes),  icon: Eye,              color: 'text-slate-700', ...delta(TOTAL.impressoes, PREV.impressoes) },
              { label: 'Cliques',     value: kpiNum(TOTAL.cliques),     icon: MousePointerClick,color: 'text-blue-700',  ...delta(TOTAL.cliques, PREV.cliques) },
              { label: 'Leads',       value: kpiNum(TOTAL.leads),       icon: Users,            color: 'text-violet-600',...delta(TOTAL.leads, PREV.leads) },
              { label: 'Conversões',  value: kpiNum(TOTAL.conversoes),  icon: Target,           color: 'text-emerald-600',...delta(TOTAL.conversoes, PREV.conversoes) },
              { label: 'Investido',   value: brl(TOTAL.custo),          icon: TrendingUp,       color: 'text-orange-600',...delta(TOTAL.custo, PREV.custo) },
            ].map(kpi => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value}
                sub={`${kpi.pct}% vs mês ant.`} up={kpi.up} icon={kpi.icon} color={kpi.color} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-800">Cliques por canal — evolução mensal</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={MONTHLY_DATA}>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Area type="monotone" dataKey="cliques" stroke="#3b82f6" strokeWidth={2} fill="url(#cg)" name="Cliques" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-800">Leads gerados por mês</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={MONTHLY_DATA} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                  <Bar dataKey="leads" fill="#8b5cf6" radius={[4,4,0,0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: 'CPL médio',         value: `R$ ${(totalCusto / totalLeads).toFixed(2)}`, sub: 'Custo por lead' },
              { label: 'CPS médio',         value: `R$ ${(totalCusto / totalVendas).toFixed(2)}`,sub: 'Custo por venda' },
              { label: 'ROI total',         value: `${(((totalReceita - totalCusto) / totalCusto) * 100).toFixed(0)}%`,sub: 'Retorno sobre investimento' },
              { label: 'Taxa de conversão', value: `${((totalVendas / totalLeads) * 100).toFixed(1)}%`, sub: 'Leads → Vendas' },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GOOGLE ADS ──────────────────────────────────────────────────── */}
      {(tab === 'google' || tab === 'meta') && (() => {
        const isGoogle = tab === 'google'
        const campaigns = isGoogle ? CAMPAIGNS_GOOGLE : CAMPAIGNS_META
        const platform  = isGoogle ? 'Google Ads' : 'Meta Ads'
        return (
          <div className="space-y-5">
            <MockBanner platform={platform} />

            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Visualizações', value: '175.235', icon: Eye,              color: 'text-amber-600',   data: MONTHLY_DATA.map(d => ({ name: d.mes, value: d.impressoes })) },
                { label: 'Cliques',       value: '21.138',  icon: MousePointerClick,color: 'text-blue-600',    data: MONTHLY_DATA.map(d => ({ name: d.mes, value: d.cliques })) },
                { label: 'Conversões',    value: '7.125',   icon: Target,           color: 'text-emerald-600', data: MONTHLY_DATA.map(d => ({ name: d.mes, value: d.conversoes })) },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <kpi.icon className={cn('h-4 w-4', kpi.color)} />
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{kpi.label}</p>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 mb-2">{kpi.value}</p>
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart data={kpi.data}>
                      <defs><linearGradient id={`g${kpi.label}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient></defs>
                      <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#g${kpi.label})`} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Despesa total',    value: brl(TOTAL.custo) },
                { label: 'CPC médio',        value: 'R$ 0,10'        },
                { label: 'Custo/conversão',  value: 'R$ 0,29'        },
                { label: 'Taxa conversão',   value: `${isGoogle ? '6,90' : '4,20'}%` },
              ].map(item => (
                <div key={item.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/70 border-b border-slate-100">
                  <tr>
                    {['Campanha','Status','Cliques','Custo','Receita','ROI%','CPC','CTR','Vendas','CPS','Leads','CPL'].map(h => (
                      <th key={h} className="px-3 py-3 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {campaigns.map(c => (
                    <tr key={c.nome} className="hover:bg-slate-50/50">
                      <td className="px-3 py-3 font-medium text-blue-600 hover:underline cursor-pointer whitespace-nowrap max-w-[180px] truncate">{c.nome}</td>
                      <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-3 text-slate-700">{c.cliques.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-3 text-slate-700">{brl(c.custo)}</td>
                      <td className="px-3 py-3 text-slate-700">{brl(c.receita)}</td>
                      <td className="px-3 py-3 text-emerald-600 font-semibold">{pct(c.roi / 100)}</td>
                      <td className="px-3 py-3 text-slate-700">{brl(c.cpc)}</td>
                      <td className="px-3 py-3 text-slate-700">{pct(c.ctr)}</td>
                      <td className="px-3 py-3 text-slate-700">{c.vendas}</td>
                      <td className="px-3 py-3 text-slate-700">{brl(c.cps)}</td>
                      <td className="px-3 py-3 text-slate-700">{c.leads}</td>
                      <td className="px-3 py-3 text-slate-700">{brl(c.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-100 bg-slate-50/50">
                  <tr>
                    <td className="px-3 py-2.5 font-semibold text-slate-700" colSpan={2}>{campaigns.length} campanhas</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{campaigns.reduce((s,c)=>s+c.cliques,0).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{brl(campaigns.reduce((s,c)=>s+c.custo,0))}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{brl(campaigns.reduce((s,c)=>s+c.receita,0))}</td>
                    <td colSpan={6} />
                    <td className="px-3 py-2.5 font-semibold text-slate-700">{campaigns.reduce((s,c)=>s+c.leads,0)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── ATRIBUIÇÃO ──────────────────────────────────────────────────── */}
      {tab === 'attribution' && (
        <div className="space-y-5">
          <MockBanner platform="Google/Meta (UTM)" />

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Receita fechada',  value: 'R$ 0,00',  icon: TrendingUp, color: 'text-emerald-600' },
              { label: 'Ganhos',           value: '0',         icon: Target,     color: 'text-blue-600'   },
              { label: 'Total de leads',   value: '0',         icon: Users,      color: 'text-slate-700'  },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm flex items-start gap-4">
                <div className="rounded-xl bg-slate-50 p-2.5">
                  <kpi.icon className={cn('h-5 w-5', kpi.color)} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{kpi.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-0.5">{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            <button className="rounded-lg border-b-2 border-blue-600 pb-2 text-sm font-semibold text-blue-600">Receita</button>
            <button className="rounded-lg pb-2 text-sm font-medium text-slate-400 hover:text-slate-600">Leads</button>
            <button className="rounded-lg pb-2 text-sm font-medium text-slate-400 hover:text-slate-600">Leads</button>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-800">Eventos de sessão</p>
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Colunas</button>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Exportar</button>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Filtros</button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100">
                <tr>
                  {['Tipo de evento','Fonte','Contato','Campanha','Meio UTM','Conteúdo UTM','Fonte UTM','Termos UTM','Indicador','Link de URL','Criado em'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ATTRIBUTION_EVENTS.map((e, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{e.tipo}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{e.fonte}</span></td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{e.contato}</td>
                    <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{e.campanha}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.utm_meio}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.utm_conteudo}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.utm_fonte}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.termos}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.indicador}</td>
                    <td className="px-3 py-2.5 text-blue-600">{e.url}</td>
                    <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{e.criado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── LIGAÇÕES ────────────────────────────────────────────────────── */}
      {tab === 'calls' && (
        <div className="space-y-5">
          <div className="flex gap-3 text-sm">
            <button className="border-b-2 border-blue-600 pb-2 font-semibold text-blue-600">Recebidas</button>
            <button className="pb-2 font-medium text-slate-400 hover:text-slate-600">Feitas</button>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-800">Ligação por status</p>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={CALLS_DATA} cx={75} cy={75} innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                      {CALLS_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value, name) => [`${value}`, name]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {CALLS_DATA.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-xs text-slate-600 flex-1">{d.name}</span>
                      <span className="text-xs font-semibold text-slate-800">{d.value}</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-slate-400">Duração média: 3m 12s &nbsp;|&nbsp; Total: 1h 52m</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-800">Principais fontes</p>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-100">
                  {['Fonte','Total','Ganhos','Duração média'].map(h => <th key={h} className="pb-2 text-left font-semibold text-slate-500">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {TOP_SOURCES.map(s => (
                    <tr key={s.fonte} className="hover:bg-slate-50/50">
                      <td className="py-2 text-slate-700 font-medium">{s.fonte}</td>
                      <td className="py-2 text-slate-700">{s.ligacoes}</td>
                      <td className="py-2 text-emerald-600 font-semibold">{s.ganhos}</td>
                      <td className="py-2 text-slate-500">{s.duracao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Todas as ligações</p>
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">Recebidas</button>
                <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">Feitas</button>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50/70 border-b border-slate-100">
                <tr>{['Data e hora','Contato','Número','Fonte','Status','Duração','Palavra-chave'].map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {CALL_LOG.map((c, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{c.data}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{c.contato}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.numero}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{c.fonte}</span></td>
                    <td className="px-4 py-2.5"><CallStatus status={c.status} /></td>
                    <td className="px-4 py-2.5 text-slate-600">{c.duracao}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.palavra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── AUDITORIA LOCAL ──────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="space-y-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Auditoria de Marketing Local</h2>
              <p className="text-sm text-slate-500 mt-0.5">Desempenho do site, SEO local e posições de busca.</p>
            </div>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Gerar relatório
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm text-center">
              <div className="relative mx-auto mb-3 flex h-24 w-24 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#22c55e" strokeWidth="3"
                    strokeDasharray="81 100" strokeLinecap="round" />
                </svg>
                <span className="absolute text-2xl font-bold text-slate-900">81%</span>
              </div>
              <p className="text-sm font-semibold text-slate-700">Desempenho do site</p>
              <p className="text-xs text-slate-400 mt-1">Core Web Vitals · mobile</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm text-center">
              <div className="relative mx-auto mb-3 flex h-24 w-24 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#3b82f6" strokeWidth="3"
                    strokeDasharray="68 100" strokeLinecap="round" />
                </svg>
                <span className="absolute text-2xl font-bold text-slate-900">68%</span>
              </div>
              <p className="text-sm font-semibold text-slate-700">SEO local</p>
              <p className="text-xs text-slate-400 mt-1">Google Business Profile</p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm text-center">
              <div className="relative mx-auto mb-3 flex h-24 w-24 items-center justify-center">
                <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="3"
                    strokeDasharray="54 100" strokeLinecap="round" />
                </svg>
                <span className="absolute text-2xl font-bold text-slate-900">54%</span>
              </div>
              <p className="text-sm font-semibold text-slate-700">Saúde do GBP</p>
              <p className="text-xs text-slate-400 mt-1">Google Business Profile</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Search className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-slate-800">Posições de busca local</p>
              </div>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-100">
                  {['Termo de busca','Posição','Variação','Volume'].map(h => <th key={h} className="pb-2 text-left font-semibold text-slate-500">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {AUDIT_POSITIONS.map(p => (
                    <tr key={p.termo} className="hover:bg-slate-50/50">
                      <td className="py-2 text-slate-700">{p.termo}</td>
                      <td className="py-2 font-bold text-blue-600">#{p.pos}</td>
                      <td className="py-2">
                        <span className={cn('text-xs font-semibold', p.delta.startsWith('+') ? 'text-emerald-600' : p.delta.startsWith('-') ? 'text-red-500' : 'text-slate-400')}>
                          {p.delta !== '0' ? p.delta : '—'}
                        </span>
                      </td>
                      <td className="py-2 text-slate-500">{p.vol}/mês</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4 text-emerald-600" />
                <p className="text-sm font-semibold text-slate-800">Cobertura local — mapa de calor</p>
              </div>
              <div className="grid grid-cols-6 gap-1 mb-3">
                {Array.from({ length: 36 }, (_, i) => {
                  const val = [9,7,5,4,6,3,8,6,4,3,5,2,7,9,6,5,7,4,5,7,8,6,4,3,4,5,3,2,4,3,3,4,2,1,3,2][i] || 3
                  const colors = ['bg-slate-100','bg-emerald-100','bg-emerald-200','bg-emerald-300','bg-emerald-400','bg-emerald-500','bg-emerald-600','bg-emerald-700','bg-emerald-800','bg-emerald-900']
                  return <div key={i} className={cn('h-8 rounded', colors[val])} title={`Pos. ${10-val}`} />
                })}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <div className="h-2 w-2 rounded bg-emerald-900" /><span>Top 3</span>
                <div className="h-2 w-2 rounded bg-emerald-500 ml-2" /><span>Top 10</span>
                <div className="h-2 w-2 rounded bg-emerald-200 ml-2" /><span>Top 20</span>
                <div className="h-2 w-2 rounded bg-slate-100 ml-2" /><span>Fora</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
