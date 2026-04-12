'use client'

import { create } from 'zustand'
import type { LotStatus } from '@/types'
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
  logoUrl?: string
  createdAt: string
}

export { LOT_FILL_COLORS, LOT_STROKE_COLORS }

// ── Geometria calibrada para Santa Clara ─────────────────────────────────────
// 240 lotes em 8 quadras (A..H), cada quadra 5 cols x 6 rows = 30 lotes
// Lote: 12m frente x 25m fundo | Viela: 1.5m | Rua: 8m
const DLN = 0.00011740   // 12m frente em graus lng
const DLT = 0.00022523   // 25m fundo em graus lat
const GLN = 0.00001459   // viela lng
const GLT = 0.00001351   // viela lat
const RLN = 0.00007783   // rua principal lng
const RLT = 0.00007203   // rua principal lat

// Origem NW calibrada pelo satelite de Pindamonhangaba
const OLT = -22.91010
const OLN = -45.45280

// 8 quadras dispostas em 2 colunas x 4 linhas
// Cada quadra: 5 colunas de lotes, rua de 8m entre quadras
const QBLOCK_W = 5 * (DLN + GLN) + RLN  // bloco de quadra + rua
const QBLOCK_H = 6 * (DLT + GLT) + RLT  // bloco de linhas + rua

const QUADRA_ORIGINS: Record<string, [number, number]> = {
  A: [OLT,               OLN],
  B: [OLT,               OLN + QBLOCK_W],
  C: [OLT - QBLOCK_H,    OLN],
  D: [OLT - QBLOCK_H,    OLN + QBLOCK_W],
  E: [OLT - 2*QBLOCK_H,  OLN],
  F: [OLT - 2*QBLOCK_H,  OLN + QBLOCK_W],
  G: [OLT - 3*QBLOCK_H,  OLN],
  H: [OLT - 3*QBLOCK_H,  OLN + QBLOCK_W],
}

const STATUS_SEQ: LotStatus[] = [
  'adimplente','adimplente','adimplente','reservado',
  'livre','livre','livre','livre','livre','livre',
  'adimplente','inadimplente','livre','livre','livre',
  'em_atraso','livre','adimplente','livre','livre',
  'quitado','livre','juridico','livre','livre',
  'livre','bloqueado','livre','livre','livre',
]

const BUYER_NAMES = [
  'Carlos Henrique Silva','Ana Paula Costa','Roberto Fernandes',
  'Maria das Gracas','Jose Eduardo Neto','Fernanda Oliveira Cruz',
  'Paulo Roberto Dias','Leticia Santos','Marcos Aurelio',
  'Juliana Pereira','Anderson Torres','Adriana Lima Santos',
  'Diego Martins','Carla Ferreira','Bruno Oliveira',
  'Renata Gomes','Alexandre Teixeira','Patricia Mendes',
]

function buildSantaClaraLots(): MapLot[] {
  const lots: MapLot[] = []
  let idx = 0
  Object.entries(QUADRA_ORIGINS).forEach(([quadra, [qLat, qLng]]) => {
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        const lat0 = qLat  - row * (DLT + GLT)
        const lng0 = qLng  + col * (DLN + GLN)
        const lat1 = lat0  - DLT
        const lng1 = lng0  + DLN
        const status = STATUS_SEQ[idx % STATUS_SEQ.length]
        const area   = Math.round(12 * 25)
        const price  = 165000 + ((idx * 9973) % 45000)
        const isVend = ['adimplente','inadimplente','em_atraso','juridico','quitado'].includes(status)
        const isRes  = status === 'reservado'
        lots.push({
          id: `sc_${idx}`,
          number: String(idx + 1).padStart(3, '0'),
          quadra,
          area,
          price,
          status,
          polygon: [[lat0, lng0],[lat0, lng1],[lat1, lng1],[lat1, lng0]],
          buyerName: (isVend || isRes) ? BUYER_NAMES[idx % BUYER_NAMES.length] : undefined,
        })
        idx++
      }
    }
  })
  return lots
}

function generateLotsForNew(
  originLat: number, originLng: number,
  rows: number, cols: number, lotW: number, lotH: number
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
        number: String(idx + 1).padStart(3, '0'),
        quadra: String.fromCharCode(65 + Math.floor(idx / cols)),
        area: Math.round(lotW * lotH),
        price: 150000 + idx * 3000,
        status: 'livre',
        polygon: [[lat0,lng0],[lat0,lng0+dLng],[lat0-dLat,lng0+dLng],[lat0-dLat,lng0]],
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
  add: (emp: Omit<Empreendimento,'id'|'createdAt'|'lots'|'totalLots'> & {
    rows: number; cols: number; lotW: number; lotH: number
    originLat: number; originLng: number
  }) => void
  updateLotStatus: (empId: string, lotId: string, status: LotStatus) => void
  updateLogo: (empId: string, logoUrl: string) => void
  remove: (id: string) => void
}

const SC_LOTS = buildSantaClaraLots()

export const useEmpreendimentos = create<EmpreendimentosState>((set) => ({
  empreendimentos: [{
    id: 'emp_sc_001',
    name: 'Residencial Santa Clara',
    phase: 'Fase 1',
    description: 'Loteamento residencial em Pindamonhangaba SP',
    address: 'R. Edison Duarte Junior, 100',
    city: 'Pindamonhangaba',
    state: 'SP',
    status: 'em_obras',
    center: { lat: OLT - 1.5*QBLOCK_H, lng: OLN + QBLOCK_W * 0.5 },
    zoom: 17,
    lots: SC_LOTS,
    totalLots: SC_LOTS.length,
    logoUrl: undefined,
    createdAt: '2023-06-01T00:00:00Z',
  }],
  activeId: 'emp_sc_001',

  setActive: (id) => set({ activeId: id }),

  add: ({ rows, cols, lotW, lotH, originLat, originLng, ...rest }) => {
    const lots = generateLotsForNew(originLat, originLng, rows, cols, lotW, lotH)
    const emp: Empreendimento = {
      ...rest, id: `emp_${Date.now()}`,
      lots, totalLots: lots.length,
      createdAt: new Date().toISOString(),
    }
    set(s => ({ empreendimentos: [...s.empreendimentos, emp], activeId: emp.id }))
  },

  updateLotStatus: (empId, lotId, status) => {
    set(s => ({
      empreendimentos: s.empreendimentos.map(e =>
        e.id !== empId ? e : {
          ...e, lots: e.lots.map(l => l.id === lotId ? { ...l, status } : l)
        }
      )
    }))
  },

  updateLogo: (empId, logoUrl) => {
    set(s => ({
      empreendimentos: s.empreendimentos.map(e =>
        e.id !== empId ? e : { ...e, logoUrl }
      )
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
