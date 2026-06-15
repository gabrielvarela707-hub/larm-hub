'use client'

/**
 * Cadastro auxiliar de índices econômicos mensais.
 * Mantém IGP-M, IPCA e INCC para uso futuro em correções financeiras e boletos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  History,
  Loader2,
  Pencil,
  RefreshCcw,
  Save,
  TrendingUp,
  X,
} from 'lucide-react'
import { apiClient, useAuthStore } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface EconomicIndexRecord {
  id: number
  referencia: string
  igpm: number
  ipca: number
  incc: number | null
  incc_acumulado_12m: number | null
  atualizado_por: string | null
  created_at: string
  updated_at: string
}

function currentReferenceMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function formatReferenceMonth(value: string) {
  const [year, month] = String(value || '').split('-').map(Number)
  if (!year || !month) return value
  const formatted = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, 1))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatIndexPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })}%`
}

function formatDateTimeBR(value: string) {
  try { return new Date(value).toLocaleString('pt-BR') } catch { return value }
}

function toInput(value: number | null | undefined) {
  if (value === null || value === undefined) return ''
  return String(value).replace('.', ',')
}

function apiError(err: unknown, fallback: string) {
  return (err as { response?: { data?: { message?: string } } }).response?.data?.message || fallback
}

export default function AtualizacaoIndicesPage() {
  const user = useAuthStore(state => state.user)
  const [records, setRecords] = useState<EconomicIndexRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [reference, setReference] = useState(currentReferenceMonth())
  const [igpm, setIgpm] = useState('')
  const [ipca, setIpca] = useState('')
  const [incc, setIncc] = useState('')
  const [inccAccumulated, setInccAccumulated] = useState('')
  const [status, setStatus] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const canEdit = ['super_admin', 'admin', 'manager', 'controller', 'financial'].includes(user?.role || '')

  const years = useMemo(() => {
    const values = Array.from(new Set(records.map(item => item.referencia.slice(0, 4))))
    return values.sort((a, b) => Number(b) - Number(a))
  }, [records])

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    try {
      const response = await apiClient.get<{ ok: boolean; data: EconomicIndexRecord[] }>('/financeiro/indices-economicos')
      setRecords(response.data.data || [])
    } catch (err: unknown) {
      setStatus({ type: 'error', text: apiError(err, 'Erro ao carregar o histórico de índices econômicos.') })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function resetForm() {
    setEditingId(null)
    setReference(currentReferenceMonth())
    setIgpm('')
    setIpca('')
    setIncc('')
    setInccAccumulated('')
  }

  function edit(item: EconomicIndexRecord) {
    setEditingId(item.id)
    setReference(item.referencia)
    setIgpm(toInput(item.igpm))
    setIpca(toInput(item.ipca))
    setIncc(toInput(item.incc))
    setInccAccumulated(toInput(item.incc_acumulado_12m))
    setStatus(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    if (!reference || !igpm.trim() || !ipca.trim() || !incc.trim()) {
      setStatus({ type: 'error', text: 'Informe o mês de referência, o IGP-M, o IPCA e o INCC.' })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      const response = await apiClient.post<{ ok: boolean; message?: string }>('/financeiro/indices-economicos', {
        referencia: reference,
        igpm,
        ipca,
        incc,
        incc_acumulado_12m: inccAccumulated || null,
      })
      await load()
      resetForm()
      setStatus({ type: 'ok', text: response.data.message || 'Índices atualizados com sucesso.' })
    } catch (err: unknown) {
      setStatus({ type: 'error', text: apiError(err, 'Erro ao salvar os índices econômicos.') })
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Atualização de Índices</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastro mensal de IGP-M, IPCA e INCC para histórico e cálculos financeiros futuros.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCcw className={cn('h-4 w-4', loading && 'animate-spin')} /> Atualizar histórico
        </button>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {editingId ? 'Editar mês de referência' : 'Novo mês de referência'}
            </h2>
            <p className="text-xs text-slate-500">Informe os percentuais mensais. Valores negativos são aceitos.</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Mês de referência</label>
            <input
              type="month"
              value={reference}
              onChange={event => setReference(event.target.value)}
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">IGP-M mensal (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={igpm}
              onChange={event => setIgpm(event.target.value)}
              placeholder="Ex.: -0,49"
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">IPCA mensal (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={ipca}
              onChange={event => setIpca(event.target.value)}
              placeholder="Ex.: 0,26"
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">INCC mensal (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={incc}
              onChange={event => setIncc(event.target.value)}
              placeholder="Ex.: 0,77"
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">INCC acumulado 12 meses (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={inccAccumulated}
              onChange={event => setInccAccumulated(event.target.value)}
              placeholder="Ex.: 6,82"
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
        </div>

        {status && (
          <div className={cn(
            'mt-4 flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm',
            status.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          )}>
            {status.type === 'ok' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {status.text}
          </div>
        )}

        {!canEdit && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            Seu perfil possui acesso somente para consulta do histórico.
          </div>
        )}

        {canEdit && (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <X className="h-4 w-4" /> Cancelar edição
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#162d4a] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : editingId ? 'Atualizar índices' : 'Salvar índices'}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100">
              <History className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Histórico mensal</h2>
              <p className="text-xs text-slate-500">{records.length} mês(es) cadastrado(s){years.length ? ` em ${years.join(', ')}` : ''}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : records.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp className="mx-auto mb-3 h-9 w-9 text-slate-200" />
            <p className="text-sm font-medium text-slate-600">Nenhum índice cadastrado</p>
            <p className="mt-1 text-xs text-slate-400">Execute o seed inicial ou cadastre o primeiro mês acima.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Mês de referência</th>
                  <th className="px-4 py-3 text-right font-semibold">IGP-M mensal</th>
                  <th className="px-4 py-3 text-right font-semibold">IPCA mensal</th>
                  <th className="px-4 py-3 text-right font-semibold">INCC mensal</th>
                  <th className="px-4 py-3 text-right font-semibold">INCC 12 meses</th>
                  <th className="px-4 py-3 font-semibold">Atualizado por</th>
                  <th className="px-4 py-3 font-semibold">Última atualização</th>
                  {canEdit && <th className="px-4 py-3 text-right font-semibold">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {records.map(item => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{formatReferenceMonth(item.referencia)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{formatIndexPercent(item.igpm)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{formatIndexPercent(item.ipca)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{formatIndexPercent(item.incc)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatIndexPercent(item.incc_acumulado_12m)}</td>
                    <td className="px-4 py-3 text-slate-600">{item.atualizado_por || 'Seed inicial'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDateTimeBR(item.updated_at)}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => edit(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-white hover:text-blue-700"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
