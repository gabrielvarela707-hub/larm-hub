'use client'

import { useState, useMemo } from 'react'
import {
  Plus, Upload, Search, Filter, MoreHorizontal,
  Phone, Mail, MessageCircle, Calendar, Star,
  TrendingUp, Users, CheckCircle, Clock,
  Download, X, ChevronDown, FileSpreadsheet,
} from 'lucide-react'
import { cn, formatDate } from '@/lib/utils'
import * as XLSX from 'xlsx'

type LeadStatus =
  | 'novo' | 'contato_realizado' | 'qualificado'
  | 'visita_agendada' | 'proposta_enviada' | 'negociacao'
  | 'fechado_ganho' | 'fechado_perdido'

type LeadSource = 'instagram' | 'facebook' | 'whatsapp' | 'site' | 'indicacao' | 'portal' | 'outros'

interface Lead {
  id: string
  nome: string
  telefone: string
  email?: string
  status: LeadStatus
  fonte: LeadSource
  detalhamento: string
  respondeu?: string
  interesse?: string
  visita?: string
  score: number
  criadoEm: string
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  novo:              { label: 'Novo',             color: 'text-slate-600',   bg: 'bg-slate-100' },
  contato_realizado: { label: 'Contato feito',    color: 'text-blue-700',    bg: 'bg-blue-100' },
  qualificado:       { label: 'Qualificado',      color: 'text-violet-700',  bg: 'bg-violet-100' },
  visita_agendada:   { label: 'Visita agendada',  color: 'text-amber-700',   bg: 'bg-amber-100' },
  proposta_enviada:  { label: 'Proposta enviada', color: 'text-orange-700',  bg: 'bg-orange-100' },
  negociacao:        { label: 'Negociacao',       color: 'text-indigo-700',  bg: 'bg-indigo-100' },
  fechado_ganho:     { label: 'Fechado',          color: 'text-emerald-700', bg: 'bg-emerald-100' },
  fechado_perdido:   { label: 'Perdido',          color: 'text-red-700',     bg: 'bg-red-100' },
}

const SOURCE_LABELS: Record<LeadSource, string> = {
  instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
  site: 'Site', indicacao: 'Indicacao', portal: 'Portal', outros: 'Outros',
}

const FUNNEL: LeadStatus[] = [
  'novo', 'contato_realizado', 'qualificado', 'visita_agendada',
  'proposta_enviada', 'negociacao', 'fechado_ganho',
]

function mapStatus(row: Record<string, string>): LeadStatus {
  const conv = (row['CONVERTEU VENDA?'] || '').toUpperCase()
  const visi = (row['MARCOU VISITA?'] || '').toUpperCase()
  const inte = (row['TEM INTERESSE?'] || '').toUpperCase()
  const resp = (row['RESPONDEU PERGUNTA?'] || '').toUpperCase()
  if (conv.includes('SIM')) return 'fechado_ganho'
  if (visi.includes('SIM')) return 'visita_agendada'
  if (inte.includes('SIM')) return 'qualificado'
  if (resp.includes('SIM')) return 'contato_realizado'
  return 'novo'
}

function mapSource(s: string): LeadSource {
  const u = s.toUpperCase()
  if (u.includes('INSTAGRAM') || u.includes('INSTA')) return 'instagram'
  if (u.includes('FACEBOOK') || u.includes('META') || u.includes('FB')) return 'facebook'
  if (u.includes('WHATSAPP') || u.includes('ZAPP')) return 'whatsapp'
  if (u.includes('REGIÃO') || u.includes('PINDA') || u.includes('MORA')) return 'indicacao'
  if (u.includes('SITE') || u.includes('GOOGLE')) return 'site'
  if (u.includes('PORTAL') || u.includes('VIVAREAL') || u.includes('ZAP')) return 'portal'
  return 'outros'
}

function parseExcel(buffer: ArrayBuffer): Lead[] {
  const wb   = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

  const leads: Lead[] = []
  let headerRow = -1

  // Find header row
  for (let i = 0; i < rows.length; i++) {
    const vals = Object.values(rows[i]).map(v => String(v).toUpperCase())
    if (vals.some(v => v.includes('NOME') || v.includes('TELEFONE'))) {
      headerRow = i
      break
    }
  }

  // Re-parse with detected header
  const wsJson = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
    defval: '',
    range: headerRow >= 0 ? headerRow : 0,
  })

  wsJson.forEach((row, idx) => {
    const nome = String(row['NOME'] || row['Nome'] || '').trim()
    const tel  = String(row['TELEFONE'] || row['Telefone'] || '').trim()
    if (!nome || nome.toUpperCase() === 'NOME') return
    leads.push({
      id: `import_${Date.now()}_${idx}`,
      nome,
      telefone: tel,
      email: '',
      status: mapStatus(row),
      fonte: mapSource(String(row['COMO SOUBE/DE ONDE VEIO'] || row['FONTE'] || '')),
      detalhamento: String(row['DETALHAMENTO'] || row['Detalhamento'] || '').trim(),
      respondeu: String(row['RESPONDEU PERGUNTA?'] || ''),
      interesse: String(row['TEM INTERESSE?'] || ''),
      visita: String(row['MARCOU VISITA?'] || ''),
      score: Math.floor(Math.random() * 40) + 50,
      criadoEm: new Date().toISOString(),
    })
  })
  return leads
}

// ── Import Modal ──────────────────────────────────────────────────────────────

function ImportModal({ onImport, onClose }: {
  onImport: (leads: Lead[]) => void
  onClose: () => void
}) {
  const [preview, setPreview] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [fileName, setFileName] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setFileName(file.name)
    const buf = await file.arrayBuffer()
    const parsed = parseExcel(buf)
    setPreview(parsed)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-dialog"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Importar leads do Excel</h2>
            <p className="text-xs text-slate-500 mt-0.5">Colunas esperadas: NOME, TELEFONE, STATUS, FONTE, DETALHAMENTO</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Drop zone */}
          <label className={cn(
            'flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors',
            fileName ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
          )}>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            <FileSpreadsheet className={cn('w-10 h-10', fileName ? 'text-blue-600' : 'text-slate-400')} />
            {loading ? (
              <p className="text-sm text-blue-600">Lendo arquivo...</p>
            ) : fileName ? (
              <div className="text-center">
                <p className="text-sm font-medium text-blue-700">{fileName}</p>
                <p className="text-xs text-slate-500 mt-0.5">{preview.length} leads encontrados</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Clique para selecionar o arquivo</p>
                <p className="text-xs text-slate-500 mt-0.5">Excel (.xlsx, .xls) ou CSV</p>
              </div>
            )}
          </label>

          {/* Template download hint */}
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <Download className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              Use o mesmo formato da planilha: NOME, TELEFONE, RESPONDEU PERGUNTA?, TEM INTERESSE?, MARCOU VISITA?, CONVERTEU VENDA?, COMO SOUBE, DETALHAMENTO
            </p>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">{preview.length} leads para importar</p>
                <div className="flex gap-3 text-xs text-slate-500">
                  {Object.entries(
                    preview.reduce((a, l) => { a[l.status] = (a[l.status]||0)+1; return a }, {} as Record<string, number>)
                  ).map(([s, n]) => (
                    <span key={s} className={cn('px-2 py-0.5 rounded-full', STATUS_CONFIG[s as LeadStatus]?.bg, STATUS_CONFIG[s as LeadStatus]?.color)}>
                      {STATUS_CONFIG[s as LeadStatus]?.label}: {n}
                    </span>
                  ))}
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white border-b border-slate-100">
                    <tr>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Nome</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Telefone</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Status</th>
                      <th className="text-left px-3 py-2 text-slate-500 font-medium">Fonte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {preview.slice(0, 20).map(l => (
                      <tr key={l.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-900">{l.nome}</td>
                        <td className="px-3 py-2 text-slate-600">{l.telefone}</td>
                        <td className="px-3 py-2">
                          <span className={cn('px-2 py-0.5 rounded-full', STATUS_CONFIG[l.status]?.bg, STATUS_CONFIG[l.status]?.color)}>
                            {STATUS_CONFIG[l.status]?.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-500">{SOURCE_LABELS[l.fonte]}</td>
                      </tr>
                    ))}
                    {preview.length > 20 && (
                      <tr><td colSpan={4} className="px-3 py-2 text-center text-slate-400">+{preview.length - 20} leads nao exibidos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button
            onClick={() => { onImport(preview); onClose() }}
            disabled={preview.length === 0}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> Importar {preview.length > 0 ? `${preview.length} leads` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lead card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const cfg = STATUS_CONFIG[lead.status]
  return (
    <div onClick={onClick}
      className="bg-white border border-slate-100 rounded-xl p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer group mb-2">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-700 text-xs font-semibold">
              {lead.nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase()}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate">{lead.nome}</p>
        </div>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ml-1', cfg.bg, cfg.color)}>
          {cfg.label}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
        <Phone className="w-3 h-3" /> {lead.telefone}
      </p>
      {lead.detalhamento && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-2">{lead.detalhamento}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
          {SOURCE_LABELS[lead.fonte]}
        </span>
        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1 rounded hover:bg-green-100 text-slate-400 hover:text-green-600 transition-colors">
            <MessageCircle className="w-3.5 h-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors">
            <Phone className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const MOCK_LEADS: Lead[] = [
  { id: 'l1', nome: 'Marcos Eduardo Fernandes', telefone: '(62) 99123-4567', status: 'qualificado', fonte: 'instagram', detalhamento: 'Interessado em lotes maiores, quer construir em 2025', score: 88, criadoEm: '2026-04-01T09:00:00Z' },
  { id: 'l2', nome: 'Ana Paula Costa', telefone: '(12) 98765-4321', status: 'visita_agendada', fonte: 'facebook', detalhamento: 'Visita marcada para sabado 14h', score: 91, criadoEm: '2026-04-02T11:00:00Z' },
  { id: 'l3', nome: 'Roberto Carlos Machado', telefone: '(11) 99712-6635', status: 'contato_realizado', fonte: 'indicacao', detalhamento: 'Ligou, pediu informacoes sobre financiamento', score: 72, criadoEm: '2026-04-03T14:00:00Z' },
  { id: 'l4', nome: 'Fernanda Lima Cruz', telefone: '(12) 99182-7456', status: 'fechado_ganho', fonte: 'instagram', detalhamento: 'Fechou compra do Lote T-1', score: 95, criadoEm: '2026-02-11T00:00:00Z' },
]

export default function CRMPage() {
  const [leads, setLeads]             = useState<Lead[]>(MOCK_LEADS)
  const [showImport, setShowImport]   = useState(false)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all')
  const [view, setView]               = useState<'kanban' | 'list'>('kanban')

  function handleImport(imported: Lead[]) {
    setLeads(prev => {
      const existingPhones = new Set(prev.map(l => l.telefone.replace(/\D/g, '')))
      const newOnes = imported.filter(l => !existingPhones.has(l.telefone.replace(/\D/g, '')))
      return [...prev, ...newOnes]
    })
  }

  const filtered = useMemo(() => leads.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (search && !l.nome.toLowerCase().includes(search.toLowerCase()) &&
        !l.telefone.includes(search)) return false
    return true
  }), [leads, search, statusFilter])

  const byStatus = (s: LeadStatus) => filtered.filter(l => l.status === s)
  const totalLeads = leads.length
  const qualificados = leads.filter(l => ['qualificado','visita_agendada','proposta_enviada','negociacao'].includes(l.status)).length
  const fechados = leads.filter(l => l.status === 'fechado_ganho').length
  const conversao = totalLeads > 0 ? Math.round((fechados / totalLeads) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">CRM & Funil de Vendas</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalLeads} leads · {conversao}% conversao</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-700 font-medium transition-colors">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Importar Excel
          </button>
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo lead
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total de leads', value: totalLeads, color: 'text-slate-900', icon: Users },
          { label: 'Qualificados', value: qualificados, color: 'text-violet-600', icon: Star },
          { label: 'Fechados', value: fechados, color: 'text-emerald-600', icon: CheckCircle },
          { label: 'Conversao', value: `${conversao}%`, color: 'text-blue-600', icon: TrendingUp },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-slate-500">{k.label}</p>
              <k.icon className={cn('w-4 h-4', k.color)} />
            </div>
            <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + View toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lead..." className="text-sm outline-none w-44 placeholder:text-slate-400" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as LeadStatus | 'all')}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none">
          <option value="all">Todos os status</option>
          {FUNNEL.map(s => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label} ({leads.filter(l => l.status === s).length})</option>
          ))}
        </select>
        <div className="ml-auto flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {[['kanban', 'Kanban'], ['list', 'Lista']].map(([v, l]) => (
            <button key={v} onClick={() => setView(v as typeof view)}
              className={cn('px-3 py-2 text-xs font-medium transition-colors',
                view === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'
              )}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {FUNNEL.map(status => {
            const cols = byStatus(status)
            const cfg  = STATUS_CONFIG[status]
            return (
              <div key={status} className="flex-shrink-0 w-64">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-slate-400">{cols.length}</span>
                  </div>
                </div>
                <div className="min-h-[80px]">
                  {cols.map(lead => <LeadCard key={lead.id} lead={lead} onClick={() => {}} />)}
                  {cols.length === 0 && (
                    <div className="border-2 border-dashed border-slate-100 rounded-xl p-4 text-center text-xs text-slate-300">
                      Sem leads
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Telefone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Fonte</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Detalhamento</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(lead => {
                const cfg = STATUS_CONFIG[lead.status]
                return (
                  <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 text-[10px] font-semibold">
                            {lead.nome.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-slate-900">{lead.nome}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lead.telefone}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{SOURCE_LABELS[lead.fonte]}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate">{lead.detalhamento}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button className="p-1.5 rounded-lg hover:bg-green-100 text-slate-400 hover:text-green-600 transition-colors">
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors">
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">Nenhum lead encontrado</div>
          )}
        </div>
      )}

      {/* Meta Ads banner */}
      <div className="bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-100 rounded-xl p-4 flex items-center gap-4">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Integrar conversas do Meta Ads</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure a API do WhatsApp Business e Facebook Lead Ads para receber leads automaticamente e responder por dentro do sistema.
          </p>
        </div>
        <a href="/configuracoes" className="text-xs bg-blue-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex-shrink-0">
          Configurar
        </a>
      </div>

      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
    </div>
  )
}
