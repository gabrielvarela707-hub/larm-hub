'use client'

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Loader2, TrendingDown, TrendingUp, WalletCards } from 'lucide-react'
import {
  getOrcamento,
  getOrcamentoEmpresas,
  type Empresa,
  type OrcamentoLinha,
} from '@/lib/api/financeiro'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const EMPRESAS_PADRAO = ['CONSOLIDADO', 'LARM', 'LUCKY', 'LM', 'HOLDING', 'RM'] as const

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter(v => Number.isFinite(v)))).sort((a, b) => b - a)
}

function fmtBRL(v: number) {
  if (!v) return '–'
  const abs = Math.abs(Number(v))
  const s = abs >= 1_000_000
    ? (abs / 1_000_000).toFixed(2) + 'M'
    : abs >= 1_000
    ? (abs / 1_000).toFixed(0) + 'K'
    : abs.toFixed(0)
  return (Number(v) < 0 ? '-' : '') + 'R$ ' + s
}

function fmtBRLFull(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getRowStyle(tipo: string) {
  if (tipo === 'header') return 'bg-amber-50/60 font-semibold text-amber-700'
  if (tipo === 'total') return 'bg-zinc-100 font-semibold'
  if (tipo === 'subtotal') return 'bg-zinc-50/70'
  return ''
}

function getValorMes(linha: OrcamentoLinha, campo: 'previstos' | 'realizados', mes: number) {
  return Number(linha?.[campo]?.[mes] ?? linha?.[campo]?.[String(mes)] ?? 0)
}

function valueClass(value: number) {
  if (Number(value || 0) === 0) return 'text-zinc-300'
  return Number(value) < 0 ? 'text-red-500' : 'text-green-600'
}

function resumoNumber(data: any, key: string) {
  return Number(data?.resumo?.[key] || 0)
}

export default function OrcamentoPage() {
  const [empresa, setEmpresa] = useState<Empresa>('CONSOLIDADO')
  const [ano, setAno] = useState(2026)
  const [empresas, setEmpresas] = useState<string[]>([...EMPRESAS_PADRAO])
  const [anos, setAnos] = useState<number[]>([2026])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  const tableMinWidth = 48 + 270 + (12 * 170) + 170

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  useEffect(() => {
    getOrcamentoEmpresas()
      .then(rows => {
        const empresasApi = rows.map(r => String(r.empresa || '').toUpperCase())
        const anosApi = rows.map(r => Number(r.ano))
        setEmpresas(uniqueStrings(['CONSOLIDADO', ...empresasApi, ...EMPRESAS_PADRAO]))
        setAnos(uniqueNumbers([...anosApi, 2026]))
      })
      .catch(() => {
        setEmpresas([...EMPRESAS_PADRAO])
        setAnos([2026])
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    getOrcamento(empresa, ano)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [empresa, ano])

  const resumo = useMemo(() => {
    const receitasPrevistas = resumoNumber(data, 'receitas_previstas')
    const receitasRealizadas = resumoNumber(data, 'receitas_realizadas')
    const despesasPrevistas = resumoNumber(data, 'despesas_previstas')
    const despesasRealizadas = resumoNumber(data, 'despesas_realizadas')
    return {
      receitasPrevistas,
      receitasRealizadas,
      despesasPrevistas,
      despesasRealizadas,
      diferencaReceitas: receitasRealizadas - receitasPrevistas,
      diferencaDespesas: despesasRealizadas - despesasPrevistas,
    }
  }, [data])

  const stickyBase = 'sticky z-20 border-r border-zinc-100'
  const stickyHeader = 'sticky z-30 bg-zinc-50 border-r border-zinc-100'
  const stickyBg = (tipo: string) => {
    if (tipo === 'header') return 'bg-amber-50'
    if (tipo === 'total') return 'bg-zinc-100'
    if (tipo === 'subtotal') return 'bg-zinc-50'
    return 'bg-white'
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Orçamento Mensal</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Previsto importado do Movimento Orçado x Realizado do Movimento Bancário.</p>
        </div>
        <span className="bg-amber-50 text-amber-700 text-xs px-3 py-1 rounded-full font-semibold border border-amber-100">
          Orçado 2026
        </span>
      </div>

      <div className="flex gap-3 items-end flex-wrap">
        <div className="min-w-[180px]">
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Empresa</label>
          <select className={iCls} value={empresa} onChange={e => setEmpresa(e.target.value as Empresa)}>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        </div>
        <div className="min-w-[120px]">
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Ano</label>
          <select className={iCls} value={ano} onChange={e => setAno(parseInt(e.target.value, 10))}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard
          title="Receitas Previstas"
          value={resumo.receitasPrevistas}
          icon={<TrendingUp className="w-4 h-4 text-green-600" />}
        />
        <SummaryCard
          title="Receitas Realizadas"
          value={resumo.receitasRealizadas}
          icon={<TrendingUp className="w-4 h-4 text-green-600" />}
        />
        <SummaryCard
          title="Despesas Previstas"
          value={resumo.despesasPrevistas}
          icon={<TrendingDown className="w-4 h-4 text-red-500" />}
        />
        <SummaryCard
          title="Despesas Realizadas"
          value={resumo.despesasRealizadas}
          icon={<WalletCards className="w-4 h-4 text-red-500" />}
        />
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-900">Orçamento — {empresa} {ano}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Previsto vem do Movimento Bancário Orçado; Realizado vem do Movimento Bancário pago/recebido.</p>
          </div>
          <span className="bg-zinc-100 text-zinc-600 text-xs px-2 py-0.5 rounded font-medium">Mensal</span>
        </div>

        {!loading && data?.linhas?.length ? (
          <div
            ref={topScrollRef}
            onScroll={(e) => syncHorizontalScroll(e.currentTarget, tableScrollRef.current)}
            className="h-4 overflow-x-auto overflow-y-hidden border-b border-zinc-100 bg-zinc-50/60"
            title="Barra de rolagem horizontal da tabela"
          >
            <div style={{ width: tableMinWidth }} className="h-1" />
          </div>
        ) : null}

        <div
          ref={tableScrollRef}
          onScroll={(e) => syncHorizontalScroll(e.currentTarget, topScrollRef.current)}
          className="overflow-x-auto"
        >
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando orçamento...
            </div>
          ) : !data?.linhas?.length ? (
            <div className="text-center py-10 text-zinc-400">
              <p className="text-sm">Sem orçamento importado para {empresa} / {ano}</p>
              <p className="text-xs mt-1">Rode o seed do orçamento para carregar o previsto.</p>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ minWidth: tableMinWidth }}>
              <thead>
                <tr className="bg-zinc-50 text-zinc-400 uppercase" style={{ fontSize: '10px' }}>
                  <th className={`${stickyHeader} left-0 px-3 py-2.5 text-left w-12 min-w-[48px]`} rowSpan={2}>#</th>
                  <th className={`${stickyHeader} left-[48px] px-3 py-2.5 text-left w-[270px] min-w-[270px] shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)]`} rowSpan={2}>Descrição</th>
                  {MESES.map(m => <th key={m} className="px-2 py-2 text-center min-w-[170px]" colSpan={2}>{m}</th>)}
                  <th className="px-3 py-2 text-center min-w-[170px]" colSpan={2}>Total</th>
                </tr>
                <tr className="bg-zinc-50 text-zinc-400 uppercase border-t border-zinc-100" style={{ fontSize: '10px' }}>
                  {MESES.map(m => (
                    <Fragment key={m}>
                      <th className="px-2 py-2 text-right min-w-[85px]">Previsto</th>
                      <th className="px-2 py-2 text-right min-w-[85px]">Realizado</th>
                    </Fragment>
                  ))}
                  <th className="px-2 py-2 text-right min-w-[85px]">Previsto</th>
                  <th className="px-2 py-2 text-right min-w-[85px]">Realizado</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((linha: OrcamentoLinha) => {
                  const rowCls = getRowStyle(linha.tipo)
                  const totalPrevisto = Number(linha.total_previsto || 0)
                  const totalRealizado = Number(linha.total_realizado || 0)
                  return (
                    <tr key={linha.id} className={`border-t border-zinc-100 ${rowCls}`}>
                      <td className={`${stickyBase} left-0 px-3 py-1.5 text-zinc-400 ${stickyBg(linha.tipo)}`} style={{ fontSize: '10px' }}>{linha.codigo}</td>
                      <td className={`${stickyBase} left-[48px] px-3 py-1.5 shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)] ${stickyBg(linha.tipo)} ${linha.nivel >= 2 ? 'pl-6' : ''} ${linha.nivel >= 3 ? 'pl-9 text-zinc-500' : ''}`}>
                        {linha.descricao}
                      </td>
                      {MESES.map((m, idx) => {
                        const previsto = getValorMes(linha, 'previstos', idx + 1)
                        const realizado = getValorMes(linha, 'realizados', idx + 1)
                        return (
                          <Fragment key={`${linha.id}-${m}`}>
                            <td className={`px-2 py-1.5 text-right font-mono ${valueClass(previsto)}`}>{fmtBRL(previsto)}</td>
                            <td className={`px-2 py-1.5 text-right font-mono ${valueClass(realizado)}`}>{fmtBRL(realizado)}</td>
                          </Fragment>
                        )
                      })}
                      <td className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(totalPrevisto)}`}>{fmtBRL(totalPrevisto)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono font-semibold ${valueClass(totalRealizado)}`}>{fmtBRL(totalRealizado)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        {icon}
        <span>{title}</span>
      </div>
      <p className={`mt-1 text-lg font-bold ${Number(value || 0) < 0 ? 'text-red-500' : 'text-zinc-900'}`}>
        {fmtBRLFull(value)}
      </p>
    </div>
  )
}

const iCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
