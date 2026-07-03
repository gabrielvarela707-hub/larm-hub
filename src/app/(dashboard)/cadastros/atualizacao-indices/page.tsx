'use client'

/**
 * Cadastro auxiliar flexível de índices econômicos mensais.
 * Permite cadastrar novos tipos de índice sem alterar a estrutura da tela ou do banco.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Tag,
  TrendingUp,
  X,
} from 'lucide-react'
import { apiClient, useAuthStore } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface EconomicIndexType {
  id: number
  codigo: string
  nome: string
  fonte: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

interface EconomicIndexRecord {
  id: number
  indice_tipo_id: number
  codigo: string
  nome: string
  fonte: string | null
  referencia: string
  variacao_mensal: number
  variacao_periodo: number | null
  acumulado_12m: number | null
  atualizado_por: string | null
  created_at: string
  updated_at: string
}

type StatusMessage = { type: 'ok' | 'error'; text: string } | null

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
  const [types, setTypes] = useState<EconomicIndexType[]>([])
  const [records, setRecords] = useState<EconomicIndexRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingType, setCreatingType] = useState(false)
  const [showNewType, setShowNewType] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [filterTypeId, setFilterTypeId] = useState('')
  const [reference, setReference] = useState(currentReferenceMonth())
  const [monthlyVariation, setMonthlyVariation] = useState('')
  const [periodVariation, setPeriodVariation] = useState('')
  const [accumulated12m, setAccumulated12m] = useState('')
  const [newTypeCode, setNewTypeCode] = useState('')
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeSource, setNewTypeSource] = useState('')
  const [status, setStatus] = useState<StatusMessage>(null)

  const canEdit = ['super_admin', 'admin', 'manager', 'controller', 'financial'].includes(user?.role || '')

  const filteredRecords = useMemo(() => {
    if (!filterTypeId) return records
    return records.filter(item => String(item.indice_tipo_id) === filterTypeId)
  }, [filterTypeId, records])

  const years = useMemo(() => {
    const values = Array.from(new Set(filteredRecords.map(item => item.referencia.slice(0, 4))))
    return values.sort((a, b) => Number(b) - Number(a))
  }, [filteredRecords])

  const load = useCallback(async () => {
    setLoading(true)
    setStatus(null)
    try {
      const [typesResponse, recordsResponse] = await Promise.all([
        apiClient.get<{ ok: boolean; data: EconomicIndexType[] }>('/financeiro/indices-economicos/tipos'),
        apiClient.get<{ ok: boolean; data: EconomicIndexRecord[] }>('/financeiro/indices-economicos/valores'),
      ])

      const loadedTypes = typesResponse.data.data || []
      setTypes(loadedTypes)
      setRecords(recordsResponse.data.data || [])
      setSelectedTypeId(current => current || (loadedTypes[0] ? String(loadedTypes[0].id) : ''))
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
    setMonthlyVariation('')
    setPeriodVariation('')
    setAccumulated12m('')
  }

  function resetTypeForm() {
    setNewTypeCode('')
    setNewTypeName('')
    setNewTypeSource('')
    setShowNewType(false)
  }

  function edit(item: EconomicIndexRecord) {
    setEditingId(item.id)
    setSelectedTypeId(String(item.indice_tipo_id))
    setReference(item.referencia)
    setMonthlyVariation(toInput(item.variacao_mensal))
    setPeriodVariation(toInput(item.variacao_periodo))
    setAccumulated12m(toInput(item.acumulado_12m))
    setStatus(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function createType() {
    if (!newTypeCode.trim() || !newTypeName.trim()) {
      setStatus({ type: 'error', text: 'Informe o código e o nome do novo índice.' })
      return
    }

    setCreatingType(true)
    setStatus(null)
    try {
      const response = await apiClient.post<{ ok: boolean; message?: string; data: EconomicIndexType }>(
        '/financeiro/indices-economicos/tipos',
        {
          codigo: newTypeCode,
          nome: newTypeName,
          fonte: newTypeSource || null,
        }
      )

      const savedType = response.data.data
      const typesResponse = await apiClient.get<{ ok: boolean; data: EconomicIndexType[] }>('/financeiro/indices-economicos/tipos')
      setTypes(typesResponse.data.data || [])
      setSelectedTypeId(String(savedType.id))
      resetTypeForm()
      setStatus({ type: 'ok', text: response.data.message || 'Índice cadastrado com sucesso.' })
    } catch (err: unknown) {
      setStatus({ type: 'error', text: apiError(err, 'Erro ao cadastrar o novo índice.') })
    } finally {
      setCreatingType(false)
    }
  }

  async function save() {
    if (!selectedTypeId || !reference || !monthlyVariation.trim()) {
      setStatus({ type: 'error', text: 'Informe o índice, o mês de referência e a variação mensal.' })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      const response = await apiClient.post<{ ok: boolean; message?: string }>('/financeiro/indices-economicos/valores', {
        indice_tipo_id: Number(selectedTypeId),
        referencia: reference,
        variacao_mensal: monthlyVariation,
        variacao_periodo: periodVariation || null,
        acumulado_12m: accumulated12m || null,
      })
      await load()
      resetForm()
      setStatus({ type: 'ok', text: response.data.message || 'Índice atualizado com sucesso.' })
    } catch (err: unknown) {
      setStatus({ type: 'error', text: apiError(err, 'Erro ao salvar o índice econômico.') })
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
            Cadastre qualquer índice econômico e mantenha o histórico mensal para cálculos financeiros futuros.
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {editingId ? 'Editar índice do mês' : 'Novo valor mensal'}
              </h2>
              <p className="text-xs text-slate-500">Valores negativos são aceitos. Os campos de período e 12 meses são opcionais.</p>
            </div>
          </div>
          {canEdit && !editingId && (
            <button
              type="button"
              onClick={() => setShowNewType(value => !value)}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              {showNewType ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showNewType ? 'Fechar cadastro' : 'Cadastrar novo índice'}
            </button>
          )}
        </div>

        {showNewType && canEdit && !editingId && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-xs font-semibold text-slate-800">Novo tipo de índice</p>
                <p className="text-[11px] text-slate-500">Depois de criado, o índice ficará disponível no seletor e no histórico.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[160px_1fr_1fr_auto] md:items-end">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Código</label>
                <input
                  type="text"
                  value={newTypeCode}
                  onChange={event => setNewTypeCode(event.target.value.toUpperCase())}
                  placeholder="Ex.: SELIC"
                  maxLength={30}
                  disabled={creatingType}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Nome do índice</label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={event => setNewTypeName(event.target.value)}
                  placeholder="Ex.: Taxa Selic"
                  maxLength={120}
                  disabled={creatingType}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600">Fonte</label>
                <input
                  type="text"
                  value={newTypeSource}
                  onChange={event => setNewTypeSource(event.target.value)}
                  placeholder="Ex.: Banco Central"
                  maxLength={160}
                  disabled={creatingType}
                  className={inputClass}
                />
              </div>
              <button
                type="button"
                onClick={createType}
                disabled={creatingType}
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creatingType ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar índice
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Índice</label>
            <select
              value={selectedTypeId}
              onChange={event => setSelectedTypeId(event.target.value)}
              disabled={!canEdit || saving || Boolean(editingId)}
              className={inputClass}
            >
              <option value="">Selecione...</option>
              {types.map(item => (
                <option key={item.id} value={item.id}>{item.codigo} — {item.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Mês de referência</label>
            <input
              type="month"
              value={reference}
              onChange={event => setReference(event.target.value)}
              disabled={!canEdit || saving || Boolean(editingId)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Variação mensal (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={monthlyVariation}
              onChange={event => setMonthlyVariation(event.target.value)}
              placeholder="Ex.: -0,21"
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Variação no período (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={periodVariation}
              onChange={event => setPeriodVariation(event.target.value)}
              placeholder="Ex.: 4,42"
              disabled={!canEdit || saving}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Acumulado 12 meses (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={accumulated12m}
              onChange={event => setAccumulated12m(event.target.value)}
              placeholder="Ex.: 5,1804"
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
              disabled={saving || types.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#162d4a] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : editingId ? 'Atualizar índice' : 'Salvar índice'}
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
              <p className="text-xs text-slate-500">
                {filteredRecords.length} registro(s){years.length ? ` em ${years.join(', ')}` : ''} · {types.length} índice(s) disponível(is)
              </p>
            </div>
          </div>
          <select
            value={filterTypeId}
            onChange={event => setFilterTypeId(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 outline-none focus:border-blue-400"
          >
            <option value="">Todos os índices</option>
            {types.map(item => <option key={item.id} value={item.id}>{item.codigo}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingUp className="mx-auto mb-3 h-9 w-9 text-slate-200" />
            <p className="text-sm font-medium text-slate-600">Nenhum índice cadastrado</p>
            <p className="mt-1 text-xs text-slate-400">Execute o seed inicial ou cadastre o primeiro valor acima.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Índice</th>
                  <th className="px-4 py-3 font-semibold">Fonte</th>
                  <th className="px-4 py-3 font-semibold">Mês de referência</th>
                  <th className="px-4 py-3 text-right font-semibold">Variação mensal</th>
                  <th className="px-4 py-3 text-right font-semibold">Variação no período</th>
                  <th className="px-4 py-3 text-right font-semibold">Acumulado 12 meses</th>
                  <th className="px-4 py-3 font-semibold">Atualizado por</th>
                  <th className="px-4 py-3 font-semibold">Última atualização</th>
                  {canEdit && <th className="px-4 py-3 text-right font-semibold">Ação</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(item => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">{item.codigo}</p>
                      <p className="max-w-[240px] truncate text-xs text-slate-500" title={item.nome}>{item.nome}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.fonte || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{formatReferenceMonth(item.referencia)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{formatIndexPercent(item.variacao_mensal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatIndexPercent(item.variacao_periodo)}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-600">{formatIndexPercent(item.acumulado_12m)}</td>
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
