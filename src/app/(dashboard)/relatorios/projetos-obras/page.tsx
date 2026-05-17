'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import { Search, RefreshCw, Building2, MapPin, Layers, Home, Eye } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'

type Obra = {
  id: number
  codigo: number
  nome: string
  empresa: string
  cidade: string
  endereco: string
  numero: string
  bairro: string
  cep: string
  area: number
  area_total: number
  planta: string | null
  planta_url: string | null
  total_unidades: number
  disponiveis: number
  vendidas: number
  ultima_venda_data: string | null
  ultima_venda_unidade: string | null
}

type Empresa = { codigo: number; nome: string }
type Pagination = { page: number; pages: number; total: number; limit: number }
type Summary = { total: number; unidades: number; disponiveis: number; vendidas: number }

const fmtNum = (v: number | null | undefined, digits = 2) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

const LIMIT = 50

export default function ProjetosObrasPage() {
  const [items, setItems] = useState<Obra[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: LIMIT })
  const [summary, setSummary] = useState<Summary>({ total: 0, unidades: 0, disponiveis: 0, vendidas: 0 })
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [comPlanta, setComPlanta] = useState('')

  useEffect(() => {
    apiClient.get('/relatorios-tools/filtros')
      .then(r => setEmpresas(r.data.data?.empresas ?? []))
      .catch(() => setEmpresas([]))
  }, [])

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, limit: LIMIT }
      if (busca) params.busca = busca
      if (empresa) params.empresa = empresa
      if (comPlanta) params.com_planta = comPlanta
      const { data } = await apiClient.get('/relatorios-tools/projetos', { params })
      setItems(data.data ?? [])
      setPagination(data.pagination ?? { page, pages: 1, total: 0, limit: LIMIT })
      setSummary(data.summary ?? { total: 0, unidades: 0, disponiveis: 0, vendidas: 0 })
    } finally {
      setLoading(false)
    }
  }, [busca, empresa, comPlanta])

  useEffect(() => { load(1) }, [empresa, comPlanta])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Projetos / Obras</h1>
          <p className="text-sm text-slate-500 mt-0.5">Base legada do Tools separada por obra/projeto</p>
        </div>
        <button onClick={() => load(pagination.page)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={<Building2 className="w-4 h-4" />} label="Projetos" value={summary.total} />
        <Card icon={<Layers className="w-4 h-4" />} label="Unidades" value={summary.unidades} />
        <Card icon={<Home className="w-4 h-4" />} label="Disponíveis" value={summary.disponiveis} />
        <Card icon={<Eye className="w-4 h-4" />} label="Vendidas / ocupadas" value={summary.vendidas} />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <select value={empresa} onChange={e => setEmpresa(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs min-w-[220px]">
          <option value="">Todas as empresas</option>
          {empresas.map(e => <option key={e.codigo} value={e.codigo}>{e.codigo} - {e.nome}</option>)}
        </select>
        <select value={comPlanta} onChange={e => setComPlanta(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs">
          <option value="">Com ou sem planta</option>
          <option value="true">Com planta</option>
          <option value="false">Sem planta</option>
        </select>
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
            placeholder="Buscar por código, nome, endereço ou bairro..."
            className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
        </div>
        <button onClick={() => load(1)} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">Pesquisar</button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Projeto', 'Empresa', 'Localização', 'Área', 'Unidades', 'Disponíveis', 'Última Venda', 'Planta'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(8)].map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>)}
              {!loading && items.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-slate-400">Nenhum projeto encontrado</td></tr>}
              {!loading && items.map(o => (
                <tr key={o.codigo} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 min-w-[220px]">
                    <p className="font-bold text-slate-800">{o.codigo} - {o.nome}</p>
                    <p className="text-[11px] text-slate-400">CEP {o.cep || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.empresa}</td>
                  <td className="px-4 py-3 min-w-[220px] text-slate-600">
                    <div className="flex gap-1.5"><MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400" /> <span>{[o.endereco, o.numero, o.bairro, o.cidade].filter(Boolean).join(', ') || '—'}</span></div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{fmtNum(o.area_total || o.area)} m²</td>
                  <td className="px-4 py-3 font-semibold text-slate-700 tabular-nums">{o.total_unidades}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold tabular-nums">{o.disponiveis}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <p>{o.ultima_venda_unidade || '—'}</p>
                    <p className="text-[11px] text-slate-400">{fmtDate(o.ultima_venda_data)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {o.planta ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Com planta</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">Sem planta</span>}
                  </td>
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

function Card({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">{icon}</div>
    <div><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-800 tabular-nums">{Number(value || 0).toLocaleString('pt-BR')}</p></div>
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
