'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CheckCircle, ChevronRight, Download,
  Edit3, Loader2, Plus, RefreshCw, Search, X,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

type ContratoStatus = 'rascunho' | 'aguardando_assinatura' | 'assinado' | 'distratado' | 'quitado'
type FinTipo = 'price' | 'sac' | 'avista' | 'permuta'

type Contrato = {
  id: string; numero: string; lead_id?: string; lead_name?: string; lead_phone?: string
  lot_id?: string; lot_number?: string; quadra?: string; area_m2: number
  comprador_nome: string; comprador_cpf?: string; comprador_phone?: string
  valor_total: number; valor_entrada: number; parcelas_count: number
  taxa_juros_mes: number; financiamento_tipo: FinTipo; status: ContratoStatus
  assinado_em?: string; responsavel_name?: string
  parcelas_total: number; parcelas_pagas: number; parcelas_atrasadas: number
  valor_recebido: number; created_at: string
}

type Stats = { rascunhos: string; aguardando: string; assinados: string; distratados: string; quitados: string; carteira_total: string }
type CrmLead = { id: string; name: string; phone: string }
type CrmUser = { id: string; name: string }

type ContratoForm = {
  lead_id: string; lot_id: string; lot_number: string; quadra: string; area_m2: string
  comprador_nome: string; comprador_cpf: string; comprador_phone: string; comprador_email: string
  valor_total: string; valor_entrada: string; parcelas_count: string
  taxa_juros_mes: string; financiamento_tipo: FinTipo; responsavel_id: string; observacoes: string
}

const EMPTY_FORM: ContratoForm = {
  lead_id: '', lot_id: '', lot_number: '', quadra: '', area_m2: '',
  comprador_nome: '', comprador_cpf: '', comprador_phone: '', comprador_email: '',
  valor_total: '', valor_entrada: '', parcelas_count: '120',
  taxa_juros_mes: '0.89', financiamento_tipo: 'price', responsavel_id: '', observacoes: '',
}

function brl(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(v?: string) { if (!v) return '—'; return new Date(v).toLocaleDateString('pt-BR') }

const STATUS_META: Record<ContratoStatus, { label: string; className: string }> = {
  rascunho:             { label: 'Rascunho',           className: 'bg-slate-100 text-slate-600 border-slate-200'         },
  aguardando_assinatura:{ label: 'Aguard. assinatura', className: 'bg-amber-50 text-amber-700 border-amber-200'           },
  assinado:             { label: 'Assinado',           className: 'bg-blue-50 text-blue-700 border-blue-200'             },
  distratado:           { label: 'Distratado',         className: 'bg-red-50 text-red-700 border-red-200'                },
  quitado:              { label: 'Quitado',            className: 'bg-emerald-50 text-emerald-700 border-emerald-200'    },
}

const TEMPLATE_FIELDS = [
  { tag: '{{NOME_COMPRADOR}}',  label: 'Nome do comprador'   },
  { tag: '{{CPF_COMPRADOR}}',   label: 'CPF do comprador'    },
  { tag: '{{VALOR_TOTAL}}',     label: 'Valor total'         },
  { tag: '{{VALOR_ENTRADA}}',   label: 'Valor da entrada'    },
  { tag: '{{QTD_PARCELAS}}',    label: 'Qtd de parcelas'     },
  { tag: '{{VALOR_PARCELA}}',   label: 'Valor da parcela'    },
  { tag: '{{LOTE}}',            label: 'Descrição do lote'   },
  { tag: '{{AREA_LOTE}}',       label: 'Área do lote'        },
  { tag: '{{DATA_CONTRATO}}',   label: 'Data do contrato'    },
  { tag: '{{CORRETOR}}',        label: 'Nome do corretor'    },
]

function NovoContratoModal({ leads, users, onClose, onSaved }: {
  leads: CrmLead[]; users: CrmUser[]; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState<ContratoForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(k: keyof ContratoForm, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleLeadChange(id: string) {
    set('lead_id', id)
    const l = leads.find(l => l.id === id)
    if (l) { set('comprador_nome', l.name); set('comprador_phone', l.phone) }
  }

  const precoNeg = Number(form.valor_total) || 0
  const entrada  = Number(form.valor_entrada) || 0
  const financiado = precoNeg - entrada
  const parcelas = Number(form.parcelas_count) || 1
  const taxa = Number(form.taxa_juros_mes) || 0
  const parcelaVal = form.financiamento_tipo !== 'avista' && parcelas > 0
    ? taxa === 0 ? financiado / parcelas
    : financiado * (taxa/100 * Math.pow(1+taxa/100, parcelas)) / (Math.pow(1+taxa/100, parcelas)-1)
    : 0

  async function handleSave() {
    if (!form.comprador_nome || !form.valor_total) { setError('Nome do comprador e valor total obrigatórios'); return }
    setSaving(true); setError('')
    try {
      await apiClient.post('/contratos', { ...form,
        valor_total: Number(form.valor_total), valor_entrada: Number(form.valor_entrada),
        parcelas_count: Number(form.parcelas_count), taxa_juros_mes: Number(form.taxa_juros_mes),
        area_m2: Number(form.area_m2) || null,
      })
      onSaved()
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Novo Contrato</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Lead / Comprador</label>
              <select value={form.lead_id} onChange={e => handleLeadChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">Selecionar lead...</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Responsável</label>
              <select value={form.responsavel_id} onChange={e => set('responsavel_id', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400">
                <option value="">Nenhum</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Nome do comprador *</label>
              <input value={form.comprador_nome} onChange={e => set('comprador_nome', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">CPF</label>
              <input value={form.comprador_cpf} onChange={e => set('comprador_cpf', e.target.value)} placeholder="000.000.000-00"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
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
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Valor total (R$) *</label>
              <input type="number" value={form.valor_total} onChange={e => set('valor_total', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Entrada (R$)</label>
              <input type="number" value={form.valor_entrada} onChange={e => set('valor_entrada', e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Tipo</label>
              <select value={form.financiamento_tipo} onChange={e => set('financiamento_tipo', e.target.value as FinTipo)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none">
                <option value="price">Price</option><option value="sac">SAC</option>
                <option value="avista">À vista</option><option value="permuta">Permuta</option>
              </select></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Nº parcelas</label>
              <input type="number" value={form.parcelas_count} onChange={e => set('parcelas_count', e.target.value)} min="1"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
            <div><label className="mb-1 block text-xs font-medium text-slate-700">Taxa/mês (%)</label>
              <input type="number" value={form.taxa_juros_mes} onChange={e => set('taxa_juros_mes', e.target.value)} step="0.01"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" /></div>
          </div>
          {precoNeg > 0 && form.financiamento_tipo !== 'avista' && (
            <div className="grid grid-cols-3 gap-2">
              {[['Financiado', brl(financiado)],['Parcela aprox.', brl(parcelaVal)],['Total parcelas', String(parcelas)]].map(([l,v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[10px] text-slate-500">{l}</p>
                  <p className="text-sm font-bold text-slate-800">{v}</p>
                </div>
              ))}
            </div>
          )}
          {error && <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{error}</div>}
        </div>
        <div className="border-t border-slate-100 px-6 py-4 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={() => void handleSave()} disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Criar Contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ContratosPage() {
  const [contratos, setContratos]   = useState<Contrato[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [leads, setLeads]           = useState<CrmLead[]>([])
  const [users, setUsers]           = useState<CrmUser[]>([])
  const [loading, setLoading]       = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]         = useState('')
  const [novoOpen, setNovoOpen]     = useState(false)
  const [tab, setTab]               = useState<'lista' | 'templates'>('lista')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [cRes, sRes, lRes, uRes] = await Promise.all([
        apiClient.get(`/contratos?status=${statusFilter}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
        apiClient.get('/contratos/stats'),
        apiClient.get('/crm/leads'),
        apiClient.get('/crm/users'),
      ])
      setContratos((cRes.data as { data: Contrato[] }).data || [])
      setStats((sRes.data as { data: Stats }).data)
      setLeads((lRes.data as { data: CrmLead[] }).data || [])
      setUsers((uRes.data as { data: CrmUser[] }).data || [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter, search])

  useEffect(() => { void loadAll() }, [loadAll])

  async function assinar(id: string) {
    if (!confirm('Assinar contrato e gerar parcelas?')) return
    await apiClient.patch(`/contratos/${id}/assinar`).catch(() => {})
    void loadAll()
  }

  async function mudarStatus(id: string, status: string) {
    const motivo = status === 'distratado' ? prompt('Motivo do distrato:') || '' : undefined
    await apiClient.patch(`/contratos/${id}/status`, { status, motivo }).catch(() => {})
    void loadAll()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contratos</h1>
          <p className="mt-0.5 text-sm text-slate-500">Gestão de contratos de venda de lotes, assinatura e geração de parcelas.</p>
        </div>
        <button onClick={() => setNovoOpen(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Novo Contrato
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          {[
            { label: 'Rascunhos',   value: stats.rascunhos,  filter: 'rascunho',             color: 'text-slate-600'  },
            { label: 'Aguardando',  value: stats.aguardando, filter: 'aguardando_assinatura', color: 'text-amber-600'  },
            { label: 'Assinados',   value: stats.assinados,  filter: 'assinado',              color: 'text-blue-700'   },
            { label: 'Distratados', value: stats.distratados,filter: 'distratado',            color: 'text-red-600'    },
            { label: 'Quitados',    value: stats.quitados,   filter: 'quitado',               color: 'text-emerald-600'},
          ].map(s => (
            <button key={s.label} onClick={() => setStatusFilter(statusFilter === s.filter ? 'all' : s.filter)}
              className={cn('rounded-xl border bg-white p-4 text-left shadow-sm hover:shadow-md transition-all',
                statusFilter === s.filter ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100')}>
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={cn('mt-1 text-2xl font-bold', s.color)}>{s.value}</p>
            </button>
          ))}
        </div>
      )}

      {stats && (
        <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Carteira total (contratos assinados)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{brl(Number(stats.carteira_total))}</p>
        </div>
      )}

      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white w-fit">
        <button onClick={() => setTab('lista')} className={cn('px-4 py-2 text-sm font-medium', tab === 'lista' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>Contratos</button>
        <button onClick={() => setTab('templates')} className={cn('px-4 py-2 text-sm font-medium', tab === 'templates' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50')}>Tags do template</button>
      </div>

      {tab === 'templates' && (
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-slate-800">Tags disponíveis para o template de contrato</p>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {TEMPLATE_FIELDS.map(f => (
              <div key={f.tag} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-xs text-slate-600">{f.label}</span>
                <code className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-700">{f.tag}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'lista' && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar comprador, nº, lote..."
                className="bg-transparent text-sm outline-none placeholder:text-slate-400 w-52" />
            </div>
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
                  <tr>{['Nº','Comprador','Lote','Valor total','Parcelas','Status','Adimplência','Assinado em','Ações'].map(h => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-slate-600">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {contratos.map(c => {
                    const meta = STATUS_META[c.status]
                    const pct = c.parcelas_total > 0 ? Math.round((c.parcelas_pagas / c.parcelas_total) * 100) : 0
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{c.comprador_nome}</p>
                          <p className="text-xs text-slate-400">{c.comprador_cpf || ''}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {c.quadra && c.lot_number ? `Qd ${c.quadra} L${c.lot_number}` : c.lot_id || '—'}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{brl(c.valor_total)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{c.parcelas_count}x</td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', meta.className)}>
                            {meta.label}
                          </span>
                          {c.parcelas_atrasadas > 0 && (
                            <span className="ml-1 rounded-full bg-red-50 border border-red-200 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              {c.parcelas_atrasadas} atr.
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{pct}%</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">{c.parcelas_pagas}/{c.parcelas_total}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{fmtDate(c.assinado_em)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {(c.status === 'rascunho' || c.status === 'aguardando_assinatura') && (
                              <button onClick={() => void assinar(c.id)}
                                className="rounded-lg bg-blue-50 border border-blue-200 px-2 py-1 text-[10px] font-medium text-blue-700 hover:bg-blue-100">
                                Assinar
                              </button>
                            )}
                            {c.status === 'assinado' && (
                              <button onClick={() => void mudarStatus(c.id, 'distratado')}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200">
                                Distratar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!contratos.length && (
                <div className="py-12 text-center"><CheckCircle className="mx-auto mb-2 h-8 w-8 text-slate-200" /><p className="text-sm text-slate-400">Nenhum contrato encontrado</p></div>
              )}
            </div>
          )}
        </>
      )}

      {novoOpen && <NovoContratoModal leads={leads} users={users} onClose={() => setNovoOpen(false)} onSaved={() => { setNovoOpen(false); void loadAll() }} />}
    </div>
  )
}
