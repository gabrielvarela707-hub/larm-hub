'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { RefreshCw, Search, Layers, Home, CheckCircle2 } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'

type Obra = { codigo: number; nome: string }
type Situacao = { codigo: number; nome: string; cor: string | null }
type Tipo = { codigo: number; nome: string }
type Pagination = { page: number; pages: number; total: number; limit: number }
type Unidade = {
  id: number
  unidade_id: number
  obra_id: number
  obra: string
  situacao_codigo: number | null
  situacao: string
  situacao_cor: string | null
  tipo_codigo: number | null
  tipo: string
  quadra: string
  lote: string
  unidade: string
  area: number
  venda_codigo: number | null
  data_venda: string | null
  cliente_codigo: number | null
  cliente: string
}

const LIMIT = 50

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

const fmtArea = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function UnidadesEstoquePage() {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [situacoes, setSituacoes] = useState<Situacao[]>([])
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: LIMIT })
  const [summary, setSummary] = useState({ total: 0, area_total: 0 })
  const [loading, setLoading] = useState(false)
  const [obra, setObra] = useState('')
  const [situacao, setSituacao] = useState('')
  const [tipo, setTipo] = useState('')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    apiClient.get('/relatorios-tools/filtros').then(r => {
      setObras(r.data.data?.obras ?? [])
      setSituacoes(r.data.data?.situacoes ?? [])
      setTipos(r.data.data?.tipos ?? [])
    }).catch(() => {})
  }, [])

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, limit: LIMIT }
      if (obra) params.obra = obra
      if (situacao) params.situacao = situacao
      if (tipo) params.tipo = tipo
      if (busca) params.busca = busca
      const { data } = await apiClient.get('/relatorios-tools/unidades', { params })
      setUnidades(data.data ?? [])
      setPagination(data.pagination ?? { page, pages: 1, total: 0, limit: LIMIT })
      setSummary(data.summary ?? { total: 0, area_total: 0 })
    } finally {
      setLoading(false)
    }
  }, [obra, situacao, tipo, busca])

  useEffect(() => { load(1) }, [obra, situacao, tipo])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Unidades do Estoque</h1>
          <p className="text-sm text-slate-500 mt-0.5">Unidades separadas por projeto, situação, quadra, lote e cliente</p>
        </div>
        <button onClick={() => load(pagination.page)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card icon={<Layers className="w-4 h-4" />} label="Unidades filtradas" value={summary.total} />
        <Card icon={<Home className="w-4 h-4" />} label="Área total" value={`${fmtArea(summary.area_total)} m²`} />
        <Card icon={<CheckCircle2 className="w-4 h-4" />} label="Página atual" value={`${pagination.page}/${pagination.pages}`} />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select value={obra} onChange={e => setObra(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs md:col-span-2">
          <option value="">Todos os projetos</option>
          {obras.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo} - {o.nome}</option>)}
        </select>
        <select value={situacao} onChange={e => setSituacao(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs">
          <option value="">Todas as situações</option>
          {situacoes.map(s => <option key={s.codigo} value={s.codigo}>{s.codigo} - {s.nome}</option>)}
        </select>
        <select value={tipo} onChange={e => setTipo(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs">
          <option value="">Todos os tipos</option>
          {tipos.map(t => <option key={t.codigo} value={t.codigo}>{t.codigo} - {t.nome}</option>)}
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
            placeholder="Busca rápida..." className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Obra', 'ID Unidade', 'Situação', 'Tipo', 'Quadra', 'Lote', 'Unidade', 'Área', 'Venda', 'Data Venda', 'Cliente'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(10)].map((_, i) => <tr key={i}><td colSpan={11} className="px-3 py-3"><div className="h-4 rounded bg-slate-100 animate-pulse" /></td></tr>)}
              {!loading && unidades.length === 0 && <tr><td colSpan={11} className="text-center py-12 text-sm text-slate-400">Nenhuma unidade encontrada</td></tr>}
              {!loading && unidades.map(u => (
                <tr key={`${u.obra_id}-${u.unidade_id}`} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3 py-2.5 min-w-[210px] text-slate-700">{u.obra_id} - {u.obra}</td>
                  <td className="px-3 py-2.5 tabular-nums text-slate-500">{u.unidade_id}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: `${u.situacao_cor || '#e2e8f0'}33`, color: u.situacao_cor || '#475569' }}>
                      {u.situacao}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{u.tipo}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.quadra || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{u.lote || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{u.unidade}</td>
                  <td className="px-3 py-2.5 text-slate-600 tabular-nums">{fmtArea(u.area)}</td>
                  <td className="px-3 py-2.5 text-slate-500 tabular-nums">{u.venda_codigo ?? '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{fmtDate(u.data_venda)}</td>
                  <td className="px-3 py-2.5 min-w-[220px] text-slate-700">{u.cliente_codigo ? `${u.cliente_codigo} - ${u.cliente}` : u.cliente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager pagination={pagination} loading={loading} onPage={load} />
      </div>
    </div>
  )
}

function Card({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">{icon}</div>
    <div><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold text-slate-800 tabular-nums">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p></div>
  </div>
}

function Pager({ pagination, loading, onPage }: { pagination: Pagination; loading: boolean; onPage: (page: number) => void }) {
  return <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
    <span>{pagination.total.toLocaleString('pt-BR')} registros</span>
    <div className="flex items-center gap-2">
      <button disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Anterior</button>
      <span>{pagination.page} / {pagination.pages}</span>
      <button disabled={loading || pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Próxima</button>
    </div>
  </div>
}
