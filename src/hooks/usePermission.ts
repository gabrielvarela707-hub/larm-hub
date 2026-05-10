/**
 * src/hooks/usePermission.ts
 * → lotemobile2/src/hooks/usePermission.ts  (arquivo novo)
 *
 * Uso:
 *   const { canRead, canWrite } = usePermission('crm')
 *
 *   // Bloqueia botão de criação:
 *   <button disabled={!canWrite}>Novo Lead</button>
 *
 *   // Esconde botão completamente:
 *   {canWrite && <button>Novo Lead</button>}
 */
'use client'

import { useAuthStore } from '@/lib/auth-store'

// Mapeamento de módulo → permissão esperada
// Expande conforme novos módulos forem adicionados
const MODULE_MAP: Record<string, string> = {
  crm:          'crm',
  leads:        'crm',
  funil:        'crm',
  simulador:    'simulador',
  contratos:    'contratos',
  financeiro:   'fin_receber',
  fin_receber:  'fin_receber',
  fin_pagar:    'fin_pagar',
  fin_boletos:  'fin_boletos',
  fin_split:    'fin_split',
  fin_sped:     'fin_sped',
  empreendimentos: 'empreendimentos',
  mapa:         'mapa',
  obras:        'obras',
  relatorios:   'relatorios',
  controladoria:'controladoria',
  ia:           'ia',
  configuracoes:'configuracoes',
  usuarios:     'usuarios',
  landing:      'landing',
}

export function usePermission(module: string) {
  const user = useAuthStore(s => s.user)

  // Super admin e admin sempre têm tudo
  if (!user || user.role === 'super_admin' || user.role === 'admin') {
    return { canRead: true, canWrite: true }
  }

  const modKey = MODULE_MAP[module] ?? module
  const modulePerms = (user as unknown as {
    permissions?: Record<string, { read: boolean; write: boolean }>
  }).permissions?.[modKey]

  return {
    canRead:  modulePerms?.read  ?? false,
    canWrite: modulePerms?.write ?? false,
  }
}

/**
 * Versão para verificar múltiplos módulos de uma vez.
 * Retorna true se TEM permissão em QUALQUER um dos módulos.
 */
export function useAnyPermission(modules: string[], type: 'read' | 'write' = 'write') {
  const user = useAuthStore(s => s.user)
  if (!user || user.role === 'super_admin' || user.role === 'admin') return true

  return modules.some(m => {
    const modKey = MODULE_MAP[m] ?? m
    const p = (user as unknown as {
      permissions?: Record<string, { read: boolean; write: boolean }>
    }).permissions?.[modKey]
    return p?.[type] ?? false
  })
}
