import { create } from 'zustand'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  tenantName: string
}

interface AuthState {
  user: AuthUser | null
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

// Mock users — replace with real API call
const MOCK_USERS = [
  {
    id: 'user_001',
    email: 'admin',
    password: 'admin',
    name: 'Fernando Monteiro',
    role: 'admin',
    tenantName: 'Residencial Santa Clara',
  },
  {
    id: 'user_002',
    email: 'carlos@santaclara.com.br',
    password: '123456',
    name: 'Carlos Henrique',
    role: 'broker',
    tenantName: 'Residencial Santa Clara',
  },
]

export const useAuthStore = create<AuthState>((set) => ({
  user: null,

  login: async (email, password) => {
    await new Promise(r => setTimeout(r, 700)) // simulate API
    const found = MOCK_USERS.find(
      u => u.email === email && u.password === password
    )
    if (found) {
      const user: AuthUser = {
        id: found.id,
        name: found.name,
        email: found.email,
        role: found.role,
        tenantName: found.tenantName,
      }
      set({ user })
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('auth_user', JSON.stringify(user))
      }
      return { ok: true }
    }
    return { ok: false, error: 'E-mail ou senha incorretos' }
  },

  logout: () => {
    set({ user: null })
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('auth_user')
    }
  },
}))

// Rehydrate from sessionStorage on first load
if (typeof window !== 'undefined') {
  const stored = sessionStorage.getItem('auth_user')
  if (stored) {
    try {
      useAuthStore.setState({ user: JSON.parse(stored) })
    } catch {}
  }
}
