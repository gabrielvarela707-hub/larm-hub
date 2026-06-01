'use client'

import type { ElementType } from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Map, Users, FileText, DollarSign,
  BarChart3, Building2, Bot, Settings, MapPin,
  Globe, HardHat, ChevronDown, ChevronRight,
  TrendingUp, ChevronLeft, LogOut, HelpCircle, Receipt, Tag, MessageSquare, Megaphone, BookMarked, FileCheck, CalendarDays, Percent,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenantConfig } from '@/lib/tenant-config-store'
import { useAuthStore } from '@/lib/auth-store'
import { hasModuleAccess, initials, roleLabel } from '@/lib/module-access'

interface NavChild {
  label: string
  href: string
  badge?: string | number
  moduleIds?: string[]
}

interface NavItem {
  label: string
  href?: string
  icon: ElementType
  badge?: string | number
  badgeColor?: string
  moduleIds?: string[]
  children?: NavChild[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, moduleIds: ['dashboard'] },
  { label: 'Empreendimentos', href: '/empreendimentos', icon: Building2, moduleIds: ['empreendimentos'] },
  { label: 'Mapa Interativo', href: '/mapa', icon: Map, moduleIds: ['mapa'] },
  {
    label: 'CRM & Funil', icon: Users, badge: 11, badgeColor: 'bg-blue-600',
    children: [
      { label: 'Funil de Vendas', href: '/crm', moduleIds: ['crm'] },
      { label: 'Todos os Leads', href: '/crm/leads', moduleIds: ['crm'] },
      { label: 'Automacoes', href: '/automacoes', moduleIds: ['automacoes'] },
      { label: 'Conversas',  href: '/conversas',  moduleIds: ['crm'] },
      { label: 'Reservas',   href: '/reservas',   moduleIds: ['crm'] },
      { label: 'Propostas',  href: '/propostas',  moduleIds: ['crm'] },
      { label: 'Comissoes',   href: '/comissoes',   moduleIds: ['crm'] },
      { label: 'Agenda',      href: '/agenda',      moduleIds: ['crm'] },
    ],
  },
  { label: 'Marketing & Midia', href: '/marketing', icon: Megaphone, moduleIds: ['crm'] },
  { label: 'Landing Pages', href: '/landing-pages', icon: Globe, moduleIds: ['landing_pages'] },
  { label: 'Simulador de Vendas', href: '/simulador', icon: TrendingUp, moduleIds: ['simulador'] },
  { label: 'Contratos', href: '/contratos', icon: FileText, badge: 2, badgeColor: 'bg-amber-500', moduleIds: ['contratos'] },
  {
    label: 'Financeiro', icon: DollarSign,
    children: [
      { label: 'CashFlow', href: '/financeiro/cashflow', moduleIds: ['fin_cashflow'] },
      { label: 'Orçamento', href: '/financeiro/orcamento', moduleIds: ['fin_orcamento'] },
      { label: 'Mov. Orçado', href: '/financeiro/movimento-orcado', moduleIds: ['fin_orcamento'] },
      { label: 'Mov. Bancario', href: '/financeiro/movimento', moduleIds: ['fin_movimento'] },
      { label: 'Contas a Receber', href: '/financeiro/receber', badge: 3, moduleIds: ['fin_receber'] },
      { label: 'Contas a Pagar', href: '/financeiro/pagar', moduleIds: ['fin_pagar'] },
      { label: 'Fornecedores', href: '/financeiro/fornecedores', moduleIds: ['fin_fornecedores'] },
      { label: 'Bancos e Contas', href: '/financeiro/bancos', moduleIds: ['fin_bancos'] },
      { label: 'Boletos', href: '/financeiro/boletos', moduleIds: ['fin_boletos'] },
      { label: 'Split de Pagamento', href: '/financeiro/split', moduleIds: ['fin_split'] },
      { label: 'SPED e DIMOB', href: '/financeiro/sped', moduleIds: ['fin_sped'] },
    ],
  },
  { label: 'Obras', href: '/obras', icon: HardHat, moduleIds: ['obras'] },
  {
    label: 'Cadastros Auxiliares', icon: Tag,
    children: [
      { label: 'Tipo de Documento', href: '/cadastros/tipo-documento', moduleIds: ['cadastros_tipo_documento'] },
      { label: 'Plano de Contas', href: '/cadastros/plano-contas', moduleIds: ['cadastros_plano_contas'] },
    ],
  },
  {
    label: 'Relatorios', href: '/relatorios', icon: BarChart3, moduleIds: ['relatorios'],
    children: [
      { label: 'Mapa de Vendas', href: '/relatorios/mapa-vendas', moduleIds: ['relatorios_mapa_vendas'] },
      { label: 'Projetos / Obras', href: '/relatorios/projetos-obras', moduleIds: ['relatorios_projetos_obras'] },
      { label: 'Unidades do Estoque', href: '/relatorios/unidades-estoque', moduleIds: ['relatorios_unidades_estoque'] },
      { label: 'Implantacao / Plantas', href: '/relatorios/implantacao', moduleIds: ['relatorios_implantacao'] },
    ],
  },
  { label: 'Chat IA', href: '/ia', icon: Bot, moduleIds: ['ia'] },
]

const BOTTOM_NAV: NavItem[] = [
  { label: 'Configuracoes', href: '/configuracoes', icon: Settings, moduleIds: ['configuracoes', 'usuarios'] },
  { label: 'Ajuda', href: '/ajuda', icon: HelpCircle },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const hydrate = useTenantConfig(s => s.hydrate)
  const config = useTenantConfig(s => s.config)
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const [openGroups, setOpenGroups] = useState<string[]>(['CRM & Funil', 'Financeiro'])

  useEffect(() => { hydrate() }, [hydrate])

  const logoUrl = config.logoUrl
  const logoText = config.logoText || 'LoteMobile'
  const sidebarBg = config.sidebarColor || '#0D1B2A'

  function toggleGroup(label: string) {
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  function visibleChildren(item: NavItem) {
    return (item.children || []).filter(child => hasModuleAccess(user, child.moduleIds, 'read'))
  }

  function itemVisible(item: NavItem) {
    if (item.children?.length) return visibleChildren(item).length > 0 || hasModuleAccess(user, item.moduleIds, 'read')
    return hasModuleAccess(user, item.moduleIds, 'read')
  }

  function isGroupActive(item: NavItem) {
    return visibleChildren(item).some(c => isActive(c.href)) || Boolean(item.href && isActive(item.href))
  }

  const visibleNav = NAV.filter(itemVisible)
  const visibleBottomNav = BOTTOM_NAV.filter(itemVisible)
  const userInitials = initials(user?.name, user?.email)
  const userRoleLabel = roleLabel(user?.role)

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-200',
        'border-r border-white/[0.06]',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{ background: sidebarBg }}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-white/[0.06] flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={logoText}
                className="h-8 max-w-[140px] object-contain"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
            ) : (
              <>
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <span className="text-white text-sm font-semibold truncate">{logoText}</span>
              </>
            )}
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={logoText} className="w-full h-full object-contain p-0.5"
                style={{ filter: 'brightness(0) invert(1)' }} />
            ) : (
              <MapPin className="w-4 h-4 text-white" />
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-white/40 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleNav.map(item => {
          const children = visibleChildren(item)

          if (item.children) {
            const open = openGroups.includes(item.label)
            const groupActive = isGroupActive(item)
            return (
              <div key={item.label}>
                <button
                  onClick={() => !collapsed && toggleGroup(item.label)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                    groupActive ? 'text-white bg-white/8' : 'text-white/50 hover:text-white hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className={cn('text-[10px] text-white px-1.5 py-0.5 rounded-full leading-none', item.badgeColor ?? 'bg-white/20')}>
                          {item.badge}
                        </span>
                      )}
                      {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
                    </>
                  )}
                </button>
                {!collapsed && open && children.length > 0 && (
                  <div className="mt-0.5 ml-4 pl-2.5 border-l border-white/10 space-y-0.5">
                    {children.map(child => (
                      <Link key={child.href} href={child.href}
                        className={cn(
                          'flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors',
                          isActive(child.href)
                            ? 'text-white bg-blue-600/20 font-medium'
                            : 'text-white/40 hover:text-white hover:bg-white/5'
                        )}>
                        <span>{child.label}</span>
                        {child.badge && (
                          <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                            {child.badge}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          }
          return (
            <Link key={item.href} href={item.href!}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive(item.href!)
                  ? 'text-white bg-blue-700/60'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn('text-[10px] text-white px-1.5 py-0.5 rounded-full leading-none', item.badgeColor ?? 'bg-white/20')}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-white/[0.06] px-2 py-3 space-y-0.5">
        {visibleBottomNav.map(item => (
          <Link key={item.href} href={item.href!}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
              isActive(item.href!)
                ? 'text-white bg-blue-700/60'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => logout()}
          className={cn('w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors mt-1', collapsed && 'justify-center')}
          title={collapsed ? 'Sair' : undefined}
        >
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-semibold">{userInitials}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-white text-xs font-medium truncate">{user?.name || 'Usuario'}</p>
              <p className="text-white/40 text-[10px] truncate">{userRoleLabel}</p>
            </div>
          )}
          {!collapsed && <LogOut className="w-3.5 h-3.5 text-white/40 flex-shrink-0" />}
        </button>
      </div>
    </aside>
  )
}
