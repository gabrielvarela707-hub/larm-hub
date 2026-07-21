'use client'

/**
 * src/lib/tenant-config-store.ts
 * → larmhub-web/src/lib/tenant-config-store.ts
 */

import { create } from 'zustand'
import { apiClient } from '@/lib/auth-store'

export interface TenantConfig {
  logoUrl: string
  logoText: string
  primaryColor: string
  sidebarColor: string
  googleMapsKey: string
  // AWS SES
  sesRegion: string
  sesAccessKeyId: string
  sesSecretAccessKey: string
  sesFromEmail: string
  sesFromName: string
  // AWS SNS
  snsRegion: string
  snsAccessKeyId: string
  snsSecretAccessKey: string
  snsSenderId: string
  snsSMSType: 'Transactional' | 'Promotional'
  snsMockMode: boolean
  // IA
  aiProvider: 'openai' | 'gemini'
  openaiApiKey: string
  geminiApiKey: string
  openaiModel: string
  geminiModel: string
  // WhatsApp
  whatsappToken: string
  whatsappPhoneId: string
  whatsappBusinessId: string
  // Outros
  clicksignKey: string
  bankName: string
  bankApiKey: string
  crmConfig: Record<string, Record<string, string>>
}

interface TenantConfigState {
  config: TenantConfig
  hydrated: boolean
  loading: boolean
  saving: boolean
  hydrate: () => Promise<void>
  setConfig: (partial: Partial<TenantConfig>) => void
  persistConfig: (payload?: Partial<TenantConfig>) => Promise<string | null>
  getGoogleMapsKey: () => string
}

const DEFAULT: TenantConfig = {
  logoUrl: '',
  logoText: 'LarmHub',
  primaryColor: '#2563EB',
  sidebarColor: '#0D1B2A',
  googleMapsKey: '',
  sesRegion: 'us-east-1',
  sesAccessKeyId: '',
  sesSecretAccessKey: '',
  sesFromEmail: '',
  sesFromName: '',
  snsRegion: 'sa-east-1',
  snsAccessKeyId: '',
  snsSecretAccessKey: '',
  snsSenderId: 'LOTEAMENTO',
  snsSMSType: 'Transactional',
  snsMockMode: true,
  aiProvider: 'openai',
  openaiApiKey: '',
  geminiApiKey: '',
  openaiModel: 'gpt-4.1-mini',
  geminiModel: 'gemini-flash-latest',
  whatsappToken: '',
  whatsappPhoneId: '',
  whatsappBusinessId: '',
  clicksignKey: '',
  bankName: '',
  bankApiKey: '',
  crmConfig: {},
}

const STORAGE_KEY = 'tenant_config'

function applyToStorage(cfg: TenantConfig) {
  if (typeof window !== 'undefined') sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg))
}

function readFromStorage(): Partial<TenantConfig> {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
    return raw ? (JSON.parse(raw) as Partial<TenantConfig>) : {}
  } catch { return {} }
}

export const useTenantConfig = create<TenantConfigState>((set, get) => ({
  config: { ...DEFAULT },
  hydrated: false,
  loading: false,
  saving: false,

  hydrate: async () => {
    if (get().hydrated) return
    const cached = readFromStorage()
    if (Object.keys(cached).length) set({ config: { ...DEFAULT, ...cached } })
    set({ loading: true })
    try {
      const { data } = await apiClient.get<{ ok: boolean; data: Partial<TenantConfig> }>('/tenant-config')
      if (data.ok && data.data) {
        const next = { ...DEFAULT, ...data.data }
        applyToStorage(next)
        set({ config: next, hydrated: true })
      } else {
        set({ hydrated: true })
      }
    } catch {
      set({ hydrated: true })
    } finally {
      set({ loading: false })
    }
  },

  setConfig: (partial) => {
    set((state) => {
      const next = { ...state.config, ...partial }
      applyToStorage(next)
      return { config: next }
    })
  },

  persistConfig: async (payload) => {
    set({ saving: true })
    try {
      const toSave = payload ?? get().config
      const { data } = await apiClient.put<{ ok: boolean; message?: string }>('/tenant-config', toSave)
      if (!data.ok) return data.message ?? 'Erro ao salvar'
      applyToStorage(get().config)
      return null
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      return axiosErr?.response?.data?.message ?? 'Erro ao conectar com o servidor'
    } finally {
      set({ saving: false })
    }
  },

  getGoogleMapsKey: () => {
    const fromStore = get().config.googleMapsKey
    return fromStore || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || ''
  },
}))
