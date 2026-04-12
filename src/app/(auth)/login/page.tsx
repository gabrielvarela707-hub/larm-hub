'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/auth-store'

export default function LoginPage() {
  const router = useRouter()
  const login  = useAuthStore(s => s.login)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email.trim(), password)
    setLoading(false)
    if (result.ok) {
      router.push('/')
    } else {
      setError(result.error ?? 'Erro ao entrar')
    }
  }

  return (
    <div className="w-full max-w-sm animate-fade-in">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 mb-8">
        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
          <MapPin className="w-5 h-5 text-white" />
        </div>
        <span className="text-white text-xl font-semibold tracking-tight">LoteMobile</span>
      </div>

      {/* Card */}
      <div className="bg-white/[0.05] backdrop-blur border border-white/10 rounded-2xl p-8">
        <div className="mb-6">
          <h1 className="text-white text-xl font-semibold mb-1">Entrar na plataforma</h1>
          <p className="text-slate-400 text-sm">Acesse seu painel de gestao</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Usuario</label>
            <input
              type="text"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin ou e-mail"
              autoComplete="username"
              required
              className={cn(
                'w-full bg-white/[0.06] border border-white/10 rounded-lg px-3.5 py-2.5',
                'text-white text-sm placeholder:text-slate-500',
                'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors'
              )}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1.5">Senha</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className={cn(
                  'w-full bg-white/[0.06] border border-white/10 rounded-lg px-3.5 py-2.5 pr-10',
                  'text-white text-sm placeholder:text-slate-500',
                  'focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors'
                )}
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end mt-1.5">
              <a href="#" className="text-xs text-blue-400 hover:text-blue-300">Esqueci minha senha</a>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className={cn(
              'w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium',
              'rounded-lg py-2.5 flex items-center justify-center gap-2 mt-2',
              'transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
            )}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : 'Entrar'}
          </button>
        </form>

        {/* Dev hint */}
        <div className="mt-5 pt-4 border-t border-white/10">
          <p className="text-xs text-slate-500 text-center">
            Acesso de demonstracao: <span className="text-slate-400 font-mono">admin</span> / <span className="text-slate-400 font-mono">admin</span>
          </p>
        </div>
      </div>

      <p className="text-center text-slate-600 text-xs mt-6">
        LoteMobile · Tecnologia para Loteamentos
      </p>
    </div>
  )
}
