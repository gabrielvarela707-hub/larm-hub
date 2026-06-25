'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { apiClient } from '@/lib/auth-store'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

interface Cliente {
  id: number
  pessoa_id: number
  codigo: string | null
  observacoes: string | null
  nome: string
  razao_social: string | null
  nome_fantasia: string | null
  tipo_pessoa: 'PF' | 'PJ'
  categoria: string | null
  cpf_cnpj: string | null
  rg: string | null
  orgao_emissor_rg: string | null
  inscricao_estadual: string | null
  inscricao_municipal: string | null
  email: string | null
  telefone: string | null
  celular: string | null
  telefone_comercial: string | null
  telefone_residencial: string | null
  fax: string | null
  website: string | null
  contato_nome: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  profissao: string | null
  data_nascimento: string | null
  data_fundacao: string | null
  sexo: string | null
  estado_civil: string | null
  nacionalidade: string | null
  naturalidade: string | null
  ativo: boolean
}

type ClienteForm = Omit<Cliente, 'id' | 'pessoa_id' | 'categoria'>

const EMPTY_FORM: ClienteForm = {
  codigo: '',
  observacoes: '',
  nome: '',
  razao_social: '',
  nome_fantasia: '',
  tipo_pessoa: 'PF',
  cpf_cnpj: '',
  rg: '',
  orgao_emissor_rg: '',
  inscricao_estadual: '',
  inscricao_municipal: '',
  email: '',
  telefone: '',
  celular: '',
  telefone_comercial: '',
  telefone_residencial: '',
  fax: '',
  website: '',
  contato_nome: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  profissao: '',
  data_nascimento: '',
  data_fundacao: '',
  sexo: '',
  estado_civil: '',
  nacionalidade: '',
  naturalidade: '',
  ativo: true,
}

interface FieldProps {
  label: string
  name: keyof ClienteForm
  value: string | boolean | null
  onChange: (name: keyof ClienteForm, value: string | boolean) => void
  type?: string
  placeholder?: string
  className?: string
  maxLength?: number
}

function Field({ label, name, value, onChange, type = 'text', placeholder, className, maxLength }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={typeof value === 'boolean' ? '' : value || ''}
        onChange={event => onChange(name, event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  )
}

function formatCep(value: string) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8)
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits
}

function toForm(cliente: Cliente): ClienteForm {
  const form = { ...EMPTY_FORM }
  for (const key of Object.keys(form) as (keyof ClienteForm)[]) {
    const value = cliente[key]
    if (value !== undefined && value !== null) {
      // Cliente e ClienteForm compartilham os mesmos campos editáveis.
      const normalized = ['data_nascimento', 'data_fundacao'].includes(String(key)) && typeof value === 'string'
        ? value.slice(0, 10)
        : value
      ;(form[key] as string | boolean) = normalized as string | boolean
    }
  }
  return form
}

export default function ClientesPage() {
  const { canWrite } = usePermission('cadastros_clientes')
  const [items, setItems] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [status, setStatus] = useState<'true' | 'false' | 'all'>('true')
  const [ordenacao, setOrdenacao] = useState('nome:asc')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState(false)
  const [nextCodeLoading, setNextCodeLoading] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [form, setForm] = useState<ClienteForm>(EMPTY_FORM)
  const lastCepLookupRef = useRef('')
  const limit = 50
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ordenar, direcao] = ordenacao.split(':')
      const response = await apiClient.get('/cadastros/clientes', {
        params: {
          busca: buscaAplicada || undefined,
          ativo: status,
          ordenar,
          direcao,
          page,
          limit,
        },
      })
      setItems(response.data?.data || [])
      setTotal(Number(response.data?.total || 0))
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível carregar os clientes.')
    } finally {
      setLoading(false)
    }
  }, [buscaAplicada, ordenacao, page, status])

  useEffect(() => { load() }, [load])

  function updateField(name: keyof ClienteForm, value: string | boolean) {
    const normalizedValue = name === 'cep' && typeof value === 'string' ? formatCep(value) : value
    setForm(current => ({ ...current, [name]: normalizedValue }))
  }

  const lookupCep = useCallback(async (cepValue: string) => {
    const digits = String(cepValue || '').replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastCepLookupRef.current) return
    lastCepLookupRef.current = digits
    setCepLoading(true)
    try {
      const response = await apiClient.get(`/cadastros/cep/${digits}`)
      const address = response.data?.data || {}
      setForm(current => ({
        ...current,
        cep: address.cep || formatCep(digits),
        logradouro: address.logradouro || '',
        complemento: address.complemento || current.complemento || '',
        bairro: address.bairro || '',
        cidade: address.cidade || '',
        uf: String(address.uf || '').toUpperCase(),
      }))
    } catch (error: any) {
      lastCepLookupRef.current = ''
      toast.error(error?.response?.data?.message || 'Não foi possível consultar o CEP.')
    } finally {
      setCepLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!modalOpen || viewMode) return
    const digits = String(form.cep || '').replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastCepLookupRef.current) return
    const timer = window.setTimeout(() => void lookupCep(digits), 300)
    return () => window.clearTimeout(timer)
  }, [form.cep, lookupCep, modalOpen, viewMode])

  async function openNew() {
    setEditingId(null)
    setViewMode(false)
    setForm({ ...EMPTY_FORM })
    lastCepLookupRef.current = ''
    setModalOpen(true)
    setNextCodeLoading(true)
    try {
      const response = await apiClient.get('/cadastros/clientes/proximo-codigo')
      setForm(current => ({ ...current, codigo: String(response.data?.data?.codigo || '') }))
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível calcular o próximo código do cliente.')
    } finally {
      setNextCodeLoading(false)
    }
  }

  function openEdit(cliente: Cliente) {
    setEditingId(cliente.id)
    setViewMode(false)
    setForm(toForm(cliente))
    lastCepLookupRef.current = String(cliente.cep || '').replace(/\D/g, '')
    setModalOpen(true)
  }

  function openView(cliente: Cliente) {
    setEditingId(cliente.id)
    setViewMode(true)
    setForm(toForm(cliente))
    lastCepLookupRef.current = String(cliente.cep || '').replace(/\D/g, '')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditingId(null)
    setViewMode(false)
  }

  function applySearch(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    setBuscaAplicada(busca.trim())
  }

  function toggleOrdenacao(campo: 'codigo' | 'nome' | 'categoria') {
    setOrdenacao(atual => {
      const [campoAtual, direcaoAtual] = atual.split(':')
      const proximaDirecao = campoAtual === campo && direcaoAtual === 'asc' ? 'desc' : 'asc'
      return `${campo}:${proximaDirecao}`
    })
    setPage(1)
  }

  function sortIcon(campo: 'codigo' | 'nome' | 'categoria') {
    const [campoAtual, direcaoAtual] = ordenacao.split(':')
    const ativo = campoAtual === campo
    const simbolo = ativo ? (direcaoAtual === 'asc' ? '↑' : '↓') : '↕'

    return (
      <span
        aria-hidden="true"
        className={`ml-1 inline-block min-w-3 text-center text-sm font-bold leading-none ${ativo ? 'text-blue-600' : 'text-slate-400'}`}
      >
        {simbolo}
      </span>
    )
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!form.nome.trim() && !String(form.razao_social || '').trim()) {
      toast.error('Informe o nome ou a razão social.')
      return
    }

    setSaving(true)
    try {
      if (editingId) await apiClient.put(`/cadastros/clientes/${editingId}`, form)
      else await apiClient.post('/cadastros/clientes', form)
      toast.success(editingId ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      setModalOpen(false)
      setEditingId(null)
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível salvar o cliente.')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(cliente: Cliente) {
    if (!window.confirm(`Inativar o cliente “${cliente.nome}”?`)) return
    try {
      await apiClient.delete(`/cadastros/clientes/${cliente.id}`)
      toast.success('Cliente inativado.')
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Não foi possível inativar o cliente.')
    }
  }

  return (
    <div className="space-y-5 p-5 lg:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <UserRound className="h-6 w-6 text-blue-600" /> Clientes
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastro centralizado de identificação, contato e endereço.
          </p>
        </div>
        {canWrite && (
          <button onClick={openNew} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Novo cliente
          </button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={applySearch} className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={event => setBusca(event.target.value)}
              placeholder="Pesquisar nome, documento, e-mail, telefone ou código"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <select
            value={status}
            onChange={event => { setStatus(event.target.value as typeof status); setPage(1) }}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
          >
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
            <option value="all">Todos</option>
          </select>
          <select
            value={ordenacao}
            onChange={event => { setOrdenacao(event.target.value); setPage(1) }}
            aria-label="Ordenar clientes"
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500"
          >
            <option value="nome:asc">Nome: A–Z</option>
            <option value="nome:desc">Nome: Z–A</option>
            <option value="codigo:asc">Código: menor–maior</option>
            <option value="codigo:desc">Código: maior–menor</option>
            <option value="categoria:asc">Categoria: A–Z</option>
            <option value="categoria:desc">Categoria: Z–A</option>
          </select>
          <button type="submit" className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Pesquisar</button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">{total.toLocaleString('pt-BR')} cliente(s)</span>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="min-w-[1160px] w-full text-sm">
            <thead className="sticky top-0 z-20 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
              <tr>
                <th className="px-4 py-3" aria-sort={ordenacao.startsWith('codigo:') ? (ordenacao.endsWith(':asc') ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleOrdenacao('codigo')} className="inline-flex items-center gap-1.5 font-semibold hover:text-blue-600" title="Ordenar por código">
                    Código {sortIcon('codigo')}
                  </button>
                </th>
                <th className="px-4 py-3" aria-sort={ordenacao.startsWith('nome:') ? (ordenacao.endsWith(':asc') ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleOrdenacao('nome')} className="inline-flex items-center gap-1.5 font-semibold hover:text-blue-600" title="Ordenar por nome do cliente">
                    Cliente {sortIcon('nome')}
                  </button>
                </th>
                <th className="px-4 py-3" aria-sort={ordenacao.startsWith('categoria:') ? (ordenacao.endsWith(':asc') ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleOrdenacao('categoria')} className="inline-flex items-center gap-1.5 font-semibold hover:text-blue-600" title="Ordenar por categoria">
                    Categoria {sortIcon('categoria')}
                  </button>
                </th>
                <th className="px-4 py-3">CPF/CNPJ</th>
                <th className="px-4 py-3">E-mail</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Cidade/UF</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!loading && items.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">Nenhum cliente encontrado.</td></tr>
              )}
              {items.map(cliente => (
                <tr key={cliente.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 text-slate-500">{cliente.codigo || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{cliente.nome}</div>
                    {cliente.nome_fantasia && cliente.nome_fantasia !== cliente.nome && <div className="text-xs text-slate-500">{cliente.nome_fantasia}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{cliente.categoria || (cliente.tipo_pessoa === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física')}</td>
                  <td className="px-4 py-3 text-slate-600">{cliente.cpf_cnpj || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{cliente.email || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{cliente.celular || cliente.telefone || cliente.telefone_comercial || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{[cliente.cidade, cliente.uf].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium', cliente.ativo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {cliente.ativo && <Check className="h-3 w-3" />}{cliente.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button title="Visualizar" onClick={() => openView(cliente)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"><Eye className="h-4 w-4" /></button>
                      {canWrite && <button title="Alterar" onClick={() => openEdit(cliente)} className="rounded-md p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>}
                      {canWrite && cliente.ativo && <button title="Inativar" onClick={() => deactivate(cliente)} className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <span className="text-xs text-slate-500">Página {page} de {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-md border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button disabled={page >= totalPages || loading} onClick={() => setPage(value => Math.min(totalPages, value + 1))} className="rounded-md border border-slate-200 p-2 text-slate-600 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{viewMode ? 'Visualizar cliente' : editingId ? 'Editar cliente' : 'Novo cliente'}</h2>
                <p className="text-xs text-slate-500">{viewMode ? 'Consulta completa dos dados cadastrados.' : 'Os dados comuns ficam centralizados e podem ser compartilhados com o perfil de fornecedor.'}</p>
              </div>
              <button onClick={closeModal} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
              <fieldset disabled={viewMode} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 disabled:opacity-90">
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Identificação</h3>
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">Tipo de pessoa</span>
                      <select value={form.tipo_pessoa} onChange={event => updateField('tipo_pessoa', event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500">
                        <option value="PF">Pessoa física</option><option value="PJ">Pessoa jurídica</option>
                      </select>
                    </label>
                    <Field label="Código" name="codigo" value={form.codigo} onChange={updateField} placeholder={nextCodeLoading ? 'Calculando...' : undefined} />
                    <Field label="CPF/CNPJ" name="cpf_cnpj" value={form.cpf_cnpj} onChange={updateField} className="md:col-span-2" />
                    <Field label="Nome *" name="nome" value={form.nome} onChange={updateField} className="md:col-span-2" />
                    <Field label="Razão social" name="razao_social" value={form.razao_social} onChange={updateField} className="md:col-span-2" />
                    <Field label="Nome fantasia" name="nome_fantasia" value={form.nome_fantasia} onChange={updateField} className="md:col-span-2" />
                    <Field label="RG" name="rg" value={form.rg} onChange={updateField} />
                    <Field label="Órgão emissor" name="orgao_emissor_rg" value={form.orgao_emissor_rg} onChange={updateField} />
                    <Field label="Inscrição estadual" name="inscricao_estadual" value={form.inscricao_estadual} onChange={updateField} />
                    <Field label="Inscrição municipal" name="inscricao_municipal" value={form.inscricao_municipal} onChange={updateField} />
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Contato</h3>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="E-mail" name="email" value={form.email} onChange={updateField} type="email" className="md:col-span-2" />
                    <Field label="Contato" name="contato_nome" value={form.contato_nome} onChange={updateField} className="md:col-span-2" />
                    <Field label="Telefone principal" name="telefone" value={form.telefone} onChange={updateField} />
                    <Field label="Celular" name="celular" value={form.celular} onChange={updateField} />
                    <Field label="Telefone comercial" name="telefone_comercial" value={form.telefone_comercial} onChange={updateField} />
                    <Field label="Telefone residencial" name="telefone_residencial" value={form.telefone_residencial} onChange={updateField} />
                    <Field label="Fax" name="fax" value={form.fax} onChange={updateField} />
                    <Field label="Website" name="website" value={form.website} onChange={updateField} className="md:col-span-3" />
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Endereço</h3>
                  <div className="grid gap-3 md:grid-cols-6">
                    <label className="block">
                      <span className="mb-1.5 flex items-center gap-2 text-xs font-medium text-slate-600">CEP {cepLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}</span>
                      <input
                        value={form.cep || ''}
                        onChange={event => updateField('cep', event.target.value)}
                        onBlur={() => void lookupCep(String(form.cep || ''))}
                        inputMode="numeric"
                        maxLength={9}
                        placeholder="00000-000"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <Field label="Logradouro" name="logradouro" value={form.logradouro} onChange={updateField} className="md:col-span-3" />
                    <Field label="Número" name="numero" value={form.numero} onChange={updateField} />
                    <Field label="Complemento" name="complemento" value={form.complemento} onChange={updateField} />
                    <Field label="Bairro" name="bairro" value={form.bairro} onChange={updateField} className="md:col-span-2" />
                    <Field label="Cidade" name="cidade" value={form.cidade} onChange={updateField} className="md:col-span-3" />
                    <Field label="UF" name="uf" value={form.uf} onChange={updateField} maxLength={2} />
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold text-slate-800">Dados complementares</h3>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Profissão" name="profissao" value={form.profissao} onChange={updateField} />
                    <Field label="Data de nascimento" name="data_nascimento" value={form.data_nascimento} onChange={updateField} type="date" />
                    <Field label="Data de fundação" name="data_fundacao" value={form.data_fundacao} onChange={updateField} type="date" />
                    <Field label="Sexo" name="sexo" value={form.sexo} onChange={updateField} maxLength={1} />
                    <Field label="Estado civil" name="estado_civil" value={form.estado_civil} onChange={updateField} />
                    <Field label="Nacionalidade" name="nacionalidade" value={form.nacionalidade} onChange={updateField} />
                    <Field label="Naturalidade" name="naturalidade" value={form.naturalidade} onChange={updateField} className="md:col-span-2" />
                    <label className="md:col-span-4 block">
                      <span className="mb-1.5 block text-xs font-medium text-slate-600">Observações</span>
                      <textarea value={form.observacoes || ''} onChange={event => updateField('observacoes', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.ativo} onChange={event => updateField('ativo', event.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Cliente ativo
                    </label>
                  </div>
                </section>
              </fieldset>

              <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button type="button" onClick={closeModal} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">{viewMode ? 'Fechar' : 'Cancelar'}</button>
                {!viewMode && (
                  <button disabled={saving || nextCodeLoading} type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Salvar
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
