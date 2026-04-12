'use client'

import { create } from 'zustand'
import type { LotStatus } from '@/types'
import { SANTA_CLARA } from '@/lib/empreendimento-data'
import { LOT_FILL_COLORS, LOT_STROKE_COLORS } from '@/lib/map-data'

export interface MapLot {
  id: string
  number: string
  quadra: string
  area: number
  price: number
  status: LotStatus
  polygon: [number, number][]
  buyerName?: string
}

export interface Empreendimento {
  id: string
  name: string
  phase: string
  description: string
  address: string
  city: string
  state: string
  status: 'planejamento' | 'lancamento' | 'em_obras' | 'concluido'
  center: { lat: number; lng: number }
  zoom: number
  lots: MapLot[]
  totalLots: number
  createdAt: string
}

export { LOT_FILL_COLORS, LOT_STROKE_COLORS }

function santaClaraToMap(): Empreendimento {
  const lots: MapLot[] = SANTA_CLARA.lots.slice(0, 48).map((l, i) => ({
    id: l.id,
    number: l.number,
    quadra: l.quadra,
    area: l.area,
    price: l.pricing.precoAVista,
    status: l.status,
    polygon: generatePolygon(l.quadra, i % 12, Math.floor(i / 12) % 2),
    buyerName: l.compradorNome ?? l.reservadoPor,
  }))
  return {
    id: 'emp_sc_001',
    name: 'Residencial Santa Clara',
    phase: 'Fase 1',
    description: 'Loteamento residencial em Pindamonhangaba SP',
    address: 'R. Edison Duarte Junior, 100',
    city: 'Pindamonhangaba',
    state: 'SP',
    status: 'em_obras',
    center: { lat: -22.91077, lng: -45.45179 },
    zoom: 18,
    lots,
    totalLots: 48,
    createdAt: '2023-06-01T00:00:00Z',
  }
}

const D_LNG    = 0.00011740
const D_LAT    = 0.00022523
const G_LNG    = 0.00001459
const G_LAT    = 0.00001351
const ROAD_LNG = 0.00007783
const ROAD_LAT = 0.00007203
const ORIGIN_LAT = -22.91050
const ORIGIN_LNG = -45.45230

const QUADRA_ORIGINS: Record<string, [number, number]> = {
  A: [ORIGIN_LAT, ORIGIN_LNG],
  B: [ORIGIN_LAT, ORIGIN_LNG + 6*(D_LNG + G_LNG) + ROAD_LNG],
  C: [ORIGIN_LAT - 2*(D_LAT + G_LAT) - ROAD_LAT, ORIGIN_LNG],
  D: [ORIGIN_LAT - 2*(D_LAT + G_LAT) - ROAD_LAT, ORIGIN_LNG + 6*(D_LNG + G_LNG) + ROAD_LNG],
}

function generatePolygon(quadra: string, col: number, row: number): [number, number][] {
  const [qLat, qLng] = QUADRA_ORIGINS[quadra] ?? [ORIGIN_LAT, ORIGIN_LNG]
  const lat0 = qLat - row * (D_LAT + G_LAT)
  const lng0 = qLng + col * (D_LNG + G_LNG)
  return [
    [lat0, lng0],
    [lat0, lng0 + D_LNG],
    [lat0 - D_LAT, lng0 + D_LNG],
    [lat0 - D_LAT, lng0],
  ]
}

function generateLotsForNew(
  originLat: number, originLng: number,
  rows: number, cols: number,
  lotW: number, lotH: number
): MapLot[] {
  const dLng = lotW * 0.000009728
  const dLat = lotH * 0.000009009
  const gap  = 1.5  * 0.000009728
  const lots: MapLot[] = []
  let idx = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat0 = originLat - r * (dLat + gap)
      const lng0 = originLng + c * (dLng + gap)
      lots.push({
        id: `new_${idx}`,
        number: String(idx + 1).padStart(2, '0'),
        quadra: String.fromCharCode(65 + Math.floor(idx / cols)),
        area: Math.round(lotW * lotH),
        price: 150000 + idx * 5000,
        status: 'livre',
        polygon: [
          [lat0, lng0], [lat0, lng0 + dLng],
          [lat0 - dLat, lng0 + dLng], [lat0 - dLat, lng0],
        ],
      })
      idx++
    }
  }
  return lots
}

interface EmpreendimentosState {
  empreendimentos: Empreendimento[]
  activeId: string
  setActive: (id: string) => void
  add: (emp: Omit<Empreendimento, 'id' | 'createdAt' | 'lots' | 'totalLots'> & {
    rows: number; cols: number; lotW: number; lotH: number
    originLat: number; originLng: number
  }) => void
  updateLot: (empId: string, lotId: string, status: LotStatus) => void
  remove: (id: string) => void
}

export const useEmpreendimentos = create<EmpreendimentosState>((set, get) => ({
  empreendimentos: [santaClaraToMap()],
  activeId: 'emp_sc_001',

  setActive: (id) => set({ activeId: id }),

  add: (data) => {
    const { rows, cols, lotW, lotH, originLat, originLng, ...rest } = data
    const lots = generateLotsForNew(originLat, originLng, rows, cols, lotW, lotH)
    const emp: Empreendimento = {
      ...rest,
      id: `emp_${Date.now()}`,
      lots,
      totalLots: lots.length,
      createdAt: new Date().toISOString(),
    }
    set(s => ({ empreendimentos: [...s.empreendimentos, emp], activeId: emp.id }))
  },

  updateLot: (empId, lotId, status) => {
    set(s => ({
      empreendimentos: s.empreendimentos.map(e =>
        e.id !== empId ? e : {
          ...e,
          lots: e.lots.map(l => l.id === lotId ? { ...l, status } : l),
        }
      ),
    }))
  },

  remove: (id) => {
    set(s => {
      const remaining = s.empreendimentos.filter(e => e.id !== id)
      return {
        empreendimentos: remaining,
        activeId: s.activeId === id ? (remaining[0]?.id ?? '') : s.activeId,
      }
    })
  },
}))
