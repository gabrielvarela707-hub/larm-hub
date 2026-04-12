import type { LotStatus } from '@/types'

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

export interface MapEmpreendimento {
  id: string
  name: string
  center: { lat: number; lng: number }
  zoom: number
  lots: MapLot[]
}

const BUYER_NAMES = [
  'Carlos Henrique Silva', 'Ana Paula Costa', 'Roberto Fernandes',
  'Maria das Gracas Lima', 'Jose Eduardo Neto', 'Fernanda Oliveira Cruz',
  'Paulo Roberto Dias', 'Leticia Santos Melo', 'Marcos Aurelio Braga',
  'Juliana Pereira Ramos', 'Anderson Torres', 'Adriana Lima Santos',
]

// ─── Calibracao geometrica ────────────────────────────────────────────────────
// Latitude  -22.9° → 1m = 0.000009009° lat
// Longitude -45.4° → 1m = 0.000009728° lng  (fator cos(-22.9°) = 0.9207)
//
// Lote:  12m frente (lng) x 25m fundo (lat)
// Viela: 1.5m entre lotes
// Rua:   8m entre quadras

const D_LNG   = 0.00011740  // 12.0m de frente
const D_LAT   = 0.00022523  // 25.0m de fundo
const G_LNG   = 0.00001459  // 1.5m viela (lng)
const G_LAT   = 0.00001351  // 1.5m viela (lat)
const ROAD_LNG = 0.00007783  // 8.0m rua principal (lng)
const ROAD_LAT = 0.00007203  // 8.0m rua principal (lat)

// Origem NW do empreendimento calibrada pelo satelite
const ORIGIN_LAT = -22.91050
const ORIGIN_LNG = -45.45230

// 4 quadras: A (NW), B (NE), C (SW), D (SE)
// Cada quadra: 6 colunas x 2 fileiras = 12 lotes
const QUADRA_ORIGINS: Record<string, [number, number]> = {
  A: [ORIGIN_LAT,                              ORIGIN_LNG],
  B: [ORIGIN_LAT,                              ORIGIN_LNG + 6*(D_LNG + G_LNG) + ROAD_LNG],
  C: [ORIGIN_LAT - 2*(D_LAT + G_LAT) - ROAD_LAT, ORIGIN_LNG],
  D: [ORIGIN_LAT - 2*(D_LAT + G_LAT) - ROAD_LAT, ORIGIN_LNG + 6*(D_LNG + G_LNG) + ROAD_LNG],
}

const STATUS_SEQ: LotStatus[] = [
  'adimplente','adimplente','adimplente','reservado',
  'livre','livre','livre','livre',
  'adimplente','inadimplente','livre','livre',
  'em_atraso','livre','adimplente','livre',
  'quitado','livre','juridico','livre',
  'livre','bloqueado','livre','livre',
]

function buildLots(): MapLot[] {
  const lots: MapLot[] = []
  let idx = 0

  Object.entries(QUADRA_ORIGINS).forEach(([quadra, [qLat, qLng]]) => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        const lat0 = qLat  - row * (D_LAT + G_LAT)
        const lng0 = qLng  + col * (D_LNG + G_LNG)
        const lat1 = lat0  - D_LAT
        const lng1 = lng0  + D_LNG

        const status = STATUS_SEQ[idx % STATUS_SEQ.length]
        const area   = Math.round(D_LNG / 0.000009728 * D_LAT / 0.000009009)
        const price  = 165000 + area * 280 + ((idx * 9973) % 45000)
        const isVendido  = ['adimplente','inadimplente','em_atraso','juridico','quitado'].includes(status)
        const isReserved = status === 'reservado'

        lots.push({
          id: `sc_${idx}`,
          number: String(idx + 1).padStart(2, '0'),
          quadra,
          area,
          price,
          status,
          polygon: [
            [lat0, lng0],
            [lat0, lng1],
            [lat1, lng1],
            [lat1, lng0],
          ],
          buyerName: (isVendido || isReserved)
            ? BUYER_NAMES[idx % BUYER_NAMES.length]
            : undefined,
        })
        idx++
      }
    }
  })
  return lots
}

export const MAP_EMPREENDIMENTOS: MapEmpreendimento[] = [
  {
    id: 'emp_sc_001',
    name: 'Residencial Santa Clara',
    center: { lat: -22.91077, lng: -45.45179 },
    zoom: 18,
    lots: buildLots(),
  },
]

export const LOT_FILL_COLORS: Record<LotStatus, string> = {
  livre:        '#22c55e',
  reservado:    '#f59e0b',
  adimplente:   '#3b82f6',
  inadimplente: '#f97316',
  em_atraso:    '#ef4444',
  juridico:     '#e11d48',
  quitado:      '#14b8a6',
  permutado:    '#8b5cf6',
  bloqueado:    '#6b7280',
}

export const LOT_STROKE_COLORS: Record<LotStatus, string> = {
  livre:        '#16a34a',
  reservado:    '#d97706',
  adimplente:   '#1d4ed8',
  inadimplente: '#c2410c',
  em_atraso:    '#b91c1c',
  juridico:     '#9f1239',
  quitado:      '#0f766e',
  permutado:    '#6d28d9',
  bloqueado:    '#4b5563',
}
