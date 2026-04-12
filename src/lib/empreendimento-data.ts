import type { Lot, Empreendimento, LotStatus, LotPricing } from '@/types'

const QUADRAS = ['A','B','C','D']
const CORRETORES = ['Carlos Henrique','Ana Paula Costa','Fernando Monteiro']
const COMPRADORES = [
  'Paulo Henrique Dias','Ana Carolina Souza','Roberto Carlos Machado',
  'Fernanda Lima Cruz','Jose Eduardo Neto','Leticia Santos Melo',
  'Marcos Aurelio Braga','Juliana Pereira Ramos','Adriana Costa',
  'Diego Martins Silva','Carla Ferreira Lima','Bruno Oliveira',
  'Renata Souza Gomes','Alexandre Teixeira','Patricia Mendes',
  'Rodrigo Alves Costa','Simone Barbosa','Lucas Pereira',
]

const STATUS_PATTERN: LotStatus[] = [
  'adimplente','adimplente','adimplente','reservado',
  'livre','livre','livre','livre',
  'adimplente','inadimplente','livre','livre',
  'em_atraso','livre','adimplente','livre',
  'quitado','livre','juridico','livre',
  'livre','bloqueado','livre','livre',
]

function buildPricing(area: number): LotPricing {
  const base = area * 820  // ~R$820/m2 a vista
  const prazo = base * 1.35

  return {
    precoAVista: Math.round(base / 1000) * 1000,
    precoAPrazo: Math.round(prazo / 1000) * 1000,
    entradaTipo: 'parcelada',
    entradaValor: Math.round(prazo * 0.10 / 100) * 100,
    entradaParcelas: 3,
    entradaValorParcela: Math.round((prazo * 0.10 / 3) / 100) * 100,
    intermediarias: 12,
    intermediariaValor: Math.round((prazo * 0.08 / 12) / 100) * 100,
    financiamentoOpcoes: [
      { parcelas: 150, valorParcela: Math.round((prazo * 0.82 / 150) / 10) * 10 },
      { parcelas: 180, valorParcela: Math.round((prazo * 0.82 / 180) / 10) * 10 },
    ],
  }
}

function buildLots(): Lot[] {
  const lots: Lot[] = []
  let idx = 0

  QUADRAS.forEach(quadra => {
    for (let n = 1; n <= 12; n++) {
      const status = STATUS_PATTERN[idx % STATUS_PATTERN.length]
      const area   = 180 + ((idx * 17) % 120)
      const pricing = buildPricing(area)
      const compradorIdx = idx % COMPRADORES.length
      const isVendido = ['adimplente','inadimplente','em_atraso','juridico','quitado'].includes(status)
      const isReservado = status === 'reservado'

      const reservaDate = new Date()
      reservaDate.setDate(reservaDate.getDate() + 3 + (idx % 5))

      const vendaDate = new Date()
      vendaDate.setMonth(vendaDate.getMonth() - (1 + (idx % 18)))

      lots.push({
        id: `lot_sc_${idx + 1}`,
        empreendimentoId: 'emp_sc_001',
        number: String(n).padStart(2, '0'),
        quadra,
        area,
        facing: ['Leste','Oeste','Norte','Sul','Frente para a praca','Fundos para area verde'][idx % 6],
        status,
        pricing,
        reservadoPor:      isReservado ? COMPRADORES[compradorIdx] : undefined,
        reservadoAte:      isReservado ? reservaDate.toISOString() : undefined,
        reservadoCorretor: isReservado ? CORRETORES[idx % CORRETORES.length] : undefined,
        compradorNome:     isVendido   ? COMPRADORES[compradorIdx] : undefined,
        compradorCpf:      isVendido   ? `${400+compradorIdx}.${200+idx}.${100+idx}-${idx % 99}` : undefined,
        compradorTelefone: isVendido   ? `(12) 9${8000+compradorIdx}-${1000+idx}` : undefined,
        contratoId:        isVendido   ? `ct_sc_${idx + 1}` : undefined,
        vendaData:         isVendido   ? vendaDate.toISOString() : undefined,
        destaqueLP: [0, 3, 7, 15, 22].includes(idx),
        tagLP: [0,3].includes(idx) ? 'Ultima unidade' : idx === 7 ? 'Melhor localizacao' : undefined,
        observacoes: status === 'bloqueado' ? 'Pendencia documental — aguardando registro' : undefined,
        polygon: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
      })
      idx++
    }
  })
  return lots
}

export const SANTA_CLARA: Empreendimento = {
  id: 'emp_sc_001',
  name: 'Residencial Santa Clara',
  description: 'Loteamento residencial fechado com infraestrutura completa. Localizacao privilegiada em Pindamonhangaba, a 1km do centro.',
  status: 'em_obras',
  address: 'R. Edison Duarte Junior, 100',
  city: 'Pindamonhangaba',
  state: 'SP',
  totalLots: 48,
  lots: buildLots(),
  logoUrl: null,
  mapImageUrl: null,
  humanizedMapUrl: null,
  lat: -22.9132,
  lng: -45.4499,
  createdAt: '2023-06-01T00:00:00Z',
}
