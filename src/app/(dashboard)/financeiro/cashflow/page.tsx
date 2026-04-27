'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, BarChart2, ChevronRight, ChevronDown } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const R$ = (v: number | null | undefined, compact = false) => {
  const n = v ?? 0
  if (compact && Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (compact && Math.abs(n) >= 1_000)    return `R$ ${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MESES = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const EMPRESAS = ['CONSOLIDADO', 'LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const ANOS = [2021, 2022, 2023, 2024, 2025, 2026]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Linha {
  id: number; row_idx: number; codigo: string | null
  descricao: string; nivel: number; tipo: string
  valores: Record<number, number>  // mes -> valor
  total: number
}

interface Coluna { mes: number; label: string }

interface Resumo {
  saldo_final: number; receita_bruta: number; receita_liquida: number
  despesas: number; geracao_caixa: number; distribuicao: number
  saldo_cc: number; aplicacoes: number; saldo_inicial: number
}

// ─── Row styles ───────────────────────────────────────────────────────────────

const ROW_STYLE: Record<string, string> = {
  header:   'bg-[#1e3a5f] text-white font-bold text-xs',
  total:    'bg-slate-700 text-white font-semibold text-xs',
  subtotal: 'bg-slate-100 text-slate-700 font-semibold text-xs',
  item:     'hover:bg-blue-50 text-slate-700 text-xs',
}

const ROW_INDENT: Record<number, string> = {
  1: 'pl-2', 2: 'pl-4', 3: 'pl-8',
}

export default function CashflowPage() {
  const [empresa, setEmpresa] = useState('CONSOLIDADO')
  const [ano,     setAno]     = useState(2026)
  const [mes,     setMes]     = useState<number | null>(null)

  const [linhas,  setLinhas]  = useState<Linha[]>([])
  const [colunas, setColunas] = useState<Coluna[]>([])
  const [resumo,  setResumo]  = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(false)

  // Controle de expansão de grupos
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { empresa, ano }
      if (mes) params.mes = mes

      const [cfRes, resumoRes] = await Promise.all([
        apiClient.get('/financeiro/cashflow', { params }),
        apiClient.get('/financeiro/cashflow/resumo', { params }),
      ])

      setLinhas(cfRes.data.data.linhas)
      setColunas(cfRes.data.data.colunas)
      setResumo(resumoRes.data.data)
    } catch (err) {
      console.error('Erro cashflow:', err)
    } finally {
      setLoading(false)
    }
  }, [empresa, ano, mes])

  useEffect(() => { load() }, [load])

  function toggleCollapse(id: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Decide se uma linha deve ser ocultada (seu pai está colapsado)
  // Simplificação: oculta linhas de nível > 1 quando o header acima está colapsado
  const colapsedHeaders = new Set(
    linhas.filter(l => collapsed.has(l.id) && (l.tipo === 'header' || l.tipo === 'total')).map(l => l.id)
  )

  // Monta a lista de linhas visíveis
  let currentParent: Linha | null = null
  const visibleLinhas: (Linha & { hidden?: boolean })[] = []

  for (const l of linhas) {
    if (l.tipo === 'header' || l.tipo === 'total') {
      currentParent = l
      visibleLinhas.push(l)
    } else {
      const isHidden = currentParent ? collapsed.has(currentParent.id) : false
      visibleLinhas.push({ ...l, hidden: isHidden })
    }
  }

  const valorCell = (val: number | undefined, tipo: string) => {
    const n = val ?? 0
    if (n === 0) return <span className="text-slate-300">—</span>
    const isNeg = n < 0
    const baseColor = tipo === 'header' || tipo === 'total'
      ? (isNeg ? 'text-red-300' : 'text-emerald-300')
      : (isNeg ? 'text-red-600' : 'text-emerald-700')
    return (
      <span className={cn('tabular-nums', baseColor)}>
        {n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">CashFlow Consolidado</h1>
          <p className="text-sm text-slate-500 mt-0.5">Fluxo de caixa por empresa e período</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-600 bg-white border border-slate-200 hover:bg-slate-50">
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center bg-white rounded-xl border border-slate-100 px-4 py-3 shadow-sm">
        {/* Empresa */}
        <div className="flex gap-1 flex-wrap">
          {EMPRESAS.map(e => (
            <button key={e} onClick={() => setEmpresa(e)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                empresa === e ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}>
              {e}
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-slate-200 hidden sm:block" />

        {/* Ano */}
        <select value={ano} onChange={e => setAno(Number(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400">
          {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {/* Mês */}
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setMes(null)}
            className={cn('px-2 py-1 rounded text-xs transition-colors',
              mes === null ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            Ano todo
          </button>
          {MESES.slice(1).map((m, i) => (
            <button key={i+1} onClick={() => setMes(i + 1)}
              className={cn('px-2 py-1 rounded text-xs transition-colors',
                mes === i+1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Cards de resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Saldo Final',      value: resumo.saldo_final,    icon: DollarSign,   color: 'bg-blue-50 text-blue-600' },
            { label: 'Receita Bruta',    value: resumo.receita_bruta,  icon: TrendingUp,   color: 'bg-green-50 text-green-600' },
            { label: 'Despesas',         value: resumo.despesas,       icon: TrendingDown, color: 'bg-red-50 text-red-600' },
            { label: 'Geração de Caixa', value: resumo.geracao_caixa,  icon: BarChart2,    color: 'bg-purple-50 text-purple-600' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                  <p className={cn('text-sm font-bold', card.value < 0 ? 'text-red-600' : 'text-slate-800')}>
                    {R$(card.value, true)}
                  </p>
                </div>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', card.color)}>
                  <card.icon className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabela principal */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        {loading && !linhas.length && (
          <div className="flex items-center justify-center gap-2 h-40 text-slate-400 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando dados…
          </div>
        )}

        {!linhas.length && !loading && (
          <div className="text-center py-16 text-slate-400 text-sm">
            Nenhum dado encontrado. Execute a importação primeiro.
          </div>
        )}

        {linhas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0d1b2a] text-white">
                  <th className="text-left px-3 py-2.5 font-semibold sticky left-0 bg-[#0d1b2a] min-w-[280px] z-10">
                    Descrição
                  </th>
                  {colunas.map(col => (
                    <th key={col.mes} className="text-right px-3 py-2.5 font-semibold whitespace-nowrap min-w-[110px]">
                      {col.label}
                    </th>
                  ))}
                  <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap min-w-[120px] bg-[#162d4a]">
                    Acumulado
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleLinhas.filter(l => !l.hidden).map(l => {
                  const style = ROW_STYLE[l.tipo] ?? ROW_STYLE.item
                  const canCollapse = l.tipo === 'header' || l.tipo === 'total'
                  const isCollapsed = collapsed.has(l.id)

                  return (
                    <tr key={l.id}
                      className={cn('border-b border-slate-100 transition-colors', style)}
                    >
                      {/* Descrição */}
                      <td
                        className={cn(
                          'px-3 py-1.5 sticky left-0 z-10',
                          ROW_INDENT[l.nivel] ?? 'pl-2',
                          l.tipo === 'header' ? 'bg-[#1e3a5f]' :
                          l.tipo === 'total'  ? 'bg-slate-700' :
                          l.tipo === 'subtotal' ? 'bg-slate-100' : 'bg-white',
                          style
                        )}
                        onClick={() => canCollapse && toggleCollapse(l.id)}
                        style={{ cursor: canCollapse ? 'pointer' : 'default' }}
                      >
                        <div className="flex items-center gap-1.5">
                          {canCollapse && (
                            isCollapsed
                              ? <ChevronRight className="w-3 h-3 flex-shrink-0 opacity-70" />
                              : <ChevronDown  className="w-3 h-3 flex-shrink-0 opacity-70" />
                          )}
                          {l.codigo && (
                            <span className="opacity-60 font-mono">{l.codigo}</span>
                          )}
                          <span>{l.descricao}</span>
                        </div>
                      </td>

                      {/* Valores mensais */}
                      {colunas.map(col => (
                        <td key={col.mes} className="text-right px-3 py-1.5 tabular-nums">
                          {valorCell(l.valores[col.mes], l.tipo)}
                        </td>
                      ))}

                      {/* Total acumulado */}
                      <td className={cn(
                        'text-right px-3 py-1.5 tabular-nums font-medium',
                        l.tipo === 'header' ? 'bg-[#162d4a]' :
                        l.tipo === 'total'  ? 'bg-slate-600' : 'bg-slate-50'
                      )}>
                        {valorCell(l.total, l.tipo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
