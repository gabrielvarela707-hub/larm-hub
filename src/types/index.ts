// ─── Tenant / White-label ────────────────────────────────────────────────────

export interface TenantTheme {
  primaryColor: string
  secondaryColor: string
  sidebarColor: string
  logoUrl: string | null
  logoText: string
  faviconUrl: string | null
  fontFamily: string
  borderRadius: 'sharp' | 'rounded' | 'pill'
}

export interface Tenant {
  id: string
  slug: string
  name: string
  domain: string | null
  plan: 'starter' | 'pro' | 'premium' | 'enterprise'
  theme: TenantTheme
  sesEmailFrom: string
  sesEmailName: string
  createdAt: string
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'manager' | 'broker' | 'client' | 'accountant'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatarUrl: string | null
  tenantId: string
  phone: string | null
  createdAt: string
}

// ─── Lot status (granular) ───────────────────────────────────────────────────

export type LotStatus =
  | 'livre'          // disponivel, nunca vendido
  | 'reservado'      // reservado com prazo — aguardando contrato
  | 'adimplente'     // vendido, pagando em dia
  | 'inadimplente'   // vendido, com parcelas em atraso leve
  | 'em_atraso'      // atraso significativo (>90 dias)
  | 'juridico'       // em processo juridico / cobrança extrajudicial
  | 'quitado'        // financiamento quitado integralmente
  | 'permutado'      // troca por outro bem
  | 'bloqueado'      // bloqueio administrativo (pendencia documental etc)

// Grupos para UI
export const LOT_STATUS_GROUP: Record<LotStatus, 'disponivel' | 'vendido' | 'problema' | 'especial'> = {
  livre:        'disponivel',
  reservado:    'disponivel',
  adimplente:   'vendido',
  quitado:      'vendido',
  inadimplente: 'problema',
  em_atraso:    'problema',
  juridico:     'problema',
  permutado:    'especial',
  bloqueado:    'especial',
}

export const LOT_STATUS_LABEL: Record<LotStatus, string> = {
  livre:        'Livre',
  reservado:    'Reservado',
  adimplente:   'Adimplente',
  inadimplente: 'Inadimplente',
  em_atraso:    'Em atraso',
  juridico:     'Juridico',
  quitado:      'Quitado',
  permutado:    'Permutado',
  bloqueado:    'Bloqueado',
}

export const LOT_STATUS_COLOR: Record<LotStatus, string> = {
  livre:        'bg-emerald-100 text-emerald-700 border-emerald-200',
  reservado:    'bg-amber-100 text-amber-700 border-amber-200',
  adimplente:   'bg-blue-100 text-blue-700 border-blue-200',
  inadimplente: 'bg-orange-100 text-orange-700 border-orange-200',
  em_atraso:    'bg-red-100 text-red-700 border-red-200',
  juridico:     'bg-rose-100 text-rose-800 border-rose-200',
  quitado:      'bg-teal-100 text-teal-700 border-teal-200',
  permutado:    'bg-violet-100 text-violet-700 border-violet-200',
  bloqueado:    'bg-slate-100 text-slate-600 border-slate-200',
}

export const LOT_MAP_COLOR: Record<LotStatus, string> = {
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

// ─── Lot pricing ─────────────────────────────────────────────────────────────

export interface LotFinancingOption {
  parcelas: number       // 150 ou 180 (ou outro)
  valorParcela: number
}

export interface LotPricing {
  precoAVista: number
  precoAPrazo: number
  // Entrada
  entradaTipo: 'ato_unico' | 'parcelada'
  entradaValor: number         // valor total da entrada
  entradaParcelas: number      // 1 se ato unico, N se parcelada (ex: 3x)
  entradaValorParcela: number  // entradaValor / entradaParcelas
  // Intermediarias (normalmente 12)
  intermediarias: number
  intermediariaValor: number
  // Financiamento (opcoes: 150x, 180x etc)
  financiamentoOpcoes: LotFinancingOption[]
}

// ─── Lot ─────────────────────────────────────────────────────────────────────

export interface Lot {
  id: string
  empreendimentoId: string
  number: string
  quadra: string
  area: number         // m2
  facing: string       // ex: 'Norte', 'Frente para a via principal'
  status: LotStatus
  pricing: LotPricing
  // Reserva
  reservadoPor?: string       // nome do interessado
  reservadoAte?: string       // ISO date
  reservadoCorretor?: string  // nome do corretor
  // Venda
  compradorNome?: string
  compradorCpf?: string
  compradorTelefone?: string
  contratoId?: string
  vendaData?: string
  // Destaques e marketing
  destaqueLP: boolean          // aparece em destaque na landing page
  tagLP?: string               // ex: 'Ultimas unidades', 'Melhor localizacao'
  observacoes?: string
  // Posicao no mapa
  polygon?: [number, number][]
  // Timestamps
  createdAt: string
  updatedAt: string
}

// ─── Empreendimento ──────────────────────────────────────────────────────────

export type EmpreendimentoStatus = 'planejamento' | 'lancamento' | 'em_obras' | 'concluido'

export interface Empreendimento {
  id: string
  name: string
  description: string
  status: EmpreendimentoStatus
  address: string
  city: string
  state: string
  totalLots: number
  lots: Lot[]
  logoUrl: string | null
  mapImageUrl: string | null
  humanizedMapUrl: string | null
  lat: number
  lng: number
  createdAt: string
}

// ─── CRM / Leads ─────────────────────────────────────────────────────────────

export type LeadStatus =
  | 'novo' | 'contato_realizado' | 'qualificado'
  | 'visita_agendada' | 'proposta_enviada' | 'negociacao'
  | 'fechado_ganho' | 'fechado_perdido'

export type LeadSource =
  | 'site' | 'instagram' | 'facebook' | 'whatsapp'
  | 'indicacao' | 'plantao' | 'portal' | 'outros'

export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  status: LeadStatus
  source: LeadSource
  empreendimentoId?: string
  brokerId?: string
  score: number
  notes: string
  tags: string[]
  lastContactAt: string | null
  createdAt: string
}

// ─── Contratos ───────────────────────────────────────────────────────────────

export type ContratoStatus =
  | 'rascunho' | 'aguardando_assinatura' | 'assinado'
  | 'distratado' | 'quitado'

export interface Contrato {
  id: string
  number: string
  buyerName: string
  buyerCpf: string
  buyerEmail: string
  buyerPhone: string
  empreendimentoId: string
  empreendimentoName: string
  lotId: string
  lotDescription: string
  totalValue: number
  downPayment: number
  installments: number
  installmentValue: number
  status: ContratoStatus
  signedAt: string | null
  pdfUrl: string | null
  financingType: 'price' | 'sac' | 'sacoc'
  firstInstallmentDate: string
  createdAt: string
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

export type ParcelaStatus = 'aberta' | 'paga' | 'atrasada' | 'cancelada'

export interface Parcela {
  id: string
  contratoId: string
  contratoNumber: string
  buyerName: string
  number: number
  totalInstallments: number
  dueDate: string
  paidAt: string | null
  value: number
  penalty: number
  interest: number
  status: ParcelaStatus
  boletoUrl: string | null
  boletoCode: string | null
}

export interface ContaPagar {
  id: string
  description: string
  supplier: string
  category: string
  value: number
  dueDate: string
  paidAt: string | null
  status: 'pendente' | 'pago' | 'vencido'
  attachmentUrl: string | null
  empreendimentoId?: string
}

// ─── Automacoes ──────────────────────────────────────────────────────────────

export type TriggerType =
  | 'lead_criado' | 'lead_sem_resposta' | 'proposta_enviada'
  | 'contrato_assinado' | 'parcela_vencendo' | 'parcela_atrasada'
  | 'visita_agendada'

export type ActionType =
  | 'enviar_email' | 'enviar_whatsapp' | 'criar_tarefa'
  | 'mover_funil' | 'adicionar_tag' | 'notificar_corretor'

export interface AutomationAction {
  id: string
  type: ActionType
  delayHours: number
  config: Record<string, string>
}

export interface Automation {
  id: string
  name: string
  trigger: TriggerType
  active: boolean
  actions: AutomationAction[]
  executionCount: number
  lastRunAt: string | null
  createdAt: string
}

// ─── Obras ───────────────────────────────────────────────────────────────────

export type ObraStatus = 'nao_iniciada' | 'em_andamento' | 'pausada' | 'concluida'

export interface ObraEtapa {
  id: string
  name: string
  status: ObraStatus
  progress: number
  startDate: string | null
  endDate: string | null
  plannedCost: number
  actualCost: number
}

export interface Obra {
  id: string
  empreendimentoId: string
  empreendimentoName: string
  status: ObraStatus
  progress: number
  totalPlannedCost: number
  totalActualCost: number
  stages: ObraEtapa[]
  startDate: string
  estimatedEndDate: string
}

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

export interface DashboardKPIs {
  totalRevenue: number
  revenueGrowth: number
  totalLotsSold: number
  lotsSoldGrowth: number
  activeLeads: number
  leadsGrowth: number
  defaultRate: number
  defaultRateChange: number
  availableLots: number
  totalLots: number
  monthlyReceivable: number
  overdueReceivable: number
}

// ─── Chat IA ─────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
