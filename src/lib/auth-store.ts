/**
 * src/lib/auth-store.ts
 * Auth store com integração real à API backend
 * Substitui completamente o mock anterior
 */

'use client'

import { create } from 'zustand'
import axios from 'axios'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:         string
  name:       string
  email:      string
  role:       string
  avatarUrl:  string | null
  tenantId:   string
  tenantName: string
  tenantSlug: string
  hubType:    'santa_clara' | 'larm' | 'generic'
}

interface AuthState {
  user:        AuthUser | null
  accessToken: string | null
  loading:     boolean
  login:   (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout:  () => Promise<void>
  refresh: () => Promise<boolean>
  hydrate: () => void
}

// ─── Axios instance ───────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: API,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Injeta o Bearer token em todas as requisições
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Em 401: tenta refresh e repete a requisição original uma vez
let isRefreshing = false
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !isRefreshing) {
      original._retry = true
      isRefreshing    = true
      const ok = await useAuthStore.getState().refresh()
      isRefreshing = false
      if (ok) return apiClient(original)
      await useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  }
)

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user:        null,
  accessToken: null,
  loading:     false,

  // ── Login ────────────────────────────────────────────────────────────────
  login: async (email, password) => {
    set({ loading: true })
    try {
      const { data } = await apiClient.post('/auth/login', { email, password })

      if (!data.ok) {
        return { ok: false, error: data.message }
      }

      const { accessToken, refreshToken, user } = data.data

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('refresh_token', refreshToken)
        sessionStorage.setItem('auth_user',     JSON.stringify(user))
      }

      set({ user, accessToken })
      return { ok: true }

    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.message ?? 'Erro ao conectar com o servidor')
        : 'Erro inesperado'
      return { ok: false, error: msg }

    } finally {
      set({ loading: false })
    }
  },

  // ── Logout ───────────────────────────────────────────────────────────────
  logout: async () => {
    const refreshToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('refresh_token')
      : null

    try {
      await apiClient.post('/auth/logout', { refreshToken })
    } catch {
      // silencia erro de rede no logout
    }

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('refresh_token')
      sessionStorage.removeItem('auth_user')
    }

    set({ user: null, accessToken: null })
  },

  // ── Refresh token ────────────────────────────────────────────────────────
  refresh: async () => {
    const refreshToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('refresh_token')
      : null

    if (!refreshToken) return false

    try {
      const { data } = await axios.post(`${API}/auth/refresh`, { refreshToken })
      if (data.ok) {
        set({ accessToken: data.data.accessToken })
        return true
      }
    } catch {
      // token expirado ou inválido
    }

    return false
  },

  // ── Hydrate (reidrata do sessionStorage no boot) ─────────────────────────
  hydrate: () => {
    if (typeof window === 'undefined') return
    try {
      const stored = sessionStorage.getItem('auth_user')
      if (stored) {
        const user = JSON.parse(stored) as AuthUser
        set({ user })
        // Obtém um accessToken válido imediatamente via refresh
        get().refresh()
      }
    } catch {
      // sessionStorage corrompido — ignora
    }
  },
}))

// Reidrata automaticamente no carregamento do client
if (typeof window !== 'undefined') {
  useAuthStore.getState().hydrate()
}
