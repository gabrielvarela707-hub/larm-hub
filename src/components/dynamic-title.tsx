'use client'

/**
 * src/components/dynamic-title.tsx
 * → larmhub-web/src/components/dynamic-title.tsx  (arquivo novo)
 *
 * Atualiza o <title> da aba com o nome da plataforma configurado pelo tenant.
 * Roda no cliente após hidratação — compatível com Next.js App Router.
 */

import { useEffect } from 'react'
import { useTenantConfig } from '@/lib/tenant-config-store'

export default function DynamicTitle() {
  const logoText = useTenantConfig(s => s.config.logoText)
  const hydrated = useTenantConfig(s => s.hydrated)

  useEffect(() => {
    if (!hydrated || !logoText || logoText === 'LarmHub') return
    // Atualiza o título padrão — preserva páginas que já têm título próprio
    if (document.title === 'HUB — Plataforma Integrada' || document.title.endsWith('| HUB')) {
      document.title = document.title.replace('HUB', logoText)
    }
  }, [hydrated, logoText])

  return null
}
