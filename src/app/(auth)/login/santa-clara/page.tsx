'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'

/* ─── Logo SVG Santa Clara ─────────────────────────────────────────────────── */
function SantaClaraLogo({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Quadrante superior esquerdo - verde escuro */}
      <path d="M4 4 L24 4 L24 24 L4 24 Z" fill="#2D5016" opacity="0.9"/>
      {/* Quadrante superior direito - verde médio */}
      <path d="M28 4 L48 4 L48 24 L28 24 Z" fill="#4A7A1E" opacity="0.9"/>
      {/* Quadrante inferior esquerdo - ouro */}
      <path d="M4 28 L24 28 L24 48 L4 48 Z" fill="#B8860B" opacity="0.9"/>
      {/* Quadrante inferior direito - verde claro */}
      <path d="M28 28 L48 28 L48 48 L28 48 Z" fill="#6AAF2A" opacity="0.9"/>
      {/* Losango central */}
      <path d="M28 10 L42 24 L28 38 L14 24 Z" fill="#D4A017"/>
      {/* Ponto central */}
      <circle cx="28" cy="24" r="4" fill="#0D1508"/>
    </svg>
  )
}

export default function SantaClaraLoginPage() {
  const router  = useRouter()
  const login   = useAuthStore(s => s.login)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await login(email.trim(), password, 'santa_clara')
    setLoading(false)
    if (result.ok) {
      const user = useAuthStore.getState().user
      if (user?.mustChangePassword) router.push('/trocar-senha')
      else router.push('/')
    }
    else setError(result.error ?? 'E-mail ou senha incorretos')
  }

  return (
    <div className="min-h-screen flex">

      {/* ════════════════════════════════════════════════════════════
          MOBILE: layout em coluna (tudo empilhado)
          DESKTOP: esquerda = form | direita = paisagem
      ════════════════════════════════════════════════════════════ */}

      {/* ── COLUNA ESQUERDA — formulário ─────────────────────────── */}
      <div
        className="relative flex flex-col w-full lg:w-[420px] lg:min-w-[420px] min-h-screen"
        style={{
          /* No mobile o fundo é a própria paisagem com overlay */
          background: 'linear-gradient(180deg, #1a2e0f 0%, #243d12 30%, #1a2e0f 100%)',
        }}
      >
        {/* Paisagem simulada como fundo no mobile (visível só em mobile) */}
        <div
          className="absolute inset-0 lg:hidden"
          style={{
            background: `
              linear-gradient(
                180deg,
                #1c3a5e 0%,
                #2a5a8c 15%,
                #d4891a 35%,
                #c67c0a 42%,
                #8aad3a 55%,
                #4a7a1e 70%,
                #2d5016 100%
              )
            `,
          }}
        />
        {/* Overlay escuro sobre a paisagem mobile */}
        <div className="absolute inset-0 lg:hidden" style={{ background: 'rgba(10,20,5,0.55)' }} />

        {/* Conteúdo do painel esquerdo */}
        <div className="relative z-10 flex flex-col items-center px-6 pt-10 pb-6 lg:bg-transparent lg:px-10 flex-1">

          {/* Logo + Nome */}
          <div className="flex flex-col items-center mb-2">
            <SantaClaraLogo size={64} />
            <div className="mt-3 text-center">
              <div
                className="text-3xl font-light italic"
                style={{ color: '#fff', fontFamily: 'Georgia, serif', letterSpacing: '0.02em' }}
              >
                Santa Clara
              </div>
              <div
                className="text-xs tracking-[0.35em] font-semibold mt-0.5"
                style={{ color: '#D4A017' }}
              >
                H U B
              </div>
              {/* Linha dourada */}
              <div className="flex items-center justify-center gap-1 mt-1">
                <div className="h-[1px] w-8" style={{ background: 'linear-gradient(90deg, transparent, #D4A017)' }} />
                <div className="w-1 h-1 rounded-full" style={{ background: '#D4A017' }} />
                <div className="h-[1px] w-8" style={{ background: 'linear-gradient(90deg, #D4A017, transparent)' }} />
              </div>
            </div>
          </div>

          <p className="text-center text-sm mt-2 mb-6 leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Gestão, Vendas e Relacionamento<br />em uma só plataforma.
          </p>

          {/* Card do formulário */}
          <div
            className="w-full max-w-[340px] rounded-2xl p-6"
            style={{
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <p className="text-center text-sm mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <span className="font-bold text-white">Bem-vindo</span>{' '}
              ao Santa Clara{' '}
              <span style={{ color: '#D4A017' }}>Hub</span>
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Email */}
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                  <rect x="2" y="4" width="20" height="16" rx="2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                  <path d="M2 8L12 13L22 8" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="E-mail"
                  required
                  autoComplete="email"
                  className="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
                />
              </div>

              {/* Senha */}
              <div>
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                    <rect x="5" y="11" width="14" height="10" rx="2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
                    <path d="M8 11V7C8 4.79 9.79 3 12 3s4 1.79 4 4v4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Senha"
                    required
                    autoComplete="current-password"
                    className="flex-1 bg-transparent text-sm text-white placeholder-white/40 outline-none"
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="text-white/40 hover:text-white/70">
                    {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button type="button" className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Esqueceu sua senha?
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-red-300 text-xs bg-red-900/30 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Botão ENTRAR */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold tracking-widest flex items-center justify-center gap-2 transition-all"
                style={{
                  background: loading
                    ? 'rgba(184,134,11,0.5)'
                    : 'linear-gradient(135deg, #D4A017 0%, #B8860B 50%, #9A7009 100%)',
                  color: '#fff',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(184,134,11,0.4)',
                  letterSpacing: '0.12em',
                }}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Entrando...</>
                  : 'ENTRAR'}
              </button>
            </form>

            {/* Acessar como cliente */}
            <button
              type="button"
              className="w-full mt-3 text-sm py-1 text-center transition-colors"
              style={{ color: 'rgba(255,255,255,0.6)' }}
              onMouseEnter={e => (e.target as HTMLElement).style.color = '#fff'}
              onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.6)'}
            >
              Acessar como Cliente
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Features (visível no mobile abaixo do form) */}
          <div className="lg:hidden w-full max-w-[340px] mt-6 mb-2">
            <p className="text-center font-semibold text-sm mb-3" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Conectando Loteadora,<br />Corretores e Clientes
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { icon: '🔄', title: 'Para Corretores',  desc: 'Ferramentas para agilizar suas vendas' },
                { icon: '🏢', title: 'Para Loteadora',   desc: 'Gestão completo do seu empreendimento' },
                { icon: '🏠', title: 'Para Clientes',    desc: 'Acompanhe seu investimento' },
              ].map(f => (
                <div key={f.title}
                  className="rounded-xl p-2.5"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="text-xl mb-1">{f.icon}</div>
                  <p className="text-[10px] font-semibold text-white leading-tight">{f.title}</p>
                  <p className="text-[9px] mt-0.5 leading-tight" style={{ color: 'rgba(255,255,255,0.45)' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-4 mt-4">
            {[
              { icon: '🛡️', label: 'Ambiente Seguro' },
              { icon: '🎧', label: 'Suporte' },
              { icon: '📋', label: 'Termos' },
            ].map(item => (
              <button key={item.label}
                className="flex items-center gap-1 text-[10px]"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>

          {/* Voltar */}
          <button
            onClick={() => router.push('/login')}
            className="mt-3 text-[11px] transition-colors"
            style={{ color: 'rgba(255,255,255,0.2)' }}
            onMouseEnter={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.5)'}
            onMouseLeave={e => (e.target as HTMLElement).style.color = 'rgba(255,255,255,0.2)'}
          >
            ← Voltar para seleção de hub
          </button>
        </div>
      </div>

      {/* ── COLUNA DIREITA — paisagem (só desktop) ────────────────── */}
      <div
        className="hidden lg:flex flex-1 flex-col relative overflow-hidden"
      >
        {/* Céu + pôr do sol simulado */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(
                180deg,
                #0d1f3c 0%,
                #1a3a6b 8%,
                #2a6090 14%,
                #4a8ab0 20%,
                #6baed0 26%,
                #c4842a 36%,
                #d4891a 40%,
                #e8a020 44%,
                #c67c0a 48%,
                #a8b040 54%,
                #8aad3a 60%,
                #6a9930 68%,
                #4a7a1e 78%,
                #2d5016 90%,
                #1a2e0f 100%
              )
            `,
          }}
        />

        {/* Nuvens simuladas */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute" style={{
            top: '8%', left: '5%', width: '280px', height: '60px',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}/>
          <div className="absolute" style={{
            top: '15%', right: '10%', width: '200px', height: '45px',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.1) 0%, transparent 70%)',
            filter: 'blur(6px)',
          }}/>
          <div className="absolute" style={{
            top: '5%', left: '40%', width: '350px', height: '80px',
            background: 'radial-gradient(ellipse, rgba(200,180,140,0.15) 0%, transparent 70%)',
            filter: 'blur(10px)',
          }}/>
        </div>

        {/* Sol */}
        <div className="absolute" style={{
          top: '34%', left: '50%', transform: 'translateX(-50%)',
          width: '80px', height: '80px',
          background: 'radial-gradient(circle, #FFD700 0%, #FFA500 40%, transparent 70%)',
          filter: 'blur(2px)',
          borderRadius: '50%',
        }}/>
        {/* Halo do sol */}
        <div className="absolute" style={{
          top: '28%', left: '50%', transform: 'translateX(-50%)',
          width: '240px', height: '240px',
          background: 'radial-gradient(circle, rgba(255,200,50,0.3) 0%, rgba(255,150,0,0.15) 40%, transparent 70%)',
          borderRadius: '50%',
        }}/>

        {/* Estrada / perspectiva */}
        <div className="absolute" style={{
          bottom: '0', left: '50%', transform: 'translateX(-50%)',
          width: '0',
          borderLeft: '120px solid transparent',
          borderRight: '120px solid transparent',
          borderBottom: '300px solid rgba(100,90,60,0.3)',
        }}/>

        {/* Lotes / casas simulados */}
        <div className="absolute bottom-0 left-0 right-0 h-48 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-sm"
              style={{
                width: `${30 + Math.random() * 40}px`,
                height: `${15 + Math.random() * 20}px`,
                bottom: `${20 + Math.random() * 80}px`,
                left: `${5 + i * 8}%`,
                background: `rgba(${160 + Math.random() * 40},${100 + Math.random() * 40},${60 + Math.random() * 30},0.7)`,
                transform: `rotate(${-2 + Math.random() * 4}deg)`,
              }}
            />
          ))}
          {/* Árvores */}
          {[...Array(18)].map((_, i) => (
            <div
              key={`t${i}`}
              className="absolute rounded-full"
              style={{
                width: `${12 + Math.random() * 16}px`,
                height: `${12 + Math.random() * 16}px`,
                bottom: `${5 + Math.random() * 60}px`,
                left: `${i * 5.5 + Math.random() * 4}%`,
                background: `rgba(${30 + Math.random() * 40},${80 + Math.random() * 60},${20 + Math.random() * 20},0.85)`,
              }}
            />
          ))}
        </div>

        {/* Overlay logo/texto no canto superior */}
        <div className="relative z-10 p-10">
          <div className="flex items-center gap-3">
            <SantaClaraLogo size={48} />
            <div>
              <div className="text-2xl font-light italic text-white"
                style={{ fontFamily: 'Georgia, serif' }}>
                Santa Clara
              </div>
              <div className="text-[10px] tracking-[0.3em] font-semibold"
                style={{ color: '#D4A017' }}>
                H U B
              </div>
            </div>
          </div>
          <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Gestão, Vendas e Relacionamento em uma só plataforma.
          </p>
        </div>

        {/* Painel inferior — features */}
        <div className="absolute bottom-0 left-0 right-0 z-10">
          {/* Faixa branca/clara com features */}
          <div
            className="px-10 py-6"
            style={{ background: 'rgba(245,240,225,0.95)', backdropFilter: 'blur(4px)' }}
          >
            <h3 className="font-bold text-center mb-1" style={{ color: '#1a2e0f', fontSize: '15px' }}>
              Conectando Loteadora, Corretores e Clientes
            </h3>
            <p className="text-center text-xs mb-4" style={{ color: '#4a7a1e' }}>
              · Tudo o que você precisa para vender com mais eficiência:
            </p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: '🔄', title: 'Para Corretores', desc: 'Ferramentas para agilizar suas vendas' },
                { icon: '🏢', title: 'Para Loteadora',  desc: 'Gestão completo do seu empreendimento' },
                { icon: '🏠', title: 'Para Clientes',   desc: 'Acompanhe e atualize seus investimentos' },
              ].map(f => (
                <div key={f.title} className="text-center">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <p className="text-xs font-bold" style={{ color: '#1a2e0f' }}>{f.title}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#6a9930' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA bar */}
          <div
            className="px-10 py-4 flex items-center justify-between"
            style={{ background: 'rgba(45,80,22,0.97)' }}
          >
            <p className="font-semibold text-white text-sm">Pronto para conquistar mais?</p>
            <button
              className="px-6 py-2 rounded-lg text-sm font-bold tracking-wide transition-all"
              style={{
                background: 'linear-gradient(135deg, #D4A017, #B8860B)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              FALE COM A GENTE
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
