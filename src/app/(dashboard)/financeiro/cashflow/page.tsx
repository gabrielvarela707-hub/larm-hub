'use client'
/**
 * src/app/financeiro/cashflow/page.tsx
 * Relatório de Cash Flow — espelha estrutura do Excel
 */
import { useState, useEffect } from 'react'
import { Download, Printer } from 'lucide-react'
import { getCashflow, getCashflowResumo, type Empresa } from '@/lib/api/financeiro'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function CashFlowPage() {
  const [empresa, setEmpresa] = useState<Empresa>('CONSOLIDADO')
  const [ano, setAno]         = useState(2026)
  const [data, setData]       = useState<any>(null)
  const [resumo, setResumo]   = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [cf, res] = await Promise.all([
        getCashflow(empresa, ano),
        getCashflowResumo(empresa, ano),
      ])
      setData(cf)
      setResumo(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [empresa, ano])

  const fmtBRL = (v: number) => {
    if (v === 0) return '–'
    const abs = Math.abs(v)
    const s = abs >= 1_000_000
      ? (abs / 1_000_000).toFixed(2) + 'M'
      : abs >= 1_000
      ? (abs / 1_000).toFixed(0) + 'K'
      : abs.toFixed(0)
    return (v < 0 ? '-' : '') + 'R$ ' + s
  }

  const getRowStyle = (tipo: string) => {
    if (tipo === 'header') return 'bg-amber-50/60 dark:bg-amber-900/20 font-semibold text-amber-700 dark:text-amber-400'
    if (tipo === 'total')  return 'bg-zinc-100 dark:bg-zinc-800 font-semibold'
    return ''
  }

  return (
    <div className="p-6 space-y-4">
      {/* Controles */}
      <div className="flex gap-2 items-center flex-wrap">
        <select className={iCls} value={`${ano}-${empresa}`} onChange={e => {
          const [a, emp] = e.target.value.split('-')
          setAno(parseInt(a)); setEmpresa(emp as Empresa)
        }}>
          {[2026, 2025, 2024].map(a =>
            ['CONSOLIDADO','LARM','LM','HOLDING','RM'].map(emp => (
              <option key={`${a}-${emp}`} value={`${a}-${emp}`}>{a} — {emp}</option>
            ))
          )}
        </select>
        <select className={iCls}>
          <option>Visão Mensal</option>
          <option>Visão Diária</option>
        </select>
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
        <div className="grid grid-cols-4 gap-3">
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
          <h3 className="text-sm font-semibold">Cash Flow — {empresa} {ano}</h3>
          <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">Orçado</span>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-center py-10 text-zinc-400">Carregando...</div>
          ) : !data?.linhas?.length ? (
            <div className="text-center py-10 text-zinc-400">
              <p className="text-sm">Sem dados para {empresa} / {ano}</p>
              <p className="text-xs mt-1 text-zinc-400">Execute o script de importação para carregar os dados do Excel.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-400 uppercase" style={{fontSize:'10px'}}>
                  <th className="px-3 py-2.5 text-left w-6">#</th>
                  <th className="px-3 py-2.5 text-left min-w-[220px]">Descrição</th>
                  {data.colunas.map((c: any) => (
                    <th key={c.mes} className="px-2 py-2.5 text-right min-w-[70px]">{c.label}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold min-w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.linhas.map((linha: any) => {
                  const rowCls = getRowStyle(linha.tipo)
                  const isNeg = (v: number) => v < 0
                  return (
                    <tr key={linha.id} className={`border-t border-zinc-100 dark:border-zinc-800 ${rowCls}`}>
                      <td className="px-3 py-1.5 text-zinc-400" style={{fontSize:'10px'}}>{linha.codigo}</td>
                      <td className={`px-3 py-1.5 ${linha.nivel >= 2 ? 'pl-6' : ''} ${linha.nivel >= 3 ? 'pl-9 text-zinc-500' : ''}`}>
                        {linha.descricao}
                      </td>
                      {data.colunas.map((c: any) => {
                        const v = linha.valores[c.mes] ?? 0
                        return (
                          <td key={c.mes} className={`px-2 py-1.5 text-right font-mono ${v === 0 ? 'text-zinc-300 dark:text-zinc-600' : isNeg(v) ? 'text-red-500' : 'text-green-600'}`}>
                            {v === 0 ? '–' : fmtBRL(v)}
                          </td>
                        )
                      })}
                      <td className={`px-3 py-1.5 text-right font-mono font-semibold ${linha.total === 0 ? 'text-zinc-300 dark:text-zinc-600' : isNeg(linha.total) ? 'text-red-500' : 'text-green-600'}`}>
                        {linha.total === 0 ? '–' : fmtBRL(linha.total)}
                      </td>
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

const iCls = 'px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
