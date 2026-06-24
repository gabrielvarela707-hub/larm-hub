'use client'
/**
 * src/app/(dashboard)/financeiro/cashflow/page.tsx
 * Relatório de Cash Flow — visão consolidada, por empresa, mensal e diária.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Download, Loader2, Pencil, Printer, X } from 'lucide-react'
import TableFloatingNav from '@/components/table-floating-nav'
import {
  getCashflow,
  getCashflowResumo,
  getCashflowEmpresas,
  getCashflowLancamentos,
  getMovimento,
  updateCashflowValor,
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

function isoDate(ano: number, mes: number, dia: number) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function linhaDiariaRealizada(linha: any) {
  const id = Number(linha?.id)
  const desc = String(linha?.descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return id === -8001 || id === -8002 || desc.includes('receitas realizadas') || desc.includes('despesas realizadas')
}

function tipoMovimentoDaLinha(linha: any, valor: number): 'entrada' | 'saida' | undefined {
  const desc = String(linha?.descricao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (Number(valor) < 0 || desc.includes('despesas')) return 'saida'
  if (Number(valor) > 0 || desc.includes('receitas')) return 'entrada'
  return undefined
}

function formatValorKParaEdicao(valor: number) {
  return (Number(valor || 0) / 1_000).toLocaleString('pt-BR', {
    useGrouping: false,
    maximumFractionDigits: 3,
  })
}

function parseValorK(value: string) {
  let text = String(value || '').trim().replace(/R\$/gi, '').replace(/k/gi, '').replace(/\s/g, '')
  if (!text) return null

  const hasComma = text.includes(',')
  const hasDot = text.includes('.')

  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',')
    const lastDot = text.lastIndexOf('.')
    if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.')
    else text = text.replace(/,/g, '')
  } else if (hasComma) {
    text = text.replace(/\./g, '').replace(',', '.')
  } else if (hasDot) {
    const parts = text.split('.')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      text = parts.join('')
    }
  }

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed * 1_000 : null
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
  const [edicaoKey, setEdicaoKey] = useState<string | null>(null)
  const [edicaoValor, setEdicaoValor] = useState('')
  const [edicaoSalvando, setEdicaoSalvando] = useState(false)
  const [edicaoErro, setEdicaoErro] = useState('')
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

  const load = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const params = visao === 'diaria' ? { visao, mes } : { visao }
      const [cf, res] = await Promise.all([
        getCashflow(empresa, ano, params),
        getCashflowResumo(empresa, ano, visao === 'diaria' ? { mes } : undefined),
      ])
      setData(cf)
      setResumo(res)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  useEffect(() => { load() }, [empresa, ano, visao, mes])

  const fmtBRL = (v: number) => {
    if (!v) return '–'
    const abs = Math.abs(Number(v))
    const s = abs >= 1_000
      ? `${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`
      : abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
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

  const iniciarEdicaoSaldo = (linha: any, coluna: any, valor: number) => {
    const key = `${linha.id}-${getColKey(coluna)}`
    setEdicaoKey(key)
    setEdicaoValor(formatValorKParaEdicao(valor))
    setEdicaoErro('')
  }

  const cancelarEdicaoSaldo = () => {
    if (edicaoSalvando) return
    setEdicaoKey(null)
    setEdicaoValor('')
    setEdicaoErro('')
  }

  const salvarEdicaoSaldo = async (linha: any, coluna: any) => {
    const valor = parseValorK(edicaoValor)
    if (valor === null) {
      setEdicaoErro('Informe um valor válido em K.')
      return
    }

    setEdicaoSalvando(true)
    setEdicaoErro('')
    try {
      await updateCashflowValor({
        linha_id: Number(linha.id),
        empresa,
        ano,
        mes: visao === 'diaria' ? mes : Number(coluna.mes),
        dia: visao === 'diaria' ? Number(coluna.dia ?? coluna.key) : undefined,
        visao,
        valor,
      })
      setEdicaoKey(null)
      setEdicaoValor('')
      await load(false)
    } catch (error: any) {
      setEdicaoErro(error?.response?.data?.message || 'Não foi possível salvar o saldo.')
    } finally {
      setEdicaoSalvando(false)
    }
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

      let resp = await getCashflowLancamentos(empresa, ano, params)

      // Fallback seguro para a visão diária: se o detalhamento específico não
      // encontrar nada, usa a mesma fonte da tela Movimento Bancário. Isso evita
      // modal vazio em linhas sintéticas como Receitas/Despesas Realizadas.
      if (
        visao === 'diaria' &&
        coluna &&
        linhaDiariaRealizada(linha) &&
        Number(resp.quantidade || 0) === 0
      ) {
        const diaSelecionado = Number(coluna.dia ?? coluna.key)
        const dataSelecionada = isoDate(ano, mes, diaSelecionado)
        const mov = await getMovimento({
          page: 1,
          limit: 200,
          ...(empresa === 'CONSOLIDADO' ? {} : { empresa }),
          ano,
          mes,
          data_de: dataSelecionada,
          data_ate: dataSelecionada,
          tipo: tipoMovimentoDaLinha(linha, valor),
        })
        const itensFallback = (mov.data || []).map((m: any) => ({
          origem: 'movimento_bancario',
          id: m.id,
          data: m.data,
          empresa: m.empresa,
          banco: m.banco,
          fornecedor: m.fornecedor,
          historico: m.historico,
          nf_doc: m.nf_doc || m.documento,
          conta_contabil: m.conta_contabil,
          natureza_financeira: m.natureza_financeira,
          status: m.status || 'realizado',
          valor: Number(m.entradas || 0) !== 0 ? Number(m.entradas || 0) : -Math.abs(Number(m.saidas || 0)),
        }))
        resp = {
          itens: itensFallback,
          total: itensFallback.reduce((sum: number, item: any) => sum + Number(item.valor || 0), 0),
          quantidade: itensFallback.length,
        }
      }

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
  const monthColumnWidth = visao === 'mensal' ? 112 : 86
  const tableMinWidth = Math.max(760, 48 + 270 + (colunasCount * monthColumnWidth) + 96)

  const stickyBase = 'sticky z-20 border-r border-zinc-100 dark:border-zinc-700'
  const stickyHeader = 'sticky top-0 z-30 bg-zinc-50 dark:bg-zinc-800/95 border-r border-zinc-100 dark:border-zinc-700'
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
          <div>
            <h3 className="text-sm font-semibold">{tituloTabela}</h3>
            {visao === 'mensal' && (
              <p className="text-[11px] text-zinc-400 mt-0.5">Nos saldos finais, use o lápis para editar o valor mensal diretamente em K.</p>
            )}
          </div>
          <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">
            {visao === 'diaria' ? 'Diário' : 'Orçado'}
          </span>
        </div>
        {edicaoErro && (
          <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
            {edicaoErro}
          </div>
        )}
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
          className="max-h-[70vh] overflow-auto"
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
              <thead className="sticky top-0 z-20">
                <tr className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-400 uppercase" style={{fontSize:'10px'}}>
                  <th className={`${stickyHeader} left-0 px-3 py-2.5 text-left w-12 min-w-[48px]`}>#</th>
                  <th className={`${stickyHeader} left-[48px] px-3 py-2.5 text-left w-[270px] min-w-[270px] shadow-[6px_0_10px_-10px_rgba(15,23,42,0.7)]`}>Descrição</th>
                  {data.colunas.map((c: any) => (
                    <th key={getColKey(c)} className="px-2 py-2.5 text-right" style={{ minWidth: monthColumnWidth }}>{c.label}</th>
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
                        const cellKey = `${linha.id}-${getColKey(c)}`
                        const editavel = Boolean(linha.editavel_saldo)
                        const editando = editavel && edicaoKey === cellKey
                        return (
                          <td key={getColKey(c)} className={`px-2 py-1.5 text-right font-mono ${colorCls}`}>
                            {editando ? (
                              <div className="flex items-center justify-end gap-1 min-w-[96px]">
                                <div className="relative">
                                  <input
                                    autoFocus
                                    inputMode="decimal"
                                    value={edicaoValor}
                                    onChange={e => setEdicaoValor(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter') salvarEdicaoSaldo(linha, c)
                                      if (e.key === 'Escape') cancelarEdicaoSaldo()
                                    }}
                                    disabled={edicaoSalvando}
                                    aria-label={`Editar ${linha.descricao} em ${visao === 'diaria' ? `dia ${c.label}` : c.label}, valor em K`}
                                    className="w-[68px] rounded border border-amber-400 bg-white px-1.5 py-1 pr-4 text-right text-[11px] text-zinc-800 outline-none focus:ring-2 focus:ring-amber-200 disabled:opacity-60"
                                  />
                                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400">K</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => salvarEdicaoSaldo(linha, c)}
                                  disabled={edicaoSalvando}
                                  title="Salvar saldo"
                                  className="rounded p-1 text-green-600 hover:bg-green-50 disabled:opacity-50"
                                >
                                  {edicaoSalvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelarEdicaoSaldo}
                                  disabled={edicaoSalvando}
                                  title="Cancelar edição"
                                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="group flex items-center justify-end gap-1 min-w-[84px]">
                                {v === 0 ? (
                                  <span className="flex-1 text-right">–</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => abrirDetalhes(linha, c, v)}
                                    title="Ver lançamentos que compõem este valor"
                                    className="flex-1 text-right hover:underline hover:decoration-dotted underline-offset-2"
                                  >
                                    {fmtBRL(v)}
                                  </button>
                                )}
                                {editavel && (
                                  <button
                                    type="button"
                                    onClick={() => iniciarEdicaoSaldo(linha, c, v)}
                                    title={visao === 'diaria' ? 'Editar saldo desta aplicação a partir deste dia' : 'Editar saldo deste mês'}
                                    aria-label={`Editar ${linha.descricao} em ${visao === 'diaria' ? `dia ${c.label}` : c.label}`}
                                    className="shrink-0 rounded p-1 text-zinc-300 opacity-60 transition hover:bg-amber-50 hover:text-amber-600 group-hover:opacity-100"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
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

      {!loading && data?.linhas?.length ? (
        <TableFloatingNav scrollRef={tableScrollRef} />
      ) : null}

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
