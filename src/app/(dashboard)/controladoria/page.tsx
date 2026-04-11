'use client'

import type { ElementType } from 'react'
import { useState, useMemo } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Megaphone, Calendar, Plus, Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
// ─── Types ───────────────────────────────────────────────────────────────────
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
interface Deposit {
  date: string
  value: number
  method: 'pix' | 'cartao' | 'ted'
  note: string
// ─── Mock Data ───────────────────────────────────────────────────────────────
const MOCK_CAMPAIGNS_META: Campaign[] = [
  { id: 'c1', name: 'Post do Instagram: Cada chave representa um sonho...', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c2', name: 'Post: "Cada sino tocado é mais do que uma comemoração —..."', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c3', name: 'Guarulhos — Pindá | Conversão', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c4', name: 'Santa Clara Reconhecimento — Posts', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c5', name: 'Santa Clara Engajamento — Vídeos', dailyBudget: 20, active: true, platform: 'meta' },
  { id: 'c6', name: 'PROMOÇÃO DE ABRIL — Facebook', dailyBudget: 25, active: true, platform: 'meta' },
]
const MOCK_CAMPAIGNS_GOOGLE: Campaign[] = [
  { id: 'g1', name: 'Search — Lotes Goiânia', dailyBudget: 40, active: true, platform: 'google' },
  { id: 'g2', name: 'Display — Portal do Lago', dailyBudget: 30, active: true, platform: 'google' },
  { id: 'g3', name: 'YouTube — Depoimentos', dailyBudget: 25, active: false, platform: 'google' },
const MOCK_DEPOSITS_META: Deposit[] = [
  { id: 'd1', date: '2026-04-01', value: 4000, method: 'pix', note: 'PIX', platform: 'meta' },
const MOCK_DEPOSITS_GOOGLE: Deposit[] = [
  { id: 'd2', date: '2026-04-01', value: 2000, method: 'pix', note: 'PIX', platform: 'google' },
  { id: 'd3', date: '2026-04-10', value: 1500, method: 'cartao', note: 'Cartão de crédito', platform: 'google' },
const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
function generateMonthDays(year: number, month: number, campaigns: Campaign[], deposits: Deposit[]): DayRecord[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dailyEstimated = campaigns.filter(c => c.active).reduce((sum, c) => sum + c.dailyBudget, 0)
  
  const realizationRates = [0, 0.84, 1.01, 1.43, 0.85, 1.06, 0.95, 0.89, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1
    const rate = realizationRates[i] ?? 0
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
// ─── Components ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string; sub?: string; color: string; icon: ElementType
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className={cn('text-xl font-semibold leading-tight', color)}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
function DayCard({ record, year, month }: { record: DayRecord; year: number; month: number }) {
  const date = new Date(year, month, record.day)
  const dow = DAYS_OF_WEEK[date.getDay()]
  const hasData = record.realized > 0 || record.deposit > 0
  const diff = record.realized - record.estimated
  const isOver = diff > 0
    <div className={cn(
      'bg-white border rounded-xl p-3 text-xs transition-all',
      hasData ? 'border-slate-200 shadow-card' : 'border-slate-100',
      record.deposit > 0 && 'ring-1 ring-blue-200'
    )}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-semibold text-slate-800 text-sm">{record.day}° dia</span>
          <p className="text-slate-400 text-[10px] leading-none mt-0.5">{dow}</p>
        </div>
        {hasData && record.realized > 0 && (
          <span className={cn(
            'text-[9px] font-semibold px-1.5 py-0.5 rounded-full',
            isOver ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
          )}>
            {isOver ? '▲' : '▼'} {Math.abs(diff).toFixed(2)}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Estimado</span>
          <span className="font-medium text-slate-700">{formatCurrency(record.estimated)}</span>
          <span className="text-slate-500">Realizado</span>
          <span className={cn('font-medium', record.realized > 0 ? (isOver ? 'text-red-600' : 'text-emerald-600') : 'text-slate-400')}>
            {formatCurrency(record.realized)}
        <div className="flex justify-between border-t border-slate-50 pt-1">
          <span className="text-slate-500">Depósito</span>
          <span className={cn('font-medium', record.deposit > 0 ? 'text-blue-600' : 'text-slate-400')}>
            {formatCurrency(record.deposit)}
        {!hasData && (
          <p className="text-center text-[10px] text-slate-300 pt-0.5">Sem lançamentos</p>
// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ControladoriaPage() {
  const now = new Date()
  const [platform, setPlatform] = useState<'meta' | 'google'>('meta')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [showDepositModal, setShowDepositModal] = useState(false)
  const campaigns = platform === 'meta' ? MOCK_CAMPAIGNS_META : MOCK_CAMPAIGNS_GOOGLE
  const deposits = platform === 'meta' ? MOCK_DEPOSITS_META : MOCK_DEPOSITS_GOOGLE
  const days = useMemo(() => generateMonthDays(year, month, campaigns, deposits), [year, month, campaigns, deposits])
  const totalEstimated = days.reduce((s, d) => s + d.estimated, 0)
  const totalRealized = days.reduce((s, d) => s + d.realized, 0)
  const totalDeposits = deposits.reduce((s, d) => s + d.value, 0)
  const balance = totalDeposits - totalRealized
  const activeCampaigns = campaigns.filter(c => c.active).length
  const dailyBudgetTotal = campaigns.filter(c => c.active).reduce((s, c) => s + c.dailyBudget, 0)
  const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const monthLabel = `${MONTH_NAMES[month]} de ${year}`
  function changeMonth(delta: number) {
    let m = month + delta
    let y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0) { m = 11; y-- }
    setMonth(m)
    setYear(y)
  }
    <div className="space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-slate-900">Controladoria</h1>
          <p className="text-sm text-slate-500 mt-0.5">Painel mensal de campanhas, valores realizados, depósitos e acompanhamento executivo.</p>
        <div className="flex items-center gap-2">
          {/* Month nav */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => changeMonth(-1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50 text-sm transition-colors">‹</button>
            <span className="px-3 py-2 text-sm font-medium text-slate-700 border-x border-slate-200">
              {MONTH_NAMES[month].toLowerCase()} de {year}
            </span>
            <button onClick={() => changeMonth(1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50 text-sm transition-colors">›</button>
          </div>
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Atualizar
          </button>
      {/* Platform tabs */}
      <div className="flex gap-2">
        {(['meta', 'google'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
              platform === p
                ? p === 'meta'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-red-500 text-white border-red-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {p === 'meta' ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15.93V17h-2v-2h2v-2.07C9.08 12.47 8 11.36 8 10c0-2.21 1.79-4 4-4s4 1.79 4 4c0 1.36-1.08 2.47-3 2.93V15h2v2h-2v.93C14.35 17.67 16 15.97 16 14h2c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6V2h2v5.07c1.92.46 3 1.57 3 2.93 0 2.21-1.79 4-4 4s-4-1.79-4-4H9c0 1.36 1.08 2.47 3 2.93V13h-2v-2h2v-2.07C10.65 8.67 9 10.03 9 12s1.35 3.33 3 3.93z"/></svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {p === 'meta' ? 'Meta Ads' : 'Google Ads'}
        ))}
        <button
          onClick={() => setShowDepositModal(true)}
          className="ml-auto flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Registrar depósito
        </button>
      {/* KPI cards row 1 */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Mês" value={monthLabel.replace(/^\w/, c => c.toUpperCase())} icon={Calendar} color="text-slate-900" />
        <SummaryCard label="Estimado" value={formatCurrency(totalEstimated)} icon={TrendingUp} color="text-slate-900" />
        <SummaryCard label="Realizado" value={formatCurrency(totalRealized)} sub={`${((totalRealized/totalEstimated)*100 || 0).toFixed(0)}% do estimado`} icon={TrendingDown} color={totalRealized <= totalEstimated ? 'text-emerald-600' : 'text-red-600'} />
      {/* KPI cards row 2 */}
        <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
          <p className="text-xs text-slate-500 mb-0.5">Depósitos</p>
          <p className="text-xl font-semibold text-slate-900">{formatCurrency(totalDeposits)}</p>
          <div className="mt-2 space-y-0.5">
            {deposits.map(d => (
              <p key={d.id} className="text-[11px] text-slate-400">
                {d.method.toUpperCase()} — {formatCurrency(d.value)}
              </p>
            ))}
        <SummaryCard
          label="Saldo do mês"
          value={formatCurrency(balance)}
          sub={balance >= 0 ? 'Saldo positivo' : 'Saldo insuficiente'}
          icon={DollarSign}
          color={balance >= 0 ? 'text-emerald-600' : 'text-red-600'}
        />
          label="Campanhas ativas"
          value={String(activeCampaigns)}
          sub={`R$ ${dailyBudgetTotal}/dia estimado`}
          icon={Megaphone}
          color="text-blue-600"
      {/* Active campaigns list */}
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Campanhas ativas do mês</h2>
          <button className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" /> Adicionar
        <div className="space-y-2">
          {campaigns.filter(c => c.active).map(c => (
            <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
              <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', c.active ? 'bg-emerald-500' : 'bg-slate-300')} />
              <span className="text-sm text-slate-700 flex-1 truncate">• {c.name}</span>
              <span className="text-sm font-medium text-slate-900 flex-shrink-0">
                R$ {c.dailyBudget.toFixed(2).replace('.', ',')}/dia
              </span>
            </div>
          ))}
      {/* Daily calendar grid */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          Lançamentos diários — {MONTH_NAMES[month]} {year}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {days.map(record => (
            <DayCard key={record.day} record={record} year={year} month={month} />
      {/* Deposit modal (simple inline) */}
      {showDepositModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowDepositModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-dialog" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-4">Registrar depósito</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Plataforma</label>
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option value="meta">Meta Ads</option>
                  <option value="google">Google Ads</option>
                </select>
              </div>
                <label className="block text-xs text-slate-600 mb-1">Data</label>
                <input type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <label className="block text-xs text-slate-600 mb-1">Valor (R$)</label>
                <input type="number" placeholder="0,00" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <label className="block text-xs text-slate-600 mb-1">Forma</label>
                  <option>PIX</option>
                  <option>Cartão de crédito</option>
                  <option>TED</option>
                <label className="block text-xs text-slate-600 mb-1">Observação</label>
                <input type="text" placeholder="Opcional" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowDepositModal(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => setShowDepositModal(false)} className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">Salvar</button>
      )}
