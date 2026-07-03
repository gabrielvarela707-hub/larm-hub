'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function HubSelectorPage() {
  const router = useRouter()
  const [hovering, setHovering] = useState<'santa-clara' | 'larm' | null>(null)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0E14] relative overflow-hidden p-4">

      {/* Background subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Header */}
      <div className="relative z-10 text-center mb-10">
        <p className="text-[11px] tracking-[0.3em] text-slate-500 uppercase mb-3">
          Grupo LARM · Plataforma Integrada
        </p>
        <h1 className="text-white text-3xl font-light tracking-tight">
          Escolha seu <span className="font-semibold">ambiente</span>
        </h1>
        <p className="text-slate-500 text-sm mt-2">
          Selecione o hub para fazer login
        </p>
      </div>

      {/* Cards */}
      <div className="relative z-10 flex flex-col sm:flex-row gap-4 w-full max-w-2xl">

        {/* Santa Clara HUB */}
        <button
          onClick={() => router.push('/login/santa-clara')}
          onMouseEnter={() => setHovering('santa-clara')}
          onMouseLeave={() => setHovering(null)}
          className="group flex-1 relative rounded-2xl overflow-hidden border transition-all duration-500 text-left"
          style={{
            borderColor: hovering === 'santa-clara' ? 'rgba(184,134,11,0.5)' : 'rgba(255,255,255,0.07)',
            background: hovering === 'santa-clara'
              ? 'linear-gradient(145deg, rgba(45,80,22,0.95), rgba(26,46,15,0.98))'
              : 'rgba(255,255,255,0.03)',
            boxShadow: hovering === 'santa-clara'
              ? '0 0 40px rgba(184,134,11,0.15), inset 0 1px 0 rgba(184,134,11,0.2)'
              : 'none',
            transform: hovering === 'santa-clara' ? 'translateY(-3px)' : 'translateY(0)',
          }}
        >
          {/* Decorative top line */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px] transition-all duration-500"
            style={{
              background: hovering === 'santa-clara'
                ? 'linear-gradient(90deg, transparent, #B8860B, transparent)'
                : 'transparent',
            }}
          />

          <div className="p-7">
            {/* Icon */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300"
              style={{
                background: hovering === 'santa-clara'
                  ? 'rgba(184,134,11,0.2)'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${hovering === 'santa-clara' ? 'rgba(184,134,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {/* Casa / Loteamento icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M3 12L12 3L21 12V20C21 20.5523 20.5523 21 20 21H15V16H9V21H4C3.44772 21 3 20.5523 3 20V12Z"
                  stroke={hovering === 'santa-clara' ? '#B8860B' : '#64748b'}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <rect
                  x="9" y="16" width="6" height="5"
                  stroke={hovering === 'santa-clara' ? '#B8860B' : '#64748b'}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Logotipo text */}
            <div className="mb-1">
              <span
                className="text-xs tracking-[0.25em] uppercase font-medium transition-colors duration-300"
                style={{ color: hovering === 'santa-clara' ? '#B8860B' : '#475569' }}
              >
                Santa Clara
              </span>
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">HUB</h2>
            <p className="text-sm leading-relaxed mb-6"
              style={{ color: hovering === 'santa-clara' ? 'rgba(255,255,255,0.6)' : '#475569' }}>
              Loteadora · Corretores · Clientes
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {['Empreendimentos', 'CRM', 'Financeiro'].map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-full transition-all duration-300"
                  style={{
                    background: hovering === 'santa-clara' ? 'rgba(184,134,11,0.15)' : 'rgba(255,255,255,0.04)',
                    color: hovering === 'santa-clara' ? '#B8860B' : '#475569',
                    border: `1px solid ${hovering === 'santa-clara' ? 'rgba(184,134,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* CTA */}
            <div
              className="mt-6 flex items-center gap-2 text-sm font-medium transition-all duration-300"
              style={{ color: hovering === 'santa-clara' ? '#B8860B' : '#334155' }}
            >
              Acessar
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                style={{
                  transform: hovering === 'santa-clara' ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'transform 0.3s',
                }}
              >
                <path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </button>

        {/* Divider */}
        <div className="hidden sm:flex flex-col items-center justify-center gap-2 py-4">
          <div className="w-[1px] flex-1 bg-white/[0.06]" />
          <span className="text-[10px] text-slate-600 tracking-widest uppercase">ou</span>
          <div className="w-[1px] flex-1 bg-white/[0.06]" />
        </div>

        {/* LarmHub */}
        <button
          onClick={() => router.push('/login/larm')}
          onMouseEnter={() => setHovering('larm')}
          onMouseLeave={() => setHovering(null)}
          className="group flex-1 relative rounded-2xl overflow-hidden border transition-all duration-500 text-left"
          style={{
            borderColor: hovering === 'larm' ? 'rgba(30,90,160,0.5)' : 'rgba(255,255,255,0.07)',
            background: hovering === 'larm'
              ? 'linear-gradient(145deg, rgba(13,27,42,0.98), rgba(20,40,65,0.98))'
              : 'rgba(255,255,255,0.03)',
            boxShadow: hovering === 'larm'
              ? '0 0 40px rgba(30,90,160,0.15), inset 0 1px 0 rgba(30,90,160,0.2)'
              : 'none',
            transform: hovering === 'larm' ? 'translateY(-3px)' : 'translateY(0)',
          }}
        >
          {/* Decorative top line */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px] transition-all duration-500"
            style={{
              background: hovering === 'larm'
                ? 'linear-gradient(90deg, transparent, #1E3A5F, transparent)'
                : 'transparent',
            }}
          />

          <div className="p-7">
            {/* Icon */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300"
              style={{
                background: hovering === 'larm'
                  ? 'rgba(30,58,95,0.4)'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${hovering === 'larm' ? 'rgba(30,90,160,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {/* Corporativo icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect
                  x="3" y="3" width="18" height="18" rx="2"
                  stroke={hovering === 'larm' ? '#6B9BD2' : '#64748b'}
                  strokeWidth="1.5"
                />
                <path
                  d="M3 9H21M9 3V21"
                  stroke={hovering === 'larm' ? '#6B9BD2' : '#64748b'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Logotipo text */}
            <div className="mb-1">
              <span
                className="text-xs tracking-[0.25em] uppercase font-medium transition-colors duration-300"
                style={{ color: hovering === 'larm' ? '#6B9BD2' : '#475569' }}
              >
                LARM
              </span>
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">HUB</h2>
            <p className="text-sm leading-relaxed mb-6"
              style={{ color: hovering === 'larm' ? 'rgba(255,255,255,0.6)' : '#475569' }}>
              Governança · Financeiro · Operações
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {['Holding', 'Controladoria', 'Estratégia'].map(tag => (
                <span
                  key={tag}
                  className="text-[10px] px-2 py-0.5 rounded-full transition-all duration-300"
                  style={{
                    background: hovering === 'larm' ? 'rgba(30,90,160,0.15)' : 'rgba(255,255,255,0.04)',
                    color: hovering === 'larm' ? '#6B9BD2' : '#475569',
                    border: `1px solid ${hovering === 'larm' ? 'rgba(30,90,160,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* CTA */}
            <div
              className="mt-6 flex items-center gap-2 text-sm font-medium transition-all duration-300"
              style={{ color: hovering === 'larm' ? '#6B9BD2' : '#334155' }}
            >
              Acessar
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                style={{
                  transform: hovering === 'larm' ? 'translateX(4px)' : 'translateX(0)',
                  transition: 'transform 0.3s',
                }}
              >
                <path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
        </button>

      </div>

      {/* Footer */}
      <p className="relative z-10 text-center text-slate-700 text-[11px] mt-8 tracking-wide">
        LARM GROUP · Solidez Hoje, Legado Amanhã.
      </p>

    </div>
  )
}
