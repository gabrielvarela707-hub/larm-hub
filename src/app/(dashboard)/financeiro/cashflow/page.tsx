'use client'
/**
 * src/app/(dashboard)/financeiro/cashflow/page.tsx
 * Relatório de Cash Flow — visão consolidada, por empresa, mensal e diária.
 */
import { useEffect, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { getCashflow, getCashflowResumo, getCashflowEmpresas, type Empresa } from '@/lib/api/financeiro'

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const MESES_LONGOS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const EMPRESAS_PADRAO = ['CONSOLIDADO', 'LARM', 'LARM FILIAL', 'MANTIQUEIRA', 'RM'] as const

type VisaoCashflow = 'mensal' | 'diaria'

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values.filter(v => Number.isFinite(v)))).sort((a, b) => b - a)
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

  const tituloTabela = visao === 'diaria'
    ? `Cash Flow Diário — ${empresa} ${MESES_LONGOS[mes - 1]} / ${ano}`
    : `Cash Flow — ${empresa} ${ano}`

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
                    <th key={getColKey(c)} className="px-2 py-2.5 text-right min-w-[70px]">{c.label}</th>
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
                        const v = Number(getValorColuna(linha, c) || 0)
                        return (
                          <td key={getColKey(c)} className={`px-2 py-1.5 text-right font-mono ${v === 0 ? 'text-zinc-300 dark:text-zinc-600' : isNeg(v) ? 'text-red-500' : 'text-green-600'}`}>
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

const iCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
