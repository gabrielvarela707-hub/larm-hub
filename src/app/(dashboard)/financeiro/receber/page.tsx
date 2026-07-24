'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Calculator,
  Check,
  Download,
  Files,
  FileSearch,
  Landmark,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Pencil,
  Printer,
  Search,
  Settings,
  Upload,
  X,
} from 'lucide-react'
import TableFloatingNav from '@/components/table-floating-nav'
import StratoIntelligentReview, { type StratoAnalysisFile, type StratoApplySelection, type StratoIntelligentAnalysis } from '@/components/financeiro/StratoIntelligentReview'
import { apiClient, useAuthStore } from '@/lib/auth-store'
import { hasModuleAccess } from '@/lib/module-access'
import { cn } from '@/lib/utils'

const FINANCE_WRITE_ROLES = new Set([
  'super_admin', 'admin', 'manager', 'controller', 'financial',
  'superadministrador', 'administrador', 'gerente', 'controladoria', 'financeiro',
])

type StatusReceber = 'aberta' | 'atrasada' | 'paga' | 'cancelada'
type IntelligentReturnPayload = {
  files: Array<{ filename: string; content: string }>
  relatorios_strato: Array<{ filename: string; mime_type: string; base64: string }>
}

type EmpresaCobranca = 'LARM' | 'LUCKY'
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
  boleto_enviado_em?: string | null
  boleto_envio_canal?: string | null
  boleto_envio_status?: string | null
  boleto_envio_erro?: string | null
  cliente_email?: string | null
  cliente_telefone?: string | null
  empresa_cobranca?: EmpresaCobranca | null
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
type BillingCompanyOption = { codigo: EmpresaCobranca; nome: string; obras: number[] }
type SystemCompany = {
  codigo: number
  nome: string
  nome_fantasia?: string | null
  cpf_cnpj?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  email?: string | null
  telefone?: string | null
  empresa_cobranca?: EmpresaCobranca | null
}

type BankAccountOption = {
  id: number
  empresa: string
  banco_nome: string
  agencia?: string | null
  conta?: string | null
  digito?: string | null
  ativo?: boolean
}

type ManualPaymentForm = {
  data_recebimento: string
  valor_recebido: string
  banco_conta_id: string
  forma_pagamento: string
  observacoes: string
}

type FilterData = { clientes: FilterOption[]; tipos_receita: FilterOption[]; obras: FilterOption[]; empresas_cobranca: BillingCompanyOption[] }

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
  lote?: boolean
  quantidade_parcelas?: number
  parcelas_ids?: string[]
  parcelas?: Recalculation[]
}

type RecalcForm = {
  data_calculo: string
  percentual_indice: string
  percentual_multa: string
  percentual_mora_mes: string
  outros_acrescimos: string
  seguro: string
  desconto: string
  incluir_parcelas_anteriores: boolean
}

type BradescoConfig = {
  id?: number
  empresa: EmpresaCobranca
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

type ReturnStratoReportInfo = {
  arquivo?: string | null
  arquivo_retorno?: string | null
  provider?: string | null
  boleto?: string | null
  obra?: string | null
  unidade?: string | null
  parcela?: string | null
  cliente_codigo?: string | null
  cliente_nome?: string | null
  vencimento?: string | null
  valor_titulo?: number | null
  data_pagamento?: string | null
  valor_pago?: number | null
}

type ReturnReconciliationCandidate = {
  parcela_id?: string | null
  contrato?: string | null
  cliente?: string | null
  score?: number | null
  confianca?: number | null
  evidencias?: string[]
  parcela?: string | null
  vencimento?: string | null
  valor_atual?: number | null
}

type ReturnProcessingItem = {
  linha: number
  arquivo_origem?: string | null
  empresa?: string | null
  ocorrencia: string
  ocorrencia_descricao: string
  nosso_numero?: string | null
  nosso_numero_dv?: string | null
  controle_participante?: string | null
  documento?: string | null
  vencimento?: string | null
  data_ocorrencia?: string | null
  data_credito?: string | null
  data_recebimento?: string | null
  valor_titulo: number
  valor_pago: number
  parcela_id?: string | null
  parcela_numero?: number | null
  parcela_total?: number | null
  contrato?: string | null
  cliente?: string | null
  metodo_conciliacao?: string | null
  confianca_conciliacao?: number | null
  candidatos_conciliacao?: ReturnReconciliationCandidate[]
  relatorio_strato?: ReturnStratoReportInfo | null
  movimento_id?: number | string | null
  divergencia_valor?: number | null
  status_processamento: string
}

type ReturnProcessingResult = {
  id?: string
  arquivo: string
  empresa?: string | null
  data_arquivo?: string | null
  processado_em?: string | null
  processado_por?: string | null
  data_recebimento?: string | null
  banco_codigo?: string | null
  baixa_automatica?: boolean
  movimentos_vinculados?: number
  registros?: number
  titulos?: number
  preview?: boolean
  persisted?: boolean
  conciliados: number
  nao_localizados: number
  liquidacoes_encontradas: number
  liquidacoes_prontas: number
  liquidacoes_baixadas: number
  ja_baixadas: number
  movimentos_criados: number
  relatorios_strato_processados?: number
  conciliados_por_relatorio?: number
  ia_providers?: string[]
  valor_liquidado: number
  valor_baixado: number
  conta_bancaria_localizada: boolean
  conta_bancaria_ambigua: boolean
  itens: ReturnProcessingItem[]
  duplicated?: boolean
  analise_inteligente?: StratoIntelligentAnalysis | null
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

const DEFAULT_LOCAL_PAGAMENTO = 'PAGÁVEL PREFERENCIALMENTE NA REDE BRADESCO OU EM QUALQUER BANCO ATÉ O VENCIMENTO.'
const DEFAULT_INSTRUCOES = 'APÓS O VENCIMENTO, RECALCULAR O TÍTULO ANTES DA EMISSÃO.'

function emptyBradescoConfig(empresa: EmpresaCobranca): BradescoConfig {
  return {
    empresa,
    codigo_empresa: '',
    beneficiario_nome: '',
    beneficiario_documento: '',
    agencia: '',
    agencia_dv: '',
    conta: '',
    conta_dv: '',
    carteira: '09',
    especie_documento: '01',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    local_pagamento: DEFAULT_LOCAL_PAGAMENTO,
    instrucoes: DEFAULT_INSTRUCOES,
    multa_percentual_padrao: 2,
    mora_percentual_mes_padrao: 1,
    homologado: false,
  }
}

function formatCep(value: string) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function applySystemCompany(config: BradescoConfig, company?: SystemCompany | null) {
  if (!company) return config
  return {
    ...config,
    empresa: company.empresa_cobranca || config.empresa,
    beneficiario_nome: company.nome || config.beneficiario_nome,
    beneficiario_documento: company.cpf_cnpj || config.beneficiario_documento,
    cep: company.cep || config.cep,
    logradouro: company.logradouro || config.logradouro,
    numero: company.numero || config.numero,
    complemento: company.complemento || config.complemento,
    bairro: company.bairro || config.bairro,
    cidade: company.cidade || config.cidade,
    uf: company.uf || config.uf,
  }
}

function firstDayOfCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function lastDayOfCurrentMonth() {
  const now = new Date()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
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

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
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
  if (row.origem_baixa === 'manual') return 'Baixa manual'
  if (row.origem_baixa === 'retorno_bradesco') return 'Retorno Bradesco'
  if (row.movimento_id || row.origem_baixa === 'conciliacao_bancaria') return 'Conciliação bancária'
  if (row.origem_baixa === 'importacao_historica') return 'Importação histórica'
  if (row.status === 'paga') return 'Baixa registrada'
  return 'Aguardando conciliação'
}

function fullNossoNumero(item: Pick<ReturnProcessingItem, 'nosso_numero' | 'nosso_numero_dv'>) {
  const base = String(item.nosso_numero || '').replace(/\D/g, '')
  const dv = String(item.nosso_numero_dv || '').replace(/\D/g, '')
  if (!base) return '—'
  if (!dv || base.endsWith(dv)) return base
  return `${base}${dv}`
}

function reconciliationEvidenceLabel(value: string) {
  const labels: Record<string, string> = {
    CLIENTE_CODIGO_EXATO: 'cliente',
    CLIENTE_NOME_EXATO: 'nome',
    CLIENTE_NOME_COMPATIVEL: 'nome compatível',
    CONTRATO_EXATO: 'contrato',
    CONTRATO_POR_CLIENTE: 'contrato do cliente',
    UNIDADE_EXATA: 'unidade',
    OBRA_EXATA: 'obra',
    FRACAO_EXATA: 'parcela',
    FRACAO_EQUIVALENTE: 'parcela equivalente',
    VENCIMENTO_EXATO: 'vencimento',
    VALOR_NOMINAL_EXATO: 'valor nominal',
    VALOR_NOMINAL_APROXIMADO: 'valor aproximado',
    VALOR_RECEBIDO_EXATO: 'valor recebido',
    DIFERENCA_EXPLICADA_PELO_RELATORIO: 'juros/desconto explicado pelo Strato',
    BOLETO_COMPLETO_EXATO: 'boleto completo',
    NOSSO_NUMERO_BASE_EXATO: 'nosso número',
    CONTROLE_PARTICIPANTE_EXATO: 'controle',
  }
  return labels[value] || value.replace(/_/g, ' ').toLowerCase()
}

function returnItemStatusLabel(item: ReturnProcessingItem, historical = false) {
  if (item.status_processamento === 'ja_baixado') return 'Já baixado'
  if (item.status_processamento === 'liquidado' || item.status_processamento === 'baixado') return historical ? 'Baixa registrada' : 'Baixado agora'
  if (item.status_processamento === 'pronto_para_baixa' || item.status_processamento === 'pronto') return 'Pronto para baixa'
  if (item.status_processamento === 'pronto_para_baixa_movimento_existente') return 'Pronto — movimento localizado'
  if (item.status_processamento === 'conta_bancaria_ambigua') return 'Conta bancária ambígua'
  if (item.status_processamento === 'conta_bancaria_nao_localizada') return 'Conta bancária não localizada'
  if (item.status_processamento === 'entrada_confirmada') return 'Entrada confirmada'
  if (item.status_processamento === 'rejeitado') return 'Rejeitado pelo banco'
  if (item.status_processamento === 'baixado_banco') return 'Baixado no banco'
  if (item.status_processamento === 'localizado_sem_acao') return 'Localizado sem ação'
  if (item.status_processamento === 'empresa_nao_identificada') return 'Empresa não identificada'
  if (item.status_processamento === 'nao_localizado') {
    if (item.ocorrencia && item.ocorrencia !== '06') return 'Ocorrência sem liquidação'
    return 'Não localizado'
  }
  if (item.status_processamento === 'ignorado') return 'Ignorado'
  return item.status_processamento || '—'
}

function returnItemStatusClass(item: ReturnProcessingItem) {
  if (item.status_processamento === 'liquidado' || item.status_processamento === 'baixado') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (item.status_processamento === 'ja_baixado') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (item.status_processamento === 'pronto_para_baixa' || item.status_processamento === 'pronto_para_baixa_movimento_existente' || item.status_processamento === 'pronto') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (item.status_processamento === 'nao_localizado' && item.ocorrencia !== '06') return 'bg-slate-100 text-slate-600 border-slate-200'
  if (item.status_processamento === 'nao_localizado') return 'bg-red-50 text-red-700 border-red-200'
  if (item.status_processamento === 'rejeitado' || item.status_processamento === 'empresa_nao_identificada') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

function returnItemReason(item: ReturnProcessingItem, historical = false) {
  const report = item.relatorio_strato
  if (item.metodo_conciliacao === 'relatorio_strato_ia' && item.parcela_id) {
    const confidence = item.confianca_conciliacao ? ` Confiança ${item.confianca_conciliacao}%.` : ''
    return `Conciliado com o relatório Strato${report?.arquivo ? ` (${report.arquivo})` : ''}; os identificadores do boleto foram gravados para os próximos retornos.${confidence}`
  }
  if (['relatorio_strato_sem_correspondencia_segura', 'relatorio_strato_sem_match_seguro'].includes(String(item.metodo_conciliacao || ''))) {
    const candidate = item.candidatos_conciliacao?.[0]
    if (candidate) {
      const confidence = candidate.confianca != null ? ` Confiança estimada ${Math.min(100, Number(candidate.confianca))}%.` : ''
      const evidence = candidate.evidencias?.length
        ? ` Evidências: ${candidate.evidencias.map(reconciliationEvidenceLabel).join(', ')}.`
        : ''
      return `Correspondência provável: ${candidate.cliente || report?.cliente_nome || 'cliente identificado'}${candidate.contrato ? ` — ${candidate.contrato}` : ''}${candidate.parcela ? ` — parcela ${candidate.parcela}` : ''}. O valor diverge, mas pode estar explicado por juros, moras ou desconto do relatório Strato. Revise e confirme na conferência inteligente.${confidence}${evidence}`
    }
    return `O relatório Strato identificou ${report?.cliente_nome || 'o título'}, mas o backend não encontrou uma parcela única com evidências suficientes. Nenhuma baixa automática foi feita.`
  }
  if (item.status_processamento === 'ja_baixado') {
    return item.movimento_id ? `Já estava vinculado ao movimento ${item.movimento_id}.` : 'A parcela já estava marcada como recebida.'
  }
  if (item.status_processamento === 'liquidado' || item.status_processamento === 'baixado') return historical ? 'Baixa registrada no processamento original deste retorno.' : 'Baixa criada agora a partir do retorno.'
  if (item.status_processamento === 'pronto_para_baixa' || item.status_processamento === 'pronto') return 'Localizado e pronto para baixa na execução.'
  if (item.status_processamento === 'pronto_para_baixa_movimento_existente') return 'Localizado e pronto para vincular ao movimento bancário já existente.'
  if (item.status_processamento === 'nao_localizado') {
    if (item.ocorrencia && item.ocorrencia !== '06') return `${item.ocorrencia_descricao || 'Ocorrência bancária'}; não é liquidação de cobrança.`
    return 'Não foi encontrada parcela correspondente por nosso número, controle/documento, vencimento e valor. Anexe o relatório Strato da mesma remessa para ampliar a conferência com os dados do cliente, unidade, parcela e boleto.'
  }
  return item.ocorrencia_descricao || 'Sem detalhe informado pelo banco.'
}

function buildReturnSuccessMessage(filesCount: number, result: ReturnProcessingResult, preview: boolean) {
  const fileLabel = filesCount === 1 ? '1 retorno' : `${filesCount} retornos`
  if (result.duplicated) {
    return filesCount === 1
      ? 'Este retorno já havia sido processado. Nenhuma baixa foi duplicada; o processamento original, as parcelas, os valores e os movimentos estão detalhados abaixo.'
      : `${fileLabel} já haviam sido processados. Nenhuma baixa foi duplicada; os processamentos originais, as parcelas, os valores e os movimentos estão detalhados abaixo.`
  }
  if (preview) {
    return `Prévia de ${fileLabel}: ${result.liquidacoes_prontas || 0} título(s) pronto(s), ` +
      `${result.ja_baixadas || 0} já baixado(s), ${result.nao_localizados || 0} não localizado(s). Nenhum registro foi alterado.`
  }
  if ((result.liquidacoes_baixadas || 0) > 0 || (result.movimentos_criados || 0) > 0) {
    return `${fileLabel} processado(s): ${result.liquidacoes_baixadas || 0} baixa(s) nova(s), ` +
      `${result.movimentos_criados || 0} movimento(s), ${formatCurrency(result.valor_baixado || 0)} recebido.`
  }
  return `${fileLabel} processado(s), mas nenhuma nova baixa foi criada: ` +
    `${result.ja_baixadas || 0} título(s) já estavam baixados e ${result.nao_localizados || 0} item(ns) não foram localizados. Confira o detalhe abaixo.`
}
function escapePdfHtml(value: unknown) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildReturnPdfHtml(result: ReturnProcessingResult) {
  const generatedAt = new Date().toLocaleString('pt-BR')
  const title = result.preview ? 'Prévia do retorno Bradesco' : result.duplicated ? 'Retorno Bradesco já processado' : 'Resultado do retorno Bradesco'
  const rows = (result.itens || []).map((item, itemIndex) => {
    const status = returnItemStatusLabel(item, Boolean(result.duplicated))
    const reason = returnItemReason(item, Boolean(result.duplicated))
    const rowClass = item.status_processamento === 'nao_localizado' && item.ocorrencia === '06'
      ? ' class="not-found"'
      : item.status_processamento === 'liquidado' || item.status_processamento === 'baixado' || item.status_processamento === 'ja_baixado'
        ? ' class="ok"'
        : ''
    return `
      <tr${rowClass}>
        <td>${escapePdfHtml(itemIndex + 1)}</td>
        <td>${escapePdfHtml(item.arquivo_origem || result.arquivo || '—')}</td>
        <td>${escapePdfHtml(status)}</td>
        <td>${escapePdfHtml(`${item.ocorrencia || '—'} · ${item.ocorrencia_descricao || '—'}`)}</td>
        <td><strong>${escapePdfHtml(item.cliente || item.relatorio_strato?.cliente_nome || 'Não localizado')}</strong><br><span>${escapePdfHtml(item.contrato || (item.relatorio_strato ? `${item.relatorio_strato.cliente_codigo || 'sem código'} · ${item.relatorio_strato.unidade || 'sem unidade'} · parcela ${item.relatorio_strato.parcela || '—'}` : (item.status_processamento === 'nao_localizado' ? 'sem parcela/contrato conciliado' : 'sem contrato localizado')))}</span></td>
        <td>${escapePdfHtml(fullNossoNumero(item))}</td>
        <td>${escapePdfHtml(item.controle_participante || '—')}</td>
        <td>${escapePdfHtml(item.documento || '—')}</td>
        <td>${escapePdfHtml(formatDate(item.vencimento))}</td>
        <td>${escapePdfHtml(formatDate(item.data_recebimento || result.data_recebimento))}</td>
        <td class="right">${escapePdfHtml(formatCurrency(item.valor_pago || item.valor_titulo))}</td>
        <td>${escapePdfHtml(reason)}</td>
      </tr>`
  }).join('')

  const cards = [
    ['Títulos localizados', result.conciliados],
    ['Não localizados', result.nao_localizados],
    [result.preview ? 'Prontos' : result.duplicated ? 'Baixas registradas' : 'Baixados agora', result.preview ? result.liquidacoes_prontas : result.liquidacoes_baixadas],
    ['Já baixados', result.ja_baixadas],
    [result.duplicated ? 'Movimentos vinculados' : 'Movimentos novos', result.movimentos_criados],
    ['Via relatório/IA', result.conciliados_por_relatorio || 0],
    [result.preview ? 'Valor localizado' : result.duplicated ? 'Valor registrado' : 'Valor baixado agora', formatCurrency(result.preview ? result.valor_liquidado : result.valor_baixado)],
  ].map(([label, value]) => `<div class="card"><small>${escapePdfHtml(label)}</small><strong>${escapePdfHtml(value)}</strong></div>`).join('')

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapePdfHtml(title)} - ${escapePdfHtml(result.arquivo)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #fff; }
    header { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    p { margin: 2px 0; font-size: 11px; color: #475569; }
    .cards { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin: 10px 0 12px; }
    .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px; background: #f8fafc; }
    .card small { display: block; font-size: 8px; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
    .card strong { font-size: 12px; }
    .note { border: 1px solid #bfdbfe; background: #eff6ff; color: #1e3a8a; border-radius: 6px; padding: 8px; margin-bottom: 10px; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9px; }
    th { background: #0f172a; color: #fff; text-align: left; padding: 6px 5px; border: 1px solid #0f172a; }
    td { vertical-align: top; padding: 5px; border: 1px solid #dbe4ef; word-break: break-word; }
    td span { color: #64748b; font-size: 8px; }
    .right { text-align: right; white-space: nowrap; }
    .not-found td { background: #fff7ed; }
    .ok td { background: #f0fdf4; }
    .footer { margin-top: 8px; color: #64748b; font-size: 9px; }
    @media screen { body { padding: 14px; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapePdfHtml(title)}</h1>
      <p><strong>Arquivo:</strong> ${escapePdfHtml(result.arquivo)} · <strong>Empresa:</strong> ${escapePdfHtml(result.empresa || 'empresa não identificada')}</p>
      <p><strong>Registros:</strong> ${escapePdfHtml(result.registros || 0)} · <strong>Títulos:</strong> ${escapePdfHtml(result.titulos || 0)} · <strong>Recebimento:</strong> ${escapePdfHtml(formatDate(result.data_recebimento))}</p>
      ${result.duplicated ? `<p><strong>Processamento original:</strong> ${escapePdfHtml(formatDateTime(result.processado_em))} · <strong>Operador:</strong> ${escapePdfHtml(result.processado_por || 'não identificado')}</p>` : ''}
    </div>
    <div>
      <p><strong>Gerado em:</strong> ${escapePdfHtml(generatedAt)}</p>
      <p><strong>Sistema:</strong> LarmHub</p>
    </div>
  </header>
  <div class="note">${escapePdfHtml(buildReturnMainExplanation(result))}</div>
  <div class="cards">${cards}</div>
  <table>
    <thead>
      <tr>
        <th style="width: 4%">Item</th>
        <th style="width: 10%">Arquivo</th>
        <th style="width: 8%">Status</th>
        <th style="width: 11%">Ocorrência</th>
        <th style="width: 17%">Cliente / Contrato</th>
        <th style="width: 10%">Nosso número</th>
        <th style="width: 8%">Controle</th>
        <th style="width: 9%">Documento</th>
        <th style="width: 7%">Vencimento</th>
        <th style="width: 7%">Recebimento</th>
        <th style="width: 8%">Valor</th>
        <th style="width: 12%">Detalhe</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="12">Nenhum item retornado pelo banco.</td></tr>'}</tbody>
  </table>
  <div class="footer">PDF gerado pela tela de Contas a Receber > Retorno Bradesco.</div>
</body>
</html>`
}


function buildReturnMainExplanation(result: ReturnProcessingResult) {
  if (result.duplicated) {
    const processed = result.processado_em ? ` em ${formatDateTime(result.processado_em)}` : ''
    const operator = result.processado_por ? ` por ${result.processado_por}` : ''
    return `Este arquivo já havia sido processado${processed}${operator}. Nenhuma baixa foi repetida. Abaixo estão os títulos, parcelas, valores e movimentos registrados no processamento original.`
  }
  const naoLocalizadosLiquidacao = (result.itens || []).filter(item => item.status_processamento === 'nao_localizado' && item.ocorrencia === '06').length
  const ocorrenciasSemLiquidacao = (result.itens || []).filter(item => item.status_processamento === 'nao_localizado' && item.ocorrencia !== '06').length
  const reportInfo = (result.relatorios_strato_processados || 0) > 0
    ? ` ${result.relatorios_strato_processados} relatório(s) Strato analisado(s) e ${result.conciliados_por_relatorio || 0} título(s) conciliado(s) por essa conferência.`
    : ''
  if (result.preview) {
    return `Prévia segura: o arquivo foi lido e conferido, mas nenhuma baixa foi gravada.${reportInfo}`
  }
  if ((result.liquidacoes_baixadas || 0) > 0) {
    return `${result.liquidacoes_baixadas} baixa(s) foram gravadas agora e ${result.movimentos_criados || 0} movimento(s) bancário(s) foram criado(s).${reportInfo}`
  }
  if ((result.ja_baixadas || 0) > 0 || (result.nao_localizados || 0) > 0) {
    const parts = []
    if ((result.ja_baixadas || 0) > 0) parts.push(`${result.ja_baixadas} título(s) já estavam baixados antes deste processamento`)
    if (naoLocalizadosLiquidacao > 0) parts.push(`${naoLocalizadosLiquidacao} liquidação(ões) não foram encontradas no Contas a Receber`)
    if (ocorrenciasSemLiquidacao > 0) parts.push(`${ocorrenciasSemLiquidacao} ocorrência(s) não eram liquidação normal`)
    return `${parts.join('; ')}. Por isso nenhum novo movimento foi criado.${reportInfo}`
  }
  return `Arquivo processado. Confira os indicadores e os detalhes abaixo.${reportInfo}`
}

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Não foi possível ler ${file.name}.`))
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}

function filenameFromDisposition(value?: string) {
  const match = String(value || '').match(/filename="?([^";]+)"?/i)
  return match?.[1] || 'remessa-bradesco.TST'
}


function boletoClientShortName(value?: string | null) {
  const normalized = String(value || 'CLIENTE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return normalized.slice(0, 10) || 'CLIENTE'
}

function boletoEmissionDate(html: string) {
  const match = String(html || '').match(/Data do documento[\s\S]{0,180}?(\d{2})\/(\d{2})\/(\d{4})/i)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : todayIso()
}

function boletoPdfBaseName(parcelIds: string[], rows: ParcelaReceber[], html: string) {
  const selectedRows = parcelIds.map(id => rows.find(row => row.id === id)).filter(Boolean) as ParcelaReceber[]
  const clientNames = Array.from(new Set(selectedRows.map(row => String(row.cliente_nome || '').trim()).filter(Boolean)))
  const clientPart = clientNames.length === 1 ? boletoClientShortName(clientNames[0]) : 'BOLETOS'
  return `${clientPart}_${boletoEmissionDate(html)}`
}

function enhanceBoletoHtml(html: string, parcelIds: string[], rows: ParcelaReceber[], channelOwner: string) {
  const pdfBaseName = boletoPdfBaseName(parcelIds, rows, html)
  const requestId = `boleto-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const actions = `<div class="actions larmhub-boleto-actions">
    <button type="button" onclick="window.print()">Imprimir / Salvar PDF</button>
    <button type="button" onclick="window.larmHubBoletoShare('email')">Enviar por e-mail</button>
    <button type="button" onclick="window.larmHubBoletoShare('whatsapp')">Compartilhar no WhatsApp</button>
    <button type="button" onclick="window.close()">Fechar</button>
    <span id="larmhub-share-status" class="larmhub-share-status">PDF: ${pdfBaseName}.pdf</span>
  </div>`

  let output = String(html || '')
  if (/<title>[\s\S]*?<\/title>/i.test(output)) {
    output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${pdfBaseName}</title>`)
  } else {
    output = output.replace(/<head>/i, `<head><title>${pdfBaseName}</title>`)
  }

  if (/<div class="actions">[\s\S]*?<\/div>/i.test(output)) {
    output = output.replace(/<div class="actions">[\s\S]*?<\/div>/i, actions)
  } else {
    output = output.replace(/<body>/i, `<body>${actions}`)
  }

  const extraStyle = `<style>
    .larmhub-boleto-actions{align-items:center;flex-wrap:wrap}
    .larmhub-boleto-actions button:nth-of-type(2){border-color:#bfdbfe;background:#eff6ff;color:#1d4ed8}
    .larmhub-boleto-actions button:nth-of-type(3){border-color:#bbf7d0;background:#f0fdf4;color:#15803d}
    .larmhub-share-status{font-size:12px;color:#475569;margin-left:4px}
    @media print{.larmhub-boleto-actions{display:none!important}}
  </style>`
  output = output.replace(/<\/head>/i, `${extraStyle}</head>`)

  const script = `<script>
  (function(){
    var parcelIds=${JSON.stringify(parcelIds)};
    var owner=${JSON.stringify(channelOwner)};
    var requestId=${JSON.stringify(requestId)};
    var status=document.getElementById('larmhub-share-status');
    var whatsappWindow=null;
    var channel=null;

    function setStatus(message,isError){
      if(!status)return;
      status.textContent=message;
      status.style.color=isError?'#b91c1c':'#166534';
    }

    function send(action){
      if(typeof BroadcastChannel==='undefined'){
        setStatus('Seu navegador não permite o compartilhamento direto nesta aba.',true);
        return;
      }
      if(action==='whatsapp'){
        whatsappWindow=window.open('about:blank','_blank');
        if(whatsappWindow){
          whatsappWindow.document.write('<p style="font-family:Arial;padding:20px">Preparando WhatsApp...</p>');
        }
      }
      setStatus(action==='email'?'Enviando boleto por e-mail...':'Preparando compartilhamento no WhatsApp...',false);
      channel=channel||new BroadcastChannel('larmhub-boleto-share');
      channel.postMessage({source:'larmhub-boleto',owner:owner,requestId:requestId,action:action,parcelaIds:parcelIds});
    }

    window.larmHubBoletoShare=send;
    if(typeof BroadcastChannel!=='undefined'){
      channel=new BroadcastChannel('larmhub-boleto-share');
      channel.onmessage=function(event){
        var data=event.data||{};
        if(data.source!=='larmhub-boleto-result'||data.owner!==owner||data.requestId!==requestId)return;
        setStatus(data.message|| (data.ok?'Operação concluída.':'Não foi possível concluir.'),!data.ok);
        if(data.action==='whatsapp'){
          if(data.ok&&data.url&&whatsappWindow){
            whatsappWindow.location.href=data.url;
          }else if(whatsappWindow){
            whatsappWindow.close();
          }
        }
      };
    }
  })();
  <\/script>`
  return output.replace(/<\/body>/i, `${script}</body>`)
}

export default function ContasReceberPage() {
  const currentUser = useAuthStore(state => state.user)
  const roleCanWriteFinance = FINANCE_WRITE_ROLES.has(String(currentUser?.role || '').trim().toLowerCase())
  const canManualPayment = roleCanWriteFinance || hasModuleAccess(currentUser, 'fin_receber', 'write')

  const [rows, setRows] = useState<ParcelaReceber[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [filters, setFilters] = useState<FilterData>({ clientes: [], tipos_receita: [], obras: [], empresas_cobranca: [] })
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
  const [empresa, setEmpresa] = useState<EmpresaCobranca | ''>('')
  const [vencimentoInicio, setVencimentoInicio] = useState(firstDayOfCurrentMonth())
  const [vencimentoFim, setVencimentoFim] = useState('')
  const [recebimentoInicio, setRecebimentoInicio] = useState('')
  const [recebimentoFim, setRecebimentoFim] = useState('')
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

  const [manualPaymentRow, setManualPaymentRow] = useState<ParcelaReceber | null>(null)
  const [manualPaymentForm, setManualPaymentForm] = useState<ManualPaymentForm | null>(null)
  const [manualPaymentBanks, setManualPaymentBanks] = useState<BankAccountOption[]>([])
  const [manualPaymentBanksLoading, setManualPaymentBanksLoading] = useState(false)
  const [manualPaymentSaving, setManualPaymentSaving] = useState(false)
  const [manualPaymentError, setManualPaymentError] = useState('')
  const [editingReceiptDateId, setEditingReceiptDateId] = useState<string | null>(null)
  const [editingReceiptDateValue, setEditingReceiptDateValue] = useState('')
  const [receiptDateSavingId, setReceiptDateSavingId] = useState<string | null>(null)

  const [configOpen, setConfigOpen] = useState(false)
  const [config, setConfig] = useState<BradescoConfig>(() => emptyBradescoConfig('LARM'))
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState('')
  const [systemCompanies, setSystemCompanies] = useState<SystemCompany[]>([])
  const [companiesLoading, setCompaniesLoading] = useState(false)
  const [configCepLoading, setConfigCepLoading] = useState(false)
  const [remittanceLoading, setRemittanceLoading] = useState(false)
  const [batchBoletoLoading, setBatchBoletoLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [whatsappLoading, setWhatsappLoading] = useState(false)
  const [returnApplyPayment, setReturnApplyPayment] = useState(true)
  const [returnLoading, setReturnLoading] = useState(false)
  const [returnResult, setReturnResult] = useState<ReturnProcessingResult | null>(null)
  const [stratoIntelligentReview, setStratoIntelligentReview] = useState<StratoAnalysisFile[]>([])
  const [pendingStratoApplyPayload, setPendingStratoApplyPayload] = useState<IntelligentReturnPayload | null>(null)
  const [stratoApplyLoading, setStratoApplyLoading] = useState(false)
  const [stratoReportFiles, setStratoReportFiles] = useState<File[]>([])
  const [boletoLoadingId, setBoletoLoadingId] = useState<string | null>(null)
  const [boletoError, setBoletoError] = useState('')

  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const returnInputRef = useRef<HTMLInputElement | null>(null)
  const stratoReportInputRef = useRef<HTMLInputElement | null>(null)
  const lastConfigCepRef = useRef('')
  const boletoChannelOwnerRef = useRef(`receber-${Math.random().toString(16).slice(2)}-${Date.now()}`)
  const tableMinWidth = 2030

  const requestParams = useMemo(() => ({
    page,
    limit,
    busca: busca || undefined,
    cliente_id: clienteId || undefined,
    tipo_receita_id: tipoReceitaId || undefined,
    obra_id: obraId || undefined,
    empresa: empresa || undefined,
    venc_inicio: vencimentoInicio || undefined,
    venc_fim: vencimentoFim || undefined,
    receb_inicio: recebimentoInicio || undefined,
    receb_fim: recebimentoFim || undefined,
    status,
    sort,
    direction,
  }), [page, limit, busca, clienteId, tipoReceitaId, obraId, empresa, vencimentoInicio, vencimentoFim, recebimentoInicio, recebimentoFim, status, sort, direction])

  const eligibleIds = useMemo(() => rows.filter(row => ['aberta', 'atrasada'].includes(row.status)).map(row => row.id), [rows])
  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every(id => selected.has(id))
  const billingSystemCompanies = useMemo(
    () => systemCompanies.filter(item => item.empresa_cobranca === 'LARM' || item.empresa_cobranca === 'LUCKY'),
    [systemCompanies],
  )


  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  const loadSystemCompanies = useCallback(async () => {
    setCompaniesLoading(true)
    try {
      const response = await apiClient.get('/cadastros/empresas')
      const data = Array.isArray(response.data?.data) ? response.data.data : []
      setSystemCompanies(data)
      return data as SystemCompany[]
    } catch (requestError: unknown) {
      setConfigError(requestErrorMessage(requestError, 'Não foi possível carregar as empresas cadastradas.'))
      setSystemCompanies([])
      return [] as SystemCompany[]
    } finally {
      setCompaniesLoading(false)
    }
  }, [])

  const loadFilters = useCallback(async () => {
    try {
      const response = await apiClient.get('/financeiro/contas-receber/filtros')
      const data = response.data?.data || {}
      setFilters({
        clientes: Array.isArray(data.clientes) ? data.clientes : [],
        tipos_receita: Array.isArray(data.tipos_receita) ? data.tipos_receita : [],
        obras: Array.isArray(data.obras) ? data.obras : [],
        empresas_cobranca: Array.isArray(data.empresas_cobranca) ? data.empresas_cobranca : [],
      })
    } catch {
      setFilters({ clientes: [], tipos_receita: [], obras: [], empresas_cobranca: [] })
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
  useEffect(() => { void loadSystemCompanies() }, [loadSystemCompanies])
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
    setEmpresa('')
    setVencimentoInicio(firstDayOfCurrentMonth())
    setVencimentoFim('')
    setRecebimentoInicio('')
    setRecebimentoFim('')
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

  const openManualPayment = async (row: ParcelaReceber) => {
    setManualPaymentRow(row)
    setManualPaymentError('')
    setManualPaymentBanks([])
    setManualPaymentForm({
      data_recebimento: todayIso(),
      valor_recebido: Number(row.valor_total || 0).toFixed(2),
      banco_conta_id: '',
      forma_pagamento: 'Transferência',
      observacoes: '',
    })

    setManualPaymentBanksLoading(true)
    try {
      const response = await apiClient.get('/financeiro/bancos', {
        params: row.empresa_cobranca ? { empresa: row.empresa_cobranca } : {},
      })
      const accounts = (Array.isArray(response.data?.data) ? response.data.data : [])
        .filter((account: BankAccountOption) => account.ativo !== false)
      setManualPaymentBanks(accounts)
      if (accounts.length) {
        setManualPaymentForm(current => current ? { ...current, banco_conta_id: String(accounts[0].id) } : current)
      }
    } catch (requestError: unknown) {
      setManualPaymentError(requestErrorMessage(requestError, 'Não foi possível carregar as contas bancárias disponíveis.'))
    } finally {
      setManualPaymentBanksLoading(false)
    }
  }

  const closeManualPayment = () => {
    if (manualPaymentSaving) return
    setManualPaymentRow(null)
    setManualPaymentForm(null)
    setManualPaymentBanks([])
    setManualPaymentError('')
  }

  const confirmManualPayment = async () => {
    if (!manualPaymentRow || !manualPaymentForm) return

    const amount = Number(manualPaymentForm.valor_recebido)
    if (!manualPaymentForm.data_recebimento) {
      setManualPaymentError('Informe a data do recebimento.')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualPaymentError('Informe um valor recebido maior que zero.')
      return
    }
    if (!manualPaymentForm.banco_conta_id) {
      setManualPaymentError('Selecione a conta bancária que recebeu o valor.')
      return
    }
    if (!manualPaymentForm.forma_pagamento.trim()) {
      setManualPaymentError('Informe a forma de pagamento.')
      return
    }

    setManualPaymentSaving(true)
    setManualPaymentError('')
    setError('')
    setSuccess('')
    try {
      await apiClient.patch(`/financeiro/contas-receber/${manualPaymentRow.id}/baixar-manual`, {
        data_recebimento: manualPaymentForm.data_recebimento,
        valor_recebido: amount,
        banco_conta_id: Number(manualPaymentForm.banco_conta_id),
        forma_pagamento: manualPaymentForm.forma_pagamento.trim(),
        observacoes: manualPaymentForm.observacoes.trim() || undefined,
      })
      setSuccess(`Baixa manual registrada para ${manualPaymentRow.cliente_nome || 'o cliente'} no valor de ${formatCurrency(amount)}.`)
      setManualPaymentRow(null)
      setManualPaymentForm(null)
      setManualPaymentBanks([])
      await load()
    } catch (requestError: unknown) {
      setManualPaymentError(requestErrorMessage(requestError, 'Não foi possível registrar a baixa manual.'))
    } finally {
      setManualPaymentSaving(false)
    }
  }

  const startEditingReceiptDate = (row: ParcelaReceber) => {
    if (row.status !== 'paga') return
    setEditingReceiptDateId(row.id)
    setEditingReceiptDateValue(String(row.pago_em || row.conciliado_em || '').slice(0, 10))
    setError('')
  }

  const cancelEditingReceiptDate = () => {
    if (receiptDateSavingId) return
    setEditingReceiptDateId(null)
    setEditingReceiptDateValue('')
  }

  const saveReceiptDate = async (row: ParcelaReceber) => {
    if (!editingReceiptDateValue) {
      setError('Informe a data do recebimento.')
      return
    }
    setReceiptDateSavingId(row.id)
    setError('')
    setSuccess('')
    try {
      const response = await apiClient.patch(`/financeiro/contas-receber/${row.id}/data-recebimento`, {
        data_recebimento: editingReceiptDateValue,
      })
      setSuccess(response.data?.message || 'Data de recebimento atualizada.')
      setEditingReceiptDateId(null)
      setEditingReceiptDateValue('')
      await load()
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível alterar a data de recebimento.'))
    } finally {
      setReceiptDateSavingId(null)
    }
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
      incluir_parcelas_anteriores: true,
    }
    setRecalcRow(row)
    setRecalcForm(form)
    setRecalcData(null)
    setRecalcSaved(false)
    setBoletoError('')
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
    incluir_parcelas_anteriores: form.incluir_parcelas_anteriores,
  })

  const updateRecalcForm = (patch: Partial<RecalcForm>) => {
    setRecalcForm(current => current ? { ...current, ...patch } : current)
    setRecalcSaved(false)
    setBoletoError('')
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
      const savedIds = Array.isArray(savedData?.parcelas_ids) ? savedData.parcelas_ids : [recalcRow.id]
      setSelected(current => new Set([...current, ...savedIds]))
      setSuccess(`${savedIds.length} parcela(s) recalculada(s) para ${formatDate(savedData?.data_calculo)}.`)
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
    setBoletoError('')
    setBoletoLoadingId(row.id)
    try {
      // Primeiro valida e gera no backend. A nova aba só é criada depois de
      // receber um HTML válido, evitando a aba branca que abria e fechava no erro.
      const response = await apiClient.post(
        `/financeiro/contas-receber/${row.id}/bradesco/boleto`,
        {
          data_recalculo: fromRecalculation
            ? (recalcData?.data_calculo || row.data_recalculo || undefined)
            : (row.data_recalculo || undefined),
        },
      )
      const html = response.data?.data?.html
      if (!html) throw new Error('O banco não retornou o boleto para impressão.')
      const printableHtml = enhanceBoletoHtml(html, [row.id], rows, boletoChannelOwnerRef.current)

      const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)

      setSuccess(response.data?.data?.homologado ? 'Boleto gerado.' : 'Boleto de homologação gerado. Valide antes do uso em produção.')
      await load()
    } catch (requestError: unknown) {
      const message = requestErrorMessage(requestError, 'Não foi possível gerar o boleto.')
      if (fromRecalculation) setBoletoError(message)
      else setError(message)
    } finally {
      setBoletoLoadingId(null)
    }
  }

  const openHtmlDocument = (html: string, parcelIds: string[]) => {
    const printableHtml = enhanceBoletoHtml(html, parcelIds, rows, boletoChannelOwnerRef.current)
    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const combineBoletoDocuments = (documents: string[]) => {
    if (documents.length === 1) return documents[0]

    const parser = new DOMParser()
    const styles = new Set<string>()
    const pages = documents.map((html, index) => {
      const documentHtml = parser.parseFromString(html, 'text/html')
      documentHtml.querySelectorAll('style').forEach(style => {
        if (style.textContent) styles.add(style.textContent)
      })
      documentHtml.querySelectorAll('.actions').forEach(element => element.remove())
      return `${index > 0 ? '<div class="larmhub-page-break"></div>' : ''}<section class="larmhub-boleto-page">${documentHtml.body.innerHTML}</section>`
    })

    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Boletos Bradesco</title><style>${Array.from(styles).join('\n')}
.larmhub-page-break{break-after:page;page-break-after:always}.larmhub-boleto-page{position:relative}@media print{.larmhub-page-break{display:block}}</style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Salvar PDF</button><button onclick="window.close()">Fechar</button></div>${pages.join('')}</body></html>`
  }

  const generateBoletosUsingWorkingRoute = async (ids: string[]) => {
    const documents: string[] = []
    let homologation = false

    for (const id of ids) {
      const currentRow = rows.find(row => row.id === id)
      const recalculationDate = recalcData?.parcelas_ids?.includes(id)
        ? recalcData.data_calculo
        : currentRow?.data_recalculo || undefined
      const response = await apiClient.post(
        `/financeiro/contas-receber/${id}/bradesco/boleto`,
        { data_recalculo: recalculationDate },
      )
      const html = response.data?.data?.html
      if (!html) throw new Error(`O backend não retornou o boleto da parcela ${currentRow?.numero || id}.`)
      documents.push(html)
      if (!response.data?.data?.homologado) homologation = true
    }

    return { html: combineBoletoDocuments(documents), quantidade: documents.length, homologation }
  }

  const generateSelectedBoletos = async (ids: string[] = Array.from(selected)) => {
    if (!ids.length) return
    setBatchBoletoLoading(true)
    setError('')
    setSuccess('')
    setBoletoError('')
    try {
      // Um único boleto volta a usar exatamente a rota que já funcionava antes.
      // Para vários títulos, tenta a rota em lote e mantém fallback compatível
      // com backends que ainda possuem somente a rota individual.
      let result: { html: string; quantidade: number; homologation: boolean }
      if (ids.length === 1) {
        result = await generateBoletosUsingWorkingRoute(ids)
      } else {
        try {
          const response = await apiClient.post('/financeiro/contas-receber/bradesco/boletos', { parcela_ids: ids })
          const html = response.data?.data?.html
          if (!html) throw new Error('O backend não retornou os boletos para impressão.')
          result = {
            html,
            quantidade: Number(response.data?.data?.quantidade || ids.length),
            homologation: Boolean(response.data?.data?.homologacao),
          }
        } catch (batchError: unknown) {
          const batchResponse = batchError as { response?: { status?: number; data?: { message?: string } } }
          const batchMessage = String(batchResponse.response?.data?.message || '')
          const routeUnavailable = batchResponse.response?.status === 404 || /rota não encontrada/i.test(batchMessage)
          if (!routeUnavailable) throw batchError
          result = await generateBoletosUsingWorkingRoute(ids)
        }
      }

      openHtmlDocument(result.html, ids)
      setSuccess(result.homologation
        ? `${result.quantidade} boleto(s) de homologação gerado(s) para impressão.`
        : `${result.quantidade} boleto(s) gerado(s) para impressão.`)
      await load()
    } catch (requestError: unknown) {
      const message = requestErrorMessage(requestError, 'Não foi possível gerar os boletos selecionados.')
      if (recalcRow) setBoletoError(message)
      else setError(message)
    } finally {
      setBatchBoletoLoading(false)
    }
  }

  const sendSelectedEmails = async () => {
    if (!selected.size) return
    setEmailLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiClient.post('/financeiro/contas-receber/bradesco/enviar-email', { parcela_ids: Array.from(selected) })
      const result = response.data?.data || {}
      setSuccess(`${result.enviados || 0} boleto(s) enviado(s) por e-mail.${result.erros ? ` ${result.erros} com erro.` : ''}`)
      await load()
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível enviar os boletos por e-mail.'))
      await load()
    } finally {
      setEmailLoading(false)
    }
  }

  const prepareSelectedWhatsApp = async () => {
    if (!selected.size) return
    setWhatsappLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiClient.post('/financeiro/contas-receber/bradesco/whatsapp', { parcela_ids: Array.from(selected) })
      const result = response.data?.data || {}
      const links = Array.isArray(result.links) ? result.links : []
      if (links.length === 1) {
        window.open(links[0].url, '_blank', 'noopener,noreferrer')
      } else if (links.length > 1) {
        const content = links.map((item: { cliente?: string; telefone?: string; url: string }) => `${item.cliente || item.telefone || 'Cliente'}\n${item.url}`).join('\n\n')
        downloadBlob(content, 'links-whatsapp-boletos.txt')
        window.open(links[0].url, '_blank', 'noopener,noreferrer')
      }
      setSuccess(`${result.preparados || 0} boleto(s) preparado(s) para WhatsApp.${links.length > 1 ? ' Os demais links foram baixados em TXT.' : ''}`)
      await load()
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível preparar o envio por WhatsApp.'))
      await load()
    } finally {
      setWhatsappLoading(false)
    }
  }


  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('larmhub-boleto-share')

    channel.onmessage = async event => {
      const data = event.data as {
        source?: string
        owner?: string
        requestId?: string
        action?: 'email' | 'whatsapp'
        parcelaIds?: string[]
      }
      if (data?.source !== 'larmhub-boleto' || data.owner !== boletoChannelOwnerRef.current) return
      const ids = Array.from(new Set(Array.isArray(data.parcelaIds) ? data.parcelaIds.filter(Boolean) : []))
      if (!ids.length || !data.requestId || !data.action) return

      const reply = (payload: { ok: boolean; message: string; url?: string }) => {
        channel.postMessage({
          source: 'larmhub-boleto-result',
          owner: data.owner,
          requestId: data.requestId,
          action: data.action,
          ...payload,
        })
      }

      if (data.action === 'email') {
        setEmailLoading(true)
        setError('')
        setSuccess('')
        try {
          const response = await apiClient.post('/financeiro/contas-receber/bradesco/enviar-email', { parcela_ids: ids })
          const result = response.data?.data || {}
          const message = `${result.enviados || 0} boleto(s) enviado(s) por e-mail.${result.erros ? ` ${result.erros} com erro.` : ''}`
          setSuccess(message)
          reply({ ok: Number(result.enviados || 0) > 0, message })
          await load()
        } catch (requestError: unknown) {
          const message = requestErrorMessage(requestError, 'Não foi possível enviar o boleto por e-mail.')
          setError(message)
          reply({ ok: false, message })
        } finally {
          setEmailLoading(false)
        }
        return
      }

      setWhatsappLoading(true)
      setError('')
      setSuccess('')
      try {
        const response = await apiClient.post('/financeiro/contas-receber/bradesco/whatsapp', { parcela_ids: ids })
        const result = response.data?.data || {}
        const links = Array.isArray(result.links) ? result.links : []
        if (links.length > 1) {
          const content = links.map((item: { cliente?: string; telefone?: string; url: string }) => `${item.cliente || item.telefone || 'Cliente'}\n${item.url}`).join('\n\n')
          downloadBlob(content, 'links-whatsapp-boletos.txt')
        }
        const message = links.length
          ? `${result.preparados || 0} boleto(s) preparado(s) para WhatsApp.${links.length > 1 ? ' Os demais links foram baixados em TXT.' : ''}`
          : requestErrorMessage({ response: { data: { message: result.falhas?.[0]?.message } } }, 'Nenhum telefone válido foi encontrado para o cliente.')
        setSuccess(links.length ? message : '')
        if (!links.length) setError(message)
        reply({ ok: links.length > 0, message, url: links[0]?.url })
        await load()
      } catch (requestError: unknown) {
        const message = requestErrorMessage(requestError, 'Não foi possível preparar o envio por WhatsApp.')
        setError(message)
        reply({ ok: false, message })
      } finally {
        setWhatsappLoading(false)
      }
    }

    return () => channel.close()
  }, [load])

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

  const processReturnFiles = async (selectedFiles?: FileList | File[]) => {
    const files = Array.from(selectedFiles || [])
    if (!files.length) return
    setReturnLoading(true)
    setError('')
    setSuccess('')
    setReturnResult(null)
    setStratoIntelligentReview([])
    setPendingStratoApplyPayload(null)
    let intelligentPayload: IntelligentReturnPayload | null = null
    try {
      const payloadFiles = await Promise.all(files.map(async file => ({
        filename: file.name,
        content: new TextDecoder('windows-1252').decode(await file.arrayBuffer()),
      })))
      const payloadReports = await Promise.all(stratoReportFiles.map(async file => ({
        filename: file.name,
        mime_type: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        base64: await fileToBase64(file),
      })))
      intelligentPayload = {
        files: payloadFiles,
        relatorios_strato: payloadReports,
      }
      const response = await apiClient.post('/financeiro/contas-receber/bradesco/retorno', {
        files: payloadFiles,
        relatorios_strato: payloadReports,
        baixar_liquidacoes: returnApplyPayment,
      })

      const responseResults = Array.isArray(response.data?.data?.arquivos)
        ? response.data.data.arquivos as ReturnProcessingResult[]
        : response.data?.data
          ? [response.data.data as ReturnProcessingResult]
          : []

      if (!responseResults.length) throw new Error('O backend não retornou o resultado dos arquivos.')

      const intelligentFiles = responseResults
        .filter(result => Boolean(result.analise_inteligente))
        .map(result => ({
          arquivo: result.arquivo,
          analise_inteligente: result.analise_inteligente as StratoIntelligentAnalysis,
        }))
      setStratoIntelligentReview(intelligentFiles)
      setPendingStratoApplyPayload(intelligentFiles.length ? intelligentPayload : null)

      const companies = Array.from(new Set(responseResults.map(result => result.empresa).filter(Boolean)))
      const receiptDates = Array.from(new Set(responseResults.map(result => result.data_recebimento).filter(Boolean)))
      const aggregated = responseResults.reduce<ReturnProcessingResult>((total, result) => ({
        ...total,
        registros: Number(total.registros || 0) + Number(result.registros || 0),
        titulos: Number(total.titulos || 0) + Number(result.titulos || 0),
        conciliados: total.conciliados + Number(result.conciliados || 0),
        nao_localizados: total.nao_localizados + Number(result.nao_localizados || 0),
        liquidacoes_encontradas: total.liquidacoes_encontradas + Number(result.liquidacoes_encontradas || 0),
        liquidacoes_prontas: total.liquidacoes_prontas + Number(result.liquidacoes_prontas || 0),
        liquidacoes_baixadas: total.liquidacoes_baixadas + Number(result.liquidacoes_baixadas || 0),
        ja_baixadas: total.ja_baixadas + Number(result.ja_baixadas || 0),
        movimentos_criados: total.movimentos_criados + Number(result.movimentos_criados || 0),
        relatorios_strato_processados: Number(total.relatorios_strato_processados || 0) + Number(result.relatorios_strato_processados || 0),
        conciliados_por_relatorio: Number(total.conciliados_por_relatorio || 0) + Number(result.conciliados_por_relatorio || 0),
        ia_providers: Array.from(new Set([...(total.ia_providers || []), ...(result.ia_providers || [])])),
        valor_liquidado: total.valor_liquidado + Number(result.valor_liquidado || 0),
        valor_baixado: total.valor_baixado + Number(result.valor_baixado || 0),
        conta_bancaria_localizada: total.conta_bancaria_localizada && result.conta_bancaria_localizada !== false,
        conta_bancaria_ambigua: total.conta_bancaria_ambigua || Boolean(result.conta_bancaria_ambigua),
        itens: [...total.itens, ...(result.itens || []).map(item => ({ ...item, arquivo_origem: item.arquivo_origem || result.arquivo, empresa: item.empresa || result.empresa }))],
        duplicated: Boolean(total.duplicated && result.duplicated),
      }), {
        arquivo: responseResults.map(result => result.arquivo).join(' + '),
        empresa: companies.join(' e ') || null,
        preview: response.data?.preview || !returnApplyPayment,
        persisted: returnApplyPayment,
        processado_em: responseResults.length === 1 ? responseResults[0].processado_em : null,
        processado_por: responseResults.length === 1 ? responseResults[0].processado_por : null,
        data_recebimento: receiptDates.length === 1 ? receiptDates[0] : null,
        registros: 0,
        titulos: 0,
        conciliados: 0,
        nao_localizados: 0,
        liquidacoes_encontradas: 0,
        liquidacoes_prontas: 0,
        liquidacoes_baixadas: 0,
        ja_baixadas: 0,
        movimentos_criados: 0,
        relatorios_strato_processados: 0,
        conciliados_por_relatorio: 0,
        ia_providers: [],
        valor_liquidado: 0,
        valor_baixado: 0,
        conta_bancaria_localizada: true,
        conta_bancaria_ambigua: false,
        itens: [],
        duplicated: true,
      })

      setReturnResult(aggregated)
      setStratoReportFiles([])
      if (stratoReportInputRef.current) stratoReportInputRef.current.value = ''
      setSuccess(buildReturnSuccessMessage(files.length, aggregated, Boolean(response.data?.preview || !returnApplyPayment)))
      await load()
    } catch (requestError: unknown) {
      const responseData = (requestError as { response?: { data?: { message?: string; requires_review?: boolean; data?: { arquivos?: Array<{ arquivo?: string; analise_inteligente?: StratoIntelligentAnalysis | null }> } } } })?.response?.data
      const reviewFiles = responseData?.requires_review && Array.isArray(responseData?.data?.arquivos)
        ? responseData.data.arquivos
          .filter(entry => Boolean(entry?.analise_inteligente))
          .map((entry, index) => ({
            arquivo: entry.arquivo || files[index]?.name || `retorno-${index + 1}`,
            analise_inteligente: entry.analise_inteligente as StratoIntelligentAnalysis,
          }))
        : []

      if (reviewFiles.length) {
        setStratoIntelligentReview(reviewFiles)
        setPendingStratoApplyPayload(intelligentPayload)
        setError('')
        setSuccess(responseData?.message || 'Análise inteligente concluída. Revise as parcelas relacionadas antes da aplicação.')
        setStratoReportFiles([])
        if (stratoReportInputRef.current) stratoReportInputRef.current.value = ''
      } else {
        setError(requestErrorMessage(requestError, 'Não foi possível processar o(s) retorno(s) bancário(s).'))
      }
    } finally {
      setReturnLoading(false)
      if (returnInputRef.current) returnInputRef.current.value = ''
    }
  }

  const applyStratoIntelligentReview = async (selections: StratoApplySelection[]) => {
    if (!pendingStratoApplyPayload || !selections.length) return
    setStratoApplyLoading(true)
    setError('')
    setSuccess('')
    try {
      const response = await apiClient.post('/financeiro/contas-receber/bradesco/retorno', {
        ...pendingStratoApplyPayload,
        baixar_liquidacoes: true,
        aplicar_analise_inteligente: true,
        selecoes_inteligentes: selections.map(selection => selection.key),
      })
      const responseResults = Array.isArray(response.data?.data?.arquivos)
        ? response.data.data.arquivos as ReturnProcessingResult[]
        : []
      const refreshedReview = responseResults
        .filter(result => Boolean(result.analise_inteligente))
        .map(result => ({
          arquivo: result.arquivo,
          analise_inteligente: result.analise_inteligente as StratoIntelligentAnalysis,
        }))
      if (refreshedReview.length) setStratoIntelligentReview(refreshedReview)
      setPendingStratoApplyPayload(null)
      const summary = response.data?.data?.resumo
      setSuccess(response.data?.message || `${Number(summary?.parcelas_aplicadas || 0)} parcela(s) aplicada(s) com sucesso.`)
      await load()
    } catch (requestError: unknown) {
      setError(requestErrorMessage(requestError, 'Não foi possível aplicar os ajustes e baixas selecionados.'))
    } finally {
      setStratoApplyLoading(false)
    }
  }

  const exportReturnResultPdf = useCallback(() => {
    if (!returnResult) return
    const printWindow = window.open('', '_blank', 'width=1200,height=800')
    if (!printWindow) {
      setError('Não foi possível abrir a janela de impressão. Libere pop-ups para exportar o PDF do retorno.')
      return
    }
    printWindow.document.open()
    printWindow.document.write(buildReturnPdfHtml(returnResult))
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 350)
  }, [returnResult])


  const loadBankConfig = async (company: EmpresaCobranca, sourceCompany?: SystemCompany | null) => {
    const companyRecord = sourceCompany || billingSystemCompanies.find(item => item.empresa_cobranca === company) || null
    const baseConfig = applySystemCompany(emptyBradescoConfig(company), companyRecord)
    lastConfigCepRef.current = ''
    setConfigLoading(true)
    setConfigError('')
    setConfig(baseConfig)
    try {
      const response = await apiClient.get('/financeiro/contas-receber/bradesco/config', {
        params: { empresa: company },
      })
      const loaded = { ...baseConfig, ...(response.data?.data || {}), empresa: company } as BradescoConfig
      const merged = applySystemCompany(loaded, companyRecord)
      lastConfigCepRef.current = ''
      setConfig(merged)
    } catch (requestError: unknown) {
      setConfigError(requestErrorMessage(requestError, `Não foi possível carregar a configuração bancária da ${company}.`))
      setConfig(baseConfig)
    } finally {
      setConfigLoading(false)
    }
  }

  const lookupConfigCep = useCallback(async (cepValue: string) => {
    const digits = String(cepValue || '').replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastConfigCepRef.current) return
    lastConfigCepRef.current = digits
    setConfigCepLoading(true)
    setConfigError('')
    try {
      const response = await apiClient.get(`/cadastros/cep/${digits}`)
      const address = response.data?.data || {}
      setConfig(current => ({
        ...current,
        cep: address.cep || formatCep(digits),
        logradouro: address.logradouro || '',
        complemento: address.complemento || current.complemento || '',
        bairro: address.bairro || '',
        cidade: address.cidade || '',
        uf: String(address.uf || '').toUpperCase(),
      }))
    } catch (requestError: unknown) {
      lastConfigCepRef.current = ''
      setConfigError(requestErrorMessage(requestError, 'Não foi possível consultar o CEP.'))
    } finally {
      setConfigCepLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!configOpen || configLoading) return
    const digits = String(config.cep || '').replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastConfigCepRef.current) return
    const timer = window.setTimeout(() => void lookupConfigCep(digits), 300)
    return () => window.clearTimeout(timer)
  }, [config.cep, configLoading, configOpen, lookupConfigCep])

  const openConfig = async () => {
    setConfigOpen(true)
    const companies = billingSystemCompanies.length ? billingSystemCompanies : await loadSystemCompanies()
    const validCompanies = companies.filter(item => item.empresa_cobranca === 'LARM' || item.empresa_cobranca === 'LUCKY')
    const company: EmpresaCobranca = empresa || validCompanies[0]?.empresa_cobranca || 'LARM'
    const sourceCompany = validCompanies.find(item => item.empresa_cobranca === company) || null
    await loadBankConfig(company, sourceCompany)
  }

  const saveConfig = async () => {
    setConfigSaving(true)
    setConfigError('')
    try {
      const response = await apiClient.put('/financeiro/contas-receber/bradesco/config', config)
      setConfig({ ...emptyBradescoConfig(config.empresa), ...(response.data?.data || {}), empresa: config.empresa })
      setSuccess(`Configuração Bradesco da ${config.empresa} salva.`)
      setConfigOpen(false)
    } catch (requestError: unknown) {
      setConfigError(requestErrorMessage(requestError, `Não foi possível salvar a configuração bancária da ${config.empresa}.`))
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
            multiple
            className="hidden"
            onChange={event => processReturnFiles(event.target.files || undefined)}
          />
          <input
            ref={stratoReportInputRef}
            type="file"
            accept="application/pdf,image/*,.pdf"
            multiple
            className="hidden"
            onChange={event => setStratoReportFiles(Array.from(event.target.files || []))}
          />
          <button
            type="button"
            onClick={() => stratoReportInputRef.current?.click()}
            disabled={returnLoading}
            className={secondaryButtonClass}
            title="Anexe o relatório CRÍTICA COBRANÇA do Strato correspondente ao retorno"
          >
            <FileSearch className="w-3.5 h-3.5" />
            Relatório Strato{stratoReportFiles.length ? ` (${stratoReportFiles.length})` : ''}
          </button>
          {stratoReportFiles.length > 0 && (
            <button
              type="button"
              onClick={() => { setStratoReportFiles([]); if (stratoReportInputRef.current) stratoReportInputRef.current.value = '' }}
              disabled={returnLoading}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:text-red-600"
              title="Remover relatórios Strato selecionados"
              aria-label="Remover relatórios Strato selecionados"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-600" title="Desmarque para executar uma prévia totalmente segura, sem gravar o arquivo nem alterar parcelas">
            <input type="checkbox" checked={returnApplyPayment} onChange={event => setReturnApplyPayment(event.target.checked)} />
            Baixar liquidações
          </label>
          <button type="button" onClick={() => returnInputRef.current?.click()} disabled={returnLoading} className={secondaryButtonClass}>
            {returnLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar Retorno
          </button>
          <button type="button" onClick={() => generateSelectedBoletos()} disabled={!selected.size || batchBoletoLoading} className={secondaryButtonClass}>
            {batchBoletoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Files className="w-3.5 h-3.5" />}
            Gerar Boletos ({selected.size})
          </button>
          <button type="button" onClick={sendSelectedEmails} disabled={!selected.size || emailLoading} className={secondaryButtonClass}>
            {emailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
            Enviar E-mail ({selected.size})
          </button>
          <button type="button" onClick={prepareSelectedWhatsApp} disabled={!selected.size || whatsappLoading} className={secondaryButtonClass}>
            {whatsappLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            WhatsApp ({selected.size})
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
        Parcelas vencidas podem ser recalculadas em conjunto com todas as anteriores em aberto. Para divergências, selecione primeiro o relatório “CRÍTICA COBRANÇA” do Strato e depois importe o retorno. O sistema cruza cliente, contrato, unidade, parcela, boleto, vencimento e valor; a baixa só ocorre quando encontra uma correspondência única e segura. Desmarque “Baixar liquidações” para uma prévia sem qualquer alteração.
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-10 gap-3">
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
          <FilterField label="Empresa">
            <select value={empresa} onChange={event => { setEmpresa(event.target.value as EmpresaCobranca | ''); setPage(1) }} className={inputClass}>
              <option value="">LARM e LUCKY</option>
              {(filters.empresas_cobranca.length ? filters.empresas_cobranca : [
                { codigo: 'LARM' as EmpresaCobranca, nome: 'LARM PARTICIPAÇÕES LTDA', obras: [7700, 7701] },
                { codigo: 'LUCKY' as EmpresaCobranca, nome: 'LUCKY CAPITAL EMPREENDIMENTOS LTDA', obras: [7698] },
              ]).map(option => <option key={option.codigo} value={option.codigo}>{option.codigo}</option>)}
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
          <FilterField label="Recebimento de">
            <input type="date" value={recebimentoInicio} onChange={event => { setRecebimentoInicio(event.target.value); if (event.target.value) { setVencimentoInicio(''); setVencimentoFim('') }; setPage(1) }} className={inputClass} />
          </FilterField>
          <FilterField label="Recebimento até">
            <input type="date" value={recebimentoFim} onChange={event => { setRecebimentoFim(event.target.value); if (event.target.value) { setVencimentoInicio(''); setVencimentoFim('') }; setPage(1) }} className={inputClass} />
          </FilterField>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap border-t border-slate-100 pt-3">
          <p className="text-[10px] text-slate-400">A tela inicia pelo vencimento do mês atual. Use “Recebimento de/até” para localizar parcelas pela data em que o retorno foi enviado ao sistema.</p>
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

      {stratoIntelligentReview.length > 0 && (
        <StratoIntelligentReview
          files={stratoIntelligentReview}
          applying={stratoApplyLoading}
          onApply={pendingStratoApplyPayload ? applyStratoIntelligentReview : undefined}
          onClose={() => {
            setStratoIntelligentReview([])
            setPendingStratoApplyPayload(null)
          }}
        />
      )}

      {returnResult && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-800">
                  {returnResult.preview ? 'Prévia do retorno Bradesco' : returnResult.duplicated ? 'Retorno Bradesco já processado' : 'Resultado do retorno Bradesco'}
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {returnResult.arquivo} · {returnResult.empresa || 'empresa não identificada'}
                {returnResult.titulos ? ` · ${returnResult.titulos} título(s)` : ''}
                {returnResult.registros ? ` · ${returnResult.registros} registro(s) lido(s)` : ''}
                {returnResult.data_recebimento ? ` · recebimento ${formatDate(returnResult.data_recebimento)}` : ''}
                {returnResult.duplicated && returnResult.processado_em ? ` · processado em ${formatDateTime(returnResult.processado_em)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportReturnResultPdf}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Exportar PDF
              </button>
              <button type="button" onClick={() => setReturnResult(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar resultado">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            {buildReturnMainExplanation(returnResult)}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
            {[
              ['Títulos localizados', returnResult.conciliados],
              ['Não localizados', returnResult.nao_localizados],
              [returnResult.preview ? 'Prontos' : returnResult.duplicated ? 'Baixas registradas' : 'Baixados agora', returnResult.preview ? returnResult.liquidacoes_prontas : returnResult.liquidacoes_baixadas],
              ['Já baixados', returnResult.ja_baixadas],
              [returnResult.duplicated ? 'Movimentos vinculados' : 'Movimentos novos', returnResult.movimentos_criados],
              ['Via relatório/IA', returnResult.conciliados_por_relatorio || 0],
              [returnResult.preview ? 'Valor localizado' : returnResult.duplicated ? 'Valor registrado' : 'Valor baixado agora', formatCurrency(returnResult.preview ? returnResult.valor_liquidado : returnResult.valor_baixado)],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700">{value}</p>
              </div>
            ))}
          </div>

          {returnResult.itens?.some(item => item.ocorrencia === '06' && item.status_processamento === 'nao_localizado') && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Há liquidações normais que não foram encontradas no Contas a Receber.</p>
                <p className="mt-0.5">Normalmente isso indica boleto sem nosso número gravado, parcela importada com valor/vencimento diferente ou cliente divergente. Anexe o relatório Strato correspondente; quando não houver evidência única e segura, a linha continuará bloqueada para conferência manual.</p>
              </div>
            </div>
          )}

          {!returnResult.conta_bancaria_localizada && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {returnResult.conta_bancaria_ambigua
                ? 'Existe mais de uma conta Bradesco ativa para a empresa. Nenhuma baixa automática foi feita até a conta ser definida.'
                : 'A conta Bradesco ativa da empresa não foi localizada. Nenhuma baixa automática foi feita.'}
            </div>
          )}

          {returnResult.itens?.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                Listando todos os títulos lidos no retorno. Quando um relatório Strato é anexado, o nome do cliente e os dados identificados pela IA aparecem mesmo que a baixa automática seja recusada por falta de confiança.
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1220px] w-full text-xs">
                <thead className="bg-slate-50 text-slate-700"><tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left">Arquivo</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Ocorrência</th>
                  <th className="px-3 py-2 text-left">Cliente / Contrato</th>
                  <th className="px-3 py-2 text-left">Nosso número</th>
                  <th className="px-3 py-2 text-left">Controle</th>
                  <th className="px-3 py-2 text-left">Documento</th>
                  <th className="px-3 py-2 text-left">Vencimento</th>
                  <th className="px-3 py-2 text-left">Recebimento</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 text-left">Detalhe</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {returnResult.itens.map((item, itemIndex) => (
                    <tr key={`${item.arquivo_origem || returnResult.arquivo}-${item.linha}-${item.nosso_numero || item.documento || item.ocorrencia}`} className={item.status_processamento === 'nao_localizado' && item.ocorrencia === '06' ? 'bg-amber-50/60' : ''}>
                      <td className="px-3 py-2">{itemIndex + 1}</td>
                      <td className="px-3 py-2 text-[10px] text-slate-500">{item.arquivo_origem || returnResult.arquivo}</td>
                      <td className="px-3 py-2">
                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', returnItemStatusClass(item))}>
                          {returnItemStatusLabel(item, Boolean(returnResult.duplicated))}
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.ocorrencia} · {item.ocorrencia_descricao || '—'}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-700">{item.cliente || item.relatorio_strato?.cliente_nome || 'Não localizado'}</p>
                        <p className="text-[10px] text-slate-400">{item.contrato ? `${item.contrato}${item.parcela_numero ? ` · parcela ${item.parcela_numero}${item.parcela_total ? `/${item.parcela_total}` : ''}` : ''}` : (item.relatorio_strato ? `${item.relatorio_strato.cliente_codigo || 'sem código'} · ${item.relatorio_strato.unidade || 'sem unidade'} · parcela ${item.relatorio_strato.parcela || '—'}` : (item.status_processamento === 'nao_localizado' ? 'sem parcela/contrato conciliado' : 'sem contrato localizado'))}</p>
                      </td>
                      <td className="px-3 py-2">{fullNossoNumero(item)}</td>
                      <td className="px-3 py-2">{item.controle_participante || '—'}</td>
                      <td className="px-3 py-2">{item.documento || '—'}</td>
                      <td className="px-3 py-2">{formatDate(item.vencimento)}</td>
                      <td className="px-3 py-2">{formatDate(item.data_recebimento)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.valor_pago || item.valor_titulo)}</td>
                      <td className="px-3 py-2 text-slate-500">{returnItemReason(item, Boolean(returnResult.duplicated))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      )}

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
              <col style={{ width: 42 }} /><col style={{ width: 115 }} /><col style={{ width: 245 }} /><col style={{ width: 160 }} /><col style={{ width: 230 }} /><col style={{ width: 245 }} /><col style={{ width: 135 }} /><col style={{ width: 85 }} /><col style={{ width: 125 }} /><col style={{ width: 175 }} /><col style={{ width: 115 }} /><col style={{ width: 250 }} />
            </colgroup>
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#0d1b2a] text-white">
                <th className="px-3 py-3 text-center"><input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} aria-label="Selecionar parcelas em aberto da página" /></th>
                <SortHeader label="Vencimento" sortKey="vencimento" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Cliente" sortKey="cliente" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Contrato" sortKey="contrato" active={sort} direction={direction} onSort={handleSort} />
                <SortHeader label="Receita" sortKey="receita" active={sort} direction={direction} onSort={handleSort} />
                <th className="px-3 py-3 text-left">Obra / Unidade</th>
                <th className="px-3 py-3 text-left">Documento</th>
                <SortHeader label="Parcela" sortKey="parcela" active={sort} direction={direction} onSort={handleSort} align="center" />
                <SortHeader label="Valor" sortKey="valor" active={sort} direction={direction} onSort={handleSort} align="right" />
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
                    <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">{formatDate(row.vencimento)}</td>
                    <td className="px-3 py-3"><p className="font-semibold text-slate-800 truncate" title={row.cliente_nome || ''}>{row.cliente_nome || 'Cliente não informado'}</p><div className="mt-1 flex items-center gap-1.5"><span className="text-[10px] text-slate-400">{row.cliente_documento || 'Sem documento'}</span>{row.cliente_ativo === false && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">inativo</span>}</div></td>
                    <td className="px-3 py-3"><p className="font-medium text-slate-700 truncate" title={row.contrato_titulo || ''}>{row.contrato_numero || '—'}</p><p className="mt-1 text-[10px] text-slate-400 truncate" title={row.contrato_titulo || ''}>{row.contrato_titulo || 'Contrato'}</p></td>
                    <td className="px-3 py-3"><p className="font-medium text-slate-700 truncate" title={row.receita_titulo || ''}>{row.receita_titulo || row.tipo_receita_nome || 'Receita'}</p><p className="mt-1 text-[10px] text-slate-400">{row.tipo_receita_nome || row.tipo || '—'}</p></td>
                    <td className="px-3 py-3"><div className="mb-1 flex items-center gap-1.5"><span className={cn('rounded-full border px-1.5 py-0.5 text-[9px] font-semibold', row.empresa_cobranca === 'LUCKY' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-blue-200 bg-blue-50 text-blue-700')}>{row.empresa_cobranca || 'SEM EMPRESA'}</span></div><p className="text-slate-700 truncate" title={row.obra_nome || ''}>{row.obra_nome || '—'}</p><p className="mt-1 text-[10px] text-slate-400 truncate" title={row.unidade_nome || ''}>Unidade: {row.unidade_nome || '—'}</p></td>
                    <td className="px-3 py-3 text-slate-600 truncate" title={row.receita_documento || row.documento_legado || ''}>{row.receita_documento || row.documento_legado || '—'}</td>
                    <td className="px-3 py-3 text-center text-slate-600 whitespace-nowrap">{row.parcela_numero_legado || row.numero || '—'}{row.parcela_total_legado ? `/${row.parcela_total_legado}` : ''}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                      <p title="Valor líquido após descontos e juros">{formatCurrency(row.valor_total)}</p>
                      {(Number(row.valor_desconto || 0) > 0 || Number(row.valor_juros_mora || 0) > 0) && (
                        <div className="mt-1 space-y-0.5 text-[9px] font-normal">
                          <p className="text-slate-500">Nominal {formatCurrency(row.valor_nominal)}</p>
                          {Number(row.valor_desconto || 0) > 0 && <p className="text-rose-600">Desconto -{formatCurrency(row.valor_desconto || 0)}</p>}
                          {Number(row.valor_juros_mora || 0) > 0 && <p className="text-amber-700">Juros +{formatCurrency(row.valor_juros_mora || 0)}</p>}
                          {row.status === 'paga' && Number(row.valor_pago || 0) > 0 && <p className="text-emerald-700">Recebido {formatCurrency(row.valor_pago || 0)}</p>}
                        </div>
                      )}
                      {row.valor_recalculado != null && <p className="mt-1 text-[9px] font-normal text-blue-600" title={`Recalculado para ${formatDate(row.data_recalculo)}`}>recalculado</p>}
                    </td>
                    <td className="px-3 py-3">
                      {editingReceiptDateId === row.id ? (
                        <div className="flex items-center gap-1">
                          <input type="date" value={editingReceiptDateValue} onChange={event => setEditingReceiptDateValue(event.target.value)} className="h-8 w-[122px] rounded-md border border-blue-300 px-2 text-[11px] outline-none focus:ring-2 focus:ring-blue-100" />
                          <button type="button" disabled={receiptDateSavingId === row.id} onClick={() => void saveReceiptDate(row)} className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 disabled:opacity-50" title="Salvar data"><Check className="h-3 w-3" /></button>
                          <button type="button" disabled={receiptDateSavingId === row.id} onClick={cancelEditingReceiptDate} className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 disabled:opacity-50" title="Cancelar"><X className="h-3 w-3" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <p className={cn('whitespace-nowrap', row.status === 'paga' ? 'text-emerald-700 font-medium' : 'text-slate-400')}>{row.status === 'paga' ? formatDate(row.pago_em || row.conciliado_em) : '—'}</p>
                          {row.status === 'paga' && canManualPayment && <button type="button" onClick={() => startEditingReceiptDate(row)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600" title="Editar a data do recebimento e do Movimento Bancário"><Pencil className="h-3 w-3" /></button>}
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-slate-400 truncate" title={origemBaixaLabel(row)}>{origemBaixaLabel(row)}</p>
                      {row.movimento_banco && <p className="mt-0.5 text-[10px] text-slate-400 truncate">Banco: {row.movimento_banco}</p>}
                    </td>
                    <td className="px-3 py-3"><span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', statusClass(row.status))}>{statusLabel(row.status)}</span>{row.boleto_status && <p className="mt-1 text-[9px] text-slate-400">Boleto: {row.boleto_status.replace(/_/g, ' ')}</p>}{row.boleto_enviado_em && <p className="mt-0.5 text-[9px] font-medium text-emerald-600">Enviado por {row.boleto_envio_canal || 'canal registrado'} em {formatDate(row.boleto_enviado_em)}</p>}{row.boleto_envio_status === 'erro' && <p className="mt-0.5 text-[9px] text-red-600" title={row.boleto_envio_erro || ''}>Falha no envio</p>}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.status === 'atrasada' && <button type="button" onClick={() => openRecalculate(row)} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-100"><Calculator className="h-3 w-3" /> Recalcular</button>}
                        {eligible && canManualPayment && <button type="button" onClick={() => void openManualPayment(row)} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"><Check className="h-3 w-3" /> Baixa manual</button>}
                        {eligible && <button type="button" disabled={boletoLoadingId === row.id} onClick={() => generateBoleto(row)} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60">{boletoLoadingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />} {boletoLoadingId === row.id ? 'Gerando...' : 'Boleto'}</button>}
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

      {manualPaymentRow && manualPaymentForm && (
        <Modal
          title="Registrar baixa manual"
          subtitle={`${manualPaymentRow.cliente_nome || 'Cliente'} • Vencimento ${formatDate(manualPaymentRow.vencimento)}`}
          onClose={closeManualPayment}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            {manualPaymentError && <Notice type="error">{manualPaymentError}</Notice>}

            <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
              <div><p className="text-[10px] uppercase text-slate-400">Cliente</p><p className="mt-1 text-sm font-semibold text-slate-800">{manualPaymentRow.cliente_nome || '—'}</p></div>
              <div><p className="text-[10px] uppercase text-slate-400">Parcela</p><p className="mt-1 text-sm font-semibold text-slate-800">{manualPaymentRow.parcela_numero_legado || manualPaymentRow.numero || '—'}{manualPaymentRow.parcela_total_legado ? `/${manualPaymentRow.parcela_total_legado}` : ''}</p></div>
              <div><p className="text-[10px] uppercase text-slate-400">Valor previsto</p><p className="mt-1 text-sm font-semibold text-slate-800">{formatCurrency(manualPaymentRow.valor_total)}</p></div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Data do recebimento"><input type="date" value={manualPaymentForm.data_recebimento} onChange={event => setManualPaymentForm(current => current ? { ...current, data_recebimento: event.target.value } : current)} className={inputClass} /></Field>
              <Field label="Valor recebido"><MoneyInput value={manualPaymentForm.valor_recebido} onChange={value => setManualPaymentForm(current => current ? { ...current, valor_recebido: value } : current)} /></Field>
              <Field label={<>Conta bancária {manualPaymentBanksLoading && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin" />}</>} className="sm:col-span-2">
                <select value={manualPaymentForm.banco_conta_id} onChange={event => setManualPaymentForm(current => current ? { ...current, banco_conta_id: event.target.value } : current)} className={inputClass} disabled={manualPaymentBanksLoading}>
                  <option value="">Selecione a conta que recebeu o valor</option>
                  {manualPaymentBanks.map(account => <option key={account.id} value={account.id}>{account.empresa} • {account.banco_nome} • Ag. {account.agencia || '—'} • C/C {account.conta || '—'}{account.digito ? `-${account.digito}` : ''}</option>)}
                </select>
                {!manualPaymentBanksLoading && manualPaymentBanks.length === 0 && <p className="mt-1 text-[10px] text-red-600">Nenhuma conta bancária ativa foi encontrada para esta empresa.</p>}
              </Field>
              <Field label="Forma de pagamento" className="sm:col-span-2">
                <select value={manualPaymentForm.forma_pagamento} onChange={event => setManualPaymentForm(current => current ? { ...current, forma_pagamento: event.target.value } : current)} className={inputClass}>
                  <option value="Transferência">Transferência</option>
                  <option value="PIX">PIX</option>
                  <option value="Boleto">Boleto</option>
                  <option value="TED/DOC">TED/DOC</option>
                  <option value="Depósito">Depósito</option>
                  <option value="Dinheiro">Dinheiro</option>
                  <option value="Cartão">Cartão</option>
                  <option value="Outro">Outro</option>
                </select>
              </Field>
              <Field label="Observações da baixa" className="sm:col-span-2"><textarea rows={3} maxLength={500} value={manualPaymentForm.observacoes} onChange={event => setManualPaymentForm(current => current ? { ...current, observacoes: event.target.value } : current)} className={`${inputClass} h-auto py-2`} placeholder="Informação opcional para auditoria." /></Field>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
              A baixa marcará a parcela como recebida e criará uma entrada vinculada no Movimento Bancário. O registro ficará identificado como baixa manual no histórico.
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={closeManualPayment} disabled={manualPaymentSaving} className={cancelButtonClass}>Cancelar</button>
              <button type="button" onClick={() => void confirmManualPayment()} disabled={manualPaymentSaving || manualPaymentBanksLoading || !manualPaymentBanks.length} className={primaryButtonClass}>{manualPaymentSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar baixa</button>
            </div>
          </div>
        </Modal>
      )}

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
              <label className="md:col-span-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><input type="checkbox" className="mt-0.5" checked={recalcForm.incluir_parcelas_anteriores} onChange={event => updateRecalcForm({ incluir_parcelas_anteriores: event.target.checked })} /><span><strong>Incluir todas as parcelas anteriores em aberto deste contrato.</strong><br />Cada parcela continua com seu próprio boleto e nosso número, mas o cálculo e o total da dívida são apresentados e salvos em conjunto.</span></label>
            </div>

            {recalcLoading && !recalcData ? <div className="py-10 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Calculando...</div> : recalcData && (
              <>
                {recalcData.avisos.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /><div>{recalcData.avisos.map(item => <p key={item}>{item}</p>)}</div></div></div>}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <CalcBox label="Valor base" value={recalcData.valor_base} />
                  <CalcBox label={`Correção ${recalcData.indice?.codigo || ''}`} value={recalcData.valor_correcao} sub={recalcData.parcelas && recalcData.parcelas.length > 1 ? `${recalcData.parcelas.length} parcelas calculadas separadamente` : formatPercent(recalcData.percentual_indice_aplicado)} />
                  <CalcBox label="Multa" value={recalcData.valor_multa} sub={formatPercent(recalcData.percentual_multa)} />
                  <CalcBox label={recalcData.parcelas && recalcData.parcelas.length > 1 ? 'Mora acumulada' : `Mora • ${recalcData.dias_atraso} dias`} value={recalcData.valor_juros_mora} sub={`${formatPercent(recalcData.percentual_mora_mes)} ao mês por parcela`} />
                  <CalcBox label="Valor final" value={recalcData.valor_final} strong />
                </div>
                {recalcData.parcelas && recalcData.parcelas.length > 1 && <div className="rounded-xl border border-blue-200 overflow-hidden"><div className="bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-800">Dívida acumulada — {recalcData.parcelas.length} parcelas anteriores em aberto</div><div className="max-h-56 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-white"><tr><th className="px-3 py-2 text-left">Vencimento</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Correção</th><th className="px-3 py-2 text-right">Multa</th><th className="px-3 py-2 text-right">Juros</th><th className="px-3 py-2 text-right">Total</th></tr></thead><tbody>{recalcData.parcelas.map(item => <tr key={item.parcela_id} className="border-t border-slate-100"><td className="px-3 py-2">{formatDate(item.vencimento)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.valor_base)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.valor_correcao)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.valor_multa)}</td><td className="px-3 py-2 text-right">{formatCurrency(item.valor_juros_mora)}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.valor_final)}</td></tr>)}</tbody></table></div></div>}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">{recalcData.parcelas && recalcData.parcelas.length > 1 ? 'Memória mensal da parcela selecionada' : 'Memória mensal do índice'} {recalcData.indice ? `— ${recalcData.indice.nome}${recalcData.indice.defasagem_meses ? ` (${recalcData.indice.defasagem_meses} meses de defasagem)` : ''}` : ''}</div>
                  <div className="max-h-48 overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-white"><tr><th className="px-3 py-2 text-left">Mês corrigido</th><th className="px-3 py-2 text-left">Referência usada</th><th className="px-3 py-2 text-right">Variação</th><th className="px-3 py-2 text-center">Situação</th></tr></thead><tbody>{recalcData.meses.length === 0 ? <tr><td colSpan={4} className="px-3 py-5 text-center text-slate-400">Nenhuma virada de mês entre vencimento e data do cálculo.</td></tr> : recalcData.meses.map(item => <tr key={`${item.mes_correcao}-${item.referencia_indice}`} className="border-t border-slate-100"><td className="px-3 py-2">{formatDate(item.mes_correcao)}</td><td className="px-3 py-2">{formatDate(item.referencia_indice)}</td><td className="px-3 py-2 text-right">{item.variacao_mensal == null ? '—' : formatPercent(item.variacao_mensal)}</td><td className="px-3 py-2 text-center">{item.encontrado ? <span className="text-emerald-600">Encontrado</span> : <span className="text-red-600">Ausente</span>}</td></tr>)}</tbody></table></div>
                </div>
              </>
            )}
            {recalcSaved && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Recálculo salvo. As parcelas foram selecionadas e já podem ser geradas em conjunto.</div>}
            {boletoError && <Notice type="error">{boletoError}</Notice>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setRecalcRow(null)} className={cancelButtonClass}>Fechar</button>
              <button type="button" disabled={!recalcData || recalcSaving || recalcLoading || recalcSaved} onClick={saveRecalculation} className={primaryButtonClass}>{recalcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {recalcSaved ? 'Recálculo salvo' : 'Salvar recálculo'}</button>
              <button type="button" disabled={!recalcSaved || recalcSaving || recalcLoading || batchBoletoLoading} onClick={() => generateSelectedBoletos(recalcData?.parcelas_ids?.length ? recalcData.parcelas_ids : [recalcRow.id])} title={recalcSaved ? 'Gerar todos os boletos recalculados' : 'Salve o recálculo antes de gerar os boletos'} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{batchBoletoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Files className="h-4 w-4" />} {batchBoletoLoading ? 'Gerando boletos...' : `Gerar ${recalcData?.quantidade_parcelas || 1} boleto(s)`}</button>
            </div>
          </div>
        </Modal>
      )}

      {configOpen && (
        <Modal title="Configuração de cobrança Bradesco" subtitle="Boleto e arquivos CNAB 400 por empresa/tenant" onClose={() => setConfigOpen(false)} maxWidth="max-w-4xl">
          {configLoading ? <div className="py-12 text-center text-slate-400"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando...</div> : (
            <div className="space-y-4">
              {configError && <Notice type="error">{configError}</Notice>}
              {!config.id && config.empresa === 'LUCKY' && <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800"><strong>Configuração LUCKY ainda não cadastrada.</strong> Preencha somente os dados bancários reais fornecidos pelo Bradesco. Os dados da LARM não serão copiados.</div>}
              {!config.homologado && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><strong>Modo de homologação:</strong> as remessas serão geradas com extensão <code>.TST</code> e os boletos terão marca de homologação. Marque como homologado somente após validação pelo Bradesco.</div>}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Empresa cadastrada"><select value={config.empresa} disabled={companiesLoading} onChange={event => { const company = event.target.value as EmpresaCobranca; const source = billingSystemCompanies.find(item => item.empresa_cobranca === company); void loadBankConfig(company, source) }} className={inputClass}>{billingSystemCompanies.length ? billingSystemCompanies.map(item => <option key={item.codigo} value={item.empresa_cobranca || ''}>{item.nome}</option>) : <><option value="LARM">LARM PARTICIPAÇÕES LTDA</option><option value="LUCKY">LUCKY CAPITAL EMPREENDIMENTOS LTDA</option></>}</select></Field>
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
                <Field label={<>CEP {configCepLoading && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin text-blue-600" />}</>}><input value={config.cep || ''} onChange={event => setConfig({ ...config, cep: formatCep(event.target.value) })} onBlur={() => void lookupConfigCep(config.cep || '')} inputMode="numeric" maxLength={9} placeholder="00000-000" className={inputClass} /></Field>
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
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setConfigOpen(false)} className={cancelButtonClass}>Cancelar</button><button type="button" onClick={saveConfig} disabled={configSaving || configLoading} className={primaryButtonClass}>{configSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar configuração</button></div>
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

function Field({ label, children, className = '' }: { label: ReactNode; children: ReactNode; className?: string }) {
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
