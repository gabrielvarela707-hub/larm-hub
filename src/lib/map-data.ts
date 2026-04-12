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

// Residencial Santa Clara — Pindamonhangaba SP
// Centro: -22.9132753, -45.4499411
// Lotes em grade partindo do canto NW do empreendimento
function buildSantaClara(): MapLot[] {
  const originLat = -22.9118
  const originLng = -45.4512
  const dLat = 0.00010  // ~11m por lote (altura)
  const dLng = 0.00014  // ~13m por lote (largura)
  const gap  = 0.000018 // viela entre lotes

  // Layout: 4 quadras (A,B,C,D), cada uma com 2 fileiras de 6 lotes
  const quadras = [
    { id: 'A', rowOffset: 0, colOffset: 0 },
    { id: 'B', rowOffset: 0, colOffset: 7 },
    { id: 'C', rowOffset: 5, colOffset: 0 },
    { id: 'D', rowOffset: 5, colOffset: 7 },
  ]

  const STATUS_SEQ: LotStatus[] = [
    'adimplente','adimplente','adimplente','reservado',
    'livre','livre','livre','livre',
    'adimplente','reservado','livre','livre',
  ]

  const lots: MapLot[] = []
  let globalIdx = 0

  quadras.forEach(q => {
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        const r = q.rowOffset + row
        const c = q.colOffset + col
        const lat0 = originLat - r * (dLat + gap)
        const lng0 = originLng + c * (dLng + gap)
        const lat1 = lat0 - dLat
        const lng1 = lng0 + dLng

        const status = STATUS_SEQ[globalIdx % STATUS_SEQ.length]
        const area   = 180 + ((globalIdx * 13) % 120)
        const price  = 165000 + area * 280 + ((globalIdx * 9973) % 45000)

        lots.push({
          id: `sc_${globalIdx}`,
          number: String(globalIdx + 1).padStart(2, '0'),
          quadra: q.id,
          area,
          price,
          status,
          polygon: [
            [lat0, lng0],
            [lat0, lng1],
            [lat1, lng1],
            [lat1, lng0],
          ],
          buyerName: status === 'adimplente' || status === 'reservado'
            ? BUYER_NAMES[globalIdx % BUYER_NAMES.length]
            : undefined,
        })
        globalIdx++
      }
    }
  })

  return lots
}

export const MAP_EMPREENDIMENTOS: MapEmpreendimento[] = [
  {
    id: 'emp_001',
    name: 'Residencial Santa Clara',
    center: { lat: -22.9132, lng: -45.4499 },
    zoom: 18,
    lots: buildSantaClara(),
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

export const STATUS_LABELS: Record<LotStatus, string> = {
  livre:        'Livre',
  reservado:    'Reservado',
  adimplente:   'Vendido',
  inadimplente: 'Inadimplente',
  em_atraso:    'Em atraso',
  juridico:     'Juridico',
  quitado:      'Quitado',
  permutado:    'Permutado',
  bloqueado:    'Bloqueado',
}
