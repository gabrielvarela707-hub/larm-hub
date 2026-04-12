'use client'

import { useState, useMemo } from 'react'
import { Calculator, FileText, ChevronDown, Check, Printer } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import { SANTA_CLARA } from '@/lib/empreendimento-data'
import type { Lot } from '@/types'

type FinType = 'price' | 'sac' | 'sacoc'
type EntradaTipo = 'ato_unico' | 'parcelada'

const FIN_LABELS: Record<FinType, string> = {
  price: 'Tabela Price (parcelas fixas)',
  sac:   'SAC (parcelas decrescentes)',
  sacoc: 'SACOC (correcao pelo INCC)',
}

function calcPrice(pv: number, taxa: number, n: number) {
  if (taxa === 0) return pv / n
  const r = taxa / 100
  return (pv * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function calcSACTable(pv: number, taxa: number, n: number) {
  const r = taxa / 100
  const amort = pv / n
  return Array.from({ length: n }, (_, i) => {
    const saldo = pv - amort * i
    const juros = saldo * r
    return { parcela: i + 1, amort, juros, total: amort + juros, saldo: saldo - amort }
  })
}

function ParcelasTable({ rows }: { rows: { parcela: number; total: number; juros: number; amort: number; saldo: number }[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? rows : rows.slice(0, 8)
  return (
    <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-card">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Tabela de parcelas</p>
        <span className="text-xs text-slate-400">{rows.length} parcelas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-50">
              <th className="text-right px-3 py-2 text-slate-500 font-medium">Parc.</th>
              <th className="text-right px-3 py-2 text-slate-500 font-medium">Total</th>
              <th className="text-right px-3 py-2 text-slate-500 font-medium">Juros</th>
              <th className="text-right px-3 py-2 text-slate-500 font-medium">Amort.</th>
              <th className="text-right px-3 py-2 text-slate-500 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {visible.map(r => (
              <tr key={r.parcela} className={cn('hover:bg-slate-50/50', r.parcela === 1 && 'bg-blue-50/30')}>
                <td className="text-right px-3 py-1.5 text-slate-500">{r.parcela}</td>
                <td className="text-right px-3 py-1.5 font-semibold text-slate-900">{formatCurrency(r.total)}</td>
                <td className="text-right px-3 py-1.5 text-red-500">{formatCurrency(r.juros)}</td>
                <td className="text-right px-3 py-1.5 text-emerald-600">{formatCurrency(r.amort)}</td>
                <td className="text-right px-3 py-1.5 text-slate-600">{formatCurrency(r.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 8 && (
        <button onClick={() => setExpanded(v => !v)}
          className="w-full py-2 text-xs text-blue-600 hover:bg-slate-50 transition-colors border-t border-slate-50">
          {expanded ? 'Ver menos' : `Ver todas as ${rows.length} parcelas`}
        </button>
      )}
    </div>
  )
}

export default function SimuladorPage() {
  const livres = SANTA_CLARA.lots.filter(l => l.status === 'livre')

  const [selectedLot, setSelectedLot] = useState<Lot>(livres[0])
  const [finType, setFinType]         = useState<FinType>('price')
  const [nParcelas, setNParcelas]     = useState(180)
  const [taxa, setTaxa]               = useState(0.89)
  const [entradaTipo, setEntradaTipo] = useState<EntradaTipo>('parcelada')
  const [entradaParcelas, setEntradaParcelas] = useState(3)
  const [intermediarias, setIntermediarias]   = useState(12)
  const [showTable, setShowTable]     = useState(false)
  const [showPicker, setShowPicker]   = useState(false)

  const p = selectedLot.pricing
  const totalEntrada        = p.precoAPrazo * 0.10
  const entradaParcela      = totalEntrada / entradaParcelas
  const intermediariaValor  = p.precoAPrazo * 0.08 / intermediarias
  const saldoFinanciar      = p.precoAPrazo - totalEntrada - (intermediariaValor * intermediarias)

  const parcelaPrice = useMemo(() => calcPrice(saldoFinanciar, taxa, nParcelas), [saldoFinanciar, taxa, nParcelas])
  const sacTable     = useMemo(() => calcSACTable(saldoFinanciar, taxa, nParcelas), [saldoFinanciar, taxa, nParcelas])
  const sacPrimeira  = sacTable[0]?.total ?? 0
  const sacUltima    = sacTable[sacTable.length - 1]?.total ?? 0
  const parcelaRef   = finType === 'price' ? parcelaPrice : sacPrimeira
  const totalPago    = finType === 'price'
    ? totalEntrada + intermediariaValor * intermediarias + parcelaPrice * nParcelas
    : totalEntrada + intermediariaValor * intermediarias + sacTable.reduce((s, r) => s + r.total, 0)

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Simulador de Vendas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Price, SAC e SACOC com tabela completa</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium">
            <FileText className="w-3.5 h-3.5" /> Gerar proposta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Lote</p>
            <button onClick={() => setShowPicker(v => !v)}
              className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100">
              <div className="text-left">
                <p className="font-semibold text-slate-900">Quadra {selectedLot.quadra} — Lote {selectedLot.number}</p>
                <p className="text-xs text-slate-500">{selectedLot.area} m2 · {selectedLot.facing}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {showPicker && (
              <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                {livres.map(lot => (
                  <button key={lot.id}
                    onClick={() => { setSelectedLot(lot); setShowPicker(false) }}
                    className={cn('w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0',
                      selectedLot.id === lot.id && 'bg-blue-50 text-blue-700'
                    )}>
                    <span>Qd {lot.quadra} Lt {lot.number} — {lot.area}m2</span>
                    {selectedLot.id === lot.id && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-emerald-600">A vista</p>
                <p className="text-sm font-bold text-emerald-700">{formatCurrency(p.precoAVista)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-blue-600">A prazo</p>
                <p className="text-sm font-bold text-blue-700">{formatCurrency(p.precoAPrazo)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Modalidade</p>
            {(['price','sac','sacoc'] as FinType[]).map(ft => (
              <button key={ft} onClick={() => setFinType(ft)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm mb-2 last:mb-0 text-left',
                  finType === ft ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 hover:bg-slate-50'
                )}>
                <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                  finType === ft ? 'border-blue-500' : 'border-slate-300'
                )}>
                  {finType === ft && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
                <div>
                  <p className="font-medium text-xs">{ft.toUpperCase()}</p>
                  <p className="text-[10px] text-slate-500 leading-tight">{FIN_LABELS[ft]}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card space-y-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Parametros</p>
            <div>
              <label className="block text-xs text-slate-600 mb-1.5">Taxa de juros (% a.m.)</label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max="2" step="0.01" value={taxa}
                  onChange={e => setTaxa(Number(e.target.value))}
                  className="flex-1 accent-blue-600" />
                <span className="text-sm font-bold text-blue-700 w-14 text-right">{taxa.toFixed(2)}%</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1.5">Prazo</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[120,150,180,240].map(n => (
                  <button key={n} onClick={() => setNParcelas(n)}
                    className={cn('py-2 rounded-lg border text-xs font-semibold',
                      nParcelas === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}>
                    {n}x
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1.5">Entrada</label>
              <div className="flex gap-1.5 mb-2">
                {[['ato_unico','Ato unico'],['parcelada','Parcelada']].map(([v, l]) => (
                  <button key={v} onClick={() => setEntradaTipo(v as EntradaTipo)}
                    className={cn('flex-1 py-1.5 rounded-lg border text-xs font-medium',
                      entradaTipo === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                    )}>
                    {l}
                  </button>
                ))}
              </div>
              {entradaTipo === 'parcelada' && (
                <div className="flex gap-1.5">
                  {[1,2,3,6].map(n => (
                    <button key={n} onClick={() => setEntradaParcelas(n)}
                      className={cn('flex-1 py-1.5 rounded-lg border text-xs font-semibold',
                        entradaParcelas === n ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-600 border-slate-200'
                      )}>
                      {n}x
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1.5">Intermediarias</label>
              <div className="flex gap-1.5">
                {[6,12,18,24].map(n => (
                  <button key={n} onClick={() => setIntermediarias(n)}
                    className={cn('flex-1 py-1.5 rounded-lg border text-xs font-semibold',
                      intermediarias === n ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200'
                    )}>
                    {n}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 rounded-2xl p-6 text-white">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm text-slate-400">Simulacao {finType.toUpperCase()}</p>
              <span className="text-xs bg-white/10 px-2.5 py-1 rounded-full">
                Qd {selectedLot.quadra} Lt {selectedLot.number} - {selectedLot.area}m2
              </span>
            </div>
            <div className="text-center mb-6">
              <p className="text-slate-400 text-sm mb-1">
                {finType === 'price' ? `${nParcelas}x de` : 'Primeira parcela'}
              </p>
              <p className="text-5xl font-bold tracking-tight">{formatCurrency(parcelaRef)}</p>
              {finType === 'sac' && (
                <p className="text-slate-400 text-sm mt-1">Ate {formatCurrency(sacUltima)} na ultima parcela</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: entradaTipo === 'ato_unico' ? 'Ato de entrada' : `Entrada ${entradaParcelas}x de`, value: formatCurrency(entradaParcela), sub: `Total: ${formatCurrency(totalEntrada)}` },
                { label: `${intermediarias}x intermediarias de`, value: formatCurrency(intermediariaValor), sub: `Total: ${formatCurrency(intermediariaValor * intermediarias)}` },
                { label: 'Saldo a financiar', value: formatCurrency(saldoFinanciar), sub: `${taxa.toFixed(2)}% a.m.` },
                { label: 'Total pago', value: formatCurrency(totalPago), sub: `${((totalPago / p.precoAPrazo - 1) * 100).toFixed(1)}% acima do prazo` },
              ].map(k => (
                <div key={k.label} className="bg-white/5 rounded-xl p-3">
                  <p className="text-[10px] text-slate-400 leading-tight mb-1">{k.label}</p>
                  <p className="text-base font-bold">{k.value}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {finType === 'sac' && sacTable.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Evolucao das parcelas SAC</p>
              <div className="flex items-end gap-0.5 h-14">
                {sacTable.filter((_, i) => i % Math.ceil(sacTable.length / 40) === 0).map((r, i) => (
                  <div key={i} className="flex-1 bg-blue-300 rounded-sm hover:bg-blue-500 transition-colors cursor-pointer"
                    style={{ height: `${(r.total / sacPrimeira) * 100}%` }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>1a: {formatCurrency(sacPrimeira)}</span>
                <span>{nParcelas}a: {formatCurrency(sacUltima)}</span>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Comparativo Price x SAC</p>
            <div className="space-y-2">
              {([['price', `${nParcelas}x fixas de ${formatCurrency(parcelaPrice)}`, parcelaPrice * nParcelas],
                 ['sac',   `1a ${formatCurrency(sacPrimeira)} ate ${formatCurrency(sacUltima)}`, sacTable.reduce((s, r) => s + r.total, 0)]] as [string, string, number][])
                .map(([ft, desc, totalFin]) => (
                  <div key={ft} className={cn('flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm',
                    finType === ft ? 'border-blue-300 bg-blue-50' : 'border-slate-100'
                  )}>
                    <div>
                      <span className="font-semibold text-slate-900 uppercase">{ft}</span>
                      <span className="text-xs text-slate-500 ml-2">{desc}</span>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0 ml-2">
                      Total fin: {formatCurrency(totalFin)}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>

          <button onClick={() => setShowTable(v => !v)}
            className="w-full flex items-center justify-center gap-2 bg-white border border-slate-200 rounded-xl py-3 text-sm text-slate-600 hover:bg-slate-50">
            <Calculator className="w-4 h-4" />
            {showTable ? 'Ocultar tabela' : 'Ver tabela completa de parcelas'}
            <ChevronDown className={cn('w-4 h-4 transition-transform', showTable && 'rotate-180')} />
          </button>

          {showTable && (
            <ParcelasTable rows={
              finType !== 'price' ? sacTable :
              Array.from({ length: nParcelas }, (_, i) => ({
                parcela: i + 1,
                total: parcelaPrice,
                juros: 0,
                amort: parcelaPrice,
                saldo: Math.max(0, saldoFinanciar - parcelaPrice * (i + 1)),
              }))
            } />
          )}
        </div>
      </div>
    </div>
  )
}
