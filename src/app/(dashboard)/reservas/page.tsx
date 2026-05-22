'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle, Clock, Edit3,
  Loader2, Plus, RefreshCw, Search, Shield,
  Timer, Trash2, TrendingUp, X, XCircle,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReservaStatus = 'ativa' | 'expirada' | 'convertida' | 'cancelada'

type Reserva = {
  id: string
  lead_id?: string
  lead_name?: string
  lead_phone?: string
  lot_id: string
  lot_number?: string
  quadra?: string
  area_m2: number
  preco_lista: number
  status: ReservaStatus
  responsavel_name?: string
  expires_at: string
  converted_at?: string
  cancelled_at?: string
  cancel_reason?: string
  observacoes?: string
  created_by_name?: string
  created_at: string
  minutes_remaining: number | null
}

type Stats = {
  ativas: string; expiradas: string; convertidas: string
  canceladas: string; expirando_em_breve: string
}

type CrmLead   = { id: string; name: string; phone: string }
type CrmUser   = { id: string; name: string }

type NovaReservaForm = {
  lead_id: string; lot_id: string; lot_number: string; quadra: string
  area_m2: string; preco_lista: string; sla_horas: string; observacoes: string
  responsavel_id: string
}

const EMPTY_FORM: NovaReservaForm = {
  lead_id: '', lot_id: '', lot_number: '', quadra: '',
  area_m2: '', preco_lista: '', sla_horas: '48', observacoes: '', responsavel_id: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(v?: string) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function SlaTimer({ minutes }: { minutes: number | null }) {
  if (minutes === null) return <span className="text-slate-400 text-xs">—</span>
  if (minutes <= 0) return <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><Timer className="h-3 w-3" />Expirada</span>
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const urgent = minutes < 120
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
      urgent ? 'text-red-600' : minutes < 480 ? 'text-amber-600' : 'text-emerald-600')}>
      <Timer className="h-3 w-3" />
      {h > 0 ? `${h}h ${m}min` : `${m}min`}
    </span>
  )
}

const STATUS_META: Record<ReservaStatus, { label: string; className: string; icon: React.ElementType }> = {
  ativa:      { label: 'Ativa',      className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle },
  expirada:   { label: 'Expirada',   className: 'bg-red-50 text-red-700 border-red-200',             icon: XCircle    },
  convertida: { label: 'Convertida', className: 'bg-blue-50 text-blue-700 border-blue-200',          icon: TrendingUp },
  cancelada:  { label: 'Cancelada',  className: 'bg-slate-100 text-slate-500 border-slate-200',      icon: X          },
}

// ─── Nova Reserva Modal ───────────────────────────────────────────────────────

function NovaReservaModal({ leads, users, onClose, onSaved }: {
  leads: CrmLead[]; users: CrmUser[]
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<NovaReservaForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: keyof NovaReservaForm, v: string) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.lot_id.trim()) { setError('Informe o ID do lote'); return }
    setSaving(true); setError('')
    try {
      await apiClient.post('/reservas', {
        ...form,
        area_m2:    form.area_m2    ? Number(form.area_m2)    : null,
        preco_lista:form.preco_lista? Number(form.preco_lista) : null,
        sla_horas:  Number(form.sla_horas) || 48,
      })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg || 'Erro ao salvar reserva')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Nova Reserva</h2>
            <p className="text-xs text-slate-500 mt-0.5">Bloqueio temporário com SLA e anti-dupla venda</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Lead (cliente)</label>
              <select value={form.lead_id} onChange={e => set('lead_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">Sem lead vinculado</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name} — {l.phone}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Responsável</label>
              <select value={form.responsavel_id} onChange={e => set('responsavel_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">Nenhum</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">ID do Lote *</label>
              <input value={form.lot_id} onChange={e => set('lot_id', e.target.value)}
                placeholder="ex.: A-03" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Nº do Lote</label>
              <input value={form.lot_number} onChange={e => set('lot_number', e.target.value)}
                placeholder="03" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Quadra</label>
              <input value={form.quadra} onChange={e => set('quadra', e.target.value)}
                placeholder="A" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Área (m²)</label>
              <input type="number" value={form.area_m2} onChange={e => set('area_m2', e.target.value)}
                placeholder="300" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Preço de tabela (R$)</label>
              <input type="number" value={form.preco_lista} onChange={e => set('preco_lista', e.target.value)}
                placeholder="85000" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">SLA — validade da reserva</label>
            <div className="flex gap-2">
              {[['24','24h'],['48','48h'],['72','72h'],['168','7 dias']].map(([v,l]) => (
                <button key={v} onClick={() => set('sla_horas', v)}
                  className={cn('flex-1 rounded-lg border py-1.5 text-xs font-medium',
                    form.sla_horas === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Observações</label>
            <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)}
              rows={2} placeholder="Condições especiais, motivo da reserva..."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-200">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void handleSave()} disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Criar Reserva'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Modal ─────────────────────────────────────────────────────────────

function CancelModal({ reserva, onClose, onSaved }: { reserva: Reserva; onClose: () => void; onSaved: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCancel() {
    setSaving(true)
    try {
      await apiClient.patch(`/reservas/${reserva.id}/cancel`, { cancel_reason: motivo })
      onSaved()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold text-slate-900">Cancelar reserva</h2>
        <p className="mb-4 text-xs text-slate-500">Lote {reserva.lot_id} — {reserva.lead_name || 'sem lead'}</p>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
          placeholder="Motivo do cancelamento..."
          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400" />
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">Voltar</button>
          <button onClick={() => void handleCancel()} disabled={saving}
            className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? '...' : 'Confirmar cancelamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReservasPage() {
  const [reservas, setReservas]     = useState<Reserva[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [leads, setLeads]           = useState<CrmLead[]>([])
  const [users, setUsers]           = useState<CrmUser[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ativa')
  const [search, setSearch]         = useState('')
  const [novaOpen, setNovaOpen]     = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Reserva | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [resRes, statsRes, leadsRes, usersRes] = await Promise.all([
        apiClient.get(`/reservas?status=${statusFilter}`),
        apiClient.get('/reservas/stats'),
        apiClient.get('/crm/leads'),
        apiClient.get('/crm/users'),
      ])
      setReservas((resRes.data as { data: Reserva[] }).data || [])
      setStats((statsRes.data as { data: Stats }).data)
      setLeads((leadsRes.data as { data: CrmLead[] }).data || [])
      setUsers((usersRes.data as { data: CrmUser[] }).data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { void loadAll() }, [loadAll])

  async function handleExtend(r: Reserva) {
    await apiClient.patch(`/reservas/${r.id}/extend`, { horas: 24 }).catch(() => {})
    void loadAll()
  }

  const filtered = reservas.filter(r => {
    if (!search) return true
    return `${r.lead_name} ${r.lot_id} ${r.quadra} ${r.responsavel_name}`.toLowerCase().includes(search.toLowerCase())
  })

  const expirando = reservas.filter(r => r.status === 'ativa' && (r.minutes_remaining ?? Infinity) < 120).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reservas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Bloqueio temporário de lotes com SLA, histórico e trava anti-dupla venda.</p>
        </div>
        <button onClick={() => setNovaOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Nova Reserva
        </button>
      </div>

      {/* Alert: expiring soon */}
      {expirando > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>{expirando}</strong> reserva(s) expira(m) em menos de 2 horas. Revise ou cancele para liberar o lote.</span>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: 'Ativas',      value: stats.ativas,      color: 'text-emerald-600', filter: 'ativa'     },
            { label: 'Expirando',   value: stats.expirando_em_breve, color: 'text-amber-600', filter: 'ativa' },
            { label: 'Expiradas',   value: stats.expiradas,   color: 'text-red-600',     filter: 'expirada'  },
            { label: 'Convertidas', value: stats.convertidas, color: 'text-blue-600',    filter: 'convertida'},
            { label: 'Canceladas',  value: stats.canceladas,  color: 'text-slate-500',   filter: 'cancelada' },
          ].map(s => (
            <button key={s.label} onClick={() => setStatusFilter(s.filter)}
              className={cn('rounded-xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition-all',
                statusFilter === s.filter ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100')}>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold', s.color)}>{s.value}</p>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lead, lote, quadra..."
            className="bg-transparent text-sm outline-none placeholder:text-slate-400 w-52" />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-slate-200 bg-white">
          {[['all','Todos'],['ativa','Ativas'],['expirada','Expiradas'],['convertida','Convertidas'],['cancelada','Canceladas']].map(([v,l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={cn('px-3 py-1.5 text-xs font-medium', statusFilter === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
              {l}
            </button>
          ))}
        </div>
        <button onClick={loadAll} className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {/* Anti-dupla-venda badge */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Shield className="h-3.5 w-3.5 text-blue-500" />
        Proteção anti-dupla venda ativa — um lote não pode ter duas reservas simultâneas.
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12 text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                {['Lote','Cliente / Lead','Responsável','Preço tabela','Status','SLA restante','Criada em','Ações'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(r => {
                const meta = STATUS_META[r.status]
                const Icon = meta.icon
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">Qd {r.quadra} — Lote {r.lot_number || r.lot_id}</p>
                      {r.area_m2 > 0 && <p className="text-xs text-slate-400">{r.area_m2} m²</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{r.lead_name || <span className="italic text-slate-400">Sem lead</span>}</p>
                      <p className="text-xs text-slate-400">{r.lead_phone || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.responsavel_name || '—'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-800">{r.preco_lista > 0 ? brl(r.preco_lista) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
                        <Icon className="h-3 w-3" />{meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.status === 'ativa' ? <SlaTimer minutes={r.minutes_remaining} /> : (
                        <span className="text-xs text-slate-400">{fmtDate(r.expires_at)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {r.status === 'ativa' && (
                          <>
                            <button onClick={() => void handleExtend(r)} title="Prorrogar 24h"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                              <Clock className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setCancelTarget(r)} title="Cancelar reserva"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!filtered.length && (
            <div className="py-14 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">Nenhuma reserva encontrada</p>
            </div>
          )}
        </div>
      )}

      {novaOpen && (
        <NovaReservaModal leads={leads} users={users} onClose={() => setNovaOpen(false)} onSaved={() => { setNovaOpen(false); void loadAll() }} />
      )}
      {cancelTarget && (
        <CancelModal reserva={cancelTarget} onClose={() => setCancelTarget(null)} onSaved={() => { setCancelTarget(null); void loadAll() }} />
      )}
    </div>
  )
}
