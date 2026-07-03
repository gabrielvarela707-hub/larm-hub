'use client'

import { useState, useMemo } from 'react'
import { RefreshCw, Plus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

interface Campaign {
  id: string
  name: string
  dailyBudget: number
  active: boolean
  platform: 'meta' | 'google'
}

interface DayRecord {
  day: number
  estimated: number
  realized: number
  deposit: number
}

interface Deposit {
  id: string
  date: string
  value: number
  method: string
  platform: 'meta' | 'google'
}

const MOCK_CAMPAIGNS_META: Campaign[] = [
  { id: 'c1', name: 'Post Instagram: Cada chave representa um sonho', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c2', name: 'Post: Cada sino tocado eh mais do que uma comemoracao', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c3', name: 'Guarulhos — Pinda | Conversao', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c4', name: 'Santa Clara Reconhecimento — Posts', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c5', name: 'Santa Clara Engajamento — Videos', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c6', name: 'PROMOCAO DE ABRIL — Facebook', dailyBudget: 25, active: true, platform: 'meta' },
]

const MOCK_CAMPAIGNS_GOOGLE: Campaign[] = [
  { id: 'g1', name: 'Search — Lotes Goiania', dailyBudget: 40, active: true, platform: 'google' },
  { id: 'g2', name: 'Display — Portal do Lago', dailyBudget: 30, active: true, platform: 'google' },
  { id: 'g3', name: 'YouTube — Depoimentos', dailyBudget: 25, active: false, platform: 'google' },
]

const MOCK_DEPOSITS_META: Deposit[] = [
  { id: 'd1', date: '2026-04-01', value: 4000, method: 'PIX', platform: 'meta' },
]

const MOCK_DEPOSITS_GOOGLE: Deposit[] = [
  { id: 'd2', date: '2026-04-01', value: 2000, method: 'PIX', platform: 'google' },
  { id: 'd3', date: '2026-04-10', value: 1500, method: 'Cartao', platform: 'google' },
]

const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
const MONTH_NAMES = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const RATES = [0, 0, 0.84, 1.01, 1.43, 0.85, 1.06, 0.95, 0.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

function generateMonthDays(year: number, month: number, campaigns: Campaign[], deposits: Deposit[]): DayRecord[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dailyEstimated = campaigns.filter(c => c.active).reduce((sum, c) => sum + c.dailyBudget, 0)
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const rate = RATES[i] ?? 0
    const dayDeposits = deposits.filter(d => {
      const dd = new Date(d.date)
      return dd.getDate() === day && dd.getMonth() === month && dd.getFullYear() === year
    })
    return {
      day,
      estimated: dailyEstimated,
      realized: Math.round(dailyEstimated * rate * 100) / 100,
      deposit: dayDeposits.reduce((s, d) => s + d.value, 0),
    }
  })
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={cn('text-xl font-semibold leading-tight', color)}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function DayCard({ record, year, month }: { record: DayRecord; year: number; month: number }) {
  const date = new Date(year, month, record.day)
  const dow = DAYS_OF_WEEK[date.getDay()]
  const hasData = record.realized > 0 || record.deposit > 0
  const diff = record.realized - record.estimated
  const isOver = diff > 0

  return (
    <div className={cn('bg-white border rounded-xl p-3 text-xs transition-all',
      hasData ? 'border-slate-200 shadow-card' : 'border-slate-100',
      record.deposit > 0 && 'ring-1 ring-blue-200'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-semibold text-slate-800 text-sm">{record.day} dia</span>
          <p className="text-slate-400 text-[10px] leading-none mt-0.5">{dow}</p>
        </div>
        {hasData && record.realized > 0 && (
          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
            isOver ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
          )}>
            {isOver ? 'acima' : 'abaixo'}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Estimado</span>
          <span className="font-medium text-slate-700">{formatCurrency(record.estimated)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Realizado</span>
          <span className={cn('font-medium', record.realized > 0 ? (isOver ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400')}>
            {formatCurrency(record.realized)}
          </span>
        </div>
        <div className="flex justify-between border-t border-slate-50 pt-1">
          <span className="text-slate-500">Deposito</span>
          <span className={cn('font-medium', record.deposit > 0 ? 'text-blue-600' : 'text-slate-400')}>
            {formatCurrency(record.deposit)}
          </span>
        </div>
        {!hasData && <p className="text-center text-[10px] text-slate-300 pt-0.5">Sem lancamentos</p>}
      </div>
    </div>
  )
}

export default function ControladoriaPage() {
  const now = new Date()
  const [platform, setPlatform] = useState<'meta' | 'google'>('meta')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [showModal, setShowModal] = useState(false)

  const campaigns = platform === 'meta' ? MOCK_CAMPAIGNS_META : MOCK_CAMPAIGNS_GOOGLE
  const deposits = platform === 'meta' ? MOCK_DEPOSITS_META : MOCK_DEPOSITS_GOOGLE
  const days = useMemo(() => generateMonthDays(year, month, campaigns, deposits), [year, month, campaigns, deposits])

  const totalEstimated = days.reduce((s, d) => s + d.estimated, 0)
  const totalRealized = days.reduce((s, d) => s + d.realized, 0)
  const totalDeposits = deposits.reduce((s, d) => s + d.value, 0)
  const balance = totalDeposits - totalRealized
  const activeCampaigns = campaigns.filter(c => c.active).length
  const dailyBudgetTotal = campaigns.filter(c => c.active).reduce((s, c) => s + c.dailyBudget, 0)

  function changeMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
  }

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Controladoria</h1>
          <p className="text-sm text-slate-500 mt-0.5">Painel mensal de campanhas, valores realizados e depositos.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => changeMonth(-1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50 text-sm">&#8249;</button>
            <span className="px-3 py-2 text-sm font-medium text-slate-700 border-x border-slate-200">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={() => changeMonth(1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50 text-sm">&#8250;</button>
          </div>
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        {(['meta', 'google'] as const).map(p => (
          <button key={p} onClick={() => setPlatform(p)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              platform === p
                ? p === 'meta' ? 'bg-blue-600 text-white border-blue-600' : 'bg-red-500 text-white border-red-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {p === 'meta' ? 'Meta Ads' : 'Google Ads'}
          </button>
        ))}
        <button onClick={() => setShowModal(true)}
          className="ml-auto flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" /> Registrar deposito
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Mes" value={`${MONTH_NAMES[month]} ${year}`} color="text-slate-900" />
        <SummaryCard label="Estimado" value={formatCurrency(totalEstimated)} color="text-slate-900" />
        <SummaryCard label="Realizado" value={formatCurrency(totalRealized)}
          sub={`${totalEstimated > 0 ? ((totalRealized / totalEstimated) * 100).toFixed(0) : 0}% do estimado`}
          color={totalRealized <= totalEstimated ? 'text-emerald-600' : 'text-red-600'} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
          <p className="text-xs text-slate-500 mb-0.5">Depositos</p>
          <p className="text-xl font-semibold text-slate-900">{formatCurrency(totalDeposits)}</p>
          <div className="mt-2 space-y-0.5">
            {deposits.map(d => (
              <p key={d.id} className="text-[11px] text-slate-400">{d.method} — {formatCurrency(d.value)}</p>
            ))}
          </div>
        </div>
        <SummaryCard label="Saldo do mes" value={formatCurrency(balance)}
          sub={balance >= 0 ? 'Saldo positivo' : 'Saldo insuficiente'}
          color={balance >= 0 ? 'text-emerald-600' : 'text-red-600'} />
        <SummaryCard label="Campanhas ativas" value={String(activeCampaigns)}
          sub={`R$ ${dailyBudgetTotal}/dia estimado`} color="text-blue-600" />
      </div>

      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Campanhas ativas do mes</h2>
        </div>
        <div className="space-y-2">
          {campaigns.filter(c => c.active).map(c => (
            <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
              <span className="text-sm text-slate-700 flex-1 truncate">• {c.name}</span>
              <span className="text-sm font-medium text-slate-900 flex-shrink-0">R$ {c.dailyBudget.toFixed(2).replace('.', ',')}/dia</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Lancamentos diarios — {MONTH_NAMES[month]} {year}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {days.map(record => (
            <DayCard key={record.day} record={record} year={year} month={month} />
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-4">Registrar deposito</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Plataforma</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option>Meta Ads</option>
                  <option>Google Ads</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Data</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Valor (R$)</label>
                <input type="number" placeholder="0,00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Forma</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option>PIX</option>
                  <option>Cartao de credito</option>
                  <option>TED</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
