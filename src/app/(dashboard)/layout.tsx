'use client'

import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import Sidebar from '@/components/sidebar'
import Topbar from '@/components/topbar'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'
import { canAccessRoute, firstAccessibleHref } from '@/lib/module-access'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const { user, hydrate } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Fallback client-side guard caso o middleware não bloqueie
  useEffect(() => {
    const stored = sessionStorage.getItem('auth_user')
    if (!stored && !user) {
      router.replace('/login')
    }
  }, [user, router])

  // Tela de loading enquanto valida sessão
  if (!user && typeof window !== 'undefined' && !sessionStorage.getItem('auth_user')) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Verificando sessão…</p>
        </div>
      </div>
    )
  }

  const allowed = canAccessRoute(user, pathname)
  const fallbackHref = firstAccessibleHref(user)

  return (
    <div className="min-h-screen bg-surface">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <Topbar sidebarCollapsed={collapsed} />
      <main
        className={cn(
          'transition-all duration-200 pt-14',
          collapsed ? 'ml-16' : 'ml-60'
        )}
      >
        <div className="p-6 animate-fade-in">
          {allowed ? children : (
            <div className="min-h-[calc(100vh-7rem)] flex items-center justify-center">
              <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <Lock className="w-5 h-5 text-slate-500" />
                </div>
                <h1 className="text-lg font-semibold text-slate-900">Acesso restrito</h1>
                <p className="text-sm text-slate-500 mt-2">
                  Seu perfil nao tem permissao para acessar este modulo.
                </p>
                <Link
                  href={fallbackHref}
                  className="inline-flex items-center justify-center mt-5 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  Ir para um modulo permitido
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
