'use client'

import type { ElementType } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Map, Users, FileText, DollarSign,
  Zap, BarChart3, Building2, Bot, Settings, MapPin,
  Globe, HardHat, ChevronDown, ChevronRight,
  TrendingUp, ChevronLeft, LogOut, HelpCircle, Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockTenant } from '@/lib/mock-data'

interface NavItem {
  label: string
  href?: string
  icon: ElementType
  badge?: string | number
  badgeColor?: string
  children?: { label: string; href: string; badge?: string | number }[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Empreendimentos', href: '/empreendimentos', icon: Building2 },
  { label: 'Mapa Interativo', href: '/mapa', icon: Map },
  {
    label: 'CRM & Funil',
    icon: Users,
    badge: 11,
    badgeColor: 'bg-blue-600',
    children: [
      { label: 'Funil de Vendas', href: '/crm' },
      { label: 'Todos os Leads', href: '/crm/leads' },
      { label: 'Automações', href: '/automacoes' },
    ],
  },
  { label: 'Landing Pages', href: '/landing-pages', icon: Globe },
  { label: 'Simulador de Vendas', href: '/simulador', icon: TrendingUp },
  { label: 'Contratos', href: '/contratos', icon: FileText, badge: 2, badgeColor: 'bg-amber-500' },
  {
    label: 'Financeiro',
    icon: DollarSign,
    children: [
      { label: 'Contas a Receber', href: '/financeiro/receber', badge: 3 },
      { label: 'Contas a Pagar', href: '/financeiro/pagar' },
      { label: 'Boletos', href: '/financeiro/boletos' },
      { label: 'Split de Pagamento', href: '/financeiro/split' },
      { label: 'SPED e DIMOB', href: '/financeiro/sped' },
    ],
  },
  { label: 'Obras', href: '/obras', icon: HardHat },
  { label: 'Relatórios', href: '/relatorios', icon: BarChart3 },
  { label: 'Controladoria', href: '/controladoria', icon: Receipt },
  { label: 'Chat IA', href: '/ia', icon: Bot },
]

const BOTTOM_NAV: NavItem[] = [
  { label: 'Configurações', href: '/configuracoes', icon: Settings },
  { label: 'Ajuda', href: '/ajuda', icon: HelpCircle },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<string[]>(['CRM & Funil', 'Financeiro'])

  function toggleGroup(label: string) {
    setOpenGroups(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]
    )
  }

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  function isGroupActive(item: NavItem) {
    return item.children?.some(c => isActive(c.href)) ?? false
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-200',
        'border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-60'
      )}
      style={{ background: 'var(--sidebar-bg)' }}
    >
      {/* Header */}
      <div className="flex items-center h-14 px-4 border-b border-sidebar-border flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-white" />
            </div>
            <span className="text-white text-sm font-semibold truncate">
              {mockTenant.theme.logoText}
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <MapPin className="w-4 h-4 text-white" />
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-sidebar-muted hover:text-sidebar-text p-1 rounded-md hover:bg-white/5 transition-colors flex-shrink-0"
        >
          <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(item => {
          if (item.children) {
            const open = openGroups.includes(item.label)
            const groupActive = isGroupActive(item)
            return (
              <div key={item.label}>
                <button
                  onClick={() => !collapsed && toggleGroup(item.label)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                    groupActive
                      ? 'text-white bg-white/8'
                      : 'text-sidebar-muted hover:text-sidebar-text hover:bg-white/5'
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.badge && (
                        <span className={cn('text-[10px] text-white px-1.5 py-0.5 rounded-full leading-none', item.badgeColor ?? 'bg-slate-600')}>
                          {item.badge}
                        </span>
                      )}
                      {open
                        ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                      }
                    </>
                  )}
                </button>
                {!collapsed && open && (
                  <div className="mt-0.5 ml-4 pl-2.5 border-l border-sidebar-border space-y-0.5">
                    {item.children.map(child => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors',
                          isActive(child.href)
                            ? 'text-white bg-blue-600/20 font-medium'
                            : 'text-sidebar-muted hover:text-sidebar-text hover:bg-white/5'
                        )}
                      >
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
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
                isActive(item.href!)
                  ? 'text-white bg-blue-700/60'
                  : 'text-sidebar-muted hover:text-sidebar-text hover:bg-white/5'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn('text-[10px] text-white px-1.5 py-0.5 rounded-full leading-none', item.badgeColor ?? 'bg-slate-600')}>
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
      <div className="border-t border-sidebar-border px-2 py-3 space-y-0.5">
        {BOTTOM_NAV.map(item => (
          <Link
            key={item.href}
            href={item.href!}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors',
              isActive(item.href!)
                ? 'text-white bg-blue-700/60'
                : 'text-sidebar-muted hover:text-sidebar-text hover:bg-white/5'
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {/* User */}
        <div className={cn('flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors mt-1', collapsed && 'justify-center')}>
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-semibold">FM</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">Fernando Monteiro</p>
              <p className="text-sidebar-muted text-[10px] truncate">Admin</p>
            </div>
          )}
          {!collapsed && <LogOut className="w-3.5 h-3.5 text-sidebar-muted flex-shrink-0" />}
        </div>
      </div>
    </aside>
  )
}
