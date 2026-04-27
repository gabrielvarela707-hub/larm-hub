'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'

export default function LarmLoginPage() {
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

      {/* ── Painel esquerdo: formulário ─────────────────────────── */}
      <div
        className="flex-1 lg:max-w-[480px] flex flex-col justify-center px-8 py-12 lg:px-14"
        style={{ background: '#0A0F1A' }}
      >
        {/* Logo */}
        <div className="mb-12">
          <div className="flex items-end gap-1">
            <span
              className="text-4xl font-bold tracking-tight"
              style={{
                color: '#FFFFFF',
                fontFamily: '"Georgia", serif',
                letterSpacing: '-0.02em',
              }}
            >
              LARM
            </span>
          </div>
          <div
            className="flex items-center gap-2 mt-1"
            style={{ color: '#1B5E3B' }}
          >
            <div className="h-[1px] w-4" style={{ background: '#1B5E3B' }} />
            <span className="text-[10px] tracking-[0.35em] uppercase">HUB</span>
            <div className="h-[1px] w-4" style={{ background: '#1B5E3B' }} />
          </div>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Gestão empresarial, financeira<br />e estratégica em uma só plataforma.
          </p>
        </div>

        {/* Form card */}
        <div
          className="rounded-2xl p-7"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <h2 className="text-white text-base font-semibold mb-5">
            Bem-vindo ao <span style={{ color: '#4A90B8' }}>LARM HUB</span>
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="16" rx="2"
                      stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
                    <path d="M2 8L12 13L22 8" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="E-mail"
                  autoComplete="email"
                  required
                  className="w-full pl-9 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(27,94,59,0.6)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(27,94,59,0.1)'
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
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="5" y="11" width="14" height="10" rx="2"
                      stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
                    <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11"
                      stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Senha"
                  autoComplete="current-password"
                  required
                  className="w-full pl-9 pr-10 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = 'rgba(27,94,59,0.6)'
                    e.target.style.boxShadow = '0 0 0 3px rgba(27,94,59,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  className="text-xs"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Esqueceu sua senha?
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
              className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: loading ? 'rgba(27,94,59,0.4)' : '#1B5E3B',
                color: loading ? 'rgba(255,255,255,0.4)' : '#fff',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(27,94,59,0.35)',
              }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                : 'ENTRAR'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-[1px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>ou</span>
              <div className="flex-1 h-[1px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* Ambiente corporativo */}
            <button
              type="button"
              className="w-full py-3 rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.4)',
              }}
              onMouseEnter={e => {
                const btn = e.currentTarget
                btn.style.borderColor = 'rgba(255,255,255,0.2)'
                btn.style.color = 'rgba(255,255,255,0.7)'
              }}
              onMouseLeave={e => {
                const btn = e.currentTarget
                btn.style.borderColor = 'rgba(255,255,255,0.08)'
                btn.style.color = 'rgba(255,255,255,0.4)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2"
                  stroke="currentColor" strokeWidth="1.5"/>
                <path d="M3 9H21M9 3V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Acessar ambiente corporativo
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 space-y-4">
          {/* Voltar */}
          <div className="text-center">
            <button
              onClick={() => router.push('/login')}
              className="text-xs transition-colors"
              style={{ color: 'rgba(255,255,255,0.2)' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.45)'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.2)'}
            >
              ← Voltar para seleção de hub
            </button>
          </div>

          {/* Footer segurança */}
          <div className="flex items-center justify-center gap-4">
            {[
              { icon: '🔒', label: 'Ambiente Seguro' },
              { icon: '🎧', label: 'Suporte' },
              { icon: '📄', label: 'Termos de Uso' },
            ].map(item => (
              <button
                key={item.label}
                className="flex items-center gap-1 text-[10px] transition-colors"
                style={{ color: 'rgba(255,255,255,0.18)' }}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Painel direito: visual ──────────────────────────────── */}
      <div
        className="hidden lg:flex flex-1 relative overflow-hidden flex-col justify-between p-12"
        style={{
          background: 'linear-gradient(160deg, #0D1B2A 0%, #1A2E45 50%, #0D1B2A 100%)',
        }}
      >
        {/* World map dots texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(107,155,210,0.8) 1px, transparent 0)`,
            backgroundSize: '22px 22px',
          }}
        />

        {/* Blue glow */}
        <div
          className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #4A90B8 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #1B5E3B 0%, transparent 70%)' }}
        />

        {/* Content */}
        <div className="relative z-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mb-8"
            style={{
              background: 'rgba(27,94,59,0.15)',
              border: '1px solid rgba(27,94,59,0.3)',
              color: '#4CAF80',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Plataforma Ativa
          </div>
        </div>

        <div className="relative z-10">
          <h2
            className="text-5xl font-light leading-tight mb-6"
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontFamily: '"Georgia", serif',
            }}
          >
            Conectando<br />
            <span style={{ color: '#4A90B8', fontStyle: 'italic' }}>gestão,</span><br />
            controle e<br />
            estratégia.
          </h2>

          <p className="text-sm leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Tudo que sua holding precisa para operar<br />
            com eficiência, segurança e visão executiva.
          </p>

          {/* Feature cards */}
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {[
              {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M3 3V21M3 17L9 11L13 15L18 9L21 12" stroke="#4CAF80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                title: 'Financeiro',
                desc: 'Visão completa do desempenho e dos resultados.',
              },
              {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#4A90B8" strokeWidth="1.5"/>
                    <path d="M9 12L11 14L15 10" stroke="#4A90B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ),
                title: 'Governança',
                desc: 'Estrutura sólida, controle e conformidade.',
              },
              {
                icon: (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="3" stroke="#B8860B" strokeWidth="1.5"/>
                    <path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22" stroke="#B8860B" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                ),
                title: 'Operações',
                desc: 'Processos integrados para mais eficiência e escala.',
              },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  {item.icon}
                </div>
                <div>
                  <p className="text-white text-xs font-medium">{item.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <p
              className="text-xs tracking-[0.2em] uppercase font-medium"
              style={{ color: 'rgba(255,255,255,0.25)' }}
            >
              LARM GROUP
            </p>
            <p
              className="text-[10px] mt-0.5 tracking-wider"
              style={{ color: 'rgba(255,255,255,0.15)' }}
            >
              SOLIDEZ HOJE, LEGADO AMANHÃ.
            </p>
          </div>
          <div
            className="flex items-center gap-1.5 text-[10px]"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                stroke="currentColor" strokeWidth="1.5"/>
              <path d="M12 8V12L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Ambiente seguro · Dados protegidos
          </div>
        </div>
      </div>
    </div>
  )
}
