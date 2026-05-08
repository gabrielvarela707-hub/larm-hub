'use client'

/**
 * src/app/financeiro/layout.tsx
 *
 * Layout do módulo Financeiro.
 * Renderiza uma sub-navegação lateral com todos os itens do módulo agrupados.
 * Este layout é filho do layout raiz da aplicação (src/app/layout.tsx),
 * portanto herda o sidebar global + topbar já existentes.
 */

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LayoutDashboard,
  TrendingUp,
  ArrowRightLeft,
  FileText,
  Users,
  Building2,
  ChevronRight,
} from 'lucide-react'

// ─── Definição dos itens de navegação do módulo ───────────────────────────────
const NAV = [
  {
    section: null,
    items: [
      { href: '/financeiro', label: 'Visão Geral', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    section: 'Relatórios',
    items: [
      { href: '/financeiro/cashflow',  label: 'Cash Flow',          icon: TrendingUp },
      { href: '/financeiro/movimento', label: 'Movimento Bancário',  icon: ArrowRightLeft },
    ],
  },
  {
    section: 'Financeiro',
    items: [
      { href: '/financeiro/contas-pagar', label: 'Contas a Pagar', icon: FileText },
    ],
  },
  {
    section: 'Cadastros',
    items: [
      { href: '/financeiro/fornecedores', label: 'Fornecedores',    icon: Users },
      { href: '/financeiro/bancos',       label: 'Bancos & Contas', icon: Building2 },
    ],
  },
]

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <div className="flex h-full min-h-screen">

      {/* ── Sub-sidebar do módulo ── */}
      <aside className="w-52 shrink-0 border-r border-sidebar-border bg-sidebar-bg flex flex-col">

        {/* Cabeçalho do módulo */}
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-brand-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-sidebar-text leading-none">Financeiro</p>
              <p className="text-[10px] text-sidebar-muted mt-0.5">Gestão financeira</p>
            </div>
          </div>
        </div>

        {/* Itens de navegação */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map((group, gi) => (
            <div key={gi} className="mb-1">

              {/* Rótulo de seção */}
              {group.section && (
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                  {group.section}
                </p>
              )}

              {/* Links */}
              {group.items.map(item => {
                const active = isActive(item.href, item.exact)
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`
                      mx-2 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm
                      transition-all duration-150 animate-fade-in
                      ${active
                        ? 'bg-brand-500/10 text-brand-600 font-medium'
                        : 'text-sidebar-muted hover:bg-sidebar-border/40 hover:text-sidebar-text'
                      }
                    `}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-500' : ''}`} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && (
                      <ChevronRight className="w-3 h-3 text-brand-500 shrink-0" />
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* Rodapé da sub-sidebar */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-[10px] text-sidebar-muted">
            LARM HUB · Módulo Financeiro
          </p>
        </div>
      </aside>

      {/* ── Conteúdo das páginas ── */}
      <main className="flex-1 overflow-auto bg-surface">
        {children}
      </main>

    </div>
  )
}
