'use client'

import type { ElementType } from 'react'
import { useState, useMemo } from 'react'
import {
  Plus, Search, LayoutGrid, List, Star, ChevronDown,
  X, Save, MapPin, Ruler, DollarSign, TrendingUp,
  Clock, AlertCircle, Shield, Check, Building2,
  Eye, Pencil, Map, Trash2,
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { LOT_STATUS_COLOR, LOT_STATUS_LABEL, LOT_STATUS_GROUP, type LotStatus } from '@/types'
import { SANTA_CLARA } from '@/lib/empreendimento-data'
import { useEmpreendimentos, type Empreendimento } from '@/lib/empreendimentos-store'

const ALL_STATUSES: LotStatus[] = [
  'livre','reservado','adimplente','inadimplente',
  'em_atraso','juridico','quitado','permutado','bloqueado',
]

const STATUS_ICON: Record<LotStatus, ElementType> = {
  livre: Check, reservado: Clock, adimplente: TrendingUp,
  inadimplente: AlertCircle, em_atraso: AlertCircle,
  juridico: Shield, quitado: Check, permutado: Building2, bloqueado: X,
}

const EMP_STATUS_LABELS = {
  planejamento: 'Planejamento', lancamento: 'Lancamento',
  em_obras: 'Em obras', concluido: 'Concluido',
}

const EMP_STATUS_COLORS = {
  planejamento: 'bg-slate-100 text-slate-600',
  lancamento:   'bg-amber-100 text-amber-700',
  em_obras:     'bg-blue-100 text-blue-700',
  concluido:    'bg-emerald-100 text-emerald-700',
}

// ─── New Empreendimento Modal ─────────────────────────────────────────────────

function NewEmpModal({ onClose }: { onClose: () => void }) {
  const { add } = useEmpreendimentos()
  const [form, setForm] = useState({
    name: '', phase: 'Fase 1', description: '', address: '',
    city: '', state: 'SP',
    status: 'planejamento' as Empreendimento['status'],
    centerLat: '', centerLng: '', zoom: '17',
    rows: '4', cols: '6', lotW: '12', lotH: '25',
    originLat: '', originLng: '',
  })

  function f(key: keyof typeof form, val: string) {
    setForm(s => ({ ...s, [key]: val }))
  }

  function handleSave() {
    if (!form.name || !form.city) return
    const centerLat = parseFloat(form.centerLat) || parseFloat(form.originLat) || -22.9
    const centerLng = parseFloat(form.centerLng) || parseFloat(form.originLng) || -45.4
    add({
      name: form.name, phase: form.phase, description: form.description,
      address: form.address, city: form.city, state: form.state,
      status: form.status,
      center: { lat: centerLat, lng: centerLng },
      zoom: parseInt(form.zoom) || 17,
      rows: parseInt(form.rows) || 4,
      cols: parseInt(form.cols) || 6,
      lotW: parseFloat(form.lotW) || 12,
      lotH: parseFloat(form.lotH) || 25,
      originLat: parseFloat(form.originLat) || centerLat,
      originLng: parseFloat(form.originLng) || centerLng,
    })
    onClose()
  }

  const totalLots = (parseInt(form.rows) || 0) * (parseInt(form.cols) || 0)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-dialog" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Novo empreendimento</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1.5">Nome do empreendimento *</label>
              <input value={form.name} onChange={e => f('name', e.target.value)}
                placeholder="ex: Residencial Parque das Flores"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Fase</label>
              <input value={form.phase} onChange={e => f('phase', e.target.value)}
                placeholder="Fase 1"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Status</label>
              <select value={form.status} onChange={e => f('status', e.target.value as Empreendimento['status'])}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(EMP_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Cidade *</label>
              <input value={form.city} onChange={e => f('city', e.target.value)}
                placeholder="Pindamonhangaba"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1.5">Estado</label>
              <input value={form.state} onChange={e => f('state', e.target.value)}
                placeholder="SP" maxLength={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 uppercase" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1.5">Endereco</label>
              <input value={form.address} onChange={e => f('address', e.target.value)}
                placeholder="Rua, numero, bairro"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600">Coordenadas GPS</p>
            <p className="text-xs text-slate-400">Cole as coordenadas do Google Maps (clique direito no local → copiar coordenadas)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Latitude (origem NW)</label>
                <input value={form.originLat} onChange={e => f('originLat', e.target.value)}
                  placeholder="-22.9105"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Longitude (origem NW)</label>
                <input value={form.originLng} onChange={e => f('originLng', e.target.value)}
                  placeholder="-45.4523"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white" />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-800">Layout dos lotes</p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-blue-600 mb-1">Linhas</label>
                <input type="number" value={form.rows} onChange={e => f('rows', e.target.value)}
                  min="1" max="20"
                  className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none bg-white" />
              </div>
              <div>
                <label className="block text-xs text-blue-600 mb-1">Colunas</label>
                <input type="number" value={form.cols} onChange={e => f('cols', e.target.value)}
                  min="1" max="20"
                  className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none bg-white" />
              </div>
              <div>
                <label className="block text-xs text-blue-600 mb-1">Frente (m)</label>
                <input type="number" value={form.lotW} onChange={e => f('lotW', e.target.value)}
                  className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none bg-white" />
              </div>
              <div>
                <label className="block text-xs text-blue-600 mb-1">Fundo (m)</label>
                <input type="number" value={form.lotH} onChange={e => f('lotH', e.target.value)}
                  className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none bg-white" />
              </div>
            </div>
            {totalLots > 0 && (
              <p className="text-xs text-blue-700 font-medium">{totalLots} lotes serao gerados automaticamente</p>
            )}
          </div>
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSave}
            disabled={!form.name || !form.city}
            className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="w-4 h-4" /> Criar empreendimento
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmpreendimentosPage() {
  const { empreendimentos, setActive, remove } = useEmpreendimentos()
  const [showNew, setShowNew] = useState(false)
  const [view, setView]       = useState<'grid'|'list'>('grid')
  const [search, setSearch]   = useState('')

  const filtered = empreendimentos.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.city.toLowerCase().includes(search.toLowerCase())
  )

  const allLots = empreendimentos.flatMap(e => e.lots)
  const totalVGV = allLots.filter(l => l.status === 'livre').reduce((s, l) => s + l.price, 0)

  return (
    <div className="space-y-5 max-w-[1400px]">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Empreendimentos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {empreendimentos.length} empreendimento{empreendimentos.length !== 1 ? 's' : ''} · {allLots.length} lotes no total
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo empreendimento
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Empreendimentos', value: empreendimentos.length, color: 'text-slate-900' },
          { label: 'Lotes livres', value: allLots.filter(l => l.status === 'livre').length, color: 'text-emerald-600' },
          { label: 'Lotes vendidos', value: allLots.filter(l => ['adimplente','quitado'].includes(l.status)).length, color: 'text-blue-600' },
          { label: 'VGV disponivel', value: formatCurrency(totalVGV), color: 'text-emerald-700' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-card">
            <p className={cn('text-xl font-bold', k.color)}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empreendimento..."
            className="text-sm outline-none w-48 placeholder:text-slate-400" />
        </div>
        <div className="ml-auto flex bg-white border border-slate-200 rounded-lg overflow-hidden">
          {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v as typeof view)}
              className={cn('p-2 transition-colors', view === v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
              <Icon className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>

      {view === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(emp => {
            const livre = emp.lots.filter(l => l.status === 'livre').length
            const vend  = emp.lots.filter(l => ['adimplente','quitado'].includes(l.status)).length
            const res   = emp.lots.filter(l => l.status === 'reservado').length
            const pctVend = Math.round((vend / emp.lots.length) * 100) || 0
            return (
              <div key={emp.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-card hover:shadow-card-hover transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-slate-900">{emp.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{emp.phase} · {emp.city}/{emp.state}</p>
                  </div>
                  <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', EMP_STATUS_COLORS[emp.status])}>
                    {EMP_STATUS_LABELS[emp.status]}
                  </span>
                </div>

                <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5 mb-3">
                  <div className="bg-blue-500 rounded-full" style={{ width: `${pctVend}%` }} />
                  <div className="bg-amber-400 rounded-full" style={{ width: `${Math.round(res/emp.lots.length*100)}%` }} />
                  <div className="bg-emerald-500 rounded-full" style={{ width: `${Math.round(livre/emp.lots.length*100)}%` }} />
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'Total', value: emp.lots.length, color: 'text-slate-800' },
                    { label: 'Livres', value: livre, color: 'text-emerald-600' },
                    { label: 'Vendidos', value: vend, color: 'text-blue-600' },
                  ].map(s => (
                    <div key={s.label} className="text-center bg-slate-50 rounded-lg py-2">
                      <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
                      <p className="text-[10px] text-slate-400">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-1 text-xs text-slate-400 mb-4">
                  <MapPin className="w-3 h-3" />
                  {emp.address || emp.city}/{emp.state}
                </div>

                <div className="flex gap-2">
                  <a href="/mapa" onClick={() => setActive(emp.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-xs font-medium transition-colors">
                    <Map className="w-3.5 h-3.5" /> Ver no mapa
                  </a>
                  <button className="px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-500">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {empreendimentos.length > 1 && (
                    <button onClick={() => remove(emp.id)}
                      className="px-3 py-2 border border-red-100 rounded-lg hover:bg-red-50 transition-colors text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <button onClick={() => setShowNew(true)}
            className="border-2 border-dashed border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group min-h-[200px]">
            <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-2xl flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6 text-slate-400 group-hover:text-blue-600 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-600 group-hover:text-blue-700">Novo empreendimento</p>
              <p className="text-xs text-slate-400 mt-0.5">Fase 1, Fase 2, nova incorporadora...</p>
            </div>
          </button>
        </div>
      )}

      {view === 'list' && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Empreendimento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Localizacao</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Lotes</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-600">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{emp.name}</p>
                    <p className="text-xs text-slate-400">{emp.phase}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{emp.city}/{emp.state}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', EMP_STATUS_COLORS[emp.status])}>
                      {EMP_STATUS_LABELS[emp.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-sm font-semibold text-slate-900">{emp.lots.length}</p>
                    <p className="text-xs text-emerald-600">{emp.lots.filter(l => l.status === 'livre').length} livres</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a href="/mapa" onClick={() => setActive(emp.id)}
                      className="text-xs text-blue-600 hover:underline">
                      Ver mapa
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewEmpModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
