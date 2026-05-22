'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Bell, CheckCircle, Clock, Edit3,
  Filter, Flame, Loader2, Mail, MessageSquare,
  Phone, Plus, RefreshCw, Send, Settings, Star,
  TrendingUp, Users, X, Zap,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────

type Tab = 'conversas' | 'manual' | 'sla-stats' | 'sla-config'
type ConvFilter = 'all' | 'unread' | 'starred'
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente'
type TaskStatus = 'pendente' | 'concluida' | 'cancelada'

type Conversation = {
  lead_id: string
  lead_name: string
  lead_phone: string
  lead_email: string
  stage_name?: string
  stage_color?: string
  responsible_name?: string
  is_starred: boolean
  is_unread: boolean
  last_event_at?: string
  last_event_preview?: string
  event_count: number
  sla_first_response_met?: boolean | null
  sla_resolution_met?: boolean | null
}

type ConvEvent = {
  id: string
  source: 'history' | 'communication'
  action?: string
  channel?: string
  direction?: string
  body?: string
  note?: string
  from_stage_name?: string
  to_stage_name?: string
  user_name?: string
  created_at: string
}

type ManualTask = {
  id: string
  lead_id: string
  lead_name?: string
  lead_phone?: string
  stage_name?: string
  title: string
  description: string
  type: string
  due_at?: string | null
  priority: TaskPriority
  status: TaskStatus
  responsible_name?: string
}

type SlaConfig = {
  is_active: boolean
  first_response_minutes: number
  resolution_minutes: number
}

type SlaStats = {
  sla_active: boolean
  total_conversations: number
  unread_count: number
  starred_count: number
  sla_met: number
  sla_breached: number
  sla_met_pct: number
  avg_first_response_min: number
  active_7d: number
}

type CrmUser = { id: string; name: string }

// ─── Helpers ────────────────────────────────────────────────────────────────

function dateTimeLabel(value?: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000)
    return `${days}d atrás`
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function isPastDate(value?: string | null) {
  if (!value) return false
  return new Date(value).getTime() < Date.now()
}

function initials(name?: string) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  email:    { label: 'E-mail',   icon: '✉️',  color: 'text-violet-700' },
  sms:      { label: 'SMS',      icon: '💬',  color: 'text-blue-700'   },
  whatsapp: { label: 'WhatsApp', icon: '📱',  color: 'text-emerald-700'},
  ligacao:  { label: 'Ligação',  icon: '📞',  color: 'text-green-700'  },
  nota:     { label: 'Nota',     icon: '📋',  color: 'text-slate-600'  },
}

const PRIORITY_LABELS: Record<TaskPriority, { label: string; className: string }> = {
  baixa:   { label: 'Baixa',   className: 'bg-slate-50 text-slate-600 border-slate-100' },
  media:   { label: 'Média',   className: 'bg-blue-50 text-blue-700 border-blue-100'   },
  alta:    { label: 'Alta',    className: 'bg-amber-50 text-amber-700 border-amber-100'},
  urgente: { label: 'Urgente', className: 'bg-red-50 text-red-700 border-red-100'      },
}

const TASK_TYPE_ICON: Record<string, string> = {
  ligacao: '📞', sms: '💬', email: '✉️', visita: '🏠', geral: '📋', outro: '•',
}

function eventLabel(evt: ConvEvent) {
  if (evt.source === 'history') {
    if (evt.action === 'stage_change') return `Etapa: ${evt.from_stage_name || '?'} → ${evt.to_stage_name || '?'}`
    if (evt.action === 'created') return 'Lead criado'
    if (evt.action === 'updated') return 'Lead atualizado'
    return evt.action?.replace(/_manual$/, '')?.replace(/_/g, ' ') || 'Ação'
  }
  return CHANNEL_META[evt.channel || 'nota']?.label || evt.channel || '—'
}

function eventIcon(evt: ConvEvent) {
  if (evt.source === 'history') {
    if (evt.action === 'stage_change') return '↔️'
    if (evt.action === 'created') return '✨'
    return '📋'
  }
  return CHANNEL_META[evt.channel || 'nota']?.icon || '📋'
}

function minutesToLabel(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ConversasPage() {
  const [tab, setTab] = useState<Tab>('conversas')

  // Conversas tab
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [convFilter, setConvFilter] = useState<ConvFilter>('all')
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null)
  const [events, setEvents] = useState<ConvEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [newMsg, setNewMsg] = useState('')
  const [newChannel, setNewChannel] = useState('nota')
  const [sending, setSending] = useState(false)
  const [search, setSearch] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Manual actions tab
  const [manualTasks, setManualTasks] = useState<ManualTask[]>([])
  const [manualType, setManualType] = useState('all')
  const [manualStatus, setManualStatus] = useState('pendente')
  const [manualResponsible, setManualResponsible] = useState('all')
  const [manualLoading, setManualLoading] = useState(false)

  // SLA tabs
  const [slaConfig, setSlaConfig] = useState<SlaConfig>({ is_active: false, first_response_minutes: 60, resolution_minutes: 480 })
  const [slaStats, setSlaStats] = useState<SlaStats | null>(null)
  const [slaForm, setSlaForm] = useState({ first_response_minutes: '60', resolution_minutes: '480' })
  const [slaSaving, setSlaSaving] = useState(false)

  // Shared
  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiClient.get(`/crm/conversations?filter=${convFilter}`)
      setConversations((res.data as { data: Conversation[] }).data || [])
    } catch { /* ignore */ }
  }, [convFilter])

  const loadManualTasks = useCallback(async () => {
    setManualLoading(true)
    try {
      const params = new URLSearchParams({ status: manualStatus })
      if (manualType !== 'all') params.set('type', manualType)
      if (manualResponsible !== 'all') params.set('responsible_id', manualResponsible)
      const res = await apiClient.get(`/crm/manual-actions?${params}`)
      setManualTasks((res.data as { data: ManualTask[] }).data || [])
    } catch { /* ignore */ } finally { setManualLoading(false) }
  }, [manualType, manualStatus, manualResponsible])

  const loadSla = useCallback(async () => {
    try {
      const [cfgRes, statsRes, usersRes] = await Promise.all([
        apiClient.get('/crm/sla-config'),
        apiClient.get('/crm/sla-stats'),
        apiClient.get('/crm/users'),
      ])
      const cfg = (cfgRes.data as { data: SlaConfig }).data
      setSlaConfig(cfg)
      setSlaForm({ first_response_minutes: String(cfg.first_response_minutes), resolution_minutes: String(cfg.resolution_minutes) })
      setSlaStats((statsRes.data as { data: SlaStats }).data)
      setUsers((usersRes.data as { data: CrmUser[] }).data || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        const [convRes, usersRes, cfgRes, statsRes] = await Promise.all([
          apiClient.get(`/crm/conversations?filter=${convFilter}`),
          apiClient.get('/crm/users'),
          apiClient.get('/crm/sla-config'),
          apiClient.get('/crm/sla-stats'),
        ])
        setConversations((convRes.data as { data: Conversation[] }).data || [])
        setUsers((usersRes.data as { data: CrmUser[] }).data || [])
        const cfg = (cfgRes.data as { data: SlaConfig }).data
        setSlaConfig(cfg)
        setSlaForm({ first_response_minutes: String(cfg.first_response_minutes), resolution_minutes: String(cfg.resolution_minutes) })
        setSlaStats((statsRes.data as { data: SlaStats }).data)
      } catch (e: unknown) {
        setError((e as { message?: string }).message || 'Erro ao carregar')
      } finally { setLoading(false) }
    }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadConversations() }, [loadConversations])
  useEffect(() => { if (tab === 'manual') void loadManualTasks() }, [tab, loadManualTasks])

  async function openConversation(conv: Conversation) {
    setSelectedConv(conv)
    setEventsLoading(true)
    try {
      const res = await apiClient.get(`/crm/conversations/${conv.lead_id}/events`)
      setEvents((res.data as { data: ConvEvent[] }).data || [])
      setConversations(prev => prev.map(c => c.lead_id === conv.lead_id ? { ...c, is_unread: false } : c))
    } catch { /* ignore */ } finally {
      setEventsLoading(false)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selectedConv || sending) return
    setSending(true)
    try {
      await apiClient.post(`/crm/conversations/${selectedConv.lead_id}/events`, { channel: newChannel, body: newMsg.trim() })
      setNewMsg('')
      const res = await apiClient.get(`/crm/conversations/${selectedConv.lead_id}/events`)
      setEvents((res.data as { data: ConvEvent[] }).data || [])
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      void loadConversations()
    } catch { /* ignore */ } finally { setSending(false) }
  }

  async function toggleStar(conv: Conversation, e: React.MouseEvent) {
    e.stopPropagation()
    await apiClient.patch(`/crm/conversations/${conv.lead_id}`, { is_starred: !conv.is_starred }).catch(() => {})
    setConversations(prev => prev.map(c => c.lead_id === conv.lead_id ? { ...c, is_starred: !c.is_starred } : c))
  }

  async function saveSlaConfig(active: boolean) {
    setSlaSaving(true)
    try {
      const { data } = await apiClient.post('/crm/sla-config', {
        is_active: active,
        first_response_minutes: Number(slaForm.first_response_minutes) || 60,
        resolution_minutes: Number(slaForm.resolution_minutes) || 480,
      }) as { data: { data: SlaConfig } }
      setSlaConfig(data.data)
      const statsRes = await apiClient.get('/crm/sla-stats')
      setSlaStats((statsRes.data as { data: SlaStats }).data)
    } catch { /* ignore */ } finally { setSlaSaving(false) }
  }

  const filteredConvs = conversations.filter(c => {
    if (!search) return true
    return `${c.lead_name} ${c.lead_phone} ${c.lead_email}`.toLowerCase().includes(search.toLowerCase())
  })

  const unreadCount  = conversations.filter(c => c.is_unread).length
  const starredCount = conversations.filter(c => c.is_starred).length

  if (loading) return (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando conversas...
    </div>
  )

  if (error) return (
    <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
      <p className="font-semibold">Erro ao carregar.</p>
      <p className="mt-1">{error}</p>
      <p className="mt-2 text-xs">Certifique-se de que <strong>migrate_conversas.js</strong> foi executada.</p>
    </div>
  )

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Conversas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Inbox por lead, ações manuais e desempenho de SLA.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-0 overflow-hidden rounded-xl border border-slate-200 bg-white w-fit">
        {([
          ['conversas', 'Conversas', unreadCount],
          ['manual',    'Ações manuais', 0],
          ['sla-stats', 'Estatísticas', 0],
          ['sla-config','Configurações', 0],
        ] as [Tab, string, number][]).map(([key, label, badge]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors',
              tab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
            {label}
            {badge > 0 && (
              <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                tab === key ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700')}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: CONVERSAS ──────────────────────────────────────────────── */}
      {tab === 'conversas' && (
        <div className="flex gap-0 rounded-xl border border-slate-200 bg-white overflow-hidden" style={{ minHeight: 600 }}>
          {/* Left: list */}
          <div className="w-80 shrink-0 flex flex-col border-r border-slate-100">
            {/* Filter bar */}
            <div className="flex items-center border-b border-slate-100 px-3 py-2 gap-1">
              {([
                ['all',     'Todos'],
                ['unread',  `Não lidos${unreadCount > 0 ? ` (${unreadCount})` : ''}`],
                ['starred', `Marcados${starredCount > 0 ? ` (${starredCount})` : ''}`],
              ] as [ConvFilter, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setConvFilter(key)}
                  className={cn('rounded-lg px-2.5 py-1 text-xs font-medium',
                    convFilter === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100')}>
                  {label}
                </button>
              ))}
              <button onClick={loadConversations} className="ml-auto text-slate-400 hover:text-slate-600 p-1">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Search */}
            <div className="border-b border-slate-100 px-3 py-2">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar contato..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs outline-none focus:border-blue-400" />
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filteredConvs.map(conv => (
                <button key={conv.lead_id} onClick={() => openConversation(conv)}
                  className={cn(
                    'w-full flex items-start gap-2.5 px-3 py-3 text-left hover:bg-slate-50 transition-colors',
                    selectedConv?.lead_id === conv.lead_id && 'bg-blue-50/60',
                    conv.is_unread && 'border-l-2 border-blue-500'
                  )}>
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {initials(conv.lead_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className={cn('truncate text-sm', conv.is_unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
                        {conv.lead_name}
                      </p>
                      <span className="shrink-0 text-[10px] text-slate-400">{dateTimeLabel(conv.last_event_at)}</span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500 mt-0.5">
                      {conv.last_event_preview || conv.lead_phone || conv.lead_email || '—'}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {conv.stage_name && (
                        <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ borderColor: conv.stage_color || '#cbd5e1', color: conv.stage_color || '#94a3b8' }}>
                          {conv.stage_name}
                        </span>
                      )}
                      {conv.is_unread && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                    </div>
                  </div>
                  <button onClick={(e) => toggleStar(conv, e)} className="mt-1 shrink-0">
                    <Star className={cn('h-3.5 w-3.5', conv.is_starred ? 'fill-amber-400 text-amber-400' : 'text-slate-200 hover:text-amber-300')} />
                  </button>
                </button>
              ))}
              {!filteredConvs.length && (
                <div className="py-16 text-center">
                  <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">Nenhuma conversa encontrada</p>
                  <p className="mt-1 text-xs text-slate-300">Interações com leads aparecem aqui</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: thread */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {!selectedConv ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                  <MessageSquare className="h-7 w-7 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nenhuma conversa selecionada</p>
                <p className="text-xs text-slate-400 text-center">Selecione um contato da lista para ver o histórico completo de interações</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                    {initials(selectedConv.lead_name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedConv.lead_name}</p>
                    <p className="text-xs text-slate-500">{selectedConv.lead_phone || selectedConv.lead_email || '—'} {selectedConv.responsible_name ? `· ${selectedConv.responsible_name}` : ''}</p>
                  </div>
                  {selectedConv.stage_name && (
                    <span className="ml-auto rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={{ borderColor: selectedConv.stage_color || '#cbd5e1', color: selectedConv.stage_color || '#94a3b8' }}>
                      {selectedConv.stage_name}
                    </span>
                  )}
                </div>

                {/* Events */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                  {eventsLoading ? (
                    <div className="flex justify-center py-8 text-sm text-slate-400">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
                    </div>
                  ) : events.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">Nenhuma interação registrada ainda.</div>
                  ) : events.map(evt => {
                    const isSystem = evt.source === 'history' && ['created', 'stage_change', 'updated'].includes(evt.action || '')
                    if (isSystem) return (
                      <div key={evt.id} className="flex items-center gap-2 py-1">
                        <div className="h-px flex-1 bg-slate-100" />
                        <span className="text-[10px] text-slate-400 px-2">
                          {eventIcon(evt)} {eventLabel(evt)} · {dateTimeLabel(evt.created_at)}
                          {evt.user_name ? ` · ${evt.user_name}` : ''}
                        </span>
                        <div className="h-px flex-1 bg-slate-100" />
                      </div>
                    )
                    const isOutbound = evt.direction === 'outbound' || evt.source === 'history'
                    return (
                      <div key={evt.id} className={cn('flex gap-2.5', isOutbound ? 'flex-row-reverse' : 'flex-row')}>
                        <div className={cn('mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                          isOutbound ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600')}>
                          {initials(evt.user_name || (isOutbound ? 'EU' : selectedConv.lead_name))}
                        </div>
                        <div className={cn('max-w-[70%] rounded-2xl px-3.5 py-2.5 text-sm',
                          isOutbound ? 'rounded-tr-sm bg-blue-600 text-white' : 'rounded-tl-sm bg-slate-100 text-slate-800')}>
                          <p className="leading-relaxed">{evt.body || evt.note || '—'}</p>
                          <p className={cn('mt-1 text-[10px]', isOutbound ? 'text-blue-200' : 'text-slate-400')}>
                            {eventIcon(evt)} {eventLabel(evt)} · {dateTimeLabel(evt.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Compose */}
                <div className="border-t border-slate-100 px-4 py-3">
                  <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <select value={newChannel} onChange={e => setNewChannel(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none">
                      <option value="nota">📋 Nota</option>
                      <option value="ligacao">📞 Ligação</option>
                      <option value="whatsapp">📱 WhatsApp</option>
                      <option value="sms">💬 SMS</option>
                      <option value="email">✉️ E-mail</option>
                    </select>
                    <textarea value={newMsg} onChange={e => setNewMsg(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }}
                      placeholder="Registrar interação... (Enter para enviar)"
                      rows={2} className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400" />
                    <button onClick={() => void sendMessage()} disabled={!newMsg.trim() || sending}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                      {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: AÇÕES MANUAIS ────────────────────────────────────────────── */}
      {tab === 'manual' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {([['all','Todas'],['ligacao','📞 Ligações'],['sms','💬 SMS'],['visita','🏠 Visitas']] as [string, string][]).map(([t, l]) => (
                <button key={t} onClick={() => setManualType(t)}
                  className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium',
                    manualType === t ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                  {l}
                </button>
              ))}
            </div>
            <select value={manualStatus} onChange={e => setManualStatus(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none">
              <option value="pendente">Pendentes</option>
              <option value="concluida">Concluídas</option>
              <option value="cancelada">Canceladas</option>
            </select>
            <select value={manualResponsible} onChange={e => setManualResponsible(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none">
              <option value="all">Todos responsáveis</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button onClick={() => void loadManualTasks()}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>

          {manualLoading ? (
            <div className="flex justify-center py-12 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Contato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Tarefa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Responsável</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Vencimento</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Prioridade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {manualTasks.map(task => {
                    const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.media
                    const overdue  = task.status === 'pendente' && isPastDate(task.due_at)
                    return (
                      <tr key={task.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{task.lead_name || '—'}</p>
                          <p className="text-[11px] text-slate-400">{task.lead_phone || ''}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-base">{TASK_TYPE_ICON[task.type] || '📋'}</span>
                          <span className="ml-1 text-xs text-slate-600 capitalize">{task.type}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="truncate text-sm text-slate-800">{task.title}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{task.responsible_name || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs', overdue ? 'font-semibold text-red-600' : 'text-slate-600')}>
                            {task.due_at ? dateTimeLabel(task.due_at) : '—'}
                            {overdue && <span className="ml-1 rounded-full bg-red-50 px-1.5 text-[10px] font-bold text-red-700">Atrasada</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', priority.className)}>
                            {priority.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!manualTasks.length && (
                <div className="py-12 text-center">
                  <CheckCircle className="mx-auto mb-2 h-8 w-8 text-emerald-200" />
                  <p className="text-sm text-slate-400">Nenhuma ação manual pendente</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ESTATÍSTICAS SLA ─────────────────────────────────────────── */}
      {tab === 'sla-stats' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Visão geral de SLA</h2>
            <p className="text-sm text-slate-500">Monitore os tempos de resposta e a frequência com que SLAs são cumpridos.</p>
          </div>

          {!slaStats?.sla_active ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-20 gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white border border-slate-200">
                <Clock className="h-6 w-6 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700">Está meio vazio aqui.</p>
                <p className="mt-1 text-sm text-slate-500 max-w-xs">Ative as configurações de SLA para começar a monitorar os tempos de resposta.</p>
              </div>
              <button onClick={() => setTab('sla-config')}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
                Ativar configurações de SLA
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  { label: 'Total de conversas',   value: slaStats.total_conversations,   icon: MessageSquare, color: 'text-slate-700' },
                  { label: 'Ativas nos últimos 7d', value: slaStats.active_7d,             icon: TrendingUp,    color: 'text-blue-700'  },
                  { label: 'SLA cumprido',          value: `${slaStats.sla_met_pct}%`,     icon: CheckCircle,   color: 'text-emerald-600'},
                  { label: 'Tempo médio resposta',  value: minutesToLabel(slaStats.avg_first_response_min), icon: Clock, color: 'text-amber-600' },
                ].map(kpi => (
                  <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs text-slate-500">{kpi.label}</p>
                      <kpi.icon className={cn('h-4 w-4', kpi.color)} />
                    </div>
                    <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-white p-5">
                  <p className="mb-4 text-sm font-semibold text-slate-800">SLA de primeira resposta</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>Cumprido</span>
                        <span>{slaStats.sla_met} conversa(s)</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${slaStats.sla_met_pct}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-emerald-600">{slaStats.sla_met_pct}%</p>
                      <p className="text-xs text-slate-400">{slaStats.sla_breached} violado(s)</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-white p-5">
                  <p className="mb-4 text-sm font-semibold text-slate-800">Distribuição de status</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Não lidas',  value: slaStats.unread_count,  color: 'bg-blue-500'   },
                      { label: 'Marcadas',   value: slaStats.starred_count, color: 'bg-amber-400'  },
                      { label: 'SLA violado',value: slaStats.sla_breached,  color: 'bg-red-500'    },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className={cn('h-2 w-2 rounded-full', item.color)} />
                        <span className="flex-1 text-xs text-slate-600">{item.label}</span>
                        <span className="text-sm font-semibold text-slate-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: CONFIGURAÇÕES SLA ───────────────────────────────────────── */}
      {tab === 'sla-config' && (
        <div className="max-w-xl space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Configurações de SLA</h2>
            <p className="text-sm text-slate-500">Defina a rapidez com que sua equipe deve responder às mensagens.</p>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Configurações de SLA</p>
              <p className="text-xs text-slate-500 mt-0.5">Ativar monitoramento de tempo de resposta</p>
            </div>
            <button onClick={() => void saveSlaConfig(!slaConfig.is_active)} disabled={slaSaving}
              className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                slaConfig.is_active ? 'bg-blue-600' : 'bg-slate-200')}>
              <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                slaConfig.is_active ? 'translate-x-6' : 'translate-x-1')} />
            </button>
          </div>

          {!slaConfig.is_active ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-14 gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-slate-200">
                <Settings className="h-5 w-5 text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-700">Nenhum SLA foi definido</p>
                <p className="mt-1 text-sm text-slate-500">Ative o toggle acima e defina as metas de tempo.</p>
              </div>
              <button onClick={() => void saveSlaConfig(true)} disabled={slaSaving}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {slaSaving ? 'Salvando...' : 'Definir SLA'}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div>
                <label className="text-sm font-medium text-slate-700">Tempo de primeira resposta</label>
                <p className="text-xs text-slate-500 mt-0.5">Quanto tempo a equipe tem para responder um novo lead</p>
                <div className="mt-2 flex items-center gap-3">
                  <input type="number" min="1" value={slaForm.first_response_minutes}
                    onChange={e => setSlaForm(f => ({ ...f, first_response_minutes: e.target.value }))}
                    className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                  <span className="text-sm text-slate-500">minutos</span>
                  <span className="text-xs text-slate-400">= {minutesToLabel(Number(slaForm.first_response_minutes) || 60)}</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Tempo de resolução</label>
                <p className="text-xs text-slate-500 mt-0.5">Quanto tempo total para resolver a conversa</p>
                <div className="mt-2 flex items-center gap-3">
                  <input type="number" min="1" value={slaForm.resolution_minutes}
                    onChange={e => setSlaForm(f => ({ ...f, resolution_minutes: e.target.value }))}
                    className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                  <span className="text-sm text-slate-500">minutos</span>
                  <span className="text-xs text-slate-400">= {minutesToLabel(Number(slaForm.resolution_minutes) || 480)}</span>
                </div>
              </div>

              <div className="flex gap-3 border-t border-slate-100 pt-4">
                <button onClick={() => void saveSlaConfig(true)} disabled={slaSaving}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {slaSaving ? 'Salvando...' : 'Salvar configurações'}
                </button>
                <button onClick={() => void saveSlaConfig(false)} disabled={slaSaving}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Desativar SLA
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
