'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, BarChart3, CheckCircle, ChevronDown,
  Clock, Loader2, MessageSquare, Plus, RefreshCw,
  Search, TrendingUp, X,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'carteira' | 'parcelas' | 'cobranca' | 'projecao' | 'acordos'
type ParcelaStatus = 'aberta' | 'paga' | 'atrasada' | 'renegociada' | 'cancelada'

type Parcela = {
  id: string; contrato_id: string; numero: number; tipo: string
  contrato_numero: string; comprador_nome: string
  lot_id?: string; lot_number?: string; quadra?: string
  vencimento: string; valor_nominal: number; valor_total_cobrar: number
  valor_correcao: number; valor_multa: number; valor_juros_mora: number
  status: ParcelaStatus; pago_em?: string; valor_pago: number
  forma_pagamento?: string; dias_atraso: number
}

type ParcelaStats = {
  abertas: string; atrasadas: string; pagas: string
  valor_aberto: string; valor_atrasado: string
  valor_recebido: string; vencendo_30d: string
}

type Contrato = {
  id: string; numero: string; comprador_nome: string; comprador_cpf?: string
  lot_id?: string; lot_number?: string; quadra?: string
  valor_total: number; parcelas_count: number; status: string
  parcelas_total: number; parcelas_pagas: number; parcelas_atrasadas: number
  valor_recebido: number
}

type ContratoStats = {
  rascunhos: string; aguardando: string; assinados: string
  distratados: string; quitados: string; carteira_total: string
}

type ProjecaoData = {
  fluxo: { mes: string; total_parcelas: number; valor_previsto: number; valor_realizado: number; atrasadas: number; pagas: number }[]
  safra: { safra: string; contratos: number; valor_total_carteira: number; recebido: number }[]
}

type Cobranca = {
  id: string; parcela_id: string; contrato_id: string; canal: string; status: string
  mensagem?: string; created_at: string; parcela_numero: number
  vencimento: string; valor_nominal: number; criado_por_nome?: string
}

type Acordo = {
  id: string; contrato_id: string; contrato_numero: string; comprador_nome: string
  tipo: string; status: string; descricao?: string
  novo_valor_parcela?: number; desconto_pct?: number
  aprovado_por_nome?: string; aprovado_em?: string
  criado_por_nome?: string; created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(v?: string) { if (!v) return '—'; return new Date(v).toLocaleDateString('pt-BR') }
function fmtMes(v: string) {
  const [y, m] = v.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[Number(m)-1]}/${y.slice(2)}`
}

const PARC_STATUS_META: Record<ParcelaStatus, { label: string; className: string }> = {
  aberta:      { label: 'Em aberto',   className: 'bg-blue-50 text-blue-700 border-blue-200'         },
  atrasada:    { label: 'Atrasada',    className: 'bg-red-50 text-red-700 border-red-200'             },
  paga:        { label: 'Paga',        className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  renegociada: { label: 'Renegociada', className: 'bg-amber-50 text-amber-700 border-amber-200'       },
  cancelada:   { label: 'Cancelada',   className: 'bg-slate-100 text-slate-500 border-slate-200'      },
}

const ACORDO_STATUS: Record<string, { label: string; className: string }> = {
  pendente:  { label: 'Pendente',  className: 'bg-amber-50 text-amber-700 border-amber-200'       },
  aprovado:  { label: 'Aprovado',  className: 'bg-blue-50 text-blue-700 border-blue-200'          },
  recusado:  { label: 'Recusado',  className: 'bg-red-50 text-red-700 border-red-200'             },
  executado: { label: 'Executado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

// ─── BaixaModal ───────────────────────────────────────────────────────────────

function BaixaModal({ parcela, onClose, onSaved }: { parcela: Parcela; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ valor_pago: String(parcela.valor_total_cobrar.toFixed(2)), forma_pagamento: 'PIX', data_pagamento: new Date().toISOString().slice(0,10), observacoes_baixa: '' })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await apiClient.patch(`/parcelas/${parcela.id}/baixar`, { ...form, valor_pago: Number(form.valor_pago) })
      onSaved()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Registrar baixa</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs text-slate-500">{parcela.comprador_nome} — Parcela {parcela.numero} — Venc. {fmtDate(parcela.vencimento)}</p>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-slate-700">Valor recebido (R$)</label>
            <input type="number" value={form.valor_pago} onChange={e => setForm(f=>({...f,valor_pago:e.target.value}))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          <div><label className="mb-1 block text-xs font-medium text-slate-700">Forma de pagamento</label>
            <select value={form.forma_pagamento} onChange={e => setForm(f=>({...f,forma_pagamento:e.target.value}))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
              {['PIX','TED','DOC','Boleto','Dinheiro','Cartão','Cheque'].map(o=><option key={o}>{o}</option>)}
            </select></div>
          <div><label className="mb-1 block text-xs font-medium text-slate-700">Data do pagamento</label>
            <input type="date" value={form.data_pagamento} onChange={e => setForm(f=>({...f,data_pagamento:e.target.value}))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none" /></div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void save()} disabled={saving}
            className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? '...' : 'Confirmar baixa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RecebiveisPage() {
  const [tab, setTab]                   = useState<Tab>('carteira')
  const [contratos, setContratos]       = useState<Contrato[]>([])
  const [contratoStats, setContratoStats] = useState<ContratoStats | null>(null)
  const [parcelas, setParcelas]         = useState<Parcela[]>([])
  const [parcelaStats, setParcelaStats] = useState<ParcelaStats | null>(null)
  const [cobrancas, setCobrancas]       = useState<Cobranca[]>([])
  const [projecao, setProjecao]         = useState<ProjecaoData | null>(null)
  const [acordos, setAcordos]           = useState<Acordo[]>([])
  const [loading, setLoading]           = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')
  const [baixaTarget, setBaixaTarget]   = useState<Parcela | null>(null)
  const [mesesProjecao, setMesesProjecao] = useState(12)

  const loadCarteira = useCallback(async () => {
    const [cRes, sRes] = await Promise.all([
      apiClient.get(`/contratos?status=${statusFilter !== 'all' ? statusFilter : 'assinado'}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
      apiClient.get('/contratos/stats'),
    ])
    setContratos((cRes.data as { data: Contrato[] }).data || [])
    setContratoStats((sRes.data as { data: ContratoStats }).data)
  }, [statusFilter, search])

  const loadParcelas = useCallback(async () => {
    const [pRes, psRes] = await Promise.all([
      apiClient.get(`/parcelas?status=${statusFilter}`),
      apiClient.get('/parcelas/stats'),
    ])
    setParcelas((pRes.data as { data: Parcela[] }).data || [])
    setParcelaStats((psRes.data as { data: ParcelaStats }).data)
  }, [statusFilter])

  const loadCobrancas = useCallback(async () => {
    const res = await apiClient.get('/cobrancas')
    setCobrancas((res.data as { data: Cobranca[] }).data || [])
  }, [])

  const loadProjecao = useCallback(async () => {
    const res = await apiClient.get(`/recebiveis/projecao?meses=${mesesProjecao}`)
    setProjecao((res.data as { data: ProjecaoData }).data)
  }, [mesesProjecao])

  const loadAcordos = useCallback(async () => {
    const res = await apiClient.get('/acordos')
    setAcordos((res.data as { data: Acordo[] }).data || [])
  }, [])

  async function loadTab() {
    setLoading(true)
    try {
      if (tab === 'carteira')  await loadCarteira()
      if (tab === 'parcelas')  await loadParcelas()
      if (tab === 'cobranca')  await loadCobrancas()
      if (tab === 'projecao')  await loadProjecao()
      if (tab === 'acordos')   await loadAcordos()
    } catch { /* ignore */ } finally { setLoading(false) }
  }

  useEffect(() => { void loadTab() }, [tab, statusFilter, mesesProjecao]) // eslint-disable-line

  async function enviarCobrancaBulk(canal: string) {
    if (!confirm(`Disparar cobrança via ${canal.toUpperCase()} para todas as parcelas atrasadas?`)) return
    const res = await apiClient.post('/cobrancas/bulk', { canal, dias_atraso_min: 1, dias_atraso_max: 90 }).catch(() => ({ data: { enviadas: 0 } }))
    alert(`${(res.data as { enviadas: number }).enviadas} cobranças registradas.`)
    void loadCobrancas()
  }

  async function aprovarAcordo(id: string) {
    await apiClient.patch(`/acordos/${id}/aprovar`).catch(() => {})
    void loadAcordos()
  }

  const TABS: [Tab, string][] = [
    ['carteira', 'Carteira'],
    ['parcelas', 'Parcelas'],
    ['cobranca', 'Cobrança'],
    ['projecao', 'Projeção'],
    ['acordos',  'Acordos'],
  ]

  const atrasadasCount = parcelaStats ? Number(parcelaStats.atrasadas) : 0
  const acordosPendentes = acordos.filter(a => a.status === 'pendente').length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Recebíveis</h1>
          <p className="mt-0.5 text-sm text-slate-500">Carteira de contratos, parcelas, cobrança, projeção de fluxo e acordos.</p>
        </div>
        <button onClick={() => void loadTab()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {atrasadasCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>{atrasadasCount}</strong> parcela(s) em atraso — {brl(Number(parcelaStats?.valor_atrasado || 0))} em risco.</span>
          <button onClick={() => { setTab('cobranca') }} className="ml-auto text-xs font-semibold underline">Ver cobrança →</button>
        </div>
      )}

      <div className="flex gap-0 overflow-x-auto rounded-xl border border-slate-200 bg-white w-fit">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setStatusFilter('all') }}
            className={cn('relative whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors',
              tab === key ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
            {label}
            {key === 'acordos' && acordosPendentes > 0 && (
              <span className={cn('ml-1.5 rounded-full px-1.5 text-[10px] font-bold', tab === key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700')}>
                {acordosPendentes}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── CARTEIRA ──────────────────────────────────────────────────── */}
      {tab === 'carteira' && (
        <div className="space-y-4">
          {contratoStats && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Carteira ativa',  value: brl(Number(contratoStats.carteira_total)), color: 'text-slate-900', big: true },
                { label: 'Contratos ativos',value: contratoStats.assinados,                   color: 'text-blue-700'  },
                { label: 'Distratados',     value: contratoStats.distratados,                 color: 'text-red-600'   },
                { label: 'Quitados',        value: contratoStats.quitados,                    color: 'text-emerald-600'},
              ].map(k => (
                <div key={k.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500">{k.label}</p>
                  <p className={cn('mt-1 font-bold', k.big ? 'text-xl' : 'text-2xl', k.color)}>{k.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar comprador, nº, lote..."
                className="bg-transparent text-sm outline-none placeholder:text-slate-400 w-48" />
            </div>
          </div>

          {loading ? <div className="flex justify-center py-10 text-slate-400 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</div> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>{['Contrato','Comprador','Lote','Valor total','Parcelas','Adimplência','Valor recebido','Situação'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contratos.map(c => {
                    const pct = c.parcelas_total > 0 ? Math.round((c.parcelas_pagas / c.parcelas_total) * 100) : 0
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{c.comprador_nome}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.quadra && c.lot_number ? `Qd ${c.quadra} L${c.lot_number}` : c.lot_id || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{brl(c.valor_total)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.parcelas_count}x</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{pct}%</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{c.parcelas_pagas}/{c.parcelas_total}</p>
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{brl(c.valor_recebido)}</td>
                        <td className="px-4 py-3">
                          {c.parcelas_atrasadas > 0 ? (
                            <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                              {c.parcelas_atrasadas} atrasada(s)
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Em dia</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!contratos.length && <div className="py-12 text-center text-sm text-slate-400">Nenhum contrato encontrado</div>}
            </div>
          )}
        </div>
      )}

      {/* ── PARCELAS ─────────────────────────────────────────────────── */}
      {tab === 'parcelas' && (
        <div className="space-y-4">
          {parcelaStats && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Em aberto',     value: brl(Number(parcelaStats.valor_aberto)),   color: 'text-blue-700',    filter: 'aberta'   },
                { label: 'Em atraso',     value: brl(Number(parcelaStats.valor_atrasado)), color: 'text-red-600',     filter: 'atrasada' },
                { label: 'Recebido',      value: brl(Number(parcelaStats.valor_recebido)), color: 'text-emerald-600', filter: 'paga'     },
                { label: 'Vencendo 30d',  value: parcelaStats.vencendo_30d,                color: 'text-amber-600',   filter: 'aberta'   },
              ].map(k => (
                <button key={k.label} onClick={() => setStatusFilter(statusFilter === k.filter ? 'all' : k.filter)}
                  className={cn('rounded-xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition-all',
                    statusFilter === k.filter ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100')}>
                  <p className="text-xs text-slate-500">{k.label}</p>
                  <p className={cn('mt-1 text-lg font-bold', k.color)}>{k.value}</p>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {[['all','Todas'],['aberta','Em aberto'],['atrasada','Atrasadas'],['paga','Pagas']].map(([v,l]) => (
              <button key={v} onClick={() => setStatusFilter(v)}
                className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium',
                  statusFilter === v ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                {l}
              </button>
            ))}
          </div>

          {loading ? <div className="flex justify-center py-10 text-slate-400 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</div> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>{['Contrato','Comprador','Lote','Parcela','Vencimento','Valor','Status','Dias atraso','Ação'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {parcelas.map(p => {
                    const meta = PARC_STATUS_META[p.status]
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.contrato_numero}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{p.comprador_nome}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{p.quadra && p.lot_number ? `Qd ${p.quadra} L${p.lot_number}` : p.lot_id || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 capitalize">{p.tipo} {p.numero > 0 ? `#${p.numero}` : ''}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(p.vencimento)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{brl(p.valor_nominal)}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {p.dias_atraso > 0 ? <span className="text-xs font-semibold text-red-600">{p.dias_atraso}d</span> : <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {(p.status === 'aberta' || p.status === 'atrasada') && (
                            <button onClick={() => setBaixaTarget(p)}
                              className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle className="h-3 w-3" /> Baixar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!parcelas.length && <div className="py-12 text-center text-sm text-slate-400">Nenhuma parcela encontrada</div>}
            </div>
          )}
        </div>
      )}

      {/* ── COBRANÇA ─────────────────────────────────────────────────── */}
      {tab === 'cobranca' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-800">Régua de cobrança — disparo em lote</p>
            <p className="mb-4 text-xs text-slate-500">Registra uma ação de cobrança para todas as parcelas atrasadas no período selecionado.</p>
            <div className="flex flex-wrap gap-2">
              {[['sms','💬 SMS'],['whatsapp','📱 WhatsApp'],['email','✉️ E-mail'],['ligacao','📞 Ligação']].map(([c,l]) => (
                <button key={c} onClick={() => void enviarCobrancaBulk(c)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {l}
                </button>
              ))}
            </div>
          </div>

          {loading ? <div className="flex justify-center py-10 text-slate-400 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" /></div> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">Histórico de contatos ({cobrancas.length})</p>
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>{['Data','Canal','Parcela','Vencimento','Valor','Status','Operador'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cobrancas.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(c.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-700 capitalize">{c.canal}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">#{c.parcela_numero}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(c.vencimento)}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-800">{brl(c.valor_nominal)}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{c.status}</span></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{c.criado_por_nome || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cobrancas.length && <div className="py-12 text-center text-sm text-slate-400">Nenhuma ação de cobrança registrada</div>}
            </div>
          )}
        </div>
      )}

      {/* ── PROJEÇÃO ─────────────────────────────────────────────────── */}
      {tab === 'projecao' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-slate-700">Horizonte:</p>
            {[6,12,24,36].map(m => (
              <button key={m} onClick={() => setMesesProjecao(m)}
                className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium',
                  mesesProjecao === m ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                {m} meses
              </button>
            ))}
          </div>

          {loading || !projecao ? <div className="flex justify-center py-10 text-slate-400 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" /></div> : (
            <>
              <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="mb-4 text-sm font-semibold text-slate-800">Fluxo de recebimentos projetados</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={projecao.fluxo.map(d => ({ ...d, mes: fmtMes(d.mes), valor_previsto: Number(d.valor_previsto), valor_realizado: Number(d.valor_realizado) }))} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v, n) => [brl(Number(v)), n === 'valor_previsto' ? 'Previsto' : 'Realizado']} contentStyle={{ fontSize:12, borderRadius:8, border:'1px solid #e2e8f0' }} />
                    <Bar dataKey="valor_previsto" fill="#bfdbfe" radius={[4,4,0,0]} name="Previsto" />
                    <Bar dataKey="valor_realizado" fill="#3b82f6" radius={[4,4,0,0]} name="Realizado" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {projecao.safra.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <p className="mb-3 text-sm font-semibold text-slate-800">Análise por safra (mês de origem do contrato)</p>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-100">{['Safra','Contratos','Carteira total','Recebido','% adimplência'].map(h => <th key={h} className="pb-2 text-left font-semibold text-slate-500">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                      {projecao.safra.map(s => {
                        const pct = Number(s.valor_total_carteira) > 0 ? (Number(s.recebido) / Number(s.valor_total_carteira) * 100).toFixed(1) : '0'
                        return (
                          <tr key={s.safra} className="hover:bg-slate-50/50">
                            <td className="py-2 font-medium text-slate-800">{fmtMes(s.safra)}</td>
                            <td className="py-2 text-slate-600">{s.contratos}</td>
                            <td className="py-2 font-semibold text-slate-800">{brl(Number(s.valor_total_carteira))}</td>
                            <td className="py-2 text-emerald-700 font-semibold">{brl(Number(s.recebido))}</td>
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                                <span className="text-slate-600">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {projecao.fluxo.length === 0 && (
                <div className="py-12 text-center text-sm text-slate-400">Nenhuma parcela no período selecionado.</div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ACORDOS ──────────────────────────────────────────────────── */}
      {tab === 'acordos' && (
        <div className="space-y-4">
          {acordosPendentes > 0 && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Clock className="h-4 w-4 shrink-0" /><span><strong>{acordosPendentes}</strong> acordo(s) aguardando aprovação.</span>
            </div>
          )}
          {loading ? <div className="flex justify-center py-10 text-slate-400 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" /></div> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>{['Contrato','Comprador','Tipo','Descrição','Status','Aprovado por','Data','Ações'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {acordos.map(a => {
                    const meta = ACORDO_STATUS[a.status] || ACORDO_STATUS.pendente
                    return (
                      <tr key={a.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{a.contrato_numero}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{a.comprador_nome}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 capitalize">{a.tipo.replace(/_/g,' ')}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px] truncate">{a.descricao || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>{meta.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{a.aprovado_por_nome || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(a.created_at)}</td>
                        <td className="px-4 py-3">
                          {a.status === 'pendente' && (
                            <button onClick={() => void aprovarAcordo(a.id)}
                              className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle className="h-3 w-3" /> Aprovar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!acordos.length && <div className="py-12 text-center text-sm text-slate-400">Nenhum acordo registrado</div>}
            </div>
          )}
        </div>
      )}

      {baixaTarget && (
        <BaixaModal parcela={baixaTarget} onClose={() => setBaixaTarget(null)} onSaved={() => { setBaixaTarget(null); void loadParcelas() }} />
      )}
    </div>
  )
}
