'use client'

import type { ReactNode } from 'react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import Topbar  from '@/components/topbar'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const { user, hydrate } = useAuthStore()
  const router = useRouter()

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
          {children}
        </div>
      </main>
    </div>
  )
}
