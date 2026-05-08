'use client'

/**
 * src/app/financeiro/page.tsx
 *
 * Dashboard de entrada do módulo Financeiro.
 * Mostra KPIs consolidados + atalhos para os sub-módulos.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, ArrowRightLeft, FileText,
  Users, Building2, ChevronRight, RefreshCw,
} from 'lucide-react'
import {
  getCashflowResumo,
  getContasPagarResumo,
  getMovimentoResumo,
} from '@/lib/api/financeiro'

// ─── Cards de atalho ──────────────────────────────────────────────────────────
const SHORTCUTS = [
  {
    href: '/financeiro/cashflow',
    label: 'Cash Flow',
    desc: 'Fluxo de caixa consolidado por empresa e período',
    icon: TrendingUp,
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
  },
  {
    href: '/financeiro/movimento',
    label: 'Movimento Bancário',
    desc: 'Entradas e saídas financeiras classificadas por plano de contas',
    icon: ArrowRightLeft,
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  },
  {
    href: '/financeiro/contas-pagar',
    label: 'Contas a Pagar',
    desc: 'Lançamento de títulos, parcelas e controle de vencimentos',
    icon: FileText,
    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  },
  {
    href: '/financeiro/fornecedores',
    label: 'Fornecedores',
    desc: 'Cadastro completo com dados bancários e plano de contas padrão',
    icon: Users,
    color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20',
  },
  {
    href: '/financeiro/bancos',
    label: 'Bancos & Contas',
    desc: 'Contas bancárias, agências, tipos e saldos iniciais por empresa',
    icon: Building2,
    color: 'text-rose-600 bg-rose-50 dark:bg-rose-900/20',
  },
]

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FinanceiroDashboard() {
  const [cf, setCf]     = useState<any>(null)
  const [cp, setCp]     = useState<any>(null)
  const [mov, setMov]   = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [ano] = useState(new Date().getFullYear())

  const load = async () => {
    setLoading(true)
    try {
      const [cfData, cpData, movData] = await Promise.all([
        getCashflowResumo('CONSOLIDADO', ano).catch(() => null),
        getContasPagarResumo().catch(() => null),
        getMovimentoResumo(undefined, ano).catch(() => null),
      ])
      setCf(cfData)
      setCp(cpData)
      setMov(movData)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const fmtBRL = (v: number) =>
    (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Totaliza entradas/saídas do movimento anual
  const totalEntradas = mov?.mensal?.reduce((s: number, m: any) => s + parseFloat(m.entradas || 0), 0) ?? 0
  const totalSaidas   = mov?.mensal?.reduce((s: number, m: any) => s + parseFloat(m.saidas || 0), 0) ?? 0

  return (
    <div className="p-6 space-y-6 animate-fade-in">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Módulo Financeiro</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Visão geral · {ano}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-all"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Saldo Final Projetado"
          value={cf ? fmtBRL(cf.saldo_final) : '—'}
          sub={`Cash Flow ${ano}`}
          trend={cf?.saldo_final >= 0 ? 'up' : 'down'}
          loading={loading}
        />
        <KpiCard
          label="Receita Bruta"
          value={cf ? fmtBRL(cf.receita_bruta) : '—'}
          sub="acumulada no ano"
          trend="up"
          loading={loading}
        />
        <KpiCard
          label="A Vencer (30 dias)"
          value={cp ? fmtBRL(cp.a_vencer_30d) : '—'}
          sub={cp ? `${cp.qtd_a_vencer} títulos` : '—'}
          trend={cp?.vencidos > 0 ? 'down' : 'neutral'}
          loading={loading}
        />
        <KpiCard
          label="Títulos Vencidos"
          value={cp ? fmtBRL(cp.vencidos) : '—'}
          sub={cp ? `${cp.qtd_vencidos} em atraso` : '—'}
          trend={cp?.qtd_vencidos > 0 ? 'down' : 'up'}
          loading={loading}
        />
      </div>

      {/* Entradas vs Saídas */}
      {!loading && mov?.mensal?.length > 0 && (
        <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Entradas × Saídas — {ano}</h2>
            <div className="flex gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Entradas: <strong className="text-emerald-600">{fmtBRL(totalEntradas)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
                Saídas: <strong className="text-red-500">{fmtBRL(totalSaidas)}</strong>
              </span>
            </div>
          </div>

          {/* Barras mensais */}
          <div className="flex items-end gap-1.5 h-24">
            {mov.mensal.map((m: any) => {
              const e = parseFloat(m.entradas || 0)
              const s = parseFloat(m.saidas || 0)
              const maxVal = Math.max(totalEntradas / 12, totalSaidas / 12, 1) * 1.2
              const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
              return (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end gap-0.5 h-16">
                    <div
                      className="flex-1 bg-emerald-400/70 dark:bg-emerald-500/60 rounded-t transition-all"
                      style={{ height: `${Math.min(100, (e / maxVal) * 100)}%` }}
                      title={fmtBRL(e)}
                    />
                    <div
                      className="flex-1 bg-red-400/70 dark:bg-red-500/60 rounded-t transition-all"
                      style={{ height: `${Math.min(100, (s / maxVal) * 100)}%` }}
                      title={fmtBRL(s)}
                    />
                  </div>
                  <span className="text-[9px] text-zinc-400">{MESES[m.mes - 1]}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Atalhos */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
          Acessar módulos
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SHORTCUTS.map(s => {
            const Icon = s.icon
            return (
              <Link
                key={s.href}
                href={s.href}
                className="group bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 flex items-start gap-3 hover:border-brand-500/40 hover:shadow-card-hover transition-all"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 group-hover:text-brand-600 transition-colors">
                    {s.label}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-brand-500 shrink-0 mt-0.5 transition-colors" />
              </Link>
            )
          })}
        </div>
      </div>

      {/* Top despesas */}
      {!loading && mov?.top_despesas?.length > 0 && (
        <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 mb-4">
            Top categorias de despesas — {ano}
          </h2>
          <div className="space-y-2">
            {mov.top_despesas.slice(0, 6).map((d: any, i: number) => {
              const pct = totalSaidas > 0 ? (d.total / totalSaidas) * 100 : 0
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 w-4 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate">{d.conta_contabil || '—'}</span>
                      <span className="text-xs font-mono text-red-500 ml-2 shrink-0">{fmtBRL(parseFloat(d.total))}</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-400/70 rounded-full transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-zinc-400 w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, trend, loading,
}: {
  label: string; value: string; sub: string
  trend: 'up' | 'down' | 'neutral'; loading?: boolean
}) {
  const trendCls = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-zinc-500'
  return (
    <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">{label}</p>
      {loading ? (
        <div className="h-7 w-28 bg-zinc-100 dark:bg-zinc-700 rounded animate-pulse" />
      ) : (
        <p className={`text-xl font-semibold font-mono ${trendCls}`}>{value}</p>
      )}
      <p className="text-xs text-zinc-400 mt-1">{sub}</p>
    </div>
  )
}
