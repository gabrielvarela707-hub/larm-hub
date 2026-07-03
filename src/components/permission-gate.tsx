'use client'

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import type { ModuleId } from '@/lib/permissions'
import { useAuthStore } from '@/lib/auth-store'
import { hasModuleAccess } from '@/lib/module-access'

interface PermissionGateProps {
  moduleId: ModuleId | string
  require?: 'read' | 'write'
  fallback?: ReactNode
  children: ReactNode
}

export default function PermissionGate({
  moduleId,
  require = 'read',
  fallback,
  children,
}: PermissionGateProps) {
  const user = useAuthStore(s => s.user)
  const allowed = hasModuleAccess(user, moduleId, require)

  if (allowed) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
        <Lock className="w-5 h-5 text-slate-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">Acesso restrito</p>
        <p className="text-xs text-slate-400 mt-1">
          Voce nao tem permissao para acessar este modulo.
          <br />Fale com o administrador da conta.
        </p>
      </div>
    </div>
  )
}

// Inline read/write badge for UI hints
export function PermBadge({ moduleId }: { moduleId: ModuleId | string }) {
  const user = useAuthStore(s => s.user)
  const canWrite = hasModuleAccess(user, moduleId, 'write')
  const canRead = hasModuleAccess(user, moduleId, 'read')
  const level = canWrite ? 'Leitura e gravacao'
               : canRead ? 'Somente leitura'
               : 'Sem acesso'
  const color = canWrite ? 'bg-emerald-100 text-emerald-700'
               : canRead ? 'bg-blue-100 text-blue-700'
               : 'bg-red-100 text-red-700'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {level}
    </span>
  )
}
