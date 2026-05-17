'use client'

import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import {
  Save, Check, Upload, Palette, Globe, Mail, Users, Bell,
  MoreHorizontal, Shield, Key, MapPin, Eye, EyeOff,
  AlertCircle, X, Link2, Zap, ExternalLink, CheckCircle,
  UserPlus, Copy, RefreshCw, Send, ChevronDown, Loader2,
  Layers, Plus, Pencil, Trash2, Tags, Activity, SlidersHorizontal,
  Info, Server, Database, Code2, GitBranch, CalendarDays,
} from 'lucide-react'
import { apiClient, useAuthStore } from '@/lib/auth-store'
import { cn } from '@/lib/utils'
import { useTenantConfig } from '@/lib/tenant-config-store'

// ─── Types ───────────────────────────────────────────────────────────────────

type PortalId = 'santa_clara' | 'larm'

const PORTAL_OPTIONS: { id: PortalId; label: string; description: string }[] = [
  { id: 'santa_clara', label: 'Santa Clara HUB', description: 'Loteadora, corretores, clientes e boletos' },
  { id: 'larm', label: 'LARM HUB', description: 'Governança, financeiro e operações' },
]

function normalizePortalAccess(value?: PortalId[] | string[] | null): PortalId[] {
  const arr = Array.isArray(value) ? value : []
  const valid = arr.filter((v): v is PortalId => v === 'santa_clara' || v === 'larm')
  return valid.length ? Array.from(new Set(valid)) : ['santa_clara']
}

interface AppUser {
  id: string
  name: string
  email: string
  role: 'admin' | 'manager' | 'broker' | 'financial' | 'controller' | 'marketing' | 'accountant' | 'viewer' | 'assistant' | 'supplier' | 'client' | 'consultant'
  active: boolean
  profiles?: { id: string; name: string; color?: string }[]
  profile_ids?: string[]
  allowed_hubs?: PortalId[]
}

type Profile = {
  id: string
  name: string
  description: string
  color: string
  permissions: Record<string, ModulePerms>
  user_count?: number
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
  if (role === 'financial') return Object.fromEntries(allMods.map(id => [id,
    ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_split','relatorios','contratos'].includes(id) ? all : no
  ]))
  if (role === 'controller') return Object.fromEntries(allMods.map(id => [id,
    ['dashboard','fin_receber','fin_pagar','fin_boletos','fin_split','fin_sped','relatorios','controladoria','contratos'].includes(id) ? all : no
  ]))
  if (role === 'marketing') return Object.fromEntries(allMods.map(id => [id,
    ['dashboard','crm','landing_pages','automacoes','relatorios','configuracoes','usuarios'].includes(id) ? (['configuracoes','usuarios'].includes(id) ? ro : all) : no
  ]))
  if (role === 'accountant') return Object.fromEntries(allMods.map(id => [id,
    ['fin_receber','fin_pagar','fin_boletos','fin_sped','relatorios','contratos'].includes(id) ? ro :
    ['dashboard','empreendimentos'].includes(id) ? ro : no
  ]))
  if (role === 'assistant')  return Object.fromEntries(allMods.map(id => [id,
    ['crm','simulador','contratos','mapa','dashboard','empreendimentos','relatorios'].includes(id) ? ro : no
  ]))
  if (role === 'consultant') return Object.fromEntries(allMods.map(id => [id,
    ['crm','simulador','mapa','dashboard','empreendimentos'].includes(id) ? ro : no
  ]))
  if (role === 'supplier')   return Object.fromEntries(allMods.map(id => [id,
    ['dashboard'].includes(id) ? ro : no
  ]))
  if (role === 'client')     return Object.fromEntries(allMods.map(id => [id,
    ['dashboard','contratos','mapa'].includes(id) ? ro : no
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
  { id: 'perfis',       label: 'Perfis',             icon: Layers },
  { id: 'permissoes',   label: 'Permissoes',         icon: Shield },
  { id: 'convites_perm', label: 'Perm. convite',      icon: SlidersHorizontal },
  { id: 'logs',         label: 'Logs',               icon: Activity },
  { id: 'crm_integ',    label: 'Integ. CRM',         icon: Link2 },
  { id: 'email',        label: 'E-mail',        icon: Mail },
  { id: 'notificacoes', label: 'Notificacoes',       icon: Bell },
  { id: 'sobre',        label: 'Sobre sistema',      icon: Info },
]

const COLOR_PRESETS = [
  { name: 'Azul',    primary: '#2563EB', sidebar: '#0D1B2A' },
  { name: 'Verde',   primary: '#059669', sidebar: '#052e16' },
  { name: 'Roxo',    primary: '#7C3AED', sidebar: '#1e1b4b' },
  { name: 'Laranja', primary: '#EA580C', sidebar: '#1c0a00' },
  { name: 'Cinza',   primary: '#374151', sidebar: '#111827' },
]

const ROLE_LEVELS: Record<string, number> = {
  super_admin: 100,
  admin: 90,
  manager: 80,
  controller: 70,
  financial: 65,
  marketing: 55,
  accountant: 50,
  broker: 45,
  consultant: 40,
  assistant: 35,
  supplier: 25,
  client: 20,
  viewer: 10,
}

function localCanManageRole(requesterRole?: string, targetRole?: string) {
  if (!requesterRole || !targetRole) return false
  if (requesterRole === 'super_admin') return targetRole !== 'super_admin'
  if (requesterRole === 'admin') return targetRole !== 'super_admin'
  return (ROLE_LEVELS[requesterRole] || 0) > (ROLE_LEVELS[targetRole] || 0)
}

function localCanInviteHierarchy(inviterRole?: string, targetRole?: string) {
  if (!inviterRole || !targetRole) return false
  if (inviterRole === 'super_admin') return targetRole !== 'super_admin'
  if (inviterRole === 'admin') return targetRole !== 'super_admin'
  return (ROLE_LEVELS[inviterRole] || 0) >= (ROLE_LEVELS[targetRole] || 0)
}

function formatDateTimeBR(value: string) {
  try { return new Date(value).toLocaleString('pt-BR') } catch { return value }
}

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
  const hydrate       = useTenantConfig(s => s.hydrate)
  const config        = useTenantConfig(s => s.config)
  const setConfig     = useTenantConfig(s => s.setConfig)
  const persistConfig = useTenantConfig(s => s.persistConfig)
  const configSaving  = useTenantConfig(s => s.saving)
  const currentUser   = useAuthStore(s => s.user)

  useEffect(() => { hydrate() }, [hydrate])

  const [tab, setTab]       = useState('identidade')
  const [saved, setSaved]   = useState(false)
  const logoInputRef        = useRef<HTMLInputElement>(null)

  // Visual
  const [logoText,     setLogoText]  = useState(config.logoText || 'LoteMobile')
  const [primaryColor, setPrimary]   = useState(config.primaryColor || '#2563EB')
  const [sidebarColor, setSidebar]   = useState(config.sidebarColor || '#0D1B2A')
  const [logoPreview,  setLogoPreview] = useState(config.logoUrl || '')

  // Sincroniza campos visuais e creds quando o store hidratar do backend
  const hydrated = useTenantConfig(s => s.hydrated)
  useEffect(() => {
    if (!hydrated) return
    setLogoText(config.logoText || 'LoteMobile')
    setLogoPreview(config.logoUrl || '')
    setPrimary(config.primaryColor || '#2563EB')
    setSidebar(config.sidebarColor || '#0D1B2A')
    setCreds({
      googleMapsKey:      config.googleMapsKey      || '',
      sesRegion:          config.sesRegion          || 'us-east-1',
      sesAccessKeyId:     config.sesAccessKeyId     || '',
      sesSecretAccessKey: config.sesSecretAccessKey || '',
      sesFromEmail:       config.sesFromEmail       || '',
      sesFromName:        config.sesFromName        || '',
      snsRegion:          config.snsRegion          || 'sa-east-1',
      snsAccessKeyId:     config.snsAccessKeyId     || '',
      snsSecretAccessKey: config.snsSecretAccessKey || '',
      snsSenderId:        config.snsSenderId        || 'LOTEAMENTO',
      snsSMSType:         config.snsSMSType         || 'Transactional' as 'Transactional' | 'Promotional',
      snsMockMode:        config.snsMockMode        ?? true,
      aiProvider:         (config.aiProvider || 'openai') as 'openai' | 'gemini',
      openaiApiKey:       config.openaiApiKey || '',
      geminiApiKey:       config.geminiApiKey || '',
      whatsappToken:      config.whatsappToken      || '',
      whatsappPhoneId:    config.whatsappPhoneId    || '',
      whatsappBusinessId: config.whatsappBusinessId || '',
      clicksignKey:       config.clicksignKey       || '',
      bankName:           config.bankName           || '',
      bankApiKey:         config.bankApiKey         || '',
    })
  }, [hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Creds
  const [creds, setCreds] = useState({
    googleMapsKey: config.googleMapsKey || '',
    // AWS SES (sistema)
    sesRegion:          config.sesRegion          || 'us-east-1',
    sesAccessKeyId:     config.sesAccessKeyId     || '',
    sesSecretAccessKey: config.sesSecretAccessKey || '',
    sesFromEmail:       config.sesFromEmail       || '',
    sesFromName:        config.sesFromName        || '',
    // AWS SNS (sistema)
    snsRegion:          config.snsRegion          || 'sa-east-1',
    snsAccessKeyId:     config.snsAccessKeyId     || '',
    snsSecretAccessKey: config.snsSecretAccessKey || '',
    snsSenderId:        config.snsSenderId        || 'LOTEAMENTO',
    snsSMSType:         config.snsSMSType         || 'Transactional' as 'Transactional' | 'Promotional',
    snsMockMode:        config.snsMockMode        ?? true,
    // IA
    aiProvider:     (config.aiProvider  || 'openai') as 'openai' | 'gemini',
    openaiApiKey:   config.openaiApiKey || '',
    geminiApiKey:   config.geminiApiKey || '',
    whatsappToken: config.whatsappToken || '',
    whatsappPhoneId: config.whatsappPhoneId || '',
    whatsappBusinessId: config.whatsappBusinessId || '',
    clicksignKey: config.clicksignKey || '',
    bankName: config.bankName || '',
    bankApiKey: config.bankApiKey || '',
  })

  // CRM integration fields
  const [crmFields, setCrmFields] = useState<Record<string, Record<string, string>>>({})
  const [activeCrm, setActiveCrm] = useState<string>('')

  // Users & Permissions
  const [users, setUsers]              = useState<AppUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [perms, setPerms]       = useState<PermsMap>({})

  // Convites pendentes
  type Invite = { id: string; name: string; email: string; role: AppUser['role']; status: string; expires_at: string; created_at: string; allowed_hubs?: PortalId[] }
  const [invites, setInvites]           = useState<Invite[]>([])
  const [resendingId, setResendingId]   = useState<string | null>(null)

  type RoleId = AppUser['role']
  type AuditLog = {
    id: string
    created_at: string
    action: string
    module: string
    ip?: string
    user_name?: string
    user_email?: string
    target_user_name?: string
    target_user_email?: string
    details?: Record<string, unknown>
  }


  type SystemRelease = {
    id?: string
    version: string
    title: string
    description?: string
    released_at?: string
    changes?: string[]
    frontend_version?: string
    backend_version?: string
  }

  type SystemAbout = {
    version: string
    released_at?: string
    frontend: {
      name: string
      version: string
      framework: string
      language: string
      ui: string[]
    }
    backend: {
      name: string
      version: string
      runtime: string
      framework: string
      auth: string
      email: string
    }
    database: {
      engine: string
      main_tables: string[]
    }
    infrastructure: {
      deploy: string
      proxy: string
      storage: string
    }
    releases: SystemRelease[]
    current_release?: SystemRelease | null
  }

  const [allowedInviteRoles, setAllowedInviteRoles] = useState<RoleId[]>([])
  const [inviteMatrix, setInviteMatrix] = useState<Record<string, RoleId[]>>({})
  const [invitePermEditable, setInvitePermEditable] = useState(false)
  const [invitePermSaving, setInvitePermSaving] = useState(false)
  const [invitePermLoading, setInvitePermLoading] = useState(false)

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditRetentionDays, setAuditRetentionDays] = useState(30)
  const [auditSaving, setAuditSaving] = useState(false)
  const [auditFilters, setAuditFilters] = useState({
    user_id: '', module: '', action: '', date_from: '', date_to: '', q: '',
  })


  const [systemAbout, setSystemAbout] = useState<SystemAbout | null>(null)
  const [systemLoading, setSystemLoading] = useState(false)


  type UserActionMode = 'menu' | 'perfil' | 'senha' | 'convite' | 'excluir'
  const [actionUser, setActionUser]       = useState<AppUser | null>(null)
  const [actionMode, setActionMode]       = useState<UserActionMode>('menu')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [editRole, setEditRole]           = useState<AppUser['role']>('broker')
  const [editProfileIds, setEditProfileIds] = useState<string[]>([])
  const [editAllowedHubs, setEditAllowedHubs] = useState<PortalId[]>(['santa_clara'])
  const [resetTempPassword, setResetTempPassword] = useState('')
  const [resendInviteUrl, setResendInviteUrl]     = useState('')

  // ── Perfis ────────────────────────────────────────────────────────────────
  const allModIds = MODULE_GROUPS.flatMap(g => g.modules.map(m => m.id))
  const emptyPerms = () => Object.fromEntries(allModIds.map(id => [id, { read: false, write: false }]))

  const [profiles,        setProfiles]        = useState<Profile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [editingProfile,  setEditingProfile]  = useState<Profile | null>(null)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileSaving,   setProfileSaving]   = useState(false)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)

  // Form de perfil
  const [pfName,  setPfName]  = useState('')
  const [pfDesc,  setPfDesc]  = useState('')
  const [pfColor, setPfColor] = useState('#2563EB')
  const [pfPerms, setPfPerms] = useState<Record<string, ModulePerms>>(emptyPerms)

  const PROFILE_COLORS = [
    '#2563EB','#7C3AED','#059669','#EA580C','#0891B2',
    '#DB2777','#374151','#B45309','#1D4ED8','#6D28D9',
  ]

  async function loadProfiles() {
    setProfilesLoading(true)
    try {
      const r = await apiClient.get<{ ok: boolean; data: Profile[] }>('/profiles')
      if (r.data.ok) setProfiles(r.data.data)
    } catch { /* silencioso */ } finally { setProfilesLoading(false) }
  }

  function openNewProfile() {
    setEditingProfile(null)
    setPfName(''); setPfDesc(''); setPfColor('#2563EB'); setPfPerms(emptyPerms())
    setShowProfileForm(true)
  }

  function openEditProfile(p: Profile) {
    setEditingProfile(p)
    setPfName(p.name); setPfDesc(p.description); setPfColor(p.color)
    setPfPerms({ ...emptyPerms(), ...p.permissions })
    setShowProfileForm(true)
  }

  function togglePfPerm(modId: string, type: 'read' | 'write') {
    setPfPerms(prev => {
      const cur = prev[modId] ?? { read: false, write: false }
      if (type === 'read') {
        const next = !cur.read
        return { ...prev, [modId]: { read: next, write: next ? cur.write : false } }
      }
      return { ...prev, [modId]: { ...cur, write: !cur.write } }
    })
  }

  async function saveProfile() {
    if (!pfName.trim()) return
    setProfileSaving(true)
    try {
      if (editingProfile) {
        await apiClient.put(`/profiles/${editingProfile.id}`, { name: pfName, description: pfDesc, color: pfColor, permissions: pfPerms })
      } else {
        await apiClient.post('/profiles', { name: pfName, description: pfDesc, color: pfColor, permissions: pfPerms })
      }
      setShowProfileForm(false)
      await loadProfiles()
    } catch { /* silencioso */ } finally { setProfileSaving(false) }
  }

  async function deleteProfile(id: string) {
    setDeletingId(id)
    try {
      await apiClient.delete(`/profiles/${id}`)
      await loadProfiles()
    } catch { /* silencioso */ } finally { setDeletingId(null) }
  }

  // ── Perfis do usuário (Permissoes tab) ────────────────────────────────────
  const [userProfiles,        setUserProfiles]        = useState<Record<string, string[]>>({}) // userId → profileIds[]
  const [togglingProfile,     setTogglingProfile]     = useState<string | null>(null)

  async function loadUserProfiles(userId: string) {
    try {
      const r = await apiClient.get<{ ok: boolean; data: string[] }>(`/users/${userId}/profiles`)
      if (r.data.ok) setUserProfiles(prev => ({ ...prev, [userId]: r.data.data }))
    } catch { /* silencioso */ }
  }

  async function toggleUserProfile(userId: string, profileId: string) {
    const current = userProfiles[userId] ?? []
    const has = current.includes(profileId)
    setTogglingProfile(profileId)
    try {
      if (has) {
        await apiClient.delete(`/users/${userId}/profiles/${profileId}`)
        setUserProfiles(prev => ({ ...prev, [userId]: current.filter(p => p !== profileId) }))
      } else {
        await apiClient.post(`/users/${userId}/profiles`, { profileId })
        setUserProfiles(prev => ({ ...prev, [userId]: [...current, profileId] }))
      }
    } catch { /* silencioso */ } finally { setTogglingProfile(null) }
  }


  function normalizeRoleText(text: string) {
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  }

  function roleFromProfileName(name: string): AppUser['role'] | null {
    const n = normalizeRoleText(name)
    if (n.includes('administrador') || n.includes('admin')) return 'admin'
    if (n.includes('gerente') || n.includes('gestor')) return 'manager'
    if (n.includes('financeiro')) return 'financial'
    if (n.includes('marketing')) return 'marketing'
    if (n.includes('controladoria')) return 'controller'
    if (n.includes('contador') || n.includes('contabil')) return 'accountant'
    if (n.includes('assistente')) return 'assistant'
    if (n.includes('consultor')) return 'consultant'
    if (n.includes('cliente')) return 'client'
    if (n.includes('fornecedor')) return 'supplier'
    if (n.includes('corretor') || n.includes('broker')) return 'broker'
    return null
  }

  function inferRoleFromProfileIds(profileIds: string[], fallback: AppUser['role'] = 'broker'): AppUser['role'] {
    const selectedProfiles = profiles.filter(p => profileIds.includes(p.id))
    const found = selectedProfiles.map(p => roleFromProfileName(p.name)).filter(Boolean) as AppUser['role'][]
    const priority: AppUser['role'][] = ['admin', 'manager', 'controller', 'financial', 'marketing', 'accountant', 'broker', 'assistant', 'consultant', 'client', 'supplier', 'viewer']
    return priority.find(role => found.includes(role)) || fallback
  }

  function openUserActions(user: AppUser) {
    const profileIds = userProfiles[user.id] ?? user.profile_ids ?? []
    setActionUser(user)
    setActionMode('menu')
    setActionMessage(null)
    setResetTempPassword('')
    setResendInviteUrl('')
    setEditRole(user.role)
    setEditProfileIds(profileIds)
    setEditAllowedHubs(normalizePortalAccess(user.allowed_hubs))
    if (!userProfiles[user.id]) {
      setUserProfiles(prev => ({ ...prev, [user.id]: profileIds }))
      loadUserProfiles(user.id)
    }
  }

  function closeUserActions() {
    setActionUser(null)
    setActionMode('menu')
    setActionMessage(null)
    setResetTempPassword('')
    setResendInviteUrl('')
    setActionLoading(false)
  }

  function toggleEditProfile(profileId: string) {
    setEditProfileIds(prev => {
      const next = prev.includes(profileId)
        ? prev.filter(id => id !== profileId)
        : [...prev, profileId]
      setEditRole(inferRoleFromProfileIds(next, editRole))
      return next
    })
  }

  function toggleEditAllowedHub(hub: PortalId) {
    setEditAllowedHubs(prev => {
      const exists = prev.includes(hub)
      const next = exists ? prev.filter(h => h !== hub) : [...prev, hub]
      return next.length ? next : prev
    })
  }

  async function saveUserAccess() {
    if (!actionUser) return
    setActionLoading(true)
    setActionMessage(null)
    try {
      await apiClient.put(`/users/${actionUser.id}`, { role: editRole, allowed_hubs: editAllowedHubs })
      await apiClient.put(`/users/${actionUser.id}/profiles`, { profileIds: editProfileIds })
      setUserProfiles(prev => ({ ...prev, [actionUser.id]: editProfileIds }))
      setUsers(prev => prev.map(u => u.id === actionUser.id ? { ...u, role: editRole, profile_ids: editProfileIds, allowed_hubs: editAllowedHubs } : u))
      setActionUser(prev => prev ? { ...prev, role: editRole, profile_ids: editProfileIds, allowed_hubs: editAllowedHubs } : prev)
      setActionMessage({ type: 'ok', text: 'Perfil atualizado com sucesso.' })
      await loadUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao atualizar perfil'
      setActionMessage({ type: 'error', text: msg })
    } finally {
      setActionLoading(false)
    }
  }

  async function resendUserInvite() {
    if (!actionUser) return
    setActionLoading(true)
    setActionMessage(null)
    setResendInviteUrl('')
    try {
      const r = await apiClient.post(`/users/${actionUser.id}/resend-invite`, {})
      const rawUrl: string = r.data.data?.invite_url || ''
      const fixedUrl = rawUrl.startsWith('undefined')
        ? `${window.location.origin}/convite/${rawUrl.split('/convite/')[1]}`
        : rawUrl
      setResendInviteUrl(fixedUrl)
      setActionMessage({ type: 'ok', text: 'Convite reenviado. Copie o link abaixo se precisar enviar manualmente.' })
      await loadUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao reenviar convite'
      setActionMessage({ type: 'error', text: msg })
    } finally {
      setActionLoading(false)
    }
  }

  async function resetUserPassword() {
    if (!actionUser) return
    setActionLoading(true)
    setActionMessage(null)
    setResetTempPassword('')
    try {
      const r = await apiClient.post(`/users/${actionUser.id}/reset-password`, {})
      setResetTempPassword(r.data.data?.temp_password || '')
      const sent = Boolean(r.data.data?.email_sent)
      setActionMessage({ type: 'ok', text: sent ? 'Senha temporária gerada e enviada por e-mail. O usuário deverá trocá-la no próximo acesso.' : 'Senha temporária gerada, mas o e-mail não foi enviado. Copie e envie manualmente.' })
      await loadUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao resetar senha'
      setActionMessage({ type: 'error', text: msg })
    } finally {
      setActionLoading(false)
    }
  }

  async function deactivateUser() {
    if (!actionUser) return
    setActionLoading(true)
    setActionMessage(null)
    try {
      await apiClient.delete(`/users/${actionUser.id}`)
      setUsers(prev => prev.map(u => u.id === actionUser.id ? { ...u, active: false } : u))
      setActionMessage({ type: 'ok', text: 'Usuário inativado com sucesso.' })
      await loadUsers()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao inativar usuário'
      setActionMessage({ type: 'error', text: msg })
    } finally {
      setActionLoading(false)
    }
  }

  async function loadUsers() {
    setUsersLoading(true)
    try {
      const [usersRes, invitesRes] = await Promise.all([
        apiClient.get<{ ok: boolean; data: { id: string; name: string; email: string; role: AppUser['role']; is_active: boolean; profiles?: AppUser['profiles']; profile_ids?: string[]; allowed_hubs?: PortalId[] }[] }>('/users'),
        apiClient.get<{ ok: boolean; data: Invite[] }>('/users/invites'),
      ])
      if (usersRes.data.ok) {
        const loaded: AppUser[] = usersRes.data.data.map(u => ({
          id: u.id, name: u.name, email: u.email, role: u.role, active: u.is_active,
          profiles: u.profiles || [], profile_ids: u.profile_ids || [], allowed_hubs: normalizePortalAccess(u.allowed_hubs),
        }))
        setUsers(loaded)
        setPerms(Object.fromEntries(loaded.map(u => [u.id, defaultPerms(u.role)])))
      }
      if (invitesRes.data.ok) setInvites(invitesRes.data.data)
    } catch {/* silencioso */} finally { setUsersLoading(false) }
  }


  async function loadInvitePermissions() {
    setInvitePermLoading(true)
    try {
      const r = await apiClient.get<{ ok: boolean; data: { matrix: Record<string, RoleId[]>; allowed_for_current_user: RoleId[]; editable: boolean } }>('/users/invite-permissions')
      if (r.data.ok) {
        setInviteMatrix(r.data.data.matrix || {})
        setAllowedInviteRoles(r.data.data.allowed_for_current_user || [])
        setInvitePermEditable(Boolean(r.data.data.editable))
      }
    } catch { /* silencioso */ } finally { setInvitePermLoading(false) }
  }

  async function saveInvitePermissions() {
    setInvitePermSaving(true)
    try {
      await apiClient.put('/users/invite-permissions', { matrix: inviteMatrix })
      await loadInvitePermissions()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao salvar permissões de convite')
    } finally {
      setInvitePermSaving(false)
    }
  }

  async function loadAuditSettings() {
    try {
      const r = await apiClient.get<{ ok: boolean; data: { retention_days: number } }>('/audit/settings')
      if (r.data.ok) setAuditRetentionDays(r.data.data.retention_days || 30)
    } catch { /* silencioso */ }
  }

  async function saveAuditSettings() {
    setAuditSaving(true)
    try {
      await apiClient.put('/audit/settings', { retention_days: auditRetentionDays })
      await loadAuditLogs()
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao salvar retenção')
    } finally {
      setAuditSaving(false)
    }
  }

  async function loadAuditLogs() {
    setAuditLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(auditFilters).forEach(([k, v]) => { if (v) params.set(k, String(v)) })
      params.set('limit', '100')
      const r = await apiClient.get<{ ok: boolean; data: AuditLog[] }>(`/audit/logs?${params.toString()}`)
      if (r.data.ok) setAuditLogs(r.data.data || [])
    } catch { /* silencioso */ } finally { setAuditLoading(false) }
  }


  async function loadSystemAbout() {
    setSystemLoading(true)
    try {
      const r = await apiClient.get<{ ok: boolean; data: SystemAbout }>('/system/about')
      if (r.data.ok) setSystemAbout(r.data.data)
    } catch (err) {
      console.error(err)
    } finally {
      setSystemLoading(false)
    }
  }

  async function resendInvite(invite: Invite) {
    setResendingId(invite.id)
    try {
      const r = await apiClient.post(`/users/invite/resend/${invite.id}`, {})
      const rawUrl: string = r.data.data?.invite_url || ''
      setInvResult({ url: rawUrl, temp_password: r.data.data?.temp_password })
      setShowInvite(true)
      await loadUsers()
    } catch { /* silencioso */ } finally { setResendingId(null) }
  }

  // ── Convite ────────────────────────────────────────────────────────────────
  const [showInvite,      setShowInvite]      = useState(false)
  const [invName,         setInvName]         = useState('')
  const [invEmail,        setInvEmail]        = useState('')
  const [invRole,         setInvRole]         = useState<AppUser['role']>('broker')
  const [invProfileIds,   setInvProfileIds]   = useState<string[]>([])
  const [invAllowedHubs,  setInvAllowedHubs]  = useState<PortalId[]>(['santa_clara'])
  const [invAutoActivate, setInvAutoActivate] = useState(true)
  const [invUseTempPw,    setInvUseTempPw]    = useState(false)
  const [invMsgMode,      setInvMsgMode]      = useState<'padrao'|'custom'>('padrao')
  const [invCustomMsg,    setInvCustomMsg]    = useState('')
  const [invSaving,       setInvSaving]       = useState(false)
  const [invResult,       setInvResult]       = useState<{url: string; temp_password?: string} | null>(null)
  const [invErrors,       setInvErrors]       = useState<Record<string,string>>({})
  const [invCopied,       setInvCopied]       = useState<string>('')

  // ── Teste SES ──────────────────────────────────────────────────────────────
  const [sesTestOpen,    setSesTestOpen]    = useState(false)
  const [sesTestEmail,   setSesTestEmail]   = useState('')
  const [sesTestLoading, setSesTestLoading] = useState(false)
  const [sesTestStatus,  setSesTestStatus]  = useState<{ ok: boolean; message: string } | null>(null)

  async function sendSesTest() {
    if (!sesTestEmail.trim()) return
    setSesTestLoading(true)
    setSesTestStatus(null)
    try {
      const r = await apiClient.post('/tenant-config/test-email', { to: sesTestEmail.trim() })
      setSesTestStatus({ ok: true, message: r.data.message || 'E-mail enviado com sucesso!' })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
        || 'Erro ao enviar — verifique as credenciais SES'
      setSesTestStatus({ ok: false, message: msg })
    } finally {
      setSesTestLoading(false)
    }
  }

  function resetInvite() {
    setInvName(''); setInvEmail(''); setInvRole('broker'); setInvProfileIds([]); setInvAllowedHubs(['santa_clara'])
    setInvAutoActivate(true); setInvUseTempPw(false)
    setInvMsgMode('padrao'); setInvCustomMsg('')
    setInvResult(null); setInvErrors({})
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setInvCopied(key)
      setTimeout(() => setInvCopied(''), 2000)
    })
  }

  function toggleInviteAllowedHub(hub: PortalId) {
    setInvAllowedHubs(prev => {
      const exists = prev.includes(hub)
      const next = exists ? prev.filter(h => h !== hub) : [...prev, hub]
      return next.length ? next : prev
    })
  }

  async function sendInvite() {
    const e: Record<string, string> = {}
    if (!invName.trim())  e.name  = 'Obrigatório'
    if (!invEmail.trim()) e.email = 'Obrigatório'
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(invEmail)) e.email = 'E-mail inválido'
    if (invProfileIds.length === 0) e.profiles = 'Selecione ao menos um perfil'
    if (invAllowedHubs.length === 0) e.allowed_hubs = 'Selecione ao menos um portal'
    setInvErrors(e)
    if (Object.keys(e).length) return

    const finalRole = inferRoleFromProfileIds(invProfileIds, invRole)
    if (allowedInviteRoles.length > 0 && !allowedInviteRoles.includes(finalRole)) {
      setInvErrors({ _geral: `Seu usuário não pode convidar perfil ${ROLE_LABELS[finalRole] || finalRole}.` })
      return
    }

    setInvSaving(true)
    try {
      const r = await apiClient.post('/users/invite', {
        name:             invName.trim(),
        email:            invEmail.trim().toLowerCase(),
        role:             finalRole,
        profile_ids:      invProfileIds,
        allowed_hubs:     invAllowedHubs,
        auto_activate:    invAutoActivate,
        use_temp_password: invUseTempPw,
        custom_message:   invMsgMode === 'custom' ? invCustomMsg.trim() : null,
      })
      const rawUrl: string = r.data.data.invite_url || ''
      const fixedUrl = rawUrl.startsWith('undefined')
        ? `${window.location.origin}/convite/${rawUrl.split('/convite/')[1]}`
        : rawUrl
      setInvResult({ url: fixedUrl, temp_password: r.data.data.temp_password })
      // Recarrega lista para mostrar status atualizado
      await loadUsers()
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : 'Erro ao enviar convite')
      setInvErrors({ _geral: (err as {response?: {data?: {message?: string}}}).response?.data?.message || msg })
    } finally {
      setInvSaving(false)
    }
  }

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

  // Carrega usuários reais da API ao montar
  useEffect(() => { loadUsers(); loadProfiles(); loadInvitePermissions() }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'logs') { loadAuditSettings(); loadAuditLogs() } }, [tab])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'sobre') loadSystemAbout() }, [tab])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'convites_perm') loadInvitePermissions() }, [tab])  // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    const payload = { logoUrl: logoPreview, logoText, primaryColor, sidebarColor, ...creds }
    setConfig(payload)
    persistConfig(payload).then(err => {
      if (!err) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        alert(`Erro ao salvar: ${err}`)
      }
    })
  }

  const ROLE_LABELS = {
    admin: 'Admin', manager: 'Gerente', broker: 'Corretor',
    financial: 'Financeiro', controller: 'Controladoria', marketing: 'Marketing',
    accountant: 'Contador', viewer: 'Visualizador',
    assistant: 'Assistente', supplier: 'Fornecedor',
    client: 'Cliente', consultant: 'Consultor',
  }
  const ROLE_COLORS = {
    admin: 'bg-violet-100 text-violet-700', manager: 'bg-blue-100 text-blue-700',
    broker: 'bg-emerald-100 text-emerald-700', financial: 'bg-orange-100 text-orange-700',
    controller: 'bg-yellow-100 text-yellow-700', marketing: 'bg-pink-100 text-pink-700', accountant: 'bg-amber-100 text-amber-700',
    viewer: 'bg-slate-100 text-slate-600',
    assistant: 'bg-sky-100 text-sky-700', supplier: 'bg-orange-100 text-orange-700',
    client: 'bg-teal-100 text-teal-700', consultant: 'bg-indigo-100 text-indigo-700',
  }

  const ROLE_OPTIONS: { id: AppUser['role']; label: string }[] = [
    { id: 'admin', label: 'Admin' },
    { id: 'manager', label: 'Gerente' },
    { id: 'broker', label: 'Corretor' },
    { id: 'financial', label: 'Financeiro' },
    { id: 'controller', label: 'Controladoria' },
    { id: 'marketing', label: 'Marketing' },
    { id: 'accountant', label: 'Contador' },
    { id: 'assistant', label: 'Assistente' },
    { id: 'consultant', label: 'Consultor' },
    { id: 'supplier', label: 'Fornecedor' },
    { id: 'client', label: 'Cliente' },
    { id: 'viewer', label: 'Visualizador' },
  ]

  const currentRole = currentUser?.role || 'viewer'
  const isAdminUser = currentRole === 'admin' || currentRole === 'super_admin'
  const allowedRoleOptions = ROLE_OPTIONS.filter(r => isAdminUser || allowedInviteRoles.includes(r.id))
  const editableRoleOptions = ROLE_OPTIONS.filter(r => localCanManageRole(currentRole, r.id))

  function canSeeTab(tabId: string) {
    if (['logs', 'convites_perm'].includes(tabId)) return isAdminUser
    return true
  }

  function canManageUserRow(user: AppUser) {
    return localCanManageRole(currentRole, user.role)
  }

  function profileAllowedForInvite(profile: Profile) {
    const role = roleFromProfileName(profile.name) || 'viewer'
    return isAdminUser || allowedInviteRoles.includes(role)
  }

  function toggleInviteMatrixRole(inviterRole: string, allowedRole: RoleId) {
    setInviteMatrix(prev => {
      const current = prev[inviterRole] || []
      const next = current.includes(allowedRole)
        ? current.filter(r => r !== allowedRole)
        : [...current, allowedRole]
      return { ...prev, [inviterRole]: next }
    })
  }

  const auditModules = ['auth', 'usuarios', 'perfis', 'financeiro', 'cadastros', 'configuracoes', 'logs', 'sistema']

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Configuracoes</h1>
          <p className="text-sm text-slate-500 mt-0.5">White-label, credenciais, usuarios e permissoes</p>
        </div>
        <button onClick={save} disabled={configSaving}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white',
            configSaving && 'opacity-60 cursor-not-allowed'
          )}>
          {configSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {configSaving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar'}
        </button>
      </div>

      <div className="flex gap-5">
        <div className="w-48 flex-shrink-0 space-y-0.5">
          {TABS.filter(t => canSeeTab(t.id)).map(t => (
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
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoPreview} alt="logo" className="h-6 max-w-[100px] object-contain"
                          style={{ filter: 'brightness(0) invert(1)' }} />
                        </>
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
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
            <>
              <Section title="Usuarios da conta" sub={usersLoading ? 'Carregando...' : `${users.filter(u => u.active).length} ativos`}>
                <div className="space-y-1">
                  {usersLoading
                    ? <p className="text-xs text-slate-400 animate-pulse py-4 text-center">Carregando usuários...</p>
                    : users.map(u => {
                      const linkedProfileIds = userProfiles[u.id] ?? u.profile_ids ?? []
                      const linkedProfiles = linkedProfileIds.length
                        ? profiles.filter(p => linkedProfileIds.includes(p.id))
                        : (u.profiles || [])
                      const visibleProfiles = linkedProfiles.slice(0, 2)
                      return (
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
                          <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-[260px]">
                            {visibleProfiles.length > 0 ? visibleProfiles.map(p => (
                              <span key={p.id} className="text-xs px-2.5 py-1 rounded-full font-medium text-white"
                                style={{ background: p.color || '#2563EB' }}>
                                {p.name}
                              </span>
                            )) : (
                              <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', ROLE_COLORS[u.role])}>
                                {ROLE_LABELS[u.role]}
                              </span>
                            )}
                            {linkedProfiles.length > 2 && (
                              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-medium">+{linkedProfiles.length - 2}</span>
                            )}
                            {normalizePortalAccess(u.allowed_hubs).map(hub => (
                              <span key={hub} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                                {hub === 'larm' ? 'LARM' : 'Santa Clara'}
                              </span>
                            ))}
                          </div>
                          {canManageUserRow(u) && (
                            <button
                              onClick={() => { setSelectedUser(u); setTab('permissoes') }}
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                              <Shield className="w-3.5 h-3.5" /> Permissoes
                            </button>
                          )}
                          <button
                            onClick={() => canManageUserRow(u) && openUserActions(u)}
                            disabled={!canManageUserRow(u)}
                            className={cn('p-2 rounded-lg transition-colors', canManageUserRow(u) ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-200 cursor-not-allowed')}
                            title={canManageUserRow(u) ? 'Ações do usuário' : 'Sem permissão para alterar este usuário'}>
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                </div>
                {(isAdminUser || allowedInviteRoles.length > 0) && (
                  <button
                    onClick={() => { resetInvite(); setInvRole((allowedInviteRoles[0] || 'broker') as AppUser['role']); setShowInvite(true) }}
                    className="flex items-center gap-2 text-sm font-medium text-white bg-[#1e3a5f] hover:bg-[#162d4a] px-4 py-2 rounded-lg mt-3 transition-colors">
                    <UserPlus className="w-4 h-4" /> Convidar usuario
                  </button>
                )}
              </Section>

              {/* ── Convites pendentes ── */}
              {invites.length > 0 && (
                <Section title="Convites pendentes" sub={`${invites.length} aguardando aceite`}>
                  <div className="space-y-2">
                    {invites.map(inv => {
                      const expired = new Date(inv.expires_at) < new Date()
                      return (
                        <div key={inv.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-slate-500 text-xs font-semibold">
                              {inv.name.split(' ').slice(0,2).map((n: string) => n[0]).join('')}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800">{inv.name}</p>
                            <p className="text-xs text-slate-500">{inv.email}</p>
                          </div>
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ROLE_COLORS[inv.role])}>
                            {ROLE_LABELS[inv.role]}
                          </span>
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                            expired ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700')}>
                            {expired ? 'Expirado' : 'Pendente'}
                          </span>
                          <button
                            onClick={() => resendInvite(inv)}
                            disabled={resendingId === inv.id}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap">
                            {resendingId === inv.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <RefreshCw className="w-3 h-3" />}
                            Reenviar
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )}

              {/* ── Modal de Convite ── */}
              {showInvite && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-base font-bold text-slate-800">Convidar usuario</h2>
                        <p className="text-xs text-slate-500 mt-0.5">O convidado receberá um link para criar sua senha</p>
                      </div>
                      <button onClick={() => setShowInvite(false)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Se convite já foi enviado — tela de resultado */}
                    {invResult ? (
                      <div className="px-6 py-6 space-y-4">
                        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                          <CheckCircle className="w-6 h-6 text-green-500 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-green-800">Convite criado!</p>
                            <p className="text-xs text-green-600 mt-0.5">Compartilhe o link abaixo com {invName}</p>
                          </div>
                        </div>

                        {/* Link do convite */}
                        <div>
                          <p className="text-xs font-medium text-slate-600 mb-1.5">Link do convite</p>
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                            <p className="flex-1 text-xs text-slate-600 truncate font-mono">{invResult.url}</p>
                            <button onClick={() => copyToClipboard(invResult.url, 'url')}
                              className="shrink-0 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                              {invCopied === 'url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              {invCopied === 'url' ? 'Copiado!' : 'Copiar'}
                            </button>
                          </div>
                        </div>

                        {/* Senha temporária (se gerada) */}
                        {invResult.temp_password && (
                          <div>
                            <p className="text-xs font-medium text-slate-600 mb-1.5">Senha temporária</p>
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                              <p className="flex-1 text-sm font-mono font-bold text-amber-800 tracking-widest">
                                {invResult.temp_password}
                              </p>
                              <button onClick={() => copyToClipboard(invResult.temp_password!, 'pw')}
                                className="shrink-0 flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-medium">
                                {invCopied === 'pw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {invCopied === 'pw' ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>
                            <p className="text-[10px] text-amber-600 mt-1">
                              ⚠ Guarde esta senha agora — não será exibida novamente. O usuario será obrigado a trocá-la no primeiro acesso.
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <button onClick={() => { resetInvite() }}
                            className="flex-1 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                            Novo convite
                          </button>
                          <button onClick={() => { setShowInvite(false); resetInvite() }}
                            className="flex-1 py-2 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors">
                            Fechar
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Formulário */
                      <div className="px-6 py-5 space-y-4">
                        {invErrors._geral && (
                          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                            {invErrors._geral}
                          </div>
                        )}

                        {/* Nome + E-mail */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-slate-600">Nome completo <span className="text-red-500">*</span></label>
                            <input
                              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
                              value={invName} onChange={e => setInvName(e.target.value)}
                              placeholder="Nome do usuario" />
                            {invErrors.name && <p className="text-[10px] text-red-500">{invErrors.name}</p>}
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium text-slate-600">E-mail <span className="text-red-500">*</span></label>
                            <input
                              className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400"
                              type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)}
                              placeholder="email@dominio.com" />
                            {invErrors.email && <p className="text-[10px] text-red-500">{invErrors.email}</p>}
                          </div>
                        </div>

                        {/* Perfis do banco */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-600">Perfil(s) de acesso</label>
                            {invProfileIds.length > 0 && (
                              <span className="text-[10px] text-blue-600 font-medium">
                                {invProfileIds.length} selecionado{invProfileIds.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {profilesLoading ? (
                            <p className="text-xs text-slate-400 animate-pulse">Carregando perfis...</p>
                          ) : profiles.length === 0 ? (
                            <p className="text-xs text-slate-400">
                              Nenhum perfil cadastrado.{' '}
                              <button onClick={() => { setShowInvite(false); setTab('perfis') }}
                                className="text-blue-600 underline">
                                Crie perfis primeiro
                              </button>
                            </p>
                          ) : (
                            <div className="flex gap-2 flex-wrap">
                              {profiles.filter(profileAllowedForInvite).map(p => {
                                const selected = invProfileIds.includes(p.id)
                                return (
                                  <button key={p.id}
                                    onClick={() => setInvProfileIds(prev => {
                                      const next = prev.includes(p.id)
                                        ? prev.filter(id => id !== p.id)
                                        : [...prev, p.id]
                                      setInvRole(inferRoleFromProfileIds(next, invRole))
                                      return next
                                    })}
                                    className={cn(
                                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                                      selected ? 'border-transparent text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    )}
                                    style={selected ? { background: p.color } : {}}>
                                    {selected && <Check className="w-3 h-3" />}
                                    {p.name}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {invProfileIds.length === 0 && profiles.length > 0 && (
                            <p className="text-[10px] text-amber-600">Selecione ao menos um perfil</p>
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-slate-600">Tipo do usuário no sistema</label>
                          <select value={invRole} onChange={e => setInvRole(e.target.value as AppUser['role'])}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
                            {allowedRoleOptions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </select>
                          <p className="text-[10px] text-slate-400">Somente perfis liberados para o seu usuário aparecem aqui.</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-slate-600">Portais de acesso</label>
                            <span className="text-[10px] text-slate-400">Pode marcar os dois</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {PORTAL_OPTIONS.map(portal => {
                              const selected = invAllowedHubs.includes(portal.id)
                              return (
                                <label key={portal.id}
                                  className={cn('flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                                    selected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'
                                  )}>
                                  <input type="checkbox" checked={selected}
                                    onChange={() => toggleInviteAllowedHub(portal.id)}
                                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                  <div>
                                    <p className="text-sm font-medium text-slate-800">{portal.label}</p>
                                    <p className="text-xs text-slate-500">{portal.description}</p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                          {invErrors.allowed_hubs && <p className="text-xs text-red-500">{invErrors.allowed_hubs}</p>}
                        </div>

                        {/* Opções */}
                        <div className="space-y-3 bg-slate-50 rounded-xl p-4">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Opções de acesso</p>

                          {/* Ativar automaticamente */}
                          <label className="flex items-center justify-between cursor-pointer">
                            <div>
                              <p className="text-sm font-medium text-slate-700">Ativar automaticamente</p>
                              <p className="text-xs text-slate-500">Conta ativa sem precisar de aprovação manual</p>
                            </div>
                            <button onClick={() => setInvAutoActivate(v => !v)}
                              className={cn(
                                'relative w-10 h-6 rounded-full transition-colors',
                                invAutoActivate ? 'bg-blue-500' : 'bg-slate-300'
                              )}>
                              <span className={cn(
                                'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all',
                                invAutoActivate ? 'left-5' : 'left-1'
                              )} />
                            </button>
                          </label>

                          {/* Senha temporária */}
                          <label className="flex items-center justify-between cursor-pointer">
                            <div>
                              <p className="text-sm font-medium text-slate-700">Gerar senha temporária</p>
                              <p className="text-xs text-slate-500">Cria a conta agora com senha que você compartilha</p>
                            </div>
                            <button onClick={() => setInvUseTempPw(v => !v)}
                              className={cn(
                                'relative w-10 h-6 rounded-full transition-colors',
                                invUseTempPw ? 'bg-blue-500' : 'bg-slate-300'
                              )}>
                              <span className={cn(
                                'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all',
                                invUseTempPw ? 'left-5' : 'left-1'
                              )} />
                            </button>
                          </label>
                        </div>

                        {/* Mensagem */}
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            {[{v:'padrao',l:'Mensagem padrão'},{v:'custom',l:'Personalizar'}].map(o => (
                              <button key={o.v} onClick={() => setInvMsgMode(o.v as 'padrao'|'custom')}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                                  invMsgMode === o.v
                                    ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                )}>
                                {o.l}
                              </button>
                            ))}
                          </div>

                          {invMsgMode === 'padrao' ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-500 italic leading-relaxed">
                              Olá! Você foi convidado para acessar o sistema como <span className="font-semibold text-slate-700">{invProfileIds.length > 0 ? profiles.filter(p => invProfileIds.includes(p.id)).map(p => p.name).join(', ') : ROLE_LABELS[invRole]}</span>.
                              Use o link do convite para configurar sua senha e começar a usar.
                            </div>
                          ) : (
                            <textarea
                              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 resize-none min-h-[80px]"
                              value={invCustomMsg}
                              onChange={e => setInvCustomMsg(e.target.value)}
                              placeholder="Escreva uma mensagem personalizada para o convite..." />
                          )}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => setShowInvite(false)}
                            className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                            Cancelar
                          </button>
                          <button onClick={sendInvite} disabled={invSaving}
                            className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors disabled:opacity-60">
                            {invSaving
                              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando…</>
                              : <><Send className="w-3.5 h-3.5" /> Enviar convite</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Modal de ações do usuário ── */}
              {actionUser && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-16 overflow-y-auto">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-base font-bold text-slate-800">Ações do usuário</h2>
                        <p className="text-xs text-slate-500 mt-0.5">{actionUser.name} · {actionUser.email}</p>
                      </div>
                      <button onClick={closeUserActions}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="px-6 py-5 space-y-4">
                      {actionMessage && (
                        <div className={cn('border rounded-xl px-3 py-2 text-xs',
                          actionMessage.type === 'ok'
                            ? 'bg-green-50 border-green-200 text-green-700'
                            : 'bg-red-50 border-red-200 text-red-600'
                        )}>
                          {actionMessage.text}
                        </div>
                      )}

                      {actionMode === 'menu' && (
                        <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setActionMode('perfil')}
                            className="text-left p-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                            <p className="text-sm font-semibold text-slate-800">Alterar perfil</p>
                            <p className="text-xs text-slate-500 mt-1">Mudar perfil de acesso e tipo do usuário.</p>
                          </button>
                          <button onClick={() => { setActionMode('convite'); resendUserInvite() }} disabled={actionLoading}
                            className="text-left p-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-60">
                            <p className="text-sm font-semibold text-slate-800">Reenviar convite</p>
                            <p className="text-xs text-slate-500 mt-1">Gera um novo link de convite para o usuário.</p>
                          </button>
                          <button onClick={() => setActionMode('senha')}
                            className="text-left p-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors">
                            <p className="text-sm font-semibold text-slate-800">Reset de senha</p>
                            <p className="text-xs text-slate-500 mt-1">Gerar senha temporária e obrigar troca.</p>
                          </button>
                          <button onClick={() => setActionMode('excluir')}
                            className="text-left p-4 rounded-xl border border-red-100 hover:bg-red-50 transition-colors">
                            <p className="text-sm font-semibold text-red-700">Excluir usuário</p>
                            <p className="text-xs text-red-500 mt-1">Inativa o usuário, sem apagar histórico.</p>
                          </button>
                        </div>
                      )}

                      {actionMode === 'perfil' && (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-medium text-slate-600">Tipo do usuário</label>
                            <select value={editRole} onChange={e => setEditRole(e.target.value as AppUser['role'])}
                              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400">
                              {editableRoleOptions.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">Você só pode aplicar perfis abaixo da sua hierarquia.</p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-medium text-slate-600">Perfis de acesso</label>
                              <span className="text-[10px] text-slate-400">{editProfileIds.length} selecionado{editProfileIds.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                              {profiles.filter(p => localCanManageRole(currentRole, roleFromProfileName(p.name) || 'viewer')).map(p => {
                                const selected = editProfileIds.includes(p.id)
                                return (
                                  <label key={p.id}
                                    className={cn('flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                                      selected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'
                                    )}>
                                    <input type="checkbox" checked={selected}
                                      onChange={() => toggleEditProfile(p.id)}
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                                      {p.description && <p className="text-xs text-slate-500 truncate">{p.description}</p>}
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-medium text-slate-600">Portais de acesso</label>
                              <span className="text-[10px] text-slate-400">Pode marcar os dois</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {PORTAL_OPTIONS.map(portal => {
                                const selected = editAllowedHubs.includes(portal.id)
                                return (
                                  <label key={portal.id}
                                    className={cn('flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                                      selected ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'
                                    )}>
                                    <input type="checkbox" checked={selected}
                                      onChange={() => toggleEditAllowedHub(portal.id)}
                                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                                    <div>
                                      <p className="text-sm font-medium text-slate-800">{portal.label}</p>
                                      <p className="text-xs text-slate-500">{portal.description}</p>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button onClick={() => setActionMode('menu')}
                              className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                              Voltar
                            </button>
                            <button onClick={saveUserAccess} disabled={actionLoading}
                              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors disabled:opacity-60">
                              {actionLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</> : 'Salvar perfil'}
                            </button>
                          </div>
                        </div>
                      )}

                      {actionMode === 'convite' && (
                        <div className="space-y-4">
                          {actionLoading && <p className="text-xs text-slate-400 animate-pulse">Gerando novo convite...</p>}
                          {resendInviteUrl && (
                            <div>
                              <p className="text-xs font-medium text-slate-600 mb-1.5">Link do convite</p>
                              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                <p className="flex-1 text-xs text-slate-600 truncate font-mono">{resendInviteUrl}</p>
                                <button onClick={() => copyToClipboard(resendInviteUrl, 'user-invite')}
                                  className="shrink-0 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                                  {invCopied === 'user-invite' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                  {invCopied === 'user-invite' ? 'Copiado!' : 'Copiar'}
                                </button>
                              </div>
                            </div>
                          )}
                          <button onClick={() => setActionMode('menu')}
                            className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                            Voltar
                          </button>
                        </div>
                      )}

                      {actionMode === 'senha' && (
                        <div className="space-y-4">
                          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
                            Isso gera uma senha temporária e ativa a obrigação de troca no próximo acesso.
                          </div>
                          {resetTempPassword && (
                            <div>
                              <p className="text-xs font-medium text-slate-600 mb-1.5">Senha temporária</p>
                              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                                <p className="flex-1 text-sm font-mono font-bold text-slate-800 tracking-widest">{resetTempPassword}</p>
                                <button onClick={() => copyToClipboard(resetTempPassword, 'reset-pw')}
                                  className="shrink-0 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                                  {invCopied === 'reset-pw' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                  {invCopied === 'reset-pw' ? 'Copiado!' : 'Copiar'}
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => setActionMode('menu')}
                              className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                              Voltar
                            </button>
                            <button onClick={resetUserPassword} disabled={actionLoading}
                              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-[#1e3a5f] hover:bg-[#162d4a] rounded-lg transition-colors disabled:opacity-60">
                              {actionLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando…</> : 'Gerar senha temporária'}
                            </button>
                          </div>
                        </div>
                      )}

                      {actionMode === 'excluir' && (
                        <div className="space-y-4">
                          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
                            O usuário será inativado. O histórico de lançamentos e ações será mantido.
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setActionMode('menu')}
                              className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                              Cancelar
                            </button>
                            <button onClick={deactivateUser} disabled={actionLoading || !actionUser.active}
                              className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60">
                              {actionLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Inativando…</> : actionUser.active ? 'Inativar usuário' : 'Usuário já está inativo'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Permissoes — SIMPLE READ/WRITE TOGGLES ── */}
          {/* ── Perfis ── */}
          {tab === 'perfis' && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Perfis de acesso</p>
                  <p className="text-xs text-slate-500 mt-0.5">Crie perfis com permissões específicas e vincule a usuários</p>
                </div>
                <button onClick={openNewProfile}
                  className="flex items-center gap-2 text-sm font-medium text-white bg-[#1e3a5f] hover:bg-[#162d4a] px-4 py-2 rounded-lg transition-colors">
                  <Plus className="w-4 h-4" /> Novo perfil
                </button>
              </div>

              {profilesLoading ? (
                <p className="text-xs text-slate-400 animate-pulse py-6 text-center">Carregando perfis...</p>
              ) : profiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                  <Layers className="w-8 h-8 text-slate-200" />
                  <p className="text-sm">Nenhum perfil criado ainda</p>
                  <button onClick={openNewProfile} className="text-xs text-blue-600 hover:underline">Criar primeiro perfil</button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {profiles.map(p => (
                    <div key={p.id} className="bg-white rounded-xl border border-slate-100 shadow-card p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                        style={{ background: p.color + '22', border: `2px solid ${p.color}44` }}>
                        <div className="w-4 h-4 rounded-full" style={{ background: p.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                        {p.description && <p className="text-xs text-slate-500 truncate">{p.description}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {Object.values(p.permissions ?? {}).filter((v): v is ModulePerms => Boolean((v as ModulePerms).read)).length} módulos com acesso
                          {p.user_count ? ` · ${p.user_count} usuario(s)` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditProfile(p)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteProfile(p.id)} disabled={deletingId === p.id}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                          {deletingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Modal de criação/edição de perfil ── */}
              {showProfileForm && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-base font-bold text-slate-800">
                          {editingProfile ? `Editar perfil: ${editingProfile.name}` : 'Novo perfil'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Defina um nome e as permissões deste perfil</p>
                      </div>
                      <button onClick={() => setShowProfileForm(false)} className="p-2 text-slate-400 hover:text-slate-600">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
                      {/* Nome e descrição */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">Nome do perfil *</label>
                          <input value={pfName} onChange={e => setPfName(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            placeholder="Ex: Financeiro, Corretor, Controladoria" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-600">Descrição</label>
                          <input value={pfDesc} onChange={e => setPfDesc(e.target.value)}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                            placeholder="Breve descrição do perfil" />
                        </div>
                      </div>

                      {/* Cor */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">Cor do perfil</label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {PROFILE_COLORS.map(c => (
                            <button key={c} onClick={() => setPfColor(c)}
                              className={cn('w-7 h-7 rounded-full transition-transform', pfColor === c && 'ring-2 ring-offset-2 ring-slate-400 scale-110')}
                              style={{ background: c }} />
                          ))}
                          <input type="color" value={pfColor} onChange={e => setPfColor(e.target.value)}
                            className="w-7 h-7 rounded-full cursor-pointer border-0 p-0" title="Cor personalizada" />
                        </div>
                      </div>

                      {/* Matriz de permissões */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">Permissões por módulo</label>
                        {/* Selecionar tudo */}
                      <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => {
                          const allRead = allModIds.every(id => pfPerms[id]?.read)
                          setPfPerms(Object.fromEntries(allModIds.map(id =>
                            [id, allRead ? { read: false, write: false } : { read: true, write: true }]
                          )))
                        }}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {allModIds.every(id => pfPerms[id]?.read) ? 'Remover todas' : 'Selecionar todas'}
                        </button>
                        <button onClick={() => {
                          const allWrite = allModIds.every(id => pfPerms[id]?.write)
                          setPfPerms(prev => Object.fromEntries(allModIds.map(id =>
                            [id, allWrite ? { ...prev[id], write: false } : { read: true, write: true }]
                          )))
                        }}
                          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                          {allModIds.every(id => pfPerms[id]?.write) ? 'Remover escrita total' : 'Escrita em tudo'}
                        </button>
                      </div>

                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                          <div className="grid grid-cols-[1fr_80px_80px] bg-slate-50 border-b border-slate-100 px-4 py-2.5">
                            <span className="text-xs font-semibold text-slate-500 uppercase">Módulo</span>
                            <span className="text-xs font-semibold text-slate-500 text-center">Leitura</span>
                            <span className="text-xs font-semibold text-slate-500 text-center">Escrita</span>
                          </div>
                          {MODULE_GROUPS.map(g => (
                            <div key={g.group}>
                              <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{g.group}</p>
                                <div className="flex items-center gap-3">
                                  <button onClick={() => {
                                    const mods = g.modules.map(m => m.id)
                                    const allRead = mods.every(id => pfPerms[id]?.read)
                                    setPfPerms(prev => ({
                                      ...prev,
                                      ...Object.fromEntries(mods.map(id => [id, allRead
                                        ? { read: false, write: false }
                                        : { read: true, write: prev[id]?.write ?? false }]))
                                    }))
                                  }} className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors">
                                    {g.modules.every(m => pfPerms[m.id]?.read) ? '− leitura' : '+ leitura'}
                                  </button>
                                  <button onClick={() => {
                                    const mods = g.modules.map(m => m.id)
                                    const allWrite = mods.every(id => pfPerms[id]?.write)
                                    setPfPerms(prev => ({
                                      ...prev,
                                      ...Object.fromEntries(mods.map(id => [id, allWrite
                                        ? { ...prev[id], write: false }
                                        : { read: true, write: true }]))
                                    }))
                                  }} className="text-[10px] text-slate-400 hover:text-emerald-600 transition-colors">
                                    {g.modules.every(m => pfPerms[m.id]?.write) ? '− escrita' : '+ escrita'}
                                  </button>
                                </div>
                              </div>
                              {g.modules.map(mod => {
                                const mp = pfPerms[mod.id] ?? { read: false, write: false }
                                return (
                                  <div key={mod.id}
                                    className="grid grid-cols-[1fr_80px_80px] px-4 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/40 transition-colors items-center">
                                    <span className="text-sm text-slate-800">{mod.label}</span>
                                    <div className="flex justify-center">
                                      <button onClick={() => togglePfPerm(mod.id, 'read')}
                                        className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                          mp.read ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-300 hover:bg-slate-200')}>
                                        {mp.read ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                      </button>
                                    </div>
                                    <div className="flex justify-center">
                                      <button onClick={() => togglePfPerm(mod.id, 'write')} disabled={!mp.read}
                                        className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                          mp.write ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300 hover:bg-slate-200',
                                          !mp.read && 'opacity-40 cursor-not-allowed')}>
                                        {mp.write ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300" />}
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                      <button onClick={() => setShowProfileForm(false)}
                        className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={saveProfile} disabled={!pfName.trim() || profileSaving}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-50 rounded-lg transition-colors">
                        {profileSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Check className="w-4 h-4" /> Salvar perfil</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'permissoes' && (
            <>
              {/* User picker */}
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card">
                <p className="text-xs font-semibold text-slate-500 mb-3">Selecione o usuario:</p>
                <div className="flex gap-2 flex-wrap">
                  {usersLoading
                    ? <p className="text-xs text-slate-400 animate-pulse">Carregando usuários...</p>
                    : users.filter(canManageUserRow).map(u => (
                    <button key={u.id}
                      onClick={() => { setSelectedUser(u); loadUserProfiles(u.id) }}
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
                  {/* Header do usuário */}
                  <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 p-4 shadow-card">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-700 text-sm font-semibold">
                        {selectedUser.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{selectedUser.name}</p>
                      <p className="text-xs text-slate-500">{selectedUser.email}</p>
                    </div>
                    <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', ROLE_COLORS[selectedUser.role])}>
                      {ROLE_LABELS[selectedUser.role]}
                    </span>
                  </div>

                  {/* Perfis vinculados */}
                  <div className="bg-white rounded-xl border border-slate-100 shadow-card p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                      Perfis de acesso vinculados
                    </p>
                    {profilesLoading ? (
                      <p className="text-xs text-slate-400 animate-pulse">Carregando perfis...</p>
                    ) : profiles.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhum perfil cadastrado. Crie perfis na aba <strong>Perfis</strong>.</p>
                    ) : (
                      <div className="space-y-2">
                        {profiles.filter(p => localCanManageRole(currentRole, roleFromProfileName(p.name) || 'viewer')).map(p => {
                          const active = (userProfiles[selectedUser.id] ?? []).includes(p.id)
                          return (
                            <label key={p.id}
                              className={cn(
                                'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                                active ? 'border-blue-200 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'
                              )}>
                              <input type="checkbox" checked={active}
                                onChange={() => toggleUserProfile(selectedUser.id, p.id)}
                                disabled={togglingProfile === p.id}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: p.color }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800">{p.name}</p>
                                {p.description && <p className="text-xs text-slate-500 truncate">{p.description}</p>}
                              </div>
                              {togglingProfile === p.id && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Preview das permissões combinadas */}
                  {(userProfiles[selectedUser.id]?.length ?? 0) > 0 && (() => {
                    const activeProfiles = profiles.filter(p => (userProfiles[selectedUser.id] ?? []).includes(p.id))
                    const merged: Record<string, ModulePerms> = {}
                    for (const mod of allModIds) {
                      merged[mod] = {
                        read:  activeProfiles.some(p => p.permissions?.[mod]?.read),
                        write: activeProfiles.some(p => p.permissions?.[mod]?.write),
                      }
                    }
                    return (
                      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                          <Tags className="w-4 h-4 text-slate-400" />
                          <p className="text-xs font-semibold text-slate-600">
                            Permissões combinadas dos perfis ativos
                          </p>
                        </div>
                        <div className="grid grid-cols-[1fr_80px_80px] bg-slate-50 border-b border-slate-100 px-4 py-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase">Módulo</span>
                          <span className="text-xs font-semibold text-slate-500 text-center">Leitura</span>
                          <span className="text-xs font-semibold text-slate-500 text-center">Escrita</span>
                        </div>
                        {MODULE_GROUPS.map(g => (
                          <div key={g.group}>
                            <div className="px-4 py-1.5 bg-slate-50/60 border-b border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{g.group}</p>
                            </div>
                            {g.modules.map(mod => {
                              const mp = merged[mod.id]
                              return (
                                <div key={mod.id}
                                  className="grid grid-cols-[1fr_80px_80px] px-4 py-2 border-b border-slate-50 last:border-0 items-center">
                                  <span className="text-sm text-slate-700">{mod.label}</span>
                                  <div className="flex justify-center">
                                    <div className={cn('w-6 h-6 rounded-md flex items-center justify-center',
                                      mp.read ? 'bg-blue-100' : 'bg-slate-100')}>
                                      {mp.read
                                        ? <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                                        : <div className="w-3 h-3 rounded-full border-2 border-slate-300" />}
                                    </div>
                                  </div>
                                  <div className="flex justify-center">
                                    <div className={cn('w-6 h-6 rounded-md flex items-center justify-center',
                                      mp.write ? 'bg-emerald-100' : 'bg-slate-100')}>
                                      {mp.write
                                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                        : <div className="w-3 h-3 rounded-full border-2 border-slate-300" />}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
                  <Shield className="w-8 h-8 text-slate-200" />
                  <p className="text-sm">Selecione um usuario acima para vincular perfis</p>
                </div>
              )}
            </>
          )}

          {/* ── Permissões de Convite ── */}
          {tab === 'convites_perm' && isAdminUser && (
            <>
              <Section title="Permissões de convite" sub="Defina quais tipos de usuário cada perfil pode convidar">
                {invitePermLoading ? (
                  <p className="text-xs text-slate-400 animate-pulse">Carregando permissões...</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[760px]">
                      <div className="grid gap-2" style={{ gridTemplateColumns: `160px repeat(${ROLE_OPTIONS.length}, minmax(88px, 1fr))` }}>
                        <div className="text-[10px] font-semibold text-slate-400 uppercase px-2 py-2">Quem convida</div>
                        {ROLE_OPTIONS.map(r => (
                          <div key={r.id} className="text-[10px] font-semibold text-slate-500 text-center px-1 py-2 truncate" title={r.label}>{r.label}</div>
                        ))}
                        {ROLE_OPTIONS.map(inviter => (
                          <div key={inviter.id} className="contents">
                            <div className="text-xs font-semibold text-slate-700 px-2 py-2 rounded-lg bg-slate-50">{inviter.label}</div>
                            {ROLE_OPTIONS.map(target => {
                              const checked = (inviteMatrix[inviter.id] || []).includes(target.id)
                              const blockedByHierarchy = !localCanInviteHierarchy(inviter.id, target.id)
                              return (
                                <button key={`${inviter.id}-${target.id}`}
                                  disabled={blockedByHierarchy || !invitePermEditable}
                                  onClick={() => toggleInviteMatrixRole(inviter.id, target.id)}
                                  className={cn(
                                    'h-8 rounded-lg border text-xs flex items-center justify-center transition-colors',
                                    checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-300',
                                    blockedByHierarchy && 'bg-slate-50 text-slate-200 cursor-not-allowed',
                                    !blockedByHierarchy && invitePermEditable && 'hover:border-blue-300'
                                  )}
                                  title={blockedByHierarchy ? 'Bloqueado pela hierarquia' : `${inviter.label} pode convidar ${target.label}`}>
                                  {checked ? <Check className="w-3.5 h-3.5" /> : '—'}
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500">Exemplo: Marketing pode convidar Marketing, Corretor, Fornecedor e Cliente, sem subir permissões.</p>
                  <button onClick={saveInvitePermissions} disabled={invitePermSaving || !invitePermEditable}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#1e3a5f] text-white hover:bg-[#162d4a] disabled:opacity-50">
                    {invitePermSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salvar permissões
                  </button>
                </div>
              </Section>
            </>
          )}

          {/* ── Logs ── */}
          {tab === 'logs' && isAdminUser && (
            <>
              <Section title="Retenção dos logs" sub="Somente administradores podem alterar este período">
                <Field label="Período de retenção" sub="Padrão inicial: 30 dias">
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={3650} value={auditRetentionDays}
                      onChange={e => setAuditRetentionDays(Number(e.target.value || 30))}
                      className="w-32" />
                    <span className="text-sm text-slate-500">dias</span>
                    <button onClick={saveAuditSettings} disabled={auditSaving}
                      className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#1e3a5f] text-white hover:bg-[#162d4a] disabled:opacity-50">
                      {auditSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Salvar retenção
                    </button>
                  </div>
                </Field>
              </Section>

              <Section title="Log de ações" sub="Login, logout e alterações do sistema">
                <div className="grid grid-cols-6 gap-2">
                  <select value={auditFilters.user_id} onChange={e => setAuditFilters(v => ({ ...v, user_id: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white">
                    <option value="">Todos usuários</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select value={auditFilters.module} onChange={e => setAuditFilters(v => ({ ...v, module: e.target.value }))}
                    className="border border-slate-200 rounded-lg px-2 py-2 text-xs bg-white">
                    <option value="">Todos módulos</option>
                    {auditModules.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <Input value={auditFilters.action} onChange={e => setAuditFilters(v => ({ ...v, action: e.target.value }))} placeholder="Ação" className="text-xs" />
                  <Input type="date" value={auditFilters.date_from} onChange={e => setAuditFilters(v => ({ ...v, date_from: e.target.value }))} className="text-xs" />
                  <Input type="date" value={auditFilters.date_to} onChange={e => setAuditFilters(v => ({ ...v, date_to: e.target.value }))} className="text-xs" />
                  <button onClick={loadAuditLogs} disabled={auditLoading}
                    className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                    {auditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Filtrar
                  </button>
                </div>
                <div className="mt-2">
                  <Input value={auditFilters.q} onChange={e => setAuditFilters(v => ({ ...v, q: e.target.value }))} placeholder="Buscar por usuário, e-mail, ação ou detalhe..." className="text-xs" />
                </div>

                <div className="overflow-x-auto border border-slate-100 rounded-xl mt-4">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Data</th>
                        <th className="text-left px-3 py-2 font-semibold">Usuário</th>
                        <th className="text-left px-3 py-2 font-semibold">Módulo</th>
                        <th className="text-left px-3 py-2 font-semibold">Ação</th>
                        <th className="text-left px-3 py-2 font-semibold">IP</th>
                        <th className="text-left px-3 py-2 font-semibold">Detalhes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLoading ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Carregando logs...</td></tr>
                      ) : auditLogs.length === 0 ? (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Nenhum log encontrado</td></tr>
                      ) : auditLogs.map(log => (
                        <tr key={log.id} className="border-t border-slate-50 align-top">
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatDateTimeBR(log.created_at)}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-700">{log.user_name || 'Sistema'}</p>
                            {log.user_email && <p className="text-[10px] text-slate-400">{log.user_email}</p>}
                          </td>
                          <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{log.module || 'sistema'}</span></td>
                          <td className="px-3 py-2 font-medium text-slate-700">{log.action}</td>
                          <td className="px-3 py-2 text-slate-500">{log.ip || '—'}</td>
                          <td className="px-3 py-2 max-w-[260px]">
                            <pre className="text-[10px] text-slate-500 whitespace-pre-wrap break-words bg-slate-50 rounded-lg p-2 max-h-24 overflow-auto">{JSON.stringify(log.details || {}, null, 2)}</pre>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>
          )}

          {/* ── Sobre o sistema ── */}
          {tab === 'sobre' && (
            <>
              <Section title="Sobre o sistema" sub="Arquitetura básica, versão atual e histórico de alterações">
                {systemLoading && !systemAbout ? (
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando informações do sistema...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                          <GitBranch className="w-4 h-4" /> Versão atual
                        </div>
                        <p className="text-2xl font-bold text-slate-900 mt-2">v{systemAbout?.version || '0.0.1'}</p>
                        <p className="text-xs text-slate-500 mt-1">{systemAbout?.released_at ? formatDateTimeBR(systemAbout.released_at) : 'Controle inicial'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                          <Code2 className="w-4 h-4" /> Front-end
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-2">{systemAbout?.frontend.framework || 'Next.js'}</p>
                        <p className="text-xs text-slate-500 mt-1">{systemAbout?.frontend.language || 'TypeScript / React'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Versão: {systemAbout?.frontend.version || '0.0.1'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                          <Server className="w-4 h-4" /> Backend
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-2">{systemAbout?.backend.framework || 'Express.js'}</p>
                        <p className="text-xs text-slate-500 mt-1">{systemAbout?.backend.runtime || 'Node.js'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Versão: {systemAbout?.backend.version || '0.0.1'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-100 bg-white p-4">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
                          <Database className="w-4 h-4" /> Banco
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-2">{systemAbout?.database.engine || 'PostgreSQL'}</p>
                        <p className="text-xs text-slate-500 mt-1">Multi-tenant, permissões, auditoria e financeiro</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-100 p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Camadas principais</p>
                        <div className="space-y-2 text-sm text-slate-600">
                          <p><strong className="text-slate-800">UI:</strong> Next.js App Router, React, TailwindCSS e Zustand.</p>
                          <p><strong className="text-slate-800">API:</strong> Node.js com Express, JWT, rotas REST e logs de auditoria.</p>
                          <p><strong className="text-slate-800">Banco:</strong> PostgreSQL com tabelas por domínio funcional.</p>
                          <p><strong className="text-slate-800">E-mail:</strong> AWS SES para convites, reset de senha e comunicações transacionais.</p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-100 p-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Tabelas/módulos monitorados</p>
                        <div className="flex flex-wrap gap-2">
                          {(systemAbout?.database.main_tables || ['hub_users', 'hub_profiles', 'hub_audit_logs', 'hub_invites', 'fin_plano_contas']).map(item => (
                            <span key={item} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">{item}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Changelog" sub="Histórico versionado das alterações do sistema">
                <div className="space-y-3">
                  {(systemAbout?.releases || []).length === 0 ? (
                    <p className="text-sm text-slate-400">Nenhuma versão cadastrada ainda.</p>
                  ) : (systemAbout?.releases || []).map(release => (
                    <div key={release.version} className="rounded-xl border border-slate-100 p-4 bg-white">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">v{release.version}</span>
                            <p className="font-semibold text-slate-900 text-sm">{release.title}</p>
                          </div>
                          {release.description && <p className="text-xs text-slate-500 mt-1">{release.description}</p>}
                        </div>
                        {release.released_at && (
                          <div className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap">
                            <CalendarDays className="w-3.5 h-3.5" /> {formatDateTimeBR(release.released_at)}
                          </div>
                        )}
                      </div>
                      {!!release.changes?.length && (
                        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
                          {release.changes.map((change, idx) => (
                            <li key={`${release.version}-${idx}`} className="flex gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            </>
          )}

          {/* ── CRM Integrations ── */}
          {tab === 'crm_integ' && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
                <strong>Estrategia de CRM:</strong> o LoteMobile cria e qualifica os leads, envia para o CRM externo via API e usa as automacoes nativas de cada plataforma. Voce escolhe a ferramenta que o cliente ja usa ou prefere.
                <div className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-blue-900">
                  O CRM do sistema <strong>nao dispara e-mails de marketing</strong>. Esse fluxo fica no FluentCRM, RD Station ou HubSpot. Aqui estamos preparando a camada de <strong>SMS via AWS SNS</strong> e os repasses de lead.
                </div>
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
                <Field label="API Key">
                  <SecretInput value={creds.googleMapsKey} onChange={v => setCreds(c => ({ ...c, googleMapsKey: v }))} placeholder="AIza..." />
                </Field>
              </Section>

              <Section title="AWS SNS / SMS" sub="Envio de SMS para leads direto do painel">
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  O envio de mensagens do CRM fica concentrado em <strong>SMS via AWS SNS</strong>. Os fluxos de e-mail continuam no FluentCRM, RD Station ou HubSpot.
                </div>
                <Field label="Modo demonstracao" sub="Mantem o fluxo em mock para validacao visual com o cliente">
                  <label className="inline-flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 cursor-pointer">
                    <input type="checkbox" checked={Boolean(creds.snsMockMode)}
                      onChange={e => setCreds(c => ({ ...c, snsMockMode: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-800">Usar envio mockado</p>
                      <p className="text-xs text-slate-500">Desative somente quando as credenciais e a conta SNS estiverem prontas.</p>
                    </div>
                  </label>
                </Field>
                <Field label="Regiao">
                  <select value={creds.snsRegion} onChange={e => setCreds(c => ({ ...c, snsRegion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="sa-east-1">sa-east-1 (Sao Paulo)</option>
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="us-east-2">us-east-2 (Ohio)</option>
                    <option value="us-west-2">us-west-2 (Oregon)</option>
                  </select>
                </Field>
                <Field label="Access Key ID">
                  <SecretInput value={creds.snsAccessKeyId} onChange={v => setCreds(c => ({ ...c, snsAccessKeyId: v }))} placeholder="AKIA..." />
                </Field>
                <Field label="Secret Access Key">
                  <SecretInput value={creds.snsSecretAccessKey} onChange={v => setCreds(c => ({ ...c, snsSecretAccessKey: v }))} />
                </Field>
                <Field label="Sender ID" sub="Nome exibido quando o pais e a operadora suportam sender ID">
                  <Input value={creds.snsSenderId}
                    onChange={e => setCreds(c => ({ ...c, snsSenderId: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11) }))}
                    placeholder="LOTEAMENTO" maxLength={11} />
                </Field>
                <Field label="Tipo padrao">
                  <select value={creds.snsSMSType} onChange={e => setCreds(c => ({ ...c, snsSMSType: e.target.value as 'Transactional' | 'Promotional' }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="Transactional">Transactional</option>
                    <option value="Promotional">Promotional</option>
                  </select>
                </Field>
              </Section>

              <Section title="AWS SES" sub="E-mails transacionais do sistema — configuracao unica para todo o sistema">
                <Field label="Regiao">
                  <select value={creds.sesRegion} onChange={e => setCreds(c => ({ ...c, sesRegion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="us-east-2">us-east-2 (Ohio)</option>
                    <option value="us-west-2">us-west-2 (Oregon)</option>
                    <option value="sa-east-1">sa-east-1 (Sao Paulo)</option>
                    <option value="eu-west-1">eu-west-1 (Irlanda)</option>
                  </select>
                </Field>
                <Field label="Access Key ID"><SecretInput value={creds.sesAccessKeyId} onChange={v => setCreds(c => ({ ...c, sesAccessKeyId: v }))} placeholder="AKIA..." /></Field>
                <Field label="Secret Access Key"><SecretInput value={creds.sesSecretAccessKey} onChange={v => setCreds(c => ({ ...c, sesSecretAccessKey: v }))} /></Field>
                <Field label="E-mail remetente"><Input value={creds.sesFromEmail} onChange={e => setCreds(c => ({ ...c, sesFromEmail: e.target.value }))} placeholder="noreply@suaempresa.com.br" /></Field>
                <Field label="Nome remetente"><Input value={creds.sesFromName} onChange={e => setCreds(c => ({ ...c, sesFromName: e.target.value }))} placeholder="Residencial Santa Clara" /></Field>
                {/* ── Testar envio ── */}
                <div className="border-t border-slate-100 pt-4 mt-2">
                  {!sesTestOpen ? (
                    <button onClick={() => { setSesTestEmail(''); setSesTestStatus(null); setSesTestOpen(true) }}
                      className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors">
                      <Send className="w-3.5 h-3.5" /> Testar envio de e-mail
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-slate-600">Enviar e-mail de teste</p>
                      <div className="flex gap-2">
                        <Input type="email" placeholder="seu@email.com" value={sesTestEmail}
                          onChange={e => setSesTestEmail(e.target.value)} className="flex-1" />
                        <button onClick={sendSesTest} disabled={sesTestLoading || !sesTestEmail.trim()}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
                          {sesTestLoading
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                            : <><Send className="w-3.5 h-3.5" /> Enviar</>}
                        </button>
                        <button onClick={() => setSesTestOpen(false)} className="p-2 text-slate-400 hover:text-slate-600">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {sesTestStatus && (
                        <div className={cn('flex items-center gap-2 text-xs px-3 py-2 rounded-lg',
                          sesTestStatus.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                          {sesTestStatus.ok
                            ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                          {sesTestStatus.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Section>

              <Section title="Inteligência Artificial" sub="Chave de API para o assistente IA do painel">
                <Field label="Provedor">
                  <div className="flex gap-3">
                    {(['openai', 'gemini'] as const).map(p => (
                      <label key={p}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer text-sm font-medium transition-colors flex-1 justify-center',
                          creds.aiProvider === p
                            ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}>
                        <input type="radio" className="hidden"
                          checked={creds.aiProvider === p}
                          onChange={() => setCreds(c => ({ ...c, aiProvider: p }))} />
                        {p === 'openai' ? '🤖 OpenAI (GPT)' : '✨ Google Gemini'}
                      </label>
                    ))}
                  </div>
                </Field>
                {creds.aiProvider === 'openai' && (
                  <Field label="OpenAI API Key">
                    <SecretInput
                      value={creds.openaiApiKey}
                      onChange={v => setCreds(c => ({ ...c, openaiApiKey: v }))}
                      placeholder="sk-..." />
                  </Field>
                )}
                {creds.aiProvider === 'gemini' && (
                  <Field label="Gemini API Key">
                    <SecretInput
                      value={creds.geminiApiKey}
                      onChange={v => setCreds(c => ({ ...c, geminiApiKey: v }))}
                      placeholder="AIza..." />
                  </Field>
                )}
                <div className="rounded-xl border border-blue-50 bg-blue-50/50 px-4 py-3 text-xs text-slate-500 leading-relaxed">
                  Usada pelo <strong>Chat IA</strong> do painel. Obtenha sua chave em{' '}
                  {creds.aiProvider === 'openai'
                    ? <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">platform.openai.com</a>
                    : <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">aistudio.google.com</a>
                  }.
                </div>
              </Section>

              <Section title="WhatsApp Business API" sub="Configurado por conta — cada cliente usa seu proprio numero">
                <Field label="Token"><SecretInput value={creds.whatsappToken} onChange={v => setCreds(c => ({ ...c, whatsappToken: v }))} placeholder="EAAx..." /></Field>
                <Field label="Phone Number ID"><Input value={creds.whatsappPhoneId} onChange={e => setCreds(c => ({ ...c, whatsappPhoneId: e.target.value }))} /></Field>
                <Field label="Business Account ID"><Input value={creds.whatsappBusinessId} onChange={e => setCreds(c => ({ ...c, whatsappBusinessId: e.target.value }))} /></Field>
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
