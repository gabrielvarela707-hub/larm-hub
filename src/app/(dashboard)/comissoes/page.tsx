'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle, ChevronDown, Loader2,
  Plus, RefreshCw, Search, TrendingUp, Users, X,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ComStatus = 'pendente' | 'elegivel' | 'em_pagamento' | 'pago' | 'suspenso' | 'cancelado'
type CorretorTipo = 'autonomo' | 'imobiliaria'

type Corretor = {
  id: string; tipo: CorretorTipo; nome: string; email?: string; phone?: string
  creci?: string; comissao_pct: number; split_corretor_pct: number
  is_active: boolean; total_vendas: number; total_comissoes: number
  regiao_exclusiva?: string; exclusividade_ativa: boolean
}

type Comissao = {
  id: string; corretor_id: string; corretor_nome: string; corretor_tipo: CorretorTipo
  lot_id?: string; lot_number?: string; quadra?: string; lead_name?: string
  valor_venda: number; comissao_pct: number; comissao_bruta: number
  split_corretor_pct: number; valor_corretor: number; valor_imobiliaria: number
  status: ComStatus; elegivel_em?: string; pago_em?: string
  valor_pago: number; forma_pagamento?: string; created_at: string
}

type Stats = {
  pendentes: string; elegiveis: string; em_pagamento: string; pagas: string
  total_bruto: string; total_corretor: string; total_pago: string; a_pagar: string
}

type CorretorStats = { autonomos: string; imobiliarias: string; com_exclusividade: string; comissao_media: string }

type Tab = 'comissoes' | 'corretores'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(v?: string) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const STATUS_META: Record<ComStatus, { label: string; className: string }> = {
  pendente:     { label: 'Pendente',     className: 'bg-slate-100 text-slate-600 border-slate-200'     },
  elegivel:     { label: 'Elegível',     className: 'bg-emerald-50 text-emerald-700 border-emerald-200'},
  em_pagamento: { label: 'Em pagamento', className: 'bg-blue-50 text-blue-700 border-blue-200'         },
  pago:         { label: 'Pago',         className: 'bg-teal-50 text-teal-700 border-teal-200'         },
  suspenso:     { label: 'Suspenso',     className: 'bg-amber-50 text-amber-700 border-amber-200'      },
  cancelado:    { label: 'Cancelado',    className: 'bg-red-50 text-red-700 border-red-200'            },
}

// ─── NovaComissao Modal ───────────────────────────────────────────────────────

function NovaComissaoModal({ corretores, onClose, onSaved }: {
  corretores: Corretor[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    corretor_id: '', lot_id: '', lot_number: '', quadra: '',
    valor_venda: '', comissao_pct: '', split_corretor_pct: '100',
    elegivel_apos_dias: '30', observacoes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleCorretorChange(id: string) {
    set('corretor_id', id)
    const c = corretores.find(c => c.id === id)
    if (c) {
      set('comissao_pct', String(c.comissao_pct))
      set('split_corretor_pct', String(c.split_corretor_pct))
    }
  }

  const valorVenda      = Number(form.valor_venda) || 0
  const comissaoPct     = Number(form.comissao_pct) || 0
  const splitPct        = Number(form.split_corretor_pct) || 100
  const comissaoBruta   = valorVenda * comissaoPct / 100
  const valorCorretor   = comissaoBruta * splitPct / 100
  const valorImob       = comissaoBruta - valorCorretor

  async function handleSave() {
    if (!form.corretor_id || !form.valor_venda) { setError('Corretor e valor de venda obrigatórios'); return }
    setSaving(true); setError('')
    try {
      await apiClient.post('/comissoes', { ...form,
        valor_venda: Number(form.valor_venda), comissao_pct: Number(form.comissao_pct),
        split_corretor_pct: Number(form.split_corretor_pct), elegivel_apos_dias: Number(form.elegivel_apos_dias),
      })
      onSaved()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Registrar Comissão</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Corretor / Parceiro *</label>
            <select value={form.corretor_id} onChange={e => handleCorretorChange(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
              <option value="">Selecionar...</option>
              {corretores.map(c => (
                <option key={c.id} value={c.id}>{c.nome} — {c.tipo === 'imobiliaria' ? '🏢' : '👤'} {c.comissao_pct}%</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Lote ID</label>
              <input value={form.lot_id} onChange={e => set('lot_id', e.target.value)} placeholder="A-03"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Nº Lote</label>
              <input value={form.lot_number} onChange={e => set('lot_number', e.target.value)} placeholder="03"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Quadra</label>
              <input value={form.quadra} onChange={e => set('quadra', e.target.value)} placeholder="A"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Valor da venda (R$) *</label>
              <input type="number" value={form.valor_venda} onChange={e => set('valor_venda', e.target.value)} placeholder="85000"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Comissão (%)</label>
              <input type="number" value={form.comissao_pct} onChange={e => set('comissao_pct', e.target.value)} step="0.1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Split corretor (%)</label>
              <input type="number" value={form.split_corretor_pct} onChange={e => set('split_corretor_pct', e.target.value)} min="0" max="100"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Elegível após (dias)</label>
              <input type="number" value={form.elegivel_apos_dias} onChange={e => set('elegivel_apos_dias', e.target.value)} min="0"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          {comissaoBruta > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Comissão bruta', value: brl(comissaoBruta), color: 'text-slate-800' },
                { label: '→ Corretor',      value: brl(valorCorretor), color: 'text-emerald-700' },
                { label: '→ Imobiliária',   value: brl(valorImob),     color: 'text-blue-700'   },
              ].map(c => (
                <div key={c.label} className="rounded-lg bg-slate-50 p-2.5">
                  <p className="text-[10px] text-slate-500">{c.label}</p>
                  <p className={cn('text-sm font-bold', c.color)}>{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void handleSave()} disabled={saving}
            className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? '...' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── NovoCorretor Modal ───────────────────────────────────────────────────────

function NovoCorretorModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tipo: 'autonomo', nome: '', email: '', phone: '', creci: '', cpf_cnpj: '',
    regiao_exclusiva: '', exclusividade_ativa: false, comissao_pct: '6',
    split_corretor_pct: '100', observacoes: '',
  })
  const [saving, setSaving] = useState(false)

  function set(k: string, v: string | boolean) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    try {
      await apiClient.post('/corretores', { ...form, comissao_pct: Number(form.comissao_pct), split_corretor_pct: Number(form.split_corretor_pct) })
      onSaved()
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Novo Corretor / Parceiro</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            {[['autonomo','👤 Autônomo'],['imobiliaria','🏢 Imobiliária']].map(([v,l]) => (
              <button key={v} onClick={() => set('tipo', v)}
                className={cn('flex-1 rounded-xl border py-2 text-sm font-medium',
                  form.tipo === v ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                {l}
              </button>
            ))}
          </div>

          <div><label className="mb-1 block text-xs font-medium text-slate-700">Nome *</label>
            <input value={form.nome} onChange={e => set('nome', e.target.value)}
              placeholder={form.tipo === 'imobiliaria' ? 'Imobiliária XYZ' : 'João Silva'}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">E-mail</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Telefone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">CRECI</label>
              <input value={form.creci} onChange={e => set('creci', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">{form.tipo === 'imobiliaria' ? 'CNPJ' : 'CPF'}</label>
              <input value={form.cpf_cnpj} onChange={e => set('cpf_cnpj', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Comissão padrão (%)</label>
              <input type="number" value={form.comissao_pct} onChange={e => set('comissao_pct', e.target.value)} step="0.1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            {form.tipo === 'imobiliaria' && (
              <div><label className="mb-1 block text-xs font-medium text-slate-700">Split corretor (%)</label>
                <input type="number" value={form.split_corretor_pct} onChange={e => set('split_corretor_pct', e.target.value)} min="0" max="100"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            )}
          </div>

          {form.tipo === 'imobiliaria' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Região exclusiva</label>
              <input value={form.regiao_exclusiva} onChange={e => set('regiao_exclusiva', e.target.value)}
                placeholder="Ex.: Pindamonhangaba — Guarulhos"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <div className="mt-2 flex items-center gap-2">
                <button onClick={() => set('exclusividade_ativa', !form.exclusividade_ativa)}
                  className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    form.exclusividade_ativa ? 'bg-blue-600' : 'bg-slate-200')}>
                  <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                    form.exclusividade_ativa ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
                <span className="text-xs text-slate-600">Exclusividade regional ativa</span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void handleSave()} disabled={saving || !form.nome.trim()}
            className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? '...' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ComissoesPage() {
  const [tab, setTab]               = useState<Tab>('comissoes')
  const [comissoes, setComissoes]   = useState<Comissao[]>([])
  const [corretores, setCorretores] = useState<Corretor[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [corretorStats, setCorretorStats] = useState<CorretorStats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [corretorFilter, setCorretorFilter] = useState('all')
  const [search, setSearch]         = useState('')
  const [novaComOpen, setNovaComOpen] = useState(false)
  const [novaCorOpen, setNovaCorOpen] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [comRes, corRes, statsRes, cStatsRes] = await Promise.all([
        apiClient.get(`/comissoes?status=${statusFilter}${corretorFilter !== 'all' ? `&corretor_id=${corretorFilter}` : ''}`),
        apiClient.get('/corretores'),
        apiClient.get('/comissoes/stats'),
        apiClient.get('/corretores/stats'),
      ])
      setComissoes((comRes.data as { data: Comissao[] }).data || [])
      setCorretores((corRes.data as { data: Corretor[] }).data || [])
      setStats((statsRes.data as { data: Stats }).data)
      setCorretorStats((cStatsRes.data as { data: CorretorStats }).data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter, corretorFilter])

  useEffect(() => { void loadAll() }, [loadAll])

  async function marcarPago(id: string) {
    const forma = prompt('Forma de pagamento (PIX, TED, etc.):') || 'PIX'
    await apiClient.patch(`/comissoes/${id}/pagar`, { forma_pagamento: forma }).catch(() => {})
    void loadAll()
  }

  const filtered = comissoes.filter(c => {
    if (!search) return true
    return `${c.corretor_nome} ${c.lot_id} ${c.lead_name}`.toLowerCase().includes(search.toLowerCase())
  })

  const aPagar = stats ? Number(stats.a_pagar) : 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Comissões</h1>
          <p className="mt-0.5 text-sm text-slate-500">Elegibilidade, repasse e split entre corretor e imobiliária parceira.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setNovaCorOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Users className="h-4 w-4" /> Novo Corretor
          </button>
          <button onClick={() => setNovaComOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <Plus className="h-4 w-4" /> Registrar Comissão
          </button>
        </div>
      </div>

      {/* KPI grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[
            { label: 'A pagar (elegível)', value: brl(aPagar),             color: 'text-amber-600'    },
            { label: 'Total pago',         value: brl(Number(stats.total_pago)), color: 'text-emerald-600' },
            { label: 'Comissões brutas',   value: brl(Number(stats.total_bruto)), color: 'text-slate-800' },
            { label: 'Comissão corretor',  value: brl(Number(stats.total_corretor)), color: 'text-blue-600' },
          ].map(k => (
            <div key={k.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className={cn('mt-1 text-xl font-bold', k.color)}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white w-fit">
        <button onClick={() => setTab('comissoes')} className={cn('px-4 py-2 text-sm font-medium', tab === 'comissoes' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
          Comissões
        </button>
        <button onClick={() => setTab('corretores')} className={cn('px-4 py-2 text-sm font-medium', tab === 'corretores' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>
          Corretores & Parceiros {corretorStats && <span className="ml-1 text-xs">({Number(corretorStats.autonomos) + Number(corretorStats.imobiliarias)})</span>}
        </button>
      </div>

      {/* ── COMISSÕES ────────────────────────────────────────────────────── */}
      {tab === 'comissoes' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar corretor, lote..."
                className="bg-transparent text-sm outline-none placeholder:text-slate-400 w-44" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none">
              <option value="all">Todos os status</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={corretorFilter} onChange={e => setCorretorFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none">
              <option value="all">Todos os corretores</option>
              {corretores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button onClick={loadAll} className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-slate-400 text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando...</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/70">
                  <tr>{['Corretor','Lote','Cliente','Valor venda','Comissão bruta','Split','Corretor recebe','Status','Elegível em','Ações'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map(c => {
                    const meta = STATUS_META[c.status]
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{c.corretor_nome}</p>
                          <p className="text-xs text-slate-400">{c.corretor_tipo === 'imobiliaria' ? '🏢 Imobiliária' : '👤 Autônomo'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {c.quadra && c.lot_number ? `Qd ${c.quadra} L${c.lot_number}` : c.lot_id || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.lead_name || '—'}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{brl(c.valor_venda)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{brl(c.comissao_bruta)}</p>
                          <p className="text-xs text-slate-400">{c.comissao_pct}%</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.split_corretor_pct}% / {100 - c.split_corretor_pct}%</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-emerald-700">{brl(c.valor_corretor)}</p>
                          {c.valor_imobiliaria > 0 && <p className="text-xs text-blue-600">+{brl(c.valor_imobiliaria)} imob.</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(c.elegivel_em)}</td>
                        <td className="px-4 py-3">
                          {(c.status === 'elegivel' || c.status === 'em_pagamento') && (
                            <button onClick={() => void marcarPago(c.id)}
                              className="flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                              <CheckCircle className="h-3 w-3" /> Pagar
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="py-12 text-center"><TrendingUp className="mx-auto mb-2 h-8 w-8 text-slate-200" /><p className="text-sm text-slate-400">Nenhuma comissão encontrada</p></div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── CORRETORES ───────────────────────────────────────────────────── */}
      {tab === 'corretores' && (
        <div className="space-y-4">
          {corretorStats && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                { label: 'Autônomos',        value: corretorStats.autonomos,         color: 'text-slate-800' },
                { label: 'Imobiliárias',     value: corretorStats.imobiliarias,      color: 'text-blue-700'  },
                { label: 'Com exclusividade',value: corretorStats.com_exclusividade, color: 'text-amber-600' },
                { label: 'Comissão média',   value: `${Number(corretorStats.comissao_media).toFixed(1)}%`, color: 'text-emerald-700' },
              ].map(k => (
                <div key={k.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500">{k.label}</p>
                  <p className={cn('mt-1 text-xl font-bold', k.color)}>{k.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>{['Corretor / Parceiro','Tipo','CRECI','Comissão','Split','Região','Vendas','Total comissões','Status'].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {corretores.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{c.nome}</p>
                      {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{c.tipo === 'imobiliaria' ? '🏢 Imobiliária' : '👤 Autônomo'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.creci || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{c.comissao_pct}%</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {c.tipo === 'imobiliaria' ? `${c.split_corretor_pct}% / ${100-c.split_corretor_pct}%` : '100%'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[140px] truncate">
                      {c.exclusividade_ativa ? <span className="text-amber-600 font-medium">{c.regiao_exclusiva || 'Sim'}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.total_vendas}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{brl(c.total_comissoes)}</td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                        c.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200')}>
                        {c.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!corretores.length && (
              <div className="py-12 text-center"><Users className="mx-auto mb-2 h-8 w-8 text-slate-200" /><p className="text-sm text-slate-400">Nenhum corretor cadastrado</p></div>
            )}
          </div>
        </div>
      )}

      {novaComOpen && <NovaComissaoModal corretores={corretores} onClose={() => setNovaComOpen(false)} onSaved={() => { setNovaComOpen(false); void loadAll() }} />}
      {novaCorOpen && <NovoCorretorModal onClose={() => setNovaCorOpen(false)} onSaved={() => { setNovaCorOpen(false); void loadAll() }} />}
    </div>
  )
}
