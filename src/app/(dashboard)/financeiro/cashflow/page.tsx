'use client'
/**
 * src/app/(dashboard)/financeiro/cashflow/page.tsx
 * Relatório de Cash Flow — visão consolidada, por empresa, mensal e diária.
 */
import { useEffect, useRef, useState } from 'react'
import { Download, Loader2, Printer, X } from 'lucide-react'
import {
  getCashflow,
  getCashflowResumo,
  getCashflowEmpresas,
  getCashflowLancamentos,
  type CashflowLancamentoItem,
  type CashflowLancamentosParams,
  type Empresa,
} from '@/lib/api/financeiro'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_LONGOS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const EMPRESAS_PADRAO = ['CONSOLIDADO', 'LARM', 'LARM FILIAL', 'MANTIQUEIRA', 'RM'] as const

type VisaoCashflow = 'mensal' | 'diaria'

type DetalheCashflow = {
  titulo: string
  subtitulo: string
  valor: number
  itens: CashflowLancamentoItem[]
  total: number
  quantidade: number
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter(v => Number.isFinite(v)))).sort((a, b) => b - a)
}

function fmtData(value?: string | null) {
  if (!value) return '—'
  const d = String(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}

function fmtBRLCompleto(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function CashFlowPage() {
  const [empresa, setEmpresa] = useState<Empresa>('CONSOLIDADO')
  const [ano, setAno] = useState(2026)
  const [visao, setVisao] = useState<VisaoCashflow>('mensal')
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [empresas, setEmpresas] = useState<string[]>([...EMPRESAS_PADRAO])
  const [anos, setAnos] = useState<number[]>([2026, 2025, 2024])
  const [data, setData] = useState<any>(null)
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [detalhe, setDetalhe] = useState<DetalheCashflow | null>(null)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const topScrollRef = useRef<HTMLDivElement | null>(null)
  const tableScrollRef = useRef<HTMLDivElement | null>(null)

  const syncHorizontalScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (!target || target.scrollLeft === source.scrollLeft) return
    target.scrollLeft = source.scrollLeft
  }

  useEffect(() => {
    getCashflowEmpresas()
      .then(rows => {
        const empresasApi = rows.map(r => String(r.empresa || '').toUpperCase())
        const anosApi = rows.map(r => Number(r.ano))

        const listaEmpresas = uniqueStrings(['CONSOLIDADO', ...empresasApi, ...EMPRESAS_PADRAO])
        const listaAnos = uniqueNumbers([...anosApi, 2026, 2025, 2024])

        setEmpresas(listaEmpresas)
        setAnos(listaAnos.length ? listaAnos : [2026, 2025, 2024])
      })
      .catch(() => {
        setEmpresas([...EMPRESAS_PADRAO])
        setAnos([2026, 2025, 2024])
      })
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const params = visao === 'diaria' ? { visao, mes } : { visao }
      const [cf, res] = await Promise.all([
        getCashflow(empresa, ano, params),
        getCashflowResumo(empresa, ano, visao === 'diaria' ? { mes } : undefined),
      ])
      setData(cf)
      setResumo(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [empresa, ano, visao, mes])

  const fmtBRL = (v: number) => {
    if (!v) return '–'
    const abs = Math.abs(Number(v))
    const s = abs >= 1_000_000
      ? (abs / 1_000_000).toFixed(2) + 'M'
      : abs >= 1_000
      ? (abs / 1_000).toFixed(0) + 'K'
      : abs.toFixed(0)
    return (Number(v) < 0 ? '-' : '') + 'R$ ' + s
  }

  const getRowStyle = (tipo: string) => {
    if (tipo === 'header') return 'bg-amber-50/60 dark:bg-amber-900/20 font-semibold text-amber-700 dark:text-amber-400'
    if (tipo === 'total') return 'bg-zinc-100 dark:bg-zinc-800 font-semibold'
    return ''
  }

  const getColKey = (coluna: any) => String(coluna.key ?? coluna.dia ?? coluna.mes ?? coluna.label)
  const getValorColuna = (linha: any, coluna: any) => {
    const key = getColKey(coluna)
    return linha?.valores?.[key] ?? linha?.valores?.[Number(key)] ?? 0
  }

  const abrirDetalhes = async (linha: any, coluna: any | null, valor: number) => {
    if (!valor) return

    const colunaLabel = coluna
      ? visao === 'diaria'
        ? `dia ${String(coluna.dia ?? coluna.key ?? '').padStart(2, '0')} de ${MESES_LONGOS[mes - 1]}`
        : `${coluna.label}/${ano}`
      : `Total ${ano}`

    setDetalhe({
      titulo: linha.descricao,
      subtitulo: `${empresa} • ${visao === 'diaria' ? 'visão diária' : 'visão mensal'} • ${colunaLabel}`,
      valor,
      itens: [],
      total: 0,
      quantidade: 0,
    })
    setDetalheLoading(true)

    try {
      const params: CashflowLancamentosParams = {
        visao,
        linha_id: linha.id,
        codigo: linha.codigo || '',
        descricao: linha.descricao || '',
        valor,
      }

      if (visao === 'diaria') {
        params.mes = mes
        if (coluna) params.dia = Number(coluna.dia ?? coluna.key)
      } else if (coluna?.mes) {
        params.mes = Number(coluna.mes)
      }

      const resp = await getCashflowLancamentos(empresa, ano, params)
      setDetalhe(prev => prev
        ? {
            ...prev,
            itens: resp.itens || [],
            total: Number(resp.total || 0),
            quantidade: Number(resp.quantidade || 0),
          }
        : prev,
      )
    } catch {
      setDetalhe(prev => prev ? { ...prev, itens: [], total: 0, quantidade: 0 } : prev)
    } finally {
      setDetalheLoading(false)
    }
  }

  const tituloTabela = visao === 'diaria'
    ? `Cash Flow Diário — ${empresa} ${MESES_LONGOS[mes - 1]} / ${ano}`
    : `Cash Flow — ${empresa} ${ano}`

  const colunasCount = Number(data?.colunas?.length || 0)
  const tableMinWidth = Math.max(760, 48 + 270 + (colunasCount * 86) + 96)

  const stickyBase = 'sticky z-20 border-r border-zinc-100 dark:border-zinc-700'
  const stickyHeader = 'sticky z-30 bg-zinc-50 dark:bg-zinc-800/95 border-r border-zinc-100 dark:border-zinc-700'
  const stickyBg = (tipo: string) => {
    if (tipo === 'header') return 'bg-amber-50 dark:bg-amber-900/30'
    if (tipo === 'total') return 'bg-zinc-100 dark:bg-zinc-800'
    return 'bg-white dark:bg-zinc-800'
  }

  return (
    <div className="p-6 space-y-4">
      {/* Controles */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="min-w-[180px]">
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Empresa</label>
          <select className={iCls} value={empresa} onChange={e => setEmpresa(e.target.value as Empresa)}>
            {empresas.map(emp => (
              <option key={emp} value={emp}>{emp}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[120px]">
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Ano</label>
          <select className={iCls} value={ano} onChange={e => setAno(parseInt(e.target.value, 10))}>
            {anos.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="min-w-[160px]">
          <label className="block text-[11px] font-medium text-zinc-500 mb-1">Visão</label>
          <select className={iCls} value={visao} onChange={e => setVisao(e.target.value as VisaoCashflow)}>
            <option value="mensal">Visão Mensal</option>
            <option value="diaria">Visão Diária</option>
          </select>
        </div>

        {visao === 'diaria' && (
          <div className="min-w-[150px]">
            <label className="block text-[11px] font-medium text-zinc-500 mb-1">Mês</label>
            <select className={iCls} value={mes} onChange={e => setMes(parseInt(e.target.value, 10))}>
              {MESES_LONGOS.map((nome, idx) => (
                <option key={nome} value={idx + 1}>{nome}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1" />
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50">
          <Download className="h-3.5 w-3.5" /> Exportar XLSX
        </button>
        <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50">
          <Printer className="h-3.5 w-3.5" /> Imprimir
        </button>
      </div>

      {/* Cards resumo */}
      {resumo && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: 'Saldo Inicial', value: fmtBRL(resumo.saldo_inicial), color: 'text-amber-600' },
            { label: 'Receita Bruta', value: fmtBRL(resumo.receita_bruta), color: 'text-green-600' },
            { label: 'Despesas', value: fmtBRL(resumo.despesas), color: 'text-red-500' },
            { label: 'Saldo Final', value: fmtBRL(resumo.saldo_final), color: resumo.saldo_final >= 0 ? 'text-green-600' : 'text-red-500' },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{c.label}</p>
              <p className={`text-xl font-semibold font-mono ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabela Cash Flow */}
      <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-700">
          <h3 className="text-sm font-semibold">{tituloTabela}</h3>
          <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">
            {visao === 'diaria' ? 'Diário' : 'Orçado'}
          </span>
        </div>
        {!loading && data?.linhas?.length ? (
          <div
            ref={topScrollRef}
            onScroll={(e) => syncHorizontalScroll(e.currentTarget, tableScrollRef.current)}
            className="h-4 overflow-x-auto overflow-y-hidden border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50/60 dark:bg-zinc-900/30"
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
            <div className="text-center py-10 text-zinc-400">Carregando...</div>
          ) : !data?.linhas?.length ? (
            <div className="text-center py-10 text-zinc-400">
              <p className="text-sm">Sem dados para {empresa} / {ano}</p>
              <p className="text-xs mt-1 text-zinc-400">Execute o script de importação para carregar os dados do Excel.</p>
            </div>
          ) : (
            <table className="w-full text-xs" style={{ minWidth: tableMinWidth }}>
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-400 uppercase" style={{fontSize:'10px'}}>
                  <th className={`${stickyHeader} left-0 px-3 py-2.5 text-left w-12 min-w-[48px]`}>#</th>
                  <th className={`${stickyHeader} left-[48px] px-3 py-2.5 text-left w-[270px] min-w-[270px] shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)]`}>Descrição</th>
                  {data.colunas.map((c: any) => (
                    <th key={getColKey(c)} className="px-2 py-2.5 text-right min-w-[86px]">{c.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[96px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((linha: any) => {
                  const rowCls = getRowStyle(linha.tipo)
                  const isNeg = (v: number) => v < 0
                  return (
                    <tr key={linha.id} className={`border-t border-zinc-100 dark:border-zinc-800 ${rowCls}`}>
                      <td className={`${stickyBase} left-0 px-3 py-1.5 text-zinc-400 ${stickyBg(linha.tipo)}`} style={{fontSize:'10px'}}>{linha.codigo}</td>
                      <td className={`${stickyBase} left-[48px] px-3 py-1.5 shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)] ${stickyBg(linha.tipo)} ${linha.nivel >= 2 ? 'pl-6' : ''} ${linha.nivel >= 3 ? 'pl-9 text-zinc-500' : ''}`}>
                        {linha.descricao}
                      </td>
                      {data.colunas.map((c: any) => {
                        const v = Number(getValorColuna(linha, c) || 0)
                        const colorCls = v === 0 ? 'text-zinc-300 dark:text-zinc-600' : isNeg(v) ? 'text-red-500' : 'text-green-600'
                        return (
                          <td key={getColKey(c)} className={`px-2 py-1.5 text-right font-mono ${colorCls}`}>
                            {v === 0 ? '–' : (
                              <button
                                type="button"
                                onClick={() => abrirDetalhes(linha, c, v)}
                                title="Ver lançamentos que compõem este valor"
                                className="w-full text-right hover:underline hover:decoration-dotted underline-offset-2"
                              >
                                {fmtBRL(v)}
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className={`px-3 py-1.5 text-right font-mono font-semibold ${linha.total === 0 ? 'text-zinc-300 dark:text-zinc-600' : isNeg(linha.total) ? 'text-red-500' : 'text-green-600'}`}>
                        {linha.total === 0 ? '–' : (
                          <button
                            type="button"
                            onClick={() => abrirDetalhes(linha, null, Number(linha.total || 0))}
                            title="Ver lançamentos do total"
                            className="w-full text-right hover:underline hover:decoration-dotted underline-offset-2"
                          >
                            {fmtBRL(linha.total)}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detalhe && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-5xl mb-8 border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Lançamentos do Cash Flow</h2>
                <p className="text-xs text-zinc-500 mt-1">{detalhe.titulo}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">{detalhe.subtitulo}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetalhe(null)}
                className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-5 py-4 bg-zinc-50/70 dark:bg-zinc-950/30 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <p className="text-[10px] uppercase text-zinc-400 font-semibold">Valor da célula</p>
                <p className={`font-mono font-semibold ${detalhe.valor < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmtBRLCompleto(detalhe.valor)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-zinc-400 font-semibold">Total localizado</p>
                <p className={`font-mono font-semibold ${detalhe.total < 0 ? 'text-red-500' : 'text-green-600'}`}>{fmtBRLCompleto(detalhe.total)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-zinc-400 font-semibold">Lançamentos</p>
                <p className="font-mono font-semibold text-zinc-800 dark:text-zinc-100">{detalhe.quantidade}</p>
              </div>
            </div>

            <div className="max-h-[60vh] overflow-auto">
              {detalheLoading ? (
                <div className="py-12 flex items-center justify-center gap-2 text-zinc-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Carregando lançamentos...
                </div>
              ) : detalhe.itens.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-sm">
                  Nenhum lançamento localizado para este valor/período.
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 text-zinc-400 uppercase" style={{fontSize:'10px'}}>
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Empresa</th>
                      <th className="px-3 py-2 text-left">Fornecedor</th>
                      <th className="px-3 py-2 text-left min-w-[260px]">Histórico</th>
                      <th className="px-3 py-2 text-left">Banco</th>
                      <th className="px-3 py-2 text-left">Doc.</th>
                      <th className="px-3 py-2 text-left">Natureza</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.itens.map((item, idx) => (
                      <tr key={`${item.origem}-${item.id}-${idx}`} className="border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                        <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{fmtData(item.data)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-zinc-500">{item.empresa || '—'}</td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{item.fornecedor || '—'}</td>
                        <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">{item.historico || '—'}</td>
                        <td className="px-3 py-2 text-zinc-500">{item.banco || '—'}</td>
                        <td className="px-3 py-2 text-zinc-500">{item.nf_doc || '—'}</td>
                        <td className="px-3 py-2 text-zinc-500">{item.natureza_financeira || item.conta_contabil || item.status || '—'}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${Number(item.valor) < 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {fmtBRLCompleto(Number(item.valor || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const iCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
