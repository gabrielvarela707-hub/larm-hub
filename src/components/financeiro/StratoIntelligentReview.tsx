'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSearch,
  LockKeyhole,
  Loader2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type StratoReportRow = {
  obra?: string | null
  unidade?: string | null
  parcela?: string | null
  boleto?: string | null
  vencimento?: string | null
  cliente_codigo?: string | null
  cliente_nome?: string | null
  data_pagamento?: string | null
  valor_a_pagar?: number | null
  valor_titulo?: number | null
  juros_financeiro?: number | null
  juros_financeiro_pago?: number | null
  seguro?: number | null
  seguro_pago?: number | null
  moras?: number | null
  moras_pago?: number | null
  valor_desconto?: number | null
  valor_residuo?: number | null
  valor_total_original?: number | null
  valor_total?: number | null
  valor_pago_total?: number | null
  valor_pago?: number | null
  valor_diferenca?: number | null
  ajuste_arredondamento?: number | null
  valor_pago_impresso?: number | null
  valor_desconto_impresso?: number | null
}

export type StratoAnalysisClient = {
  id?: number | string | null
  codigo?: string | null
  codigo_legado?: string | null
  nome?: string | null
  cpf_cnpj?: string | null
}

export type StratoAnalysisContract = {
  id?: string | null
  numero?: string | null
  codigo_legado?: number | string | null
  comprador_nome?: string | null
  obra_codigo_legado?: number | string | null
  unidade_codigo_legado?: string | null
  status?: string | null
}

export type StratoAnalysisMatchedParcel = {
  id?: string | null
  documento_legado?: string | null
  parcela_numero_legado?: number | null
  parcela_total_legado?: number | null
  vencimento?: string | null
  valor_nominal?: number | null
  valor_desconto?: number | null
  valor_juros_mora?: number | null
  valor_pago?: number | null
  pago_em?: string | null
  status?: string | null
  movimento_id?: number | string | null
  contrato_numero?: string | null
}

export type StratoAnalysisParcel = {
  relatorio?: StratoReportRow | null
  cliente?: StratoAnalysisClient | null
  contrato?: StratoAnalysisContract | null
  parcela?: StratoAnalysisMatchedParcel | null
  classificacao?: string | null
  acao_proposta?: string | null
  bloqueado?: boolean
  confianca?: number | null
  divergencias?: string[]
  valor_atual_larmhub?: number | null
  natureza_financeira?: {
    codigo?: string | null
    origem?: string | null
    valor_acrescimos?: number | null
    valor_desconto?: number | null
  } | null
  confirmacao_recomendada?: boolean
  evidencias_correspondencia?: string[]
  valor_nominal?: number | null
  valor_juros_financeiro?: number | null
  valor_seguro?: number | null
  valor_moras?: number | null
  valor_desconto?: number | null
  valor_residuo?: number | null
  valor_total?: number | null
  valor_pago?: number | null
  valor_diferenca?: number | null
}

export type StratoAnalysisItem = {
  linha?: number | null
  boleto?: string | null
  documento?: string | null
  ocorrencia?: string | null
  ocorrencia_descricao?: string | null
  data_ocorrencia?: string | null
  data_recebimento?: string | null
  data_credito?: string | null
  valor_titulo_retorno?: number | null
  valor_retorno?: number | null
  relatorio_encontrado?: boolean
  arquivo_relatorio?: string | null
  quantidade_parcelas?: number | null
  multiparcelas?: boolean
  totais_relatorio?: {
    valor_nominal?: number | null
    valor_juros_financeiro?: number | null
    valor_seguro?: number | null
    valor_moras?: number | null
    valor_desconto?: number | null
    valor_residuo?: number | null
    valor_total?: number | null
    valor_pago?: number | null
    valor_diferenca?: number | null
  } | null
  ajuste_arredondamento?: {
    aplicado?: boolean
    valor?: number | null
    parcela?: string | null
    motivo?: string | null
  } | null
  soma_confere_com_retorno?: boolean
  diferenca_soma?: number | null
  parcelas?: StratoAnalysisParcel[]
  status_analise?: string | null
  execucao_automatica_bloqueada?: boolean
  bloqueios?: string[]
}

export type StratoIntelligentAnalysis = {
  versao?: string | null
  modo?: string | null
  empresa?: string | null
  arquivo_retorno?: string | null
  resumo?: {
    itens_retorno?: number | null
    itens_com_relatorio?: number | null
    boletos_multiparcelas?: number | null
    parcelas_relacionadas?: number | null
    clientes_ausentes?: number | null
    contratos_ausentes?: number | null
    parcelas_ausentes?: number | null
    parcelas_divergentes?: number | null
    parcelas_ja_baixadas?: number | null
    itens_bloqueados?: number | null
    valor_nominal?: number | null
    valor_desconto?: number | null
    valor_juros_e_moras?: number | null
    valor_pago?: number | null
  } | null
  itens?: StratoAnalysisItem[]
  requer_fluxo_inteligente?: boolean
  seguranca?: {
    escrita_financeira?: boolean
    cria_cliente?: boolean
    cria_contrato?: boolean
    cria_parcela?: boolean
    executa_baixa?: boolean
    cria_movimento?: boolean
  } | null
}

export type StratoAnalysisFile = {
  arquivo: string
  analise_inteligente: StratoIntelligentAnalysis
}

export type StratoApplySelection = {
  key: string
  arquivo: string
  item: number
  parcela: number
}

type Props = {
  files: StratoAnalysisFile[]
  onClose: () => void
  onApply?: (selections: StratoApplySelection[]) => Promise<void>
  applying?: boolean
}

function money(value?: number | null) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function date(value?: string | null) {
  if (!value) return '—'
  const raw = String(value).slice(0, 10)
  const [year, month, day] = raw.split('-')
  return year && month && day ? `${day}/${month}/${year}` : raw
}

function percent(value?: number | null) {
  if (value == null) return '—'
  const normalized = value <= 1 ? value * 100 : value
  return `${normalized.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function text(value?: string | null) {
  return String(value || '').replace(/_/g, ' ').toLowerCase()
}

function classificationLabel(value?: string | null) {
  const labels: Record<string, string> = {
    CLIENTE_AUSENTE: 'Cliente ausente',
    CLIENTE_AMBIGUO: 'Cliente ambíguo',
    CONTRATO_AUSENTE: 'Contrato ausente',
    CONTRATO_AMBIGUO: 'Contrato ambíguo',
    PARCELA_AUSENTE: 'Parcela ausente',
    PARCELA_AMBIGUA: 'Parcela ambígua',
    PARCELA_LOCALIZADA: 'Parcela localizada',
    PARCELA_LOCALIZADA_COM_DIVERGENCIAS: 'Localizada com divergências',
    JA_BAIXADA: 'Já baixada',
    JA_BAIXADA_COM_DIVERGENCIAS: 'Já baixada com divergências',
  }
  return labels[String(value || '')] || text(value) || 'Sem classificação'
}

function actionLabel(value?: string | null) {
  const labels: Record<string, string> = {
    NENHUMA: 'Nenhuma ação',
    BAIXAR_PARCELA: 'Baixar parcela',
    ATUALIZAR_E_BAIXAR: 'Atualizar e baixar',
    CRIAR_PARCELA_E_BAIXAR: 'Criar parcela e baixar',
    CRIAR_CONTRATO_PARCELA_E_BAIXAR: 'Criar contrato, parcela e baixar',
    CRIAR_CLIENTE_CONTRATO_PARCELA_E_BAIXAR: 'Criar cliente, contrato, parcela e baixar',
    REVISAR_CLIENTE: 'Revisar cliente',
    REVISAR_CONTRATO: 'Revisar contrato',
    REVISAR_PARCELA: 'Revisar parcela',
  }
  return labels[String(value || '')] || text(value) || 'Revisar'
}

function divergenceLabel(value: string) {
  const labels: Record<string, string> = {
    CLIENTE_NAO_ENCONTRADO_NO_LARMHUB: 'Cliente não encontrado no LarmHub',
    CONTRATO_NAO_ENCONTRADO_NO_LARMHUB: 'Contrato não encontrado no LarmHub',
    PARCELA_NAO_ENCONTRADA_NO_LARMHUB: 'Parcela não encontrada no LarmHub',
    MAIS_DE_UM_CLIENTE_CANDIDATO: 'Mais de um cliente candidato',
    MAIS_DE_UM_CONTRATO_CANDIDATO: 'Mais de um contrato candidato',
    MAIS_DE_UMA_PARCELA_CANDIDATA: 'Mais de uma parcela candidata',
    FRACAO_DIVERGENTE: 'Fração da parcela divergente',
    VENCIMENTO_DIVERGENTE: 'Vencimento divergente',
    VALOR_NOMINAL_DIVERGENTE: 'Valor nominal divergente',
    DESCONTO_DIVERGENTE: 'Desconto divergente',
    JUROS_OU_MORAS_DIVERGENTES: 'Juros ou moras divergentes',
    SEGURO_DIVERGENTE: 'Seguro divergente',
  }
  return labels[value] || text(value)
}

function financialNatureLabel(parcel: StratoAnalysisParcel) {
  const nature = parcel.natureza_financeira
  const code = String(nature?.codigo || '')
  if (code === 'JUROS_MORAS_OU_ACRESCIMOS') return `Acréscimo por juros/moras ${money(nature?.valor_acrescimos)}`
  if (code === 'DESCONTO') return `Desconto ${money(nature?.valor_desconto)}`
  if (code === 'ACRESCIMO_E_DESCONTO') return `Acréscimos ${money(nature?.valor_acrescimos)} e desconto ${money(nature?.valor_desconto)}`
  if (code === 'ACRESCIMO_PROVAVEL') return `Acréscimo provável ${money(nature?.valor_acrescimos)} — confirmar`
  if (code === 'DESCONTO_PROVAVEL') return `Desconto provável ${money(nature?.valor_desconto)} — confirmar`
  return ''
}

function evidenceLabel(value: string) {
  const labels: Record<string, string> = {
    CLIENTE_LOCALIZADO: 'cliente localizado',
    CONTRATO_LOCALIZADO: 'contrato localizado',
    FRACAO_EQUIVALENTE: 'fração equivalente',
    VENCIMENTO_EXATO: 'vencimento exato',
    BOLETO_COMPLETO_NO_RELATORIO_E_RETORNO: 'boleto completo confirmado no RET e Strato',
  }
  return labels[value] || text(value)
}

function groupKey(file: StratoAnalysisFile, item: StratoAnalysisItem, index: number) {
  return `${file.arquivo}-${item.linha ?? index}-${item.boleto || item.documento || index}`
}

function parcelSelectionKey(fileIndex: number, itemIndex: number, parcelIndex: number) {
  return `${fileIndex}:${itemIndex}:${parcelIndex}`
}

function isParcelEligible(item: StratoAnalysisItem, parcel: StratoAnalysisParcel) {
  const action = String(parcel.acao_proposta || '')
  const classification = String(parcel.classificacao || '')
  const allowedAction = ['BAIXAR_PARCELA', 'ATUALIZAR_E_BAIXAR', 'CRIAR_PARCELA_E_BAIXAR'].includes(action)
  const hardBlocked = [
    'CLIENTE_AUSENTE', 'CLIENTE_AMBIGUO',
    'CONTRATO_AUSENTE', 'CONTRATO_AMBIGUO',
    'PARCELA_AMBIGUA',
  ].includes(classification)
  return allowedAction && !hardBlocked && item.soma_confere_com_retorno !== false
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildPrintHtml(files: StratoAnalysisFile[]) {
  const sections = files.map(file => {
    const analysis = file.analise_inteligente
    const rows = (analysis.itens || []).flatMap(item => (item.parcelas || []).map(parcel => {
      const report = parcel.relatorio || {}
      const matched = parcel.parcela
      return `<tr>
        <td>${escapeHtml(report.obra || '—')}</td>
        <td>${escapeHtml(report.unidade || '—')}</td>
        <td>${escapeHtml(report.parcela || '—')}</td>
        <td>${escapeHtml(item.boleto || report.boleto || '—')}</td>
        <td>${escapeHtml(date(report.vencimento))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_nominal))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_juros_financeiro))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_seguro))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_moras))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_desconto))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_residuo))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_total))}</td>
        <td>${escapeHtml(date(item.data_recebimento || report.data_pagamento))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_pago))}</td>
        <td class="num">${escapeHtml(money(parcel.valor_diferenca))}</td>
        <td>${escapeHtml(matched ? `${matched.documento_legado || 'parcela localizada'} · ${matched.status || '—'}` : 'Não localizado')}</td>
        <td>${escapeHtml(classificationLabel(parcel.classificacao))}</td>
        <td>${escapeHtml(actionLabel(parcel.acao_proposta))}</td>
      </tr>`
    })).join('')
    return `<section>
      <h2>${escapeHtml(file.arquivo)} · ${escapeHtml(analysis.empresa || 'Empresa não identificada')}</h2>
      <p>Versão da análise ${escapeHtml(analysis.versao || '0.6.5')} · conferência da versão 0.6.5.</p>
      <table>
        <thead><tr><th>Obra</th><th>Unid.</th><th>Parcela</th><th>Boleto</th><th>Vencimento</th><th>A pagar</th><th>J.FCT</th><th>Seguro</th><th>Moras</th><th>Desconto</th><th>Resíduo</th><th>Total</th><th>Recebimento</th><th>Pago</th><th>Diferença</th><th>LarmHub</th><th>Situação</th><th>Ação</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="18">Nenhuma parcela relacionada.</td></tr>'}</tbody>
      </table>
    </section>`
  }).join('')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Conferência inteligente Strato</title><style>
    @page{size:A3 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 3px}p{font-size:9px;color:#64748b;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:7px;margin-bottom:14px}th{background:#0f172a;color:#fff;padding:4px;border:1px solid #334155;text-align:left}td{padding:4px;border:1px solid #cbd5e1;vertical-align:top}.num{text-align:right;white-space:nowrap}.note{border:1px solid #f59e0b;background:#fffbeb;padding:8px;font-size:9px;margin:8px 0}</style></head><body>
    <h1>Conferência inteligente Strato × Retorno Bradesco × LarmHub</h1>
    <div class="note">Relatório de conferência da análise inteligente. A aplicação exige seleção e validação transacional no LarmHub.</div>
    ${sections}
  </body></html>`
}

export default function StratoIntelligentReview({ files, onClose, onApply, applying = false }: Props) {
  const initialKeys = useMemo(() => files.flatMap(file => (file.analise_inteligente.itens || [])
    .map((item, index) => ({ item, key: groupKey(file, item, index) }))
    .filter(({ item }) => item.multiparcelas || item.execucao_automatica_bloqueada)
    .map(({ key }) => key)), [files])
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialKeys))
  const eligibleSelections = useMemo<StratoApplySelection[]>(() => files.flatMap((file, fileIndex) =>
    (file.analise_inteligente.itens || []).flatMap((item, itemIndex) =>
      (item.parcelas || []).flatMap((parcel, parcelIndex) => (
        isParcelEligible(item, parcel)
          ? [{
              key: parcelSelectionKey(fileIndex, itemIndex, parcelIndex),
              arquivo: file.arquivo,
              item: itemIndex,
              parcela: parcelIndex,
            }]
          : []
      )),
    ),
  ), [files])
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(eligibleSelections.map(entry => entry.key)),
  )

  useEffect(() => setExpanded(new Set(initialKeys)), [initialKeys])
  useEffect(() => setSelected(new Set(eligibleSelections.map(entry => entry.key))), [eligibleSelections])

  const selectedSelections = useMemo(
    () => eligibleSelections.filter(entry => selected.has(entry.key)),
    [eligibleSelections, selected],
  )
  const allEligibleSelected = eligibleSelections.length > 0
    && selectedSelections.length === eligibleSelections.length

  const totals = useMemo(() => files.reduce((acc, file) => {
    const summary = file.analise_inteligente.resumo || {}
    acc.retornos += 1
    acc.itens += Number(summary.itens_retorno || 0)
    acc.multiparcelas += Number(summary.boletos_multiparcelas || 0)
    acc.parcelas += Number(summary.parcelas_relacionadas || 0)
    acc.clientesAusentes += Number(summary.clientes_ausentes || 0)
    acc.contratosAusentes += Number(summary.contratos_ausentes || 0)
    acc.parcelasAusentes += Number(summary.parcelas_ausentes || 0)
    acc.divergentes += Number(summary.parcelas_divergentes || 0)
    acc.bloqueados += Number(summary.itens_bloqueados || 0)
    acc.nominal += Number(summary.valor_nominal || 0)
    acc.desconto += Number(summary.valor_desconto || 0)
    acc.juros += Number(summary.valor_juros_e_moras || 0)
    acc.pago += Number(summary.valor_pago || 0)
    return acc
  }, {
    retornos: 0, itens: 0, multiparcelas: 0, parcelas: 0,
    clientesAusentes: 0, contratosAusentes: 0, parcelasAusentes: 0,
    divergentes: 0, bloqueados: 0, nominal: 0, desconto: 0, juros: 0, pago: 0,
  }), [files])

  function toggle(key: string) {
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelection(key: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAllSelections() {
    setSelected(allEligibleSelected ? new Set<string>() : new Set(eligibleSelections.map(entry => entry.key)))
  }

  function applySelected() {
    if (!onApply || applying || selectedSelections.length === 0) return
    const confirmed = window.confirm(
      `Confirma a aplicação de ${selectedSelections.length} ajuste(s) e baixa(s)? Cada parcela terá um Movimento Bancário individual.`,
    )
    if (!confirmed) return
    void onApply(selectedSelections)
  }

  function printReview() {
    const printWindow = window.open('', '_blank', 'width=1500,height=900')
    if (!printWindow) return
    printWindow.document.open()
    printWindow.document.write(buildPrintHtml(files))
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => printWindow.print(), 350)
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-100 bg-amber-50/70 p-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-amber-700" />
            <h2 className="text-sm font-semibold text-slate-900">Conferência inteligente Strato</h2>
            <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Revisão e aplicação</span>
          </div>
          <p className="mt-1 max-w-4xl text-xs text-slate-600">
            Revise as parcelas relacionadas pelo relatório Strato. As ações elegíveis podem ser selecionadas e aplicadas em uma transação única, com um Movimento Bancário individual por parcela.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={printReview} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> Exportar PDF
          </button>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Fechar conferência inteligente"><X className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {[
            ['Retornos', totals.retornos],
            ['Títulos CNAB', totals.itens],
            ['Multiparcelas', totals.multiparcelas],
            ['Parcelas relacionadas', totals.parcelas],
            ['Clientes ausentes', totals.clientesAusentes],
            ['Contratos ausentes', totals.contratosAusentes],
            ['Parcelas ausentes', totals.parcelasAusentes],
            ['Itens bloqueados', totals.bloqueados],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Valor nominal', money(totals.nominal)],
            ['Descontos', money(totals.desconto)],
            ['Juros e moras', money(totals.juros)],
            ['Valor recebido', money(totals.pago)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-slate-100 bg-white px-3 py-2 shadow-sm">
              <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">O backend recalcula e valida todos os valores antes de gravar.</p>
            <p className="mt-0.5">Parcelas localizadas e parcelas ausentes em contratos existentes podem ser aplicadas. Cliente ou contrato ausente/ambíguo permanece bloqueado para evitar cadastro incompleto.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {files.map((file, fileIndex) => (
            <div key={file.arquivo} className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{file.arquivo}</p>
                  <p className="text-[10px] text-slate-500">{file.analise_inteligente.empresa || 'Empresa não identificada'} · análise {file.analise_inteligente.versao || '0.6.5'}</p>
                </div>
                <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold', file.analise_inteligente.requer_fluxo_inteligente ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>
                  {file.analise_inteligente.requer_fluxo_inteligente ? 'Revisão necessária' : 'Sem bloqueios complexos'}
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {(file.analise_inteligente.itens || []).map((item, itemIndex) => {
                  const key = groupKey(file, item, itemIndex)
                  const open = expanded.has(key)
                  const firstParcel = item.parcelas?.[0]
                  const report = firstParcel?.relatorio
                  return (
                    <article key={key}>
                      <button type="button" onClick={() => toggle(key)} className="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-50">
                        <span className="mt-0.5 text-slate-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-800">Boleto {item.boleto || 'não identificado'}</p>
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] text-slate-600">item {itemIndex + 1}</span>
                            {item.multiparcelas && <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-semibold text-violet-700">{item.quantidade_parcelas || item.parcelas?.length || 0} parcelas</span>}
                            {item.execucao_automatica_bloqueada
                              ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-800"><AlertTriangle className="h-3 w-3" />Aguarda revisão</span>
                              : <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Conferido</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {report?.cliente_nome || firstParcel?.cliente?.nome || 'Cliente não identificado'} · {report?.obra || 'obra —'} / {report?.unidade || 'unidade —'} · recebimento {date(item.data_recebimento || report?.data_pagamento)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-800">{money(item.valor_retorno)}</p>
                          <p className="mt-0.5 text-[9px] text-slate-400">valor no retorno</p>
                        </div>
                      </button>

                      {open && (
                        <div className="border-t border-slate-100 bg-white p-3">
                          {item.ajuste_arredondamento?.aplicado && (
                            <div className="mb-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] text-blue-800">
                              Ajuste de arredondamento de {money(item.ajuste_arredondamento.valor)} aplicado na parcela {item.ajuste_arredondamento.parcela || 'final'} para conferir o relatório impresso com o CNAB. O valor original foi preservado como evidência.
                            </div>
                          )}
                          {!item.relatorio_encontrado && (
                            <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-600">Nenhuma linha correspondente foi encontrada no relatório Strato anexado.</div>
                          )}
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="min-w-[1950px] w-full text-[10px]">
                              <thead className="bg-[#0d1b2a] text-white">
                                <tr>
                                  <th className="w-9 px-2 py-2 text-center">
                                    <input type="checkbox" checked={allEligibleSelected} onChange={toggleAllSelections} aria-label="Selecionar todas as parcelas elegíveis" />
                                  </th>
                                  {['Obra','Unid.','Parcela','Boleto','Vencimento','A pagar','J.FCT','Seguro','Moras','Desconto','Resíduo','Total','Recebimento','Pago','Diferença','LarmHub','Situação','Ação'].map(label => <th key={label} className={cn('px-2 py-2 text-left font-semibold', ['A pagar','J.FCT','Seguro','Moras','Desconto','Resíduo','Total','Pago','Diferença'].includes(label) && 'text-right')}>{label}</th>)}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white">
                                {(item.parcelas || []).length ? item.parcelas!.map((parcel, parcelIndex) => {
                                  const row = parcel.relatorio || {}
                                  const matched = parcel.parcela
                                  const selectionKey = parcelSelectionKey(fileIndex, itemIndex, parcelIndex)
                                  const eligible = isParcelEligible(item, parcel)
                                  return (
                                    <tr key={`${key}-${row.parcela || parcelIndex}`} className={parcel.bloqueado ? 'bg-amber-50/40' : ''}>
                                      <td className="px-2 py-2 text-center">
                                        <input
                                          type="checkbox"
                                          checked={selected.has(selectionKey)}
                                          disabled={!eligible || applying}
                                          onChange={() => toggleSelection(selectionKey)}
                                          aria-label={`Selecionar parcela ${row.parcela || parcelIndex + 1}`}
                                        />
                                      </td>
                                      <td className="px-2 py-2">{row.obra || '—'}</td>
                                      <td className="px-2 py-2">{row.unidade || '—'}</td>
                                      <td className="px-2 py-2 font-semibold text-slate-800">{row.parcela || '—'}</td>
                                      <td className="px-2 py-2">{item.boleto || row.boleto || '—'}</td>
                                      <td className="px-2 py-2 whitespace-nowrap">{date(row.vencimento)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums">{money(parcel.valor_nominal)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums">{money(parcel.valor_juros_financeiro)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums">{money(parcel.valor_seguro)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums">{money(parcel.valor_moras)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums text-rose-700">{money(parcel.valor_desconto)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums">{money(parcel.valor_residuo)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums font-semibold">{money(parcel.valor_total)}</td>
                                      <td className="px-2 py-2 whitespace-nowrap">{date(item.data_recebimento || row.data_pagamento)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-emerald-700">{money(parcel.valor_pago)}</td>
                                      <td className="px-2 py-2 text-right tabular-nums">{money(parcel.valor_diferenca)}</td>
                                      <td className="px-2 py-2">
                                        {matched ? (
                                          <>
                                            <p className="font-medium text-slate-700">{matched.documento_legado || `${matched.parcela_numero_legado || '—'}/${matched.parcela_total_legado || '—'}`}</p>
                                            <p className="mt-0.5 text-[9px] text-slate-400">{parcel.contrato?.numero || matched.contrato_numero || 'contrato localizado'} · {matched.status || '—'} · atual {money(parcel.valor_atual_larmhub)}</p>
                                          </>
                                        ) : (
                                          <p className="font-medium text-rose-700">Não localizado</p>
                                        )}
                                      </td>
                                      <td className="px-2 py-2">
                                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold', String(parcel.classificacao || '').startsWith('JA_BAIXADA') ? 'border-blue-200 bg-blue-50 text-blue-700' : parcel.bloqueado ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-700')}>{classificationLabel(parcel.classificacao)}</span>
                                        {parcel.confirmacao_recomendada && (
                                          <p className="mt-1 max-w-[220px] rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-semibold leading-4 text-blue-800">
                                            Correspondência provável — confirme os valores antes de aplicar.
                                          </p>
                                        )}
                                        {financialNatureLabel(parcel) ? <p className="mt-1 max-w-[220px] text-[9px] font-medium leading-4 text-violet-700">{financialNatureLabel(parcel)}</p> : null}
                                        {parcel.divergencias?.length ? <p className="mt-1 max-w-[220px] text-[9px] leading-4 text-slate-500">{parcel.divergencias.map(divergenceLabel).join(' · ')}</p> : null}
                                        {parcel.evidencias_correspondencia?.length ? <p className="mt-1 max-w-[220px] text-[9px] leading-4 text-slate-400">Evidências: {parcel.evidencias_correspondencia.map(evidenceLabel).join(', ')}</p> : null}
                                        {parcel.confianca != null ? <p className="mt-1 text-[9px] text-slate-400">Confiança {percent(parcel.confianca)}</p> : null}
                                      </td>
                                      <td className="px-2 py-2">
                                        <p className="max-w-[190px] font-medium text-slate-700">{actionLabel(parcel.acao_proposta)}</p>
                                        {eligible && parcel.confirmacao_recomendada && <p className="mt-1 text-[9px] font-medium text-blue-700">Marque a parcela para confirmar a correspondência e os valores.</p>}
                                        {!eligible && parcel.acao_proposta !== 'NENHUMA' && <p className="mt-1 text-[9px] text-amber-700">Requer cadastro/revisão manual</p>}
                                      </td>
                                    </tr>
                                  )
                                }) : (
                                  <tr><td colSpan={19} className="px-3 py-5 text-center text-slate-400">Nenhuma parcela relacionada a este título.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                            <p>Soma do relatório: {money(item.totais_relatorio?.valor_pago)} · Retorno: {money(item.valor_retorno)} · Diferença: {money(item.diferenca_soma)}</p>
                            <p>Crédito bancário: {date(item.data_credito)} · Relatório: {item.arquivo_relatorio || '—'}</p>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div className="text-xs text-slate-500">
            <p><strong>{selectedSelections.length}</strong> de {eligibleSelections.length} parcela(s) elegível(is) selecionada(s).</p>
            {totals.clientesAusentes > 0 || totals.contratosAusentes > 0 ? (
              <p className="mt-1 text-amber-700">Cadastros ausentes não serão criados com dados incompletos; permanecem destacados para sincronização cadastral.</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!onApply || applying || selectedSelections.length === 0}
            onClick={applySelected}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition',
              !onApply || applying || selectedSelections.length === 0
                ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                : 'bg-emerald-700 text-white hover:bg-emerald-800',
            )}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {applying ? 'Aplicando...' : `Aplicar ${selectedSelections.length} ajuste(s) e baixa(s)`}
          </button>
        </div>
      </div>
    </section>
  )
}
