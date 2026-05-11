/**
 * src/lib/auth-store.ts
 * Auth store com integração real à API backend.
 * Grava cookie "hub_session" para o middleware poder verificar a sessão.
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
  mustChangePassword: boolean
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

// ─── Cookie helpers ───────────────────────────────────────────────────────────

function setCookie(name: string, value: string, days = 1) {
  if (typeof document === 'undefined') return
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
}

// ─── Axios instance ───────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: API,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Injeta Bearer token em todas as requisições
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Em 401: tenta refresh UMA vez e, se falhar, redireciona para login
let isRefreshing = false
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve(token))
  failedQueue = []
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config

    // Não tenta refresh em rotas de auth ou se já tentou
    const isAuthRoute = original?.url?.includes('/auth/')
    if (error.response?.status !== 401 || isAuthRoute || original._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Enfileira as requisições enquanto está fazendo refresh
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then(token => {
        original.headers['Authorization'] = `Bearer ${token}`
        return apiClient(original)
      }).catch(err => Promise.reject(err))
    }

    original._retry = true
    isRefreshing = true

    try {
      const ok = await useAuthStore.getState().refresh()
      if (ok) {
        const newToken = useAuthStore.getState().accessToken
        processQueue(null, newToken)
        original.headers['Authorization'] = `Bearer ${newToken}`
        return apiClient(original)
      }
    } catch { }

    // Refresh falhou — desloga e redireciona
    processQueue(error, null)
    await useAuthStore.getState().logout()
    return Promise.reject(error)
  }
)

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set, get) => ({
  user:        null,
  accessToken: null,
  loading:     false,

  login: async (email, password) => {
    set({ loading: true })
    try {
      const { data } = await apiClient.post('/auth/login', { email, password })
      if (!data.ok) return { ok: false, error: data.message }

      const { accessToken, refreshToken, user } = data.data

      // Persiste no sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('refresh_token', refreshToken)
        sessionStorage.setItem('auth_user', JSON.stringify(user))
      }

      // ✅ Cookie para o middleware Edge (sem acesso ao sessionStorage)
      // Expiração = 1 dia (alinhado com o refreshToken de 30d mas sessão curta)
      setCookie('hub_session', '1', 1)

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

  logout: async () => {
    const refreshToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('refresh_token')
      : null

    try {
      await apiClient.post('/auth/logout', { refreshToken })
    } catch {}

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('refresh_token')
      sessionStorage.removeItem('auth_user')
    }

    // Remove o cookie de sessão
    deleteCookie('hub_session')

    set({ user: null, accessToken: null })

    // Redireciona para login — força reload para limpar estado React completamente
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  },

  refresh: async () => {
    const refreshToken = typeof window !== 'undefined'
      ? sessionStorage.getItem('refresh_token')
      : null
    if (!refreshToken) return false

    try {
      const { data } = await axios.post(`${API}/auth/refresh`, { refreshToken })
      if (data.ok) {
        set({ accessToken: data.data.accessToken })
        // Renova o cookie também
        setCookie('hub_session', '1', 1)
        return true
      }
    } catch {}

    return false
  },

  hydrate: () => {
    if (typeof window === 'undefined') return
    try {
      const stored = sessionStorage.getItem('auth_user')
      if (stored) {
        const user = JSON.parse(stored) as AuthUser
        set({ user })
        get().refresh()
      }
    } catch {}
  },
}))

// Reidrata no carregamento client
if (typeof window !== 'undefined') {
  useAuthStore.getState().hydrate()
}
