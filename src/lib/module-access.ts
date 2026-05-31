import type { AuthUser } from '@/lib/auth-store'

export type AccessLevel = 'read' | 'write'
export type ModulePermission = { read?: boolean; write?: boolean }

const ADMIN_ROLES = new Set(['super_admin', 'admin'])

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Gerente',
  controller: 'Controladoria',
  financial: 'Financeiro',
  marketing: 'Marketing',
  accountant: 'Contador',
  broker: 'Corretor',
  consultant: 'Consultor',
  assistant: 'Assistente',
  supplier: 'Fornecedor',
  client: 'Cliente',
  viewer: 'Visualizador',
}

export const MODULE_ALIASES: Record<string, string[]> = {
  dashboard: ['dashboard'],
  empreendimentos: ['empreendimentos'],
  mapa: ['mapa'],
  crm: ['crm'],
  leads: ['crm'],
  funil: ['crm'],
  automacoes: ['automacoes'],
  landing: ['landing_pages'],
  landing_pages: ['landing_pages'],
  simulador: ['simulador'],
  contratos: ['contratos'],
  financeiro: ['fin_receber', 'fin_pagar', 'fin_boletos', 'fin_split', 'fin_sped'],
  fin_cashflow: ['fin_receber', 'fin_pagar', 'relatorios'],
  fin_orcamento: ['fin_receber', 'fin_pagar', 'relatorios'],
  fin_movimento: ['fin_receber', 'fin_pagar', 'fin_split'],
  fin_receber: ['fin_receber'],
  fin_pagar: ['fin_pagar'],
  fin_fornecedores: ['fin_pagar'],
  fin_bancos: ['fin_receber', 'fin_pagar'],
  fin_boletos: ['fin_boletos'],
  fin_split: ['fin_split'],
  fin_sped: ['fin_sped'],
  obras: ['obras'],
  cadastros_tipo_documento: ['fin_pagar', 'fin_receber', 'configuracoes'],
  cadastros_plano_contas: ['fin_pagar', 'fin_receber', 'configuracoes'],
  relatorios: ['relatorios'],
  relatorios_mapa_vendas: ['relatorios'],
  relatorios_projetos_obras: ['relatorios'],
  relatorios_unidades_estoque: ['relatorios'],
  relatorios_implantacao: ['relatorios'],
  controladoria: ['controladoria'],
  ia: ['ia'],
  configuracoes: ['configuracoes'],
  usuarios: ['usuarios'],
}

export function normalizeModuleIds(moduleIds?: string | string[]): string[] {
  if (!moduleIds) return []
  const raw = Array.isArray(moduleIds) ? moduleIds : [moduleIds]
  return raw.flatMap(id => MODULE_ALIASES[id] ?? [id]).filter(Boolean)
}

export function isAdminUser(user?: Pick<AuthUser, 'role'> | null) {
  return Boolean(user?.role && ADMIN_ROLES.has(user.role))
}

export function hasModuleAccess(
  user: Pick<AuthUser, 'role' | 'permissions'> | null | undefined,
  moduleIds?: string | string[],
  level: AccessLevel = 'read'
): boolean {
  if (isAdminUser(user)) return true
  if (!user) return false

  const ids = normalizeModuleIds(moduleIds)
  if (!ids.length) return true

  const permissions = (user.permissions || {}) as Record<string, ModulePermission>

  return ids.some(id => {
    const perm = permissions[id]
    if (!perm) return false
    if (level === 'write') return Boolean(perm.write)
    return Boolean(perm.read || perm.write)
  })
}

export function roleLabel(role?: string) {
  return ROLE_LABELS[role || ''] || role || 'Usuario'
}

export function initials(name?: string | null, email?: string | null) {
  const base = (name || email || 'Usuario').trim()
  const parts = base.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return base.slice(0, 2).toUpperCase()
}

type RouteRule = {
  prefix: string
  modules: string[]
  exact?: boolean
}

export const ROUTE_ACCESS: RouteRule[] = [
  { prefix: '/', modules: ['dashboard'], exact: true },
  { prefix: '/empreendimentos', modules: ['empreendimentos'] },
  { prefix: '/mapa', modules: ['mapa'] },
  { prefix: '/crm/leads', modules: ['crm'] },
  { prefix: '/crm', modules: ['crm'] },
  { prefix: '/automacoes', modules: ['automacoes'] },
  { prefix: '/landing-pages', modules: ['landing_pages'] },
  { prefix: '/simulador', modules: ['simulador'] },
  { prefix: '/contratos', modules: ['contratos'] },
  { prefix: '/financeiro/cashflow', modules: ['fin_cashflow'] },
  { prefix: '/financeiro/orcamento', modules: ['fin_orcamento'] },
  { prefix: '/financeiro/movimento', modules: ['fin_movimento'] },
  { prefix: '/financeiro/receber', modules: ['fin_receber'] },
  { prefix: '/financeiro/pagar', modules: ['fin_pagar'] },
  { prefix: '/financeiro/contas-pagar', modules: ['fin_pagar'] },
  { prefix: '/financeiro/fornecedores', modules: ['fin_fornecedores'] },
  { prefix: '/financeiro/bancos', modules: ['fin_bancos'] },
  { prefix: '/financeiro/boletos', modules: ['fin_boletos'] },
  { prefix: '/financeiro/split', modules: ['fin_split'] },
  { prefix: '/financeiro/sped', modules: ['fin_sped'] },
  { prefix: '/financeiro', modules: ['financeiro'] },
  { prefix: '/obras', modules: ['obras'] },
  { prefix: '/cadastros/tipo-documento', modules: ['cadastros_tipo_documento'] },
  { prefix: '/cadastros/plano-contas', modules: ['cadastros_plano_contas'] },
  { prefix: '/relatorios/mapa-vendas', modules: ['relatorios_mapa_vendas'] },
  { prefix: '/relatorios/projetos-obras', modules: ['relatorios_projetos_obras'] },
  { prefix: '/relatorios/unidades-estoque', modules: ['relatorios_unidades_estoque'] },
  { prefix: '/relatorios/implantacao', modules: ['relatorios_implantacao'] },
  { prefix: '/relatorios', modules: ['relatorios'] },
  { prefix: '/controladoria', modules: ['controladoria'] },
  { prefix: '/ia', modules: ['ia'] },
  { prefix: '/configuracoes', modules: ['configuracoes', 'usuarios'] },
]

export function getRouteModules(pathname: string): string[] | null {
  const cleanPath = pathname.split('?')[0].replace(/\/$/, '') || '/'
  const rules = [...ROUTE_ACCESS].sort((a, b) => b.prefix.length - a.prefix.length)
  const rule = rules.find(r => {
    if (r.exact) return cleanPath === r.prefix
    return cleanPath === r.prefix || cleanPath.startsWith(`${r.prefix}/`)
  })
  return rule?.modules ?? null
}

export function canAccessRoute(user: AuthUser | null | undefined, pathname: string) {
  const modules = getRouteModules(pathname)
  if (!modules) return true
  return hasModuleAccess(user, modules, 'read')
}

export function firstAccessibleHref(user: AuthUser | null | undefined) {
  const options = [
    { href: '/', modules: ['dashboard'] },
    { href: '/crm', modules: ['crm'] },
    { href: '/financeiro/pagar', modules: ['fin_pagar'] },
    { href: '/financeiro/receber', modules: ['fin_receber'] },
    { href: '/empreendimentos', modules: ['empreendimentos'] },
    { href: '/mapa', modules: ['mapa'] },
    { href: '/relatorios', modules: ['relatorios'] },
    { href: '/configuracoes', modules: ['configuracoes', 'usuarios'] },
  ]
  return options.find(o => hasModuleAccess(user, o.modules, 'read'))?.href || '/login'
}
