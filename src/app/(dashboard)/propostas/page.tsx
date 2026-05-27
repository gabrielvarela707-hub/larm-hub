'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle, ChevronDown,
  Clock, Edit3, Loader2, Plus, RefreshCw,
  Search, TrendingUp, X, XCircle,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type PropostaStatus =
  | 'rascunho' | 'aguardando_aprovacao' | 'aprovada'
  | 'recusada' | 'expirada' | 'cancelada' | 'convertida'

type FinTipo = 'price' | 'sac' | 'avista' | 'permuta'

type Proposta = {
  id: string; numero: number
  lead_id?: string; lead_name?: string; lead_phone?: string
  reserva_id?: string
  lot_id?: string; lot_number?: string; quadra?: string
  area_m2: number; empreendimento_id?: string
  preco_lista: number; preco_negociado: number; desconto_pct: number
  entrada_pct: number; entrada_valor: number
  parcelas: number; taxa_juros_mes: number; financiamento_tipo: FinTipo
  status: PropostaStatus; requer_aprovacao: boolean
  aprovado_por?: string; aprovado_por_name?: string; aprovado_em?: string
  motivo_recusa?: string
  validade_dias: number; expires_at?: string
  observacoes?: string; condicoes_especiais?: string
  responsavel_id?: string; responsavel_name?: string
  created_by_name?: string; created_at: string; updated_at: string
}

type Stats = {
  rascunhos: string; aguardando: string; aprovadas: string
  recusadas: string; convertidas: string
  pipeline_aprovado: string; desconto_medio: string
}

type CrmLead = { id: string; name: string; phone: string }
type CrmUser = { id: string; name: string }
type Reserva = { id: string; lot_id: string; lot_number?: string; quadra?: string; lead_name?: string; preco_lista: number }

type PropostaForm = {
  lead_id: string; reserva_id: string
  lot_id: string; lot_number: string; quadra: string; area_m2: string
  preco_lista: string; preco_negociado: string
  entrada_pct: string; parcelas: string; taxa_juros_mes: string
  financiamento_tipo: FinTipo; validade_dias: string
  observacoes: string; condicoes_especiais: string; responsavel_id: string
}

const EMPTY_FORM: PropostaForm = {
  lead_id: '', reserva_id: '', lot_id: '', lot_number: '', quadra: '', area_m2: '',
  preco_lista: '', preco_negociado: '', entrada_pct: '20', parcelas: '120',
  taxa_juros_mes: '0.89', financiamento_tipo: 'price', validade_dias: '7',
  observacoes: '', condicoes_especiais: '', responsavel_id: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(v?: string) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function calcPrice(pv: number, taxa: number, n: number): number {
  if (taxa === 0) return pv / n
  return pv * (taxa * Math.pow(1 + taxa, n)) / (Math.pow(1 + taxa, n) - 1)
}

const STATUS_META: Record<PropostaStatus, { label: string; className: string; icon: React.ElementType }> = {
  rascunho:             { label: 'Rascunho',          className: 'bg-slate-100 text-slate-600 border-slate-200',       icon: Edit3         },
  aguardando_aprovacao: { label: 'Aguard. aprovação', className: 'bg-amber-50 text-amber-700 border-amber-200',        icon: Clock         },
  aprovada:             { label: 'Aprovada',           className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle   },
  recusada:             { label: 'Recusada',           className: 'bg-red-50 text-red-700 border-red-200',             icon: XCircle       },
  expirada:             { label: 'Expirada',           className: 'bg-slate-100 text-slate-500 border-slate-200',      icon: XCircle       },
  cancelada:            { label: 'Cancelada',          className: 'bg-slate-100 text-slate-500 border-slate-200',      icon: X             },
  convertida:           { label: 'Convertida',         className: 'bg-blue-50 text-blue-700 border-blue-200',          icon: TrendingUp    },
}

const FIN_LABELS: Record<FinTipo, string> = { price: 'Price', sac: 'SAC', avista: 'À vista', permuta: 'Permuta' }

// ─── Proposta Detail Modal ────────────────────────────────────────────────────

function PropostaDetailModal({ proposta, onClose, onAction }: {
  proposta: Proposta; onClose: () => void; onAction: () => void
}) {
  const [motivoRecusa, setMotivoRecusa] = useState('')
  const [showRecusaInput, setShowRecusaInput] = useState(false)
  const [acting, setActing] = useState(false)

  const valorFinanciado = proposta.preco_negociado - proposta.entrada_valor
  const parcela = proposta.financiamento_tipo !== 'avista' && proposta.parcelas > 0
    ? calcPrice(valorFinanciado, proposta.taxa_juros_mes / 100, proposta.parcelas)
    : 0

  async function aprovar() {
    setActing(true)
    try { await apiClient.patch(`/propostas/${proposta.id}/aprovar`); onAction() }
    catch { /* ignore */ } finally { setActing(false) }
  }

  async function recusar() {
    setActing(true)
    try { await apiClient.patch(`/propostas/${proposta.id}/recusar`, { motivo: motivoRecusa }); onAction() }
    catch { /* ignore */ } finally { setActing(false) }
  }

  async function converter() {
    setActing(true)
    try { await apiClient.patch(`/propostas/${proposta.id}/converter`); onAction() }
    catch { /* ignore */ } finally { setActing(false) }
  }

  const meta = STATUS_META[proposta.status]
  const Icon = meta.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Proposta #{String(proposta.numero).padStart(4, '0')}</h2>
              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
                <Icon className="h-3 w-3" />{meta.label}
              </span>
              {proposta.requer_aprovacao && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  Requer aprovação
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Criada por {proposta.created_by_name || '—'} em {fmtDate(proposta.created_at)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Cliente + Lote */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Cliente</p>
              <p className="font-semibold text-slate-900">{proposta.lead_name || '—'}</p>
              <p className="text-sm text-slate-500">{proposta.lead_phone || ''}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Lote</p>
              <p className="font-semibold text-slate-900">Qd {proposta.quadra} — Lote {proposta.lot_number || proposta.lot_id}</p>
              <p className="text-sm text-slate-500">{proposta.area_m2 > 0 ? `${proposta.area_m2} m²` : ''}</p>
            </div>
          </div>

          {/* Pricing */}
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Valores</p>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Preço de tabela',  value: brl(proposta.preco_lista),     color: 'text-slate-700' },
                { label: 'Preço negociado',  value: brl(proposta.preco_negociado), color: 'text-slate-900 font-bold' },
                { label: 'Desconto',         value: `${proposta.desconto_pct.toFixed(1)}%`,
                  color: proposta.desconto_pct > 5 ? 'text-red-600 font-bold' : 'text-emerald-600' },
                { label: 'Validade',         value: `${proposta.validade_dias} dias`, color: 'text-slate-600' },
              ].map(c => (
                <div key={c.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-500">{c.label}</p>
                  <p className={cn('mt-0.5 text-sm', c.color)}>{c.value}</p>
                </div>
              ))}
            </div>

            {proposta.desconto_pct > 5 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Desconto acima de 5% — aprovação de gerência requerida.
              </div>
            )}
          </div>

          {/* Payment conditions */}
          {proposta.financiamento_tipo !== 'avista' && (
            <div className="rounded-xl border border-slate-100 bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Condições de pagamento</p>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  { label: 'Tipo',           value: FIN_LABELS[proposta.financiamento_tipo] },
                  { label: 'Entrada',        value: `${proposta.entrada_pct}% = ${brl(proposta.entrada_valor)}` },
                  { label: 'Parcelas',       value: `${proposta.parcelas}x` },
                  { label: 'Parcela aprox.', value: proposta.parcelas > 0 ? brl(parcela) : '—' },
                ].map(c => (
                  <div key={c.label} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[10px] text-slate-500">{c.label}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-800">{c.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conditions / observations */}
          {(proposta.condicoes_especiais || proposta.observacoes) && (
            <div className="rounded-xl border border-slate-100 bg-white p-4 space-y-2">
              {proposta.condicoes_especiais && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Condições especiais</p>
                  <p className="text-sm text-slate-700">{proposta.condicoes_especiais}</p>
                </div>
              )}
              {proposta.observacoes && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Observações</p>
                  <p className="text-sm text-slate-600">{proposta.observacoes}</p>
                </div>
              )}
            </div>
          )}

          {/* Approval info */}
          {proposta.status === 'aprovada' && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle className="h-4 w-4" />
              Aprovada por <strong>{proposta.aprovado_por_name}</strong> em {fmtDate(proposta.aprovado_em)}
            </div>
          )}
          {proposta.status === 'recusada' && proposta.motivo_recusa && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Recusada: <strong>{proposta.motivo_recusa}</strong></span>
            </div>
          )}

          {/* Recusa input */}
          {showRecusaInput && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-xs font-medium text-red-800">Motivo da recusa</p>
              <textarea value={motivoRecusa} onChange={e => setMotivoRecusa(e.target.value)} rows={2}
                placeholder="Ex.: Preço abaixo do mínimo autorizado..."
                className="w-full resize-none rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none" />
              <div className="mt-2 flex gap-2">
                <button onClick={() => setShowRecusaInput(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">Cancelar</button>
                <button onClick={() => void recusar()} disabled={acting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {acting ? '...' : 'Confirmar recusa'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="border-t border-slate-100 px-6 py-4 flex flex-wrap gap-2 justify-end">
          {(proposta.status === 'rascunho' || proposta.status === 'aguardando_aprovacao') && (
            <>
              <button onClick={() => aprovar()} disabled={acting}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                <CheckCircle className="h-3.5 w-3.5" /> Aprovar
              </button>
              <button onClick={() => setShowRecusaInput(true)} disabled={acting}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                <XCircle className="h-3.5 w-3.5" /> Recusar
              </button>
            </>
          )}
          {proposta.status === 'aprovada' && (
            <button onClick={() => converter()} disabled={acting}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <TrendingUp className="h-3.5 w-3.5" /> Converter em Contrato
            </button>
          )}
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ─── Nova Proposta Modal ──────────────────────────────────────────────────────

function NovaPropostaModal({ leads, users, reservasAtivas, onClose, onSaved }: {
  leads: CrmLead[]; users: CrmUser[]; reservasAtivas: Reserva[]
  onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<PropostaForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: keyof PropostaForm, v: string) { setForm(f => ({ ...f, [k]: v })) }

  const precoNeg    = Number(form.preco_negociado) || 0
  const precoLista  = Number(form.preco_lista) || 0
  const descontoPct = precoLista > 0 ? ((precoLista - precoNeg) / precoLista * 100) : 0
  const entradaVal  = precoNeg * (Number(form.entrada_pct) / 100)
  const valorFin    = precoNeg - entradaVal
  const parcela     = form.financiamento_tipo !== 'avista' && Number(form.parcelas) > 0
    ? calcPrice(valorFin, Number(form.taxa_juros_mes) / 100, Number(form.parcelas)) : 0

  function handleReservaChange(reservaId: string) {
    set('reserva_id', reservaId)
    if (!reservaId) return
    const r = reservasAtivas.find(r => r.id === reservaId)
    if (!r) return
    set('lot_id', r.lot_id)
    if (r.lot_number) set('lot_number', r.lot_number)
    if (r.quadra) set('quadra', r.quadra)
    if (r.preco_lista > 0) { set('preco_lista', String(r.preco_lista)); set('preco_negociado', String(r.preco_lista)) }
  }

  async function handleSave() {
    if (!form.preco_lista || !form.preco_negociado) { setError('Preços obrigatórios'); return }
    setSaving(true); setError('')
    try {
      await apiClient.post('/propostas', { ...form,
        preco_lista: Number(form.preco_lista), preco_negociado: Number(form.preco_negociado),
        entrada_pct: Number(form.entrada_pct), parcelas: Number(form.parcelas),
        taxa_juros_mes: Number(form.taxa_juros_mes), area_m2: Number(form.area_m2) || null,
        validade_dias: Number(form.validade_dias),
      })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Nova Proposta</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Link to reserva */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Vincular a reserva existente (opcional)</label>
            <select value={form.reserva_id} onChange={e => handleReservaChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
              <option value="">Sem reserva vinculada</option>
              {reservasAtivas.map(r => <option key={r.id} value={r.id}>Qd {r.quadra} Lote {r.lot_number || r.lot_id} — {r.lead_name || 'sem lead'}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Lead (cliente)</label>
              <select value={form.lead_id} onChange={e => set('lead_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">Selecionar lead</option>
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
            <div><label className="mb-1 block text-xs font-medium text-slate-700">ID do Lote</label>
              <input value={form.lot_id} onChange={e => set('lot_id', e.target.value)} placeholder="A-03"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Nº Lote</label>
              <input value={form.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder="03"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Quadra</label>
              <input value={form.quadra} onChange={e => set('quadra', e.target.value)} placeholder="A"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Preço de tabela (R$)</label>
              <input type="number" value={form.preco_lista} onChange={e => set('preco_lista', e.target.value)} placeholder="85000"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Preço negociado (R$)</label>
              <input type="number" value={form.preco_negociado} onChange={e => set('preco_negociado', e.target.value)} placeholder="82000"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          {/* Desconto indicator */}
          {precoNeg > 0 && precoLista > 0 && (
            <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-xs border',
              descontoPct > 5 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800')}>
              {descontoPct > 5 && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              Desconto de <strong>{descontoPct.toFixed(1)}%</strong>
              {descontoPct > 5 ? ' — esta proposta será encaminhada para aprovação de gerência.' : ' — dentro do limite autorizado.'}
            </div>
          )}

          {/* Payment conditions */}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Financiamento</label>
              <select value={form.financiamento_tipo} onChange={e => set('financiamento_tipo', e.target.value as FinTipo)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
                <option value="price">Price</option>
                <option value="sac">SAC</option>
                <option value="avista">À vista</option>
                <option value="permuta">Permuta</option>
              </select></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Entrada (%)</label>
              <input type="number" value={form.entrada_pct} onChange={e => set('entrada_pct', e.target.value)} min="0" max="100"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Nº de parcelas</label>
              <input type="number" value={form.parcelas} onChange={e => set('parcelas', e.target.value)} min="1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Taxa/mês (%)</label>
              <input type="number" value={form.taxa_juros_mes} onChange={e => set('taxa_juros_mes', e.target.value)} step="0.01"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          {/* Payment summary */}
          {precoNeg > 0 && form.financiamento_tipo !== 'avista' && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Entrada',        value: brl(entradaVal) },
                { label: 'Valor financiado',value: brl(valorFin) },
                { label: 'Parcela aprox.', value: brl(parcela) },
              ].map(c => (
                <div key={c.label} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-500">{c.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-800">{c.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Validade (dias)</label>
              <input type="number" value={form.validade_dias} onChange={e => set('validade_dias', e.target.value)} min="1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Área (m²)</label>
              <input type="number" value={form.area_m2} onChange={e => set('area_m2', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          <div><label className="mb-1 block text-xs font-medium text-slate-700">Condições especiais</label>
            <textarea value={form.condicoes_especiais} onChange={e => set('condicoes_especiais', e.target.value)} rows={2}
              placeholder="Descontos adicionais, permutas, prazos diferenciados..."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>

          <div><label className="mb-1 block text-xs font-medium text-slate-700">Observações internas</label>
            <textarea value={form.observacoes} onChange={e => set('observacoes', e.target.value)} rows={2}
              placeholder="Notas para a equipe..."
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-4 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void handleSave()} disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Criar Proposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PropostasPage() {
  const [propostas, setPropostas]   = useState<Proposta[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [leads, setLeads]           = useState<CrmLead[]>([])
  const [users, setUsers]           = useState<CrmUser[]>([])
  const [reservasAtivas, setReservasAtivas] = useState<Reserva[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch]         = useState('')
  const [novaOpen, setNovaOpen]     = useState(false)
  const [detail, setDetail]         = useState<Proposta | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [pRes, sRes, lRes, uRes, rRes] = await Promise.all([
        apiClient.get(`/propostas?status=${statusFilter}`),
        apiClient.get('/propostas/stats'),
        apiClient.get('/crm/leads'),
        apiClient.get('/crm/users'),
        apiClient.get('/reservas?status=ativa'),
      ])
      setPropostas((pRes.data as { data: Proposta[] }).data || [])
      setStats((sRes.data as { data: Stats }).data)
      setLeads((lRes.data as { data: CrmLead[] }).data || [])
      setUsers((uRes.data as { data: CrmUser[] }).data || [])
      setReservasAtivas((rRes.data as { data: Reserva[] }).data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { void loadAll() }, [loadAll])

  const filtered = propostas.filter(p => {
    if (!search) return true
    return `${p.lead_name} ${p.lot_id} ${p.quadra} ${p.responsavel_name} ${p.numero}`.toLowerCase().includes(search.toLowerCase())
  })

  const aguardando = propostas.filter(p => p.status === 'aguardando_aprovacao').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Propostas</h1>
          <p className="mt-0.5 text-sm text-slate-500">Preço, condição, alçadas de aprovação e workflow até o contrato.</p>
        </div>
        <button onClick={() => setNovaOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Nova Proposta
        </button>
      </div>

      {aguardando > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          <span><strong>{aguardando}</strong> proposta(s) aguardando aprovação de gerência.</span>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: 'Rascunhos',    value: stats.rascunhos,    color: 'text-slate-600', filter: 'rascunho' },
            { label: 'Aguardando',   value: stats.aguardando,   color: 'text-amber-600', filter: 'aguardando_aprovacao' },
            { label: 'Aprovadas',    value: stats.aprovadas,    color: 'text-emerald-600', filter: 'aprovada' },
            { label: 'Recusadas',    value: stats.recusadas,    color: 'text-red-600',   filter: 'recusada' },
            { label: 'Convertidas',  value: stats.convertidas,  color: 'text-blue-600',  filter: 'convertida' },
          ].map(s => (
            <button key={s.label} onClick={() => setStatusFilter(statusFilter === s.filter ? 'all' : s.filter)}
              className={cn('rounded-xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition-all',
                statusFilter === s.filter ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100')}>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold', s.color)}>{s.value}</p>
            </button>
          ))}
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Pipeline aprovado</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{brl(Number(stats.pipeline_aprovado))}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">Desconto médio concedido</p>
            <p className="mt-1 text-xl font-bold text-slate-800">{Number(stats.desconto_medio).toFixed(1)}%</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lead, lote, número..."
            className="bg-transparent text-sm outline-none placeholder:text-slate-400 w-52" />
        </div>
        <button onClick={loadAll} className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-sm text-slate-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/70">
              <tr>
                {['Nº','Lote','Cliente','Preço negociado','Desconto','Parcelas','Status','Responsável','Ações'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(p => {
                const meta = STATUS_META[p.status]
                const Icon = meta.icon
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 cursor-pointer" onClick={() => setDetail(p)}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">#{String(p.numero).padStart(4,'0')}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">Qd {p.quadra} — L{p.lot_number || p.lot_id}</p>
                      <p className="text-xs text-slate-400">{p.area_m2 > 0 ? `${p.area_m2} m²` : ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{p.lead_name || <span className="italic text-slate-400">Sem lead</span>}</p>
                      <p className="text-xs text-slate-400">{p.lead_phone || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{brl(p.preco_negociado)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-sm font-semibold', p.desconto_pct > 5 ? 'text-red-600' : 'text-slate-600')}>
                        {p.desconto_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {p.financiamento_tipo === 'avista' ? 'À vista' : `${p.parcelas}x — ${FIN_LABELS[p.financiamento_tipo]}`}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
                        <Icon className="h-3 w-3" />{meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{p.responsavel_name || '—'}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setDetail(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="py-14 text-center">
              <TrendingUp className="mx-auto mb-2 h-8 w-8 text-slate-200" />
              <p className="text-sm text-slate-400">Nenhuma proposta encontrada</p>
            </div>
          )}
        </div>
      )}

      {novaOpen && (
        <NovaPropostaModal leads={leads} users={users} reservasAtivas={reservasAtivas}
          onClose={() => setNovaOpen(false)} onSaved={() => { setNovaOpen(false); void loadAll() }} />
      )}
      {detail && (
        <PropostaDetailModal proposta={detail} onClose={() => setDetail(null)} onAction={() => { setDetail(null); void loadAll() }} />
      )}
    </div>
  )
}
