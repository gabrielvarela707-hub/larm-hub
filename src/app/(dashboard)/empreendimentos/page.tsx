'use client'

import type { ElementType } from 'react'
import { useState, useMemo } from 'react'
import {
  Plus, Search, Filter, LayoutGrid, List, Star, StarOff,
  ChevronDown, ChevronRight, X, Save, Calendar,
  User, Phone, FileText, MapPin, Ruler, DollarSign,
  TrendingUp, Clock, AlertCircle, Shield, Check,
  Building2, Eye, Pencil, MoreHorizontal,
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import {
  LOT_STATUS_COLOR, LOT_STATUS_LABEL, LOT_STATUS_GROUP,
  type Lot, type LotStatus,
} from '@/types'
import { SANTA_CLARA } from '@/lib/empreendimento-data'

// ─── Status config ────────────────────────────────────────────────────────────

const ALL_STATUSES: LotStatus[] = [
  'livre','reservado','adimplente','inadimplente',
  'em_atraso','juridico','quitado','permutado','bloqueado',
]

const STATUS_ICON: Record<LotStatus, ElementType> = {
  livre:        Check,
  reservado:    Clock,
  adimplente:   TrendingUp,
  inadimplente: AlertCircle,
  em_atraso:    AlertCircle,
  juridico:     Shield,
  quitado:      Check,
  permutado:    Building2,
  bloqueado:    X,
}

// ─── Lot detail drawer ────────────────────────────────────────────────────────

function LotDrawer({ lot, onClose, onSave }: {
  lot: Lot
  onClose: () => void
  onSave: (updated: Lot) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState<Lot>(lot)
  const [tab, setTab]         = useState<'info'|'preco'|'reserva'|'venda'>('info')

  const p = draft.pricing

  function field(label: string, value: string, onChange?: (v: string) => void) {
    return (
      <div>
        <label className="block text-xs text-slate-500 mb-1">{label}</label>
        {editing && onChange ? (
          <input value={value} onChange={e => onChange(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        ) : (
          <p className="text-sm text-slate-800 font-medium">{value || '—'}</p>
        )}
      </div>
    )
  }

  function selectStatus() {
    if (!editing) return null
    return (
      <div>
        <label className="block text-xs text-slate-500 mb-1">Status</label>
        <select value={draft.status}
          onChange={e => setDraft(d => ({ ...d, status: e.target.value as LotStatus }))}
          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
          {ALL_STATUSES.map(s => <option key={s} value={s}>{LOT_STATUS_LABEL[s]}</option>)}
        </select>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-900 flex-shrink-0">
          <div>
            <p className="text-white font-semibold">Quadra {lot.quadra} — Lote {lot.number}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', LOT_STATUS_COLOR[draft.status])}>
                {LOT_STATUS_LABEL[draft.status]}
              </span>
              {lot.destaqueLP && (
                <span className="text-[11px] bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-semibold">
                  Destaque LP
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setDraft(lot) }}
                  className="text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/20 text-xs transition-colors">
                  Cancelar
                </button>
                <button onClick={() => { onSave(draft); setEditing(false) }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                  <Save className="w-3.5 h-3.5" /> Salvar
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="text-slate-400 hover:text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 flex-shrink-0">
          {[
            { id: 'info',   label: 'Informacoes' },
            { id: 'preco',  label: 'Precificacao' },
            { id: 'reserva', label: 'Reserva' },
            { id: 'venda',  label: 'Venda' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
              className={cn('flex-1 py-2.5 text-xs font-medium transition-colors border-b-2',
                tab === t.id
                  ? 'text-blue-600 border-blue-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── Info ── */}
          {tab === 'info' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {field('Quadra', draft.quadra)}
                {field('Numero', draft.number)}
                {field('Area (m2)', String(draft.area), v => setDraft(d => ({ ...d, area: Number(v) })))}
                {field('Orientacao', draft.facing, v => setDraft(d => ({ ...d, facing: v })))}
              </div>
              {selectStatus()}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Observacoes</label>
                {editing ? (
                  <textarea value={draft.observacoes ?? ''} rows={3}
                    onChange={e => setDraft(d => ({ ...d, observacoes: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                ) : (
                  <p className="text-sm text-slate-700">{draft.observacoes || '—'}</p>
                )}
              </div>
              <div className="flex items-center justify-between py-2 border-t border-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">Destaque na Landing Page</p>
                  <p className="text-xs text-slate-400">Exibe este lote em destaque no site</p>
                </div>
                <button onClick={() => editing && setDraft(d => ({ ...d, destaqueLP: !d.destaqueLP }))}
                  className={cn('relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    draft.destaqueLP ? 'bg-blue-600' : 'bg-slate-200',
                    !editing && 'pointer-events-none'
                  )}>
                  <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                    draft.destaqueLP ? 'translate-x-6' : 'translate-x-1'
                  )} />
                </button>
              </div>
              {(draft.destaqueLP && editing) && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Tag da LP</label>
                  <input value={draft.tagLP ?? ''} onChange={e => setDraft(d => ({ ...d, tagLP: e.target.value }))}
                    placeholder="ex: Ultima unidade, Melhor localizacao..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              )}
            </>
          )}

          {/* ── Precificacao ── */}
          {tab === 'preco' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-xs text-emerald-600 font-medium mb-1">Preco a Vista</p>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(p.precoAVista)}</p>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs text-blue-600 font-medium mb-1">Preco a Prazo</p>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(p.precoAPrazo)}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Entrada</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Tipo</span>
                    <span className="font-medium text-slate-800">
                      {p.entradaTipo === 'ato_unico' ? 'Ato unico' : `${p.entradaParcelas}x parcelado`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Valor total</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(p.entradaValor)}</span>
                  </div>
                  {p.entradaTipo === 'parcelada' && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">{p.entradaParcelas}x de</span>
                      <span className="font-semibold text-blue-700">{formatCurrency(p.entradaValorParcela)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Parcelas Intermediarias</p>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{p.intermediarias}x parcelas de</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(p.intermediariaValor)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Apos a entrada, antes das mensais</p>
                </div>
              </div>

              <div className="bg-white border border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Opcoes de Financiamento</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {p.financiamentoOpcoes.map(opt => (
                    <div key={opt.parcelas} className="flex items-center justify-between p-4 text-sm">
                      <div>
                        <span className="font-semibold text-slate-900">{opt.parcelas}x</span>
                        <span className="text-slate-500 ml-2">mensais de</span>
                      </div>
                      <span className="font-bold text-blue-700 text-base">{formatCurrency(opt.valorParcela)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {editing && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                  Edicao de precificacao disponivel na proxima versao. Os valores sao calculados automaticamente com base no preco por m2 configurado no empreendimento.
                </div>
              )}
            </>
          )}

          {/* ── Reserva ── */}
          {tab === 'reserva' && (
            <>
              {draft.status === 'reservado' ? (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">Lote reservado</span>
                    </div>
                    {[
                      { label: 'Reservado por', value: draft.reservadoPor ?? '', onChange: (v: string) => setDraft(d => ({ ...d, reservadoPor: v })) },
                      { label: 'Corretor responsavel', value: draft.reservadoCorretor ?? '', onChange: (v: string) => setDraft(d => ({ ...d, reservadoCorretor: v })) },
                    ].map(f => field(f.label, f.value, f.onChange))}
                    <div className="mt-3">
                      <label className="block text-xs text-slate-500 mb-1">Reservado ate</label>
                      {editing ? (
                        <input type="datetime-local" value={draft.reservadoAte?.slice(0,16) ?? ''}
                          onChange={e => setDraft(d => ({ ...d, reservadoAte: new Date(e.target.value).toISOString() }))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                      ) : (
                        <p className="text-sm font-medium text-slate-800">
                          {draft.reservadoAte ? formatDate(draft.reservadoAte) : '—'}
                        </p>
                      )}
                    </div>
                  </div>
                  {editing && (
                    <button onClick={() => setDraft(d => ({ ...d, status: 'livre', reservadoPor: undefined, reservadoAte: undefined, reservadoCorretor: undefined }))}
                      className="w-full border border-red-200 text-red-600 hover:bg-red-50 rounded-lg py-2 text-sm transition-colors">
                      Cancelar reserva
                    </button>
                  )}
                </div>
              ) : draft.status === 'livre' && editing ? (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800">
                    Preencha os dados para reservar este lote
                  </div>
                  {[
                    { label: 'Nome do interessado', value: draft.reservadoPor ?? '', onChange: (v: string) => setDraft(d => ({ ...d, reservadoPor: v })) },
                    { label: 'Corretor', value: draft.reservadoCorretor ?? '', onChange: (v: string) => setDraft(d => ({ ...d, reservadoCorretor: v })) },
                  ].map(f => field(f.label, f.value, f.onChange))}
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Validade da reserva</label>
                    <input type="datetime-local" onChange={e => setDraft(d => ({ ...d, reservadoAte: new Date(e.target.value).toISOString() }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm" />
                  </div>
                  <button onClick={() => setDraft(d => ({ ...d, status: 'reservado' }))}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-2 text-sm font-medium transition-colors">
                    Reservar lote
                  </button>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  {draft.status === 'livre' ? 'Lote livre — entre em modo de edicao para reservar' : 'Este lote nao esta reservado'}
                </div>
              )}
            </>
          )}

          {/* ── Venda ── */}
          {tab === 'venda' && (
            <>
              {['adimplente','inadimplente','em_atraso','juridico','quitado'].includes(draft.status) ? (
                <div className="space-y-4">
                  <div className={cn('border rounded-xl p-4', LOT_STATUS_COLOR[draft.status])}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold">{LOT_STATUS_LABEL[draft.status]}</span>
                    </div>
                    {draft.vendaData && <p className="text-xs opacity-70">Venda em {formatDate(draft.vendaData)}</p>}
                  </div>
                  {[
                    { label: 'Comprador', value: draft.compradorNome ?? '', onChange: (v: string) => setDraft(d => ({ ...d, compradorNome: v })) },
                    { label: 'CPF', value: draft.compradorCpf ?? '', onChange: (v: string) => setDraft(d => ({ ...d, compradorCpf: v })) },
                    { label: 'Telefone', value: draft.compradorTelefone ?? '', onChange: (v: string) => setDraft(d => ({ ...d, compradorTelefone: v })) },
                  ].map(f => field(f.label, f.value, f.onChange))}
                  {draft.contratoId && (
                    <div className="flex items-center justify-between border border-slate-100 rounded-xl p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-700">Contrato #{draft.contratoId}</span>
                      </div>
                      <button className="text-xs text-blue-600 hover:underline">Ver contrato</button>
                    </div>
                  )}
                  {editing && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Alterar status financeiro</label>
                      <select value={draft.status}
                        onChange={e => setDraft(d => ({ ...d, status: e.target.value as LotStatus }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                        {(['adimplente','inadimplente','em_atraso','juridico','quitado'] as LotStatus[]).map(s => (
                          <option key={s} value={s}>{LOT_STATUS_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Este lote ainda nao foi vendido
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

function LotCard({ lot, onClick }: { lot: Lot; onClick: () => void }) {
  const Icon = STATUS_ICON[lot.status]
  const p    = lot.pricing

  return (
    <div onClick={onClick}
      className="bg-white border border-slate-100 rounded-xl p-4 shadow-card hover:shadow-card-hover transition-all cursor-pointer group">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-900 text-sm">Qd {lot.quadra} — Lt {lot.number}</p>
          <p className="text-xs text-slate-400 mt-0.5">{lot.area} m2 · {lot.facing}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {lot.destaqueLP && <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400" />}
          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1', LOT_STATUS_COLOR[lot.status])}>
            <Icon className="w-2.5 h-2.5" />
            {LOT_STATUS_LABEL[lot.status]}
          </span>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">A vista</span>
          <span className="font-semibold text-emerald-700">{formatCurrency(p.precoAVista)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">A prazo</span>
          <span className="font-medium text-slate-700">{formatCurrency(p.precoAPrazo)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Ate {p.financiamentoOpcoes[1]?.parcelas ?? 180}x</span>
          <span className="font-medium text-blue-700">{formatCurrency(p.financiamentoOpcoes[1]?.valorParcela ?? 0)}/mes</span>
        </div>
      </div>

      {lot.status === 'reservado' && lot.reservadoPor && (
        <div className="pt-2 border-t border-slate-50 flex items-center gap-1.5">
          <User className="w-3 h-3 text-amber-500" />
          <span className="text-[11px] text-amber-700 truncate">{lot.reservadoPor}</span>
        </div>
      )}
      {['adimplente','inadimplente','em_atraso','juridico','quitado'].includes(lot.status) && lot.compradorNome && (
        <div className="pt-2 border-t border-slate-50 flex items-center gap-1.5">
          <User className="w-3 h-3 text-blue-500" />
          <span className="text-[11px] text-blue-700 truncate">{lot.compradorNome}</span>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[10px] text-blue-600 text-center font-medium">Clique para ver detalhes</p>
      </div>
    </div>
  )
}

// ─── Lot row (list view) ──────────────────────────────────────────────────────

function LotRow({ lot, onClick }: { lot: Lot; onClick: () => void }) {
  const Icon = STATUS_ICON[lot.status]
  const p = lot.pricing

  return (
    <tr onClick={onClick} className="hover:bg-slate-50/60 cursor-pointer transition-colors border-b border-slate-50 last:border-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {lot.destaqueLP && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
          <span className="font-medium text-slate-900 text-sm">Qd {lot.quadra} · Lt {lot.number}</span>
        </div>
        <p className="text-xs text-slate-400">{lot.facing}</p>
      </td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">{lot.area} m2</td>
      <td className="px-4 py-3 text-sm text-emerald-700 font-semibold text-right">{formatCurrency(p.precoAVista)}</td>
      <td className="px-4 py-3 text-sm text-slate-700 text-right">{formatCurrency(p.precoAPrazo)}</td>
      <td className="px-4 py-3 text-sm text-slate-600 text-right">
        <p className="text-[11px] text-slate-400">Ato {p.entradaParcelas}x</p>
        {formatCurrency(p.entradaValorParcela)}
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 text-right">
        <p className="text-[11px] text-slate-400">{p.intermediarias}x</p>
        {formatCurrency(p.intermediariaValor)}
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-xs font-semibold text-blue-700">{formatCurrency(p.financiamentoOpcoes[0]?.valorParcela ?? 0)}</p>
        <p className="text-[10px] text-slate-400">{p.financiamentoOpcoes[0]?.parcelas}x</p>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="text-xs font-semibold text-blue-600">{formatCurrency(p.financiamentoOpcoes[1]?.valorParcela ?? 0)}</p>
        <p className="text-[10px] text-slate-400">{p.financiamentoOpcoes[1]?.parcelas}x</p>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 w-fit', LOT_STATUS_COLOR[lot.status])}>
          <Icon className="w-2.5 h-2.5" />
          {LOT_STATUS_LABEL[lot.status]}
        </span>
        {(lot.reservadoPor ?? lot.compradorNome) && (
          <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]">
            {lot.reservadoPor ?? lot.compradorNome}
          </p>
        )}
      </td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmpreendimentosPage() {
  const [lots, setLots]           = useState<Lot[]>(SANTA_CLARA.lots)
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<LotStatus | 'all'>('all')
  const [view, setView]           = useState<'grid'|'list'>('grid')
  const [quadraFilter, setQuadraFilter] = useState<string>('all')
  const [selectedLot, setSelectedLot]   = useState<Lot | null>(null)
  const [destaqueOnly, setDestaqueOnly] = useState(false)

  const quadras = [...new Set(lots.map(l => l.quadra))].sort()

  const filtered = useMemo(() => lots.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false
    if (quadraFilter !== 'all' && l.quadra !== quadraFilter) return false
    if (destaqueOnly && !l.destaqueLP) return false
    if (search) {
      const s = search.toLowerCase()
      if (
        !l.number.includes(s) &&
        !l.quadra.toLowerCase().includes(s) &&
        !(l.compradorNome?.toLowerCase().includes(s)) &&
        !(l.reservadoPor?.toLowerCase().includes(s))
      ) return false
    }
    return true
  }), [lots, statusFilter, quadraFilter, search, destaqueOnly])

  // Status counts
  const counts = useMemo(() => {
    const c: Partial<Record<LotStatus|'all', number>> = { all: lots.length }
    ALL_STATUSES.forEach(s => { c[s] = lots.filter(l => l.status === s).length })
    return c
  }, [lots])

  function handleSave(updated: Lot) {
    setLots(prev => prev.map(l => l.id === updated.id ? updated : l))
    setSelectedLot(updated)
  }

  // Summary stats
  const livre       = lots.filter(l => l.status === 'livre').length
  const reservado   = lots.filter(l => l.status === 'reservado').length
  const vendidos    = lots.filter(l => ['adimplente','inadimplente','em_atraso','juridico','quitado'].includes(l.status)).length
  const problemas   = lots.filter(l => ['inadimplente','em_atraso','juridico'].includes(l.status)).length
  const totalAvista = lots.filter(l => l.status === 'livre').reduce((s, l) => s + l.pricing.precoAVista, 0)

  return (
    <div className="space-y-5 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-semibold text-slate-900">{SANTA_CLARA.name}</h1>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Em obras</span>
          </div>
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {SANTA_CLARA.address} — {SANTA_CLARA.city}/{SANTA_CLARA.state}
          </p>
        </div>
        <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo lote
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total de lotes', value: lots.length, color: 'text-slate-900', bg: 'bg-slate-50' },
          { label: 'Livres', value: livre, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Reservados', value: reservado, color: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Vendidos', value: vendidos, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Com problemas', value: problemas, color: 'text-red-700', bg: 'bg-red-50' },
        ].map(k => (
          <div key={k.label} className={cn('rounded-xl px-4 py-3 border border-white/60', k.bg)}>
            <p className={cn('text-2xl font-bold', k.color)}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* VGV disponivel */}
      <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card flex items-center gap-4">
        <DollarSign className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-xs text-slate-500">VGV disponivel (lotes livres a vista)</p>
          <p className="text-xl font-bold text-emerald-700">{formatCurrency(totalAvista)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lote, quadra ou comprador..."
            className="text-sm outline-none w-52 placeholder:text-slate-400" />
        </div>

        {/* Quadra */}
        <select value={quadraFilter} onChange={e => setQuadraFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none">
          <option value="all">Todas as quadras</option>
          {quadras.map(q => <option key={q} value={q}>Quadra {q}</option>)}
        </select>

        {/* Status pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => setStatusFilter('all')}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              statusFilter === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}>
            Todos ({counts.all})
          </button>
          {ALL_STATUSES.filter(s => (counts[s] ?? 0) > 0).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors',
                statusFilter === s ? LOT_STATUS_COLOR[s] + ' border-current' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}>
              {LOT_STATUS_LABEL[s]} ({counts[s]})
            </button>
          ))}
        </div>

        {/* Destaque LP toggle */}
        <button onClick={() => setDestaqueOnly(v => !v)}
          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            destaqueOnly ? 'bg-yellow-400 text-yellow-900 border-yellow-400' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          )}>
          <Star className="w-3.5 h-3.5" /> Destaque LP
        </button>

        <div className="ml-auto flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v as 'grid'|'list')}
              className={cn('p-2 transition-colors', view === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-slate-400">{filtered.length} lote{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>

      {/* Grid view */}
      {view === 'grid' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(lot => (
            <LotCard key={lot.id} lot={lot} onClick={() => setSelectedLot(lot)} />
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Lote</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Area</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">A vista</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">A prazo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Entrada</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">Interm.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">150x</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600">180x</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lot => (
                <LotRow key={lot.id} lot={lot} onClick={() => setSelectedLot(lot)} />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-400 text-sm">Nenhum lote encontrado</div>
          )}
        </div>
      )}

      {/* Drawer */}
      {selectedLot && (
        <LotDrawer
          lot={selectedLot}
          onClose={() => setSelectedLot(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
