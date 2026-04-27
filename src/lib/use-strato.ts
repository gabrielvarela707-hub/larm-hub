/**
 * src/lib/use-strato.ts
 * Hook para consumir os dados Strato do backend
 */

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from './auth-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DashboardData {
  contratos: {
    total_contratos:      number
    contratos_ativos:     number
    contratos_quitados:   number
    contratos_rescindidos:number
    valor_total_contratos:number
  }
  lotes: {
    total_lotes:       number
    lotes_disponiveis: number
    lotes_vendidos:    number
    lotes_reservados:  number
  }
  boletos: {
    total_boletos:    number
    boletos_em_aberto:number
    boletos_pagos:    number
    boletos_vencidos: number
    valor_em_aberto:  number
    valor_vencido:    number
  }
  clientes: {
    total_clientes: number
  }
  receita_mensal: Array<{
    mes:         string
    qtd_boletos: number
    valor_total: number
  }>
  ranking_vendedores: Array<{
    vend1_ide:      string
    vend2_nom:      string
    total_contratos:number
    valor_total:    number
  }>
}

export interface Contrato {
  conv1_ide:    string
  conv2_dat:    string
  conv2_vto:    number
  conv2_sit:    string
  pess2_nom:    string
  pess2_cpf:    string
  lote_quadra:  string
  lote_numero:  string
  vendedor:     string
}

export interface Boleto {
  bole1_ide:  string
  bole2_dat:  string
  bole2_val:  number
  bole2_sit:  string
  bole2_nos:  string
  cliente:    string
  pess2_cpf:  string
  contrato_id:string
}

export interface Inadimplente {
  pess1_ide:              string
  cliente:                string
  pess2_cpf:              string
  pess2_fon:              string
  pess2_ema:              string
  contrato:               string
  boletos_vencidos:       number
  valor_total_vencido:    number
  vencimento_mais_antigo: string
}

// ─── Hook: dashboard ──────────────────────────────────────────────────────────

export function useStratoDashboard() {
  const [data,    setData]    = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.get('/strato/dashboard')
      setData(res.data.data)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar dashboard'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, loading, error, refetch: fetch }
}

// ─── Hook: contratos ──────────────────────────────────────────────────────────

export function useStratoContratos(page = 1, busca = '') {
  const [data,    setData]    = useState<Contrato[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    apiClient.get('/strato/contratos', { params: { page, busca, limit: 20 } })
      .then(res => {
        setData(res.data.data)
        setTotal(res.data.pagination?.total ?? 0)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [page, busca])

  return { data, total, loading, error }
}

// ─── Hook: boletos ────────────────────────────────────────────────────────────

export function useStratoBoletos(opts?: { status?: string; vencidos?: boolean; page?: number }) {
  const [data,    setData]    = useState<Boleto[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const { status, vencidos, page = 1 } = opts ?? {}

  useEffect(() => {
    setLoading(true)
    apiClient.get('/strato/boletos', { params: { status, vencidos, page, limit: 20 } })
      .then(res => setData(res.data.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [status, vencidos, page])

  return { data, loading, error }
}

// ─── Hook: inadimplência ──────────────────────────────────────────────────────

export function useStratoInadimplencia() {
  const [data,    setData]    = useState<Inadimplente[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiClient.get('/strato/inadimplencia')
      .then(res => setData(res.data.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { data, loading, error }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const SITUACAO_CONTRATO: Record<string, string> = {
  '1': 'Ativo',
  '2': 'Quitado',
  '9': 'Rescindido',
}

export const SITUACAO_BOLETO: Record<string, string> = {
  '1': 'Em Aberto',
  '2': 'Pago',
  '3': 'Cancelado',
}

export function formatReal(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return 'R$ 0,00'
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
