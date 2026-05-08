'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, KeyRound } from 'lucide-react'

interface InviteInfo {
  name: string; email: string; role: string
  tenant_name: string; invited_by: string
  custom_message: string; auto_activate: boolean; expires_at: string
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', manager: 'Gerente', broker: 'Corretor',
  accountant: 'Contador', viewer: 'Visualizador',
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>()
  const router    = useRouter()

  const [info,     setInfo]     = useState<InviteInfo | null>(null)
  const [status,   setStatus]   = useState<'loading'|'valid'|'invalid'|'success'>('loading')
  const [errMsg,   setErrMsg]   = useState('')

  const [name,     setName]     = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState<Record<string, string>>({})

  useEffect(() => {
    if (!token) return
    fetch(`${API}/users/invite/validate/${token}`)
      .then(r => r.json())
      .then(r => {
        if (r.ok) {
          setInfo(r.data)
          setName(r.data.name)
          setStatus('valid')
        } else {
          setErrMsg(r.message || 'Convite inválido')
          setStatus('invalid')
        }
      })
      .catch(() => { setErrMsg('Erro ao validar convite'); setStatus('invalid') })
  }, [token])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())         e.name     = 'Informe seu nome'
    if (password.length < 8)  e.password = 'Mínimo 8 caracteres'
    if (password !== confirm) e.confirm  = 'As senhas não coincidem'
    setFormErr(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      const r = await fetch(`${API}/users/invite/accept/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, name }),
      })
      const data = await r.json()
      if (data.ok) {
        setStatus('success')
        setTimeout(() => router.push('/login'), 3000)
      } else {
        setFormErr({ _geral: data.message || 'Erro ao criar conta' })
      }
    } catch {
      setFormErr({ _geral: 'Erro de conexão' })
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1e3a5f] mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {status === 'success' ? 'Conta criada!' : 'Criar sua conta'}
          </h1>
        </div>

        {/* Loading */}
        {status === 'loading' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Validando convite…</p>
          </div>
        )}

        {/* Inválido / expirado */}
        {status === 'invalid' && (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Convite inválido</h2>
            <p className="text-sm text-slate-500">{errMsg}</p>
            <p className="text-xs text-slate-400 mt-3">Entre em contato com o administrador para receber um novo convite.</p>
          </div>
        )}

        {/* Sucesso */}
        {status === 'success' && (
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-8 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Conta criada com sucesso!</h2>
            <p className="text-sm text-slate-500">Redirecionando para o login…</p>
          </div>
        )}

        {/* Formulário */}
        {status === 'valid' && info && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

            {/* Cabeçalho com mensagem do convite */}
            <div className="bg-[#1e3a5f] px-6 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">
                Convite de {info.invited_by} · {info.tenant_name}
              </p>
              <p className="text-sm leading-relaxed opacity-90">{info.custom_message}</p>
            </div>

            {/* Info do usuário */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                {info.name.split(' ').slice(0,2).map(n => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{info.email}</p>
                <p className="text-xs text-slate-500">
                  Perfil: <span className="font-medium text-blue-600">{ROLE_LABELS[info.role] || info.role}</span>
                  {info.auto_activate && <span className="ml-2 text-green-600">· Ativação automática</span>}
                </p>
              </div>
            </div>

            {/* Campos */}
            <div className="px-6 py-6 space-y-4">
              {formErr._geral && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
                  {formErr._geral}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Seu nome</label>
                <input className={inp} value={name} onChange={e => setName(e.target.value)}
                  placeholder="Nome completo" />
                {formErr.name && <p className="text-xs text-red-500">{formErr.name}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Criar senha</label>
                <div className="relative">
                  <input className={inp} type={showPw ? 'text' : 'password'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres" />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formErr.password && <p className="text-xs text-red-500">{formErr.password}</p>}

                {/* Indicador de força da senha */}
                {password.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {[
                      password.length >= 8,
                      /[A-Z]/.test(password),
                      /[0-9]/.test(password),
                      /[^A-Za-z0-9]/.test(password),
                    ].map((ok, i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${ok ? 'bg-green-400' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Confirmar senha</label>
                <input className={inp} type="password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="Repita a senha" />
                {formErr.confirm && <p className="text-xs text-red-500">{formErr.confirm}</p>}
              </div>

              <button onClick={handleSubmit} disabled={saving}
                className="w-full py-3 bg-[#1e3a5f] hover:bg-[#162d4a] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Criando conta…</> : 'Criar minha conta'}
              </button>

              <p className="text-center text-xs text-slate-400">
                Expira em {new Date(info.expires_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
