'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Save, Upload, Palette, Globe, Mail, Users, Bell,
  CreditCard, Shield, Key, MapPin, MessageCircle,
  FileSignature, Building2, Plus, Pencil, Trash2,
  Check, X, Eye, EyeOff, ChevronDown, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenantConfig } from '@/lib/tenant-config-store'
import { mockTenant } from '@/lib/mock-data'
import {
  MODULES, DEFAULT_ROLES, MOCK_TENANT_USERS,
  EMPTY_CREDENTIALS, resolvePermission,
  type TenantUser, type RoleId, type ModuleId, type PermLevel,
} from '@/lib/permissions'

// ─── Types ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'identidade',   label: 'Identidade visual', icon: Palette },
  { id: 'dominio',      label: 'Dominio',            icon: Globe },
  { id: 'credenciais',  label: 'Credenciais',        icon: Key },
  { id: 'usuarios',     label: 'Usuarios',           icon: Users },
  { id: 'permissoes',   label: 'Permissoes',         icon: Shield },
  { id: 'email',        label: 'E-mail (SES)',        icon: Mail },
  { id: 'notificacoes', label: 'Notificacoes',       icon: Bell },
  { id: 'plano',        label: 'Plano',              icon: CreditCard },
]

const PERM_LEVELS: { id: PermLevel; label: string; color: string }[] = [
  { id: 'none',  label: 'Sem acesso',   color: 'bg-slate-100 text-slate-500' },
  { id: 'read',  label: 'Leitura',      color: 'bg-blue-100 text-blue-700' },
  { id: 'write', label: 'Gravacao',     color: 'bg-amber-100 text-amber-700' },
  { id: 'full',  label: 'Total',        color: 'bg-emerald-100 text-emerald-700' },
]

const COLOR_PRESETS = [
  { name: 'Azul', primary: '#2563EB', sidebar: '#0D1B2A' },
  { name: 'Verde', primary: '#059669', sidebar: '#052e16' },
  { name: 'Roxo', primary: '#7C3AED', sidebar: '#1e1b4b' },
  { name: 'Laranja', primary: '#EA580C', sidebar: '#1c0a00' },
  { name: 'Cinza', primary: '#374151', sidebar: '#111827' },
]

// ─── Small helpers ────────────────────────────────────────────────────────────

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
      'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900',
      'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400',
      'placeholder:text-slate-400 transition-colors', props.className
    )} />
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Insira a chave...'}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors font-mono"
      />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

// ─── Perm level picker ────────────────────────────────────────────────────────

function PermPicker({ value, onChange }: { value: PermLevel; onChange: (v: PermLevel) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = PERM_LEVELS.find(p => p.id === value)!
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-transparent cursor-pointer transition-colors', cfg.color)}>
        {cfg.label}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-dialog border border-slate-100 py-1 z-20 min-w-[130px]">
          {PERM_LEVELS.map(p => (
            <button key={p.id} onClick={() => { onChange(p.id); setOpen(false) }}
              className={cn('w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-slate-50',
                p.id === value ? 'font-semibold' : 'text-slate-700'
              )}>
              <span className={cn('px-2 py-0.5 rounded-full', p.color)}>{p.label}</span>
              {p.id === value && <Check className="w-3 h-3 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConfiguracoesPage() {
  const [tab, setTab]         = useState('identidade')
  const [theme, setTheme]     = useState(mockTenant.theme)
  const [saved, setSaved]     = useState(false)
  const storedConfig = useTenantConfig(s => s.config)
  const [creds, setCreds] = useState({
    ...EMPTY_CREDENTIALS,
    googleMapsKey:      storedConfig.googleMapsKey,
    sesAccessKeyId:     storedConfig.sesAccessKeyId,
    sesSecretAccessKey: storedConfig.sesSecretAccessKey,
    sesRegion:          storedConfig.sesRegion,
    sesFromEmail:       storedConfig.sesFromEmail,
    sesFromName:        storedConfig.sesFromName,
    whatsappToken:      storedConfig.whatsappToken,
    whatsappPhoneId:    storedConfig.whatsappPhoneId,
    whatsappBusinessId: storedConfig.whatsappBusinessId,
    clicksignKey:       storedConfig.clicksignKey,
    bankName:           storedConfig.bankName,
    bankApiKey:         storedConfig.bankApiKey,
  })
  const [users, setUsers]     = useState<TenantUser[]>(MOCK_TENANT_USERS)
  const [editUser, setEditUser] = useState<TenantUser | null>(null)
  // Per-user permission overrides (local state — persisted to API in real app)
  const [overrides, setOverrides] = useState<Record<string, Partial<Record<ModuleId, PermLevel>>>>(
    Object.fromEntries(MOCK_TENANT_USERS.map(u => [u.id, u.permissionOverrides ?? {}]))
  )

  const setTenantConfig = useTenantConfig(s => s.setConfig)

  function save() {
    setTenantConfig({
      googleMapsKey:      creds.googleMapsKey,
      sesAccessKeyId:     creds.sesAccessKeyId,
      sesSecretAccessKey: creds.sesSecretAccessKey,
      sesRegion:          creds.sesRegion,
      sesFromEmail:       creds.sesFromEmail,
      sesFromName:        creds.sesFromName,
      whatsappToken:      creds.whatsappToken,
      whatsappPhoneId:    creds.whatsappPhoneId,
      whatsappBusinessId: creds.whatsappBusinessId,
      clicksignKey:       creds.clicksignKey,
      bankName:           creds.bankName,
      bankApiKey:         creds.bankApiKey,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function setOverride(userId: string, moduleId: ModuleId, level: PermLevel) {
    setOverrides(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [moduleId]: level },
    }))
  }

  const groups = [...new Set(MODULES.map(m => m.group))]

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
        {/* Sidebar */}
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

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── Identidade visual ── */}
          {tab === 'identidade' && (
            <>
              <Section title="Preview em tempo real">
                <div className="flex rounded-xl overflow-hidden border border-slate-200 h-24">
                  <div className="w-40 flex flex-col justify-between p-3" style={{ background: theme.sidebarColor }}>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: theme.primaryColor }}>
                        <MapPin className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-white text-xs font-semibold truncate">{theme.logoText}</span>
                    </div>
                    <div className="space-y-1">
                      {['Dashboard','Empreendimentos','CRM'].map(item => (
                        <div key={item} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(255,255,255,0.15)' }} />
                          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex-1 p-3 bg-slate-50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full" />
                      <div className="w-12 h-4 rounded" style={{ background: theme.primaryColor }} />
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded border border-slate-200 h-8" />
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Marca" sub="Nome e logotipo">
                <Field label="Nome da plataforma">
                  <Input value={theme.logoText} onChange={e => setTheme(t => ({ ...t, logoText: e.target.value }))} />
                </Field>
                <Field label="Logotipo" sub="PNG/SVG, max 2MB">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-slate-50">
                      <Upload className="w-5 h-5 text-slate-400" />
                    </div>
                    <button className="text-sm text-blue-600 hover:underline">Fazer upload</button>
                  </div>
                </Field>
              </Section>

              <Section title="Cores">
                <Field label="Presets">
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(preset => (
                      <button key={preset.name}
                        onClick={() => setTheme(t => ({ ...t, primaryColor: preset.primary, sidebarColor: preset.sidebar }))}
                        className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors',
                          theme.primaryColor === preset.primary
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}>
                        <span className="w-3.5 h-3.5 rounded-full" style={{ background: preset.primary }} />
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Cor primaria">
                  <div className="flex items-center gap-2">
                    <input type="color" value={theme.primaryColor} onChange={e => setTheme(t => ({ ...t, primaryColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <Input value={theme.primaryColor} onChange={e => setTheme(t => ({ ...t, primaryColor: e.target.value }))} className="w-32 font-mono text-xs" />
                  </div>
                </Field>
                <Field label="Cor do sidebar">
                  <div className="flex items-center gap-2">
                    <input type="color" value={theme.sidebarColor} onChange={e => setTheme(t => ({ ...t, sidebarColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <Input value={theme.sidebarColor} onChange={e => setTheme(t => ({ ...t, sidebarColor: e.target.value }))} className="w-32 font-mono text-xs" />
                  </div>
                </Field>
              </Section>
            </>
          )}

          {/* ── Credenciais ── */}
          {tab === 'credenciais' && (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 text-sm text-amber-800">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Cada credencial pertence exclusivamente a esta conta. Os custos de uso sao cobrados diretamente pelos respectivos provedores.</span>
              </div>

              <Section title="Google Maps API" sub="Usada no mapa interativo de lotes">
                <Field label="API Key" sub="Maps JavaScript API">
                  <SecretInput value={creds.googleMapsKey} onChange={v => setCreds(c => ({ ...c, googleMapsKey: v }))} placeholder="AIza..." />
                </Field>
                <div className="text-xs text-slate-400 pt-1">
                  Obtenha em <span className="text-blue-600">console.cloud.google.com</span> — habilite Maps JavaScript API e restrinja ao dominio do sistema.
                </div>
              </Section>

              <Section title="AWS SES" sub="Envio de e-mails transacionais (boletos, contratos, lembretes)">
                <Field label="Regiao" sub="">
                  <select value={creds.sesRegion} onChange={e => setCreds(c => ({ ...c, sesRegion: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="sa-east-1">sa-east-1 (Sao Paulo)</option>
                    <option value="us-west-2">us-west-2 (Oregon)</option>
                  </select>
                </Field>
                <Field label="Access Key ID"><SecretInput value={creds.sesAccessKeyId} onChange={v => setCreds(c => ({ ...c, sesAccessKeyId: v }))} placeholder="AKIA..." /></Field>
                <Field label="Secret Access Key"><SecretInput value={creds.sesSecretAccessKey} onChange={v => setCreds(c => ({ ...c, sesSecretAccessKey: v }))} placeholder="secret..." /></Field>
                <Field label="E-mail remetente"><Input value={creds.sesFromEmail} onChange={e => setCreds(c => ({ ...c, sesFromEmail: e.target.value }))} placeholder="noreply@suaempresa.com.br" /></Field>
                <Field label="Nome remetente"><Input value={creds.sesFromName} onChange={e => setCreds(c => ({ ...c, sesFromName: e.target.value }))} placeholder="Residencial Santa Clara" /></Field>
                <button className="text-sm text-blue-600 hover:underline text-left">Testar envio de e-mail</button>
              </Section>

              <Section title="WhatsApp Business API" sub="Envio de boletos, lembretes e CRM automatizado">
                <Field label="Token de acesso"><SecretInput value={creds.whatsappToken} onChange={v => setCreds(c => ({ ...c, whatsappToken: v }))} placeholder="EAAx..." /></Field>
                <Field label="Phone Number ID"><Input value={creds.whatsappPhoneId} onChange={e => setCreds(c => ({ ...c, whatsappPhoneId: e.target.value }))} placeholder="120xxxxxxxxxx" /></Field>
                <Field label="Business Account ID"><Input value={creds.whatsappBusinessId} onChange={e => setCreds(c => ({ ...c, whatsappBusinessId: e.target.value }))} placeholder="109xxxxxxxxxx" /></Field>
                <div className="text-xs text-slate-400 pt-1">
                  Configure em <span className="text-blue-600">developers.facebook.com</span>. Os custos de envio por template sao cobrados diretamente pela Meta.
                </div>
              </Section>

              <Section title="Assinatura Digital (ClickSign)" sub="Contratos com validade juridica">
                <Field label="API Key"><SecretInput value={creds.clicksignKey} onChange={v => setCreds(c => ({ ...c, clicksignKey: v }))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></Field>
              </Section>

              <Section title="Integracao bancaria" sub="Emissao e baixa automatica de boletos">
                <Field label="Banco">
                  <select value={creds.bankName} onChange={e => setCreds(c => ({ ...c, bankName: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione o banco</option>
                    {['Bradesco','Itau','Banco do Brasil','Santander','Sicredi','Sicoob','BTG Pactual','IB3 Capital'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <Field label="API Key do banco"><SecretInput value={creds.bankApiKey} onChange={v => setCreds(c => ({ ...c, bankApiKey: v }))} /></Field>
                <Field label="Client ID"><Input value={creds.bankClientId} onChange={e => setCreds(c => ({ ...c, bankClientId: e.target.value }))} /></Field>
              </Section>
            </>
          )}

          {/* ── Usuarios ── */}
          {tab === 'usuarios' && (
            <Section title="Usuarios da conta" sub={`${users.filter(u => u.active).length} ativos de ${users.length} cadastrados`}>
              <div className="space-y-2">
                {users.map(u => {
                  const role = DEFAULT_ROLES.find(r => r.id === u.roleId)!
                  return (
                    <div key={u.id} className={cn('flex items-center gap-3 py-3 px-1 border-b border-slate-50 last:border-0', !u.active && 'opacity-50')}>
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-700 text-xs font-semibold">
                          {u.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-900">{u.name}</p>
                          {!u.active && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Inativo</span>}
                          {u.permissionOverrides && Object.keys(u.permissionOverrides).length > 0 && (
                            <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Permissoes customizadas</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                      <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', role.color)}>{role.label}</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditUser(u); setTab('permissoes') }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors" title="Editar permissoes">
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <button className="flex items-center gap-2 text-sm text-blue-600 hover:underline mt-2">
                <Plus className="w-4 h-4" /> Convidar usuario
              </button>
            </Section>
          )}

          {/* ── Permissoes ── */}
          {tab === 'permissoes' && (
            <>
              {/* User selector */}
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card">
                <p className="text-xs text-slate-500 mb-2">Visualizando permissoes de:</p>
                <div className="flex gap-2 flex-wrap">
                  {users.map(u => (
                    <button key={u.id} onClick={() => setEditUser(u)}
                      className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                        editUser?.id === u.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      )}>
                      <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-[9px] font-bold flex-shrink-0" style={editUser?.id === u.id ? { background: 'rgba(255,255,255,0.3)', color: 'white' } : {}}>
                        {u.name.split(' ').slice(0,2).map(n => n[0]).join('')}
                      </span>
                      {u.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {editUser && (
                <>
                  {/* Role info */}
                  <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{editUser.name}</p>
                      <p className="text-xs text-slate-500">{editUser.email}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Perfil base</p>
                      <select
                        value={editUser.roleId}
                        onChange={e => {
                          const newRole = e.target.value as RoleId
                          setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, roleId: newRole } : u))
                          setEditUser(prev => prev ? { ...prev, roleId: newRole } : null)
                        }}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                      >
                        {DEFAULT_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Permission matrix */}
                  <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-50 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Permissoes por modulo</p>
                      <p className="text-xs text-slate-400">Clique para alterar — sobrescreve o perfil base</p>
                    </div>
                    {groups.map(group => (
                      <div key={group}>
                        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{group}</p>
                        </div>
                        {MODULES.filter(m => m.group === group).map(mod => {
                          const baseLevel = DEFAULT_ROLES.find(r => r.id === editUser.roleId)?.permissions[mod.id] ?? 'none'
                          const override  = overrides[editUser.id]?.[mod.id]
                          const effective = override ?? baseLevel
                          const isOverridden = override !== undefined && override !== baseLevel

                          return (
                            <div key={mod.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <p className="text-sm text-slate-800">{mod.label}</p>
                                {isOverridden && (
                                  <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                    Customizado
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                {isOverridden && (
                                  <button onClick={() => setOverride(editUser.id, mod.id as ModuleId, baseLevel)}
                                    className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">
                                    Resetar
                                  </button>
                                )}
                                <PermPicker
                                  value={effective as PermLevel}
                                  onChange={v => setOverride(editUser.id, mod.id as ModuleId, v)}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card">
                    <p className="text-xs font-semibold text-slate-500 mb-3">Legenda dos niveis</p>
                    <div className="grid grid-cols-2 gap-3">
                      {PERM_LEVELS.map(p => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', p.color)}>{p.label}</span>
                          <span className="text-xs text-slate-500">
                            {p.id === 'none'  && 'Modulo oculto e inacessivel'}
                            {p.id === 'read'  && 'Visualiza mas nao pode editar'}
                            {p.id === 'write' && 'Cria e edita, sem deletar'}
                            {p.id === 'full'  && 'Acesso total incluindo exclusao'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {!editUser && (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                  Selecione um usuario acima para ver e editar suas permissoes
                </div>
              )}
            </>
          )}

          {/* ── Email SES ── */}
          {tab === 'email' && (
            <Section title="Configuracao de e-mail" sub="Acesse a aba Credenciais para configurar as chaves AWS SES">
              <div className="text-sm text-slate-500 py-4 text-center">
                As configuracoes de e-mail estao na aba <button onClick={() => setTab('credenciais')} className="text-blue-600 hover:underline">Credenciais</button>.
              </div>
            </Section>
          )}

          {/* ── Dominio ── */}
          {tab === 'dominio' && (
            <Section title="Dominio personalizado" sub="Configure um dominio proprio para sua plataforma">
              <Field label="Subdominio padrao">
                <div className="flex items-center gap-1 text-sm">
                  <Input defaultValue="santaclara" className="w-36" />
                  <span className="text-slate-500">.lotemobile.com.br</span>
                </div>
              </Field>
              <Field label="Dominio proprio" sub="Configure o CNAME no DNS">
                <Input placeholder="sistema.suaempresa.com.br" />
                <p className="text-xs text-slate-500 mt-1.5">
                  Aponte o CNAME para <code className="bg-slate-100 px-1 rounded">cname.vercel-dns.com</code>
                </p>
              </Field>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                SSL automatico provisionado via Vercel apos configurar o CNAME (ate 24h).
              </div>
            </Section>
          )}

          {/* ── Plano ── */}
          {tab === 'plano' && (
            <Section title="Plano atual">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-blue-900">Plano Premium</span>
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Ativo</span>
                </div>
                <p className="text-sm text-blue-800">Adesao: R$ 10.000,00 · Mensalidade: R$ 2.590,00</p>
                <div className="mt-3 space-y-1 text-xs text-blue-700">
                  <p>Todos os modulos inclusos</p>
                  <p>Empreendimentos, usuarios e corretores ilimitados</p>
                  <p>1 mapa humanizado incluso</p>
                  <p>Suporte ilimitado</p>
                </div>
              </div>
            </Section>
          )}

          {/* ── Notificacoes ── */}
          {tab === 'notificacoes' && (
            <Section title="Preferencias de notificacao">
              {[
                { label: 'Novo lead criado', sub: 'Alerta ao receber um lead no CRM' },
                { label: 'Parcela em atraso', sub: 'Notificar quando parcela vencer' },
                { label: 'Contrato assinado', sub: 'Confirmacao de assinatura digital' },
                { label: 'Lote reservado', sub: 'Quando corretor reservar um lote' },
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
