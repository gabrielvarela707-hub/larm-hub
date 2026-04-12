'use client'

import { create } from 'zustand'

interface TenantConfig {
  googleMapsKey: string
  sesAccessKeyId: string
  sesSecretAccessKey: string
  sesRegion: string
  sesFromEmail: string
  sesFromName: string
  whatsappToken: string
  whatsappPhoneId: string
  whatsappBusinessId: string
  clicksignKey: string
  bankName: string
  bankApiKey: string
}

interface TenantConfigState {
  config: TenantConfig
  setConfig: (partial: Partial<TenantConfig>) => void
  getGoogleMapsKey: () => string
}

const DEFAULT: TenantConfig = {
  googleMapsKey:        '',
  sesAccessKeyId:       '',
  sesSecretAccessKey:   '',
  sesRegion:            'us-east-1',
  sesFromEmail:         '',
  sesFromName:          '',
  whatsappToken:        '',
  whatsappPhoneId:      '',
  whatsappBusinessId:   '',
  clicksignKey:         '',
  bankName:             '',
  bankApiKey:           '',
}

const STORAGE_KEY = 'tenant_config'

function loadFromStorage(): Partial<TenantConfig> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export const useTenantConfig = create<TenantConfigState>((set, get) => ({
  config: { ...DEFAULT, ...loadFromStorage() },

  setConfig: (partial) => {
    set(state => {
      const next = { ...state.config, ...partial }
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
      return { config: next }
    })
  },

  getGoogleMapsKey: () => {
    const fromStore = get().config.googleMapsKey
    if (fromStore) return fromStore
    return process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  },
}))
