// ─── Modules ─────────────────────────────────────────────────────────────────

export const MODULES = [
  { id: 'dashboard',                    label: 'Dashboard',               group: 'Geral' },
  { id: 'empreendimentos',              label: 'Empreendimentos',         group: 'Geral' },
  { id: 'mapa',                         label: 'Mapa Interativo',          group: 'Geral' },
  { id: 'crm',                          label: 'CRM e Funil',              group: 'Vendas' },
  { id: 'automacoes',                   label: 'Automacoes',               group: 'Vendas' },
  { id: 'landing_pages',                label: 'Landing Pages',            group: 'Vendas' },
  { id: 'simulador',                    label: 'Simulador de Vendas',      group: 'Vendas' },
  { id: 'contratos',                    label: 'Contratos',                group: 'Vendas' },
  { id: 'fin_cashflow',                 label: 'CashFlow',                 group: 'Financeiro' },
  { id: 'fin_orcamento',                label: 'Orçamento',                group: 'Financeiro' },
  { id: 'fin_movimento_orcado',         label: 'Movimento Orçado',         group: 'Financeiro' },
  { id: 'fin_movimento',                label: 'Movimento Bancário',       group: 'Financeiro' },
  { id: 'fin_receber',                  label: 'Contas a Receber',         group: 'Financeiro' },
  { id: 'fin_pagar',                    label: 'Contas a Pagar',           group: 'Financeiro' },
  { id: 'fin_bancos',                   label: 'Bancos e Contas',          group: 'Financeiro' },
  { id: 'fin_boletos',                  label: 'Boletos',                  group: 'Financeiro' },
  { id: 'fin_split',                    label: 'Split de Pagamento',       group: 'Financeiro' },
  { id: 'fin_sped',                     label: 'SPED e DIMOB',             group: 'Financeiro' },
  { id: 'fin_fornecedores',             label: 'Fornecedores',            group: 'Cadastros' },
  { id: 'cadastros_tipo_documento',     label: 'Tipo de Documento',       group: 'Cadastros' },
  { id: 'cadastros_plano_contas',       label: 'Plano de Contas',         group: 'Cadastros' },
  { id: 'cadastros_indices_economicos', label: 'Atualização de Índices',  group: 'Cadastros' },
  { id: 'cadastros_clientes',           label: 'Clientes',                group: 'Cadastros' },
  { id: 'obras',                        label: 'Obras',                    group: 'Operacional' },
  { id: 'relatorios',                   label: 'Relatorios',               group: 'Operacional' },
  { id: 'controladoria',                label: 'Controladoria (Ads)',      group: 'Operacional' },
  { id: 'ia',                           label: 'Chat IA',                  group: 'Operacional' },
  { id: 'configuracoes',                label: 'Configuracoes',           group: 'Sistema' },
  { id: 'usuarios',                     label: 'Usuarios e Permissoes',    group: 'Sistema' },
] as const

export type ModuleId = typeof MODULES[number]['id']

// ─── Permission levels ────────────────────────────────────────────────────────

export type PermLevel = 'none' | 'read' | 'write' | 'full'

export interface ModulePermission {
  moduleId: ModuleId
  level: PermLevel
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export type RoleId = 'admin' | 'manager' | 'broker' | 'accountant' | 'viewer'

export interface Role {
  id: RoleId
  label: string
  description: string
  color: string
  permissions: Partial<Record<ModuleId, PermLevel>>
}

export const DEFAULT_ROLES: Role[] = [
  {
    id: 'admin',
    label: 'Administrador',
    description: 'Acesso total a todos os modulos e configuracoes',
    color: 'bg-violet-100 text-violet-700',
    permissions: Object.fromEntries(MODULES.map(m => [m.id, 'full'])) as Record<ModuleId, PermLevel>,
  },
  {
    id: 'manager',
    label: 'Gerente',
    description: 'Acesso a vendas, financeiro e relatorios. Sem configuracoes do sistema.',
    color: 'bg-blue-100 text-blue-700',
    permissions: {
      dashboard: 'full', empreendimentos: 'write', mapa: 'full',
      crm: 'full', automacoes: 'write', landing_pages: 'write',
      simulador: 'full', contratos: 'write',
      fin_receber: 'read', fin_pagar: 'read', fin_boletos: 'read',
      fin_split: 'read', fin_sped: 'read',
      obras: 'read', relatorios: 'full', controladoria: 'read',
      ia: 'full', configuracoes: 'none', usuarios: 'none',
    },
  },
  {
    id: 'broker',
    label: 'Corretor',
    description: 'Acesso ao CRM, mapa, simulador e contratos. Sem financeiro.',
    color: 'bg-emerald-100 text-emerald-700',
    permissions: {
      dashboard: 'read', empreendimentos: 'read', mapa: 'full',
      crm: 'write', automacoes: 'none', landing_pages: 'read',
      simulador: 'full', contratos: 'read',
      fin_receber: 'none', fin_pagar: 'none', fin_boletos: 'none',
      fin_split: 'none', fin_sped: 'none',
      obras: 'none', relatorios: 'read', controladoria: 'none',
      ia: 'read', configuracoes: 'none', usuarios: 'none',
    },
  },
  {
    id: 'accountant',
    label: 'Contador',
    description: 'Acesso somente leitura ao financeiro, SPED e relatorios.',
    color: 'bg-amber-100 text-amber-700',
    permissions: {
      dashboard: 'read', empreendimentos: 'read', mapa: 'read',
      crm: 'none', automacoes: 'none', landing_pages: 'none',
      simulador: 'none', contratos: 'read',
      fin_receber: 'read', fin_pagar: 'read', fin_boletos: 'read',
      fin_split: 'read', fin_sped: 'full',
      obras: 'read', relatorios: 'full', controladoria: 'none',
      ia: 'none', configuracoes: 'none', usuarios: 'none',
    },
  },
  {
    id: 'viewer',
    label: 'Visualizador',
    description: 'Somente leitura em dashboard, mapa e relatorios.',
    color: 'bg-slate-100 text-slate-600',
    permissions: {
      dashboard: 'read', empreendimentos: 'read', mapa: 'read',
      crm: 'none', automacoes: 'none', landing_pages: 'none',
      simulador: 'none', contratos: 'none',
      fin_receber: 'none', fin_pagar: 'none', fin_boletos: 'none',
      fin_split: 'none', fin_sped: 'none',
      obras: 'none', relatorios: 'read', controladoria: 'none',
      ia: 'none', configuracoes: 'none', usuarios: 'none',
    },
  },
]

// ─── User with custom overrides ───────────────────────────────────────────────

export interface TenantUser {
  id: string
  name: string
  email: string
  phone?: string
  roleId: RoleId
  // Per-user overrides on top of role defaults
  permissionOverrides?: Partial<Record<ModuleId, PermLevel>>
  active: boolean
  createdAt: string
}

// Resolve effective permission for a user on a module
export function resolvePermission(
  user: TenantUser,
  moduleId: ModuleId,
  roles: Role[] = DEFAULT_ROLES
): PermLevel {
  // Override takes precedence
  if (user.permissionOverrides?.[moduleId] !== undefined) {
    return user.permissionOverrides[moduleId]!
  }
  const role = roles.find(r => r.id === user.roleId)
  return role?.permissions[moduleId] ?? 'none'
}

export function canRead(user: TenantUser, moduleId: ModuleId): boolean {
  const p = resolvePermission(user, moduleId)
  return p === 'read' || p === 'write' || p === 'full'
}

export function canWrite(user: TenantUser, moduleId: ModuleId): boolean {
  const p = resolvePermission(user, moduleId)
  return p === 'write' || p === 'full'
}

// ─── Mock current user (replace with real auth context) ──────────────────────

export const MOCK_CURRENT_USER: TenantUser = {
  id: 'user_001',
  name: 'Fernando Monteiro',
  email: 'fernando@santaclara.com.br',
  phone: '(11) 96348-0800',
  roleId: 'admin',
  active: true,
  createdAt: '2024-01-01T00:00:00Z',
}

export const MOCK_TENANT_USERS: TenantUser[] = [
  MOCK_CURRENT_USER,
  {
    id: 'user_002', name: 'Carlos Henrique', email: 'carlos@santaclara.com.br',
    phone: '(12) 99876-5432', roleId: 'broker', active: true, createdAt: '2024-02-01T00:00:00Z',
  },
  {
    id: 'user_003', name: 'Ana Paula Costa', email: 'ana@santaclara.com.br',
    phone: '(12) 98765-4321', roleId: 'broker', active: true, createdAt: '2024-02-15T00:00:00Z',
  },
  {
    id: 'user_004', name: 'Maria Contadora', email: 'maria@escritoriosilva.com.br',
    phone: '(12) 97654-3210', roleId: 'accountant', active: true, createdAt: '2024-03-01T00:00:00Z',
  },
  {
    id: 'user_005', name: 'Pedro Gerente', email: 'pedro@santaclara.com.br',
    phone: '(12) 96543-2109', roleId: 'manager', active: false, createdAt: '2024-04-01T00:00:00Z',
    permissionOverrides: { controladoria: 'full', fin_pagar: 'write' },
  },
]

// ─── Tenant credentials schema ────────────────────────────────────────────────

export interface TenantCredentials {
  // Google Maps
  googleMapsKey: string
  // AWS SES
  sesRegion: string
  sesAccessKeyId: string
  sesSecretAccessKey: string
  sesFromEmail: string
  sesFromName: string
  // WhatsApp Business API
  whatsappToken: string
  whatsappPhoneId: string
  whatsappBusinessId: string
  // Digital signature
  clicksignKey: string
  // Banking
  bankName: string
  bankApiKey: string
  bankClientId: string
}

export const EMPTY_CREDENTIALS: TenantCredentials = {
  googleMapsKey: '', sesRegion: 'us-east-1', sesAccessKeyId: '',
  sesSecretAccessKey: '', sesFromEmail: '', sesFromName: '',
  whatsappToken: '', whatsappPhoneId: '', whatsappBusinessId: '',
  clicksignKey: '', bankName: '', bankApiKey: '', bankClientId: '',
}
