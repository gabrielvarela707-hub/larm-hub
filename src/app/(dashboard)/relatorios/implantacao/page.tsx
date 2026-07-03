'use client'

import { useCallback, useEffect, useState } from 'react'
import { ImageIcon, RefreshCw, Search, X, ZoomIn } from 'lucide-react'
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
  area_total: number
  planta: string | null
  planta_url: string | null
  total_unidades: number
}

type Pagination = { page: number; pages: number; total: number; limit: number }

const LIMIT = 30
const FALLBACK_PLANTA = '/planta-vendas.jpg'

const fmtArea = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ImplantacaoPage() {
  const [items, setItems] = useState<Obra[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0, limit: LIMIT })
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [comPlanta, setComPlanta] = useState('')
  const [modal, setModal] = useState<Obra | null>(null)

  const load = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, limit: LIMIT }
      if (busca) params.busca = busca
      if (comPlanta) params.com_planta = comPlanta
      const { data } = await apiClient.get('/relatorios-tools/implantacoes', { params })
      setItems(data.data ?? [])
      setPagination(data.pagination ?? { page, pages: 1, total: 0, limit: LIMIT })
    } finally {
      setLoading(false)
    }
  }, [busca, comPlanta])

  useEffect(() => { load(1) }, [comPlanta])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Implantação / Plantas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visualização das plantas por projeto/obra</p>
        </div>
        <button onClick={() => load(pagination.page)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <select value={comPlanta} onChange={e => setComPlanta(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs">
          <option value="">Todas as obras</option>
          <option value="true">Somente com planta</option>
          <option value="false">Somente sem planta</option>
        </select>
        <div className="relative flex-1 min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(1)}
            placeholder="Buscar por projeto, código, endereço..."
            className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
        </div>
        <button onClick={() => load(1)} className="h-9 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">Pesquisar</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading && [...Array(6)].map((_, i) => <div key={i} className="h-80 rounded-xl bg-white border border-slate-100 shadow-sm animate-pulse" />)}
        {!loading && items.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-slate-100 shadow-sm py-16 text-center text-sm text-slate-400">Nenhuma implantação encontrada</div>
        )}
        {!loading && items.map(o => {
          const src = o.planta_url || FALLBACK_PLANTA
          return (
            <div key={o.codigo} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{o.codigo} - {o.nome}</p>
              </div>
              <button type="button" onClick={() => setModal(o)} className="group relative block h-56 w-full bg-slate-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Planta ${o.nome}`} className="h-full w-full object-contain transition-transform group-hover:scale-[1.03]" />
                <div className="absolute inset-0 hidden items-center justify-center bg-black/20 group-hover:flex">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow"><ZoomIn className="h-4 w-4" /> Abrir planta</span>
                </div>
              </button>
              <div className="p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-800">{o.empresa}</p>
                <p className="text-xs text-slate-500">{[o.endereco, o.numero, o.bairro, o.cidade].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
                <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
                  <span>{o.total_unidades.toLocaleString('pt-BR')} unidades</span>
                  <span>{fmtArea(o.area_total)} m²</span>
                </div>
                <div className="pt-1">
                  {o.planta ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Arquivo: {o.planta}</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">Usando imagem padrão</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Pager pagination={pagination} loading={loading} onPage={load} />

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setModal(null)}>
          <div className="relative max-h-[92vh] w-full max-w-6xl rounded-2xl bg-white p-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setModal(null)} className="absolute right-4 top-4 z-10 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900"><X className="h-4 w-4" /></button>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><ImageIcon className="h-4 w-4" /> {modal.codigo} - {modal.nome}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modal.planta_url || FALLBACK_PLANTA} alt={`Planta ${modal.nome}`} className="max-h-[78vh] w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  )
}

function Pager({ pagination, loading, onPage }: { pagination: Pagination; loading: boolean; onPage: (page: number) => void }) {
  return <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-xs text-slate-500 shadow-sm">
    <span>{pagination.total.toLocaleString('pt-BR')} registros</span>
    <div className="flex items-center gap-2">
      <button disabled={loading || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Anterior</button>
      <span>{pagination.page} / {pagination.pages}</span>
      <button disabled={loading || pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)} className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40">Próxima</button>
    </div>
  </div>
}
