'use client'

/**
 * src/app/(dashboard)/cadastros/tipo-documento/page.tsx
 * → lotemobile2/src/app/(dashboard)/cadastros/tipo-documento/page.tsx  (novo)
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, X, Check, Loader2, Tag, FileText } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface TipoDoc {
  id: number
  nome: string
  descricao: string | null
  ativo: boolean
  usado_em: string[]   // ['pagar','receber']
}

const DEFAULT_TIPOS = [
  'Nota Fiscal', 'Boleto', 'Recibo', 'Contrato', 'Fatura',
  'Duplicata', 'Cheque', 'Comprovante de Pagamento', 'Outros',
]

const EMPTY: Partial<TipoDoc> = {
  nome: '', descricao: '', ativo: true, usado_em: ['pagar', 'receber'],
}

export default function TipoDocumentoPage() {
  const [lista,    setLista]    = useState<TipoDoc[]>([])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<number | null>(null)
  const [form,     setForm]     = useState<Partial<TipoDoc>>(EMPTY)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiClient.get('/financeiro/tipos-documento')
      setLista(r.data.data ?? [])
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditId(null); setForm(EMPTY); setErrors({}); setShowForm(true)
  }
  function openEdit(t: TipoDoc) {
    setEditId(t.id); setForm({ ...t }); setErrors({}); setShowForm(true)
  }
  function close() {
    setShowForm(false); setEditId(null); setForm(EMPTY); setErrors({})
  }

  function validate() {
    const e: Record<string,string> = {}
    if (!form.nome?.trim()) e.nome = 'Obrigatório'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      if (editId) {
        await apiClient.put(`/financeiro/tipos-documento/${editId}`, form)
      } else {
        await apiClient.post('/financeiro/tipos-documento', form)
      }
      close(); load()
    } catch (err: unknown) {
      setErrors({ _geral: (err as {response?: {data?: {message?: string}}}).response?.data?.message ?? 'Erro ao salvar' })
    } finally { setSaving(false) }
  }

  async function toggleAtivo(t: TipoDoc) {
    try {
      await apiClient.put(`/financeiro/tipos-documento/${t.id}`, { ...t, ativo: !t.ativo })
      load()
    } catch { }
  }

  async function seedDefaults() {
    try {
      await apiClient.post('/financeiro/tipos-documento/seed')
      load()
    } catch { }
  }

  function toggleUsadoEm(val: string) {
    const cur = form.usado_em ?? []
    setForm(p => ({
      ...p,
      usado_em: cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val],
    }))
  }

  const inp = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tipos de Documento</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Usados em Contas a Pagar, Contas a Receber e demais lançamentos financeiros
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lista.length === 0 && !loading && (
            <button onClick={seedDefaults}
              className="text-sm text-blue-600 border border-blue-200 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
              Criar tipos padrão
            </button>
          )}
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-semibold rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Novo tipo
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Tag className="w-10 h-10 text-slate-200" />
            <p className="text-sm">Nenhum tipo de documento cadastrado</p>
            <button onClick={seedDefaults}
              className="text-sm text-blue-600 hover:underline">
              Criar tipos padrão (NF, Boleto, Recibo…)
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {lista.map(t => (
              <div key={t.id} className={cn('flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors', !t.ativo && 'opacity-50')}>
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{t.nome}</p>
                  {t.descricao && <p className="text-xs text-slate-500 truncate">{t.descricao}</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  {(t.usado_em ?? []).includes('pagar') && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">A Pagar</span>
                  )}
                  {(t.usado_em ?? []).includes('receber') && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">A Receber</span>
                  )}
                </div>
                <button onClick={() => toggleAtivo(t)}
                  className={cn('text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors',
                    t.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                  {t.ativo ? 'Ativo' : 'Inativo'}
                </button>
                <button onClick={() => openEdit(t)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editId ? 'Editar tipo' : 'Novo tipo de documento'}
              </h2>
              <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                  {errors._geral}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input className={cn(inp, errors.nome && 'border-red-300')}
                  value={form.nome || ''}
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Nota Fiscal, Boleto, Recibo…" />
                {errors.nome && <p className="text-[10px] text-red-500">{errors.nome}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Descrição</label>
                <input className={inp}
                  value={form.descricao || ''}
                  onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Descrição opcional" />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-600">Disponível em</label>
                <div className="flex gap-3">
                  {[
                    { val: 'pagar',   label: 'Contas a Pagar',   color: 'border-red-200 bg-red-50 text-red-700' },
                    { val: 'receber', label: 'Contas a Receber',  color: 'border-green-200 bg-green-50 text-green-700' },
                  ].map(opt => {
                    const active = (form.usado_em ?? []).includes(opt.val)
                    return (
                      <label key={opt.val}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-xs font-medium transition-colors flex-1 justify-center',
                          active ? opt.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                        )}>
                        <input type="checkbox" className="hidden"
                          checked={active}
                          onChange={() => toggleUsadoEm(opt.val)} />
                        {active ? <Check className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 rounded border-2 border-current opacity-40" />}
                        {opt.label}
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={close}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><Check className="w-4 h-4" /> Salvar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
