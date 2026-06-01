'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, Search, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import {
  getOrcamentoMovimento,
  type Empresa,
  type OrcamentoMovimentoItem,
} from '@/lib/api/financeiro'

const EMPRESAS = ['CONSOLIDADO', 'LARM', 'LUCKY', 'LM', 'HOLDING', 'RM'] as const
const MESES = [
  { value: '', label: 'Todos os meses' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]

function fmtBRL(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(v?: string | null) {
  if (!v) return '—'
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : v
}

function displayFornecedor(item: OrcamentoMovimentoItem) {
  return item.fornecedor || item.historico || 'Sem fornecedor informado'
}

export default function MovimentoOrcadoPage() {
  const [empresa, setEmpresa] = useState<Empresa | 'CONSOLIDADO'>('CONSOLIDADO')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState<'entrada' | 'saida' | ''>('')
  const [busca, setBusca] = useState('')
  const [rows, setRows] = useState<OrcamentoMovimentoItem[]>([])
  const [summary, setSummary] = useState({ total_entradas: 0, total_saidas: 0, saldo_periodo: 0, total_lancamentos: 0 })
  const [loading, setLoading] = useState(false)

  function load() {
    setLoading(true)
    getOrcamentoMovimento({
      empresa: empresa as Empresa,
      ano: 2026,
      mes: mes ? Number(mes) : undefined,
      tipo,
      busca: busca || undefined,
      limit: 5000,
    })
      .then(res => {
        setRows(res.data || [])
        setSummary(res.summary || { total_entradas: 0, total_saidas: 0, saldo_periodo: 0, total_lancamentos: 0 })
      })
      .catch(() => {
        setRows([])
        setSummary({ total_entradas: 0, total_saidas: 0, saldo_periodo: 0, total_lancamentos: 0 })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const totais = useMemo(() => ({
    entradas: Number(summary.total_entradas || 0),
    saidas: Number(summary.total_saidas || 0),
    saldo: Number(summary.saldo_periodo || 0),
    qtd: Number(summary.total_lancamentos || rows.length || 0),
  }), [summary, rows.length])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Movimento Orçado 2026</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Lançamentos previstos importados da planilha de Movimento Bancário Orçado.</p>
        </div>
        <span className="bg-amber-50 text-amber-700 text-xs px-3 py-1 rounded-full font-semibold border border-amber-100">
          Somente 2026
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className={iCls + ' pl-9'}
                placeholder="Fornecedor, histórico, banco ou natureza..."
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Empresa</label>
            <select className={iCls} value={empresa} onChange={e => setEmpresa(e.target.value as Empresa)}>
              {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Mês</label>
            <select className={iCls} value={mes} onChange={e => setMes(e.target.value)}>
              {MESES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Tipo</label>
            <select className={iCls} value={tipo} onChange={e => setTipo(e.target.value as 'entrada' | 'saida' | '')}>
              <option value="">Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-100 pt-4">
          <button
            onClick={() => { setBusca(''); setEmpresa('CONSOLIDADO'); setMes(''); setTipo('') }}
            className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Limpar filtros
          </button>
          <button onClick={load} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Buscar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard title="Lançamentos" value={String(totais.qtd)} icon={<WalletCards className="w-4 h-4 text-blue-600" />} />
        <SummaryCard title="Entradas previstas" value={fmtBRL(totais.entradas)} icon={<TrendingUp className="w-4 h-4 text-green-600" />} positive />
        <SummaryCard title="Saídas previstas" value={fmtBRL(totais.saidas)} icon={<TrendingDown className="w-4 h-4 text-red-500" />} negative />
        <SummaryCard title="Saldo previsto" value={fmtBRL(totais.saldo)} icon={<WalletCards className="w-4 h-4 text-amber-600" />} negative={totais.saldo < 0} positive={totais.saldo >= 0} />
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1280px]">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Banco</th>
                <th className="px-4 py-3 text-right">Entradas</th>
                <th className="px-4 py-3 text-right">Saídas</th>
                <th className="px-4 py-3 text-left">Fornecedor</th>
                <th className="px-4 py-3 text-left">Histórico</th>
                <th className="px-4 py-3 text-left">Natureza</th>
                <th className="px-4 py-3 text-left">Centro de Custo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400">Nenhum lançamento orçado encontrado.</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="border-t border-zinc-100 hover:bg-slate-50/70">
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.data)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">{row.empresa}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.banco || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600 whitespace-nowrap">{row.entradas ? fmtBRL(row.entradas) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-500 whitespace-nowrap">{row.saidas ? fmtBRL(row.saidas) : '—'}</td>
                  <td className="px-4 py-3 min-w-[220px] text-slate-900">{displayFornecedor(row)}</td>
                  <td className="px-4 py-3 min-w-[320px] text-slate-700">{row.historico || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.natureza_financeira || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.centro_custo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, icon, positive, negative }: { title: string; value: string; icon: ReactNode; positive?: boolean; negative?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        {icon}
        <span>{title}</span>
      </div>
      <p className={`mt-1 text-lg font-bold ${negative ? 'text-red-500' : positive ? 'text-green-600' : 'text-zinc-900'}`}>{value}</p>
    </div>
  )
}

const iCls = 'w-full h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
