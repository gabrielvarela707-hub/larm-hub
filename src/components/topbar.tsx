'use client'

import { Bell, Search, ChevronRight, Building2 } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/empreendimentos': 'Empreendimentos',
  '/mapa': 'Mapa Interativo',
  '/crm': 'Funil de Vendas',
  '/crm/leads': 'Todos os Leads',
  '/simulador': 'Simulador de Vendas',
  '/contratos': 'Contratos',
  '/financeiro/receber': 'Contas a Receber',
  '/financeiro/pagar': 'Contas a Pagar',
  '/financeiro/boletos': 'Boletos',
  '/financeiro/split': 'Split de Pagamento',
  '/financeiro/sped': 'SPED e DIMOB',
  '/automacoes': 'Automações',
  '/relatorios': 'Relatórios',
  '/obras': 'Obras',
  '/landing-pages': 'Landing Pages',
  '/ia': 'Chat IA',
  '/configuracoes': 'Configurações',
}

interface TopbarProps {
  sidebarCollapsed: boolean
}

export default function Topbar({ sidebarCollapsed }: TopbarProps) {
  const pathname = usePathname()
  const label = ROUTE_LABELS[pathname] ?? 'Página'

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-14 z-30 flex items-center px-5 gap-4',
        'bg-white border-b border-slate-100 transition-all duration-200',
        sidebarCollapsed ? 'left-16' : 'left-60'
      )}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-1">
        <Building2 className="w-4 h-4 text-slate-400" />
        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
        <span className="text-slate-800 font-medium">{label}</span>
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-56 cursor-text">
        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className="text-sm text-slate-400">Buscar...</span>
        <span className="ml-auto text-[10px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded font-mono">⌘K</span>
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-slate-50 transition-colors">
        <Bell className="w-4.5 h-4.5 text-slate-600" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
      </button>

      {/* Empreendimento selector */}
      <button className="hidden sm:flex items-center gap-2 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-100 transition-colors">
        <span className="w-2 h-2 bg-green-500 rounded-full" />
        <span className="font-medium text-slate-700">Portal do Lago II</span>
        <ChevronRight className="w-3.5 h-3.5 rotate-90" />
      </button>
    </header>
  )
}
