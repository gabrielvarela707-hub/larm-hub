/**
 * src/hooks/usePermission.ts
 * Verifica permissões reais do usuário logado.
 */
'use client'

import { useAuthStore } from '@/lib/auth-store'
import { hasModuleAccess, normalizeModuleIds } from '@/lib/module-access'

const MODULE_MAP: Record<string, string[]> = {
  crm: ['crm'],
  leads: ['crm'],
  funil: ['crm'],
  simulador: ['simulador'],
  contratos: ['contratos'],
  financeiro: ['fin_receber', 'fin_pagar', 'fin_boletos', 'fin_split', 'fin_sped'],
  fin_cashflow: ['fin_cashflow'],
  fin_movimento: ['fin_movimento'],
  fin_receber: ['fin_receber'],
  fin_pagar: ['fin_pagar'],
  fin_fornecedores: ['fin_fornecedores'],
  fin_bancos: ['fin_bancos'],
  fin_boletos: ['fin_boletos'],
  fin_split: ['fin_split'],
  fin_sped: ['fin_sped'],
  empreendimentos: ['empreendimentos'],
  mapa: ['mapa'],
  obras: ['obras'],
  cadastros_tipo_documento: ['cadastros_tipo_documento'],
  cadastros_plano_contas: ['cadastros_plano_contas'],
  cadastros_indices_economicos: ['cadastros_indices_economicos'],
  relatorios: ['relatorios'],
  relatorios_mapa_vendas: ['relatorios'],
  relatorios_projetos_obras: ['relatorios'],
  relatorios_unidades_estoque: ['relatorios'],
  relatorios_implantacao: ['relatorios'],
  controladoria: ['controladoria'],
  ia: ['ia'],
  configuracoes: ['configuracoes'],
  usuarios: ['usuarios'],
  landing: ['landing_pages'],
  landing_pages: ['landing_pages'],
  automacoes: ['automacoes'],
}

function resolveModules(module: string) {
  return normalizeModuleIds(MODULE_MAP[module] ?? [module])
}

export function usePermission(module: string) {
  const user = useAuthStore(s => s.user)
  const moduleIds = resolveModules(module)

  return {
    canRead: hasModuleAccess(user, moduleIds, 'read'),
    canWrite: hasModuleAccess(user, moduleIds, 'write'),
  }
}

/**
 * Retorna true se TEM permissão em QUALQUER um dos módulos.
 */
export function useAnyPermission(modules: string[], type: 'read' | 'write' = 'write') {
  const user = useAuthStore(s => s.user)

  return modules.some(m => hasModuleAccess(user, resolveModules(m), type))
}
