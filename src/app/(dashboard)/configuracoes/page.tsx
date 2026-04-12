'use client'

import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import {
  Save, Check, Upload, Palette, Globe, Mail, Users, Bell,
  CreditCard, Shield, Key, MapPin, Eye, EyeOff,
  AlertCircle, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MODULES, DEFAULT_ROLES, MOCK_TENANT_USERS,
  EMPTY_CREDENTIALS, resolvePermission,
  type TenantUser, type RoleId, type ModuleId, type PermLevel,
} from '@/lib/permissions'
import { useTenantConfig } from '@/lib/tenant-config-store'

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
  { id: 'none',  label: 'Sem acesso', color: 'bg-slate-100 text-slate-500' },
  { id: 'read',  label: 'Leitura',    color: 'bg-blue-100 text-blue-700' },
  { id: 'write', label: 'Gravacao',   color: 'bg-amber-100 text-amber-700' },
  { id: 'full',  label: 'Total',      color: 'bg-emerald-100 text-emerald-700' },
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
      'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900',
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
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? 'Insira a chave...'}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-9 text-sm font-mono placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors" />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function PermPicker({ value, onChange }: { value: PermLevel; onChange: (v: PermLevel) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = PERM_LEVELS.find(p => p.id === value)!
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-transparent cursor-pointer', cfg.color)}>
        {cfg.label} <span className="opacity-60 text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white rounded-xl shadow-dialog border border-slate-100 py-1 z-20 min-w-[130px]">
          {PERM_LEVELS.map(p => (
            <button key={p.id} onClick={() => { onChange(p.id); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50">
              <span className={cn('px-2 py-0.5 rounded-full', p.color)}>{p.label}</span>
              {p.id === value && <Check className="w-3 h-3 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConfiguracoesPage() {
  const hydrate     = useTenantConfig(s => s.hydrate)
  const config      = useTenantConfig(s => s.config)
  const setConfig   = useTenantConfig(s => s.setConfig)

  useEffect(() => { hydrate() }, [hydrate])

  const [tab, setTab]         = useState('identidade')
  const [saved, setSaved]     = useState(false)
  const [users, setUsers]     = useState<TenantUser[]>(MOCK_TENANT_USERS)
  const [editUser, setEditUser] = useState<TenantUser | null>(null)
  const [overrides, setOverrides] = useState<Record<string, Partial<Record<ModuleId, PermLevel>>>>(
    Object.fromEntries(MOCK_TENANT_USERS.map(u => [u.id, u.permissionOverrides ?? {}]))
  )
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Local editable state synced from store
  const [logoText,    setLogoText]    = useState(config.logoText || 'LoteMobile')
  const [primaryColor, setPrimary]    = useState(config.primaryColor || '#2563EB')
  const [sidebarColor, setSidebar]    = useState(config.sidebarColor || '#0D1B2A')
  const [logoPreview,  setLogoPreview] = useState(config.logoUrl || '')

  // Credentials local state
  const [creds, setCreds] = useState({
    googleMapsKey:      config.googleMapsKey || '',
    sesAccessKeyId:     config.sesAccessKeyId || '',
    sesSecretAccessKey: config.sesSecretAccessKey || '',
    sesRegion:          config.sesRegion || 'us-east-1',
    sesFromEmail:       config.sesFromEmail || '',
    sesFromName:        config.sesFromName || '',
    whatsappToken:      config.whatsappToken || '',
    whatsappPhoneId:    config.whatsappPhoneId || '',
    whatsappBusinessId: config.whatsappBusinessId || '',
    clicksignKey:       config.clicksignKey || '',
    bankName:           config.bankName || '',
    bankApiKey:         config.bankApiKey || '',
  })

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      alert('Arquivo muito grande. Maximo 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setLogoPreview(dataUrl)
      // Update sidebar immediately
      setConfig({ logoUrl: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  function removeLogo() {
    setLogoPreview('')
    setConfig({ logoUrl: '' })
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function save() {
    setConfig({
      logoUrl:      logoPreview,
      logoText,
      primaryColor,
      sidebarColor,
      ...creds,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function setOverride(userId: string, moduleId: ModuleId, level: PermLevel) {
    setOverrides(prev => ({ ...prev, [userId]: { ...prev[userId], [moduleId]: level } }))
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
        {/* Sidebar tabs */}
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

          {/* ── Identidade visual ── */}
          {tab === 'identidade' && (
            <>
              {/* Live preview */}
              <Section title="Preview em tempo real">
                <div className="flex rounded-xl overflow-hidden border border-slate-200 h-28">
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
                          <span className="text-white text-xs font-semibold truncate">{logoText}</span>
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
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded border border-slate-200 h-9" />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1">O sidebar atualiza em tempo real ao fazer upload do logo</p>
              </Section>

              {/* Logo upload */}
              <Section title="Logotipo da plataforma" sub="Este logo aparece no topo do menu lateral em todas as telas">
                <Field label="Upload do logo" sub="PNG, JPG ou SVG · max 2MB · Recomendado fundo transparente">
                  <div className="flex items-start gap-4">
                    {/* Preview box */}
                    <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-900 overflow-hidden relative group flex-shrink-0">
                      {logoPreview ? (
                        <>
                          <img src={logoPreview} alt="logo" className="max-w-full max-h-full p-2 object-contain"
                            style={{ filter: 'brightness(0) invert(1)' }} />
                          <button
                            onClick={removeLogo}
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

                    {/* Upload actions */}
                    <div className="space-y-2">
                      <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                      <label htmlFor="logo-upload"
                        className="flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        <Upload className="w-4 h-4" /> Fazer upload
                      </label>
                      {logoPreview && (
                        <button onClick={removeLogo}
                          className="flex items-center gap-2 text-red-500 hover:text-red-700 text-sm transition-colors">
                          <X className="w-4 h-4" /> Remover logo
                        </button>
                      )}
                      <p className="text-xs text-slate-400 leading-relaxed">
                        O logo e exibido sobre fundo escuro.<br />
                        Recomendamos versao branca ou transparente.
                      </p>
                    </div>
                  </div>
                </Field>

                <Field label="Nome da plataforma" sub="Aparece quando nao ha logo">
                  <Input value={logoText} onChange={e => setLogoText(e.target.value)}
                    placeholder="LoteMobile" />
                </Field>
              </Section>

              {/* Colors */}
              <Section title="Cores">
                <Field label="Presets">
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(preset => (
                      <button key={preset.name}
                        onClick={() => { setPrimary(preset.primary); setSidebar(preset.sidebar) }}
                        className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors',
                          primaryColor === preset.primary
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
                    <input type="color" value={primaryColor} onChange={e => setPrimary(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <Input value={primaryColor} onChange={e => setPrimary(e.target.value)}
                      className="w-32 font-mono text-xs" />
                  </div>
                </Field>
                <Field label="Cor do sidebar">
                  <div className="flex items-center gap-2">
                    <input type="color" value={sidebarColor} onChange={e => setSidebar(e.target.value)}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
                    <Input value={sidebarColor} onChange={e => setSidebar(e.target.value)}
                      className="w-32 font-mono text-xs" />
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
                <span>Cada credencial pertence exclusivamente a esta conta. Custos cobrados diretamente pelos provedores.</span>
              </div>
              <Section title="Google Maps API" sub="Mapa interativo de lotes">
                <Field label="API Key" sub="Maps JavaScript API">
                  <SecretInput value={creds.googleMapsKey} onChange={v => setCreds(c => ({ ...c, googleMapsKey: v }))} placeholder="AIza..." />
                </Field>
                <p className="text-xs text-slate-400">Obtenha em console.cloud.google.com — ative Maps JavaScript API e restrinja ao seu dominio.</p>
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
                <Field label="Business Account ID"><Input value={creds.whatsappBusinessId} onChange={e => setCreds(c => ({ ...c, whatsappBusinessId: e.target.value }))} /></Field>
              </Section>
              <Section title="Assinatura Digital (ClickSign)">
                <Field label="API Key"><SecretInput value={creds.clicksignKey} onChange={v => setCreds(c => ({ ...c, clicksignKey: v }))} /></Field>
              </Section>
              <Section title="Banco">
                <Field label="Banco">
                  <select value={creds.bankName} onChange={e => setCreds(c => ({ ...c, bankName: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione</option>
                    {['Bradesco','Itau','Banco do Brasil','Santander','Sicredi','Sicoob','BTG Pactual'].map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </Field>
                <Field label="API Key"><SecretInput value={creds.bankApiKey} onChange={v => setCreds(c => ({ ...c, bankApiKey: v }))} /></Field>
              </Section>
            </>
          )}

          {/* ── Usuarios ── */}
          {tab === 'usuarios' && (
            <Section title="Usuarios da conta" sub={`${users.filter(u => u.active).length} ativos`}>
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
                        <p className="text-sm font-medium text-slate-900">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                      <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', role.color)}>{role.label}</span>
                      <button onClick={() => { setEditUser(u); setTab('permissoes') }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-600 transition-colors">
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* ── Permissoes ── */}
          {tab === 'permissoes' && (
            <>
              <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card">
                <p className="text-xs text-slate-500 mb-2">Visualizando:</p>
                <div className="flex gap-2 flex-wrap">
                  {users.map(u => (
                    <button key={u.id} onClick={() => setEditUser(u)}
                      className={cn('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                        editUser?.id === u.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      )}>
                      {u.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
              {editUser && (
                <>
                  <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-card flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">{editUser.name}</p>
                      <p className="text-xs text-slate-500">{editUser.email}</p>
                    </div>
                    <select value={editUser.roleId}
                      onChange={e => {
                        const r = e.target.value as RoleId
                        setUsers(p => p.map(u => u.id === editUser.id ? { ...u, roleId: r } : u))
                        setEditUser(p => p ? { ...p, roleId: r } : null)
                      }}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none">
                      {DEFAULT_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-50 flex justify-between">
                      <p className="text-sm font-semibold text-slate-900">Permissoes por modulo</p>
                      <p className="text-xs text-slate-400">Clique para alterar</p>
                    </div>
                    {groups.map(group => (
                      <div key={group}>
                        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{group}</p>
                        </div>
                        {MODULES.filter(m => m.group === group).map(mod => {
                          const base = DEFAULT_ROLES.find(r => r.id === editUser.roleId)?.permissions[mod.id] ?? 'none'
                          const ov   = overrides[editUser.id]?.[mod.id]
                          const eff  = (ov ?? base) as PermLevel
                          return (
                            <div key={mod.id} className="flex items-center justify-between px-5 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-slate-800">{mod.label}</p>
                                {ov && ov !== base && (
                                  <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Customizado</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {ov && ov !== base && (
                                  <button onClick={() => setOverride(editUser.id, mod.id as ModuleId, base as PermLevel)}
                                    className="text-[10px] text-slate-400 hover:text-red-500">
                                    Resetar
                                  </button>
                                )}
                                <PermPicker value={eff}
                                  onChange={v => setOverride(editUser.id, mod.id as ModuleId, v)} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!editUser && (
                <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                  Selecione um usuario acima
                </div>
              )}
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
              <Field label="Dominio proprio" sub="CNAME no DNS">
                <Input placeholder="sistema.suaempresa.com.br" />
                <p className="text-xs text-slate-400 mt-1">Aponte o CNAME para <code className="bg-slate-100 px-1 rounded">cname.vercel-dns.com</code></p>
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

          {tab === 'notificacoes' && (
            <Section title="Notificacoes">
              {[
                { label: 'Novo lead', sub: 'Alerta ao receber lead no CRM' },
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

          {tab === 'email' && (
            <Section title="E-mail (SES)" sub="Configure as chaves em Credenciais">
              <p className="text-sm text-slate-500 py-4 text-center">
                Configuracoes de e-mail estao na aba{' '}
                <button onClick={() => setTab('credenciais')} className="text-blue-600 hover:underline">
                  Credenciais
                </button>.
              </p>
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}
