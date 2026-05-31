'use client'

import { Fragment, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  getCashflow,
  getCashflowEmpresas,
  type Empresa,
} from '@/lib/api/financeiro'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const EMPRESAS_PADRAO = ['CONSOLIDADO', 'LARM', 'LARM FILIAL', 'MANTIQUEIRA', 'RM'] as const

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

function getRowStyle(tipo: string) {
  if (tipo === 'header') return 'bg-amber-50/60 font-semibold text-amber-700'
  if (tipo === 'total') return 'bg-zinc-100 font-semibold'
  return ''
}

function getValorMes(linha: any, mes: number) {
  return Number(linha?.valores?.[mes] ?? linha?.valores?.[String(mes)] ?? 0)
}

export default function OrcamentoPage() {
  const [empresa, setEmpresa] = useState<Empresa>('CONSOLIDADO')
  const [ano, setAno] = useState(2026)
  const [empresas, setEmpresas] = useState<string[]>([...EMPRESAS_PADRAO])
  const [anos, setAnos] = useState<number[]>([2026, 2025, 2024])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  const tableMinWidth = 48 + 270 + (12 * 150) + 150

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  useEffect(() => {
    getCashflowEmpresas()
      .then(rows => {
        const empresasApi = rows.map(r => String(r.empresa || '').toUpperCase())
        const anosApi = rows.map(r => Number(r.ano))
        setEmpresas(uniqueStrings(['CONSOLIDADO', ...empresasApi, ...EMPRESAS_PADRAO]))
        setAnos(uniqueNumbers([...anosApi, 2026, 2025, 2024]))
      })
      .catch(() => {
        setEmpresas([...EMPRESAS_PADRAO])
        setAnos([2026, 2025, 2024])
      })
  }, [])

  useEffect(() => {
    setLoading(true)
    getCashflow(empresa, ano, { visao: 'mensal' })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [empresa, ano])

  const stickyBase = 'sticky z-20 border-r border-zinc-100'
  const stickyHeader = 'sticky z-30 bg-zinc-50 border-r border-zinc-100'
  const stickyBg = (tipo: string) => {
    if (tipo === 'header') return 'bg-amber-50'
    if (tipo === 'total') return 'bg-zinc-100'
    return 'bg-white'
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Orçamento Mensal</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Estrutura mensal com Previsto x Realizado por linha financeira.</p>
        </div>
        <span className="bg-amber-50 text-amber-700 text-xs px-3 py-1 rounded-full font-semibold border border-amber-100">
          Módulo provisionado
        </span>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
        A coluna <b>Previsto</b> fica pronta para receber a planilha de orçamento. Enquanto ela não for importada, o sistema exibe o <b>Realizado</b> usando a base atual do Cash Flow.
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

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-zinc-900">Orçamento — {empresa} {ano}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Cada mês possui uma coluna Previsto e uma coluna Realizado.</p>
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
              <p className="text-sm">Sem estrutura financeira para {empresa} / {ano}</p>
              <p className="text-xs mt-1">O módulo já está disponível para receber a planilha de orçamento.</p>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ minWidth: tableMinWidth }}>
              <thead>
                <tr className="bg-zinc-50 text-zinc-400 uppercase" style={{ fontSize: '10px' }}>
                  <th className={`${stickyHeader} left-0 px-3 py-2.5 text-left w-12 min-w-[48px]`} rowSpan={2}>#</th>
                  <th className={`${stickyHeader} left-[48px] px-3 py-2.5 text-left w-[270px] min-w-[270px] shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)]`} rowSpan={2}>Descrição</th>
                  {MESES.map(m => <th key={m} className="px-2 py-2 text-center min-w-[150px]" colSpan={2}>{m}</th>)}
                  <th className="px-3 py-2 text-center min-w-[150px]" colSpan={2}>Total</th>
                </tr>
                <tr className="bg-zinc-50 text-zinc-400 uppercase border-t border-zinc-100" style={{ fontSize: '10px' }}>
                  {MESES.map(m => (
                    <Fragment key={m}>
                      <th className="px-2 py-2 text-right min-w-[75px]">Previsto</th>
                      <th className="px-2 py-2 text-right min-w-[75px]">Realizado</th>
                    </Fragment>
                  ))}
                  <th className="px-2 py-2 text-right min-w-[75px]">Previsto</th>
                  <th className="px-2 py-2 text-right min-w-[75px]">Realizado</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((linha: any) => {
                  const rowCls = getRowStyle(linha.tipo)
                  const totalRealizado = Number(linha.total || 0)
                  return (
                    <tr key={linha.id} className={`border-t border-zinc-100 ${rowCls}`}>
                      <td className={`${stickyBase} left-0 px-3 py-1.5 text-zinc-400 ${stickyBg(linha.tipo)}`} style={{ fontSize: '10px' }}>{linha.codigo}</td>
                      <td className={`${stickyBase} left-[48px] px-3 py-1.5 shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)] ${stickyBg(linha.tipo)} ${linha.nivel >= 2 ? 'pl-6' : ''} ${linha.nivel >= 3 ? 'pl-9 text-zinc-500' : ''}`}>
                        {linha.descricao}
                      </td>
                      {MESES.map((m, idx) => {
                        const realizado = getValorMes(linha, idx + 1)
                        const cls = realizado === 0 ? 'text-zinc-300' : realizado < 0 ? 'text-red-500' : 'text-green-600'
                        return (
                          <Fragment key={`${linha.id}-${m}`}>
                            <td className="px-2 py-1.5 text-right font-mono text-zinc-300">–</td>
                            <td className={`px-2 py-1.5 text-right font-mono ${cls}`}>{fmtBRL(realizado)}</td>
                          </Fragment>
                        )
                      })}
                      <td className="px-2 py-1.5 text-right font-mono text-zinc-300 font-semibold">–</td>
                      <td className={`px-2 py-1.5 text-right font-mono font-semibold ${totalRealizado === 0 ? 'text-zinc-300' : totalRealizado < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmtBRL(totalRealizado)}</td>
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

const iCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
