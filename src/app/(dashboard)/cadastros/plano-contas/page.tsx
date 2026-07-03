'use client'

/**
 * src/app/(dashboard)/cadastros/plano-contas/page.tsx
 * CRUD administrativo do Plano de Contas financeiro.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Plus, Search, Pencil, X, Check, Loader2,
  FileText, RefreshCcw, Trash2, Power, PowerOff,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

type PlanoTipo = 'T' | 'S' | 'A'

interface PlanoConta {
  id: number
  codigo: string
  descricao: string
  tipo: PlanoTipo
  pai_id: number | null
  pai_codigo?: string | null
  pai_descricao?: string | null
  ativo: boolean
}

interface PlanoContaForm {
  codigo: string
  descricao: string
  tipo: PlanoTipo
  pai_id: number | null
  ativo: boolean
}

const EMPTY: PlanoContaForm = {
  codigo: '',
  descricao: '',
  tipo: 'A',
  pai_id: null,
  ativo: true,
}

const TIPO_LABEL: Record<PlanoTipo, string> = {
  T: 'Totalizador',
  S: 'Subtotal',
  A: 'Analítico',
}

const TIPO_BADGE: Record<PlanoTipo, string> = {
  T: 'bg-slate-900 text-white',
  S: 'bg-blue-100 text-blue-700',
  A: 'bg-emerald-100 text-emerald-700',
}

function nivelConta(codigo: string) {
  const limpo = codigo.replace(/\.$/, '')
  return Math.max(0, limpo.split('.').filter(Boolean).length - 1)
}

function erroApi(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback
}

function Field({
  label, name, required, children, errors, col2,
}: {
  label: string
  name: string
  required?: boolean
  children: ReactNode
  errors: Record<string, string>
  col2?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-1', col2 && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500 mt-0.5">{errors[name]}</p>}
    </div>
  )
}

export default function PlanoContasPage() {
  const [lista, setLista] = useState<PlanoConta[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<PlanoContaForm>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [fBusca, setFBusca] = useState('')
  const [fTipo, setFTipo] = useState<'todos' | PlanoTipo>('todos')
  const [fAtivo, setFAtivo] = useState<'todos' | '1' | '0'>('todos')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await apiClient.get('/financeiro/plano-contas', {
        params: { ativo: 'todos' },
      })
      setLista(r.data.data || [])
    } catch {
      setLista([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtrados = useMemo(() => {
    const busca = fBusca.trim().toLowerCase()
    return lista.filter(item => {
      if (fTipo !== 'todos' && item.tipo !== fTipo) return false
      if (fAtivo !== 'todos' && item.ativo !== (fAtivo === '1')) return false
      if (!busca) return true
      return item.codigo.toLowerCase().includes(busca)
        || item.descricao.toLowerCase().includes(busca)
        || String(item.pai_codigo || '').toLowerCase().includes(busca)
        || String(item.pai_descricao || '').toLowerCase().includes(busca)
    })
  }, [lista, fBusca, fTipo, fAtivo])

  const totais = useMemo(() => ({
    total: lista.length,
    ativos: lista.filter(i => i.ativo).length,
    analiticos: lista.filter(i => i.tipo === 'A' && i.ativo).length,
  }), [lista])

  const opcoesPai = useMemo(() => (
    lista
      .filter(item => item.id !== editId && item.ativo)
      .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
  ), [lista, editId])

  function openNew() {
    setEditId(null)
    setForm(EMPTY)
    setErrors({})
    setShowForm(true)
  }

  function openEdit(item: PlanoConta) {
    setEditId(item.id)
    setForm({
      codigo: item.codigo,
      descricao: item.descricao,
      tipo: item.tipo,
      pai_id: item.pai_id,
      ativo: item.ativo,
    })
    setErrors({})
    setShowForm(true)
  }

  function closeForm() {
    if (saving) return
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY)
    setErrors({})
  }

  function set<K extends keyof PlanoContaForm>(key: K, value: PlanoContaForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.codigo.trim()) e.codigo = 'Obrigatório'
    if (!form.descricao.trim()) e.descricao = 'Obrigatório'
    if (!['T', 'S', 'A'].includes(form.tipo)) e.tipo = 'Tipo inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        tipo: form.tipo,
        pai_id: form.pai_id,
        ativo: form.ativo,
      }

      if (editId) {
        await apiClient.put(`/financeiro/plano-contas/${editId}`, payload)
      } else {
        await apiClient.post('/financeiro/plano-contas', payload)
      }

      closeForm()
      await load()
    } catch (err: unknown) {
      setErrors({ _geral: erroApi(err, 'Erro ao salvar conta') })
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(item: PlanoConta) {
    try {
      await apiClient.put(`/financeiro/plano-contas/${item.id}`, {
        codigo: item.codigo,
        descricao: item.descricao,
        tipo: item.tipo,
        pai_id: item.pai_id,
        ativo: !item.ativo,
      })
      await load()
    } catch {}
  }

  async function excluir(item: PlanoConta) {
    if (!window.confirm(`Inativar a conta ${item.codigo} — ${item.descricao}?`)) return
    try {
      await apiClient.delete(`/financeiro/plano-contas/${item.id}`)
      await load()
    } catch (err: unknown) {
      alert(erroApi(err, 'Erro ao inativar conta'))
    }
  }

  async function seedExcel() {
    if (lista.length > 0 && !window.confirm('Atualizar o plano de contas com os dados da planilha enviada?')) return

    setSeeding(true)
    try {
      await apiClient.post('/financeiro/plano-contas/seed')
      await load()
    } catch (err: unknown) {
      alert(erroApi(err, 'Erro ao executar seed do plano de contas'))
    } finally {
      setSeeding(false)
    }
  }

  const inp = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Plano de Contas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastro financeiro usado nos lançamentos de contas a pagar
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={seedExcel}
            disabled={seeding}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60"
          >
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
            Seed da planilha
          </button>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Nova conta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Total</p>
          <p className="text-2xl font-bold text-slate-800">{totais.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Ativas</p>
          <p className="text-2xl font-bold text-emerald-700">{totais.ativos}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Analíticas</p>
          <p className="text-2xl font-bold text-blue-700">{totais.analiticos}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_150px] gap-3 items-end">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={fBusca}
                onChange={e => setFBusca(e.target.value)}
                placeholder="Código, descrição ou conta superior…"
                className="pl-9 pr-4 py-2 w-full text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Tipo</label>
            <select value={fTipo} onChange={e => setFTipo(e.target.value as 'todos' | PlanoTipo)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
              <option value="todos">Todos</option>
              <option value="T">Totalizador</option>
              <option value="S">Subtotal</option>
              <option value="A">Analítico</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
            <select value={fAtivo} onChange={e => setFAtivo(e.target.value as 'todos' | '1' | '0')}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
              <option value="todos">Todos</option>
              <option value="1">Ativos</option>
              <option value="0">Inativos</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                <th className="px-4 py-3 text-left font-semibold">Código</th>
                <th className="px-4 py-3 text-left font-semibold">Descrição</th>
                <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold">Conta superior</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(8)].map((_, i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(6)].map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${45 + ((i * 13 + j * 7) % 45)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-14">
                    <FileText className="w-9 h-9 mx-auto mb-2 text-slate-200" />
                    Nenhuma conta encontrada
                  </td>
                </tr>
              )}

              {!loading && filtrados.map(item => (
                <tr key={item.id} className={cn('border-b border-slate-50 hover:bg-slate-50 transition-colors', !item.ativo && 'opacity-50')}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-mono text-slate-700 font-semibold">{item.codigo}</span>
                  </td>
                  <td className="px-4 py-3 min-w-[280px]">
                    <div className="flex items-center gap-2" style={{ paddingLeft: `${nivelConta(item.codigo) * 16}px` }}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', item.tipo === 'A' ? 'bg-emerald-500' : item.tipo === 'S' ? 'bg-blue-500' : 'bg-slate-700')} />
                      <span className="font-medium text-slate-700">{item.descricao}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', TIPO_BADGE[item.tipo])}>
                      {TIPO_LABEL[item.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[260px] truncate">
                    {item.pai_codigo ? `${item.pai_codigo} — ${item.pai_descricao || ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleAtivo(item)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors',
                        item.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      )}
                    >
                      {item.ativo ? <Power className="w-3 h-3" /> : <PowerOff className="w-3 h-3" />}
                      {item.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        title="Editar"
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => excluir(item)}
                        title="Inativar"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {editId ? 'Editar conta' : 'Nova conta contábil'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dados usados no select de Plano de Contas do contas a pagar
                </p>
              </div>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                  {errors._geral}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Código" name="codigo" required errors={errors}>
                  <input className={cn(inp, errors.codigo && 'border-red-300')}
                    value={form.codigo}
                    onChange={e => set('codigo', e.target.value)}
                    placeholder="Ex: 4.13.1" />
                </Field>

                <Field label="Tipo" name="tipo" required errors={errors}>
                  <select className={inp} value={form.tipo} onChange={e => set('tipo', e.target.value as PlanoTipo)}>
                    <option value="T">Totalizador</option>
                    <option value="S">Subtotal</option>
                    <option value="A">Analítico</option>
                  </select>
                </Field>

                <Field label="Descrição" name="descricao" required errors={errors} col2>
                  <input className={cn(inp, errors.descricao && 'border-red-300')}
                    value={form.descricao}
                    onChange={e => set('descricao', e.target.value)}
                    placeholder="Nome da conta" />
                </Field>

                <Field label="Conta superior" name="pai_id" errors={errors} col2>
                  <select
                    className={inp}
                    value={form.pai_id ?? ''}
                    onChange={e => set('pai_id', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Sem conta superior</option>
                    {opcoesPai.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.codigo} — {item.descricao}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.ativo}
                      onChange={e => set('ativo', e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Conta ativa
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={closeForm}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60">
                {saving ? 'Salvando…' : <><Check className="w-3.5 h-3.5" /> Salvar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
