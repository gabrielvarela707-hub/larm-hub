/**
 * src/lib/api/financeiro.ts
 *
 * Client de API do módulo Financeiro.
 * Usa o `apiClient` centralizado do auth-store do projeto
 * (já injeta JWT e faz refresh automático em 401).
 */

import { apiClient } from '@/lib/auth-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Empresa = 'LARM' | 'LARM FILIAL' | 'MANTIQUEIRA' | 'RM' | 'LM' | 'HOLDING' | 'CONSOLIDADO'

export interface PlanoContas {
  id: number
  codigo: string
  descricao: string
  tipo: 'T' | 'S' | 'A'
  natureza: 'R' | 'D'
  nivel: number
  id_pai: number | null
  descricao_pai?: string
  ativo: boolean
}

export interface Fornecedor {
  id: number
  tipo_pessoa: 'PJ' | 'PF'
  cnpj_cpf?: string
  razao_social: string
  nome_fantasia?: string
  categoria?: string
  empresa?: string
  // Código interno (mín. 6 dígitos)
  codigo?: string
  // Contato
  email?: string
  telefone?: string
  // Endereço
  cep?: string
  endereco?: string
  cidade_uf?: string
  // Dados bancários — nomes reais do banco/API
  banco_nome?: string
  codigo_banco?: string
  agencia?: string
  conta?: string
  digito?: string
  tipo_conta?: 'Corrente' | 'Poupança'
  chave_pix?: string
  tipo_pix?: string
  obs?: string
  ativo?: boolean
}

export interface BancoConta {
  id: number
  empresa: Empresa
  banco: string
  cod_banco?: string
  codigo_banco?: string
  agencia: string
  conta: string
  tipo_conta: 'CC' | 'CP' | 'CI'
  apelido?: string
  limite_chq: number
  saldo_inicial: number
  data_saldo_ini?: string
  ativa: boolean
}

export interface Parcela {
  id?: number
  num_parcela: number
  total_parcelas: number
  data_vencimento: string
  valor: number
  multa?: number
  juros?: number
  desconto?: number
  retencao_ipi?: number
  retencao_iss?: number
  retencao_icms?: number
  retencao_pis?: number
  retencao_cofins?: number
  retencao_csll?: number
  retencao_irrf?: number
  retencao_inss?: number
  banco_conta_id?: number
  status: 'P' | 'Q' | 'V' | 'C'
  data_pagamento?: string
  valor_pago?: number
}

export interface ContaPagar {
  id: number
  empresa: Empresa
  fornecedor_id?: number
  fornecedor_nome?: string
  plano_contas_id?: number
  plano_descricao?: string
  banco_conta_id?: number
  banco_nome?: string
  banco_conta?: string
  centro_custo?: string
  historico: string
  nf_doc?: string
  data_emissao: string
  dt_emissao?: string
  valor_total: number
  num_parcelas: number
  qtd_parcelas?: number
  status: 'P' | 'Q' | 'V' | 'C' | 'X'
  parcelas?: Parcela[]
  obs?: string
}

export interface Movimento {
  id: number
  data: string
  empresa: Empresa
  banco: string
  entradas: number
  saidas: number
  saldo?: number
  fornecedor?: string
  historico?: string
  nf_doc?: string
  conta_contabil?: string
  natureza_financeira?: string
  centro_custo?: string
  obra?: string
  mes: number
  ano: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function data<T>(res: { data: { data: T } }) { return res.data.data }

// ─── Plano de Contas ──────────────────────────────────────────────────────────

export const getPlanoContas = () =>
  apiClient.get<{ ok: boolean; data: PlanoContas[] }>('/financeiro/plano-contas')
    .then(data)

// ─── Fornecedores ─────────────────────────────────────────────────────────────

export interface FornecedoresParams {
  page?: number; limit?: number
  busca?: string; ativo?: '0' | '1'; categoria?: string
}

export const getFornecedores = (params?: FornecedoresParams) =>
  apiClient.get<{ ok: boolean; data: Fornecedor[]; pagination: { total: number; page: number; limit: number } }>(
    '/financeiro/fornecedores', { params }
  ).then(r => r.data)

export const getFornecedor = (id: number) =>
  apiClient.get<{ ok: boolean; data: Fornecedor }>(`/financeiro/fornecedores/${id}`)
    .then(data)

export const createFornecedor = (body: Partial<Fornecedor>) =>
  apiClient.post<{ ok: boolean; data: Fornecedor }>('/financeiro/fornecedores', body)
    .then(data)

export const updateFornecedor = (id: number, body: Partial<Fornecedor>) =>
  apiClient.put<{ ok: boolean; data: Fornecedor }>(`/financeiro/fornecedores/${id}`, body)
    .then(data)

export const deleteFornecedor = (id: number) =>
  apiClient.delete(`/financeiro/fornecedores/${id}`)

// ─── Bancos ───────────────────────────────────────────────────────────────────

export const getBancos = (empresa?: Empresa) =>
  apiClient.get<{ ok: boolean; data: BancoConta[] }>(
    '/financeiro/bancos', { params: empresa ? { empresa } : {} }
  ).then(data)

export const createBanco = (body: Partial<BancoConta>) =>
  apiClient.post<{ ok: boolean; data: BancoConta }>('/financeiro/bancos', body)
    .then(data)

export const updateBanco = (id: number, body: Partial<BancoConta>) =>
  apiClient.put<{ ok: boolean; data: BancoConta }>(`/financeiro/bancos/${id}`, body)
    .then(data)

export const updateSaldosIniciais = (
  saldos: { id: number; saldo_inicial: number; data_saldo_ini: string }[]
) => apiClient.patch('/financeiro/bancos/saldos', { saldos })

// ─── Contas a Pagar ───────────────────────────────────────────────────────────

export interface ContasPagarParams {
  page?: number; limit?: number; empresa?: Empresa
  status?: string; busca?: string; dt_ini?: string; dt_fim?: string
}

export const getContasPagar = (params?: ContasPagarParams) =>
  apiClient.get<{
    ok: boolean; data: ContaPagar[]
    summary: { total: number }
    pagination: { total: number; page: number; limit: number }
  }>('/financeiro/contas-pagar', { params }).then(r => r.data)

export const getContaPagar = (id: number) =>
  apiClient.get<{ ok: boolean; data: ContaPagar }>(`/financeiro/contas-pagar/${id}`)
    .then(data)

export const createContaPagar = (body: {
  empresa: Empresa
  fornecedor_id?: number
  banco_conta_id?: number
  plano_contas_id?: number
  centro_custo?: string
  historico: string
  nf_doc?: string
  data_emissao: string
  dt_emissao?: string
  valor_total: number
  num_parcelas: number
  qtd_parcelas?: number
  parcelas: Parcela[]
  obs?: string
}) => apiClient.post<{ ok: boolean; data: ContaPagar }>('/financeiro/contas-pagar', body)
       .then(data)

export const quitarParcela = (
  contaPagarId: number,
  parcelaId: number,
  dataPagamento: string,
  valorPago: number,
  bancoContaId?: number,
) => apiClient.patch(`/financeiro/contas-pagar/${contaPagarId}/quitar`, {
  parcela_id: parcelaId,
  data_pagamento: dataPagamento,
  valor_pago: valorPago,
  banco_conta_id: bancoContaId,
})

export const getContasPagarResumo = (empresa?: Empresa) =>
  apiClient.get<{
    ok: boolean
    data: {
      a_vencer_30d: number; qtd_a_vencer: number
      vencidos: number; qtd_vencidos: number; pago_mes: number
    }
  }>('/financeiro/contas-pagar/resumo', { params: empresa ? { empresa } : {} })
    .then(data)

// ─── Movimento Bancário ───────────────────────────────────────────────────────

export interface MovimentoParams {
  page?: number; limit?: number; empresa?: Empresa
  banco?: string; natureza?: string; ano?: number; mes?: number
  tipo?: 'entrada' | 'saida'; busca?: string
  data_de?: string; data_ate?: string
}

export const getMovimento = (params?: MovimentoParams) =>
  apiClient.get<{
    ok: boolean; data: Movimento[]
    summary: { total_entradas: number; total_saidas: number; saldo_periodo: number }
    pagination: { total: number; page: number; pages: number }
  }>('/financeiro/movimento', { params }).then(r => r.data)

export const getMovimentoFiltros = () =>
  apiClient.get<{
    ok: boolean
    data: { empresas: string[]; bancos: string[]; contas: Record<string, unknown>[]; anos: number[] }
  }>('/financeiro/movimento/filtros').then(data)

export const getMovimentoResumo = (empresa?: Empresa, ano?: number) =>
  apiClient.get<{ ok: boolean; data: Record<string, unknown> }>(
    '/financeiro/movimento/resumo', { params: { empresa, ano } }
  ).then(data)

// ─── Cash Flow ────────────────────────────────────────────────────────────────

export interface CashflowParams {
  visao?: 'mensal' | 'diaria'
  mes?: number
}

export const getCashflow = (empresa: Empresa = 'CONSOLIDADO', ano?: number, params?: CashflowParams) =>
  apiClient.get<{ ok: boolean; data: Record<string, unknown> }>(
    '/financeiro/cashflow', { params: { empresa, ano, ...params } }
  ).then(data)


export interface CashflowLancamentosParams extends CashflowParams {
  dia?: number
  linha_id?: number | string
  codigo?: string
  descricao?: string
  valor?: number
}

export interface CashflowLancamentoItem {
  origem: string
  id: number | string
  data: string | null
  empresa: string | null
  banco?: string | null
  fornecedor?: string | null
  historico?: string | null
  nf_doc?: string | null
  conta_contabil?: string | null
  natureza_financeira?: string | null
  status?: string | null
  valor: number
}

export const getCashflowLancamentos = (empresa: Empresa = 'CONSOLIDADO', ano?: number, params?: CashflowLancamentosParams) =>
  apiClient.get<{ ok: boolean; data: { itens: CashflowLancamentoItem[]; total: number; quantidade: number } }>(
    '/financeiro/cashflow/lancamentos', { params: { empresa, ano, ...params } }
  ).then(data)

export const getCashflowResumo = (empresa: Empresa = 'CONSOLIDADO', ano?: number, params?: Pick<CashflowParams, 'mes'>) =>
  apiClient.get<{ ok: boolean; data: Record<string, unknown> }>(
    '/financeiro/cashflow/resumo', { params: { empresa, ano, ...params } }
  ).then(data)

export const getCashflowEmpresas = () =>
  apiClient.get<{ ok: boolean; data: { empresa: string; ano: number }[] }>(
    '/financeiro/cashflow/empresas'
  ).then(data)

export interface UpdateCashflowValorPayload {
  linha_id: number
  empresa: Empresa
  ano: number
  mes: number
  dia?: number
  visao?: 'mensal' | 'diaria'
  valor: number
}

export const updateCashflowValor = (body: UpdateCashflowValorPayload) =>
  apiClient.patch<{ ok: boolean; data: Record<string, unknown> }>(
    '/financeiro/cashflow/valor', body
  ).then(data)


// ─── Orçamento Financeiro ────────────────────────────────────────────────────

export interface OrcamentoParams {
  mes?: number
}

export interface OrcamentoLinha {
  id: number
  row_idx: number
  codigo?: string | null
  descricao: string
  nivel: number
  tipo: string
  previstos: Record<string | number, number>
  realizados: Record<string | number, number>
  total_previsto: number
  total_realizado: number
  diferenca: number
}

export const getOrcamento = (empresa: Empresa = 'CONSOLIDADO', ano?: number, params?: OrcamentoParams) =>
  apiClient.get<{ ok: boolean; data: { linhas: OrcamentoLinha[]; colunas: { mes: number; label: string }[]; resumo?: Record<string, unknown>; empresa: string; ano: number } }>(
    '/financeiro/orcamento', { params: { empresa, ano, ...params } }
  ).then(data)

export const getOrcamentoEmpresas = () =>
  apiClient.get<{ ok: boolean; data: { empresa: string; ano: number }[] }>(
    '/financeiro/orcamento/empresas'
  ).then(data)


export interface OrcamentoMovimentoParams {
  empresa?: Empresa
  ano?: number
  mes?: number
  tipo?: 'entrada' | 'saida' | ''
  busca?: string
  limit?: number
  status?: 'ativos' | 'inativos' | 'todos'
}

export interface OrcamentoMovimentoItem {
  id: number
  data: string
  empresa: Empresa | string
  banco?: string | null
  entradas: number
  saidas: number
  fornecedor?: string | null
  historico?: string | null
  nf_doc?: string | null
  conta_contabil?: string | null
  centro_custo?: string | null
  obra?: string | null
  natureza_financeira?: string | null
  dia?: number
  mes?: number
  ano?: number
  saldo?: number
  ativo?: boolean
  inativado_em?: string | null
  inativado_por?: string | null
  inativado_por_nome?: string | null
  inativado_por_email?: string | null
  motivo_inativacao?: string | null
}

export const getOrcamentoMovimento = (params?: OrcamentoMovimentoParams) =>
  apiClient.get<{
    ok: boolean
    data: OrcamentoMovimentoItem[]
    summary: { total_entradas: number; total_saidas: number; saldo_periodo: number; total_lancamentos: number }
    permissions?: { can_inactivate?: boolean }
  }>('/financeiro/orcamento/movimento', { params: { ano: 2026, limit: 1000, status: 'ativos', ...params } })
    .then(r => r.data)

export const inativarOrcamentoMovimento = (id: number, motivo: string) =>
  apiClient.patch<{ ok: boolean; message: string; data: Record<string, unknown> }>(
    `/financeiro/orcamento/movimento/${id}/inativar`,
    { motivo },
  ).then(r => r.data)
