/**
 * src/lib/api/financeiro.ts
 *
 * Client de API do módulo Financeiro.
 * Usa o `apiClient` centralizado do auth-store do projeto
 * (já injeta JWT e faz refresh automático em 401).
 */

import { apiClient } from '@/lib/auth-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Empresa = string

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
  /**
   * Alguns endpoints antigos de fornecedores retornam campos legados/achatados
   * usados pelas telas de Contas a Pagar e Fornecedores. Mantemos a tipagem
   * tolerante para não quebrar o build enquanto o backend ainda não está
   * totalmente normalizado.
   */
  [key: string]: any
  id: number
  empresa?: string
  codigo?: string
  tipo_pessoa: 'PJ' | 'PF'
  cnpj_cpf: string
  razao_social: string
  nome_fantasia?: string
  inscricao_est?: string
  categoria?: string
  plano_contas_id?: number
  plano_descricao?: string

  // Endereço — nomes novos e legados usados no front
  cep?: string
  endereco?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
  cidade_uf?: string
  uf?: string

  // Contato
  telefone?: string
  telefone_2?: string
  celular?: string
  whatsapp?: string
  email?: string
  site?: string
  nome_contato?: string
  contato?: string

  // Dados bancários — nomes novos e legados usados no front
  banco_nome?: string
  codigo_banco?: string
  cod_banco?: string
  banco_pag?: string
  agencia?: string
  agencia_pag?: string
  conta?: string
  conta_corrente?: string
  conta_pag?: string
  digito?: string
  tipo_conta?: string
  tipo_conta_pag?: 'CC' | 'CP' | string
  pix_chave?: string
  pix_tipo?: string
  chave_pix?: string
  tipo_chave_pix?: string
  tipo_pix?: string

  ativo: boolean
  bloquear_lanc: boolean
  requer_aprova: boolean
  limite_aprova: number
  obs?: string
  observacoes?: string
}

export interface BancoConta {
  id: number
  empresa: Empresa
  banco: string
  cod_banco?: string
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
  valor_total: number
  num_parcelas: number
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
  emissao_doc?: string
  conta_contabil?: string
  natureza_financeira?: string
  centro_custo?: string
  obra?: string
  n_cheque?: string
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

export const createFornecedor = (body: Record<string, unknown> | Partial<Fornecedor>) =>
  apiClient.post<{ ok: boolean; data: Fornecedor }>('/financeiro/fornecedores', body)
    .then(data)

export const updateFornecedor = (id: number, body: Record<string, unknown> | Partial<Fornecedor>) =>
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
  valor_total: number
  num_parcelas: number
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
    data: { empresas: string[]; bancos: string[]; contas: any[]; anos: number[] }
  }>('/financeiro/movimento/filtros').then(data)

export const getMovimentoResumo = (empresa?: Empresa, ano?: number) =>
  apiClient.get<{ ok: boolean; data: any }>(
    '/financeiro/movimento/resumo', { params: { empresa, ano } }
  ).then(data)

// ─── Cash Flow ────────────────────────────────────────────────────────────────

export interface CashflowParams {
  visao?: 'mensal' | 'diaria'
  mes?: number
}

export const getCashflow = (empresa: Empresa = 'CONSOLIDADO', ano?: number, params?: CashflowParams) =>
  apiClient.get<{ ok: boolean; data: any }>(
    '/financeiro/cashflow', { params: { empresa, ano, ...params } }
  ).then(data)

export const getCashflowResumo = (empresa: Empresa = 'CONSOLIDADO', ano?: number, params?: Pick<CashflowParams, 'mes'>) =>
  apiClient.get<{ ok: boolean; data: any }>(
    '/financeiro/cashflow/resumo', { params: { empresa, ano, ...params } }
  ).then(data)

export const getCashflowEmpresas = () =>
  apiClient.get<{ ok: boolean; data: { empresa: string; ano: number }[] }>(
    '/financeiro/cashflow/empresas'
  ).then(data)
