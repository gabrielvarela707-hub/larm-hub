'use client'

import { create } from 'zustand'

export interface TenantConfig {
  // Brand / white-label
  logoUrl: string        // base64 data URL ou path
  logoText: string       // fallback text
  primaryColor: string
  sidebarColor: string
  // Google Maps
  googleMapsKey: string
  // AWS SES
  sesRegion: string
  sesAccessKeyId: string
  sesSecretAccessKey: string
  sesFromEmail: string
  sesFromName: string
  // WhatsApp
  whatsappToken: string
  whatsappPhoneId: string
  whatsappBusinessId: string
  // Outros
  clicksignKey: string
  bankName: string
  bankApiKey: string
}

interface TenantConfigState {
  config: TenantConfig
  hydrated: boolean
  hydrate: () => void
  setConfig: (partial: Partial<TenantConfig>) => void
  getGoogleMapsKey: () => string
}

const DEFAULT: TenantConfig = {
  logoUrl: '',
  logoText: 'LoteMobile',
  primaryColor: '#2563EB',
  sidebarColor: '#0D1B2A',
  googleMapsKey: '',
  sesRegion: 'us-east-1',
  sesAccessKeyId: '',
  sesSecretAccessKey: '',
  sesFromEmail: '',
  sesFromName: '',
  whatsappToken: '',
  whatsappPhoneId: '',
  whatsappBusinessId: '',
  clicksignKey: '',
  bankName: '',
  bankApiKey: '',
}

const STORAGE_KEY = 'tenant_config'

export const useTenantConfig = create<TenantConfigState>((set, get) => ({
  config: { ...DEFAULT },
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
      const stored = raw ? (JSON.parse(raw) as Partial<TenantConfig>) : {}
      set({ config: { ...DEFAULT, ...stored }, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },

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
