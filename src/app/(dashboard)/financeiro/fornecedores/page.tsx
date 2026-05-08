'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Pencil, X, Building2, User, ChevronDown, Check } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface Fornecedor {
  id: number; razao_social: string; nome_fantasia: string | null
  cnpj_cpf: string | null; tipo_pessoa: string; categoria: string | null
  email: string | null; telefone: string | null; empresa: string
  cep: string | null; endereco: string | null; cidade_uf: string | null
  banco_nome: string | null; agencia: string | null; conta: string | null
  tipo_conta: string; chave_pix: string | null; obs: string | null; ativo: boolean
}

const EMPTY: Partial<Fornecedor> = {
  razao_social: '', nome_fantasia: '', cnpj_cpf: '', tipo_pessoa: 'PJ', categoria: '',
  email: '', telefone: '', empresa: 'TODOS', cep: '', endereco: '', cidade_uf: '',
  banco_nome: '', agencia: '', conta: '', tipo_conta: 'Corrente', chave_pix: '', obs: '', ativo: true,
}

const EMPRESAS = ['TODOS', 'LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const CATEGORIAS = ['Serviços', 'Materiais', 'Condomínio / Imóvel', 'Prestador de Serviços (PF)', 'Órgão Público', 'Outros']
const BANCOS_BR = ['001 - Banco do Brasil', '033 - Santander', '104 - Caixa Econômica', '237 - Bradesco', '341 - Itaú', '707 - Daycoval', '260 - Nubank', 'Outro']

export default function FornecedoresPage() {
  const [lista,    setLista]    = useState<Fornecedor[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<number | null>(null)
  const [form,     setForm]     = useState<Partial<Fornecedor>>(EMPTY)
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const [fBusca,    setFBusca]    = useState('')
  const [fEmpresa,  setFEmpresa]  = useState('')
  const [fCategoria,setFCategoria]= useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (fBusca)     params.busca     = fBusca
      if (fEmpresa)   params.empresa   = fEmpresa
      if (fCategoria) params.categoria = fCategoria
      const r = await apiClient.get('/financeiro/fornecedores', { params })
      setLista(r.data.data)
      setTotal(r.data.total)
    } catch { }
    finally { setLoading(false) }
  }, [fBusca, fEmpresa, fCategoria])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditId(null)
    setForm(EMPTY)
    setErrors({})
    setShowForm(true)
  }

  function openEdit(f: Fornecedor) {
    setEditId(f.id)
    setForm({ ...f })
    setErrors({})
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setForm(EMPTY)
    setErrors({})
  }

  function set(key: keyof Fornecedor, val: string | boolean) {
    setForm(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => ({ ...p, [key]: '' }))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!form.razao_social?.trim()) e.razao_social = 'Obrigatório'
    if (!form.empresa)              e.empresa      = 'Obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      if (editId) {
        await apiClient.put(`/financeiro/fornecedores/${editId}`, form)
      } else {
        await apiClient.post('/financeiro/fornecedores', form)
      }
      closeForm()
      load()
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao salvar'
      setErrors({ _geral: msg })
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(f: Fornecedor) {
    try {
      await apiClient.put(`/financeiro/fornecedores/${f.id}`, { ...f, ativo: !f.ativo })
      load()
    } catch { }
  }

  const F = ({ label, name, required, children, half }: {
    label: string; name: string; required?: boolean; children: React.ReactNode; half?: boolean
  }) => (
    <div className={cn('flex flex-col gap-1', half ? 'col-span-1' : 'col-span-1')}>
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500">{errors[name]}</p>}
    </div>
  )

  const inp = 'w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
  const sel = inp

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fornecedores</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} cadastros</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo Fornecedor
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={fBusca} onChange={e => setFBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Buscar por nome ou CNPJ/CPF…"
            className="pl-9 pr-4 py-2 w-full text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400" />
        </div>
        <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
          <option value="">Todas empresas</option>
          {EMPRESAS.filter(e => e !== 'TODOS').map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={fCategoria} onChange={e => setFCategoria(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                {['Razão Social / Fantasia', 'CNPJ/CPF', 'Categoria', 'Empresa', 'Banco', 'Status', 'Ações'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(6)].map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(7)].map((_,j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50+((i*11+j*9)%40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && lista.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-12 text-sm">
                  Nenhum fornecedor cadastrado
                </td></tr>
              )}
              {!loading && lista.map(f => (
                <tr key={f.id} className={cn('border-b border-slate-50 hover:bg-slate-50 transition-colors', !f.ativo && 'opacity-50')}>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-800">{f.razao_social}</p>
                    {f.nome_fantasia && <p className="text-slate-400 text-[10px]">{f.nome_fantasia}</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{f.cnpj_cpf || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{f.categoria || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{f.empresa}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {f.banco_nome ? `${f.banco_nome}${f.agencia ? ` ag.${f.agencia}` : ''}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleAtivo(f)}
                      className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium',
                        f.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                      {f.ativo ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => openEdit(f)}
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

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Campos marcados com * são obrigatórios</p>
              </div>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._geral}</div>
              )}

              {/* Dados principais */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados Principais</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Razão Social" name="razao_social" required>
                    <input className={inp} value={form.razao_social || ''} onChange={e => set('razao_social', e.target.value)} placeholder="Nome completo / razão social" />
                  </F>
                  <F label="Nome Fantasia" name="nome_fantasia">
                    <input className={inp} value={form.nome_fantasia || ''} onChange={e => set('nome_fantasia', e.target.value)} placeholder="Nome fantasia" />
                  </F>
                  <F label="CNPJ / CPF" name="cnpj_cpf">
                    <input className={inp} value={form.cnpj_cpf || ''} onChange={e => set('cnpj_cpf', e.target.value)} placeholder="00.000.000/0000-00" />
                  </F>
                  <F label="Tipo de Pessoa" name="tipo_pessoa" required>
                    <select className={sel} value={form.tipo_pessoa || 'PJ'} onChange={e => set('tipo_pessoa', e.target.value)}>
                      <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                      <option value="PF">Pessoa Física (CPF)</option>
                    </select>
                  </F>
                  <F label="Categoria" name="categoria">
                    <select className={sel} value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}>
                      <option value="">Selecione</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </F>
                  <F label="Empresa" name="empresa" required>
                    <select className={sel} value={form.empresa || 'TODOS'} onChange={e => set('empresa', e.target.value)}>
                      {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </F>
                  <F label="E-mail" name="email">
                    <input className={inp} type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@fornecedor.com" />
                  </F>
                  <F label="Telefone" name="telefone">
                    <input className={inp} value={form.telefone || ''} onChange={e => set('telefone', e.target.value)} placeholder="(11) 99999-9999" />
                  </F>
                </div>
              </div>

              {/* Endereço */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Endereço</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="CEP" name="cep">
                    <input className={inp} value={form.cep || ''} onChange={e => set('cep', e.target.value)} placeholder="00000-000" />
                  </F>
                  <F label="Cidade / UF" name="cidade_uf">
                    <input className={inp} value={form.cidade_uf || ''} onChange={e => set('cidade_uf', e.target.value)} placeholder="São Paulo - SP" />
                  </F>
                  <div className="col-span-2">
                    <F label="Endereço" name="endereco">
                      <input className={inp} value={form.endereco || ''} onChange={e => set('endereco', e.target.value)} placeholder="Rua, número, complemento" />
                    </F>
                  </div>
                </div>
              </div>

              {/* Dados bancários */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados Bancários (para pagamento)</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Banco" name="banco_nome">
                    <select className={sel} value={form.banco_nome || ''} onChange={e => set('banco_nome', e.target.value)}>
                      <option value="">Selecione</option>
                      {BANCOS_BR.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </F>
                  <F label="Tipo de Conta" name="tipo_conta">
                    <select className={sel} value={form.tipo_conta || 'Corrente'} onChange={e => set('tipo_conta', e.target.value)}>
                      <option>Corrente</option>
                      <option>Poupança</option>
                      <option>PIX</option>
                    </select>
                  </F>
                  <F label="Agência" name="agencia">
                    <input className={inp} value={form.agencia || ''} onChange={e => set('agencia', e.target.value)} placeholder="0000" />
                  </F>
                  <F label="Conta / Dígito" name="conta">
                    <input className={inp} value={form.conta || ''} onChange={e => set('conta', e.target.value)} placeholder="00000-0" />
                  </F>
                  <div className="col-span-2">
                    <F label="Chave PIX" name="chave_pix">
                      <input className={inp} value={form.chave_pix || ''} onChange={e => set('chave_pix', e.target.value)} placeholder="CPF, CNPJ, e-mail ou telefone" />
                    </F>
                  </div>
                  <div className="col-span-2">
                    <F label="Observações" name="obs">
                      <textarea className={cn(inp, 'min-h-[60px] resize-none')} value={form.obs || ''} onChange={e => set('obs', e.target.value)} placeholder="Notas adicionais..." />
                    </F>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={closeForm} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg transition-colors disabled:opacity-60">
                {saving ? 'Salvando…' : <><Check className="w-3.5 h-3.5" /> {editId ? 'Atualizar' : 'Salvar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
