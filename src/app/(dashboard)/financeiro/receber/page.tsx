'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, Loader2, Plus, Search } from 'lucide-react'
import TableFloatingNav from '@/components/table-floating-nav'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

type StatusReceber = 'aberta' | 'atrasada' | 'paga' | 'cancelada'
type SortKey = 'cliente' | 'contrato' | 'receita' | 'parcela' | 'valor' | 'vencimento' | 'recebimento' | 'status'
type SortDirection = 'asc' | 'desc'

type ParcelaReceber = {
  id: string
  contrato_id: string
  receita_id?: string | null
  numero: number
  tipo: string
  status: StatusReceber
  vencimento: string
  pago_em?: string | null
  forma_pagamento?: string | null
  origem_baixa?: string | null
  conciliado_em?: string | null
  movimento_id?: number | null
  movimento_banco?: string | null
  movimento_historico?: string | null
  valor_total: number
  valor_pago: number
  contrato_numero?: string | null
  contrato_titulo?: string | null
  cliente_id?: number | null
  cliente_nome?: string | null
  cliente_documento?: string | null
  cliente_ativo?: boolean
  receita_titulo?: string | null
  receita_documento?: string | null
  documento_legado?: string | null
  parcela_numero_legado?: number | null
  parcela_total_legado?: number | null
  tipo_receita_nome?: string | null
  obra_nome?: string | null
  unidade_nome?: string | null
}

type Summary = {
  total: number
  total_em_aberto: number
  total_atrasadas: number
  total_pagas: number
  valor_em_aberto: number
  valor_atrasado: number
  valor_recebido: number
}

type FilterOption = { id: number; nome: string; codigo?: string; cpf_cnpj?: string; ativo?: boolean }

type FilterData = {
  clientes: FilterOption[]
  tipos_receita: FilterOption[]
  obras: FilterOption[]
}

const EMPTY_SUMMARY: Summary = {
  total: 0,
  total_em_aberto: 0,
  total_atrasadas: 0,
  total_pagas: 0,
  valor_em_aberto: 0,
  valor_atrasado: 0,
  valor_recebido: 0,
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const raw = String(value).slice(0, 10)
  const [year, month, day] = raw.split('-')
  return year && month && day ? `${day}/${month}/${year}` : raw
}

function statusLabel(status: StatusReceber) {
  if (status === 'paga') return 'recebida'
  if (status === 'aberta') return 'em aberto'
  return status
}

function statusClass(status: StatusReceber) {
  if (status === 'paga') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (status === 'atrasada') return 'bg-red-50 text-red-700 border-red-200'
  if (status === 'cancelada') return 'bg-slate-100 text-slate-600 border-slate-200'
  return 'bg-amber-50 text-amber-700 border-amber-200'
}


function requestErrorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } }
  return responseError?.response?.data?.message || fallback
}

function origemBaixaLabel(row: ParcelaReceber) {
  if (row.movimento_id || row.origem_baixa === 'conciliacao_bancaria') return 'Conciliação bancária'
  if (row.origem_baixa === 'importacao_historica') return 'Importação histórica'
  if (row.status === 'paga') return 'Baixa registrada'
  return 'Aguardando conciliação'
}

export default function ContasReceberPage() {
  const [rows, setRows] = useState<ParcelaReceber[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [filters, setFilters] = useState<FilterData>({ clientes: [], tipos_receita: [], obras: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [limit] = useState(50)

  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [tipoReceitaId, setTipoReceitaId] = useState('')
  const [obraId, setObraId] = useState('')
  const [vencimentoInicio, setVencimentoInicio] = useState(firstDayOfCurrentMonth())
  const [vencimentoFim, setVencimentoFim] = useState('')
  const [status, setStatus] = useState('todos')
  const [sort, setSort] = useState<SortKey>('vencimento')
  const [direction, setDirection] = useState<SortDirection>('asc')

  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableMinWidth = 1660

  const requestParams = useMemo(() => ({
    page,
    limit,
    busca: busca || undefined,
    cliente_id: clienteId || undefined,
    tipo_receita_id: tipoReceitaId || undefined,
    obra_id: obraId || undefined,
    venc_inicio: vencimentoInicio || undefined,
    venc_fim: vencimentoFim || undefined,
    status,
    sort,
    direction,
  }), [page, limit, busca, clienteId, tipoReceitaId, obraId, vencimentoInicio, vencimentoFim, status, sort, direction])

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  const loadFilters = useCallback(async () => {
    try {
      const response = await apiClient.get('/financeiro/contas-receber/filtros')
      setFilters(response.data?.data || { clientes: [], tipos_receita: [], obras: [] })
    } catch {
      setFilters({ clientes: [], tipos_receita: [], obras: [] })
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiClient.get('/financeiro/contas-receber', { params: requestParams })
      setRows(response.data?.data || [])
      setSummary({ ...EMPTY_SUMMARY, ...(response.data?.summary || {}) })
      setPages(Math.max(1, Number(response.data?.pages || 1)))
    } catch (requestError: unknown) {
      setRows([])
      setSummary(EMPTY_SUMMARY)
      setPages(1)
      setError(requestErrorMessage(requestError, 'Não foi possível carregar o Contas a Receber.'))
    } finally {
      setLoading(false)
    }
  }, [requestParams])

  useEffect(() => { loadFilters() }, [loadFilters])
  useEffect(() => { load() }, [load])

  const handleSort = (key: SortKey) => {
    if (sort === key) setDirection(current => current === 'asc' ? 'desc' : 'asc')
    else {
      setSort(key)
      setDirection('asc')
    }
    setPage(1)
  }

  const resetFilters = () => {
    setBusca('')
    setClienteId('')
    setTipoReceitaId('')
    setObraId('')
    setVencimentoInicio(firstDayOfCurrentMonth())
    setVencimentoFim('')
    setStatus('todos')
    setSort('vencimento')
    setDirection('asc')
    setPage(1)
  }

  const exportExcel = async () => {
    setError('')
    try {
      const params: Record<string, unknown> = { ...requestParams }
      delete params.page
      delete params.limit
      const response = await apiClient.get('/financeiro/contas-receber/exportar', { params, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'contas-a-receber.xls'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível exportar o Contas a Receber.'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Contas a Receber</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {summary.total} parcelas · {formatCurrency(summary.valor_em_aberto)} em aberto
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" /> Exportar Excel
          </button>
          <button
            type="button"
            disabled
            title="O formulário será implementado após o envio da tela de lançamento de receita."
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" /> Novo Lançamento de Receita
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
          <FilterField label="Busca" className="xl:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={busca}
                onChange={event => setBusca(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    setPage(1)
                    load()
                  }
                }}
                placeholder="Cliente, contrato, receita, obra ou documento..."
                className={`${inputClass} pl-9`}
              />
            </div>
          </FilterField>

          <FilterField label="Cliente">
            <select value={clienteId} onChange={event => { setClienteId(event.target.value); setPage(1) }} className={inputClass}>
              <option value="">Todos clientes</option>
              {filters.clientes.map(option => (
                <option key={option.id} value={option.id}>
                  {option.nome}{option.ativo === false ? ' — inativo' : ''}
                </option>
              ))}
            </select>
          </FilterField>

          <FilterField label="Tipo de receita">
            <select value={tipoReceitaId} onChange={event => { setTipoReceitaId(event.target.value); setPage(1) }} className={inputClass}>
              <option value="">Todos tipos</option>
              {filters.tipos_receita.map(option => <option key={option.id} value={option.id}>{option.nome}</option>)}
            </select>
          </FilterField>

          <FilterField label="Obra">
            <select value={obraId} onChange={event => { setObraId(event.target.value); setPage(1) }} className={inputClass}>
              <option value="">Todas obras</option>
              {filters.obras.map(option => <option key={option.id} value={option.id}>{option.nome}</option>)}
            </select>
          </FilterField>

          <FilterField label="Vencimento de">
            <input type="date" value={vencimentoInicio} onChange={event => { setVencimentoInicio(event.target.value); setPage(1) }} className={inputClass} />
          </FilterField>

          <FilterField label="Vencimento até">
            <input type="date" value={vencimentoFim} onChange={event => { setVencimentoFim(event.target.value); setPage(1) }} className={inputClass} />
          </FilterField>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-3">
          <p className="text-[10px] text-slate-400">
            A tela inicia no primeiro dia do mês atual. Altere “Vencimento de” para consultar períodos anteriores.
          </p>
          <div className="flex items-center gap-2">
            <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700">
              <option value="todos">Todos status</option>
              <option value="em_aberto">Em aberto</option>
              <option value="aberta">Abertas</option>
              <option value="atrasada">Atrasadas</option>
              <option value="paga">Recebidas</option>
              <option value="cancelada">Canceladas</option>
            </select>
            <button type="button" onClick={resetFilters} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Limpar filtros
            </button>
            <button type="button" onClick={() => { setPage(1); load() }} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
              Buscar
            </button>
          </div>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryBox label="Em aberto" quantity={summary.total_em_aberto} value={summary.valor_em_aberto} valueClass="text-amber-700" />
        <SummaryBox label="Atrasadas" quantity={summary.total_atrasadas} value={summary.valor_atrasado} valueClass="text-red-600" />
        <SummaryBox label="Recebidas no filtro" quantity={summary.total_pagas} value={summary.valor_recebido} valueClass="text-emerald-600" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div
          ref={topScrollRef}
          onScroll={event => syncHorizontalScroll(event.currentTarget, tableScrollRef.current)}
          className="h-4 overflow-x-auto overflow-y-hidden border-b border-slate-100 bg-slate-50/70"
          title="Barra de rolagem horizontal da tabela"
        >
          <div style={{ width: tableMinWidth }} className="h-1" />
        </div>

        <div
          ref={tableScrollRef}
          onScroll={event => syncHorizontalScroll(event.currentTarget, topScrollRef.current)}
          className="max-h-[70vh] overflow-auto"
        >
          <table className="w-full table-fixed text-xs" style={{ minWidth: tableMinWidth }}>
            <colgroup>
              <col style={{ width: 245 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 230 }} />
              <col style={{ width: 245 }} />
              <col style={{ width: 135 }} />
              <col style={{ width: 85 }} />
              <col style={{ width: 125 }} />
              <col style={{ width: 115 }} />
              <col style={{ width: 175 }} />
              <col style={{ width: 115 }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d1b2a] text-white">
                <SortHeader label="Cliente" sortKey="cliente" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Contrato" sortKey="contrato" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Receita" sortKey="receita" active={sort} direction={direction} onSort={handleSort} />
                <th className="px-3 py-3 text-left">Obra / Unidade</th>
                <th className="px-3 py-3 text-left">Documento</th>
                <SortHeader label="Parcela" sortKey="parcela" active={sort} direction={direction} onSort={handleSort} align="center" />
                <SortHeader label="Valor" sortKey="valor" active={sort} direction={direction} onSort={handleSort} align="right" />
                <SortHeader label="Vencimento" sortKey="vencimento" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Recebimento" sortKey="recebimento" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Status" sortKey="status" active={sort} direction={direction} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-14 text-center text-slate-400"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Carregando recebíveis...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="py-14 text-center text-slate-400">Nenhuma parcela encontrada para os filtros selecionados.</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/70 align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-slate-800 truncate" title={row.cliente_nome || ''}>{row.cliente_nome || 'Cliente não informado'}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">{row.cliente_documento || 'Sem documento'}</span>
                      {row.cliente_ativo === false && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">inativo</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-700 truncate" title={row.contrato_titulo || ''}>{row.contrato_numero || '—'}</p>
                    <p className="mt-1 text-[10px] text-slate-400 truncate" title={row.contrato_titulo || ''}>{row.contrato_titulo || 'Contrato'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-slate-700 truncate" title={row.receita_titulo || ''}>{row.receita_titulo || row.tipo_receita_nome || 'Receita'}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{row.tipo_receita_nome || row.tipo || '—'}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-slate-700 truncate" title={row.obra_nome || ''}>{row.obra_nome || '—'}</p>
                    <p className="mt-1 text-[10px] text-slate-400 truncate" title={row.unidade_nome || ''}>Unidade: {row.unidade_nome || '—'}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-600 truncate" title={row.receita_documento || row.documento_legado || ''}>
                    {row.receita_documento || row.documento_legado || '—'}
                  </td>
                  <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">
                    {row.parcela_numero_legado || row.numero || '—'}{row.parcela_total_legado ? `/${row.parcela_total_legado}` : ''}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                    {formatCurrency(row.valor_total)}
                  </td>
                  <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDate(row.vencimento)}</td>
                  <td className="px-3 py-3">
                    <p className={cn('whitespace-nowrap', row.status === 'paga' ? 'text-emerald-700 font-medium' : 'text-slate-400')}>
                      {row.status === 'paga' ? formatDate(row.pago_em || row.conciliado_em) : '—'}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400 truncate" title={origemBaixaLabel(row)}>{origemBaixaLabel(row)}</p>
                    {row.movimento_banco && <p className="mt-0.5 text-[10px] text-slate-400 truncate">Banco: {row.movimento_banco}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusClass(row.status))}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">Página {page} de {pages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40">
              Anterior
            </button>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage(current => Math.min(pages, current + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40">
              Próxima
            </button>
          </div>
        </div>
      </div>

      {!loading && rows.length > 0 ? <TableFloatingNav scrollRef={tableScrollRef} /> : null}
    </div>
  )
}

function FilterField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium text-slate-500">{label}</label>
      {children}
    </div>
  )
}

function SummaryBox({ label, quantity, value, valueClass }: { label: string; quantity: number; value: number; valueClass: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium text-slate-400">{label} · {quantity} parcelas</p>
      <p className={cn('mt-1 text-lg font-bold', valueClass)}>{formatCurrency(value)}</p>
    </div>
  )
}

function SortHeader({ label, sortKey, active, direction, onSort, align = 'left' }: {
  label: string
  sortKey: SortKey
  active: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
  align?: 'left' | 'center' | 'right'
}) {
  return (
    <th className={cn('px-3 py-3', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-semibold">
        {label}<span className="text-[9px] text-slate-400">{active === sortKey ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
