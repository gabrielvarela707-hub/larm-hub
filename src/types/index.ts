// ─── Tenant / White-label ───────────────────────────────────────────────────

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

// ─── Empreendimento ──────────────────────────────────────────────────────────

export type LotStatus = 'disponivel' | 'reservado' | 'vendido' | 'permutado' | 'bloqueado'
export type EmpreendimentoStatus = 'planejamento' | 'lancamento' | 'em_obras' | 'concluido'

export interface Lot {
  id: string
  number: string
  quadra: string
  area: number
  price: number
  status: LotStatus
  lat?: number
  lng?: number
  polygon?: [number, number][]
  buyerId?: string
  contractId?: string
}

export interface Empreendimento {
  id: string
  name: string
  description: string
  status: EmpreendimentoStatus
  address: string
  city: string
  state: string
  totalLots: number
  availableLots: number
  soldLots: number
  reservedLots: number
  logoUrl: string | null
  mapImageUrl: string | null
  humanizedMapUrl: string | null
  lat: number
  lng: number
  lots: Lot[]
  createdAt: string
}

// ─── CRM / Leads ─────────────────────────────────────────────────────────────

export type LeadStatus = 
  | 'novo'
  | 'contato_realizado'
  | 'qualificado'
  | 'visita_agendada'
  | 'proposta_enviada'
  | 'negociacao'
  | 'fechado_ganho'
  | 'fechado_perdido'

export type LeadSource = 
  | 'site'
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'indicacao'
  | 'plantao'
  | 'portal'
  | 'outros'

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
  | 'rascunho'
  | 'aguardando_assinatura'
  | 'assinado'
  | 'distratado'
  | 'quitado'

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

// ─── Automações ──────────────────────────────────────────────────────────────

export type TriggerType =
  | 'lead_criado'
  | 'lead_sem_resposta'
  | 'proposta_enviada'
  | 'contrato_assinado'
  | 'parcela_vencendo'
  | 'parcela_atrasada'
  | 'visita_agendada'

export type ActionType =
  | 'enviar_email'
  | 'enviar_whatsapp'
  | 'criar_tarefa'
  | 'mover_funil'
  | 'adicionar_tag'
  | 'notificar_corretor'

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
