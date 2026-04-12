/// <reference types="@types/google.maps" />
'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, ZoomIn, ZoomOut, ChevronDown, X, Clock, TrendingUp, Eye, User, Plus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { useGoogleMaps } from '@/lib/use-google-maps'
import { useEmpreendimentos, LOT_FILL_COLORS, LOT_STROKE_COLORS, type MapLot } from '@/lib/empreendimentos-store'
import { useTenantConfig } from '@/lib/tenant-config-store'
import { LOT_STATUS_COLOR, LOT_STATUS_LABEL, type LotStatus } from '@/types'

const MAP_TYPES = [
  { id: 'hybrid' as const,  label: 'Satellite' },
  { id: 'roadmap' as const, label: 'Mapa' },
]

const VENDIDOS: LotStatus[] = ['adimplente','inadimplente','em_atraso','juridico','quitado']

const STATUS_FILTERS: { id: LotStatus | 'all'; label: string }[] = [
  { id: 'all',        label: 'Todos' },
  { id: 'livre',      label: 'Livre' },
  { id: 'reservado',  label: 'Reservado' },
  { id: 'adimplente', label: 'Vendido' },
]

function LotPanel({ lot, onClose, onReserve }: {
  lot: MapLot; onClose: () => void; onReserve: (lot: MapLot) => void
}) {
  const isVendido  = VENDIDOS.includes(lot.status)
  const isLivre    = lot.status === 'livre'
  const isReserved = lot.status === 'reservado'
  return (
    <div className="absolute top-14 right-3 w-68 bg-white rounded-2xl shadow-dialog border border-slate-100 overflow-hidden animate-fade-in z-20">
      <div className="bg-slate-900 px-4 py-3 flex items-start justify-between">
        <div>
          <p className="text-white font-semibold text-sm">Quadra {lot.quadra} — Lote {lot.number}</p>
          <p className="text-slate-400 text-xs mt-0.5">{lot.area} m² · {formatCurrency(lot.price)}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-white p-0.5">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Status</span>
          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', LOT_STATUS_COLOR[lot.status])}>
            {LOT_STATUS_LABEL[lot.status]}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Valor</span>
          <span className="text-sm font-semibold text-slate-900">{formatCurrency(lot.price)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Area</span>
          <span className="text-sm text-slate-700">{lot.area} m²</span>
        </div>
        {lot.buyerName && (
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <p className="text-xs font-medium text-slate-800 truncate">{lot.buyerName}</p>
          </div>
        )}
        <div className="h-px bg-slate-100" />
        {isLivre && (
          <div className="space-y-2">
            <button onClick={() => onReserve(lot)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
              <Clock className="w-3.5 h-3.5" /> Reservar lote
            </button>
            <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
              <TrendingUp className="w-3.5 h-3.5" /> Simular financiamento
            </button>
          </div>
        )}
        {isReserved && (
          <button className="w-full bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            Ver reserva
          </button>
        )}
        {isVendido && (
          <button className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Ver contrato
          </button>
        )}
      </div>
    </div>
  )
}

function StatsBar({ lots }: { lots: MapLot[] }) {
  const total = lots.length
  const livre = lots.filter(l => l.status === 'livre').length
  const res   = lots.filter(l => l.status === 'reservado').length
  const vend  = lots.filter(l => VENDIDOS.includes(l.status)).length
  const pct   = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-3">
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-dialog border border-slate-100 px-4 py-3">
        <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5 mb-3">
          <div className="bg-red-500 transition-all duration-500 rounded-full" style={{ width: `${pct(vend)}%` }} />
          <div className="bg-amber-400 transition-all duration-500 rounded-full" style={{ width: `${pct(res)}%` }} />
          <div className="bg-emerald-500 transition-all duration-500 rounded-full" style={{ width: `${pct(livre)}%` }} />
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Total',      value: total, color: 'text-slate-800' },
            { label: 'Livres',     value: livre, color: 'text-emerald-600' },
            { label: 'Reservados', value: res,   color: 'text-amber-500' },
            { label: 'Vendidos',   value: vend,  color: 'text-red-500' },
          ].map(s => (
            <div key={s.label}>
              <p className={cn('text-lg font-semibold', s.color)}>{s.value}</p>
              <p className="text-[10px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MapaPage() {
  const mapRef    = useRef<HTMLDivElement>(null)
  const gMapRef   = useRef<google.maps.Map | null>(null)
  const polysRef  = useRef<Map<string, google.maps.Polygon>>(new Map())

  const getKey    = useTenantConfig(s => s.getGoogleMapsKey)
  const hydrate   = useTenantConfig(s => s.hydrate)
  const hydrated  = useTenantConfig(s => s.hydrated)

  const { empreendimentos, activeId, setActive, updateLotStatus } = useEmpreendimentos()
  const activeEmp = empreendimentos.find(e => e.id === activeId) ?? empreendimentos[0]

  const [filter, setFilter]           = useState<LotStatus | 'all'>('all')
  const [mapType, setMapType]         = useState<'hybrid' | 'roadmap'>('hybrid')
  const [showEmpDrop, setShowEmpDrop] = useState(false)
  const [selectedLot, setSelectedLot] = useState<MapLot | null>(null)

  useEffect(() => { hydrate() }, [hydrate])

  const GOOGLE_MAPS_KEY = hydrated ? getKey() : ''
  const mapsState = useGoogleMaps(GOOGLE_MAPS_KEY)

  function clearPolys() {
    polysRef.current.forEach(p => p.setMap(null))
    polysRef.current.clear()
  }

  function renderPolys(map: google.maps.Map, lotsArr: MapLot[], fil: LotStatus | 'all') {
    lotsArr.forEach(lot => {
      if (fil !== 'all' && lot.status !== fil) return
      if (!lot.polygon?.length) return
      const poly = new google.maps.Polygon({
        paths: lot.polygon.map(([lat, lng]) => ({ lat, lng })),
        fillColor:    LOT_FILL_COLORS[lot.status] ?? '#22c55e',
        fillOpacity:  0.65,
        strokeColor:  LOT_STROKE_COLORS[lot.status] ?? '#16a34a',
        strokeWeight: 1.5,
        strokeOpacity: 0.9,
        map,
      })
      poly.addListener('click', () => {
        setSelectedLot(lot)
        polysRef.current.forEach((p, id) => {
          p.setOptions({ strokeWeight: id === lot.id ? 3 : 1.5, fillOpacity: id === lot.id ? 0.9 : 0.65 })
        })
      })
      poly.addListener('mouseover', () => poly.setOptions({ fillOpacity: 0.85, strokeWeight: 2 }))
      poly.addListener('mouseout',  () => poly.setOptions({ fillOpacity: 0.65, strokeWeight: 1.5 }))
      polysRef.current.set(lot.id, poly)
    })
  }

  useEffect(() => {
    if (mapsState !== 'ready' || !mapRef.current || gMapRef.current) return
    const map = new google.maps.Map(mapRef.current, {
      center: activeEmp?.center ?? { lat: -22.9132, lng: -45.4499 },
      zoom: activeEmp?.zoom ?? 17,
      mapTypeId: mapType,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
    })
    gMapRef.current = map
    if (activeEmp) renderPolys(map, activeEmp.lots, 'all')
  }, [mapsState]) // eslint-disable-line

  useEffect(() => {
    const map = gMapRef.current
    if (!map || !activeEmp) return
    clearPolys()
    setSelectedLot(null)
    map.panTo(activeEmp.center)
    map.setZoom(activeEmp.zoom)
    renderPolys(map, activeEmp.lots, filter)
  }, [activeId]) // eslint-disable-line

  useEffect(() => {
    const map = gMapRef.current
    if (!map || !activeEmp) return
    clearPolys()
    renderPolys(map, activeEmp.lots, filter)
  }, [filter]) // eslint-disable-line

  useEffect(() => { gMapRef.current?.setMapTypeId(mapType) }, [mapType])

  function handleReserve(lot: MapLot) {
    if (!activeEmp) return
    updateLotStatus(activeEmp.id, lot.id, 'reservado')
    setSelectedLot(prev => prev?.id === lot.id ? { ...prev, status: 'reservado' } : prev)
    const poly = polysRef.current.get(lot.id)
    if (poly) poly.setOptions({ fillColor: LOT_FILL_COLORS.reservado, strokeColor: LOT_STROKE_COLORS.reservado })
  }

  const visibleLots = (activeEmp?.lots ?? []).filter(l => filter === 'all' || l.status === filter)
  const noKey = !GOOGLE_MAPS_KEY

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200" style={{ height: 'calc(100vh - 90px)', minHeight: 600 }}>

      <div className="absolute top-3 left-3 right-3 z-20 flex items-start gap-2 pointer-events-none">

        {/* Empreendimento selector */}
        <div className="pointer-events-auto relative">
          <button onClick={() => setShowEmpDrop(v => !v)}
            className="flex items-center gap-2 bg-white/95 shadow-card border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white transition-colors">
            <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <div className="text-left">
              <span className="block max-w-[160px] truncate">{activeEmp?.name ?? 'Selecionar'}</span>
              {activeEmp?.phase && <span className="text-[10px] text-slate-400 font-normal">{activeEmp.phase}</span>}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {showEmpDrop && (
            <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-dialog border border-slate-100 py-1 min-w-[240px]">
              {empreendimentos.map(emp => (
                <button key={emp.id} onClick={() => { setActive(emp.id); setShowEmpDrop(false) }}
                  className={cn('w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors',
                    emp.id === activeId ? 'text-blue-600' : 'text-slate-700'
                  )}>
                  <p className="text-sm font-medium">{emp.name}</p>
                  <p className="text-xs text-slate-400">{emp.phase} · {emp.city}/{emp.state} · {emp.totalLots} lotes</p>
                </button>
              ))}
              <div className="border-t border-slate-100 mt-1 pt-1">
                <a href="/empreendimentos"
                  className="flex items-center gap-2 px-4 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                  <Plus className="w-3 h-3" /> Novo empreendimento
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Filter pills */}
        <div className="pointer-events-auto flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={cn('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow-card border transition-colors',
                filter === f.id
                  ? f.id === 'all'        ? 'bg-slate-900 text-white border-slate-900'
                  : f.id === 'livre'      ? 'bg-emerald-600 text-white border-emerald-600'
                  : f.id === 'reservado'  ? 'bg-amber-500 text-white border-amber-500'
                  :                         'bg-blue-600 text-white border-blue-600'
                  : 'bg-white/95 text-slate-600 border-slate-200 hover:bg-white'
              )}>
              {f.id !== 'all' && (
                <span className="w-2 h-2 rounded-full"
                  style={{ background: filter === f.id ? 'white' : LOT_FILL_COLORS[f.id as LotStatus] ?? '#22c55e' }} />
              )}
              {f.label}
              <span className="opacity-70 text-[10px]">
                ({f.id === 'all' ? (activeEmp?.lots.length ?? 0)
                  : f.id === 'adimplente' ? (activeEmp?.lots.filter(l => VENDIDOS.includes(l.status)).length ?? 0)
                  : (activeEmp?.lots.filter(l => l.status === f.id).length ?? 0)})
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <div className="pointer-events-auto flex bg-white/95 shadow-card border border-slate-200 rounded-xl overflow-hidden">
          {MAP_TYPES.map(t => (
            <button key={t.id} onClick={() => setMapType(t.id)}
              className={cn('px-3 py-2 text-xs font-medium transition-colors',
                mapType === t.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex flex-col bg-white/95 shadow-card border border-slate-200 rounded-xl overflow-hidden">
          <button onClick={() => gMapRef.current?.setZoom((gMapRef.current.getZoom() ?? 17) + 1)}
            className="p-2 hover:bg-slate-50 border-b border-slate-100">
            <ZoomIn className="w-4 h-4 text-slate-600" />
          </button>
          <button onClick={() => gMapRef.current?.setZoom((gMapRef.current.getZoom() ?? 17) - 1)}
            className="p-2 hover:bg-slate-50">
            <ZoomOut className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      <div ref={mapRef} className="absolute inset-0" style={{ background: '#e8eaed' }} />

      {noKey && hydrated && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 z-10">
          <div className="text-center p-8 max-w-sm">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Mapa Interativo de Lotes</h3>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              Configure sua chave da Google Maps API em <strong>Configuracoes → Credenciais</strong>.
            </p>
            <a href="/configuracoes"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              Ir para Configuracoes
            </a>
          </div>
        </div>
      )}

      {mapsState === 'loading' && !noKey && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 z-30">
          <div className="flex items-center gap-3 bg-white rounded-xl px-5 py-3 shadow-dialog">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-700">Carregando mapa...</span>
          </div>
        </div>
      )}

      {selectedLot && (
        <LotPanel lot={selectedLot}
          onClose={() => {
            setSelectedLot(null)
            polysRef.current.forEach(p => p.setOptions({ strokeWeight: 1.5, fillOpacity: 0.65 }))
          }}
          onReserve={handleReserve}
        />
      )}

      <StatsBar lots={visibleLots} />

      <div className="absolute bottom-24 right-3 z-20 bg-white/95 backdrop-blur rounded-xl shadow-card border border-slate-100 px-3 py-2.5">
        <p className="text-[10px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">Legenda</p>
        {(['livre','reservado','adimplente','em_atraso','juridico','bloqueado'] as LotStatus[]).map(s => (
          <div key={s} className="flex items-center gap-2 mb-1.5 last:mb-0">
            <span className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ background: LOT_FILL_COLORS[s] ?? '#6b7280' }} />
            <span className="text-xs text-slate-600">{LOT_STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
