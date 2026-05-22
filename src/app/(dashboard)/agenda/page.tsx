'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle, ChevronLeft, ChevronRight, Clock,
  Loader2, Mail, MapPin, Phone, Plus, RefreshCw,
  User, X,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type TaskType     = 'geral' | 'ligacao' | 'sms' | 'email' | 'visita' | 'outro'
type TaskPriority = 'baixa' | 'media' | 'alta' | 'urgente'
type TaskStatus   = 'pendente' | 'concluida' | 'cancelada'

type Task = {
  id: string
  lead_id: string
  lead_name?: string
  lead_phone?: string
  stage_name?: string
  stage_color?: string
  title: string
  description?: string
  type: TaskType
  due_at?: string | null
  priority: TaskPriority
  status: TaskStatus
  responsible_name?: string
  created_at: string
}

type CrmUser = { id: string; name: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS_PT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TYPE_META: Record<TaskType, { icon: string; label: string; color: string; bg: string }> = {
  ligacao: { icon: '📞', label: 'Ligação',  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  sms:     { icon: '💬', label: 'SMS',      color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200'       },
  email:   { icon: '✉️',  label: 'E-mail',  color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200'   },
  visita:  { icon: '🏠', label: 'Visita',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200'     },
  geral:   { icon: '📋', label: 'Geral',    color: 'text-slate-600',   bg: 'bg-slate-50 border-slate-200'     },
  outro:   { icon: '•',  label: 'Outro',    color: 'text-slate-500',   bg: 'bg-slate-50 border-slate-200'     },
}

const PRIORITY_DOT: Record<TaskPriority, string> = {
  baixa: 'bg-slate-300', media: 'bg-blue-400', alta: 'bg-amber-400', urgente: 'bg-red-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function timeLabel(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Day detail panel ─────────────────────────────────────────────────────────

function DayPanel({ date, tasks, onClose, onComplete }: {
  date: Date; tasks: Task[]; onClose: () => void; onComplete: (id: string) => void
}) {
  const label = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const pending   = tasks.filter(t => t.status === 'pendente')
  const concluded = tasks.filter(t => t.status === 'concluida')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end" onClick={onClose}>
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900 capitalize">{label}</p>
            <p className="text-xs text-slate-500">{tasks.length} tarefa(s)</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {pending.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pendentes</p>
              <div className="space-y-2">
                {pending.map(task => {
                  const meta = TYPE_META[task.type] || TYPE_META.geral
                  return (
                    <div key={task.id} className={cn('rounded-xl border p-3', meta.bg)}>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 text-base">{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                            <div className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[task.priority])} />
                          </div>
                          {task.lead_name && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-600">
                              <User className="h-3 w-3" />{task.lead_name}
                              {task.lead_phone && <span className="text-slate-400">· {task.lead_phone}</span>}
                            </p>
                          )}
                          {task.stage_name && (
                            <span className="mt-1 inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ borderColor: task.stage_color || '#cbd5e1', color: task.stage_color || '#94a3b8' }}>
                              {task.stage_name}
                            </span>
                          )}
                          {task.description && <p className="mt-1 text-xs text-slate-500">{task.description}</p>}
                          {task.due_at && <p className="mt-1 text-xs font-medium text-slate-700">⏰ {timeLabel(task.due_at)}</p>}
                        </div>
                        <button onClick={() => onComplete(task.id)}
                          className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {concluded.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Concluídas</p>
              <div className="space-y-1.5">
                {concluded.map(task => (
                  <div key={task.id} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 opacity-60">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <p className="text-sm text-slate-600 line-through">{task.title}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tasks.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">Nenhuma tarefa neste dia.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Week row ─────────────────────────────────────────────────────────────────

function WeekRow({ tasks, users, userFilter }: {
  tasks: Task[]; users: CrmUser[]; userFilter: string
}) {
  const now = new Date()
  const byType = { ligacao: 0, sms: 0, email: 0, visita: 0 }
  const filtered = userFilter === 'all' ? tasks
    : tasks.filter(t => t.responsible_name === users.find(u => u.id === userFilter)?.name)

  filtered.forEach(t => { if (t.type in byType) byType[t.type as keyof typeof byType]++ })

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {([['ligacao','📞','Ligações','text-emerald-700','bg-emerald-50 border-emerald-200'],
         ['sms','💬','SMS','text-blue-700','bg-blue-50 border-blue-200'],
         ['email','✉️','E-mails','text-violet-700','bg-violet-50 border-violet-200'],
         ['visita','🏠','Visitas','text-amber-700','bg-amber-50 border-amber-200'],
        ] as [string, string, string, string, string][]).map(([k, icon, label, color, bg]) => (
        <div key={k} className={cn('rounded-xl border p-3', bg)}>
          <div className="flex items-center gap-2 mb-1">
            <span>{icon}</span>
            <p className={cn('text-xs font-semibold', color)}>{label}</p>
          </div>
          <p className={cn('text-2xl font-bold', color)}>{byType[k as keyof typeof byType]}</p>
          <p className="text-[10px] text-slate-400">pendentes</p>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const [tasks, setTasks]         = useState<Task[]>([])
  const [users, setUsers]         = useState<CrmUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [year, setYear]           = useState(new Date().getFullYear())
  const [month, setMonth]         = useState(new Date().getMonth())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [userFilter, setUserFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const [taskRes, userRes] = await Promise.all([
        apiClient.get('/crm/manual-actions?status=pendente'),
        apiClient.get('/crm/users'),
      ])
      setTasks((taskRes.data as { data: Task[] }).data || [])
      setUsers((userRes.data as { data: CrmUser[] }).data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadTasks() }, [loadTasks])

  async function completeTask(id: string) {
    await apiClient.patch(`/crm/tasks/${id}/complete`).catch(() => {})
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'concluida' as TaskStatus } : t))
  }

  function changeMonth(d: number) {
    let m = month + d, y = year
    if (m > 11) { m = 0; y++ }
    if (m < 0)  { m = 11; y-- }
    setMonth(m); setYear(y)
  }

  // Build calendar grid
  const firstDay  = new Date(year, month, 1)
  const lastDay   = new Date(year, month + 1, 0)
  const startDow  = firstDay.getDay()
  const totalDays = lastDay.getDate()
  const cells: (Date | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => new Date(year, month, i + 1)),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()

  function tasksForDay(day: Date): Task[] {
    return tasks.filter(t => {
      if (!t.due_at) return false
      if (!sameDay(new Date(t.due_at), day)) return false
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (userFilter !== 'all') {
        const u = users.find(u => u.id === userFilter)
        if (u && t.responsible_name !== u.name) return false
      }
      return true
    })
  }

  const selectedTasks = selectedDay ? tasksForDay(selectedDay) : []
  const monthTasks = tasks.filter(t => {
    if (!t.due_at) return false
    const d = new Date(t.due_at)
    return d.getFullYear() === year && d.getMonth() === month
  })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Agenda & Tarefas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Calendário de atividades, visitas e próximos passos de todos os leads.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadTasks} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {/* Week summary */}
      {!loading && <WeekRow tasks={monthTasks.filter(t => t.status === 'pendente')} users={users} userFilter={userFilter} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          <button onClick={() => changeMonth(-1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="border-x border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            {MONTHS_PT[month]} {year}
          </span>
          <button onClick={() => changeMonth(1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
        </div>

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none">
          <option value="all">Todos os tipos</option>
          <option value="ligacao">📞 Ligações</option>
          <option value="sms">💬 SMS</option>
          <option value="email">✉️ E-mail</option>
          <option value="visita">🏠 Visitas</option>
          <option value="geral">📋 Geral</option>
        </select>

        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none">
          <option value="all">Todos</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70">
            {DAYS_PT.map(d => (
              <div key={d} className="py-2.5 text-center text-xs font-semibold text-slate-500">{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) return <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-slate-50 bg-slate-50/30" />
              const dayTasks = tasksForDay(day)
              const isToday  = sameDay(day, today)
              const isPast   = day < today && !isToday
              const hasPending = dayTasks.some(t => t.status === 'pendente')

              return (
                <div key={day.toISOString()}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    'min-h-[100px] cursor-pointer border-b border-r border-slate-50 p-2 transition-colors',
                    isToday && 'bg-blue-50/40',
                    isPast && dayTasks.length === 0 && 'opacity-40',
                    'hover:bg-slate-50'
                  )}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                      isToday ? 'bg-blue-600 text-white' : 'text-slate-600'
                    )}>
                      {day.getDate()}
                    </span>
                    {hasPending && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                  </div>

                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map(task => {
                      const meta = TYPE_META[task.type] || TYPE_META.geral
                      return (
                        <div key={task.id}
                          className={cn('flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium truncate', meta.bg, meta.color,
                            task.status === 'concluida' && 'opacity-50 line-through')}>
                          <span>{meta.icon}</span>
                          <span className="truncate">{task.title}</span>
                        </div>
                      )
                    })}
                    {dayTasks.length > 3 && (
                      <p className="pl-1 text-[10px] text-slate-400">+{dayTasks.length - 3} mais</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lista da semana atual */}
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-800">Próximas tarefas (sem data definida)</p>
        {(() => {
          const noDate = tasks.filter(t => !t.due_at && t.status === 'pendente')
          if (!noDate.length) return <p className="text-xs text-slate-400">Nenhuma tarefa sem data.</p>
          return (
            <div className="space-y-2">
              {noDate.slice(0, 8).map(task => {
                const meta = TYPE_META[task.type] || TYPE_META.geral
                return (
                  <div key={task.id} className={cn('flex items-center gap-3 rounded-xl border px-4 py-2.5', meta.bg)}>
                    <span className="text-base">{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', meta.color)}>{task.title}</p>
                      <p className="text-[11px] text-slate-500">{task.lead_name || '—'} · {task.responsible_name || 'Sem responsável'}</p>
                    </div>
                    <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOT[task.priority])} />
                    <button onClick={() => completeTask(task.id)}
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {selectedDay && (
        <DayPanel date={selectedDay} tasks={selectedTasks}
          onClose={() => setSelectedDay(null)} onComplete={completeTask} />
      )}
    </div>
  )
}
