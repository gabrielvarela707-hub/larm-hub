import type {
  Empreendimento, Lead, Contrato, Parcela,
  ContaPagar, Automation, Obra, DashboardKPIs,
  Tenant,
} from '@/types'

// ─── Tenant (white-label default) ───────────────────────────────────────────

export const mockTenant: Tenant = {
  id: 'tenant_001',
  slug: 'lotemobile',
  name: 'LoteMobile',
  domain: null,
  plan: 'premium',
  theme: {
    primaryColor: '#1E40AF',
    secondaryColor: '#3B82F6',
    sidebarColor: '#0D1B2A',
    logoUrl: null,
    logoText: 'LoteMobile',
    faviconUrl: null,
    fontFamily: 'Geist',
    borderRadius: 'rounded',
  },
  sesEmailFrom: 'noreply@lotemobile.com.br',
  sesEmailName: 'LoteMobile',
  createdAt: '2024-01-01T00:00:00Z',
}

// ─── Dashboard KPIs ──────────────────────────────────────────────────────────

export const mockKPIs: DashboardKPIs = {
  totalRevenue: 8534200,
  revenueGrowth: 18.4,
  totalLotsSold: 226,
  lotsSoldGrowth: 12.1,
  activeLeads: 184,
  leadsGrowth: 34.7,
  defaultRate: 4.2,
  defaultRateChange: -0.8,
  availableLots: 174,
  totalLots: 480,
  monthlyReceivable: 853420,
  overdueReceivable: 35843,
}

// ─── Empreendimentos ─────────────────────────────────────────────────────────

export const mockEmpreendimentos: Empreendimento[] = [
  {
    id: 'emp_001',
    name: 'Portal do Lago II',
    description: 'Condomínio fechado às margens do Lago Dourado com infraestrutura completa.',
    status: 'em_obras',
    address: 'Rodovia GO-010, km 18',
    city: 'Goiânia',
    state: 'GO',
    totalLots: 240,
    availableLots: 87,
    soldLots: 132,
    reservedLots: 21,
    logoUrl: null,
    mapImageUrl: null,
    humanizedMapUrl: null,
    lat: -16.6869,
    lng: -49.2648,
    lots: Array.from({ length: 240 }, (_, i) => ({
      id: `lot_${i + 1}`,
      number: String(i + 1).padStart(3, '0'),
      quadra: String.fromCharCode(65 + Math.floor(i / 20)),
      area: 250 + Math.floor(Math.random() * 200),
      price: 180000 + Math.floor(Math.random() * 120000),
      status: i < 132 ? 'vendido' : i < 153 ? 'reservado' : 'disponivel',
    })),
    createdAt: '2023-06-01T00:00:00Z',
  },
  {
    id: 'emp_002',
    name: 'Jardim Bella Vita',
    description: 'Loteamento aberto com amplas áreas verdes e pista de caminhada.',
    status: 'lancamento',
    address: 'Av. das Palmeiras, 500',
    city: 'Anápolis',
    state: 'GO',
    totalLots: 160,
    availableLots: 112,
    soldLots: 38,
    reservedLots: 10,
    logoUrl: null,
    mapImageUrl: null,
    humanizedMapUrl: null,
    lat: -16.3281,
    lng: -48.9535,
    lots: [],
    createdAt: '2024-02-15T00:00:00Z',
  },
  {
    id: 'emp_003',
    name: 'Grand Hill Residence',
    description: 'Alto padrão em localização privilegiada, com lotes a partir de 450m².',
    status: 'concluido',
    address: 'Rua das Orquídeas, 1200',
    city: 'Aparecida de Goiânia',
    state: 'GO',
    totalLots: 80,
    availableLots: 0,
    soldLots: 80,
    reservedLots: 0,
    logoUrl: null,
    mapImageUrl: null,
    humanizedMapUrl: null,
    lat: -16.8234,
    lng: -49.2456,
    lots: [],
    createdAt: '2022-03-10T00:00:00Z',
  },
]

// ─── Leads / CRM ─────────────────────────────────────────────────────────────

export const mockLeads: Lead[] = [
  { id: 'lead_001', name: 'Marcos Eduardo Fernandes', email: 'marcos@email.com', phone: '62991234567', status: 'novo', source: 'instagram', empreendimentoId: 'emp_001', score: 72, notes: 'Interessado em lotes maiores', tags: ['quente', 'investidor'], lastContactAt: null, createdAt: '2024-07-10T09:00:00Z' },
  { id: 'lead_002', name: 'Letícia Sousa Alves', email: 'leticia@email.com', phone: '62987654321', status: 'contato_realizado', source: 'facebook', empreendimentoId: 'emp_001', score: 55, notes: 'Ligou, pediu mais informações sobre financiamento', tags: ['morno'], lastContactAt: '2024-07-11T14:00:00Z', createdAt: '2024-07-09T11:00:00Z' },
  { id: 'lead_003', name: 'Roberto Carlos Machado', email: 'roberto@email.com', phone: '11997123456', status: 'qualificado', source: 'site', empreendimentoId: 'emp_002', score: 88, notes: 'Quer lote para construir em 2025', tags: ['quente', 'prioridade'], lastContactAt: '2024-07-12T10:00:00Z', createdAt: '2024-07-08T15:00:00Z' },
  { id: 'lead_004', name: 'Adriana Lima Santos', email: 'adriana@email.com', phone: '62981234567', status: 'visita_agendada', source: 'indicacao', empreendimentoId: 'emp_001', score: 91, notes: 'Visita marcada para sábado 14h', tags: ['quente', 'visita'], lastContactAt: '2024-07-13T09:00:00Z', createdAt: '2024-07-07T08:00:00Z' },
  { id: 'lead_005', name: 'Carlos Alberto Neto', email: 'carlos@email.com', phone: '62995678901', status: 'proposta_enviada', source: 'whatsapp', empreendimentoId: 'emp_001', score: 78, notes: 'Proposta enviada para lote B-15', tags: ['proposta'], lastContactAt: '2024-07-14T16:00:00Z', createdAt: '2024-07-06T12:00:00Z' },
  { id: 'lead_006', name: 'Fernanda Oliveira Cruz', email: 'fernanda@email.com', phone: '11991234567', status: 'negociacao', source: 'portal', empreendimentoId: 'emp_002', score: 85, notes: 'Negociando desconto na entrada', tags: ['negociacao', 'desconto'], lastContactAt: '2024-07-15T11:00:00Z', createdAt: '2024-07-05T09:00:00Z' },
  { id: 'lead_007', name: 'Paulo Henrique Dias', email: 'paulo@email.com', phone: '62998765432', status: 'fechado_ganho', source: 'plantao', empreendimentoId: 'emp_001', score: 100, notes: 'Contrato assinado — Lote A-07', tags: ['cliente', 'ganho'], lastContactAt: '2024-07-10T15:00:00Z', createdAt: '2024-07-01T10:00:00Z' },
  { id: 'lead_008', name: 'Juliana Pereira Matos', email: 'juliana@email.com', phone: '62994567890', status: 'novo', source: 'instagram', empreendimentoId: 'emp_002', score: 40, notes: '', tags: [], lastContactAt: null, createdAt: '2024-07-15T08:00:00Z' },
  { id: 'lead_009', name: 'Anderson Silva Torres', email: 'anderson@email.com', phone: '62993456789', status: 'contato_realizado', source: 'facebook', empreendimentoId: 'emp_001', score: 62, notes: 'Enviou mensagem no WhatsApp', tags: ['morno'], lastContactAt: '2024-07-14T10:00:00Z', createdAt: '2024-07-12T14:00:00Z' },
  { id: 'lead_010', name: 'Mariana Ramos Cardoso', email: 'mariana@email.com', phone: '11993456789', status: 'qualificado', source: 'site', empreendimentoId: 'emp_001', score: 79, notes: 'Aprovada no financiamento', tags: ['qualificado', 'financiamento'], lastContactAt: '2024-07-13T15:00:00Z', createdAt: '2024-07-11T11:00:00Z' },
  { id: 'lead_011', name: 'Diego Martins Braga', email: 'diego@email.com', phone: '62996789012', status: 'fechado_perdido', source: 'indicacao', empreendimentoId: 'emp_001', score: 30, notes: 'Optou por outro empreendimento', tags: ['perdido'], lastContactAt: '2024-07-08T09:00:00Z', createdAt: '2024-07-03T14:00:00Z' },
]

// ─── Contratos ───────────────────────────────────────────────────────────────

export const mockContratos: Contrato[] = [
  { id: 'ct_001', number: '2024-001', buyerName: 'Paulo Henrique Dias', buyerCpf: '123.456.789-00', buyerEmail: 'paulo@email.com', buyerPhone: '62998765432', empreendimentoId: 'emp_001', empreendimentoName: 'Portal do Lago II', lotId: 'lot_007', lotDescription: 'Quadra A — Lote 07 — 320m²', totalValue: 280000, downPayment: 56000, installments: 120, installmentValue: 1870, status: 'assinado', signedAt: '2024-07-10T15:00:00Z', pdfUrl: '#', financingType: 'price', firstInstallmentDate: '2024-08-10', createdAt: '2024-07-10T14:00:00Z' },
  { id: 'ct_002', number: '2024-002', buyerName: 'Fernanda Oliveira Cruz', buyerCpf: '987.654.321-00', buyerEmail: 'fernanda@email.com', buyerPhone: '11991234567', empreendimentoId: 'emp_002', empreendimentoName: 'Jardim Bella Vita', lotId: 'lot_025', lotDescription: 'Quadra B — Lote 25 — 280m²', totalValue: 195000, downPayment: 29250, installments: 96, installmentValue: 1724, status: 'aguardando_assinatura', signedAt: null, pdfUrl: '#', financingType: 'sac', firstInstallmentDate: '2024-08-15', createdAt: '2024-07-14T10:00:00Z' },
  { id: 'ct_003', number: '2024-003', buyerName: 'Ana Carolina Souza', buyerCpf: '456.789.123-00', buyerEmail: 'ana@email.com', buyerPhone: '62992345678', empreendimentoId: 'emp_001', empreendimentoName: 'Portal do Lago II', lotId: 'lot_012', lotDescription: 'Quadra A — Lote 12 — 300m²', totalValue: 248000, downPayment: 37200, installments: 108, installmentValue: 1951, status: 'assinado', signedAt: '2024-06-20T11:00:00Z', pdfUrl: '#', financingType: 'price', firstInstallmentDate: '2024-07-20', createdAt: '2024-06-18T09:00:00Z' },
  { id: 'ct_004', number: '2023-089', buyerName: 'José Roberto Lima', buyerCpf: '321.654.987-00', buyerEmail: 'jose@email.com', buyerPhone: '62991111111', empreendimentoId: 'emp_003', empreendimentoName: 'Grand Hill Residence', lotId: 'lot_045', lotDescription: 'Quadra C — Lote 45 — 450m²', totalValue: 520000, downPayment: 104000, installments: 120, installmentValue: 3467, status: 'quitado', signedAt: '2023-01-15T10:00:00Z', pdfUrl: '#', financingType: 'sacoc', firstInstallmentDate: '2023-02-15', createdAt: '2023-01-10T08:00:00Z' },
]

// ─── Parcelas ────────────────────────────────────────────────────────────────

export const mockParcelas: Parcela[] = [
  { id: 'p_001', contratoId: 'ct_001', contratoNumber: '2024-001', buyerName: 'Paulo Henrique Dias', number: 1, totalInstallments: 120, dueDate: '2024-08-10', paidAt: null, value: 1870, penalty: 0, interest: 0, status: 'aberta', boletoUrl: '#', boletoCode: '34191.75402 25530.801509 20065.601018 4 93540000187000' },
  { id: 'p_002', contratoId: 'ct_003', contratoNumber: '2024-003', buyerName: 'Ana Carolina Souza', number: 2, totalInstallments: 108, dueDate: '2024-08-20', paidAt: null, value: 1951, penalty: 0, interest: 0, status: 'aberta', boletoUrl: '#', boletoCode: '34191.75402 25530.801509 20065.601018 4 93540000195100' },
  { id: 'p_003', contratoId: 'ct_003', contratoNumber: '2024-003', buyerName: 'Ana Carolina Souza', number: 1, totalInstallments: 108, dueDate: '2024-07-20', paidAt: '2024-07-19T10:00:00Z', value: 1951, penalty: 0, interest: 0, status: 'paga', boletoUrl: '#', boletoCode: null },
  { id: 'p_004', contratoId: 'ct_001', contratoNumber: '2024-001', buyerName: 'Marcos Vinícius Borges', number: 3, totalInstallments: 96, dueDate: '2024-07-05', paidAt: null, value: 2340, penalty: 117, interest: 47, status: 'atrasada', boletoUrl: '#', boletoCode: '34191.75402 25530.801509 20065.601018 4 93540000250400' },
  { id: 'p_005', contratoId: 'ct_002', contratoNumber: '2024-002', buyerName: 'Fernanda Oliveira Cruz', number: 1, totalInstallments: 96, dueDate: '2024-08-15', paidAt: null, value: 1724, penalty: 0, interest: 0, status: 'aberta', boletoUrl: '#', boletoCode: '34191.75402 25530.801509 20065.601018 4 93540000172400' },
]

// ─── Automações ──────────────────────────────────────────────────────────────

export const mockAutomations: Automation[] = [
  {
    id: 'auto_001',
    name: 'Boas-vindas ao novo lead',
    trigger: 'lead_criado',
    active: true,
    actions: [
      { id: 'a1', type: 'enviar_whatsapp', delayHours: 0, config: { template: 'boas_vindas' } },
      { id: 'a2', type: 'enviar_email', delayHours: 1, config: { template: 'email_boas_vindas' } },
      { id: 'a3', type: 'criar_tarefa', delayHours: 24, config: { task: 'Ligar para o lead' } },
    ],
    executionCount: 347,
    lastRunAt: '2024-07-15T09:30:00Z',
    createdAt: '2024-01-10T00:00:00Z',
  },
  {
    id: 'auto_002',
    name: 'Follow-up sem resposta 48h',
    trigger: 'lead_sem_resposta',
    active: true,
    actions: [
      { id: 'a4', type: 'enviar_whatsapp', delayHours: 0, config: { template: 'follow_up_1' } },
      { id: 'a5', type: 'notificar_corretor', delayHours: 4, config: { message: 'Lead sem resposta — ligar!' } },
    ],
    executionCount: 189,
    lastRunAt: '2024-07-14T14:00:00Z',
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'auto_003',
    name: 'Lembrete de parcela (D-3)',
    trigger: 'parcela_vencendo',
    active: true,
    actions: [
      { id: 'a6', type: 'enviar_whatsapp', delayHours: 0, config: { template: 'lembrete_boleto' } },
      { id: 'a7', type: 'enviar_email', delayHours: 2, config: { template: 'email_boleto' } },
    ],
    executionCount: 1243,
    lastRunAt: '2024-07-15T08:00:00Z',
    createdAt: '2024-01-20T00:00:00Z',
  },
  {
    id: 'auto_004',
    name: 'Parabéns pelo contrato assinado',
    trigger: 'contrato_assinado',
    active: true,
    actions: [
      { id: 'a8', type: 'enviar_email', delayHours: 0, config: { template: 'email_contrato' } },
      { id: 'a9', type: 'enviar_whatsapp', delayHours: 0, config: { template: 'whatsapp_contrato' } },
    ],
    executionCount: 226,
    lastRunAt: '2024-07-10T15:00:00Z',
    createdAt: '2024-02-01T00:00:00Z',
  },
  {
    id: 'auto_005',
    name: 'Cobrança de parcela atrasada',
    trigger: 'parcela_atrasada',
    active: false,
    actions: [
      { id: 'a10', type: 'enviar_whatsapp', delayHours: 0, config: { template: 'cobranca_1' } },
      { id: 'a11', type: 'enviar_email', delayHours: 0, config: { template: 'email_cobranca' } },
      { id: 'a12', type: 'criar_tarefa', delayHours: 48, config: { task: 'Ligar para negociar' } },
    ],
    executionCount: 0,
    lastRunAt: null,
    createdAt: '2024-03-10T00:00:00Z',
  },
]

// ─── Obras ───────────────────────────────────────────────────────────────────

export const mockObras: Obra[] = [
  {
    id: 'obra_001',
    empreendimentoId: 'emp_001',
    empreendimentoName: 'Portal do Lago II',
    status: 'em_andamento',
    progress: 68,
    totalPlannedCost: 4200000,
    totalActualCost: 3187500,
    startDate: '2023-08-01',
    estimatedEndDate: '2025-02-28',
    stages: [
      { id: 's1', name: 'Terraplanagem', status: 'concluida', progress: 100, startDate: '2023-08-01', endDate: '2023-11-30', plannedCost: 480000, actualCost: 462000 },
      { id: 's2', name: 'Infraestrutura de água', status: 'concluida', progress: 100, startDate: '2023-12-01', endDate: '2024-03-31', plannedCost: 680000, actualCost: 715000 },
      { id: 's3', name: 'Pavimentação', status: 'em_andamento', progress: 75, startDate: '2024-02-01', endDate: '2024-10-31', plannedCost: 1200000, actualCost: 920000 },
      { id: 's4', name: 'Energia elétrica', status: 'em_andamento', progress: 40, startDate: '2024-04-01', endDate: '2024-12-31', plannedCost: 760000, actualCost: 340000 },
      { id: 's5', name: 'Paisagismo e lazer', status: 'nao_iniciada', progress: 0, startDate: null, endDate: null, plannedCost: 580000, actualCost: 0 },
      { id: 's6', name: 'Guarita e muros', status: 'nao_iniciada', progress: 0, startDate: null, endDate: null, plannedCost: 500000, actualCost: 0 },
    ],
  },
]

// ─── Contas a Pagar ──────────────────────────────────────────────────────────

export const mockContasPagar: ContaPagar[] = [
  { id: 'cp_001', description: 'Serviço de pavimentação — medição #8', supplier: 'Construtora Alfa Ltda', category: 'Obras', value: 85000, dueDate: '2024-07-20', paidAt: null, status: 'pendente', attachmentUrl: null, empreendimentoId: 'emp_001' },
  { id: 'cp_002', description: 'Material elétrico — cabos e transformadores', supplier: 'Elétrica Omega', category: 'Obras', value: 32400, dueDate: '2024-07-15', paidAt: null, status: 'vencido', attachmentUrl: null, empreendimentoId: 'emp_001' },
  { id: 'cp_003', description: 'Comissão de vendas — julho/2024', supplier: 'Imobiliária Parceira XYZ', category: 'Comissão', value: 21000, dueDate: '2024-07-31', paidAt: null, status: 'pendente', attachmentUrl: null },
  { id: 'cp_004', description: 'Plano LoteMobile — mensalidade agosto', supplier: 'LoteMobile Tecnologia', category: 'Software', value: 2590, dueDate: '2024-08-05', paidAt: null, status: 'pendente', attachmentUrl: null },
  { id: 'cp_005', description: 'Serviço de contabilidade — julho', supplier: 'Escritório Contábil Silva', category: 'Contabilidade', value: 3800, dueDate: '2024-07-10', paidAt: '2024-07-09T10:00:00Z', status: 'pago', attachmentUrl: '#' },
]

// ─── Chart data ──────────────────────────────────────────────────────────────

export const mockMonthlyRevenue = [
  { month: 'Jan', receitas: 612000, previsao: 580000 },
  { month: 'Fev', receitas: 689000, previsao: 640000 },
  { month: 'Mar', receitas: 724000, previsao: 700000 },
  { month: 'Abr', receitas: 698000, previsao: 720000 },
  { month: 'Mai', receitas: 812000, previsao: 780000 },
  { month: 'Jun', receitas: 876000, previsao: 840000 },
  { month: 'Jul', receitas: 853420, previsao: 900000 },
]

export const mockLeadsBySource = [
  { source: 'Instagram', value: 38 },
  { source: 'Facebook', value: 24 },
  { source: 'Site', value: 18 },
  { source: 'Indicação', value: 12 },
  { source: 'WhatsApp', value: 5 },
  { source: 'Outros', value: 3 },
]

export const mockLotAvailability = [
  { name: 'Vendido', value: 250, color: '#ef4444' },
  { name: 'Disponível', value: 174, color: '#22c55e' },
  { name: 'Reservado', value: 56, color: '#f59e0b' },
]
