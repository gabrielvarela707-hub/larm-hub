'use client'

import { useState } from 'react'
import { Search, Plus, FileText, PenLine, Download, ExternalLink } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { mockContratos } from '@/lib/mock-data'
import type { ContratoStatus } from '@/types'

const STATUS_CONFIG: Record<ContratoStatus, { label: string; color: string }> = {
  rascunho:               { label: 'Rascunho',             color: 'bg-slate-100 text-slate-600' },
  aguardando_assinatura:  { label: 'Ag. assinatura',       color: 'bg-amber-100 text-amber-700' },
  assinado:               { label: 'Assinado',             color: 'bg-emerald-100 text-emerald-700' },
  distratado:             { label: 'Distratado',           color: 'bg-red-100 text-red-700' },
  quitado:                { label: 'Quitado',              color: 'bg-blue-100 text-blue-700' },
}

const FINANCING_LABELS = { price: 'Price', sac: 'SAC', sacoc: 'SACOC' }

export default function ContratosPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContratoStatus | 'all'>('all')

  const filtered = mockContratos.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search && !c.buyerName.toLowerCase().includes(search.toLowerCase()) && !c.number.includes(search)) return false
    return true
  })

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contratos</h1>
          <p className="text-sm text-slate-500 mt-0.5">{mockContratos.length} contratos · {mockContratos.filter(c => c.status === 'aguardando_assinatura').length} aguardando assinatura</p>
        </div>
        <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo contrato
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(['all', 'rascunho', 'aguardando_assinatura', 'assinado', 'quitado'] as const).map(s => {
          const count = s === 'all' ? mockContratos.length : mockContratos.filter(c => c.status === s).length
          const cfg = s !== 'all' ? STATUS_CONFIG[s] : null
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'bg-white border rounded-xl p-3 text-left shadow-card hover:shadow-card-hover transition-all',
                statusFilter === s ? 'border-blue-400 ring-1 ring-blue-400/30' : 'border-slate-100'
              )}
            >
              <p className="text-lg font-semibold text-slate-900">{count}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s === 'all' ? 'Todos' : cfg?.label}</p>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 max-w-sm">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente ou número..." className="text-sm outline-none flex-1 placeholder:text-slate-400" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">N°</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Comprador</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Empreendimento / Lote</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Financiamento</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Valor total</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Parcela</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(c => {
              const cfg = STATUS_CONFIG[c.status]
              return (
                <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{c.buyerName}</p>
                    <p className="text-xs text-slate-400">{c.buyerPhone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-800">{c.empreendimentoName}</p>
                    <p className="text-xs text-slate-400">{c.lotDescription}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{FINANCING_LABELS[c.financingType]}</span>
                    <p className="text-xs text-slate-400 mt-0.5">{c.installments}x</p>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(c.totalValue)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(c.installmentValue)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                      {cfg.label}
                    </span>
                    {c.signedAt && <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(c.signedAt)}</p>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {c.status === 'aguardando_assinatura' && (
                        <button className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg hover:bg-amber-100 transition-colors">
                          <PenLine className="w-3 h-3" /> Assinar
                        </button>
                      )}
                      {c.pdfUrl && (
                        <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
