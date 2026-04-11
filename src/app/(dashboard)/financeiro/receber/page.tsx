'use client'

import type { ElementType } from 'react'
import { useState } from 'react'
import { Search, Download, AlertCircle, CheckCircle, Clock, DollarSign } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { mockParcelas, mockKPIs } from '@/lib/mock-data'
import type { ParcelaStatus } from '@/types'

const STATUS_CONFIG: Record<ParcelaStatus, { label: string; color: string; icon: ElementType }> = {
  aberta:    { label: 'Em aberto',  color: 'bg-blue-100 text-blue-700',       icon: Clock },
  paga:      { label: 'Paga',       color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  atrasada:  { label: 'Atrasada',   color: 'bg-red-100 text-red-700',         icon: AlertCircle },
  cancelada: { label: 'Cancelada',  color: 'bg-slate-100 text-slate-600',     icon: AlertCircle },
}

export default function ContasReceberPage() {
  const [filter, setFilter] = useState<ParcelaStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const filtered = mockParcelas.filter(p => {
    if (filter !== 'all' && p.status !== filter) return false
    if (search && !p.buyerName.toLowerCase().includes(search.toLowerCase()) && !p.contratoNumber.includes(search)) return false
    return true
  })

  const kpis = mockKPIs

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contas a Receber</h1>
          <p className="text-sm text-slate-500 mt-0.5">Parcelas e recebimentos dos contratos</p>
        </div>
        <button className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> Exportar
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'A receber este mes', value: kpis.monthlyReceivable, color: 'text-slate-900', bg: 'bg-blue-50', icon: DollarSign },
          { label: 'Em atraso', value: kpis.overdueReceivable, color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle },
          { label: 'Recebido (mes)', value: kpis.monthlyReceivable - kpis.overdueReceivable, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
          { label: 'Inadimplencia', value: kpis.defaultRate, color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', k.bg)}>
              <k.icon className={cn('w-4 h-4', k.color)} />
            </div>
            <p className={cn('text-lg font-semibold', k.color)}>
              {k.label === 'Inadimplencia' ? `${k.value}%` : formatCurrency(k.value)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente ou contrato..." className="text-sm outline-none w-48 placeholder:text-slate-400" />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'aberta', 'atrasada', 'paga'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                filter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              {s === 'all' ? 'Todas' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Cliente</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Contrato</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Parcela</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Vencimento</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Valor</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(p => {
              const cfg = STATUS_CONFIG[p.status]
              return (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{p.buyerName}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{p.contratoNumber}</td>
                  <td className="px-4 py-3 text-slate-600">{p.number}/{p.totalInstallments}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(p.dueDate)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(p.value + p.penalty + p.interest)}
                    {(p.penalty > 0 || p.interest > 0) && (
                      <p className="text-[10px] text-red-500 font-normal">+multa/juros</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {p.boletoUrl && <a href={p.boletoUrl} className="text-xs text-blue-600 hover:underline">Boleto</a>}
                      {p.status !== 'paga' && <button className="text-xs text-emerald-600 hover:underline">Baixar</button>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">Nenhuma parcela encontrada</div>
        )}
      </div>
    </div>
  )
}
