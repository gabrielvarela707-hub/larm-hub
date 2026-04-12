'use client'

import { useState } from 'react'
import {
  Eye, Settings, Save, MapPin, Phone, Mail, Instagram,
  Facebook, ChevronDown, Star, CheckCircle, Image, Plus, X,
  MoveUp, MoveDown, Pencil,
} from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { useEmpreendimentos } from '@/lib/empreendimentos-store'

// ── Config types ──────────────────────────────────────────────────────────────

interface LPConfig {
  // Hero
  heroTitle: string
  heroSubtitle: string
  heroBgColor: string
  heroTextColor: string
  // Empreendimento
  empId: string
  showOnlyAvailable: boolean
  maxLots: number
  // Contact
  whatsapp: string
  email: string
  instagram: string
  facebook: string
  // Location
  address: string
  mapsEmbed: string
  // Sections visible
  showHero: boolean
  showLots: boolean
  showLocation: boolean
  showContact: boolean
  showGallery: boolean
  // Brand
  logoUrl: string
  primaryColor: string
  font: string
}

const DEFAULT_CONFIG: LPConfig = {
  heroTitle: 'Seu terreno no Residencial Santa Clara',
  heroSubtitle: 'Lotes a partir de R$ 165.000 em Pindamonhangaba SP. Infraestrutura completa, natureza e qualidade de vida.',
  heroBgColor: '#0D1B2A',
  heroTextColor: '#FFFFFF',
  empId: 'emp_sc_001',
  showOnlyAvailable: true,
  maxLots: 6,
  whatsapp: '(12) 99999-0000',
  email: 'vendas@santaclara.com.br',
  instagram: '@residencialsantaclara',
  facebook: 'Residencial Santa Clara',
  address: 'R. Edison Duarte Junior, 100 - Pindamonhangaba SP',
  mapsEmbed: 'https://maps.google.com/?q=-22.9132,-45.4499',
  showHero: true,
  showLots: true,
  showLocation: true,
  showContact: true,
  showGallery: false,
  logoUrl: '',
  primaryColor: '#2563EB',
  font: 'system',
}

// ── LP Preview ─────────────────────────────────────────────────────────────────

function LPPreview({ cfg, lots }: { cfg: LPConfig; lots: any[] }) {
  const shown = (cfg.showOnlyAvailable ? lots.filter(l => l.status === 'livre') : lots).slice(0, cfg.maxLots)

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-slate-200 text-sm"
      style={{ fontFamily: cfg.font === 'system' ? 'system-ui, sans-serif' : cfg.font }}>

      {/* Navbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ background: cfg.heroBgColor }}>
        {cfg.logoUrl ? (
          <img src={cfg.logoUrl} alt="logo" className="h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: cfg.primaryColor }}>
              <MapPin className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-sm" style={{ color: cfg.heroTextColor }}>Santa Clara</span>
          </div>
        )}
        <a href={`https://wa.me/55${cfg.whatsapp.replace(/\D/g, '')}`}
          className="px-4 py-1.5 rounded-full text-xs font-semibold text-white"
          style={{ background: cfg.primaryColor }}>
          Falar com corretor
        </a>
      </div>

      {/* Hero */}
      {cfg.showHero && (
        <div className="px-6 py-10 text-center" style={{ background: cfg.heroBgColor }}>
          <div className="inline-block bg-white/10 text-white text-[10px] font-semibold px-3 py-1 rounded-full mb-4 uppercase tracking-wide">
            Lancamento
          </div>
          <h1 className="text-2xl font-bold mb-3 leading-tight" style={{ color: cfg.heroTextColor }}>
            {cfg.heroTitle}
          </h1>
          <p className="text-sm opacity-70 max-w-md mx-auto leading-relaxed mb-6" style={{ color: cfg.heroTextColor }}>
            {cfg.heroSubtitle}
          </p>
          <button className="px-6 py-2.5 rounded-full text-white text-sm font-semibold"
            style={{ background: cfg.primaryColor }}>
            Ver lotes disponiveis
          </button>
        </div>
      )}

      {/* Lots grid */}
      {cfg.showLots && shown.length > 0 && (
        <div className="px-6 py-8 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-900 text-center mb-5">
            Lotes {cfg.showOnlyAvailable ? 'Disponiveis' : 'do Empreendimento'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {shown.map((lot, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-md transition-shadow">
                <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center"
                  style={{ background: cfg.primaryColor + '20' }}>
                  <MapPin className="w-4 h-4" style={{ color: cfg.primaryColor }} />
                </div>
                <p className="font-semibold text-slate-900 text-xs">Qd {lot.quadra} · Lt {lot.number}</p>
                <p className="text-xs text-slate-500 mb-2">{lot.area} m²</p>
                <p className="font-bold text-sm mb-1" style={{ color: cfg.primaryColor }}>
                  {formatCurrency(lot.price)}
                </p>
                <p className="text-[10px] text-slate-400 mb-3">ou ate 180x</p>
                <button className="w-full py-1.5 rounded-lg text-[11px] font-semibold text-white"
                  style={{ background: '#25D366' }}>
                  Tenho interesse
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Location */}
      {cfg.showLocation && (
        <div className="px-6 py-8">
          <h2 className="text-lg font-bold text-slate-900 text-center mb-4">Localizacao</h2>
          <div className="bg-slate-100 rounded-xl h-32 flex items-center justify-center mb-3">
            <div className="text-center">
              <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Mapa do Google Maps</p>
            </div>
          </div>
          <p className="text-xs text-slate-600 text-center">{cfg.address}</p>
        </div>
      )}

      {/* Contact */}
      {cfg.showContact && (
        <div className="px-6 py-8 text-center" style={{ background: cfg.heroBgColor }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: cfg.heroTextColor }}>Entre em contato</h2>
          <div className="flex justify-center gap-4 flex-wrap">
            {cfg.whatsapp && (
              <a href={`https://wa.me/55${cfg.whatsapp.replace(/\D/g, '')}`}
                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-full text-xs font-semibold">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
            )}
            {cfg.instagram && (
              <a href="#" className="flex items-center gap-2 bg-pink-500 text-white px-4 py-2 rounded-full text-xs font-semibold">
                <Instagram className="w-3.5 h-3.5" /> Instagram
              </a>
            )}
          </div>
          <p className="text-xs mt-4 opacity-60" style={{ color: cfg.heroTextColor }}>{cfg.email}</p>
        </div>
      )}

      <div className="text-center py-3 text-[10px] text-slate-400 border-t">
        Landing page gerada pelo LoteMobile
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPagesPage() {
  const { empreendimentos } = useEmpreendimentos()
  const [cfg, setCfg] = useState<LPConfig>(DEFAULT_CONFIG)
  const [tab, setTab] = useState<'hero'|'lotes'|'contato'|'aparencia'>('hero')
  const [previewMode, setPreviewMode] = useState(false)
  const [saved, setSaved] = useState(false)

  const emp = empreendimentos.find(e => e.id === cfg.empId) ?? empreendimentos[0]

  function f(key: keyof LPConfig, val: any) {
    setCfg(c => ({ ...c, [key]: val }))
  }

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (previewMode) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Preview da Landing Page</h2>
          <button onClick={() => setPreviewMode(false)}
            className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-2 rounded-lg text-sm">
            <Settings className="w-4 h-4" /> Voltar ao editor
          </button>
        </div>
        <LPPreview cfg={cfg} lots={emp?.lots ?? []} />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Landing Pages</h1>
          <p className="text-sm text-slate-500 mt-0.5">Crie paginas de captacao para cada empreendimento</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPreviewMode(true)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button onClick={save}
            className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}>
            {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Editor */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-card">
            <div className="flex border-b border-slate-100">
              {[['hero','Hero'],['lotes','Lotes'],['contato','Contato'],['aparencia','Visual']].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id as typeof tab)}
                  className={cn('flex-1 py-2.5 text-xs font-medium transition-colors',
                    tab === id ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/30' : 'text-slate-500 hover:text-slate-700'
                  )}>
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {tab === 'hero' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Titulo principal</label>
                    <input value={cfg.heroTitle} onChange={e => f('heroTitle', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Subtitulo</label>
                    <textarea value={cfg.heroSubtitle} onChange={e => f('heroSubtitle', e.target.value)} rows={3}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  {[
                    { label: 'Mostrar hero', key: 'showHero' as keyof LPConfig },
                    { label: 'Mostrar galeria', key: 'showGallery' as keyof LPConfig },
                    { label: 'Mostrar localizacao', key: 'showLocation' as keyof LPConfig },
                  ].map(s => (
                    <div key={s.key} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700">{s.label}</span>
                      <button onClick={() => f(s.key, !cfg[s.key])}
                        className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                          cfg[s.key] ? 'bg-blue-600' : 'bg-slate-200'
                        )}>
                        <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                          cfg[s.key] ? 'translate-x-4' : 'translate-x-0.5'
                        )} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {tab === 'lotes' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Empreendimento</label>
                    <select value={cfg.empId} onChange={e => f('empId', e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                      {empreendimentos.map(e => <option key={e.id} value={e.id}>{e.name} — {e.phase}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Quantidade de lotes exibidos</label>
                    <div className="flex gap-2">
                      {[3, 6, 9, 12].map(n => (
                        <button key={n} onClick={() => f('maxLots', n)}
                          className={cn('flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors',
                            cfg.maxLots === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                          )}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-700">Somente lotes livres</p>
                      <p className="text-xs text-slate-400">Oculta reservados e vendidos</p>
                    </div>
                    <button onClick={() => f('showOnlyAvailable', !cfg.showOnlyAvailable)}
                      className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        cfg.showOnlyAvailable ? 'bg-blue-600' : 'bg-slate-200'
                      )}>
                      <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
                        cfg.showOnlyAvailable ? 'translate-x-4' : 'translate-x-0.5'
                      )} />
                    </button>
                  </div>
                </>
              )}

              {tab === 'contato' && (
                <>
                  {[
                    { label: 'WhatsApp', key: 'whatsapp', placeholder: '(12) 99999-0000' },
                    { label: 'E-mail', key: 'email', placeholder: 'vendas@empresa.com.br' },
                    { label: 'Instagram', key: 'instagram', placeholder: '@seuperfil' },
                    { label: 'Facebook', key: 'facebook', placeholder: 'Pagina do Facebook' },
                    { label: 'Endereco', key: 'address', placeholder: 'Rua, numero, cidade' },
                  ].map(field => (
                    <div key={field.key}>
                      <label className="block text-xs text-slate-600 mb-1.5">{field.label}</label>
                      <input value={(cfg as any)[field.key]}
                        onChange={e => f(field.key as keyof LPConfig, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                    </div>
                  ))}
                </>
              )}

              {tab === 'aparencia' && (
                <>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Cor do fundo/header</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={cfg.heroBgColor} onChange={e => f('heroBgColor', e.target.value)}
                        className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                      <input value={cfg.heroBgColor} onChange={e => f('heroBgColor', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Cor primaria (botoes/destaques)</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={cfg.primaryColor} onChange={e => f('primaryColor', e.target.value)}
                        className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                      <input value={cfg.primaryColor} onChange={e => f('primaryColor', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1.5">Logotipo (URL ou upload)</label>
                    <input value={cfg.logoUrl} onChange={e => f('logoUrl', e.target.value)}
                      placeholder="https://... ou deixe vazio para usar nome"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                    O dominio personalizado (ex: lotesterreno.com.br) e configurado em Configuracoes → Dominio
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Live preview (mini) */}
        <div className="space-y-2">
          <p className="text-xs text-slate-500 font-medium">Preview em tempo real</p>
          <div className="scale-[0.85] origin-top-left w-[117%]">
            <LPPreview cfg={cfg} lots={emp?.lots ?? []} />
          </div>
        </div>
      </div>
    </div>
  )
}
