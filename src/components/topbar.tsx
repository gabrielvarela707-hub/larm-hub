'use client'

import { Bell, Search, ChevronRight, LogOut, User } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'

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
  '/automacoes': 'Automacoes',
  '/relatorios': 'Relatorios',
  '/obras': 'Obras',
  '/landing-pages': 'Landing Pages',
  '/ia': 'Chat IA',
  '/controladoria': 'Controladoria',
  '/configuracoes': 'Configuracoes',
}

interface TopbarProps {
  sidebarCollapsed: boolean
}

export default function Topbar({ sidebarCollapsed }: TopbarProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const user     = useAuthStore(s => s.user)
  const logout   = useAuthStore(s => s.logout)
  const label    = ROUTE_LABELS[pathname] ?? 'Pagina'

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <header className={cn(
      'fixed top-0 right-0 h-14 z-30 flex items-center px-5 gap-4',
      'bg-white border-b border-slate-100 transition-all duration-200',
      sidebarCollapsed ? 'left-16' : 'left-60'
    )}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
        <span className="text-slate-400 text-xs hidden sm:block truncate max-w-[120px]">
          {user?.tenantName ?? 'LoteMobile'}
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 hidden sm:block" />
        <span className="text-slate-800 font-medium truncate">{label}</span>
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 w-52 cursor-text flex-shrink-0">
        <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className="text-sm text-slate-400">Buscar...</span>
        <span className="ml-auto text-[10px] text-slate-300 bg-slate-100 px-1.5 py-0.5 rounded font-mono">K</span>
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-slate-50 transition-colors flex-shrink-0">
        <Bell className="w-4 h-4 text-slate-600" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
      </button>

      {/* User menu */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-sm text-slate-700">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[10px] font-semibold">
              {user?.name.split(' ').slice(0,2).map(n => n[0]).join('') ?? 'AD'}
            </span>
          </div>
          <span className="font-medium text-slate-800 hidden lg:block">{user?.name.split(' ')[0]}</span>
        </div>
        <button onClick={handleLogout}
          title="Sair"
          className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
