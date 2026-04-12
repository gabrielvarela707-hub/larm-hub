'use client'

import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import {
  Save, Check, Upload, Palette, Globe, Mail, Users, Bell,
  CreditCard, Shield, Key, MapPin, Eye, EyeOff,
  AlertCircle, X, Link2, Zap, ExternalLink, CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenantConfig } from '@/lib/tenant-config-store'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AppUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'broker' | 'accountant' | 'viewer'
  active: boolean
}

interface ModulePerms {
  read: boolean
  write: boolean
}

type PermsMap = Record<string, Record<string, ModulePerms>>

const INITIAL_USERS: AppUser[] = [
  { id: 'u1', name: 'Fernando Monteiro', email: 'fernando@santaclara.com.br', role: 'admin',      active: true },
  { id: 'u2', name: 'Carlos Henrique',   email: 'carlos@santaclara.com.br',   role: 'broker',     active: true },
  { id: 'u3', name: 'Ana Paula Costa',   email: 'ana@santaclara.com.br',      role: 'broker',     active: true },
  { id: 'u4', name: 'Maria Contadora',   email: 'maria@escritorio.com.br',    role: 'accountant', active: true },
  { id: 'u5', name: 'Pedro Gerente',     email: 'pedro@santaclara.com.br',    role: 'manager',    active: false },
]

const MODULE_GROUPS: { group: string; modules: { id: string; label: string }[] }[] = [
  { group: 'Geral', modules: [
    { id: 'dashboard',     label: 'Dashboard' },
    { id: 'empreendimentos', label: 'Empreendimentos' },
    { id: 'mapa',          label: 'Mapa Interativo' },
  ]},
  { group: 'Vendas', modules: [
    { id: 'crm',           label: 'CRM e Leads' },
    { id: 'simulador',     label: 'Simulador de Vendas' },
    { id: 'contratos',     label: 'Contratos' },
    { id: 'landing_pages', label: 'Landing Pages' },
    { id: 'automacoes',    label: 'Automacoes' },
  ]},
  { group: 'Financeiro', modules: [
    { id: 'fin_receber',   label: 'Contas a Receber' },
    { id: 'fin_pagar',     label: 'Contas a Pagar' },
    { id: 'fin_boletos',   label: 'Boletos' },
    { id: 'fin_split',     label: 'Split de Pagamento' },
    { id: 'fin_sped',      label: 'SPED e DIMOB' },
  ]},
  { group: 'Operacional', modules: [
    { id: 'obras',         label: 'Obras' },
    { id: 'relatorios',    label: 'Relatorios' },
    { id: 'controladoria', label: 'Controladoria (Ads)' },
    { id: 'ia',            label: 'Chat IA' },
  ]},
  { group: 'Sistema', modules: [
    { id: 'configuracoes', label: 'Configuracoes' },
    { id: 'usuarios',      label: 'Usuarios e Permissoes' },
  ]},
]

// Default perms by role
function defaultPerms(role: AppUser['role']): Record<string, ModulePerms> {
  const all = { read: true, write: true }
  const ro  = { read: true, write: false }
  const no  = { read: false, write: false }
  const allMods = MODULE_GROUPS.flatMap(g => g.modules.map(m => m.id))

  if (role === 'admin')     return Object.fromEntries(allMods.map(id => [id, all]))
  if (role === 'manager')   return Object.fromEntries(allMods.map(id => [id,
    ['configuracoes','usuarios'].includes(id) ? no :
    ['fin_sped'].includes(id) ? ro : all
  ]))
  if (role === 'broker')    return Object.fromEntries(allMods.map(id => [id,
    ['crm','simulador','contratos','mapa','dashboard','empreendimentos'].includes(id) ? (id === 'contratos' ? ro : all) :
    ['relatorios'].includes(id) ? ro : no
  ]))
  if (role === 'accountant') return Object.fromEntries(allMods.map(id => [id,
    ['fin_receber','fin_pagar','fin_boletos','fin_sped','relatorios','contratos'].includes(id) ? ro :
    ['dashboard','empreendimentos'].includes(id) ? ro : no
  ]))
  // viewer
  return Object.fromEntries(allMods.map(id => [id,
    ['dashboard','empreendimentos','mapa','relatorios'].includes(id) ? ro : no
  ]))
}

// ─── CRM integrations ─────────────────────────────────────────────────────────

const CRM_INTEGRATIONS = [
  {
    id: 'fluentcrm', name: 'FluentCRM', type: 'WordPress Plugin',
    logo: '🟢', color: 'border-green-200 bg-green-50',
    desc: 'Plugin nativo do WordPress. Ideal se o site do cliente ja roda em WP. Integracao via REST API.',
    fields: [
      { key: 'site_url',    label: 'URL do site WordPress', placeholder: 'https://seusite.com.br' },
      { key: 'api_key',     label: 'API Key do FluentCRM',  placeholder: 'fcrm_...' },
      { key: 'api_secret',  label: 'API Secret',            placeholder: 'secret...' },
    ],
    features: ['Envio de leads', 'Adicionar tags', 'Criar listas', 'Disparar automacoes'],
    docs: 'https://fluentcrm.com/docs/rest-api/',
  },
  {
    id: 'rdstation', name: 'RD Station', type: 'Brasileiro',
    logo: '🔵', color: 'border-blue-200 bg-blue-50',
    desc: 'CRM e automacao de marketing mais usado no Brasil. Excelente para nutricao de leads.',
    fields: [
      { key: 'client_id',    label: 'Client ID',     placeholder: 'client_id...' },
      { key: 'access_token', label: 'Access Token',  placeholder: 'token...' },
    ],
    features: ['Criar contatos', 'Converter leads', 'Disparar fluxos', 'Tags e segmentacao'],
    docs: 'https://developers.rdstation.com/',
  },
  {
    id: 'hubspot', name: 'HubSpot', type: 'Internacional',
    logo: '🟠', color: 'border-orange-200 bg-orange-50',
    desc: 'Plataforma completa com CRM, email marketing, pipeline de vendas e relatorios avancados.',
    fields: [
      { key: 'access_token', label: 'Access Token (Private App)', placeholder: 'pat-...' },
      { key: 'portal_id',    label: 'Portal ID',                  placeholder: '12345678' },
    ],
    features: ['Contatos e empresas', 'Deals (negocios)', 'Sequencias de e-mail', 'Relatorios'],
    docs: 'https://developers.hubspot.com/',
  },
  {
    id: 'activecampaign', name: 'ActiveCampaign', type: 'Internacional',
    logo: '🟣', color: 'border-purple-200 bg-purple-50',
    desc: 'Foco em automacao de marketing com segmentacao avancada e lead scoring.',
    fields: [
      { key: 'api_url', label: 'API URL',  placeholder: 'https://suaconta.api-us1.com' },
      { key: 'api_key', label: 'API Key',  placeholder: 'sua_api_key_aqui' },
    ],
    features: ['Automacoes avancadas', 'Lead scoring', 'Segmentacao', 'SMS'],
    docs: 'https://developers.activecampaign.com/',
  },
]

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'identidade',   label: 'Identidade visual', icon: Palette },
  { id: 'dominio',      label: 'Dominio',            icon: Globe },
  { id: 'credenciais',  label: 'Credenciais',        icon: Key },
  { id: 'usuarios',     label: 'Usuarios',           icon: Users },
  { id: 'permissoes',   label: 'Permissoes',         icon: Shield },
  { id: 'crm_integ',    label: 'Integ. CRM',         icon: Link2 },
  { id: 'email',        label: 'E-mail (SES)',        icon: Mail },
  { id: 'notificacoes', label: 'Notificacoes',       icon: Bell },
  { id: 'plano',        label: 'Plano',              icon: CreditCard },
]

const COLOR_PRESETS = [
  { name: 'Azul',    primary: '#2563EB', sidebar: '#0D1B2A' },
  { name: 'Verde',   primary: '#059669', sidebar: '#052e16' },
  { name: 'Roxo',    primary: '#7C3AED', sidebar: '#1e1b4b' },
  { name: 'Laranja', primary: '#EA580C', sidebar: '#1c0a00' },
  { name: 'Cinza',   primary: '#374151', sidebar: '#111827' },
]

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card space-y-4">
      <div className="pb-3 border-b border-slate-50">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-start py-1">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <div className="col-span-2">{children}</div>
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={cn(
      'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm',
      'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400',
      'placeholder:text-slate-400 transition-colors', props.className
    )} />
  )
}

function SecretInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder ?? 'Insira a chave...'}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-9 text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors" />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const hydrate   = useTenantConfig(s => s.hydrate)
  const config    = useTenantConfig(s => s.config)
  const setConfig = useTenantConfig(s => s.setConfig)

  useEffect(() => { hydrate() }, [hydrate])

  const [tab, setTab]       = useState('identidade')
  const [saved, setSaved]   = useState(false)
  const logoInputRef        = useRef<HTMLInputElement>(null)

  // Visual
  const [logoText,     setLogoText]  = useState(config.logoText || 'LoteMobile')
  const [primaryColor, setPrimary]   = useState(config.primaryColor || '#2563EB')
  const [sidebarColor, setSidebar]   = useState(config.sidebarColor || '#0D1B2A')
  const [logoPreview,  setLogoPreview] = useState(config.logoUrl || '')

  // Creds
  const [creds, setCreds] = useState({
    googleMapsKey: config.googleMapsKey || '',
    sesAccessKeyId: '', sesSecretAccessKey: '', sesRegion: 'us-east-1',
    sesFromEmail: '', sesFromName: '',
    whatsappToken: '', whatsappPhoneId: '', whatsappBusinessId: '',
    clicksignKey: '', bankName: '', bankApiKey: '',
  })

  // CRM integration fields
  const [crmFields, setCrmFields] = useState<Record<string, Record<string, string>>>({})
  const [activeCrm, setActiveCrm] = useState<string>('')

  // Users & Permissions
  const [users, setUsers]       = useState<AppUser[]>(INITIAL_USERS)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [perms, setPerms]       = useState<PermsMap>(() =>
    Object.fromEntries(INITIAL_USERS.map(u => [u.id, defaultPerms(u.role)]))
  )

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      setLogoPreview(url)
      setConfig({ logoUrl: url })
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setLogoPreview('')
    setConfig({ logoUrl: '' })
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function togglePerm(userId: string, moduleId: string, type: 'read' | 'write') {
    setPerms(prev => {
      const curr = prev[userId]?.[moduleId] ?? { read: false, write: false }
      const next = { ...curr }
      if (type === 'read') {
        next.read = !curr.read
        if (!next.read) next.write = false  // sem leitura = sem escrita
      } else {
        next.write = !curr.write
        if (next.write) next.read = true    // escrita implica leitura
      }
      return { ...prev, [userId]: { ...prev[userId], [moduleId]: next } }
    })
  }

  function resetPerms(userId: string) {
    const user = users.find(u => u.id === userId)
    if (!user) return
    setPerms(prev => ({ ...prev, [userId]: defaultPerms(user.role) }))
  }

  function save() {
    setConfig({ logoUrl: logoPreview, logoText, primaryColor, sidebarColor, ...creds })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const ROLE_LABELS = {
    admin: 'Admin', manager: 'Gerente', broker: 'Corretor',
    accountant: 'Contador', viewer: 'Visualizador',
  }
  const ROLE_COLORS = {
    admin: 'bg-violet-100 text-violet-700', manager: 'bg-blue-100 text-blue-700',
    broker: 'bg-emerald-100 text-emerald-700', accountant: 'bg-amber-100 text-amber-700',
    viewer: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Configuracoes</h1>
          <p className="text-sm text-slate-500 mt-0.5">White-label, credenciais, usuarios e permissoes</p>
        </div>
        <button onClick={save}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}>
          {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      <div className="flex gap-5">
        <div className="w-48 flex-shrink-0 space-y-0.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                tab === t.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
              )}>
              <t.icon className="w-4 h-4 flex-shrink-0" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 space-y-4">

          {/* ── Identidade ── */}
          {tab === 'identidade' && (
            <>
              <Section title="Preview em tempo real">
                <div className="flex rounded-xl overflow-hidden border border-slate-200 h-24">
                  <div className="w-44 flex flex-col justify-between p-3" style={{ background: sidebarColor }}>
                    <div className="flex items-center gap-2">
                      {logoPreview ? (
                        <img src={logoPreview} alt="logo" className="h-6 max-w-[100px] object-contain"
                          style={{ filter: 'brightness(0) invert(1)' }} />
                      ) : (
                        <>
                          <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: primaryColor }}>
                            <MapPin className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-white text-xs font-semibold truncate">{logoText || 'LoteMobile'}</span>
                        </>
                      )}
                    </div>
                    <div className="space-y-1">
                      {['Dashboard','Empreendimentos','CRM'].map(item => (
                        <div key={item} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(255,255,255,0.15)' }} />
                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 p-3 bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full" />
                      <div className="w-14 h-5 rounded-lg" style={{ background: primaryColor }} />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded border border-slate-200 h-8" />)}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Logotipo" sub="Exibido no topo do menu lateral">
                <Field label="Upload" sub="PNG, JPG, SVG · max 2MB · fundo transparente recomendado">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-900 overflow-hidden relative group flex-shrink-0">
                      {logoPreview ? (
                        <>
                          <img src={logoPreview} alt="logo" className="max-w-full max-h-full p-2 object-contain"
                            style={{ filter: 'brightness(0) invert(1)' }} />
                          <button onClick={removeLogo}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center">
                          <Upload className="w-6 h-6 text-slate-500 mx-auto mb-1" />
                          <p className="text-[10px] text-slate-500">Preview</p>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload}
                        className="hidden" id="logo-upload" />
                      <label htmlFor="logo-upload"
                        className="flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        <Upload className="w-4 h-4" /> Fazer upload
                      </label>
                      {logoPreview && (
                        <button onClick={removeLogo} className="flex items-center gap-2 text-red-500 text-sm hover:text-red-700">
                          <X className="w-4 h-4" /> Remover logo
                        </button>
                      )}
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Sera exibido sobre fundo escuro.<br />Use versao branca ou transparente.
                      </p>
                    </div>
                  </div>
                </Field>
                <Field label="Nome da plataforma" sub="Aparece quando nao ha logo">
                  <Input value={logoText} onChange={e => setLogoText(e.target.value)} placeholder="LoteMobile" />
                </Field>
              </Section>

              <Section title="Cores">
                <Field label="Presets">
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(p => (
                      <button key={p.name} onClick={() => { setPrimary(p.primary); setSidebar(p.sidebar) }}
                        className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors',
                          primaryColor === p.primary ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}>
                        <span className="w-3.5 h-3.5 rounded-full" style={{ background: p.primary }} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Cor primaria">
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={e => setPrimary(e.target.value)} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <Input value={primaryColor} onChange={e => setPrimary(e.target.value)} className="w-32 font-mono text-xs" />
                  </div>
                </Field>
                <Field label="Cor do sidebar">
                  <div className="flex items-center gap-2">
                    <input type="color" value={sidebarColor} onChange={e => setSidebar(e.target.value)} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <Input value={sidebarColor} onChange={e => setSidebar(e.target.value)} className="w-32 font-mono text-xs" />
                  </div>
                </Field>
              </Section>
            </>
          )}

          {/* ── Usuarios ── */}
          {tab === 'usuarios' && (
            <Section title="Usuarios da conta" sub={`${users.filter(u => u.active).length} ativos`}>
              <div className="space-y-1">
                {users.map(u => (
                  <div key={u.id} className={cn('flex items-center gap-3 py-3 border-b border-slate-50 last:border-0', !u.active && 'opacity-50')}>
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-700 text-xs font-semibold">
                        {u.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">{u.name}</p>
                        {!u.active && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Inativo</span>}
                      </div>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', ROLE_COLORS[u.role])}>
                      {ROLE_LABELS[u.role]}
                    </span>
                    <button
                      onClick={() => { setSelectedUser(u); setTab('permissoes') }}
                      className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                      <Shield className="w-3.5 h-3.5" /> Permissoes
                    </button>
                  </div>
                ))}
              </div>
              <button className="flex items-center gap-2 text-sm text-blue-600 hover:underline mt-1">
                + Convidar usuario
              </button>
            </Section>
          )}

          {/* ── Permissoes — SIMPLE READ/WRITE TOGGLES ── */}
          {tab === 'permissoes' && (
            <>
              {/* User picker */}
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card">
                <p className="text-xs font-semibold text-slate-500 mb-3">Selecione o usuario:</p>
                <div className="flex gap-2 flex-wrap">
                  {users.map(u => (
                    <button key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
                        selectedUser?.id === u.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      )}>
                      <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                        selectedUser?.id === u.id ? 'bg-white/30 text-white' : 'bg-blue-100 text-blue-700'
                      )}>
                        {u.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                      </div>
                      {u.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {selectedUser ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-700 text-xs font-semibold">
                          {selectedUser.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{selectedUser.name}</p>
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[selectedUser.role])}>
                          {ROLE_LABELS[selectedUser.role]}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => resetPerms(selectedUser.id)}
                      className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                      Restaurar padrao do perfil
                    </button>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
                    {/* Header */}
                    <div className="grid grid-cols-[1fr_80px_80px] bg-slate-50 border-b border-slate-100 px-4 py-2.5">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Modulo</span>
                      <span className="text-xs font-semibold text-slate-500 text-center">Leitura</span>
                      <span className="text-xs font-semibold text-slate-500 text-center">Escrita</span>
                    </div>

                    {MODULE_GROUPS.map(g => (
                      <div key={g.group}>
                        <div className="px-4 py-2 bg-slate-50/50 border-b border-slate-100">
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{g.group}</p>
                        </div>
                        {g.modules.map(mod => {
                          const mp = perms[selectedUser.id]?.[mod.id] ?? { read: false, write: false }
                          return (
                            <div key={mod.id}
                              className="grid grid-cols-[1fr_80px_80px] px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors items-center">
                              <span className="text-sm text-slate-800">{mod.label}</span>

                              {/* Read toggle */}
                              <div className="flex justify-center">
                                <button onClick={() => togglePerm(selectedUser.id, mod.id, 'read')}
                                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                    mp.read ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                                  )}>
                                  {mp.read ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                </button>
                              </div>

                              {/* Write toggle */}
                              <div className="flex justify-center">
                                <button onClick={() => togglePerm(selectedUser.id, mod.id, 'write')}
                                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                    mp.write ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300 hover:bg-slate-200',
                                    !mp.read && 'opacity-40 cursor-not-allowed'
                                  )}
                                  disabled={!mp.read}>
                                  {mp.write ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4 text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-blue-100 rounded flex items-center justify-center"><CheckCircle className="w-3 h-3 text-blue-600" /></div> Leitura — visualiza o modulo</div>
                    <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-emerald-100 rounded flex items-center justify-center"><CheckCircle className="w-3 h-3 text-emerald-600" /></div> Escrita — cria e edita registros</div>
                    <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-slate-100 rounded flex items-center justify-center"><div className="w-3 h-3 rounded-full border-2 border-slate-300" /></div> Sem acesso</div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                  <Shield className="w-8 h-8 text-slate-200" />
                  <p className="text-sm">Selecione um usuario acima para editar as permissoes</p>
                </div>
              )}
            </>
          )}

          {/* ── CRM Integrations ── */}
          {tab === 'crm_integ' && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
                <strong>Estrategia de CRM:</strong> o LoteMobile cria e qualifica os leads, envia para o CRM externo via API e usa as automacoes nativas de cada plataforma. Voce escolhe a ferramenta que o cliente ja usa ou prefere.
              </div>

              <div className="space-y-3">
                {CRM_INTEGRATIONS.map(crm => {
                  const isActive = activeCrm === crm.id
                  const fields = crmFields[crm.id] ?? {}
                  return (
                    <div key={crm.id} className={cn('bg-white rounded-xl border shadow-card overflow-hidden transition-all', isActive ? 'border-blue-300' : 'border-slate-100')}>
                      <div className="flex items-start gap-4 p-4">
                        <div className="text-2xl flex-shrink-0 mt-0.5">{crm.logo}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-semibold text-slate-900 text-sm">{crm.name}</p>
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{crm.type}</span>
                            {isActive && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Ativo</span>}
                          </div>
                          <p className="text-xs text-slate-500 leading-relaxed">{crm.desc}</p>
                          <div className="flex gap-1.5 flex-wrap mt-2">
                            {crm.features.map(f => (
                              <span key={f} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{f}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <a href={crm.docs} target="_blank" rel="noreferrer"
                            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={() => setActiveCrm(isActive ? '' : crm.id)}
                            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                              isActive ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200' : 'bg-blue-600 text-white hover:bg-blue-700'
                            )}>
                            {isActive ? 'Desconectar' : 'Configurar'}
                          </button>
                        </div>
                      </div>

                      {isActive && (
                        <div className={cn('border-t px-4 pb-4 pt-3 space-y-3', crm.color)}>
                          {crm.fields.map(f => (
                            <div key={f.key}>
                              <label className="block text-xs text-slate-600 mb-1">{f.label}</label>
                              <SecretInput
                                value={fields[f.key] ?? ''}
                                onChange={v => setCrmFields(prev => ({ ...prev, [crm.id]: { ...prev[crm.id], [f.key]: v } }))}
                                placeholder={f.placeholder}
                              />
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-1">
                            <button className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors">
                              <Zap className="w-3.5 h-3.5 text-amber-500" /> Testar conexao
                            </button>
                            <p className="text-xs text-slate-400">Leads sao enviados automaticamente ao ser criados no CRM do sistema</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Credenciais ── */}
          {tab === 'credenciais' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                Custos cobrados diretamente pelos provedores. Cada tenant tem suas proprias credenciais.
              </div>
              <Section title="Google Maps API" sub="Mapa interativo de lotes">
                <Field label="API Key"><SecretInput value={creds.googleMapsKey} onChange={v => setCreds(c => ({ ...c, googleMapsKey: v }))} placeholder="AIza..." /></Field>
              </Section>
              <Section title="AWS SES" sub="E-mails transacionais">
                <Field label="Regiao">
                  <select value={creds.sesRegion} onChange={e => setCreds(c => ({ ...c, sesRegion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="sa-east-1">sa-east-1 (Sao Paulo)</option>
                  </select>
                </Field>
                <Field label="Access Key ID"><SecretInput value={creds.sesAccessKeyId} onChange={v => setCreds(c => ({ ...c, sesAccessKeyId: v }))} placeholder="AKIA..." /></Field>
                <Field label="Secret Key"><SecretInput value={creds.sesSecretAccessKey} onChange={v => setCreds(c => ({ ...c, sesSecretAccessKey: v }))} /></Field>
                <Field label="E-mail remetente"><Input value={creds.sesFromEmail} onChange={e => setCreds(c => ({ ...c, sesFromEmail: e.target.value }))} placeholder="noreply@suaempresa.com.br" /></Field>
                <Field label="Nome remetente"><Input value={creds.sesFromName} onChange={e => setCreds(c => ({ ...c, sesFromName: e.target.value }))} placeholder="Residencial Santa Clara" /></Field>
              </Section>
              <Section title="WhatsApp Business API">
                <Field label="Token"><SecretInput value={creds.whatsappToken} onChange={v => setCreds(c => ({ ...c, whatsappToken: v }))} placeholder="EAAx..." /></Field>
                <Field label="Phone Number ID"><Input value={creds.whatsappPhoneId} onChange={e => setCreds(c => ({ ...c, whatsappPhoneId: e.target.value }))} /></Field>
              </Section>
            </>
          )}

          {tab === 'dominio' && (
            <Section title="Dominio personalizado">
              <Field label="Subdominio padrao">
                <div className="flex items-center gap-1">
                  <Input defaultValue="seuempresa" className="w-36" />
                  <span className="text-slate-500 text-sm">.lotemobile.com.br</span>
                </div>
              </Field>
              <Field label="Dominio proprio" sub="Configure CNAME no DNS">
                <Input placeholder="sistema.suaempresa.com.br" />
                <p className="text-xs text-slate-400 mt-1">CNAME: <code className="bg-slate-100 px-1 rounded">cname.vercel-dns.com</code></p>
              </Field>
            </Section>
          )}

          {tab === 'plano' && (
            <Section title="Plano atual">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-blue-900">Plano Premium</span>
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Ativo</span>
                </div>
                <p className="text-sm text-blue-800">Adesao: R$ 10.000,00 · Mensalidade: R$ 2.590,00</p>
              </div>
            </Section>
          )}

          {tab === 'email' && (
            <Section title="E-mail (SES)">
              <p className="text-sm text-slate-500 py-4 text-center">
                Configure as chaves em <button onClick={() => setTab('credenciais')} className="text-blue-600 hover:underline">Credenciais</button>.
              </p>
            </Section>
          )}

          {tab === 'notificacoes' && (
            <Section title="Notificacoes">
              {[
                { label: 'Novo lead', sub: 'Alerta ao receber lead' },
                { label: 'Parcela em atraso', sub: 'Quando parcela vencer' },
                { label: 'Contrato assinado', sub: 'Confirmacao de assinatura' },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{n.label}</p>
                    <p className="text-xs text-slate-500">{n.sub}</p>
                  </div>
                  <div className="flex gap-3">
                    {['E-mail','WhatsApp','Sistema'].map(ch => (
                      <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-3.5 h-3.5 accent-blue-600" />
                        <span className="text-xs text-slate-600">{ch}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}
