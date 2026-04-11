'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import Sidebar from '@/components/sidebar'
import Topbar from '@/components/topbar'
import { cn } from '@/lib/utils'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

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
