'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, X, Check, Building2, DollarSign } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface BancoConta {
  id: number; empresa: string; banco_nome: string; codigo_banco: string | null
  agencia: string | null; conta: string | null; digito: string | null
  tipo_conta: string; saldo_inicial: number; data_saldo_inicial: string | null
  ativo: boolean; obs: string | null
}

const EMPTY: Partial<BancoConta> = {
  empresa: '', banco_nome: '', codigo_banco: '', agencia: '', conta: '',
  digito: '', tipo_conta: 'Corrente', saldo_inicial: 0,
  data_saldo_inicial: new Date().toISOString().split('T')[0], ativo: true, obs: '',
}

const EMPRESAS = ['LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const BANCOS_BR = [
  { cod: '001', nome: 'Banco do Brasil' }, { cod: '033', nome: 'Santander' },
  { cod: '104', nome: 'Caixa Econômica' }, { cod: '237', nome: 'Bradesco' },
  { cod: '341', nome: 'Itaú' }, { cod: '707', nome: 'Daycoval' },
  { cod: '260', nome: 'Nubank' }, { cod: '077', nome: 'Intermedium/Inter' },
  { cod: 'OTH', nome: 'Outro' },
]

const R$ = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d }
}

export default function BancosPage() {
  const [lista,    setLista]    = useState<BancoConta[]>([])
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<number | null>(null)
  const [form,     setForm]     = useState<Partial<BancoConta>>(EMPTY)
  const [errors,   setErrors]   = useState<Record<string, string>>({})
  const [fEmpresa, setFEmpresa] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (fEmpresa) params.empresa = fEmpresa
      const r = await apiClient.get('/financeiro/bancos', { params })
      setLista(r.data.data)
    } catch { }
    finally { setLoading(false) }
  }, [fEmpresa])

  useEffect(() => { load() }, [load])

  // Calcula totais por empresa
  const porEmpresa = EMPRESAS.map(emp => ({
    emp,
    contas: lista.filter(b => b.empresa === emp),
    saldo:  lista.filter(b => b.empresa === emp).reduce((s, b) => s + (b.saldo_inicial ?? 0), 0),
  })).filter(e => e.contas.length > 0 || !fEmpresa)

  const saldoTotal = lista.reduce((s, b) => s + (b.saldo_inicial ?? 0), 0)

  function openNew() {
    setEditId(null)
    setForm(EMPTY)
    setErrors({})
    setShowForm(true)
  }
  function openEdit(b: BancoConta) {
    setEditId(b.id)
    setForm({ ...b })
    setErrors({})
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditId(null); setForm(EMPTY); setErrors({}) }

  function set(key: keyof BancoConta, val: string | number | boolean) {
    setForm(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => ({ ...p, [key]: '' }))
  }

  function onBancoChange(val: string) {
    const found = BANCOS_BR.find(b => `${b.cod} - ${b.nome}` === val || b.nome === val)
    set('banco_nome', found ? found.nome : val)
    if (found && found.cod !== 'OTH') set('codigo_banco', found.cod)
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.empresa?.trim())    e.empresa    = 'Obrigatório'
    if (!form.banco_nome?.trim()) e.banco_nome = 'Obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      if (editId) {
        await apiClient.put(`/financeiro/bancos/${editId}`, form)
      } else {
        await apiClient.post('/financeiro/bancos', form)
      }
      closeForm()
      load()
    } catch (err: unknown) {
      setErrors({ _geral: (err instanceof Error ? err.message : 'Erro ao salvar') || 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  const inp = 'w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
  const F = ({ label, name, required, children }: { label: string; name: string; required?: boolean; children: React.ReactNode }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500">{errors[name]}</p>}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Bancos e Contas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Contas bancárias das empresas e saldos iniciais</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nova Conta
        </button>
      </div>

      {/* Saldo total */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {EMPRESAS.map(emp => {
          const contas = lista.filter(b => b.empresa === emp && b.ativo)
          const saldo  = contas.reduce((s, b) => s + (b.saldo_inicial ?? 0), 0)
          if (contas.length === 0) return null
          return (
            <div key={emp} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{emp}</p>
              <p className="text-base font-bold text-slate-800">{R$(saldo)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{contas.length} conta{contas.length > 1 ? 's' : ''}</p>
            </div>
          )
        })}
        <div className="bg-[#1e3a5f] rounded-xl p-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-1">Total Consolidado</p>
          <p className="text-base font-bold">{R$(saldoTotal)}</p>
          <p className="text-[10px] opacity-60 mt-0.5">{lista.filter(b => b.ativo).length} contas ativas</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex gap-3 items-center">
        <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
          <option value="">Todas empresas</option>
          {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                {['Empresa','Banco','Código','Agência','Conta','Tipo','Saldo Inicial','Data Saldo Ini.','Status','Ações'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(4)].map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(10)].map((_,j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50+((i*11+j*7)%40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && lista.length === 0 && (
                <tr><td colSpan={10} className="text-center text-slate-400 py-12 text-sm">
                  Nenhuma conta bancária cadastrada. Clique em <b>Nova Conta</b> para começar.
                </td></tr>
              )}
              {!loading && lista.map(b => (
                <tr key={b.id} className={cn('border-b border-slate-50 hover:bg-slate-50 transition-colors', !b.ativo && 'opacity-50')}>
                  <td className="px-3 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-semibold">{b.empresa}</span>
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-800">{b.banco_nome}</td>
                  <td className="px-3 py-2 text-slate-400">{b.codigo_banco || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{b.agencia || '—'}</td>
                  <td className="px-3 py-2 text-slate-600">{b.conta}{b.digito ? `-${b.digito}` : ''}</td>
                  <td className="px-3 py-2 text-slate-500">{b.tipo_conta}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{R$(b.saldo_inicial)}</td>
                  <td className="px-3 py-2 text-slate-400">{fmtDate(b.data_saldo_inicial)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                      b.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                      {b.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => openEdit(b)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editId ? 'Editar Conta' : 'Nova Conta Bancária'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Informe os dados da conta e o saldo inicial</p>
              </div>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._geral}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <F label="Empresa" name="empresa" required>
                  <select className={inp} value={form.empresa || ''} onChange={e => set('empresa', e.target.value)}>
                    <option value="">Selecione</option>
                    {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </F>
                <F label="Banco" name="banco_nome" required>
                  <select className={inp} value={
                    BANCOS_BR.find(b => b.nome === form.banco_nome)
                      ? `${BANCOS_BR.find(b => b.nome === form.banco_nome)?.cod} - ${form.banco_nome}`
                      : form.banco_nome || ''
                  } onChange={e => onBancoChange(e.target.value)}>
                    <option value="">Selecione</option>
                    {BANCOS_BR.map(b => <option key={b.cod} value={`${b.cod} - ${b.nome}`}>{b.cod} - {b.nome}</option>)}
                  </select>
                </F>
                <F label="Código do Banco" name="codigo_banco">
                  <input className={inp} value={form.codigo_banco || ''} onChange={e => set('codigo_banco', e.target.value)} placeholder="000" />
                </F>
                <F label="Tipo de Conta" name="tipo_conta">
                  <select className={inp} value={form.tipo_conta || 'Corrente'} onChange={e => set('tipo_conta', e.target.value)}>
                    <option>Corrente</option>
                    <option>Poupança</option>
                    <option>Investimento</option>
                  </select>
                </F>
                <F label="Agência" name="agencia">
                  <input className={inp} value={form.agencia || ''} onChange={e => set('agencia', e.target.value)} placeholder="0000" />
                </F>
                <F label="Conta" name="conta">
                  <input className={inp} value={form.conta || ''} onChange={e => set('conta', e.target.value)} placeholder="000000" />
                </F>
                <F label="Dígito" name="digito">
                  <input className={inp} value={form.digito || ''} onChange={e => set('digito', e.target.value)} placeholder="0" maxLength={1} />
                </F>
                <div />
                <F label="Saldo Inicial (R$)" name="saldo_inicial" required>
                  <input className={inp} type="number" step="0.01"
                    value={form.saldo_inicial ?? 0} onChange={e => set('saldo_inicial', parseFloat(e.target.value) || 0)} />
                </F>
                <F label="Data do Saldo Inicial" name="data_saldo_inicial" required>
                  <input className={inp} type="date"
                    value={form.data_saldo_inicial || ''} onChange={e => set('data_saldo_inicial', e.target.value)} />
                </F>
                <div className="col-span-2">
                  <F label="Observações" name="obs">
                    <textarea className={cn(inp, 'min-h-[60px] resize-none')}
                      value={form.obs || ''} onChange={e => set('obs', e.target.value)} placeholder="Notas adicionais..." />
                  </F>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={closeForm} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60">
                {saving ? 'Salvando…' : <><Check className="w-3.5 h-3.5" /> {editId ? 'Atualizar' : 'Salvar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
