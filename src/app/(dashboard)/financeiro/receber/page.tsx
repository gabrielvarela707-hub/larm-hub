'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Calculator,
  Check,
  Download,
  Landmark,
  Loader2,
  Plus,
  Printer,
  Search,
  Settings,
  Upload,
  X,
} from 'lucide-react'
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
  valor_nominal: number
  valor_convertido?: number
  valor_correcao?: number
  valor_multa?: number
  valor_juros_mora?: number
  valor_outros_acrescimos?: number
  valor_seguro?: number
  valor_desconto?: number
  valor_recalculado?: number | null
  data_recalculo?: string | null
  recalculado_em?: string | null
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
  indice_codigo?: string | null
  indice_nome?: string | null
  indice_codigo_legado?: string | null
  nosso_numero?: string | null
  linha_digitavel?: string | null
  boleto_status?: string | null
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
type FilterData = { clientes: FilterOption[]; tipos_receita: FilterOption[]; obras: FilterOption[] }

type Recalculation = {
  parcela_id: string
  cliente_nome: string
  contrato_numero: string
  vencimento: string
  data_calculo: string
  dias_atraso: number
  valor_base: number
  indice?: { id: number; codigo: string; nome: string; fonte?: string; defasagem_meses: number } | null
  percentual_indice_calculado: number
  percentual_indice_aplicado: number
  valor_correcao: number
  valor_corrigido: number
  percentual_multa: number
  valor_multa: number
  percentual_mora_mes: number
  valor_juros_mora: number
  valor_outros_acrescimos: number
  valor_seguro: number
  valor_desconto: number
  valor_final: number
  meses: Array<{ mes_correcao: string; referencia_indice: string; variacao_mensal: number | null; encontrado: boolean }>
  referencias_ausentes: string[]
  avisos: string[]
}

type RecalcForm = {
  data_calculo: string
  percentual_indice: string
  percentual_multa: string
  percentual_mora_mes: string
  outros_acrescimos: string
  seguro: string
  desconto: string
}

type BradescoConfig = {
  id?: number
  empresa: string
  codigo_empresa: string
  beneficiario_nome: string
  beneficiario_documento: string
  agencia: string
  agencia_dv: string
  conta: string
  conta_dv: string
  carteira: string
  especie_documento: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  local_pagamento: string
  instrucoes: string
  multa_percentual_padrao: number | string
  mora_percentual_mes_padrao: number | string
  homologado: boolean
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

const EMPTY_CONFIG: BradescoConfig = {
  empresa: 'LARM',
  codigo_empresa: '00000000000004352309',
  beneficiario_nome: 'LARM PARTICIPACOES LTDA',
  beneficiario_documento: '59786491000190',
  agencia: '2370',
  agencia_dv: '',
  conta: '27458',
  conta_dv: '5',
  carteira: '09',
  especie_documento: '01',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  local_pagamento: 'PAGÁVEL PREFERENCIALMENTE NA REDE BRADESCO OU EM QUALQUER BANCO ATÉ O VENCIMENTO.',
  instrucoes: 'APÓS O VENCIMENTO, RECALCULAR O TÍTULO ANTES DA EMISSÃO.',
  multa_percentual_padrao: 2,
  mora_percentual_mes_padrao: 1,
  homologado: false,
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}%`
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
  if (row.origem_baixa === 'retorno_bradesco') return 'Retorno Bradesco'
  if (row.movimento_id || row.origem_baixa === 'conciliacao_bancaria') return 'Conciliação bancária'
  if (row.origem_baixa === 'importacao_historica') return 'Importação histórica'
  if (row.status === 'paga') return 'Baixa registrada'
  return 'Aguardando conciliação'
}

function filenameFromDisposition(value?: string) {
  const match = String(value || '').match(/filename="?([^";]+)"?/i)
  return match?.[1] || 'remessa-bradesco.TST'
}

export default function ContasReceberPage() {
  const [rows, setRows] = useState<ParcelaReceber[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [filters, setFilters] = useState<FilterData>({ clientes: [], tipos_receita: [], obras: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [limit] = useState(50)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [busca, setBusca] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [tipoReceitaId, setTipoReceitaId] = useState('')
  const [obraId, setObraId] = useState('')
  const [vencimentoInicio, setVencimentoInicio] = useState(firstDayOfCurrentMonth())
  const [vencimentoFim, setVencimentoFim] = useState('')
  const [status, setStatus] = useState('todos')
  const [sort, setSort] = useState<SortKey>('vencimento')
  const [direction, setDirection] = useState<SortDirection>('asc')

  const [recalcRow, setRecalcRow] = useState<ParcelaReceber | null>(null)
  const [recalcForm, setRecalcForm] = useState<RecalcForm | null>(null)
  const [recalcData, setRecalcData] = useState<Recalculation | null>(null)
  const [recalcLoading, setRecalcLoading] = useState(false)
  const [recalcSaving, setRecalcSaving] = useState(false)
  const [recalcSaved, setRecalcSaved] = useState(false)
  const [recalcError, setRecalcError] = useState('')

  const [configOpen, setConfigOpen] = useState(false)
  const [config, setConfig] = useState<BradescoConfig>(EMPTY_CONFIG)
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState('')
  const [remittanceLoading, setRemittanceLoading] = useState(false)
  const [returnLoading, setReturnLoading] = useState(false)

  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const returnInputRef = useRef<HTMLInputElement | null>(null)
  const tableMinWidth = 2030

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

  const eligibleIds = useMemo(() => rows.filter(row => ['aberta', 'atrasada'].includes(row.status)).map(row => row.id), [rows])
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every(id => selected.has(id))

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
      setSelected(new Set())
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
      downloadBlob(response.data, 'contas-a-receber.xls')
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível exportar o Contas a Receber.'))
    }
  }

  const toggleSelected = (id: string) => {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected(current => {
      const next = new Set(current)
      if (allEligibleSelected) eligibleIds.forEach(id => next.delete(id))
      else eligibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const openRecalculate = async (row: ParcelaReceber) => {
    const form: RecalcForm = {
      data_calculo: todayIso(),
      percentual_indice: '',
      percentual_multa: '',
      percentual_mora_mes: '',
      outros_acrescimos: String(row.valor_outros_acrescimos || 0),
      seguro: String(row.valor_seguro || 0),
      desconto: String(row.valor_desconto || 0),
    }
    setRecalcRow(row)
    setRecalcForm(form)
    setRecalcData(null)
    setRecalcSaved(false)
    setRecalcError('')
    await previewRecalculation(row.id, form)
  }

  const recalcPayload = (form: RecalcForm) => ({
    data_calculo: form.data_calculo,
    percentual_indice: form.percentual_indice === '' ? undefined : Number(form.percentual_indice),
    percentual_multa: form.percentual_multa === '' ? undefined : Number(form.percentual_multa),
    percentual_mora_mes: form.percentual_mora_mes === '' ? undefined : Number(form.percentual_mora_mes),
    outros_acrescimos: Number(form.outros_acrescimos || 0),
    seguro: Number(form.seguro || 0),
    desconto: Number(form.desconto || 0),
  })

  const updateRecalcForm = (patch: Partial<RecalcForm>) => {
    setRecalcForm(current => current ? { ...current, ...patch } : current)
    setRecalcSaved(false)
  }

  const previewRecalculation = async (id = recalcRow?.id, form = recalcForm) => {
    if (!id || !form) return
    setRecalcLoading(true)
    setRecalcError('')
    try {
      const response = await apiClient.post(`/financeiro/contas-receber/${id}/recalculo/preview`, recalcPayload(form))
      setRecalcData(response.data?.data || null)
    } catch (requestError: unknown) {
      setRecalcData(null)
      setRecalcError(requestErrorMessage(requestError, 'Não foi possível calcular a parcela.'))
    } finally {
      setRecalcLoading(false)
    }
  }

  const saveRecalculation = async () => {
    if (!recalcRow || !recalcForm) return
    setRecalcSaving(true)
    setRecalcError('')
    try {
      const response = await apiClient.post(`/financeiro/contas-receber/${recalcRow.id}/recalcular`, recalcPayload(recalcForm))
      const savedData = response.data?.data || null
      setRecalcData(savedData)
      setRecalcSaved(true)
      setRecalcRow(current => current ? {
        ...current,
        valor_recalculado: Number(savedData?.valor_final || current.valor_recalculado || 0),
        data_recalculo: savedData?.data_calculo || current.data_recalculo,
      } : current)
      setSuccess(`Parcela recalculada para ${formatDate(savedData?.data_calculo)}.`)
      await load()
    } catch (requestError: unknown) {
      setRecalcSaved(false)
      setRecalcError(requestErrorMessage(requestError, 'Não foi possível salvar o recálculo.'))
    } finally {
      setRecalcSaving(false)
    }
  }

  const generateBoleto = async (row: ParcelaReceber, fromRecalculation = false) => {
    setError('')
    setSuccess('')
    const popup = window.open('', '_blank')
    if (popup) popup.document.write('<p style="font-family:Arial;padding:20px">Gerando boleto...</p>')
    try {
      const response = await apiClient.post(`/financeiro/contas-receber/${row.id}/bradesco/boleto`)
      const html = response.data?.data?.html
      if (!html) throw new Error('O banco não retornou o boleto para impressão.')
      if (popup) {
        popup.document.open()
        popup.document.write(html)
        popup.document.close()
      } else {
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
        window.open(url, '_blank')
      }
      setSuccess(response.data?.data?.homologado ? 'Boleto gerado.' : 'Boleto de homologação gerado. Valide antes do uso em produção.')
      await load()
    } catch (requestError: unknown) {
      popup?.close()
      const message = requestErrorMessage(requestError, 'Não foi possível gerar o boleto.')
      if (fromRecalculation) setRecalcError(message)
      else setError(message)
    }
  }

  const generateRemittance = async () => {
    if (!selected.size) return
    setRemittanceLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiClient.post(
        '/financeiro/contas-receber/bradesco/remessa',
        { parcela_ids: Array.from(selected) },
        { responseType: 'blob' },
      )
      const filename = filenameFromDisposition(response.headers?.['content-disposition'])
      downloadBlob(response.data, filename)
      setSuccess(`Remessa ${filename} gerada com ${selected.size} título(s).`)
      await load()
    } catch (requestError: unknown) {
      let message = 'Não foi possível gerar a remessa.'
      const blob = (requestError as { response?: { data?: Blob } }).response?.data
      if (blob instanceof Blob) {
        try {
          const parsed = JSON.parse(await blob.text())
          message = parsed.message || message
        } catch { /* mantém a mensagem padrão */ }
      } else {
        message = requestErrorMessage(requestError, message)
      }
      setError(message)
    } finally {
      setRemittanceLoading(false)
    }
  }

  const processReturnFile = async (file?: File) => {
    if (!file) return
    setReturnLoading(true)
    setError('')
    setSuccess('')
    try {
      const content = await file.text()
      const response = await apiClient.post('/financeiro/contas-receber/bradesco/retorno', {
        filename: file.name,
        content,
      })
      if (response.data?.duplicated) {
        setSuccess('Este retorno já havia sido processado. Nenhuma baixa foi duplicada.')
      } else {
        const result = response.data?.data
        setSuccess(
          `Retorno processado: ${result?.conciliados || 0} localizado(s), ` +
          `${result?.nao_localizados || 0} não localizado(s), ${formatCurrency(result?.valor_liquidado || 0)} liquidado.`,
        )
      }
      await load()
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível processar o retorno bancário.'))
    } finally {
      setReturnLoading(false)
      if (returnInputRef.current) returnInputRef.current.value = ''
    }
  }

  const openConfig = async () => {
    setConfigOpen(true)
    setConfigLoading(true)
    setConfigError('')
    try {
      const response = await apiClient.get('/financeiro/contas-receber/bradesco/config')
      setConfig({ ...EMPTY_CONFIG, ...(response.data?.data || {}) })
    } catch (requestError: unknown) {
      setConfigError(requestErrorMessage(requestError, 'Não foi possível carregar a configuração bancária.'))
      setConfig(EMPTY_CONFIG)
    } finally {
      setConfigLoading(false)
    }
  }

  const saveConfig = async () => {
    setConfigSaving(true)
    setConfigError('')
    try {
      const response = await apiClient.put('/financeiro/contas-receber/bradesco/config', config)
      setConfig({ ...EMPTY_CONFIG, ...(response.data?.data || {}) })
      setSuccess('Configuração Bradesco salva.')
      setConfigOpen(false)
    } catch (requestError: unknown) {
      setConfigError(requestErrorMessage(requestError, 'Não foi possível salvar a configuração bancária.'))
    } finally {
      setConfigSaving(false)
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
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <input
            ref={returnInputRef}
            type="file"
            accept=".ret,.RET,.txt"
            className="hidden"
            onChange={event => processReturnFile(event.target.files?.[0])}
          />
          <button type="button" onClick={() => returnInputRef.current?.click()} disabled={returnLoading} className={secondaryButtonClass}>
            {returnLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar Retorno
          </button>
          <button type="button" onClick={generateRemittance} disabled={!selected.size || remittanceLoading} className={secondaryButtonClass}>
            {remittanceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />}
            Gerar Remessa ({selected.size})
          </button>
          <button type="button" onClick={openConfig} className={secondaryButtonClass} title="Configuração Bradesco">
            <Settings className="w-3.5 h-3.5" /> Bradesco
          </button>
          <button type="button" onClick={exportExcel} className={secondaryButtonClass}>
            <Download className="w-3.5 h-3.5" /> Exportar Excel
          </button>
          <button type="button" disabled title="O formulário será implementado após o envio da tela de lançamento de receita." className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1e3a5f] text-white text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60">
            <Plus className="w-3.5 h-3.5" /> Novo Lançamento de Receita
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-800">
        Parcelas vencidas devem ser recalculadas para a data de recebimento antes da geração do boleto ou da remessa. Retornos Bradesco com liquidação confirmada dão baixa automaticamente.
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
          <FilterField label="Busca" className="xl:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={busca} onChange={event => setBusca(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { setPage(1); load() } }} placeholder="Cliente, contrato, receita, obra ou documento..." className={`${inputClass} pl-9`} />
            </div>
          </FilterField>
          <FilterField label="Cliente">
            <select value={clienteId} onChange={event => { setClienteId(event.target.value); setPage(1) }} className={inputClass}>
              <option value="">Todos clientes</option>
              {filters.clientes.map(option => <option key={option.id} value={option.id}>{option.nome}{option.ativo === false ? ' — inativo' : ''}</option>)}
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
          <p className="text-[10px] text-slate-400">A tela inicia no primeiro dia do mês atual. Altere “Vencimento de” para consultar períodos anteriores.</p>
          <div className="flex items-center gap-2">
            <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700">
              <option value="todos">Todos status</option><option value="em_aberto">Em aberto</option><option value="aberta">Abertas</option><option value="atrasada">Atrasadas</option><option value="paga">Recebidas</option><option value="cancelada">Canceladas</option>
            </select>
            <button type="button" onClick={resetFilters} className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50">Limpar filtros</button>
            <button type="button" onClick={() => { setPage(1); load() }} className="h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">Buscar</button>
          </div>
        </div>
      </div>

      {error && <Notice type="error" onClose={() => setError('')}>{error}</Notice>}
      {success && <Notice type="success" onClose={() => setSuccess('')}>{success}</Notice>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryBox label="Em aberto" quantity={summary.total_em_aberto} value={summary.valor_em_aberto} valueClass="text-amber-700" />
        <SummaryBox label="Atrasadas" quantity={summary.total_atrasadas} value={summary.valor_atrasado} valueClass="text-red-600" />
        <SummaryBox label="Recebidas no filtro" quantity={summary.total_pagas} value={summary.valor_recebido} valueClass="text-emerald-600" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div ref={topScrollRef} onScroll={event => syncHorizontalScroll(event.currentTarget, tableScrollRef.current)} className="h-4 overflow-x-auto overflow-y-hidden border-b border-slate-100 bg-slate-50/70" title="Barra de rolagem horizontal da tabela">
          <div style={{ width: tableMinWidth }} className="h-1" />
        </div>
        <div ref={tableScrollRef} onScroll={event => syncHorizontalScroll(event.currentTarget, topScrollRef.current)} className="max-h-[70vh] overflow-auto">
          <table className="w-full table-fixed text-xs" style={{ minWidth: tableMinWidth }}>
            <colgroup>
              <col style={{ width: 42 }} /><col style={{ width: 245 }} /><col style={{ width: 160 }} /><col style={{ width: 230 }} /><col style={{ width: 245 }} /><col style={{ width: 135 }} /><col style={{ width: 85 }} /><col style={{ width: 125 }} /><col style={{ width: 115 }} /><col style={{ width: 175 }} /><col style={{ width: 115 }} /><col style={{ width: 250 }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d1b2a] text-white">
                <th className="px-3 py-3 text-center"><input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} aria-label="Selecionar parcelas em aberto da página" /></th>
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
                <th className="px-3 py-3 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="py-14 text-center text-slate-400"><Loader2 className="inline w-4 h-4 animate-spin mr-2" />Carregando recebíveis...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="py-14 text-center text-slate-400">Nenhuma parcela encontrada para os filtros selecionados.</td></tr>
              ) : rows.map(row => {
                const eligible = ['aberta', 'atrasada'].includes(row.status)
                return (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/70 align-top">
                    <td className="px-3 py-3 text-center"><input type="checkbox" disabled={!eligible} checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} aria-label={`Selecionar parcela de ${row.cliente_nome || 'cliente'}`} /></td>
                    <td className="px-3 py-3"><p className="font-semibold text-slate-800 truncate" title={row.cliente_nome || ''}>{row.cliente_nome || 'Cliente não informado'}</p><div className="mt-1 flex items-center gap-1.5"><span className="text-[10px] text-slate-400">{row.cliente_documento || 'Sem documento'}</span>{row.cliente_ativo === false && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">inativo</span>}</div></td>
                    <td className="px-3 py-3"><p className="font-medium text-slate-700 truncate" title={row.contrato_titulo || ''}>{row.contrato_numero || '—'}</p><p className="mt-1 text-[10px] text-slate-400 truncate" title={row.contrato_titulo || ''}>{row.contrato_titulo || 'Contrato'}</p></td>
                    <td className="px-3 py-3"><p className="font-medium text-slate-700 truncate" title={row.receita_titulo || ''}>{row.receita_titulo || row.tipo_receita_nome || 'Receita'}</p><p className="mt-1 text-[10px] text-slate-400">{row.tipo_receita_nome || row.tipo || '—'}</p></td>
                    <td className="px-3 py-3"><p className="text-slate-700 truncate" title={row.obra_nome || ''}>{row.obra_nome || '—'}</p><p className="mt-1 text-[10px] text-slate-400 truncate" title={row.unidade_nome || ''}>Unidade: {row.unidade_nome || '—'}</p></td>
                    <td className="px-3 py-3 text-slate-600 truncate" title={row.receita_documento || row.documento_legado || ''}>{row.receita_documento || row.documento_legado || '—'}</td>
                    <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">{row.parcela_numero_legado || row.numero || '—'}{row.parcela_total_legado ? `/${row.parcela_total_legado}` : ''}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800 whitespace-nowrap"><p>{formatCurrency(row.valor_total)}</p>{row.valor_recalculado != null && <p className="mt-1 text-[9px] font-normal text-blue-600" title={`Recalculado para ${formatDate(row.data_recalculo)}`}>recalculado</p>}</td>
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDate(row.vencimento)}</td>
                    <td className="px-3 py-3"><p className={cn('whitespace-nowrap', row.status === 'paga' ? 'text-emerald-700 font-medium' : 'text-slate-400')}>{row.status === 'paga' ? formatDate(row.pago_em || row.conciliado_em) : '—'}</p><p className="mt-1 text-[10px] text-slate-400 truncate" title={origemBaixaLabel(row)}>{origemBaixaLabel(row)}</p>{row.movimento_banco && <p className="mt-0.5 text-[10px] text-slate-400 truncate">Banco: {row.movimento_banco}</p>}</td>
                    <td className="px-3 py-3"><span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusClass(row.status))}>{statusLabel(row.status)}</span>{row.boleto_status && <p className="mt-1 text-[9px] text-slate-400">Boleto: {row.boleto_status.replace(/_/g, ' ')}</p>}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === 'atrasada' && <button type="button" onClick={() => openRecalculate(row)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"><Calculator className="h-3 w-3" /> Recalcular</button>}
                        {eligible && <button type="button" onClick={() => generateBoleto(row)} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100"><Printer className="h-3 w-3" /> Boleto</button>}
                      </div>
                      {row.indice_nome || row.indice_codigo_legado ? <p className="mt-2 text-[9px] text-slate-400">Índice: {row.indice_nome || row.indice_codigo_legado}</p> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"><p className="text-xs text-slate-400">Página {page} de {pages}</p><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => Math.max(1, current - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40">Anterior</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage(current => Math.min(pages, current + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40">Próxima</button></div></div>
      </div>

      {!loading && rows.length > 0 ? <TableFloatingNav scrollRef={tableScrollRef} /> : null}

      {recalcRow && recalcForm && (
        <Modal title="Recalcular parcela em atraso" subtitle={`${recalcRow.cliente_nome || ''} • Contrato ${recalcRow.contrato_numero || '—'} • Vencimento ${formatDate(recalcRow.vencimento)}`} onClose={() => setRecalcRow(null)} maxWidth="max-w-5xl">
          <div className="space-y-4">
            {recalcError && <Notice type="error">{recalcError}</Notice>}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Recalcular para / Receber até"><input type="date" min={todayIso()} value={recalcForm.data_calculo} onChange={event => updateRecalcForm({ data_calculo: event.target.value })} className={inputClass} /></Field>
              <Field label="Índice acumulado (%)"><input type="number" step="0.00000001" placeholder="Automático" value={recalcForm.percentual_indice} onChange={event => updateRecalcForm({ percentual_indice: event.target.value })} className={inputClass} /></Field>
              <Field label="Multa (%)"><input type="number" step="0.0001" placeholder="Padrão do banco" value={recalcForm.percentual_multa} onChange={event => updateRecalcForm({ percentual_multa: event.target.value })} className={inputClass} /></Field>
              <Field label="Mora mensal (%)"><input type="number" step="0.0001" placeholder="Padrão do banco" value={recalcForm.percentual_mora_mes} onChange={event => updateRecalcForm({ percentual_mora_mes: event.target.value })} className={inputClass} /></Field>
              <Field label="Outros acréscimos"><MoneyInput value={recalcForm.outros_acrescimos} onChange={value => updateRecalcForm({ outros_acrescimos: value })} /></Field>
              <Field label="Seguro"><MoneyInput value={recalcForm.seguro} onChange={value => updateRecalcForm({ seguro: value })} /></Field>
              <Field label="Desconto / abatimento"><MoneyInput value={recalcForm.desconto} onChange={value => updateRecalcForm({ desconto: value })} /></Field>
              <div className="flex items-end"><button type="button" onClick={() => previewRecalculation()} disabled={recalcLoading} className="h-10 w-full rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">{recalcLoading ? 'Calculando...' : 'Atualizar cálculo'}</button></div>
            </div>

            {recalcLoading && !recalcData ? <div className="py-10 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Calculando...</div> : recalcData && (
              <>
                {recalcData.avisos.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /><div>{recalcData.avisos.map(item => <p key={item}>{item}</p>)}</div></div></div>}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <CalcBox label="Valor base" value={recalcData.valor_base} />
                  <CalcBox label={`Correção ${recalcData.indice?.codigo || ''}`} value={recalcData.valor_correcao} sub={formatPercent(recalcData.percentual_indice_aplicado)} />
                  <CalcBox label="Multa" value={recalcData.valor_multa} sub={formatPercent(recalcData.percentual_multa)} />
                  <CalcBox label={`Mora • ${recalcData.dias_atraso} dias`} value={recalcData.valor_juros_mora} sub={`${formatPercent(recalcData.percentual_mora_mes)} ao mês`} />
                  <CalcBox label="Valor final" value={recalcData.valor_final} strong />
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">Memória mensal do índice {recalcData.indice ? `— ${recalcData.indice.nome}${recalcData.indice.defasagem_meses ? ` (${recalcData.indice.defasagem_meses} meses de defasagem)` : ''}` : ''}</div>
                  <div className="max-h-48 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-white"><tr><th className="px-3 py-2 text-left">Mês corrigido</th><th className="px-3 py-2 text-left">Referência usada</th><th className="px-3 py-2 text-right">Variação</th><th className="px-3 py-2 text-center">Situação</th></tr></thead><tbody>{recalcData.meses.length === 0 ? <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-400">Nenhuma virada de mês entre vencimento e data do cálculo.</td></tr> : recalcData.meses.map(item => <tr key={`${item.mes_correcao}-${item.referencia_indice}`} className="border-t border-slate-100"><td className="px-3 py-2">{formatDate(item.mes_correcao)}</td><td className="px-3 py-2">{formatDate(item.referencia_indice)}</td><td className="px-3 py-2 text-right">{item.variacao_mensal == null ? '—' : formatPercent(item.variacao_mensal)}</td><td className="px-3 py-2 text-center">{item.encontrado ? <span className="text-emerald-600">Encontrado</span> : <span className="text-red-600">Ausente</span>}</td></tr>)}</tbody></table></div>
                </div>
              </>
            )}
            {recalcSaved && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Recálculo salvo. O boleto já pode ser gerado com o valor atualizado.</div>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setRecalcRow(null)} className={cancelButtonClass}>Fechar</button>
              <button type="button" disabled={!recalcData || recalcSaving || recalcLoading || recalcSaved} onClick={saveRecalculation} className={primaryButtonClass}>{recalcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {recalcSaved ? 'Recálculo salvo' : 'Salvar recálculo'}</button>
              <button type="button" disabled={!recalcSaved || recalcSaving || recalcLoading} onClick={() => generateBoleto(recalcRow, true)} title={recalcSaved ? 'Gerar boleto com o valor recalculado' : 'Salve o recálculo antes de gerar o boleto'} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" /> Gerar boleto</button>
            </div>
          </div>
        </Modal>
      )}

      {configOpen && (
        <Modal title="Configuração de cobrança Bradesco" subtitle="Boleto e arquivos CNAB 400 por empresa/tenant" onClose={() => setConfigOpen(false)} maxWidth="max-w-4xl">
          {configLoading ? <div className="py-12 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando...</div> : (
            <div className="space-y-4">
              {configError && <Notice type="error">{configError}</Notice>}
              {!config.homologado && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><strong>Modo de homologação:</strong> as remessas serão geradas com extensão <code>.TST</code> e os boletos terão marca de homologação. Marque como homologado somente após validação pelo Bradesco.</div>}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Empresa"><input value={config.empresa} onChange={event => setConfig({ ...config, empresa: event.target.value })} className={inputClass} /></Field>
                <Field label="Código da empresa Bradesco" className="md:col-span-2"><input value={config.codigo_empresa || ''} maxLength={20} onChange={event => setConfig({ ...config, codigo_empresa: event.target.value })} className={inputClass} /></Field>
                <Field label="Carteira"><input value={config.carteira} onChange={event => setConfig({ ...config, carteira: event.target.value })} className={inputClass} /></Field>
                <Field label="Beneficiário" className="md:col-span-3"><input value={config.beneficiario_nome} onChange={event => setConfig({ ...config, beneficiario_nome: event.target.value })} className={inputClass} /></Field>
                <Field label="CPF/CNPJ"><input value={config.beneficiario_documento || ''} onChange={event => setConfig({ ...config, beneficiario_documento: event.target.value })} className={inputClass} /></Field>
                <Field label="Agência"><input value={config.agencia} onChange={event => setConfig({ ...config, agencia: event.target.value })} className={inputClass} /></Field>
                <Field label="DV agência"><input value={config.agencia_dv || ''} onChange={event => setConfig({ ...config, agencia_dv: event.target.value })} className={inputClass} /></Field>
                <Field label="Conta"><input value={config.conta} onChange={event => setConfig({ ...config, conta: event.target.value })} className={inputClass} /></Field>
                <Field label="DV conta"><input value={config.conta_dv || ''} onChange={event => setConfig({ ...config, conta_dv: event.target.value })} className={inputClass} /></Field>
                <Field label="Multa padrão (%)"><input type="number" step="0.0001" value={config.multa_percentual_padrao} onChange={event => setConfig({ ...config, multa_percentual_padrao: event.target.value })} className={inputClass} /></Field>
                <Field label="Mora padrão ao mês (%)"><input type="number" step="0.0001" value={config.mora_percentual_mes_padrao} onChange={event => setConfig({ ...config, mora_percentual_mes_padrao: event.target.value })} className={inputClass} /></Field>
                <Field label="CEP"><input value={config.cep || ''} onChange={event => setConfig({ ...config, cep: event.target.value })} className={inputClass} /></Field>
                <Field label="UF"><input maxLength={2} value={config.uf || ''} onChange={event => setConfig({ ...config, uf: event.target.value.toUpperCase() })} className={inputClass} /></Field>
                <Field label="Logradouro" className="md:col-span-2"><input value={config.logradouro || ''} onChange={event => setConfig({ ...config, logradouro: event.target.value })} className={inputClass} /></Field>
                <Field label="Número"><input value={config.numero || ''} onChange={event => setConfig({ ...config, numero: event.target.value })} className={inputClass} /></Field>
                <Field label="Bairro"><input value={config.bairro || ''} onChange={event => setConfig({ ...config, bairro: event.target.value })} className={inputClass} /></Field>
                <Field label="Cidade"><input value={config.cidade || ''} onChange={event => setConfig({ ...config, cidade: event.target.value })} className={inputClass} /></Field>
                <Field label="Complemento"><input value={config.complemento || ''} onChange={event => setConfig({ ...config, complemento: event.target.value })} className={inputClass} /></Field>
                <Field label="Local de pagamento" className="md:col-span-4"><textarea rows={2} value={config.local_pagamento || ''} onChange={event => setConfig({ ...config, local_pagamento: event.target.value })} className={`${inputClass} h-auto py-2`} /></Field>
                <Field label="Instruções" className="md:col-span-4"><textarea rows={3} value={config.instrucoes || ''} onChange={event => setConfig({ ...config, instrucoes: event.target.value })} className={`${inputClass} h-auto py-2`} /></Field>
              </div>
              <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-700"><input type="checkbox" className="mt-0.5" checked={Boolean(config.homologado)} onChange={event => setConfig({ ...config, homologado: event.target.checked })} /><span><strong>Configuração homologada pelo Bradesco.</strong><br />Ao marcar, as remessas passam de <code>.TST</code> para <code>.REM</code> e a marca de homologação sai do boleto.</span></label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setConfigOpen(false)} className={cancelButtonClass}>Cancelar</button><button type="button" onClick={saveConfig} disabled={configSaving} className={primaryButtonClass}>{configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar configuração</button></div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function downloadBlob(data: BlobPart, filename: string) {
  const url = window.URL.createObjectURL(new Blob([data]))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(url)
}

function Notice({ type, children, onClose }: { type: 'error' | 'success'; children: ReactNode; onClose?: () => void }) {
  return <div className={cn('flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm', type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}><span>{children}</span>{onClose && <button type="button" onClick={onClose}><X className="h-4 w-4" /></button>}</div>
}

function Modal({ title, subtitle, onClose, children, maxWidth = 'max-w-3xl' }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-8"><div className={cn('mb-8 w-full rounded-2xl bg-white shadow-2xl', maxWidth)}><div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-800">{title}</h2>{subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="p-5">{children}</div></div></div>
}

function FilterField({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-[11px] font-medium text-slate-500">{label}</label>{children}</div>
}

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>{children}</div>
}

function MoneyInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span><input type="number" min="0" step="0.01" value={value} onChange={event => onChange(event.target.value)} className={`${inputClass} pl-9 text-right`} /></div>
}

function SummaryBox({ label, quantity, value, valueClass }: { label: string; quantity: number; value: number; valueClass: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm"><p className="text-[11px] font-medium text-slate-400">{label} · {quantity} parcelas</p><p className={cn('mt-1 text-lg font-bold', valueClass)}>{formatCurrency(value)}</p></div>
}

function CalcBox({ label, value, sub, strong }: { label: string; value: number; sub?: string; strong?: boolean }) {
  return <div className={cn('rounded-xl border p-3', strong ? 'border-blue-200 bg-blue-50' : 'border-slate-100 bg-slate-50')}><p className="text-[10px] uppercase text-slate-400">{label}</p><p className={cn('mt-1 font-bold', strong ? 'text-lg text-blue-700' : 'text-sm text-slate-800')}>{formatCurrency(value)}</p>{sub && <p className="mt-0.5 text-[9px] text-slate-400">{sub}</p>}</div>
}

function SortHeader({ label, sortKey, active, direction, onSort, align = 'left' }: { label: string; sortKey: SortKey; active: SortKey; direction: SortDirection; onSort: (key: SortKey) => void; align?: 'left' | 'center' | 'right' }) {
  return <th className={cn('px-3 py-3', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}><button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-semibold">{label}<span className="text-[9px] text-slate-400">{active === sortKey ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>
}

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const secondaryButtonClass = 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButtonClass = 'inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const cancelButtonClass = 'rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50'
