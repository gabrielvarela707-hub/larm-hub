'use client'

import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { canRead, canWrite, MOCK_CURRENT_USER, type ModuleId } from '@/lib/permissions'

interface PermissionGateProps {
  moduleId: ModuleId
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
  const user = MOCK_CURRENT_USER // swap for useAuth() hook when real auth exists
  const allowed = require === 'write' ? canWrite(user, moduleId) : canRead(user, moduleId)

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
export function PermBadge({ moduleId }: { moduleId: ModuleId }) {
  const user = MOCK_CURRENT_USER
  const level = canWrite(user, moduleId) ? 'Leitura e gravacao'
               : canRead(user, moduleId)  ? 'Somente leitura'
               : 'Sem acesso'
  const color = canWrite(user, moduleId) ? 'bg-emerald-100 text-emerald-700'
               : canRead(user, moduleId)  ? 'bg-blue-100 text-blue-700'
               : 'bg-red-100 text-red-700'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
      {level}
    </span>
  )
}
