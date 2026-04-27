'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'

export default function SantaClaraLoginPage() {
  const router   = useRouter()
  const login    = useAuthStore(s => s.login)

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
      setError(result.error ?? 'E-mail ou senha incorretos')
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Painel esquerdo: visual ─────────────────────────────── */}
      <div
        className="hidden lg:flex flex-1 relative overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #1A2E0F 0%, #2D5016 40%, #3D6B1F 70%, #1A2E0F 100%)',
        }}
      >
        {/* Texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(184,134,11,0.8) 1px, transparent 0)`,
            backgroundSize: '28px 28px',
          }}
        />

        {/* Golden light bloom */}
        <div
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, #B8860B 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute top-1/3 left-1/4 w-[300px] h-[300px] rounded-full opacity-10"
          style={{
            background: 'radial-gradient(circle, #8BC34A 0%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(184,134,11,0.2)', border: '1px solid rgba(184,134,11,0.4)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M3 12L12 3L21 12V20C21 20.5523 20.5523 21 20 21H15V16H9V21H4C3.44772 21 3 20.5523 3 20V12Z"
                  stroke="#B8860B" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <span className="text-white font-semibold text-lg leading-none">Santa Clara</span>
              <span className="block text-[10px] tracking-[0.25em] uppercase mt-0.5"
                style={{ color: '#B8860B' }}>HUB</span>
            </div>
          </div>

          {/* Main copy */}
          <div>
            <h2
              className="text-5xl font-light leading-tight mb-6"
              style={{
                color: 'rgba(255,255,255,0.92)',
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
            >
              Conectando<br />
              <span style={{ color: '#B8860B', fontStyle: 'italic' }}>Loteadora,</span><br />
              Corretores<br />
              e Clientes.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Gestão, Vendas e Relacionamento<br />em uma só plataforma.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 mt-6">
              {[
                { icon: '🏡', label: 'Empreendimentos' },
                { icon: '📊', label: 'CRM & Funil' },
                { icon: '💰', label: 'Financeiro' },
              ].map(item => (
                <div
                  key={item.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="flex items-center gap-2 text-[11px]"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 8V12L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Ambiente Seguro · Dados Protegidos
          </div>
        </div>
      </div>

      {/* ── Painel direito: formulário ──────────────────────────── */}
      <div
        className="flex-1 lg:max-w-[440px] flex flex-col justify-center px-8 py-12 lg:px-12"
        style={{ background: '#0D1508' }}
      >
        {/* Mobile logo */}
        <div className="flex items-center gap-2 mb-10 lg:hidden">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(184,134,11,0.2)', border: '1px solid rgba(184,134,11,0.4)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 12L12 3L21 12V20C21 20.5523 20.5523 21 20 21H15V16H9V21H4C3.44772 21 3 20.5523 3 20V12Z"
                stroke="#B8860B" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-white font-semibold">Santa Clara HUB</span>
        </div>

        <div className="w-full max-w-sm mx-auto">
          <div className="mb-8">
            <p
              className="text-xs tracking-[0.2em] uppercase mb-2"
              style={{ color: '#B8860B' }}
            >
              Bem-vindo ao
            </p>
            <h1 className="text-white text-2xl font-semibold">Santa Clara HUB</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Acesse com suas credenciais
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs mb-1.5 tracking-wide"
                style={{ color: 'rgba(255,255,255,0.5)' }}>
                E-mail
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="16" rx="2"
                      stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                    <path d="M2 8L12 13L22 8" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  autoComplete="email"
                  required
                  className="w-full pl-9 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(184,134,11,0.5)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(184,134,11,0.08)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Senha
                </label>
                <button
                  type="button"
                  className="text-xs transition-colors"
                  style={{ color: '#B8860B' }}
                >
                  Esqueceu sua senha?
                </button>
              </div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="11" width="14" height="10" rx="2"
                      stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
                    <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11"
                      stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(184,134,11,0.5)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(184,134,11,0.08)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  {showPass
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Erro */}
            {error && (
              <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              style={{
                background: loading ? 'rgba(184,134,11,0.4)' : 'linear-gradient(135deg, #B8860B, #8B6914)',
                color: loading ? 'rgba(255,255,255,0.5)' : '#fff',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(184,134,11,0.3)',
              }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                : 'ENTRAR'}
            </button>
          </form>

          {/* Acessar como cliente */}
          <div className="mt-4">
            <button
              type="button"
              className="w-full py-3 rounded-xl text-sm transition-all duration-200"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.4)',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'
                ;(e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)'
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'
                ;(e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'
              }}
            >
              Acessar como Cliente
            </button>
          </div>

          {/* Voltar */}
          <div className="mt-6 text-center">
            <button
              onClick={() => router.push('/login')}
              className="text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.25)' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.25)'}
            >
              ← Voltar para seleção de hub
            </button>
          </div>
        </div>

        {/* Footer segurança */}
        <div className="flex items-center justify-center gap-4 mt-auto pt-8">
          {[
            { icon: '🔒', label: 'Ambiente Seguro' },
            { icon: '🎧', label: 'Suporte' },
            { icon: '📄', label: 'Termos' },
          ].map(item => (
            <button key={item.label}
              className="flex items-center gap-1 text-[10px] transition-colors"
              style={{ color: 'rgba(255,255,255,0.2)' }}>
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
