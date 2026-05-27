'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth-store'

export default function LarmLoginPage() {
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
    const result = await login(email.trim(), password, 'larm')
    setLoading(false)
    if (result.ok) {
      const user = useAuthStore.getState().user
      if (user?.mustChangePassword) router.push('/trocar-senha')
      else router.push('/')
    }
    else setError(result.error ?? 'E-mail ou senha incorretos')
  }

  /* ── Input style helpers ─────────────────────────────────────── */
  const inputBase: React.CSSProperties = {
    width: '100%',
    background: '#fff',
    border: '1px solid #d1d5db',
    borderRadius: '10px',
    padding: '10px 12px 10px 36px',
    fontSize: '14px',
    color: '#1a2e45',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  }

  return (
    /* Fundo geral claro — cinza muito suave */
    <div
      className="min-h-screen flex"
      style={{ background: '#f0f2f5' }}
    >

      {/* ════════════════════════════════════════════════════════════
          COLUNA ESQUERDA — Formulário (luz, branca)
      ════════════════════════════════════════════════════════════ */}
      <div
        className="relative flex flex-col w-full lg:w-[460px] lg:min-w-[460px] min-h-screen"
        style={{ background: '#f0f2f5' }}
      >
        {/* Textura pontilhada sutil (mapamundi) */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #1a2e45 1px, transparent 0)`,
            backgroundSize: '20px 20px',
          }}
        />

        {/* Prédio desfocado no fundo (visível no mobile) */}
        <div
          className="absolute inset-0 lg:hidden overflow-hidden"
          style={{ opacity: 0.07 }}
        >
          {/* Prédio de vidro simulado */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                right: `${5 + i * 9}%`,
                bottom: 0,
                width: '6%',
                height: `${40 + i * 5}%`,
                background: 'linear-gradient(180deg, #4a90b8 0%, #1a2e45 100%)',
                borderRadius: '2px 2px 0 0',
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col flex-1 px-8 py-10 lg:px-12">

          {/* Logo LARM */}
          <div className="mb-10">
            <div
              className="text-5xl font-bold tracking-tight leading-none"
              style={{ color: '#0D2137', fontFamily: 'Georgia, "Times New Roman", serif' }}
            >
              LARM
            </div>
            {/* Linha decorativa */}
            <div className="flex items-center gap-1.5 mt-1 mb-1">
              <div className="h-[1px] w-3" style={{ background: '#0D2137' }} />
              <div className="w-1 h-1 rounded-full" style={{ background: '#0D2137' }} />
              <div className="h-[1px] w-3" style={{ background: '#0D2137' }} />
            </div>
            <div
              className="text-sm tracking-[0.35em] font-medium"
              style={{ color: '#0D2137' }}
            >
              H U B
            </div>
            <p className="text-sm mt-3 leading-relaxed" style={{ color: '#64748b' }}>
              Gestão empresarial, financeira<br />e estratégica em uma só plataforma.
            </p>
          </div>

          {/* Card branco com formulário */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: '#ffffff',
              boxShadow: '0 2px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.06)',
            }}
          >
            <h2
              className="text-sm font-semibold mb-4"
              style={{ color: '#0D2137' }}
            >
              Bem-vindo ao{' '}
              <span style={{ color: '#1B5E3B' }}>LarmHub</span>
            </h2>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* E-mail */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="16" rx="2" stroke="#9ca3af" strokeWidth="1.5"/>
                    <path d="M2 8L12 13L22 8" stroke="#9ca3af" strokeWidth="1.5"/>
                  </svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="E-mail"
                  required
                  autoComplete="email"
                  style={inputBase}
                  onFocus={e => {
                    e.target.style.borderColor = '#1B5E3B'
                    e.target.style.boxShadow = '0 0 0 3px rgba(27,94,59,0.1)'
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = '#d1d5db'
                    e.target.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Senha */}
              <div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#9ca3af" strokeWidth="1.5"/>
                      <path d="M8 11V7C8 4.79 9.79 3 12 3s4 1.79 4 4v4" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Senha"
                    required
                    autoComplete="current-password"
                    style={{ ...inputBase, paddingRight: '36px' }}
                    onFocus={e => {
                      e.target.style.borderColor = '#1B5E3B'
                      e.target.style.boxShadow = '0 0 0 3px rgba(27,94,59,0.1)'
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = '#d1d5db'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: '#9ca3af' }}
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1">
                  <button type="button" className="text-xs" style={{ color: '#6b7280' }}>
                    Esqueceu sua senha?
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Botão ENTRAR */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-bold tracking-widest flex items-center justify-center gap-2 transition-all"
                style={{
                  background: loading ? '#4a9a6e' : '#1B5E3B',
                  color: '#fff',
                  boxShadow: loading ? 'none' : '0 4px 16px rgba(27,94,59,0.3)',
                  letterSpacing: '0.1em',
                }}
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Entrando...</>
                  : 'ENTRAR'}
              </button>

              {/* Divisor */}
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-[1px] bg-gray-200" />
                <span className="text-xs text-gray-400">ou</span>
                <div className="flex-1 h-[1px] bg-gray-200" />
              </div>

              {/* Ambiente corporativo */}
              <button
                type="button"
                className="w-full py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                style={{
                  background: '#fff',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#9ca3af'
                  e.currentTarget.style.background = '#f9fafb'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#d1d5db'
                  e.currentTarget.style.background = '#fff'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="#6b7280" strokeWidth="1.5"/>
                  <path d="M3 9H21M9 3V21" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Acessar ambiente corporativo
              </button>
            </form>
          </div>

          {/* Features (mobile) */}
          <div className="lg:hidden mt-6">
            <p className="text-xs font-semibold text-center mb-3" style={{ color: '#374151' }}>
              Plataforma completa para sua gestão
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { icon: '📈', title: 'Financeiro',   desc: 'Controle e performance' },
                { icon: '🛡️', title: 'Governança',   desc: 'Estrutura e compliance' },
                { icon: '⚙️', title: 'Operações',    desc: 'Processos e resultados' },
              ].map(f => (
                <div key={f.title}
                  className="rounded-xl p-2.5"
                  style={{ background: '#fff', border: '1px solid #e5e7eb' }}
                >
                  <div className="text-lg mb-1">{f.icon}</div>
                  <p className="text-[10px] font-semibold" style={{ color: '#1a2e45' }}>{f.title}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: '#9ca3af' }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-auto pt-6 space-y-3">
            <div className="flex items-center justify-center gap-5">
              {[
                { icon: '🛡️', label: 'Ambiente Seguro' },
                { icon: '🎧', label: 'Suporte' },
                { icon: '📄', label: 'Termos de Uso' },
              ].map(item => (
                <button key={item.label}
                  className="flex items-center gap-1 text-[11px] transition-colors hover:text-gray-600"
                  style={{ color: '#9ca3af' }}
                >
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            <div className="text-center">
              <button
                onClick={() => router.push('/login')}
                className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Voltar para seleção de hub
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          COLUNA DIREITA — Visual prédio + features (só desktop)
      ════════════════════════════════════════════════════════════ */}
      <div
        className="hidden lg:flex flex-1 flex-col relative overflow-hidden"
      >
        {/* Fundo: céu + prédio de vidro simulado */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(160deg, #c8d8e8 0%, #a8c0d8 20%, #88a8c4 40%, #d8e4ee 60%, #e8eef4 80%, #f0f4f8 100%)',
          }}
        />

        {/* Prédio de vidro simulado — grades verticais */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Corpo principal do prédio */}
          <div
            className="absolute"
            style={{
              right: '-5%',
              top: '-5%',
              width: '55%',
              height: '95%',
              background: 'linear-gradient(170deg, rgba(180,210,235,0.7) 0%, rgba(140,180,215,0.6) 30%, rgba(100,150,195,0.5) 60%, rgba(80,130,175,0.4) 100%)',
              borderRadius: '4px 4px 0 0',
              borderLeft: '1px solid rgba(255,255,255,0.4)',
            }}
          />
          {/* Grades de vidro horizontais */}
          {[...Array(20)].map((_, i) => (
            <div
              key={`h${i}`}
              className="absolute"
              style={{
                right: '-5%',
                top: `${-5 + i * 5}%`,
                width: '55%',
                height: '1px',
                background: 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
          {/* Grades de vidro verticais */}
          {[...Array(8)].map((_, i) => (
            <div
              key={`v${i}`}
              className="absolute"
              style={{
                right: `${-5 + i * 7}%`,
                top: '-5%',
                width: '1px',
                height: '95%',
                background: 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
          {/* Reflexo diagonal */}
          <div
            className="absolute"
            style={{
              right: '-5%',
              top: '-5%',
              width: '55%',
              height: '95%',
              background: 'linear-gradient(115deg, rgba(255,255,255,0.15) 0%, transparent 40%, rgba(255,255,255,0.08) 70%, transparent 100%)',
            }}
          />
        </div>

        {/* Estrada na base */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, rgba(80,90,100,0.3) 100%)',
          }}
        />

        {/* Conteúdo sobreposto */}
        <div className="relative z-10 flex flex-col h-full p-12">

          {/* Texto principal */}
          <div className="flex-1 flex items-center">
            <div>
              <h2
                className="text-5xl font-bold leading-tight mb-4"
                style={{ color: '#0D2137', fontFamily: 'Georgia, serif' }}
              >
                Conectando gestão,<br />
                <span style={{ color: '#1B5E3B' }}>controle</span> e<br />
                estratégia
              </h2>
              {/* Linha decorativa */}
              <div className="w-12 h-0.5 mb-4" style={{ background: '#1B5E3B' }} />
              <p className="text-base leading-relaxed" style={{ color: '#374151', maxWidth: '380px' }}>
                Tudo o que sua holding precisa para operar com<br />
                eficiência, segurança e visão executiva.
              </p>

              {/* Cards de features */}
              <div
                className="mt-8 rounded-2xl p-5 grid grid-cols-3 gap-4"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                  border: '1px solid rgba(255,255,255,0.9)',
                  maxWidth: '480px',
                }}
              >
                {[
                  {
                    svg: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M3 3V21M3 17L9 11L13 15L18 9L21 12" stroke="#1B5E3B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ),
                    title: 'Financeiro',
                    desc: 'Visão completa do desempenho e dos resultados.',
                  },
                  {
                    svg: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#1B5E3B" strokeWidth="1.5"/>
                        <path d="M9 12L11 14L15 10" stroke="#1B5E3B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ),
                    title: 'Governança',
                    desc: 'Estrutura sólida, controle e conformidade.',
                  },
                  {
                    svg: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="3" stroke="#1B5E3B" strokeWidth="1.5"/>
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="#1B5E3B" strokeWidth="1.5"/>
                      </svg>
                    ),
                    title: 'Operações',
                    desc: 'Processos integrados para mais eficiência e escala.',
                  },
                ].map(f => (
                  <div key={f.title} className="text-center">
                    <div className="flex justify-center mb-2">{f.svg}</div>
                    <p className="text-sm font-bold" style={{ color: '#0D2137' }}>{f.title}</p>
                    <p className="text-[11px] mt-1 leading-tight" style={{ color: '#6b7280' }}>{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="mt-5 flex items-center gap-4">
                <p className="text-sm" style={{ color: '#374151' }}>
                  Pronto para elevar a gestão da sua holding?
                </p>
                <button
                  className="px-5 py-2.5 rounded-xl text-sm font-bold tracking-wide text-white transition-all"
                  style={{
                    background: '#1B5E3B',
                    boxShadow: '0 4px 16px rgba(27,94,59,0.3)',
                  }}
                >
                  FALE COM A GENTE
                </button>
              </div>
            </div>
          </div>

          {/* Rodapé com branding */}
          <div
            className="flex items-center justify-between py-3 px-4 rounded-xl"
            style={{ background: 'rgba(13,33,55,0.06)', border: '1px solid rgba(13,33,55,0.08)' }}
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="#64748b" strokeWidth="1.5"/>
                <path d="M9 12L11 14L15 10" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-xs" style={{ color: '#64748b' }}>
                Ambiente seguro, tecnologia de ponta e dados protegidos.
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold tracking-wider" style={{ color: '#0D2137' }}>LARM GROUP</p>
              <p className="text-[10px] tracking-wider" style={{ color: '#94a3b8' }}>SOLIDEZ HOJE, LEGADO AMANHÃ.</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
