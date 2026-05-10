'use client'

/**
 * src/app/(dashboard)/financeiro/fornecedores/page.tsx
 * → lotemobile2/src/app/(dashboard)/financeiro/fornecedores/page.tsx
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Search, Pencil, X, Check, Loader2,
  Building2, User, History, FileText,
  AlertTriangle, CheckCircle2, Clock, TrendingDown,
} from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Fornecedor {
  id: number
  razao_social: string; nome_fantasia: string | null
  cnpj_cpf: string | null; tipo_pessoa: string; categoria: string | null
  email: string | null; telefone: string | null; empresa: string
  cep: string | null; endereco: string | null; cidade_uf: string | null
  banco_nome: string | null; agencia: string | null; conta: string | null
  tipo_conta: string; chave_pix: string | null; obs: string | null; ativo: boolean
}

interface HistoricoItem {
  id: number; descricao: string; vencimento: string; valor: number
  status: 'pago' | 'aberto' | 'vencido'; pago_em: string | null; empresa: string
}

interface HistoricoResumo {
  total_contas: number; total_pago: number; total_aberto: number; total_vencido: number
  itens: HistoricoItem[]
}

// ─── Constants ────────────────────────────────────────────────────────────────
const EMPTY: Partial<Fornecedor> = {
  razao_social: '', nome_fantasia: '', cnpj_cpf: '', tipo_pessoa: 'PJ', categoria: '',
  email: '', telefone: '', empresa: 'TODOS', cep: '', endereco: '', cidade_uf: '',
  banco_nome: '', agencia: '', conta: '', tipo_conta: 'Corrente', chave_pix: '', obs: '', ativo: true,
}

const EMPRESAS   = ['TODOS', 'LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const CATEGORIAS = ['Serviços', 'Materiais', 'Condomínio / Imóvel', 'Prestador de Serviços (PF)', 'Órgão Público', 'Outros']
const BANCOS_BR  = ['001 - Banco do Brasil', '033 - Santander', '104 - Caixa Econômica',
                    '237 - Bradesco', '341 - Itaú', '260 - Nubank', '756 - Sicoob',
                    '748 - Sicredi', '707 - Daycoval', 'Outro']

// ─── Masks ────────────────────────────────────────────────────────────────────
function maskCNPJ(v: string) {
  return v.replace(/\D/g,'').slice(0,14)
    .replace(/(\d{2})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1/$2')
    .replace(/(\d{4})(\d)/,'$1-$2')
}
function maskCPF(v: string) {
  return v.replace(/\D/g,'').slice(0,11)
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1-$2')
}
function maskCEP(v: string) {
  return v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2')
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g,'').slice(0,11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d)/,'($1) $2-$3')
  return d.replace(/(\d{2})(\d{5})(\d)/,'($1) $2-$3')
}
function onlyDigits(v: string) { return v.replace(/\D/g,'') }
function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── MaskedInput ─────────────────────────────────────────────────────────────
// TOTALMENTE NÃO-CONTROLADO: nunca passa value= para o <input>.
// Usa ref para ler/escrever o DOM diretamente — zero re-render durante a digitação.
// Quando o valor externo muda (ex: BrasilAPI preenche), atualiza o DOM via ref.
function MaskedInput({
  externalValue, onCommit, onComplete, mask, placeholder, className, inputMode, icon,
}: {
  externalValue: string          // valor vindo do pai (para sync externo)
  onCommit: (v: string) => void  // notifica o pai do novo valor
  onComplete?: (v: string) => void
  mask: (v: string) => string
  placeholder?: string
  className?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  icon?: React.ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)

  // Aplica valor externo no DOM (BrasilAPI / ViaCEP preenche os campos)
  // Só atualiza se diferente do que está no input para não travar o cursor
  useEffect(() => {
    if (ref.current && mask(ref.current.value) !== mask(externalValue)) {
      ref.current.value = mask(externalValue)
    }
  }, [externalValue, mask])

  return (
    <div className="relative">
      <input
        ref={ref}
        defaultValue={mask(externalValue)}
        className={cn(className, icon && 'pr-8')}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={e => {
          // Aplica máscara diretamente no DOM — sem setState, sem re-render.
          // Mantém o cursor no final para evitar perder dígitos quando a máscara insere ./-
          const masked = mask(e.target.value)
          e.target.value = masked
          try { e.target.setSelectionRange(masked.length, masked.length) } catch {}
          // Notifica o pai (cause re-render do pai, mas não deste input)
          onCommit(masked)
          const digits = masked.replace(/\D/g, '')
          if (onComplete && (digits.length === 14 || digits.length === 8)) onComplete(masked)
        }}
      />
      {icon && <span className="absolute right-2.5 top-1/2 -translate-y-1/2">{icon}</span>}
    </div>
  )
}



// ─── Field Wrapper (FORA do componente — identidade estável, evita perda de foco) ──
function Field({
  label, name, required, children, errors, col2,
}: {
  label: string; name: string; required?: boolean
  children: React.ReactNode
  errors: Record<string, string>
  col2?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-1', col2 && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500 mt-0.5">{errors[name]}</p>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function FornecedoresPage() {
  const [lista,    setLista]    = useState<Fornecedor[]>([])
  const [total,    setTotal]    = useState(0)
  const [loading,  setLoading]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId,   setEditId]   = useState<number | null>(null)
  const [form,     setForm]     = useState<Partial<Fornecedor>>(EMPTY)
  const [errors,   setErrors]   = useState<Record<string, string>>({})
  const [formTab,  setFormTab]  = useState<'dados' | 'historico'>('dados')

  // Lookups
  const [cnpjLoading,  setCnpjLoading]  = useState(false)
  const [cepLoading,   setCepLoading]   = useState(false)
  const [cnpjStatus,   setCnpjStatus]   = useState<'idle'|'ok'|'err'>('idle')
  const [cnpjDupError, setCnpjDupError] = useState('')

  // Histórico
  const [historico,    setHistorico]    = useState<HistoricoResumo | null>(null)
  const [histLoading,  setHistLoading]  = useState(false)

  // Filtros
  const [fBusca,    setFBusca]    = useState('')
  const [fEmpresa,  setFEmpresa]  = useState('')
  const [fCategoria,setFCategoria]= useState('')

  // Prevent re-render on every keystroke: use uncontrolled input + ref pattern for masks

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string,string> = {}
      if (fBusca)     params.busca     = fBusca
      if (fEmpresa)   params.empresa   = fEmpresa
      if (fCategoria) params.categoria = fCategoria
      const r = await apiClient.get('/financeiro/fornecedores', { params })
      setLista(r.data.data ?? [])
      setTotal(r.data.total ?? 0)
    } catch { } finally { setLoading(false) }
  }, [fBusca, fEmpresa, fCategoria])

  useEffect(() => { load() }, [load])

  // ── BrasilAPI CNPJ lookup ──────────────────────────────────────────────────
  async function lookupCNPJ(raw: string) {
    const digits = onlyDigits(raw)
    if (digits.length !== 14) return
    setCnpjLoading(true); setCnpjStatus('idle'); setCnpjDupError('')
    try {
      // Check uniqueness first
      const dupCheck = await apiClient.get('/financeiro/fornecedores/check-cnpj', {
        params: { cnpj: digits, exclude_id: editId ?? '' }
      }).catch(() => null)
      if (dupCheck?.data?.exists) {
        setCnpjDupError('CNPJ já cadastrado no sistema')
        setCnpjStatus('err')
        return
      }

      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!resp.ok) throw new Error('não encontrado')
      const d = await resp.json()

      setForm(p => ({
        ...p,
        razao_social: d.razao_social ?? p.razao_social,
        nome_fantasia: d.nome_fantasia || p.nome_fantasia,
        email:    d.email    || p.email,
        telefone: d.ddd_telefone_1
          ? maskPhone(d.ddd_telefone_1.replace(/\D/g,''))
          : p.telefone,
        cep:      d.cep ? maskCEP(d.cep) : p.cep,
        endereco: [d.logradouro, d.numero, d.complemento, d.bairro].filter(Boolean).join(', ') || p.endereco,
        cidade_uf: d.municipio && d.uf ? `${d.municipio} - ${d.uf}` : p.cidade_uf,
      }))
      setCnpjStatus('ok')
    } catch {
      setCnpjStatus('err')
    } finally {
      setCnpjLoading(false)
    }
  }

  // ── ViaCEP lookup ──────────────────────────────────────────────────────────
  async function lookupCEP(raw: string) {
    const digits = onlyDigits(raw)
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const d = await resp.json()
      if (d.erro) return
      setForm(p => ({
        ...p,
        endereco:  [d.logradouro, d.bairro].filter(Boolean).join(', ') || p.endereco,
        cidade_uf: d.localidade && d.uf ? `${d.localidade} - ${d.uf}` : p.cidade_uf,
      }))
    } catch { } finally { setCepLoading(false) }
  }

  // ── Histórico ──────────────────────────────────────────────────────────────
  async function loadHistorico(id: number) {
    setHistLoading(true)
    try {
      const r = await apiClient.get(`/financeiro/fornecedores/${id}/historico`)
      setHistorico(r.data.data)
    } catch {
      setHistorico({ total_contas: 0, total_pago: 0, total_aberto: 0, total_vencido: 0, itens: [] })
    } finally { setHistLoading(false) }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function openNew() {
    setEditId(null); setForm(EMPTY); setErrors({})
    setCnpjStatus('idle'); setCnpjDupError(''); setFormTab('dados')
    setHistorico(null); setShowForm(true)
  }

  function openEdit(f: Fornecedor) {
    setEditId(f.id); setForm({ ...f }); setErrors({})
    setCnpjStatus('idle'); setCnpjDupError(''); setFormTab('dados')
    setHistorico(null); setShowForm(true)
  }

  function closeForm() {
    setShowForm(false); setEditId(null); setForm(EMPTY)
    setErrors({}); setCnpjStatus('idle'); setCnpjDupError('')
    setHistorico(null)
  }

  function set(key: keyof Fornecedor, val: string | boolean) {
    setForm(p => ({ ...p, [key]: val }))
    if (errors[key]) setErrors(p => ({ ...p, [key]: '' }))
  }

  function validate() {
    const e: Record<string,string> = {}
    if (!form.razao_social?.trim()) e.razao_social = 'Obrigatório'
    if (!form.empresa)               e.empresa      = 'Obrigatório'
    if (cnpjDupError)                e.cnpj_cpf     = cnpjDupError
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
      closeForm(); load()
    } catch (err: unknown) {
      const msg = (err as {response?: {data?: {message?: string}}})
        .response?.data?.message ?? 'Erro ao salvar'
      if (msg.toLowerCase().includes('cnpj') || msg.toLowerCase().includes('cpf')) {
        setErrors({ cnpj_cpf: msg })
        setFormTab('dados')
      } else {
        setErrors({ _geral: msg })
      }
    } finally { setSaving(false) }
  }

  async function toggleAtivo(f: Fornecedor) {
    try {
      await apiClient.put(`/financeiro/fornecedores/${f.id}`, { ...f, ativo: !f.ativo })
      load()
    } catch { }
  }

  // ── Helpers UI ─────────────────────────────────────────────────────────────
  // Field wrapper (defined at module level below to avoid re-render on focus loss)

  const inp = 'w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors'
  const sel = inp

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fornecedores</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} cadastros</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-sm font-semibold rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Novo Fornecedor
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
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700">
          <option value="">Todas empresas</option>
          {EMPRESAS.filter(e => e !== 'TODOS').map(e => <option key={e}>{e}</option>)}
        </select>
        <select value={fCategoria} onChange={e => setFCategoria(e.target.value)}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700">
          <option value="">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                {['Razão Social / Fantasia','CNPJ/CPF','Categoria','Empresa','Banco','Status','Ações'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-semibold text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(5)].map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(7)].map((_,j) => (
                    <td key={j} className="px-3 py-3">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{width:`${50+((i*11+j*9)%40)}%`}} />
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
                    <p className="font-medium text-slate-800 text-xs">{f.razao_social}</p>
                    {f.nome_fantasia && <p className="text-slate-400 text-[10px]">{f.nome_fantasia}</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{f.cnpj_cpf || '—'}</td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{f.categoria || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{f.empresa}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">
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

      {/* ── Modal Form ─────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-8">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">{editId ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Campos com * são obrigatórios</p>
              </div>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6">
              {[
                { id: 'dados', label: 'Dados', icon: Building2 },
                { id: 'historico', label: 'Histórico', icon: History,
                  onClick: () => { if (editId) loadHistorico(editId) } },
              ].map(t => (
                <button key={t.id}
                  onClick={() => { setFormTab(t.id as 'dados'|'historico'); t.onClick?.() }}
                  className={cn('flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                    formTab === t.id
                      ? 'border-[#1e3a5f] text-[#1e3a5f]'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  )}>
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.id === 'historico' && !editId && (
                    <span className="ml-1 text-[10px] text-slate-400">(salve primeiro)</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab: Dados ── */}
            {formTab === 'dados' && (
              <div className="px-6 py-5 space-y-5 max-h-[65vh] overflow-y-auto">
                {errors._geral && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._geral}</div>
                )}

                {/* DADOS PRINCIPAIS */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados Principais</p>
                  <div className="grid grid-cols-2 gap-3">

                    {/* CNPJ/CPF — primeiro campo com lookup */}
                    <Field label="CNPJ / CPF" name="cnpj_cpf"
                        errors={errors}>
                      <MaskedInput
                        externalValue={form.cnpj_cpf || ''}
                        mask={v => form.tipo_pessoa === 'PF' ? maskCPF(v) : maskCNPJ(v)}
                        onCommit={v => { setForm(p => ({ ...p, cnpj_cpf: v })); setCnpjDupError('') }}
                        onComplete={v => { if (form.tipo_pessoa !== 'PF') lookupCNPJ(onlyDigits(v)) }}
                        inputMode="numeric"
                        placeholder={form.tipo_pessoa === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        className={cn(inp, errors.cnpj_cpf && 'border-red-300')}
                        icon={
                          cnpjLoading ? <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                          : cnpjStatus === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          : (cnpjStatus === 'err' || cnpjDupError) ? <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          : undefined
                        }
                      />
                      {cnpjDupError && <p className="text-[10px] text-red-500 mt-0.5">{cnpjDupError}</p>}
                    </Field>

                    <Field label="Tipo de Pessoa" name="tipo_pessoa" required
                        errors={errors}>
                      <select className={sel} value={form.tipo_pessoa || 'PJ'}
                        onChange={e => { set('tipo_pessoa', e.target.value); setCnpjStatus('idle') }}>
                        <option value="PJ">Pessoa Jurídica (CNPJ)</option>
                        <option value="PF">Pessoa Física (CPF)</option>
                      </select>
                    </Field>

                    <Field label="Razão Social" name="razao_social" required
                        errors={errors}>
                      <input className={cn(inp, errors.razao_social && 'border-red-300')}
                        value={form.razao_social || ''}
                        onChange={e => set('razao_social', e.target.value)}
                        placeholder="Nome completo / razão social" />
                    </Field>

                    <Field label="Nome Fantasia" name="nome_fantasia"
                        errors={errors}>
                      <input className={inp} value={form.nome_fantasia || ''}
                        onChange={e => set('nome_fantasia', e.target.value)}
                        placeholder="Nome fantasia" />
                    </Field>

                    <Field label="Categoria" name="categoria"
                        errors={errors}>
                      <select className={sel} value={form.categoria || ''}
                        onChange={e => set('categoria', e.target.value)}>
                        <option value="">Selecione</option>
                        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>

                    <Field label="Empresa" name="empresa" required
                        errors={errors}>
                      <select className={cn(sel, errors.empresa && 'border-red-300')}
                        value={form.empresa || 'TODOS'}
                        onChange={e => set('empresa', e.target.value)}>
                        {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                      </select>
                    </Field>

                    <Field label="E-mail" name="email"
                        errors={errors}>
                      <input className={inp} type="email" value={form.email || ''}
                        onChange={e => set('email', e.target.value)}
                        placeholder="email@fornecedor.com" />
                    </Field>

                    <Field label="Telefone" name="telefone"
                        errors={errors}>
                      <MaskedInput
                        externalValue={form.telefone || ''}
                        mask={maskPhone}
                        onCommit={v => set('telefone', v)}
                        inputMode="numeric"
                        placeholder="(11) 99999-9999"
                        className={inp}
                      />
                    </Field>
                  </div>
                </div>

                {/* ENDEREÇO */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Endereço</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="CEP" name="cep"
                        errors={errors}>
                      <div className="relative">
                        <MaskedInput
                          externalValue={form.cep || ''}
                          mask={maskCEP}
                          onCommit={v => set('cep', v)}
                          onComplete={v => { if (onlyDigits(v).length === 8) lookupCEP(v) }}
                          inputMode="numeric"
                          placeholder="00000-000"
                          className={inp}
                          icon={cepLoading ? <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" /> : undefined}
                        />
                      </div>
                    </Field>

                    <Field label="Cidade / UF" name="cidade_uf"
                        errors={errors}>
                      <input className={inp} value={form.cidade_uf || ''}
                        onChange={e => set('cidade_uf', e.target.value)}
                        placeholder="São Paulo - SP" />
                    </Field>

                    <Field label="Endereço completo" name="endereco" col2
                        errors={errors}>
                      <input className={inp} value={form.endereco || ''}
                        onChange={e => set('endereco', e.target.value)}
                        placeholder="Rua, número, complemento, bairro" />
                    </Field>
                  </div>
                </div>

                {/* DADOS BANCÁRIOS */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados Bancários</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Banco" name="banco_nome"
                        errors={errors}>
                      <select className={sel} value={form.banco_nome || ''}
                        onChange={e => set('banco_nome', e.target.value)}>
                        <option value="">Selecione</option>
                        {BANCOS_BR.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </Field>

                    <Field label="Tipo de Conta" name="tipo_conta"
                        errors={errors}>
                      <select className={sel} value={form.tipo_conta || 'Corrente'}
                        onChange={e => set('tipo_conta', e.target.value)}>
                        <option>Corrente</option>
                        <option>Poupança</option>
                      </select>
                    </Field>

                    <Field label="Agência" name="agencia"
                        errors={errors}>
                      <input className={inp} value={form.agencia || ''}
                        onChange={e => set('agencia', e.target.value.replace(/\D/g,''))}
                        inputMode="numeric" placeholder="0000" />
                    </Field>

                    <Field label="Conta / Dígito" name="conta"
                        errors={errors}>
                      <input className={inp} value={form.conta || ''}
                        onChange={e => set('conta', e.target.value)}
                        placeholder="00000-0" />
                    </Field>

                    <Field label="Chave PIX" name="chave_pix" col2
                        errors={errors}>
                      <input className={inp} value={form.chave_pix || ''}
                        onChange={e => set('chave_pix', e.target.value)}
                        placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
                    </Field>

                    <Field label="Observações" name="obs" col2
                        errors={errors}>
                      <textarea className={cn(inp, 'min-h-[60px] resize-none')}
                        value={form.obs || ''}
                        onChange={e => set('obs', e.target.value)}
                        placeholder="Notas adicionais…" />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab: Histórico ── */}
            {formTab === 'historico' && (
              <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-4">
                {!editId ? (
                  <p className="text-sm text-slate-400 text-center py-10">
                    Salve o fornecedor primeiro para ver o histórico.
                  </p>
                ) : histLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                  </div>
                ) : historico ? (
                  <>
                    {/* Cards resumo */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: 'Total contas', value: historico.total_contas, icon: FileText,       color: 'bg-blue-50   text-blue-700'   },
                        { label: 'Total pago',   value: fmtMoeda(historico.total_pago),   icon: CheckCircle2,  color: 'bg-green-50  text-green-700'  },
                        { label: 'Em aberto',    value: fmtMoeda(historico.total_aberto), icon: Clock,         color: 'bg-yellow-50 text-yellow-700' },
                        { label: 'Vencido',      value: fmtMoeda(historico.total_vencido),icon: TrendingDown,  color: 'bg-red-50    text-red-700'    },
                      ].map(c => (
                        <div key={c.label} className={cn('rounded-xl p-3 flex items-center gap-3', c.color)}>
                          <c.icon className="w-5 h-5 flex-shrink-0 opacity-70" />
                          <div>
                            <p className="text-[10px] font-semibold uppercase opacity-70">{c.label}</p>
                            <p className="text-sm font-bold">{c.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Tabela de lançamentos */}
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Descrição</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Vencimento</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">Valor</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Status</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Pago em</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historico.itens.length === 0 && (
                            <tr><td colSpan={5} className="text-center text-slate-400 py-8">
                              Nenhum lançamento encontrado
                            </td></tr>
                          )}
                          {historico.itens.map(item => (
                            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-slate-700 max-w-[180px] truncate">{item.descricao}</td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                {new Date(item.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium text-slate-800">
                                {fmtMoeda(item.valor)}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', {
                                  'bg-green-100 text-green-700':  item.status === 'pago',
                                  'bg-yellow-100 text-yellow-700':item.status === 'aberto',
                                  'bg-red-100 text-red-600':      item.status === 'vencido',
                                })}>
                                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                                {item.pago_em
                                  ? new Date(item.pago_em + 'T00:00:00').toLocaleDateString('pt-BR')
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">Clique na aba Histórico para carregar.</p>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={closeForm}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !!cnpjDupError}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg transition-colors disabled:opacity-60">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
                  : <><Check className="w-4 h-4" /> {editId ? 'Atualizar' : 'Salvar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
