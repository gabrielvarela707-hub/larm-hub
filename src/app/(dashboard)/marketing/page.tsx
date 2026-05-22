'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import {
  AlertCircle, ArrowUpRight, Eye, MapPin,
  MousePointerClick, Phone, Plus, RefreshCw,
  Search, Target, TrendingUp, Users, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab      = 'overview' | 'google' | 'meta' | 'attribution' | 'calls' | 'audit'
type PlatSub  = 'relatorio' | 'orcamento'
type DateRange= '7d' | '30d' | '90d' | 'ano'
type Platform = 'meta' | 'google'

interface Campaign { id: string; name: string; dailyBudget: number; active: boolean; platform: Platform }
interface DayRecord { day: number; estimated: number; realized: number; deposit: number }
interface Deposit   { id: string; date: string; value: number; method: string; platform: Platform }

// ─── Mock data ────────────────────────────────────────────────────────────────

const MONTHLY_DATA = [
  { mes: 'Jan', impressoes: 38200, cliques: 4100, leads: 210, conversoes: 18, custo: 3800 },
  { mes: 'Fev', impressoes: 41500, cliques: 4700, leads: 248, conversoes: 22, custo: 4200 },
  { mes: 'Mar', impressoes: 52300, cliques: 6200, leads: 310, conversoes: 28, custo: 5500 },
  { mes: 'Abr', impressoes: 61000, cliques: 7800, leads: 380, conversoes: 35, custo: 6800 },
  { mes: 'Mai', impressoes: 75235, cliques: 9138, leads: 441, conversoes: 42, custo: 8085 },
]

const CAMPAIGNS_GOOGLE = [
  { nome: 'Santa Clara — Lançamento', status: 'ativo',   cliques: 3852, custo: 627, receita: 34280, roi: 54673, cpc: 0.16, vendas: 93, cps: 6.74, leads: 116, cpl: 5.41, impressoes: 43777 },
  { nome: 'Santa Clara — Retargeting', status: 'ativo',  cliques: 4833, custo: 582, receita: 25260, roi: 43404, cpc: 0.12, vendas: 95, cps: 6.13, leads: 105, cpl: 5.54, impressoes: 29646 },
  { nome: 'Residencial — Busca Local',  status: 'ativo', cliques: 5010, custo: 210, receita: 25650, roi: 121905,cpc: 0.04, vendas: 88, cps: 2.39, leads: 118, cpl: 1.78, impressoes: 32188 },
  { nome: 'Marca Santa Clara',       status: 'pausado',  cliques: 3818, custo: 195, receita: 27310, roi: 140030,cpc: 0.05, vendas: 72, cps: 2.71, leads: 114, cpl: 1.71, impressoes: 35827 },
  { nome: 'Captação Interior SP',       status: 'ativo', cliques: 3625, custo: 473, receita: 26730, roi: 56561, cpc: 0.13, vendas: 94, cps: 5.03, leads: 77,  cpl: 6.14, impressoes: 33797 },
]

const CAMPAIGNS_META = [
  { nome: 'Santa Clara — Lançamento', status: 'ativo',   cliques: 3852, custo: 627, receita: 30080, roi: 47974, cpc: 0.16, ctr: 2.99, vendas: 67, cps: 9.36, leads: 101, cpl: 6.21, impressoes: 43777 },
  { nome: 'Residencial — Busca Local', status: 'ativo',  cliques: 5010, custo: 210, receita: 27800, roi: 132190,cpc: 0.04, ctr: 1.16, vendas: 74, cps: 2.84, leads: 103, cpl: 2.04, impressoes: 32118 },
  { nome: 'Santa Clara — Retargeting', status: 'ativo',  cliques: 4833, custo: 582, receita: 26560, roi: 45638, cpc: 0.12, ctr: 1.16, vendas: 59, cps: 9.86, leads: 103, cpl: 5.65, impressoes: 29646 },
  { nome: 'Marca Santa Clara',       status: 'pausado',  cliques: 3818, custo: 195, receita: 30750, roi: 157669,cpc: 0.05, ctr: 1.16, vendas: 54, cps: 3.61, leads: 101, cpl: 1.93, impressoes: 35827 },
  { nome: 'Captação Interior SP',       status: 'ativo', cliques: 3625, custo: 473, receita: 26440, roi: 55947, cpc: 0.13, ctr: 1.16, vendas: 95, cps: 4.97, leads: 106, cpl: 4.46, impressoes: 33797 },
]

// ── Controladoria data ──
const CTRL_CAMPAIGNS_META: Campaign[] = [
  { id: 'c1', name: 'Post Instagram: Cada chave representa um sonho', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c2', name: 'Guarulhos — Pinda | Conversão',                  dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c3', name: 'Santa Clara Reconhecimento — Posts',             dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c4', name: 'Santa Clara Engajamento — Vídeos',               dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c5', name: 'PROMOÇÃO DE ABRIL — Facebook',                   dailyBudget: 25, active: true, platform: 'meta' },
  { id: 'c6', name: 'Retargeting Site — Visitantes',                  dailyBudget: 15, active: false,platform: 'meta' },
]
const CTRL_CAMPAIGNS_GOOGLE: Campaign[] = [
  { id: 'g1', name: 'Search — Lotes Santa Clara',   dailyBudget: 40, active: true,  platform: 'google' },
  { id: 'g2', name: 'Display — Portal do Lago',     dailyBudget: 30, active: true,  platform: 'google' },
  { id: 'g3', name: 'YouTube — Depoimentos',        dailyBudget: 25, active: false, platform: 'google' },
  { id: 'g4', name: 'Performance Max — Lançamento', dailyBudget: 50, active: true,  platform: 'google' },
]
const CTRL_DEPOSITS_META: Deposit[] = [
  { id: 'd1', date: '2026-05-01', value: 4000, method: 'PIX',       platform: 'meta' },
  { id: 'd2', date: '2026-05-15', value: 2500, method: 'PIX',       platform: 'meta' },
]
const CTRL_DEPOSITS_GOOGLE: Deposit[] = [
  { id: 'd3', date: '2026-05-01', value: 2000, method: 'PIX',       platform: 'google' },
  { id: 'd4', date: '2026-05-10', value: 1500, method: 'Cartão',    platform: 'google' },
]

const RATES = [0,0,0.84,1.01,1.43,0.85,1.06,0.95,0.89,0,0,0,0,0,0,0,0,0,0,0,0,0.72,0.91,1.05,0.88,0.76,0.95,0,0,0,0]
const DAYS_OF_WEEK = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MONTH_NAMES  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const ATTRIBUTION_EVENTS = [
  { tipo: 'Sessão orgânica', fonte: 'google',   contato: 'Ana P. Ferreira',  campanha: 'Marca SC',     utm_meio: 'organic', utm_fonte: 'google',   criado: '21/05 14:32' },
  { tipo: 'Lead',            fonte: 'meta',     contato: 'Carlos M. Santos', campanha: 'SC Lançamento',utm_meio: 'cpc',     utm_fonte: 'facebook', criado: '21/05 13:18' },
  { tipo: 'Sessão paga',     fonte: 'google',   contato: 'Fernanda C.',      campanha: 'Busca Local',  utm_meio: 'cpc',     utm_fonte: 'google',   criado: '21/05 12:55' },
  { tipo: 'Lead',            fonte: 'google',   contato: 'Roberto A. Lima',  campanha: 'SC Retarget',  utm_meio: 'cpc',     utm_fonte: 'google',   criado: '20/05 16:40' },
  { tipo: 'Sessão paga',     fonte: 'meta',     contato: 'Patricia S.',      campanha: 'Captação Int.',utm_meio: 'cpc',     utm_fonte: 'instagram',criado: '20/05 11:22' },
]

const CALLS_DATA = [
  { name: 'Atendida',  value: 48, color: '#22c55e' },
  { name: 'Perdida',   value: 27, color: '#ef4444' },
  { name: 'Voicemail', value: 12, color: '#f59e0b' },
  { name: 'Ocupado',   value: 8,  color: '#94a3b8' },
]
const TOP_SOURCES = [
  { fonte: 'Google Ads', ligacoes: 38, ganhos: 12, duracao: '3m 24s' },
  { fonte: 'Meta Ads',   ligacoes: 29, ganhos: 8,  duracao: '2m 51s' },
  { fonte: 'Orgânico',   ligacoes: 14, ganhos: 5,  duracao: '4m 12s' },
  { fonte: 'Indicação',  ligacoes: 9,  ganhos: 4,  duracao: '5m 08s' },
]
const CALL_LOG = [
  { data: '21/05 15:34', contato: 'Ana Paula F.', numero: '(11) 99123-4567', fonte: 'Google Ads', status: 'Atendida', duracao: '4m 12s' },
  { data: '21/05 14:18', contato: 'Carlos M.',    numero: '(11) 98765-4321', fonte: 'Meta Ads',   status: 'Perdida',  duracao: '—'      },
  { data: '21/05 13:45', contato: 'Desconhecido', numero: '(19) 97654-3210', fonte: 'Orgânico',   status: 'Atendida', duracao: '2m 55s' },
  { data: '21/05 11:22', contato: 'Fernanda O.',  numero: '(11) 96543-2109', fonte: 'Google Ads', status: 'Voicemail',duracao: '—'      },
]
const AUDIT_POSITIONS = [
  { termo: 'loteamento Santa Clara SP',   pos: 2,  delta: '+1', vol: '1.9k' },
  { termo: 'lotes residenciais São Paulo',pos: 5,  delta: '+3', vol: '3.4k' },
  { termo: 'comprar lote interior SP',    pos: 8,  delta: '0',  vol: '2.1k' },
  { termo: 'loteamento financiado direto',pos: 12, delta: '-2', vol: '890'  },
  { termo: 'terreno Santa Clara',         pos: 4,  delta: '+2', vol: '560'  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function kpiNum(v: number) { if (v >= 1000000) return `${(v/1000000).toFixed(1)}M`; if (v>=1000) return `${(v/1000).toFixed(1)}k`; return v.toLocaleString('pt-BR') }
function delta(curr: number, prev: number) { const d = prev>0 ? ((curr-prev)/prev)*100 : 0; return { pct: Math.abs(d).toFixed(1), up: d>=0 } }

function genDays(year: number, month: number, campaigns: Campaign[], deposits: Deposit[]): DayRecord[] {
  const total = campaigns.filter(c => c.active).reduce((s, c) => s + c.dailyBudget, 0)
  return Array.from({ length: new Date(year, month+1, 0).getDate() }, (_, i) => {
    const day = i + 1
    const rate = RATES[i] ?? 0
    const dep = deposits.filter(d => { const dd = new Date(d.date); return dd.getDate()===day && dd.getMonth()===month && dd.getFullYear()===year }).reduce((s, d) => s + d.value, 0)
    return { day, estimated: total, realized: Math.round(total * rate * 100) / 100, deposit: dep }
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'ativo')   return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />Ativo</span>
  if (status === 'pausado') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Pausado</span>
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{status}</span>
}

function MockBanner({ platform }: { platform: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 border border-amber-200">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>Dados de amostra. Conecte sua conta {platform} nas configurações para ver dados reais.</span>
      <button className="ml-auto shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700">
        Conectar conta
      </button>
    </div>
  )
}

// ── Controladoria (Orçamento) panel ──────────────────────────────────────────

function OrcamentoPanel({ platform }: { platform: Platform }) {
  const now = new Date()
  const [year, setYear]       = useState(now.getFullYear())
  const [month, setMonth]     = useState(now.getMonth())
  const [showModal, setShowModal] = useState(false)
  const [newDeposit, setNewDeposit] = useState({ date: '', value: '', method: 'PIX' })

  const campaigns = platform === 'meta' ? CTRL_CAMPAIGNS_META : CTRL_CAMPAIGNS_GOOGLE
  const deposits  = platform === 'meta' ? CTRL_DEPOSITS_META  : CTRL_DEPOSITS_GOOGLE

  const days = useMemo(() => genDays(year, month, campaigns, deposits), [year, month, campaigns, deposits])

  const totalEst  = days.reduce((s,d) => s + d.estimated, 0)
  const totalReal = days.reduce((s,d) => s + d.realized, 0)
  const totalDep  = deposits.reduce((s,d) => s + d.value, 0)
  const balance   = totalDep - totalReal
  const activeC   = campaigns.filter(c => c.active)
  const dailyBudget = activeC.reduce((s, c) => s + c.dailyBudget, 0)
  const pctReal   = totalEst > 0 ? ((totalReal / totalEst) * 100).toFixed(0) : '0'

  function changeMonth(delta: number) {
    let m = month + delta, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  const accentColor = platform === 'meta' ? 'bg-blue-600' : 'bg-red-500'
  const borderColor = platform === 'meta' ? 'border-blue-200' : 'border-red-200'

  return (
    <div className="space-y-5">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <button onClick={() => changeMonth(-1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50">‹</button>
          <span className="border-x border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => changeMonth(1)}  className="px-2.5 py-2 text-slate-500 hover:bg-slate-50">›</button>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <Plus className="h-3.5 w-3.5" /> Registrar depósito
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Estimado',        value: brl(totalEst),  sub: undefined,                   color: 'text-slate-900' },
          { label: 'Realizado',       value: brl(totalReal), sub: `${pctReal}% do estimado`,   color: totalReal<=totalEst ? 'text-emerald-600' : 'text-red-600' },
          { label: 'Saldo do mês',    value: brl(balance),   sub: balance>=0 ? 'Positivo' : 'Insuficiente', color: balance>=0 ? 'text-emerald-600' : 'text-red-600' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={cn('mt-1 text-xl font-bold', c.color)}>{c.value}</p>
            {c.sub && <p className="mt-0.5 text-[11px] text-slate-400">{c.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Depósitos</p>
          <p className="mt-1 text-xl font-bold text-blue-600">{brl(totalDep)}</p>
          <div className="mt-2 space-y-0.5">
            {deposits.map(d => <p key={d.id} className="text-[11px] text-slate-400">{d.method} · {brl(d.value)}</p>)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Campanhas ativas</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{activeC.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{brl(dailyBudget)}/dia estimado</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Progresso estimado</p>
          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-slate-500 mb-1">
              <span>Realizado</span><span>{pctReal}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full transition-all', accentColor)} style={{ width: `${Math.min(100, Number(pctReal))}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Campaign list */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-slate-800">Campanhas ativas — {MONTH_NAMES[month]}</p>
        <div className="space-y-1">
          {activeC.map(c => (
            <div key={c.id} className="flex items-center gap-3 border-b border-slate-50 py-2 last:border-0">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="flex-1 truncate text-sm text-slate-700">{c.name}</span>
              <span className="shrink-0 text-sm font-semibold text-slate-800">{brl(c.dailyBudget)}/dia</span>
            </div>
          ))}
          {campaigns.filter(c => !c.active).map(c => (
            <div key={c.id} className="flex items-center gap-3 border-b border-slate-50 py-2 last:border-0 opacity-40">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <span className="flex-1 truncate text-sm text-slate-500 line-through">{c.name}</span>
              <span className="shrink-0 text-sm text-slate-400">{brl(c.dailyBudget)}/dia</span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily calendar */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-800">Lançamentos diários — {MONTH_NAMES[month]} {year}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
          {days.map(rec => {
            const dow    = DAYS_OF_WEEK[new Date(year, month, rec.day).getDay()]
            const hasData= rec.realized > 0 || rec.deposit > 0
            const isOver = rec.realized > rec.estimated
            return (
              <div key={rec.day} className={cn('rounded-xl border p-3 text-xs transition-all',
                hasData ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50/50',
                rec.deposit > 0 && `ring-1 ${borderColor}`)}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{rec.day}</p>
                    <p className="text-[10px] leading-none text-slate-400">{dow}</p>
                  </div>
                  {rec.realized > 0 && (
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                      isOver ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600')}>
                      {isOver ? 'acima' : 'ok'}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span className="text-slate-400">Est.</span><span className="font-medium text-slate-600">{brl(rec.estimated)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Real.</span><span className={cn('font-medium', rec.realized > 0 ? (isOver ? 'text-red-600' : 'text-emerald-600') : 'text-slate-300')}>{rec.realized > 0 ? brl(rec.realized) : '—'}</span></div>
                  {rec.deposit > 0 && <div className="flex justify-between border-t border-slate-100 pt-0.5"><span className="text-slate-400">Dep.</span><span className="font-semibold text-blue-600">{brl(rec.deposit)}</span></div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Deposit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Registrar depósito</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-600">Data</label>
                <input type="date" value={newDeposit.date} onChange={e => setNewDeposit(p => ({...p, date: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Valor (R$)</label>
                <input type="number" placeholder="0,00" value={newDeposit.value} onChange={e => setNewDeposit(p => ({...p, value: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">Forma</label>
                <select value={newDeposit.method} onChange={e => setNewDeposit(p => ({...p, method: e.target.value}))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
                  <option>PIX</option><option>Cartão de crédito</option><option>TED</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => setShowModal(false)} className={cn('flex-1 rounded-xl py-2 text-sm font-medium text-white', accentColor, 'hover:opacity-90')}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Platform tab (Relatório + Orçamento) ─────────────────────────────────────

function PlatformTab({ platform, campaigns, isGoogle }: {
  platform: Platform
  campaigns: typeof CAMPAIGNS_GOOGLE
  isGoogle: boolean
}) {
  const [sub, setSub] = useState<PlatSub>('relatorio')
  const label = isGoogle ? 'Google Ads' : 'Meta Ads'

  return (
    <div className="space-y-4">
      {/* Sub-tab switcher */}
      <div className="flex items-center gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white w-fit">
        <button onClick={() => setSub('relatorio')}
          className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-medium',
            sub === 'relatorio' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
          📊 Relatório
          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', sub === 'relatorio' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>
            AMOSTRA
          </span>
        </button>
        <button onClick={() => setSub('orcamento')}
          className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-medium',
            sub === 'orcamento' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
          💰 Orçamento
          <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', sub === 'orcamento' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700')}>
            REAL
          </span>
        </button>
      </div>

      {sub === 'relatorio' && (
        <div className="space-y-4">
          <MockBanner platform={label} />

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Impressões',  value: '175.235', icon: Eye,               color: 'text-amber-600',   data: MONTHLY_DATA.map(d=>({name:d.mes,value:d.impressoes})) },
              { label: 'Cliques',     value: '21.138',  icon: MousePointerClick, color: 'text-blue-600',    data: MONTHLY_DATA.map(d=>({name:d.mes,value:d.cliques})) },
              { label: 'Conversões',  value: '7.125',   icon: Target,            color: 'text-emerald-600', data: MONTHLY_DATA.map(d=>({name:d.mes,value:d.conversoes})) },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <kpi.icon className={cn('h-4 w-4', kpi.color)} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{kpi.label}</p>
                </div>
                <p className="mb-2 text-3xl font-bold text-slate-900">{kpi.value}</p>
                <ResponsiveContainer width="100%" height={50}>
                  <AreaChart data={kpi.data}>
                    <defs><linearGradient id={`g${kpi.label}${platform}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} fill={`url(#g${kpi.label}${platform})`} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Despesa total',   value: 'R$ 2.085,00' },
              { label: 'CPC médio',       value: 'R$ 0,10'     },
              { label: 'Custo/conversão', value: 'R$ 0,29'     },
              { label: 'Taxa conversão',  value: isGoogle ? '6,90%' : '4,20%' },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{c.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  {['Campanha','Status','Cliques','Custo','Receita','ROI%','CPC','Vendas','CPS','Leads','CPL'].map(h => (
                    <th key={h} className="whitespace-nowrap px-3 py-3 text-left font-semibold text-slate-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {campaigns.map(c => (
                  <tr key={c.nome} className="hover:bg-slate-50/50">
                    <td className="max-w-[160px] truncate px-3 py-3 font-medium text-blue-600">{c.nome}</td>
                    <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-3 text-slate-700">{c.cliques.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-3 text-slate-700">{brl(c.custo)}</td>
                    <td className="px-3 py-3 text-slate-700">{brl(c.receita)}</td>
                    <td className="px-3 py-3 font-semibold text-emerald-600">{(c.roi/100).toFixed(2)}%</td>
                    <td className="px-3 py-3 text-slate-700">{brl(c.cpc)}</td>
                    <td className="px-3 py-3 text-slate-700">{c.vendas}</td>
                    <td className="px-3 py-3 text-slate-700">{brl(c.cps)}</td>
                    <td className="px-3 py-3 text-slate-700">{c.leads}</td>
                    <td className="px-3 py-3 text-slate-700">{brl(c.cpl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sub === 'orcamento' && <OrcamentoPanel platform={platform} />}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TOTAL = MONTHLY_DATA.at(-1)!
const PREV  = MONTHLY_DATA.at(-2)!

export default function MarketingPage() {
  const [tab, setTab]               = useState<Tab>('overview')
  const [dateRange, setDateRange]   = useState<DateRange>('30d')

  const totalCliques  = CAMPAIGNS_GOOGLE.reduce((s,c) => s+c.cliques, 0)
  const totalCusto    = CAMPAIGNS_GOOGLE.reduce((s,c) => s+c.custo, 0)
  const totalLeads    = CAMPAIGNS_GOOGLE.reduce((s,c) => s+c.leads, 0)
  const totalVendas   = CAMPAIGNS_GOOGLE.reduce((s,c) => s+c.vendas, 0)
  const totalReceita  = CAMPAIGNS_GOOGLE.reduce((s,c) => s+c.receita, 0)

  const TABS: [Tab, string][] = [
    ['overview',    'Visão Geral'],
    ['google',      'Google Ads'],
    ['meta',        'Meta Ads'],
    ['attribution', 'Atribuição'],
    ['calls',       'Ligações'],
    ['audit',       'Auditoria Local'],
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Marketing & Mídia</h1>
          <p className="mt-0.5 text-sm text-slate-500">Relatórios de campanha, orçamento mensal, atribuição, ligações e auditoria local.</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          {(['7d','30d','90d','ano'] as DateRange[]).map(r => (
            <button key={r} onClick={() => setDateRange(r)}
              className={cn('px-3 py-1.5 text-xs font-medium', dateRange === r ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
              {r === 'ano' ? '1 ano' : `Últ. ${r.replace('d',' dias')}`}
            </button>
          ))}
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

      {/* ── VISÃO GERAL ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              { label: 'Impressões',  value: kpiNum(TOTAL.impressoes),  icon: Eye,              color: 'text-slate-700',   ...delta(TOTAL.impressoes, PREV.impressoes)  },
              { label: 'Cliques',     value: kpiNum(TOTAL.cliques),     icon: MousePointerClick,color: 'text-blue-700',    ...delta(TOTAL.cliques, PREV.cliques)        },
              { label: 'Leads',       value: kpiNum(TOTAL.leads),       icon: Users,            color: 'text-violet-600',  ...delta(TOTAL.leads, PREV.leads)            },
              { label: 'Conversões',  value: kpiNum(TOTAL.conversoes),  icon: Target,           color: 'text-emerald-600', ...delta(TOTAL.conversoes, PREV.conversoes)  },
              { label: 'Investido',   value: brl(TOTAL.custo),          icon: TrendingUp,       color: 'text-orange-600',  ...delta(TOTAL.custo, PREV.custo)            },
            ].map(kpi => (
              <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-slate-500">{kpi.label}</p>
                  <kpi.icon className={cn('h-4 w-4', kpi.color)} />
                </div>
                <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
                <p className={cn('mt-1 flex items-center gap-1 text-[11px]', kpi.up ? 'text-emerald-600' : 'text-red-500')}>
                  <ArrowUpRight className={cn('h-3 w-3', !kpi.up && 'rotate-90')} />{kpi.pct}% vs mês ant.
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-800">Cliques — evolução mensal</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={MONTHLY_DATA}>
                  <defs><linearGradient id="ovClq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }} />
                  <Area type="monotone" dataKey="cliques" stroke="#3b82f6" strokeWidth={2} fill="url(#ovClq)" name="Cliques" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-slate-800">Leads gerados por mês</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={MONTHLY_DATA} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }} />
                  <Bar dataKey="leads" fill="#8b5cf6" radius={[4,4,0,0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: 'CPL médio',         value: `R$ ${(totalCusto/totalLeads).toFixed(2)}`              },
              { label: 'CPS médio',         value: `R$ ${(totalCusto/totalVendas).toFixed(2)}`             },
              { label: 'ROI total',         value: `${(((totalReceita-totalCusto)/totalCusto)*100).toFixed(0)}%` },
              { label: 'Taxa de conversão', value: `${((totalVendas/totalLeads)*100).toFixed(1)}%`         },
            ].map(c => (
              <div key={c.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">{c.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── GOOGLE ADS ──────────────────────────────────────────────────── */}
      {tab === 'google' && <PlatformTab platform="google" campaigns={CAMPAIGNS_GOOGLE} isGoogle />}

      {/* ── META ADS ────────────────────────────────────────────────────── */}
      {tab === 'meta' && <PlatformTab platform="meta" campaigns={CAMPAIGNS_META} isGoogle={false} />}

      {/* ── ATRIBUIÇÃO ──────────────────────────────────────────────────── */}
      {tab === 'attribution' && (
        <div className="space-y-5">
          <MockBanner platform="Google / Meta (UTM)" />
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Receita fechada', value: 'R$ 0,00', icon: TrendingUp, color: 'text-emerald-600' },
              { label: 'Ganhos',          value: '0',        icon: Target,     color: 'text-blue-600'   },
              { label: 'Total de leads',  value: '0',        icon: Users,      color: 'text-slate-700'  },
            ].map(kpi => (
              <div key={kpi.label} className="flex items-start gap-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="rounded-xl bg-slate-50 p-2.5"><kpi.icon className={cn('h-5 w-5', kpi.color)} /></div>
                <div><p className="text-xs text-slate-500">{kpi.label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{kpi.value}</p></div>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Eventos de sessão</p>
              <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Exportar</button>
            </div>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>{['Tipo','Fonte','Contato','Campanha','Meio UTM','Fonte UTM','Criado em'].map(h => <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ATTRIBUTION_EVENTS.map((e,i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{e.tipo}</td>
                    <td className="px-3 py-2.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{e.fonte}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-700">{e.contato}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{e.campanha}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.utm_meio}</td>
                    <td className="px-3 py-2.5 text-slate-500">{e.utm_fonte}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-400">{e.criado}</td>
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
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-800">Ligação por status</p>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={CALLS_DATA} cx={75} cy={75} innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value">
                      {CALLS_DATA.map((entry,i) => <Cell key={i} fill={entry.color}/>)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize:11, borderRadius:8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {CALLS_DATA.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }}/>
                      <span className="flex-1 text-xs text-slate-600">{d.name}</span>
                      <span className="text-xs font-semibold text-slate-800">{d.value}</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-slate-400">Duração média: 3m 12s · Total: 1h 52m</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-slate-800">Principais fontes</p>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-100">{['Fonte','Total','Ganhos','Duração'].map(h => <th key={h} className="pb-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {TOP_SOURCES.map(s => (
                    <tr key={s.fonte}><td className="py-2 font-medium text-slate-700">{s.fonte}</td><td className="py-2 text-slate-700">{s.ligacoes}</td><td className="py-2 font-semibold text-emerald-600">{s.ganhos}</td><td className="py-2 text-slate-500">{s.duracao}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3"><p className="text-sm font-semibold text-slate-800">Todas as ligações</p></div>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>{['Data e hora','Contato','Número','Fonte','Status','Duração'].map(h => <th key={h} className="whitespace-nowrap px-4 py-2.5 text-left font-semibold text-slate-500">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {CALL_LOG.map((c,i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-400">{c.data}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{c.contato}</td>
                    <td className="px-4 py-2.5 text-slate-600">{c.numero}</td>
                    <td className="px-4 py-2.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{c.fonte}</span></td>
                    <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', c.status==='Atendida'?'bg-emerald-50 text-emerald-700':c.status==='Perdida'?'bg-red-50 text-red-700':'bg-amber-50 text-amber-700')}>{c.status}</span></td>
                    <td className="px-4 py-2.5 text-slate-600">{c.duracao}</td>
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
            <div><h2 className="text-base font-semibold text-slate-800">Auditoria de Marketing Local</h2><p className="text-sm text-slate-500 mt-0.5">Desempenho do site, SEO local e posições de busca.</p></div>
            <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Gerar relatório</button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Desempenho do site', score: 81, color: '#22c55e', sub: 'Core Web Vitals · mobile' },
              { label: 'SEO local',          score: 68, color: '#3b82f6', sub: 'Google Business Profile' },
              { label: 'Saúde do GBP',       score: 54, color: '#f59e0b', sub: 'Google Business Profile' },
            ].map(c => (
              <div key={c.label} className="flex flex-col items-center rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="relative mb-3 flex h-24 w-24 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3"/>
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={c.color} strokeWidth="3" strokeDasharray={`${c.score} 100`} strokeLinecap="round"/>
                  </svg>
                  <span className="absolute text-2xl font-bold text-slate-900">{c.score}%</span>
                </div>
                <p className="text-sm font-semibold text-slate-700">{c.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4"><Search className="h-4 w-4 text-blue-600"/><p className="text-sm font-semibold text-slate-800">Posições de busca local</p></div>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-100">{['Termo','Posição','Var.','Volume'].map(h=><th key={h} className="pb-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {AUDIT_POSITIONS.map(p => (
                    <tr key={p.termo} className="hover:bg-slate-50/50">
                      <td className="py-2 text-slate-700">{p.termo}</td>
                      <td className="py-2 font-bold text-blue-600">#{p.pos}</td>
                      <td className="py-2"><span className={cn('font-semibold', p.delta.startsWith('+') ? 'text-emerald-600' : p.delta.startsWith('-') ? 'text-red-500' : 'text-slate-400')}>{p.delta!=='0'?p.delta:'—'}</span></td>
                      <td className="py-2 text-slate-500">{p.vol}/mês</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4"><MapPin className="h-4 w-4 text-emerald-600"/><p className="text-sm font-semibold text-slate-800">Cobertura local — mapa de calor</p></div>
              <div className="grid grid-cols-6 gap-1 mb-3">
                {[9,7,5,4,6,3,8,6,4,3,5,2,7,9,6,5,7,4,5,7,8,6,4,3,4,5,3,2,4,3,3,4,2,1,3,2].map((v,i) => {
                  const cls = ['bg-slate-100','bg-emerald-100','bg-emerald-200','bg-emerald-300','bg-emerald-400','bg-emerald-500','bg-emerald-600','bg-emerald-700','bg-emerald-800','bg-emerald-900']
                  return <div key={i} className={cn('h-8 rounded', cls[v])} />
                })}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                {[['bg-emerald-900','Top 3'],['bg-emerald-500','Top 10'],['bg-emerald-200','Top 20'],['bg-slate-100','Fora']].map(([c,l]) => (
                  <div key={l} className="flex items-center gap-1"><div className={cn('h-2 w-2 rounded', c)}/>{l}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
