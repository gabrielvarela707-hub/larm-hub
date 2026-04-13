'use client'

import { useState } from 'react'
import { Building2, Shield, FileText, Landmark, Plus, Filter, Search, ChevronDown, AlertCircle, CheckCircle2, Clock, Calendar, DollarSign } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────
type StatusPagto = 'pago' | 'pendente' | 'vencido'
type CategoriaPagto = 'iptu' | 'cartorio' | 'seguranca' | 'taxa' | 'outros'

interface ContaAPagar {
  id: string
  descricao: string
  categoria: CategoriaPagto
  valor: number
  vencimento: string
  status: StatusPagto
  empreendimento: string
  referencia?: string
}

// ─── Mock data ───────────────────────────────────────────────────────────────
const CONTAS: ContaAPagar[] = [
  { id: '1',  descricao: 'IPTU – Lote 01/Quadra A',        categoria: 'iptu',      valor: 1240.00,  vencimento: '2026-04-10', status: 'vencido',  empreendimento: 'Santa Clara', referencia: 'IPTU-2026-001' },
  { id: '2',  descricao: 'IPTU – Lote 02/Quadra A',        categoria: 'iptu',      valor: 1240.00,  vencimento: '2026-04-10', status: 'vencido',  empreendimento: 'Santa Clara', referencia: 'IPTU-2026-002' },
  { id: '3',  descricao: 'IPTU – Área Comum Central',      categoria: 'iptu',      valor: 3850.00,  vencimento: '2026-04-30', status: 'pendente', empreendimento: 'Santa Clara', referencia: 'IPTU-2026-AC' },
  { id: '4',  descricao: 'Registro Escritura – Lote 05',   categoria: 'cartorio',  valor: 890.50,   vencimento: '2026-04-15', status: 'vencido',  empreendimento: 'Santa Clara', referencia: 'REG-2026-005' },
  { id: '5',  descricao: 'Averbação – Quadra B',           categoria: 'cartorio',  valor: 1450.00,  vencimento: '2026-04-22', status: 'pendente', empreendimento: 'Santa Clara', referencia: 'AV-2026-QB' },
  { id: '6',  descricao: 'Certidão Negativa – Abril',      categoria: 'cartorio',  valor: 215.00,   vencimento: '2026-04-28', status: 'pendente', empreendimento: 'Santa Clara', referencia: 'CN-ABR-2026' },
  { id: '7',  descricao: 'Contrato Segurança Patrimonial', categoria: 'seguranca', valor: 4200.00,  vencimento: '2026-04-05', status: 'pago',     empreendimento: 'Santa Clara', referencia: 'SEG-ABR-2026' },
  { id: '8',  descricao: 'Monitoramento Eletrônico – Abr', categoria: 'seguranca', valor: 680.00,   vencimento: '2026-04-05', status: 'pago',     empreendimento: 'Santa Clara', referencia: 'MON-ABR-2026' },
  { id: '9',  descricao: 'Taxa de Condomínio – Abril',     categoria: 'taxa',      valor: 12800.00, vencimento: '2026-04-10', status: 'pago',     empreendimento: 'Santa Clara', referencia: 'COND-ABR-2026' },
  { id: '10', descricao: 'Taxa de Manutenção – Maio',      categoria: 'taxa',      valor: 12800.00, vencimento: '2026-05-10', status: 'pendente', empreendimento: 'Santa Clara', referencia: 'MANUT-MAI-2026' },
  { id: '11', descricao: 'Taxa de Administração – Abril',  categoria: 'taxa',      valor: 3500.00,  vencimento: '2026-04-15', status: 'pago',     empreendimento: 'Santa Clara', referencia: 'ADM-ABR-2026' },
  { id: '12', descricao: 'IPTU – Lote 07/Quadra C',        categoria: 'iptu',      valor: 1240.00,  vencimento: '2026-05-10', status: 'pendente', empreendimento: 'Santa Clara', referencia: 'IPTU-2026-007' },
]

// ─── Config ──────────────────────────────────────────────────────────────────
const CATEGORIAS = [
  { id: 'all',       label: 'Todas',       icon: Filter,    cor: 'text-slate-500' },
  { id: 'iptu',      label: 'IPTU',        icon: Landmark,  cor: 'text-blue-600' },
  { id: 'cartorio',  label: 'Cartório',    icon: FileText,  cor: 'text-purple-600' },
  { id: 'seguranca', label: 'Segurança',   icon: Shield,    cor: 'text-orange-500' },
  { id: 'taxa',      label: 'Taxas',       icon: Building2, cor: 'text-emerald-600' },
]

const STATUS_CONFIG: Record<StatusPagto, { label: string; cls: string; icon: React.FC<{ className?: string }> }> = {
  pago:     { label: 'Pago',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  pendente: { label: 'Pendente', cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: Clock },
  vencido:  { label: 'Vencido',  cls: 'bg-red-50 text-red-700 border-red-200',             icon: AlertCircle },
}

const CATEGORIA_ICON: Record<CategoriaPagto, React.FC<{ className?: string }>> = {
  iptu:      Landmark,
  cartorio:  FileText,
  seguranca: Shield,
  taxa:      Building2,
  outros:    DollarSign,
}

const CATEGORIA_COR: Record<CategoriaPagto, string> = {
  iptu:      'bg-blue-100 text-blue-600',
  cartorio:  'bg-purple-100 text-purple-600',
  seguranca: 'bg-orange-100 text-orange-500',
  taxa:      'bg-emerald-100 text-emerald-600',
  outros:    'bg-slate-100 text-slate-500',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ContasAPagarPage() {
  const [catFiltro, setCatFiltro] = useState<string>('all')
  const [statusFiltro, setStatusFiltro] = useState<string>('all')
  const [busca, setBusca] = useState('')

  const filtradas = CONTAS.filter(c => {
    const okCat    = catFiltro === 'all' || c.categoria === catFiltro
    const okStatus = statusFiltro === 'all' || c.status === statusFiltro
    const okBusca  = c.descricao.toLowerCase().includes(busca.toLowerCase()) ||
                     (c.referencia ?? '').toLowerCase().includes(busca.toLowerCase())
    return okCat && okStatus && okBusca
  })

  const totalPagar   = CONTAS.filter(c => c.status !== 'pago').reduce((s, c) => s + c.valor, 0)
  const totalVencido = CONTAS.filter(c => c.status === 'vencido').reduce((s, c) => s + c.valor, 0)
  const totalPago    = CONTAS.filter(c => c.status === 'pago').reduce((s, c) => s + c.valor, 0)
  const totalPendente= CONTAS.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contas a Pagar</h1>
          <p className="text-sm text-slate-500 mt-0.5">IPTU · Cartório · Segurança · Taxas</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      {/* ── Cards de resumo ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total a Pagar',  valor: totalPagar,   cor: 'text-slate-900', bg: 'bg-slate-50',   borda: 'border-slate-200', icon: DollarSign },
          { label: 'Vencidos',       valor: totalVencido, cor: 'text-red-600',   bg: 'bg-red-50',     borda: 'border-red-100',   icon: AlertCircle },
          { label: 'A Vencer',       valor: totalPendente,cor: 'text-amber-600', bg: 'bg-amber-50',   borda: 'border-amber-100', icon: Clock },
          { label: 'Pagos (mês)',    valor: totalPago,    cor: 'text-emerald-600',bg:'bg-emerald-50',  borda: 'border-emerald-100',icon: CheckCircle2 },
        ].map(c => (
          <div key={c.label} className={cn('rounded-2xl border p-4', c.bg, c.borda)}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 font-medium">{c.label}</p>
              <c.icon className={cn('w-4 h-4', c.cor)} />
            </div>
            <p className={cn('text-xl font-semibold', c.cor)}>
              {formatCurrency(c.valor)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIAS.map(cat => (
            <button key={cat.id}
              onClick={() => setCatFiltro(cat.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                catFiltro === cat.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}>
              <cat.icon className="w-3.5 h-3.5" />
              {cat.label}
            </button>
          ))}

          <div className="ml-auto flex gap-2">
            {(['all','pendente','vencido','pago'] as const).map(s => (
              <button key={s}
                onClick={() => setStatusFiltro(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                  statusFiltro === s
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                )}>
                {s === 'all' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou referência…"
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-colors"
          />
        </div>
      </div>

      {/* ── Tabela ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            {filtradas.length} {filtradas.length === 1 ? 'conta' : 'contas'}
          </p>
          <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
            <Calendar className="w-3.5 h-3.5" />
            Vencimento <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {filtradas.length === 0 && (
            <div className="py-16 text-center text-slate-400 text-sm">
              Nenhuma conta encontrada com os filtros selecionados.
            </div>
          )}
          {filtradas.map(conta => {
            const StatusIcon = STATUS_CONFIG[conta.status].icon
            const CatIcon = CATEGORIA_ICON[conta.categoria]
            return (
              <div key={conta.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors group">
                {/* Ícone categoria */}
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', CATEGORIA_COR[conta.categoria])}>
                  <CatIcon className="w-4 h-4" />
                </div>

                {/* Descrição + ref */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{conta.descricao}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{conta.referencia} · {conta.empreendimento}</p>
                </div>

                {/* Vencimento */}
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-slate-500">Vencimento</p>
                  <p className={cn('text-sm font-medium', conta.status === 'vencido' ? 'text-red-600' : 'text-slate-700')}>
                    {fmtDate(conta.vencimento)}
                  </p>
                </div>

                {/* Valor */}
                <div className="text-right w-28 flex-shrink-0">
                  <p className="text-sm font-semibold text-slate-900">{formatCurrency(conta.valor)}</p>
                </div>

                {/* Status badge */}
                <div className="flex-shrink-0">
                  <span className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border',
                    STATUS_CONFIG[conta.status].cls
                  )}>
                    <StatusIcon className="w-3 h-3" />
                    {STATUS_CONFIG[conta.status].label}
                  </span>
                </div>

                {/* Ação */}
                <button className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-600 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50">
                  {conta.status === 'pago' ? 'Ver' : 'Pagar'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
