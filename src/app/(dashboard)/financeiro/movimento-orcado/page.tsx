'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArchiveX, Loader2, Search, TrendingDown, TrendingUp, WalletCards, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import TableFloatingNav from '@/components/table-floating-nav'
import {
  getOrcamentoMovimento,
  inativarOrcamentoMovimento,
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

type ViewStatus = 'ativos' | 'inativos'

function fmtBRL(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(v?: string | null) {
  if (!v) return '—'
  const [y, m, d] = String(v).slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : v
}

function fmtDateTime(v?: string | null) {
  if (!v) return '—'
  const date = new Date(v)
  if (Number.isNaN(date.getTime())) return v
  return date.toLocaleString('pt-BR')
}

function displayFornecedor(item: OrcamentoMovimentoItem) {
  return item.fornecedor || item.historico || 'Sem fornecedor informado'
}

function apiErrorMessage(error: unknown) {
  const response = (error as { response?: { data?: { message?: string } } })?.response
  return response?.data?.message || 'Não foi possível concluir a operação.'
}

export default function MovimentoOrcadoPage() {
  const [empresa, setEmpresa] = useState<Empresa | 'CONSOLIDADO'>('CONSOLIDADO')
  const [mes, setMes] = useState('')
  const [tipo, setTipo] = useState<'entrada' | 'saida' | ''>('')
  const [busca, setBusca] = useState('')
  const [status, setStatus] = useState<ViewStatus>('ativos')
  const [rows, setRows] = useState<OrcamentoMovimentoItem[]>([])
  const [summary, setSummary] = useState({ total_entradas: 0, total_saidas: 0, saldo_periodo: 0, total_lancamentos: 0 })
  const [loading, setLoading] = useState(false)
  const [canInactivate, setCanInactivate] = useState(false)
  const [selectedRow, setSelectedRow] = useState<OrcamentoMovimentoItem | null>(null)
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  const tableMinWidth = status === 'inativos' ? 1900 : 1420
  const columnCount = status === 'inativos' ? 12 : 9 + (canInactivate ? 1 : 0)

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  function load(nextStatus: ViewStatus = status) {
    setLoading(true)
    getOrcamentoMovimento({
      empresa: empresa as Empresa,
      ano: 2026,
      mes: mes ? Number(mes) : undefined,
      tipo,
      busca: busca || undefined,
      status: nextStatus,
      limit: 5000,
    })
      .then(res => {
        setRows(res.data || [])
        setSummary(res.summary || { total_entradas: 0, total_saidas: 0, saldo_periodo: 0, total_lancamentos: 0 })
        setCanInactivate(Boolean(res.permissions?.can_inactivate))
      })
      .catch(error => {
        setRows([])
        setSummary({ total_entradas: 0, total_saidas: 0, saldo_periodo: 0, total_lancamentos: 0 })
        toast.error(apiErrorMessage(error))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load('ativos') }, [])

  const totais = useMemo(() => ({
    entradas: Number(summary.total_entradas || 0),
    saidas: Number(summary.total_saidas || 0),
    saldo: Number(summary.saldo_periodo || 0),
    qtd: Number(summary.total_lancamentos || rows.length || 0),
  }), [summary, rows.length])

  function toggleStatus() {
    const nextStatus: ViewStatus = status === 'ativos' ? 'inativos' : 'ativos'
    setStatus(nextStatus)
    load(nextStatus)
  }

  function openInactivate(row: OrcamentoMovimentoItem) {
    setSelectedRow(row)
    setMotivo('')
  }

  function closeInactivate() {
    if (saving) return
    setSelectedRow(null)
    setMotivo('')
  }

  async function confirmInactivate() {
    if (!selectedRow) return
    if (motivo.trim().length < 5) {
      toast.error('Informe um motivo com pelo menos 5 caracteres.')
      return
    }

    setSaving(true)
    try {
      await inativarOrcamentoMovimento(selectedRow.id, motivo.trim())
      toast.success('Lançamento inativado e registrado no histórico.')
      setSelectedRow(null)
      setMotivo('')
      load('ativos')
    } catch (error) {
      toast.error(apiErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">
            {status === 'inativos' ? 'Movimento Orçado — Registros inativados' : 'Movimento Orçado 2026'}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {status === 'inativos'
              ? 'Histórico dos lançamentos retirados da listagem ativa, com responsável, data e motivo.'
              : 'Lançamentos previstos importados da planilha de Movimento Bancário Orçado.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleStatus}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              status === 'inativos'
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'bg-white text-slate-700 border-zinc-200 hover:bg-slate-50'
            }`}
          >
            <Archive className="w-4 h-4" />
            {status === 'inativos' ? 'Voltar aos registros ativos' : 'Registros inativados'}
          </button>
          <span className="bg-amber-50 text-amber-700 text-xs px-3 py-1 rounded-full font-semibold border border-amber-100">
            Somente 2026
          </span>
        </div>
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
                placeholder={status === 'inativos' ? 'Fornecedor, histórico, banco ou motivo...' : 'Fornecedor, histórico, banco ou natureza...'}
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
          <button onClick={() => load(status)} className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Buscar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard title={status === 'inativos' ? 'Lançamentos inativados' : 'Lançamentos ativos'} value={String(totais.qtd)} icon={<WalletCards className="w-4 h-4 text-blue-600" />} />
        <SummaryCard title="Entradas previstas" value={fmtBRL(totais.entradas)} icon={<TrendingUp className="w-4 h-4 text-green-600" />} positive />
        <SummaryCard title="Saídas previstas" value={fmtBRL(totais.saidas)} icon={<TrendingDown className="w-4 h-4 text-red-500" />} negative />
        <SummaryCard title="Saldo previsto" value={fmtBRL(totais.saldo)} icon={<WalletCards className="w-4 h-4 text-amber-600" />} negative={totais.saldo < 0} positive={totais.saldo >= 0} />
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div
          ref={topScrollRef}
          onScroll={(e) => syncHorizontalScroll(e.currentTarget, tableScrollRef.current)}
          className="h-4 overflow-x-auto overflow-y-hidden border-b border-zinc-100 bg-zinc-50/60"
          title="Barra de rolagem horizontal da tabela"
        >
          <div style={{ width: tableMinWidth }} className="h-1" />
        </div>
        <div
          ref={tableScrollRef}
          onScroll={(e) => syncHorizontalScroll(e.currentTarget, topScrollRef.current)}
          className="max-h-[70vh] overflow-auto"
        >
          <table className="w-full text-sm" style={{ minWidth: tableMinWidth }}>
            <thead className="sticky top-0 z-20 bg-slate-950 text-white">
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
                {status === 'inativos' ? (
                  <>
                    <th className="px-4 py-3 text-left">Motivo da inativação</th>
                    <th className="px-4 py-3 text-left">Inativado por</th>
                    <th className="px-4 py-3 text-left">Inativado em</th>
                  </>
                ) : canInactivate ? (
                  <th className="px-4 py-3 text-center">Ações</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columnCount} className="py-12 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={columnCount} className="py-12 text-center text-slate-400">
                  {status === 'inativos' ? 'Nenhum registro inativado encontrado.' : 'Nenhum lançamento orçado encontrado.'}
                </td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className={`border-t border-zinc-100 ${status === 'inativos' ? 'bg-zinc-50/70' : 'hover:bg-slate-50/70'}`}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDate(row.data)}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">{row.empresa}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.banco || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600 whitespace-nowrap">{row.entradas ? fmtBRL(row.entradas) : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-500 whitespace-nowrap">{row.saidas ? fmtBRL(row.saidas) : '—'}</td>
                  <td className="px-4 py-3 min-w-[220px] text-slate-900">{displayFornecedor(row)}</td>
                  <td className="px-4 py-3 min-w-[320px] text-slate-700">{row.historico || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.natureza_financeira || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{row.centro_custo || '—'}</td>
                  {status === 'inativos' ? (
                    <>
                      <td className="px-4 py-3 min-w-[260px] text-slate-700">{row.motivo_inativacao || '—'}</td>
                      <td className="px-4 py-3 min-w-[190px] text-slate-700">
                        <div>{row.inativado_por_nome || 'Usuário não identificado'}</div>
                        {row.inativado_por_email && <div className="text-xs text-slate-400">{row.inativado_por_email}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtDateTime(row.inativado_em)}</td>
                    </>
                  ) : canInactivate ? (
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openInactivate(row)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50"
                        title="Inativar sem excluir definitivamente"
                      >
                        <ArchiveX className="w-3.5 h-3.5" />
                        Inativar
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TableFloatingNav scrollRef={tableScrollRef} />

      {selectedRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="inativar-titulo">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-zinc-200">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-zinc-100">
              <div>
                <h2 id="inativar-titulo" className="font-bold text-zinc-900">Inativar lançamento orçado</h2>
                <p className="text-sm text-zinc-500 mt-1">O registro sairá da listagem ativa, mas permanecerá disponível no histórico.</p>
              </div>
              <button type="button" onClick={closeInactivate} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="block text-xs text-slate-400">Data</span><strong>{fmtDate(selectedRow.data)}</strong></div>
                  <div><span className="block text-xs text-slate-400">Valor</span><strong>{fmtBRL(Number(selectedRow.saidas || selectedRow.entradas || 0))}</strong></div>
                </div>
                <div className="mt-3"><span className="block text-xs text-slate-400">Fornecedor</span><strong>{displayFornecedor(selectedRow)}</strong></div>
                <div className="mt-3"><span className="block text-xs text-slate-400">Histórico</span><span>{selectedRow.historico || '—'}</span></div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Motivo da inativação</label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value.slice(0, 500))}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="Ex.: lançamento incluído por engano ou cancelado por mudança interna."
                  autoFocus
                />
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>Mínimo de 5 caracteres.</span>
                  <span>{motivo.length}/500</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-5 border-t border-zinc-100">
              <button type="button" onClick={closeInactivate} disabled={saving} className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmInactivate}
                disabled={saving || motivo.trim().length < 5}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveX className="w-4 h-4" />}
                Confirmar inativação
              </button>
            </div>
          </div>
        </div>
      )}
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
