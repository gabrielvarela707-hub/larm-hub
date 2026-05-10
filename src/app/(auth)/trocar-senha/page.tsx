'use client'

/**
 * src/app/(auth)/trocar-senha/page.tsx
 * → lotemobile2/src/app/(auth)/trocar-senha/page.tsx
 *
 * Exibida após o primeiro login com senha temporária.
 * Obriga o usuário a definir uma nova senha antes de acessar o sistema.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, KeyRound, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuthStore, apiClient } from '@/lib/auth-store'

export default function TrocarSenhaPage() {
  const router = useRouter()
  const user   = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)

  const [current,  setCurrent]  = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [done,     setDone]     = useState(false)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!current.trim())      e.current  = 'Informe a senha temporária'
    if (password.length < 8)  e.password = 'Mínimo 8 caracteres'
    if (password !== confirm)  e.confirm  = 'As senhas não coincidem'
    if (password === current)  e.password = 'A nova senha deve ser diferente da temporária'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      const { data } = await apiClient.post('/auth/change-password', {
        currentPassword: current,
        newPassword:     password,
      })
      if (data.ok) {
        setDone(true)
        setTimeout(() => router.push('/'), 2000)
      } else {
        setErrors({ _geral: data.message || 'Erro ao trocar senha' })
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        .response?.data?.message || 'Erro de conexão'
      setErrors({ _geral: msg })
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-white text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const strengthColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400']
  const strengthLevel   = strength.filter(Boolean).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1e3a5f] mb-4">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            {done ? 'Senha alterada!' : 'Defina sua senha'}
          </h1>
          {!done && (
            <p className="text-sm text-slate-500 mt-1">
              Olá, <strong>{user?.name?.split(' ')[0]}</strong>. Por segurança, troque a senha temporária antes de continuar.
            </p>
          )}
        </div>

        {done ? (
          <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-8 text-center">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Tudo certo!</h2>
            <p className="text-sm text-slate-500">Redirecionando para o painel…</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-6 py-7 space-y-4">

            {errors._geral && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-600">
                {errors._geral}
              </div>
            )}

            {/* Senha temporária */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Senha temporária</label>
              <div className="relative">
                <input className={inp} type={showPw ? 'text' : 'password'}
                  value={current} onChange={e => setCurrent(e.target.value)}
                  placeholder="Digite a senha que você recebeu" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.current && <p className="text-xs text-red-500">{errors.current}</p>}
            </div>

            {/* Nova senha */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Nova senha</label>
              <input className={inp} type="password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres" />
              {password.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {[0,1,2,3].map(i => (
                    <div key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${i < strengthLevel ? strengthColors[strengthLevel - 1] : 'bg-slate-200'}`} />
                  ))}
                </div>
              )}
              {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
            </div>

            {/* Confirmar */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Confirmar nova senha</label>
              <input className={inp} type="password"
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repita a nova senha" />
              {errors.confirm && <p className="text-xs text-red-500">{errors.confirm}</p>}
            </div>

            <button onClick={handleSubmit} disabled={saving}
              className="w-full py-3 bg-[#1e3a5f] hover:bg-[#162d4a] text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : 'Salvar nova senha'}
            </button>

            <button onClick={() => { logout(); router.push('/login') }}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 pt-1">
              Sair e entrar com outra conta
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
