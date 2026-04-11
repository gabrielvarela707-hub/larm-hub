'use client'

import type { ReactNode } from 'react'

import { useState } from 'react'
import { Save, Upload, Eye, Palette, Mail, Globe, Shield, CreditCard, Bell, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockTenant } from '@/lib/mock-data'

const TABS = [
  { id: 'identidade', label: 'Identidade visual', icon: Palette },
  { id: 'dominio', label: 'Domínio', icon: Globe },
  { id: 'email', label: 'E-mail (SES)', icon: Mail },
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'notificacoes', label: 'Notificações', icon: Bell },
  { id: 'plano', label: 'Plano', icon: CreditCard },
  { id: 'seguranca', label: 'Segurança', icon: Shield },
]

const COLOR_PRESETS = [
  { name: 'Azul (padrão)', primary: '#2563EB', sidebar: '#0D1B2A' },
  { name: 'Verde', primary: '#059669', sidebar: '#052e16' },
  { name: 'Roxo', primary: '#7C3AED', sidebar: '#1e1b4b' },
  { name: 'Laranja', primary: '#EA580C', sidebar: '#1c0a00' },
  { name: 'Cinza', primary: '#374151', sidebar: '#111827' },
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

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400',
        'placeholder:text-slate-400 transition-colors',
        props.className
      )}
    />
  )
}

export default function ConfiguracoesPage() {
  const [tab, setTab] = useState('identidade')
  const [theme, setTheme] = useState(mockTenant.theme)
  const [saved, setSaved] = useState(false)

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>
          <p className="text-sm text-slate-500 mt-0.5">White-label, domínio, e-mail e preferências da plataforma</p>
        </div>
        <button
          onClick={save}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            saved ? 'bg-emerald-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
          )}
        >
          <Save className="w-4 h-4" />
          {saved ? 'Salvo!' : 'Salvar alterações'}
        </button>
      </div>

      <div className="flex gap-5">
        {/* Sidebar tabs */}
        <div className="w-48 flex-shrink-0 space-y-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                tab === t.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50'
              )}
            >
              <t.icon className="w-4 h-4 flex-shrink-0" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {tab === 'identidade' && (
            <>
              {/* Live preview */}
              <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-900">Preview em tempo real</h3>
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Preview</span>
                </div>
                <div className="flex rounded-xl overflow-hidden border border-slate-200 h-24">
                  <div className="w-40 flex flex-col justify-between p-3" style={{ background: theme.sidebarColor }}>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: theme.primaryColor }}>
                        <span className="text-white text-[8px] font-bold">L</span>
                      </div>
                      <span className="text-white text-xs font-semibold truncate">{theme.logoText}</span>
                    </div>
                    <div className="space-y-1">
                      {['Dashboard', 'Empreendimentos', 'CRM'].map(item => (
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
              </div>

              <Section title="Marca" sub="Nome e logotipo exibidos em toda a plataforma">
                <Field label="Nome da plataforma" sub="Aparece no sidebar e e-mails">
                  <Input value={theme.logoText} onChange={e => setTheme(t => ({ ...t, logoText: e.target.value }))} />
                </Field>
                <Field label="Logotipo" sub="PNG ou SVG, máx. 2MB">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center bg-slate-50">
                      <Upload className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <button className="text-sm text-blue-600 hover:underline">Fazer upload</button>
                      <p className="text-xs text-slate-400 mt-0.5">Recomendado: 200×60px</p>
                    </div>
                  </div>
                </Field>
                <Field label="Favicon" sub="Ícone na aba do browser">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50">
                      <Upload className="w-4 h-4 text-slate-400" />
                    </div>
                    <button className="text-sm text-blue-600 hover:underline">Fazer upload</button>
                  </div>
                </Field>
              </Section>

              <Section title="Cores" sub="Personalize o esquema de cores da plataforma">
                <Field label="Presets">
                  <div className="flex gap-2 flex-wrap">
                    {COLOR_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => setTheme(t => ({ ...t, primaryColor: preset.primary, sidebarColor: preset.sidebar }))}
                        className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors',
                          theme.primaryColor === preset.primary
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        )}
                      >
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: preset.primary }} />
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Cor primária" sub="Botões e destaques">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.primaryColor}
                      onChange={e => setTheme(t => ({ ...t, primaryColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <Input value={theme.primaryColor} onChange={e => setTheme(t => ({ ...t, primaryColor: e.target.value }))} className="w-32 font-mono text-xs" />
                  </div>
                </Field>
                <Field label="Cor do sidebar" sub="Fundo do menu lateral">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={theme.sidebarColor}
                      onChange={e => setTheme(t => ({ ...t, sidebarColor: e.target.value }))}
                      className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                    />
                    <Input value={theme.sidebarColor} onChange={e => setTheme(t => ({ ...t, sidebarColor: e.target.value }))} className="w-32 font-mono text-xs" />
                  </div>
                </Field>
              </Section>
            </>
          )}

          {tab === 'dominio' && (
            <Section title="Domínio personalizado" sub="Configure um domínio próprio para sua plataforma">
              <Field label="Subdomínio padrão" sub="Sempre disponível">
                <div className="flex items-center gap-1 text-sm">
                  <Input value="seuempresa" className="w-36" />
                  <span className="text-slate-500">.lotemobile.com.br</span>
                </div>
              </Field>
              <Field label="Domínio próprio" sub="Configure o CNAME no seu DNS">
                <Input placeholder="sistema.suaempresa.com.br" />
                <p className="text-xs text-slate-500 mt-1.5">
                  Aponte o CNAME <code className="bg-slate-100 px-1 rounded">cname.vercel-dns.com</code> no DNS do seu domínio
                </p>
              </Field>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <strong>SSL automático:</strong> após configurar o CNAME, o certificado SSL é provisionado automaticamente via Let&apos;s Encrypt em até 24h.
              </div>
            </Section>
          )}

          {tab === 'email' && (
            <Section title="Configuração de e-mail (AWS SES)" sub="E-mails transacionais enviados pela plataforma">
              <Field label="E-mail remetente" sub="Endereço verificado no SES">
                <Input placeholder="noreply@suaempresa.com.br" defaultValue="noreply@lotemobile.com.br" />
              </Field>
              <Field label="Nome do remetente" sub="Aparece no campo De:">
                <Input placeholder="Sua Empresa" defaultValue="LoteMobile" />
              </Field>
              <Field label="AWS Region" sub="">
                <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                  <option>us-east-1 (N. Virginia)</option>
                  <option>sa-east-1 (São Paulo)</option>
                  <option>us-west-2 (Oregon)</option>
                </select>
              </Field>
              <Field label="AWS Access Key ID" sub="">
                <Input type="password" placeholder="AKIA..." defaultValue="AKIA••••••••••••••••" />
              </Field>
              <Field label="AWS Secret Access Key" sub="">
                <Input type="password" placeholder="••••••••••••••••••••••••••••••••••••••••" />
              </Field>
              <button className="text-sm text-blue-600 hover:underline">Testar envio de e-mail</button>
            </Section>
          )}

          {tab === 'usuarios' && (
            <Section title="Usuários e permissões" sub="Gerencie o acesso da equipe">
              <div className="space-y-2">
                {[
                  { name: 'Fernando Monteiro', email: 'fernando@empresa.com', role: 'Admin' },
                  { name: 'Carlos Henrique', email: 'carlos@empresa.com', role: 'Corretor' },
                  { name: 'Ana Paula Costa', email: 'ana@empresa.com', role: 'Corretor' },
                  { name: 'Maria Contadora', email: 'maria@empresa.com', role: 'Contador' },
                ].map(u => (
                  <div key={u.email} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-700 text-xs font-semibold">{u.name.split(' ').map(n => n[0]).slice(0,2).join('')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{u.role}</span>
                    <button className="text-xs text-blue-600 hover:underline">Editar</button>
                  </div>
                ))}
              </div>
              <button className="text-sm text-blue-600 hover:underline">+ Convidar usuário</button>
            </Section>
          )}

          {(tab === 'plano') && (
            <Section title="Plano atual" sub="Gerencie sua assinatura">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-blue-900">Plano Premium</span>
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Ativo</span>
                </div>
                <p className="text-sm text-blue-800">Adesão: R$ 10.000,00 · Mensalidade: R$ 2.590,00</p>
                <div className="mt-3 space-y-1 text-xs text-blue-700">
                  <p>✓ Todos os módulos inclusos</p>
                  <p>✓ Empreendimentos ilimitados</p>
                  <p>✓ Usuários e corretores ilimitados</p>
                  <p>✓ 1 mapa humanizado incluído</p>
                  <p>✓ Suporte ilimitado</p>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
