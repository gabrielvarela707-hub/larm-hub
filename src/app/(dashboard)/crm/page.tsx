'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle,
  CheckSquare,
  ClipboardList,
  Clock,
  Edit3,
  FileSpreadsheet,
  Filter,
  Flame,
  History,
  Loader2,
  MoreHorizontal,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

type Temperature = 'frio' | 'morno' | 'quente'

type ApiResponse<T> = {
  ok: boolean
  data: T
  message?: string
}

type FunnelStage = {
  id: string
  code: string
  name: string
  color: string
  position: number
  max_days: number
  default_responsible_id?: string | null
  is_won: boolean
  is_lost: boolean
  is_active: boolean
  lead_count?: number
  total_value?: number
}

type CrmUser = {
  id: string
  name: string
  email: string
  role: string
}

type LossReason = {
  id: string
  name: string
  position: number
  is_active: boolean
}

type Lead = {
  id: string
  stage_id: string | null
  stage_code?: string | null
  stage_name?: string | null
  stage_color?: string | null
  responsible_id?: string | null
  responsible_name?: string | null
  loss_reason_id?: string | null
  loss_reason_name?: string | null
  name: string
  phone: string
  email: string
  source: string
  campaign: string
  empreendimento: string
  estimated_value: number
  temperature: Temperature
  score: number
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
  last_interaction_at?: string | null
  next_follow_up_at?: string | null
  days_in_stage?: number
  open_tasks_count?: number
  overdue_tasks_count?: number
  next_task_due_at?: string | null
}

type LeadHistory = {
  id: string
  action: string
  user_name?: string | null
  from_stage_name?: string | null
  to_stage_name?: string | null
  note: string
  created_at: string
}

type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente'
type TaskStatus = 'pendente' | 'concluida' | 'cancelada'

type LeadTask = {
  id: string
  lead_id: string
  lead_name?: string
  title: string
  description: string
  due_at?: string | null
  priority: TaskPriority
  status: TaskStatus
  responsible_id?: string | null
  responsible_name?: string
  completed_at?: string | null
  created_at: string
  updated_at?: string
}

type CrmSummary = {
  tasks_today: number
  tasks_overdue: number
  tasks_due_soon: number
  leads_without_contact: number
  sla_overdue: number
  tasks: LeadTask[]
}

type AnalyticsMetric = {
  source?: string
  stage_name?: string
  responsible_name?: string
  campaign?: string
  loss_reason_name?: string
  temperature?: string
  total?: number
  total_leads?: number
  won?: number
  won_leads?: number
  lost?: number
  lost_leads?: number
  active_pipeline?: number
  hot_leads?: number
  warm_leads?: number
  cold_leads?: number
  pipeline_value?: number
  weighted_forecast?: number
  won_value?: number
  lost_value?: number
  total_value?: number
  avg_score?: number
  conversion_rate?: number
  loss_rate?: number
  sla_overdue?: number
  overdue_tasks?: number
  leads_with_overdue_tasks?: number
}

type CrmAnalytics = {
  totals: AnalyticsMetric
  by_stage: AnalyticsMetric[]
  by_source: AnalyticsMetric[]
  by_responsible: AnalyticsMetric[]
  by_campaign: AnalyticsMetric[]
  loss_reasons: AnalyticsMetric[]
  score_buckets: AnalyticsMetric[]
}

type AnalyticsColumn = {
  label: string
  className?: string
  render: (row: AnalyticsMetric) => ReactNode
}

type TaskForm = {
  title: string
  description: string
  due_at: string
  priority: TaskPriority
  responsible_id: string
}

type LeadForm = {
  id?: string
  stage_id: string
  responsible_id: string
  loss_reason_id: string
  name: string
  phone: string
  email: string
  source: string
  campaign: string
  empreendimento: string
  estimated_value: string
  temperature: Temperature
  score: string
  notes: string
  next_follow_up_at: string
  history_note: string
}

type StageForm = {
  id?: string
  code: string
  name: string
  color: string
  position: string
  max_days: string
  is_won: boolean
  is_lost: boolean
  is_active: boolean
}

type ImportedLead = {
  name: string
  phone: string
  email?: string
  source?: string
  campaign?: string
  notes?: string
  temperature?: Temperature
  score?: number
}

const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  site: 'Site',
  indicacao: 'Indicação',
  portal: 'Portal',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  outros: 'Outros',
}

const SOURCE_OPTIONS = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['whatsapp', 'WhatsApp'],
  ['site', 'Site'],
  ['indicacao', 'Indicação'],
  ['portal', 'Portal'],
  ['meta_ads', 'Meta Ads'],
  ['google_ads', 'Google Ads'],
  ['outros', 'Outros'],
] as const

const TEMP_LABELS: Record<Temperature, { label: string; className: string }> = {
  frio: { label: 'Frio', className: 'bg-sky-50 text-sky-700 border-sky-100' },
  morno: { label: 'Morno', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  quente: { label: 'Quente', className: 'bg-red-50 text-red-700 border-red-100' },
}

const PRIORITY_LABELS: Record<TaskPriority, { label: string; className: string }> = {
  baixa: { label: 'Baixa', className: 'bg-slate-50 text-slate-600 border-slate-100' },
  media: { label: 'Média', className: 'bg-blue-50 text-blue-700 border-blue-100' },
  alta: { label: 'Alta', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  urgente: { label: 'Urgente', className: 'bg-red-50 text-red-700 border-red-100' },
}

const EMPTY_TASK_FORM: TaskForm = {
  title: '',
  description: '',
  due_at: '',
  priority: 'media',
  responsible_id: '',
}

const EMPTY_LEAD_FORM: LeadForm = {
  stage_id: '',
  responsible_id: '',
  loss_reason_id: '',
  name: '',
  phone: '',
  email: '',
  source: 'outros',
  campaign: '',
  empreendimento: '',
  estimated_value: '',
  temperature: 'morno',
  score: '50',
  notes: '',
  next_follow_up_at: '',
  history_note: '',
}

const EMPTY_STAGE_FORM: StageForm = {
  code: '',
  name: '',
  color: '#2563EB',
  position: '0',
  max_days: '3',
  is_won: false,
  is_lost: false,
  is_active: true,
}

function getErrorMessage(err: unknown) {
  const e = err as { response?: { data?: { message?: string } }; message?: string }
  return e.response?.data?.message || e.message || 'Erro inesperado'
}

function money(value?: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function metricNumber(value?: number | string | null) {
  return Number(value || 0)
}

function pct(value?: number | string | null) {
  return `${metricNumber(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function sourceLabel(value?: string) {
  return SOURCE_LABELS[value || 'outros'] || value || 'Outros'
}


function parseMoneyInput(value: string) {
  const raw = String(value || '').trim()
  if (!raw) return 0
  if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0
  return Number(raw) || 0
}

function dateLabel(value?: string | null) {
  if (!value) return 'Sem data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sem data'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dateTimeLabel(value?: string | null) {
  if (!value) return 'Sem data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sem data'
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function isPastDate(value?: string | null) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return date.getTime() < Date.now()
}

function toInputDateTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'LD'
}

function normalizeHeader(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function pick(row: Record<string, unknown>, options: string[]) {
  const entries = Object.entries(row)
  for (const option of options) {
    const found = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(option))
    if (found) return String(found[1] || '').trim()
  }
  return ''
}

function sourceFromText(value: string) {
  const text = normalizeHeader(value)
  if (text.includes('insta')) return 'instagram'
  if (text.includes('facebook') || text.includes('meta')) return 'facebook'
  if (text.includes('whats') || text.includes('zap')) return 'whatsapp'
  if (text.includes('google')) return 'google_ads'
  if (text.includes('site')) return 'site'
  if (text.includes('indic') || text.includes('mora') || text.includes('regiao')) return 'indicacao'
  if (text.includes('portal') || text.includes('viva')) return 'portal'
  return 'outros'
}

function parseExcel(buffer: ArrayBuffer): ImportedLead[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  return rows.map((row) => {
    const name = pick(row, ['NOME', 'Nome', 'Cliente'])
    const phone = pick(row, ['TELEFONE', 'Telefone', 'Celular', 'WhatsApp'])
    const email = pick(row, ['EMAIL', 'E-mail', 'Email'])
    const rawSource = pick(row, ['COMO SOUBE/DE ONDE VEIO', 'FONTE', 'Origem', 'Canal'])
    const notes = pick(row, ['DETALHAMENTO', 'Detalhamento', 'Observação', 'OBS'])
    const campaign = pick(row, ['Campanha', 'UTM Campaign', 'utm_campaign'])
    const interesse = normalizeHeader(pick(row, ['TEM INTERESSE?', 'Interesse']))
    const visita = normalizeHeader(pick(row, ['MARCOU VISITA?', 'Visita']))
    const converteu = normalizeHeader(pick(row, ['CONVERTEU VENDA?', 'Converteu']))
    const score = converteu.includes('sim') ? 95 : visita.includes('sim') ? 80 : interesse.includes('sim') ? 65 : 40
    const temperature: Temperature = score >= 80 ? 'quente' : score >= 55 ? 'morno' : 'frio'

    return { name, phone, email, source: sourceFromText(rawSource), campaign, notes, temperature, score }
  }).filter(row => row.name || row.phone)
}

function stageHeaderStyle(stage: FunnelStage) {
  return { borderColor: stage.color, color: stage.color }
}

function StageBadge({ stage }: { stage: FunnelStage }) {
  return (
    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={stageHeaderStyle(stage)}>
      {stage.name}
    </span>
  )
}

function LeadCard({ lead, stage, onOpen, onDragStart }: {
  lead: Lead
  stage?: FunnelStage
  onOpen: () => void
  onDragStart: () => void
}) {
  const overdue = Boolean(stage?.max_days && stage.max_days > 0 && Number(lead.days_in_stage || 0) > stage.max_days)
  const hasOverdueTask = Number(lead.overdue_tasks_count || 0) > 0
  const temp = TEMP_LABELS[lead.temperature] || TEMP_LABELS.morno

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className={cn(
        'group mb-3 w-full rounded-xl border bg-white p-3 text-left shadow-card transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md',
        hasOverdueTask ? 'border-red-200' : 'border-slate-100'
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
            {initials(lead.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{lead.name}</p>
            <p className="truncate text-[11px] text-slate-500">{lead.responsible_name || 'Sem responsável'}</p>
          </div>
        </div>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
      </div>

      <div className="space-y-1.5 text-xs text-slate-500">
        {lead.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</p>}
        {lead.next_task_due_at ? (
          <p className={cn('flex items-center gap-1', isPastDate(lead.next_task_due_at) ? 'font-semibold text-red-600' : 'text-slate-500')}>
            <Clock className="h-3 w-3" /> Tarefa: {dateTimeLabel(lead.next_task_due_at)}
          </p>
        ) : lead.next_follow_up_at ? (
          <p className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Próx.: {dateTimeLabel(lead.next_follow_up_at)}</p>
        ) : null}
        {lead.notes && <p className="line-clamp-2 text-slate-400">{lead.notes}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {SOURCE_LABELS[lead.source] || lead.source || 'Outros'}
        </span>
        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', temp.className)}>
          {temp.label}
        </span>
        {Number(lead.open_tasks_count || 0) > 0 && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', hasOverdueTask ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}>
            {lead.open_tasks_count} tarefa(s)
          </span>
        )}
        {overdue && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            SLA {lead.days_in_stage}d
          </span>
        )}
      </div>

      {lead.estimated_value > 0 && (
        <p className="mt-2 text-xs font-semibold text-slate-700">{money(lead.estimated_value)}</p>
      )}
    </button>
  )
}

function LeadModal({
  open,
  lead,
  stages,
  users,
  lossReasons,
  onClose,
  onSave,
  onDelete,
  onRefresh,
  initialStageId = '',
}: {
  open: boolean
  lead: Lead | null
  stages: FunnelStage[]
  users: CrmUser[]
  lossReasons: LossReason[]
  initialStageId?: string
  onClose: () => void
  onSave: (form: LeadForm) => Promise<void>
  onDelete: (leadId: string) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [form, setForm] = useState<LeadForm>(EMPTY_LEAD_FORM)
  const [history, setHistory] = useState<LeadHistory[]>([])
  const [tasks, setTasks] = useState<LeadTask[]>([])
  const [taskForm, setTaskForm] = useState<TaskForm>(EMPTY_TASK_FORM)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const selectedStage = stages.find(s => s.id === form.stage_id)
  const isLost = Boolean(selectedStage?.is_lost)

  useEffect(() => {
    if (!open) return
    if (lead) {
      setForm({
        id: lead.id,
        stage_id: lead.stage_id || stages[0]?.id || '',
        responsible_id: lead.responsible_id || '',
        loss_reason_id: lead.loss_reason_id || '',
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        source: lead.source || 'outros',
        campaign: lead.campaign || '',
        empreendimento: lead.empreendimento || '',
        estimated_value: lead.estimated_value ? String(lead.estimated_value) : '',
        temperature: lead.temperature || 'morno',
        score: String(lead.score || 50),
        notes: lead.notes || '',
        next_follow_up_at: toInputDateTime(lead.next_follow_up_at),
        history_note: '',
      })
      setTaskForm({ ...EMPTY_TASK_FORM, responsible_id: lead.responsible_id || '' })
      apiClient.get<ApiResponse<LeadHistory[]>>(`/crm/leads/${lead.id}/history`)
        .then(({ data }) => setHistory(data.data || []))
        .catch(() => setHistory([]))
      apiClient.get<ApiResponse<LeadTask[]>>(`/crm/tasks?lead_id=${lead.id}&status=all`)
        .then(({ data }) => setTasks(data.data || []))
        .catch(() => setTasks([]))
    } else {
      setForm({ ...EMPTY_LEAD_FORM, stage_id: initialStageId || stages[0]?.id || '' })
      setTaskForm(EMPTY_TASK_FORM)
      setHistory([])
      setTasks([])
    }
  }, [open, lead, stages, initialStageId])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return alert('Informe o nome do lead')
    if (isLost && !form.loss_reason_id) return alert('Informe o motivo de perda')
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function addNote() {
    if (!lead || !note.trim()) return
    const { data } = await apiClient.post<ApiResponse<LeadHistory>>(`/crm/leads/${lead.id}/history`, { note: note.trim() })
    setHistory(prev => [data.data, ...prev])
    setNote('')
  }

  async function addTask() {
    if (!lead || !taskForm.title.trim()) return alert('Informe o título da tarefa')
    const payload = {
      lead_id: lead.id,
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      due_at: taskForm.due_at || null,
      priority: taskForm.priority,
      responsible_id: taskForm.responsible_id || lead.responsible_id || null,
    }
    const { data } = await apiClient.post<ApiResponse<LeadTask>>('/crm/tasks', payload)
    setTasks(prev => [data.data, ...prev])
    setTaskForm({ ...EMPTY_TASK_FORM, responsible_id: lead.responsible_id || '' })
    await onRefresh()
    apiClient.get<ApiResponse<LeadHistory[]>>(`/crm/leads/${lead.id}/history`)
      .then(({ data }) => setHistory(data.data || []))
      .catch(() => {})
  }

  async function completeTask(taskId: string) {
    if (!lead) return
    await apiClient.patch(`/crm/tasks/${taskId}/complete`)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'concluida', completed_at: new Date().toISOString() } : t))
    await onRefresh()
    apiClient.get<ApiResponse<LeadHistory[]>>(`/crm/leads/${lead.id}/history`)
      .then(({ data }) => setHistory(data.data || []))
      .catch(() => {})
  }

  async function cancelTask(taskId: string) {
    if (!confirm('Cancelar esta tarefa?')) return
    await apiClient.delete(`/crm/tasks/${taskId}`)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'cancelada' } : t))
    await onRefresh()
  }

  async function handleDelete() {
    if (!lead) return
    if (!confirm('Inativar este lead?')) return
    await onDelete(lead.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{lead ? 'Editar lead' : 'Novo lead'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Cadastro, etapa, responsável e histórico comercial.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Nome *</span>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Telefone</span>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">E-mail</span>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Etapa</span>
                <select value={form.stage_id} onChange={e => setForm({ ...form, stage_id: e.target.value, loss_reason_id: '' })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {stages.filter(s => s.is_active).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Responsável</span>
                <select value={form.responsible_id} onChange={e => setForm({ ...form, responsible_id: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                  <option value="">Sem responsável</option>
                  {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
              {isLost && (
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-medium text-red-700">Motivo de perda *</span>
                  <select value={form.loss_reason_id} onChange={e => setForm({ ...form, loss_reason_id: e.target.value })} className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm outline-none focus:border-red-400">
                    <option value="">Selecione</option>
                    {lossReasons.filter(r => r.is_active).map(reason => <option key={reason.id} value={reason.id}>{reason.name}</option>)}
                  </select>
                </label>
              )}
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Origem</span>
                <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                  {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Campanha</span>
                <input value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} placeholder="Meta, Google, indicação..." className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Empreendimento</span>
                <input value={form.empreendimento} onChange={e => setForm({ ...form, empreendimento: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Valor estimado</span>
                <input value={form.estimated_value} onChange={e => setForm({ ...form, estimated_value: e.target.value })} placeholder="0,00" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Temperatura</span>
                <select value={form.temperature} onChange={e => setForm({ ...form, temperature: e.target.value as Temperature })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                  <option value="frio">Frio</option>
                  <option value="morno">Morno</option>
                  <option value="quente">Quente</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-600">Score</span>
                <input type="number" min="0" max="100" value={form.score} onChange={e => setForm({ ...form, score: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Próximo retorno</span>
                <input type="datetime-local" value={form.next_follow_up_at} onChange={e => setForm({ ...form, next_follow_up_at: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Observações</span>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Nota desta alteração</span>
                <input value={form.history_note} onChange={e => setForm({ ...form, history_note: e.target.value })} placeholder="Ex.: cliente pediu retorno amanhã" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
            {lead && (
              <div className="mb-5 rounded-2xl border border-blue-100 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CheckSquare className="h-4 w-4 text-blue-600" /> Tarefas e follow-up</h3>
                  <span className="text-xs text-slate-400">{tasks.filter(t => t.status === 'pendente').length} pendente(s)</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Ex.: ligar para o cliente" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="datetime-local" value={taskForm.due_at} onChange={e => setTaskForm({ ...taskForm, due_at: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    <select value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value as TaskPriority })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400">
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                  <select value={taskForm.responsible_id} onChange={e => setTaskForm({ ...taskForm, responsible_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400">
                    <option value="">Responsável do lead</option>
                    {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                  <textarea value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Descrição opcional" rows={2} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400" />
                  <button type="button" onClick={addTask} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">Criar tarefa</button>
                </div>

                <div className="mt-4 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {tasks.map(task => {
                    const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.media
                    const overdueTask = task.status === 'pendente' && isPastDate(task.due_at)
                    return (
                      <div key={task.id} className={cn('rounded-xl border bg-slate-50 p-3', overdueTask ? 'border-red-200 bg-red-50/50' : 'border-slate-100')}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={cn('truncate text-xs font-semibold', task.status === 'concluida' ? 'text-slate-400 line-through' : 'text-slate-800')}>{task.title}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">{task.due_at ? dateTimeLabel(task.due_at) : 'Sem prazo'} · {task.responsible_name || 'Sem responsável'}</p>
                          </div>
                          <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', priority.className)}>{priority.label}</span>
                        </div>
                        {task.description && <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">{task.description}</p>}
                        {task.status === 'pendente' ? (
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => completeTask(task.id)} className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100">Concluir</button>
                            <button type="button" onClick={() => cancelTask(task.id)} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600">Cancelar</button>
                          </div>
                        ) : <p className="mt-2 text-[10px] font-semibold text-slate-400">{task.status === 'concluida' ? 'Concluída' : 'Cancelada'}</p>}
                      </div>
                    )
                  })}
                  {!tasks.length && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">Nenhuma tarefa ainda</p>}
                </div>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><History className="h-4 w-4" /> Histórico</h3>
              <span className="text-xs text-slate-400">{history.length} eventos</span>
            </div>
            {lead && (
              <div className="mb-4 flex gap-2">
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Adicionar observação rápida" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400" />
                <button type="button" onClick={addNote} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white">Salvar</button>
              </div>
            )}
            <div className="max-h-[430px] space-y-3 overflow-y-auto pr-1">
              {history.map(item => (
                <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{historyActionLabel(item)}</p>
                    <span className="text-[10px] text-slate-400">{dateTimeLabel(item.created_at)}</span>
                  </div>
                  {item.from_stage_name || item.to_stage_name ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {item.from_stage_name || 'Início'} → {item.to_stage_name || 'Sem etapa'}
                    </p>
                  ) : null}
                  {item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}
                  {item.user_name && <p className="mt-2 text-[10px] text-slate-400">por {item.user_name}</p>}
                </div>
              ))}
              {!history.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Sem histórico ainda</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-5">
          {lead ? (
            <button type="button" onClick={handleDelete} className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> Inativar
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

function historyActionLabel(item: LeadHistory) {
  const labels: Record<string, string> = {
    created: 'Lead criado',
    imported: 'Lead importado',
    updated: 'Lead atualizado',
    stage_changed: 'Mudança de etapa',
    note: 'Observação',
    inactivated: 'Lead inativado',
    task_created: 'Tarefa criada',
    task_completed: 'Tarefa concluída',
    task_canceled: 'Tarefa cancelada',
  }
  return labels[item.action] || item.action
}

function ConfigModal({
  open,
  stages,
  lossReasons,
  onClose,
  onSaveStage,
  onInactivateStage,
  onSaveReason,
  onInactivateReason,
}: {
  open: boolean
  stages: FunnelStage[]
  lossReasons: LossReason[]
  initialStageId?: string
  onClose: () => void
  onSaveStage: (form: StageForm) => Promise<void>
  onInactivateStage: (stageId: string) => Promise<void>
  onSaveReason: (reason: { id?: string; name: string; position: number; is_active?: boolean }) => Promise<void>
  onInactivateReason: (reasonId: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'stages' | 'reasons'>('stages')
  const [stageForm, setStageForm] = useState<StageForm>(EMPTY_STAGE_FORM)
  const [reasonName, setReasonName] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  async function saveStage(e: FormEvent) {
    e.preventDefault()
    if (!stageForm.name.trim()) return alert('Informe o nome da etapa')
    setSaving(true)
    try {
      await onSaveStage(stageForm)
      setStageForm(EMPTY_STAGE_FORM)
    } finally {
      setSaving(false)
    }
  }

  async function saveReason(e: FormEvent) {
    e.preventDefault()
    if (!reasonName.trim()) return alert('Informe o motivo')
    setSaving(true)
    try {
      await onSaveReason({ name: reasonName, position: lossReasons.length * 10 + 10 })
      setReasonName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Configurar funil</h2>
            <p className="mt-0.5 text-xs text-slate-500">Etapas, prazos e motivos de perda.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex border-b border-slate-100 px-5 pt-3">
          <button onClick={() => setTab('stages')} className={cn('border-b-2 px-3 py-2 text-sm font-medium', tab === 'stages' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500')}>Etapas</button>
          <button onClick={() => setTab('reasons')} className={cn('border-b-2 px-3 py-2 text-sm font-medium', tab === 'reasons' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500')}>Motivos de perda</button>
        </div>

        {tab === 'stages' ? (
          <div className="grid max-h-[70vh] grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_0.9fr]">
            <div className="divide-y divide-slate-100 p-5">
              {stages.map(stage => (
                <div key={stage.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <p className="font-medium text-slate-900">{stage.name}</p>
                      {!stage.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">inativa</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Ordem {stage.position} · SLA {stage.max_days} dia(s) · {stage.lead_count || 0} lead(s)</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setStageForm({ id: stage.id, code: stage.code, name: stage.name, color: stage.color, position: String(stage.position), max_days: String(stage.max_days), is_won: stage.is_won, is_lost: stage.is_lost, is_active: stage.is_active })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Edit3 className="h-4 w-4" /></button>
                    <button type="button" onClick={() => onInactivateStage(stage.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={saveStage} className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
              <h3 className="text-sm font-semibold text-slate-900">{stageForm.id ? 'Editar etapa' : 'Nova etapa'}</h3>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-600">Nome</span><input value={stageForm.name} onChange={e => setStageForm({ ...stageForm, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-600">Cor</span><input type="color" value={stageForm.color} onChange={e => setStageForm({ ...stageForm, color: e.target.value })} className="h-10 w-full rounded-xl border border-slate-200 px-2" /></label>
                <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-600">Ordem</span><input type="number" value={stageForm.position} onChange={e => setStageForm({ ...stageForm, position: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" /></label>
              </div>
              <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-600">Prazo máximo na etapa</span><input type="number" value={stageForm.max_days} onChange={e => setStageForm({ ...stageForm, max_days: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" /></label>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={stageForm.is_won} onChange={e => setStageForm({ ...stageForm, is_won: e.target.checked, is_lost: e.target.checked ? false : stageForm.is_lost })} /> Ganho</label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={stageForm.is_lost} onChange={e => setStageForm({ ...stageForm, is_lost: e.target.checked, is_won: e.target.checked ? false : stageForm.is_won })} /> Perdido</label>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3"><input type="checkbox" checked={stageForm.is_active} onChange={e => setStageForm({ ...stageForm, is_active: e.target.checked })} /> Ativa</label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                {stageForm.id && <button type="button" onClick={() => setStageForm(EMPTY_STAGE_FORM)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">Limpar</button>}
                <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Salvar etapa</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="grid max-h-[70vh] grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_0.8fr]">
            <div className="divide-y divide-slate-100 p-5">
              {lossReasons.map(reason => (
                <div key={reason.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-slate-900">{reason.name}</p>
                    <p className="text-xs text-slate-500">Ordem {reason.position} {reason.is_active ? '' : '· inativo'}</p>
                  </div>
                  <button type="button" onClick={() => onInactivateReason(reason.id)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <form onSubmit={saveReason} className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">
              <h3 className="text-sm font-semibold text-slate-900">Novo motivo</h3>
              <input value={reasonName} onChange={e => setReasonName(e.target.value)} placeholder="Ex.: Sem crédito" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" />
              <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-60">Salvar motivo</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}


function AnalyticsTable({ title, description, rows, columns, empty = 'Sem dados para este relatório.' }: {
  title: string
  description?: string
  rows: AnalyticsMetric[]
  columns: AnalyticsColumn[]
  empty?: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
      <div className="border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70">
              <tr>
                {columns.map(column => (
                  <th key={column.label} className={cn('px-4 py-3 text-left text-xs font-semibold text-slate-600', column.className)}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`} className="hover:bg-slate-50/60">
                  {columns.map(column => (
                    <td key={column.label} className={cn('px-4 py-3 text-xs text-slate-600', column.className)}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-sm text-slate-400">{empty}</div>
      )}
    </div>
  )
}

function AnalyticsPanel({ analytics, onRecalculate, recalculating }: {
  analytics: CrmAnalytics | null
  onRecalculate: () => Promise<void>
  recalculating: boolean
}) {
  const totals = analytics?.totals || {}
  const scoreRows = analytics?.score_buckets || []

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Inteligência comercial — Fase 3</p>
            <p className="mt-0.5 text-xs text-slate-500">Scoring, previsão de fechamento, conversão por origem, ranking de responsáveis e campanhas.</p>
          </div>
          <button
            type="button"
            onClick={onRecalculate}
            disabled={recalculating}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {recalculating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Recalcular scores
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
          {[
            { label: 'Previsão ponderada', value: money(metricNumber(totals.weighted_forecast)), icon: Target, className: 'text-indigo-700' },
            { label: 'Pipeline aberto', value: money(metricNumber(totals.pipeline_value)), icon: TrendingUp, className: 'text-blue-700' },
            { label: 'Receita vendida', value: money(metricNumber(totals.won_value)), icon: Award, className: 'text-emerald-700' },
            { label: 'Conversão geral', value: pct(totals.conversion_rate), icon: BarChart3, className: 'text-orange-600' },
            { label: 'Score médio', value: metricNumber(totals.avg_score).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), icon: Flame, className: 'text-red-600' },
            { label: 'Leads quentes', value: metricNumber(totals.hot_leads), icon: Users, className: 'text-slate-900' },
          ].map(card => (
            <div key={card.label} className="rounded-xl border border-white/80 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">{card.label}</p><card.icon className={cn('h-4 w-4', card.className)} /></div>
              <p className={cn('mt-1 text-lg font-bold', card.className)}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {scoreRows.map(row => {
          const tempKey = (row.temperature || 'morno') as Temperature
          const temp = TEMP_LABELS[tempKey] || TEMP_LABELS.morno
          return (
            <div key={tempKey} className="rounded-xl border border-slate-100 bg-white p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('rounded-full border px-2 py-0.5 text-xs font-semibold', temp.className)}>{temp.label}</span>
                <span className="text-xs font-semibold text-slate-400">Score médio {metricNumber(row.avg_score).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{metricNumber(row.total)} lead(s)</p>
              <p className="mt-1 text-xs text-slate-500">Pipeline: <strong>{money(metricNumber(row.pipeline_value))}</strong> · Previsão: <strong>{money(metricNumber(row.weighted_forecast))}</strong></p>
            </div>
          )
        })}
        {!scoreRows.length && <div className="rounded-xl border border-slate-100 bg-white p-6 text-sm text-slate-400 shadow-card">Sem dados de scoring ainda.</div>}
      </div>

      <div className="grid gap-4 2xl:grid-cols-2">
        <AnalyticsTable
          title="Conversão por origem"
          description="Mostra de onde vem volume, venda, pipeline e previsão ponderada."
          rows={analytics?.by_source || []}
          columns={[
            { label: 'Origem', render: row => <span className="font-semibold text-slate-900">{sourceLabel(row.source)}</span> },
            { label: 'Leads', className: 'text-right', render: row => metricNumber(row.total) },
            { label: 'Vendidos', className: 'text-right', render: row => metricNumber(row.won) },
            { label: 'Conversão', className: 'text-right', render: row => pct(row.conversion_rate) },
            { label: 'Previsão', className: 'text-right', render: row => money(metricNumber(row.weighted_forecast)) },
          ]}
        />
        <AnalyticsTable
          title="Ranking por responsável"
          description="Ranking comercial com conversão, pipeline, previsão e tarefas atrasadas."
          rows={analytics?.by_responsible || []}
          columns={[
            { label: 'Responsável', render: row => <span className="font-semibold text-slate-900">{row.responsible_name || 'Sem responsável'}</span> },
            { label: 'Leads', className: 'text-right', render: row => metricNumber(row.total) },
            { label: 'Vendidos', className: 'text-right', render: row => metricNumber(row.won) },
            { label: 'Conversão', className: 'text-right', render: row => pct(row.conversion_rate) },
            { label: 'Atrasos', className: 'text-right', render: row => metricNumber(row.overdue_tasks) },
          ]}
        />
        <AnalyticsTable
          title="Conversão por etapa"
          description="Identifica gargalos, SLA vencido e valor parado no funil."
          rows={analytics?.by_stage || []}
          columns={[
            { label: 'Etapa', render: row => <span className="font-semibold text-slate-900">{row.stage_name || 'Sem etapa'}</span> },
            { label: 'Leads', className: 'text-right', render: row => metricNumber(row.total) },
            { label: 'SLA vencido', className: 'text-right', render: row => metricNumber(row.sla_overdue) },
            { label: 'Score médio', className: 'text-right', render: row => metricNumber(row.avg_score).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) },
            { label: 'Pipeline', className: 'text-right', render: row => money(metricNumber(row.pipeline_value)) },
          ]}
        />
        <AnalyticsTable
          title="Campanhas"
          description="Base para a próxima fase de campanhas com SES/SNS."
          rows={analytics?.by_campaign || []}
          columns={[
            { label: 'Campanha', render: row => <span className="font-semibold text-slate-900">{row.campaign || 'Sem campanha'}</span> },
            { label: 'Leads', className: 'text-right', render: row => metricNumber(row.total) },
            { label: 'Conversão', className: 'text-right', render: row => pct(row.conversion_rate) },
            { label: 'Score', className: 'text-right', render: row => metricNumber(row.avg_score).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) },
            { label: 'Previsão', className: 'text-right', render: row => money(metricNumber(row.weighted_forecast)) },
          ]}
        />
      </div>

      <AnalyticsTable
        title="Motivos de perda"
        description="Ajuda a ajustar preço, abordagem, crédito, documentação e comunicação comercial."
        rows={analytics?.loss_reasons || []}
        columns={[
          { label: 'Motivo', render: row => <span className="font-semibold text-slate-900">{row.loss_reason_name || 'Sem motivo'}</span> },
          { label: 'Ocorrências', className: 'text-right', render: row => metricNumber(row.total) },
          { label: 'Valor perdido', className: 'text-right', render: row => money(metricNumber(row.lost_value)) },
        ]}
      />
    </div>
  )
}

function ImportModal({ open, onClose, onImport }: {
  open: boolean
  onClose: () => void
  onImport: (leads: ImportedLead[]) => Promise<void>
}) {
  const [preview, setPreview] = useState<ImportedLead[]>([])
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setFileName(file.name)
    const parsed = parseExcel(await file.arrayBuffer())
    setPreview(parsed)
    setLoading(false)
  }

  async function handleImport() {
    if (!preview.length) return
    setLoading(true)
    try {
      await onImport(preview)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Importar leads do Excel</h2>
            <p className="mt-0.5 text-xs text-slate-500">Agora a importação grava no banco do CRM.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-200 p-8 hover:border-blue-300 hover:bg-blue-50/40">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
            <FileSpreadsheet className="h-10 w-10 text-blue-600" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-800">{fileName || 'Selecionar arquivo Excel'}</p>
              <p className="mt-0.5 text-xs text-slate-500">{loading ? 'Lendo arquivo...' : `${preview.length} lead(s) encontrados`}</p>
            </div>
          </label>
          {preview.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50"><tr><th className="px-3 py-2 text-left">Nome</th><th className="px-3 py-2 text-left">Telefone</th><th className="px-3 py-2 text-left">Origem</th></tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {preview.slice(0, 40).map((lead, i) => <tr key={`${lead.phone}-${i}`}><td className="px-3 py-2 font-medium">{lead.name}</td><td className="px-3 py-2">{lead.phone}</td><td className="px-3 py-2">{SOURCE_LABELS[lead.source || 'outros']}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600">Cancelar</button>
          <button type="button" disabled={!preview.length || loading} onClick={handleImport} className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><Upload className="h-4 w-4" /> Importar</button>
        </div>
      </div>
    </div>
  )
}

export default function CRMPage() {
  const [stages, setStages] = useState<FunnelStage[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<CrmUser[]>([])
  const [lossReasons, setLossReasons] = useState<LossReason[]>([])
  const [summary, setSummary] = useState<CrmSummary | null>(null)
  const [analytics, setAnalytics] = useState<CrmAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [responsibleFilter, setResponsibleFilter] = useState('all')
  const [temperatureFilter, setTemperatureFilter] = useState<'all' | Temperature>('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [view, setView] = useState<'kanban' | 'list' | 'analytics'>('kanban')
  const [dragLeadId, setDragLeadId] = useState<string | null>(null)
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [newLeadStageId, setNewLeadStageId] = useState('')
  const [recalculatingScores, setRecalculatingScores] = useState(false)

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [stageRes, leadRes, userRes, reasonRes, summaryRes, analyticsRes] = await Promise.all([
        apiClient.get<ApiResponse<FunnelStage[]>>('/crm/stages'),
        apiClient.get<ApiResponse<Lead[]>>('/crm/leads'),
        apiClient.get<ApiResponse<CrmUser[]>>('/crm/users'),
        apiClient.get<ApiResponse<LossReason[]>>('/crm/loss-reasons'),
        apiClient.get<ApiResponse<CrmSummary>>('/crm/summary'),
        apiClient.get<ApiResponse<CrmAnalytics>>('/crm/analytics'),
      ])
      setStages(stageRes.data.data || [])
      setLeads(leadRes.data.data || [])
      setUsers(userRes.data.data || [])
      setLossReasons(reasonRes.data.data || [])
      setSummary(summaryRes.data.data || null)
      setAnalytics(analyticsRes.data.data || null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])

  const activeStages = useMemo(() => stages.filter(s => s.is_active).sort((a, b) => a.position - b.position), [stages])

  const filteredLeads = useMemo(() => leads.filter(lead => {
    const q = search.trim().toLowerCase()
    if (q && !`${lead.name} ${lead.phone} ${lead.email} ${lead.notes} ${lead.campaign}`.toLowerCase().includes(q)) return false
    if (stageFilter !== 'all' && lead.stage_id !== stageFilter) return false
    if (responsibleFilter !== 'all' && (lead.responsible_id || '') !== responsibleFilter) return false
    if (temperatureFilter !== 'all' && lead.temperature !== temperatureFilter) return false
    if (sourceFilter !== 'all' && lead.source !== sourceFilter) return false
    return true
  }), [leads, search, stageFilter, responsibleFilter, temperatureFilter, sourceFilter])

  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, Lead[]>()
    activeStages.forEach(stage => grouped.set(stage.id, []))
    filteredLeads.forEach(lead => {
      const key = lead.stage_id || activeStages[0]?.id || 'sem_etapa'
      grouped.set(key, [...(grouped.get(key) || []), lead])
    })
    return grouped
  }, [activeStages, filteredLeads])

  const totalLeads = leads.length
  const wonStageIds = new Set(stages.filter(s => s.is_won).map(s => s.id))
  const lostStageIds = new Set(stages.filter(s => s.is_lost).map(s => s.id))
  const won = leads.filter(l => l.stage_id && wonStageIds.has(l.stage_id)).length
  const lost = leads.filter(l => l.stage_id && lostStageIds.has(l.stage_id)).length
  const conversion = totalLeads > 0 ? Math.round((won / totalLeads) * 100) : 0
  const pipelineValue = leads.filter(l => !l.stage_id || (!wonStageIds.has(l.stage_id) && !lostStageIds.has(l.stage_id))).reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0)
  const overdue = leads.filter(lead => {
    const stage = stages.find(s => s.id === lead.stage_id)
    return Boolean(stage?.max_days && stage.max_days > 0 && Number(lead.days_in_stage || 0) > stage.max_days)
  }).length

  const priorityTasks = summary?.tasks || []

  function openNewLead(stageId?: string) {
    setNewLeadStageId(stageId || '')
    setEditingLead(null)
    setLeadModalOpen(true)
  }

  async function saveLead(form: LeadForm) {
    const payload = {
      stage_id: form.stage_id || activeStages[0]?.id || null,
      responsible_id: form.responsible_id || null,
      loss_reason_id: form.loss_reason_id || null,
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || null,
      source: form.source || 'outros',
      campaign: form.campaign.trim(),
      empreendimento: form.empreendimento.trim(),
      estimated_value: parseMoneyInput(form.estimated_value),
      temperature: form.temperature,
      score: Number(form.score || 0),
      notes: form.notes,
      next_follow_up_at: form.next_follow_up_at || null,
      history_note: form.history_note,
    }

    if (form.id) {
      await apiClient.put(`/crm/leads/${form.id}`, payload)
    } else {
      await apiClient.post('/crm/leads', payload)
    }
    await loadAll()
  }

  async function deleteLead(leadId: string) {
    await apiClient.delete(`/crm/leads/${leadId}`)
    await loadAll()
  }

  async function moveLeadToStage(lead: Lead, stageId: string) {
    const targetStage = stages.find(s => s.id === stageId)
    if (!targetStage) return
    if (targetStage.is_lost && !lead.loss_reason_id) {
      setEditingLead({ ...lead, stage_id: stageId })
      setLeadModalOpen(true)
      return
    }
    await saveLead({
      id: lead.id,
      stage_id: stageId,
      responsible_id: lead.responsible_id || '',
      loss_reason_id: lead.loss_reason_id || '',
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      campaign: lead.campaign,
      empreendimento: lead.empreendimento,
      estimated_value: String(lead.estimated_value || ''),
      temperature: lead.temperature,
      score: String(lead.score || 0),
      notes: lead.notes,
      next_follow_up_at: toInputDateTime(lead.next_follow_up_at),
      history_note: `Movido para ${targetStage.name}`,
    })
  }

  async function saveStage(form: StageForm) {
    const payload = {
      code: form.code,
      name: form.name,
      color: form.color,
      position: Number(form.position || 0),
      max_days: Number(form.max_days || 0),
      is_won: form.is_won,
      is_lost: form.is_lost,
      is_active: form.is_active,
    }
    if (form.id) await apiClient.put(`/crm/stages/${form.id}`, payload)
    else await apiClient.post('/crm/stages', payload)
    await loadAll()
  }

  async function inactivateStage(stageId: string) {
    if (!confirm('Inativar esta etapa? Os leads existentes serão mantidos.')) return
    await apiClient.delete(`/crm/stages/${stageId}`)
    await loadAll()
  }

  async function saveReason(reason: { id?: string; name: string; position: number; is_active?: boolean }) {
    if (reason.id) await apiClient.put(`/crm/loss-reasons/${reason.id}`, reason)
    else await apiClient.post('/crm/loss-reasons', reason)
    await loadAll()
  }

  async function inactivateReason(reasonId: string) {
    if (!confirm('Inativar este motivo de perda?')) return
    await apiClient.delete(`/crm/loss-reasons/${reasonId}`)
    await loadAll()
  }

  async function importLeads(imported: ImportedLead[]) {
    await apiClient.post('/crm/leads/import', { leads: imported })
    await loadAll()
  }

  async function recalculateScores() {
    setRecalculatingScores(true)
    try {
      await apiClient.post('/crm/leads/recalculate-scores')
      await loadAll()
    } finally {
      setRecalculatingScores(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando CRM...</div>
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
        <p className="font-semibold">Não foi possível carregar o CRM.</p>
        <p className="mt-1">{error}</p>
        <p className="mt-3 text-xs">Confira se as migrations <strong>migrate_crm_fase1.js</strong>, <strong>migrate_crm_fase2.js</strong> e <strong>migrate_crm_fase3.js</strong> foram executadas no backend.</p>
        <button onClick={loadAll} className="mt-4 rounded-xl bg-red-600 px-3 py-2 text-xs font-medium text-white">Tentar novamente</button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">CRM & Funil de Vendas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Funil configurável, tarefas, inteligência comercial, scoring e relatórios de conversão.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setConfigOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><Settings className="h-4 w-4" /> Configurar funil</button>
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Importar Excel</button>
          <button onClick={() => openNewLead()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Novo lead</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          { label: 'Total de leads', value: totalLeads, icon: Users, color: 'text-slate-900' },
          { label: 'Pipeline aberto', value: money(pipelineValue), icon: TrendingUp, color: 'text-blue-700' },
          { label: 'Vendidos', value: won, icon: CheckCircle, color: 'text-emerald-600' },
          { label: 'Perdidos', value: lost, icon: X, color: 'text-red-600' },
          { label: 'Conversão', value: `${conversion}%`, icon: Flame, color: 'text-orange-600' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-card">
            <div className="mb-1 flex items-center justify-between"><p className="text-xs text-slate-500">{kpi.label}</p><kpi.icon className={cn('h-4 w-4', kpi.color)} /></div>
            <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Gestão comercial — tarefas e SLA</p>
            <p className="mt-0.5 text-xs text-slate-500">Priorize retornos, tarefas atrasadas, leads parados e etapas fora do prazo.</p>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700">Versão 0.0.4</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: 'Tarefas hoje', value: summary?.tasks_today || 0, icon: ClipboardList, className: 'text-blue-700' },
            { label: 'Tarefas atrasadas', value: summary?.tasks_overdue || 0, icon: AlertTriangle, className: 'text-red-600' },
            { label: 'Próx. 48h', value: summary?.tasks_due_soon || 0, icon: Clock, className: 'text-amber-600' },
            { label: 'Sem contato 7d', value: summary?.leads_without_contact || 0, icon: Phone, className: 'text-slate-700' },
            { label: 'SLA vencido', value: summary?.sla_overdue || overdue, icon: Bell, className: 'text-red-700' },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-white/70 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-500">{item.label}</p><item.icon className={cn('h-4 w-4', item.className)} /></div>
              <p className={cn('mt-1 text-xl font-bold', item.className)}>{item.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-blue-100 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Prioridades de atendimento</p>
            <span className="text-xs text-slate-400">{priorityTasks.length} tarefa(s)</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
            {priorityTasks.map(task => {
              const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.media
              const overdueTask = task.status === 'pendente' && isPastDate(task.due_at)
              return (
                <button key={task.id} onClick={() => {
                  const lead = leads.find(l => l.id === task.lead_id)
                  if (lead) { setEditingLead(lead); setLeadModalOpen(true) }
                }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{task.title}</p>
                    <p className="truncate text-xs text-slate-500">{task.lead_name || 'Lead'} · {task.responsible_name || 'Sem responsável'} · {task.due_at ? dateTimeLabel(task.due_at) : 'Sem prazo'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {overdueTask && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Atrasada</span>}
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', priority.className)}>{priority.label}</span>
                  </div>
                </button>
              )
            })}
            {!priorityTasks.length && <p className="px-4 py-8 text-center text-sm text-slate-400">Nenhuma tarefa pendente no momento.</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead, telefone, campanha..." className="w-60 text-sm outline-none placeholder:text-slate-400" />
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
          <option value="all">Todas as etapas</option>
          {activeStages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
        <select value={responsibleFilter} onChange={e => setResponsibleFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
          <option value="all">Todos responsáveis</option>
          <option value="">Sem responsável</option>
          {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
        </select>
        <select value={temperatureFilter} onChange={e => setTemperatureFilter(e.target.value as 'all' | Temperature)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
          <option value="all">Todas temperaturas</option><option value="frio">Frio</option><option value="morno">Morno</option><option value="quente">Quente</option>
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none">
          <option value="all">Todas origens</option>
          {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500"><Filter className="h-3.5 w-3.5" /> {filteredLeads.length} resultado(s) · {overdue} atrasado(s)</div>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          <button onClick={() => setView('kanban')} className={cn('px-3 py-2 text-xs font-medium', view === 'kanban' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>Kanban</button>
          <button onClick={() => setView('list')} className={cn('px-3 py-2 text-xs font-medium', view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>Lista</button>
          <button onClick={() => setView('analytics')} className={cn('px-3 py-2 text-xs font-medium', view === 'analytics' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>Inteligência</button>
        </div>
      </div>

      {view === 'analytics' ? (
        <AnalyticsPanel analytics={analytics} onRecalculate={recalculateScores} recalculating={recalculatingScores} />
      ) : view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {activeStages.map(stage => {
            const columnLeads = leadsByStage.get(stage.id) || []
            const stageTotal = columnLeads.reduce((sum, lead) => sum + Number(lead.estimated_value || 0), 0)
            return (
              <div key={stage.id} onDragOver={e => e.preventDefault()} onDrop={() => {
                const lead = leads.find(l => l.id === dragLeadId)
                setDragLeadId(null)
                if (lead && lead.stage_id !== stage.id) void moveLeadToStage(lead, stage.id)
              }} className="w-72 shrink-0">
                <div className="mb-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm" style={{ borderTopColor: stage.color, borderTopWidth: 3 }}>
                  <div className="flex items-center justify-between gap-2">
                    <StageBadge stage={stage} />
                    <button onClick={() => openNewLead(stage.id)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Plus className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><span>{columnLeads.length} lead(s)</span><span>{money(stageTotal)}</span></div>
                </div>
                <div className="min-h-[120px] rounded-xl border border-dashed border-transparent p-1 hover:border-blue-100 hover:bg-blue-50/30">
                  {columnLeads.map(lead => (
                    <LeadCard key={lead.id} lead={lead} stage={stage} onDragStart={() => setDragLeadId(lead.id)} onOpen={() => { setEditingLead(lead); setLeadModalOpen(true) }} />
                  ))}
                  {!columnLeads.length && <div className="rounded-xl border-2 border-dashed border-slate-100 p-6 text-center text-xs text-slate-300">Arraste leads para cá</div>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70">
              <tr className="border-b border-slate-100">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Lead</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Etapa</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Responsável</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Origem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Próximo retorno</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Valor</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLeads.map(lead => {
                const stage = stages.find(s => s.id === lead.stage_id)
                return (
                  <tr key={lead.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3"><p className="font-medium text-slate-900">{lead.name}</p><p className="text-xs text-slate-500">{lead.phone || lead.email}</p></td>
                    <td className="px-4 py-3">{stage ? <StageBadge stage={stage} /> : <span className="text-xs text-slate-400">Sem etapa</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{lead.responsible_name || 'Sem responsável'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{SOURCE_LABELS[lead.source] || lead.source}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{dateLabel(lead.next_follow_up_at)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{money(lead.estimated_value)}</td>
                    <td className="px-4 py-3 text-center"><button onClick={() => { setEditingLead(lead); setLeadModalOpen(true) }} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Edit3 className="h-4 w-4" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filteredLeads.length && <div className="py-12 text-center text-sm text-slate-400">Nenhum lead encontrado</div>}
        </div>
      )}

      <LeadModal open={leadModalOpen} lead={editingLead} initialStageId={newLeadStageId} stages={activeStages} users={users} lossReasons={lossReasons} onClose={() => { setLeadModalOpen(false); setEditingLead(null); setNewLeadStageId('') }} onSave={saveLead} onDelete={deleteLead} onRefresh={loadAll} />
      <ConfigModal open={configOpen} stages={stages} lossReasons={lossReasons} onClose={() => setConfigOpen(false)} onSaveStage={saveStage} onInactivateStage={inactivateStage} onSaveReason={saveReason} onInactivateReason={inactivateReason} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={importLeads} />
    </div>
  )
}
