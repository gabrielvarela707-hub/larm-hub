'use client'
/**
 * src/app/financeiro/movimento/page.tsx
 * Movimento Bancário — visão financeira
 */
import { useState, useEffect, useCallback } from 'react'
import { Download, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { getMovimento, getMovimentoFiltros, type Movimento, type Empresa } from '@/lib/api/financeiro'

const NATUREZAS_FINANCEIRAS = ['1.1','1.2','1.3','1.4','4.1','4.2','4.3','4.4','4.5','4.6','4.9','4.11','4.12','7.3']

export default function MovimentoPage() {
  const [movimentos, setMovimentos] = useState<Movimento[]>([])
  const [summary, setSummary]       = useState({ total_entradas: 0, total_saidas: 0, saldo_periodo: 0 })
  const [pagination, setPagination]  = useState({ total: 0, page: 1, pages: 1 })
  const [loading, setLoading]        = useState(false)

  // Filtros
  const [busca, setBusca]       = useState('')
  const [empresa, setEmpresa]   = useState('')
  const [banco, setBanco]       = useState('')
  const [natureza, setNatureza] = useState('')
  const [tipo, setTipo]         = useState('')
  const [page, setPage]         = useState(1)
  const [sortField, setSortField] = useState('data')

  const [filtrosData, setFiltrosData] = useState<{ empresas: string[]; bancos: string[]; anos: number[] }>({
    empresas: [], bancos: [], anos: []
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMovimento({
        page, limit: 50,
        empresa: empresa as Empresa || undefined,
        banco: banco || undefined,
        natureza: natureza || undefined,
        tipo: tipo as any || undefined,
        busca: busca || undefined,
      })
      // Filter to financial codes only
      const financial = res.data.filter(m =>
        !m.natureza_financeira || NATUREZAS_FINANCEIRAS.some(n => (m.natureza_financeira || '').startsWith(n.split('.')[0]))
      )
      setMovimentos(financial)
      setSummary(res.summary)
      setPagination(res.pagination)
    } finally {
      setLoading(false)
    }
  }, [page, busca, empresa, banco, natureza, tipo])

  useEffect(() => { load() }, [load])
  useEffect(() => { getMovimentoFiltros().then(setFiltrosData) }, [])

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtDate = (d: string) => d?.slice(0, 10).split('-').reverse().join('/')

  return (
    <div className="p-6 space-y-4">
      {/* Aviso */}
      <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
        <ArrowUpCircle className="h-4 w-4 flex-shrink-0" />
        Visão restrita ao módulo <strong>Financeiro</strong>. Aplicações automáticas, participações societárias e outros itens não-financeiros estão ocultados.
      </div>

      {/* Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Entradas', value: fmtBRL(summary.total_entradas), color: 'text-green-600', icon: ArrowDownCircle },
          { label: 'Total Saídas', value: fmtBRL(summary.total_saidas), color: 'text-red-500', icon: ArrowUpCircle },
          { label: 'Saldo do Período', value: fmtBRL(summary.saldo_periodo), color: summary.saldo_periodo >= 0 ? 'text-green-600' : 'text-red-500', icon: null },
          { label: 'Registros', value: pagination.total.toLocaleString(), color: 'text-zinc-800 dark:text-zinc-100', icon: null },
        ].map(c => (
          <div key={c.label} className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{c.label}</p>
            <p className={`text-lg font-semibold font-mono ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <input className={iCls + ' flex-1 min-w-[180px]'} placeholder="🔍  Fornecedor, histórico..."
          value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} />
        <select className={iCls + ' w-[140px]'} value={empresa} onChange={e => setEmpresa(e.target.value)}>
          <option value="">Todas as empresas</option>
          {filtrosData.empresas.map(e => <option key={e}>{e}</option>)}
        </select>
        <select className={iCls + ' w-[140px]'} value={banco} onChange={e => setBanco(e.target.value)}>
          <option value="">Todos os bancos</option>
          {filtrosData.bancos.map(b => <option key={b}>{b}</option>)}
        </select>
        <select className={iCls + ' w-[140px]'} value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saídas</option>
        </select>
        <select className={iCls + ' w-[120px]'} value={sortField} onChange={e => setSortField(e.target.value)}>
          <option value="data">Por Data</option>
          <option value="fornecedor">Por Fornecedor</option>
          <option value="valor">Por Valor</option>
        </select>
        <button className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs flex items-center gap-1.5 hover:bg-zinc-50 text-zinc-600 dark:text-zinc-300">
          <Download className="h-3.5 w-3.5" /> Exportar
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/80 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-3 py-3 text-left cursor-pointer hover:text-zinc-700" onClick={() => setSortField('data')}>Data {sortField==='data'&&'↓'}</th>
                <th className="px-3 py-3 text-left">Empresa</th>
                <th className="px-3 py-3 text-left">Banco</th>
                <th className="px-3 py-3 text-left cursor-pointer hover:text-zinc-700" onClick={() => setSortField('fornecedor')}>Fornecedor {sortField==='fornecedor'&&'↓'}</th>
                <th className="px-3 py-3 text-left">Histórico</th>
                <th className="px-3 py-3 text-left">Plano de Contas</th>
                <th className="px-3 py-3 text-left">NF/DOC</th>
                <th className="px-3 py-3 text-center">Tipo</th>
                <th className="px-3 py-3 text-right cursor-pointer hover:text-zinc-700" onClick={() => setSortField('valor')}>Valor {sortField==='valor'&&'↓'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-zinc-400">Carregando...</td></tr>
              ) : movimentos.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-zinc-400">Nenhum registro encontrado</td></tr>
              ) : movimentos.map(m => {
                const isEntrada = (m.entradas || 0) > 0
                return (
                  <tr key={m.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{fmtDate(m.data)}</td>
                    <td className="px-3 py-2.5">
                      <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">{m.empresa}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-zinc-500">{m.banco}</td>
                    <td className="px-3 py-2.5 max-w-[150px] truncate text-sm" title={m.fornecedor}>{m.fornecedor || '—'}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate text-xs text-zinc-500" title={m.historico}>{m.historico || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-zinc-400 max-w-[120px] truncate">{m.conta_contabil || m.natureza_financeira || '—'}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">{m.nf_doc || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium ${
                        isEntrada
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                        {isEntrada ? '↓ Entrada' : '↑ Saída'}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono font-medium ${isEntrada ? 'text-green-600' : 'text-red-500'}`}>
                      {fmtBRL(isEntrada ? m.entradas : m.saidas)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Paginação */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <span className="text-xs text-zinc-400">{pagination.total} registros financeiros</span>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-xs disabled:opacity-40 hover:bg-zinc-50">
              ← Anterior
            </button>
            <span className="px-3 py-1.5 text-xs text-zinc-500">{page} / {pagination.pages}</span>
            <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 rounded border border-zinc-200 dark:border-zinc-700 text-xs disabled:opacity-40 hover:bg-zinc-50">
              Próximo →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const iCls = 'px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
