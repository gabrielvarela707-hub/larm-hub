'use client'

import type { ElementType } from 'react'
import { TrendingUp, TrendingDown, Home, Users, DollarSign, AlertCircle } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { mockKPIs, mockLeads, mockParcelas } from '@/lib/mock-data'
import { RevenueChart, LotAvailabilityChart, LeadsBySourceChart } from '@/components/dashboard-charts'
import { useAuthStore } from '@/lib/auth-store'

function KpiCard({ label, value, change, icon: Icon, color, format = 'currency' }: {
  label: string; value: number; change: number; icon: ElementType; color: string; format?: 'currency' | 'number' | 'percent'
}) {
  const formatted = format === 'currency' ? formatCurrency(value) : format === 'percent' ? `${value.toFixed(1)}%` : value.toLocaleString('pt-BR')
  const positive = change >= 0
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className={cn('flex items-center gap-1 text-xs font-medium', positive ? 'text-emerald-600' : 'text-red-500')}>
          {positive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {Math.abs(change).toFixed(1)}%
        </span>
      </div>
      <p className="text-2xl font-semibold text-slate-900 leading-none mb-1.5">{formatted}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

export default function DashboardPageClient() {
  const user = useAuthStore(s => s.user)
  const firstName = user?.name?.trim()?.split(/\s+/)[0] || 'usuário'
  const kpis = mockKPIs
  const overdue = mockParcelas.filter(p => p.status === 'atrasada')
  const recentLeads = mockLeads.slice(0, 5)

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Bom dia, {firstName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Aqui está o resumo do seu negócio hoje.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse-dot" />
          Dados em tempo real
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Receita total (2024)" value={kpis.totalRevenue} change={kpis.revenueGrowth} icon={DollarSign} color="bg-blue-600" />
        <KpiCard label="Lotes vendidos" value={kpis.totalLotsSold} change={kpis.lotsSoldGrowth} icon={Home} color="bg-emerald-600" format="number" />
        <KpiCard label="Leads ativos" value={kpis.activeLeads} change={kpis.leadsGrowth} icon={Users} color="bg-violet-600" format="number" />
        <KpiCard label="Inadimplencia" value={kpis.defaultRate} change={kpis.defaultRateChange} icon={AlertCircle} color="bg-amber-500" format="percent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-100 p-5 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Receitas mensais</h2>
              <p className="text-xs text-slate-500 mt-0.5">Realizado vs previsto 2024</p>
            </div>
            <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2.5 py-1">
              +{kpis.revenueGrowth}% vs 2023
            </span>
          </div>
          <RevenueChart />
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900 mb-1">Disponibilidade de lotes</h2>
          <p className="text-xs text-slate-500 mb-4">Total: {kpis.totalLots} lotes</p>
          <LotAvailabilityChart />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Leads por origem</h2>
          <LeadsBySourceChart />
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">Leads recentes</h2>
            <a href="/crm" className="text-xs text-blue-600 hover:underline">Ver todos</a>
          </div>
          <div className="space-y-3">
            {recentLeads.map(lead => (
              <div key={lead.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-700 text-[10px] font-semibold">
                    {lead.name.split(' ').slice(0, 2).map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{lead.name}</p>
                  <p className="text-[11px] text-slate-500">{lead.source}</p>
                </div>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium',
                  lead.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
                  lead.score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                )}>{lead.score}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Resumo financeiro</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">A receber este mes</p>
                <p className="text-lg font-semibold text-slate-900">{formatCurrency(kpis.monthlyReceivable)}</p>
              </div>
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-blue-600" />
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Em atraso</p>
                <p className="text-lg font-semibold text-red-600">{formatCurrency(kpis.overdueReceivable)}</p>
              </div>
              <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-red-500" />
              </div>
            </div>
            {overdue.length > 0 && (
              <>
                <div className="h-px bg-slate-100" />
                <div>
                  <p className="text-xs text-slate-500 mb-2">Parcelas vencidas</p>
                  {overdue.slice(0, 2).map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs py-1">
                      <span className="text-slate-700 truncate max-w-[120px]">{p.buyerName}</span>
                      <span className="text-red-600 font-medium">{formatCurrency(p.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
