'use client'

import { useState } from 'react'
import { Plus, Search, Filter, Phone, Mail, MessageCircle, MoreHorizontal, Star } from 'lucide-react'
import { cn, formatDate, relativeTime } from '@/lib/utils'
import { mockLeads } from '@/lib/mock-data'
import type { Lead, LeadStatus } from '@/types'

const COLUMNS: { id: LeadStatus; label: string; color: string }[] = [
  { id: 'novo',              label: 'Novo',              color: 'bg-slate-500' },
  { id: 'contato_realizado', label: 'Contato Realizado', color: 'bg-blue-500' },
  { id: 'qualificado',       label: 'Qualificado',       color: 'bg-violet-500' },
  { id: 'visita_agendada',   label: 'Visita Agendada',   color: 'bg-amber-500' },
  { id: 'proposta_enviada',  label: 'Proposta Enviada',  color: 'bg-orange-500' },
  { id: 'negociacao',        label: 'Negociação',        color: 'bg-pink-500' },
  { id: 'fechado_ganho',     label: 'Ganho',             color: 'bg-emerald-500' },
  { id: 'fechado_perdido',   label: 'Perdido',           color: 'bg-red-500' },
]

const SOURCE_ICONS: Record<string, string> = {
  instagram: '📸', facebook: '👤', site: '🌐',
  whatsapp: '💬', indicacao: '🤝', plantao: '🏠',
  portal: '🔍', outros: '➕',
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="bg-white rounded-lg border border-slate-100 p-3 shadow-sm hover:shadow-card-hover transition-shadow cursor-grab active:cursor-grabbing group">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 text-[10px] font-semibold">
              {lead.name.split(' ').slice(0,2).map(n => n[0]).join('')}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-900 truncate leading-tight">{lead.name}</p>
            <p className="text-[10px] text-slate-400 leading-tight">{SOURCE_ICONS[lead.source]} {lead.source}</p>
          </div>
        </div>
        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-100">
          <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>

      {lead.notes && (
        <p className="text-[11px] text-slate-500 mb-2 line-clamp-2 leading-relaxed">{lead.notes}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {lead.tags.slice(0,2).map(tag => (
            <span key={tag} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
        <span className={cn(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
          lead.score >= 80 ? 'bg-emerald-100 text-emerald-700' :
          lead.score >= 50 ? 'bg-amber-100 text-amber-700' :
          'bg-slate-100 text-slate-500'
        )}>
          {lead.score}
        </span>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
        <span className="text-[10px] text-slate-400">
          {lead.lastContactAt ? relativeTime(lead.lastContactAt) : 'Sem contato'}
        </span>
        <div className="flex gap-1.5">
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors">
            <Phone className="w-3 h-3" />
          </button>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-emerald-600 transition-colors">
            <MessageCircle className="w-3 h-3" />
          </button>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <Mail className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads)
  const [search, setSearch] = useState('')

  const filtered = leads.filter(l =>
    search === '' || l.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Funil de Vendas</h1>
          <p className="text-sm text-slate-500 mt-0.5">{leads.length} leads — {leads.filter(l => l.status === 'fechado_ganho').length} convertidos</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar lead..."
              className="text-sm outline-none w-40 placeholder:text-slate-400"
            />
          </div>
          <button className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter className="w-3.5 h-3.5" /> Filtros
          </button>
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus className="w-3.5 h-3.5" /> Novo lead
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
        {COLUMNS.map(col => {
          const colLeads = filtered.filter(l => l.status === col.id)
          return (
            <div key={col.id} className="flex-shrink-0 w-52">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', col.color)} />
                <span className="text-xs font-semibold text-slate-700 truncate">{col.label}</span>
                <span className="ml-auto text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                  {colLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 min-h-[80px]">
                {colLeads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}

                <button className="w-full flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 py-2 px-2 rounded-lg hover:bg-slate-100 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
