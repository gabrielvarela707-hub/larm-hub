'use client'

import { useState } from 'react'
import { Plus, Users, DollarSign, CheckCircle, Clock, X, Save, Percent } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

interface Comissao {
  id: string
  contratoNumero: string
  compradorNome: string
  lote: string
  valorVenda: number
  percentualTotal: number
  corretores: { nome: string; percentual: number; valor: number; pago: boolean }[]
  status: 'pendente' | 'parcial' | 'pago'
  criadoEm: string
}

const MOCK: Comissao[] = [
  {
    id: 'com1', contratoNumero: 'SC-001/2026', compradorNome: 'Carlos Henrique Silva',
    lote: 'Qd A · Lt 01', valorVenda: 220000, percentualTotal: 5,
    corretores: [
      { nome: 'Ana Paula Costa', percentual: 3, valor: 6600, pago: true },
      { nome: 'Carlos Henrique', percentual: 2, valor: 4400, pago: false },
    ],
    status: 'parcial', criadoEm: '2026-03-15T00:00:00Z',
  },
  {
    id: 'com2', contratoNumero: 'SC-002/2026', compradorNome: 'Fernanda Lima Cruz',
    lote: 'Qd B · Lt 07', valorVenda: 195000, percentualTotal: 5,
    corretores: [
      { nome: 'Carlos Henrique', percentual: 5, valor: 9750, pago: false },
    ],
    status: 'pendente', criadoEm: '2026-04-01T00:00:00Z',
  },
]

export default function SplitPage() {
  const [comissoes, setComissoes] = useState<Comissao[]>(MOCK)
  const [showNew, setShowNew] = useState(false)

  const totalAPagar = comissoes.flatMap(c => c.corretores).filter(c => !c.pago).reduce((s, c) => s + c.valor, 0)
  const totalPago   = comissoes.flatMap(c => c.corretores).filter(c => c.pago).reduce((s, c) => s + c.valor, 0)

  function togglePago(comId: string, corIdx: number) {
    setComissoes(prev => prev.map(c => {
      if (c.id !== comId) return c
      const cors = c.corretores.map((cor, i) => i === corIdx ? { ...cor, pago: !cor.pago } : cor)
      const status: Comissao['status'] = cors.every(c => c.pago) ? 'pago' : cors.some(c => c.pago) ? 'parcial' : 'pendente'
      return { ...c, corretores: cors, status }
    }))
  }

  const STATUS_CFG = {
    pendente: 'bg-amber-100 text-amber-700',
    parcial:  'bg-blue-100 text-blue-700',
    pago:     'bg-emerald-100 text-emerald-700',
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Split de Pagamento e Comissoes</h1>
          <p className="text-sm text-slate-500 mt-0.5">Controle de comissoes por venda com divisao entre corretores</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium">
          <Plus className="w-4 h-4" /> Registrar comissao
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total a pagar', value: totalAPagar, color: 'text-amber-600', icon: Clock },
          { label: 'Total pago',    value: totalPago,   color: 'text-emerald-600', icon: CheckCircle },
          { label: 'Total geral',   value: totalAPagar + totalPago, color: 'text-slate-900', icon: DollarSign },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-card">
            <div className="flex items-center gap-2 mb-1">
              <k.icon className={cn('w-4 h-4', k.color)} />
              <p className="text-xs text-slate-500">{k.label}</p>
            </div>
            <p className={cn('text-xl font-bold', k.color)}>{formatCurrency(k.value)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {comissoes.map(com => (
          <div key={com.id} className="bg-white border border-slate-100 rounded-xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50/50 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{com.compradorNome}</p>
                  <p className="text-xs text-slate-500">{com.contratoNumero} · {com.lote}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Venda</p>
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(com.valorVenda)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{com.percentualTotal}% total</p>
                  <p className="text-sm font-semibold text-blue-700">{formatCurrency(com.valorVenda * com.percentualTotal / 100)}</p>
                </div>
                <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full', STATUS_CFG[com.status])}>
                  {com.status === 'pendente' ? 'Pendente' : com.status === 'parcial' ? 'Parcial' : 'Pago'}
                </span>
              </div>
            </div>

            <div className="px-5 py-3 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Divisao de comissao</p>
              {com.corretores.map((cor, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-700 text-[10px] font-semibold">
                        {cor.nome.split(' ').slice(0,2).map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{cor.nome}</p>
                      <p className="text-xs text-slate-500">{cor.percentual}% sobre a venda</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(cor.valor)}</p>
                    <button onClick={() => togglePago(com.id, i)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        cor.pago
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                      )}>
                      {cor.pago ? <><CheckCircle className="w-3 h-3" /> Pago</> : <><Clock className="w-3 h-3" /> Marcar pago</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <strong>Nota:</strong> Comissoes podem ser divididas entre multiplos corretores por venda. O total nao pode ultrapassar o percentual configurado no contrato. O pagamento e registrado manualmente e confirmado pelo administrador.
      </div>
    </div>
  )
}
