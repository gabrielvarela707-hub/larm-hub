'use client'

/**
 * /financeiro/contas-pagar/page.tsx
 *
 * ALTERAÇÕES v2:
 * 1. nf_doc campo número do documento — mínimo 9 dígitos
 * 2. Código do fornecedor — mínimo 6 dígitos
 * 3. Banco de pagamento — dropdown com todos os bancos brasileiros (código + nome)
 * 4. Campos multa, juros e descontos — inputs em cada parcela
 * 5. Cadastro do fornecedor — banco (lista completa), agência, conta, dígito, PIX, telefone, endereço, email
 * 6. Editar e excluir na tela de leitura (lista)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import {
  Plus, Search, Pencil, Trash2, X, ChevronDown, Building2,
  Save, AlertTriangle, ChevronsUpDown,
} from 'lucide-react'
import { addMonths, format } from 'date-fns'
import {
  getContasPagar, createContaPagar, getContasPagarResumo,
  getFornecedores, getBancos, getPlanoContas,
  createFornecedor, updateFornecedor,
  type ContaPagar, type BancoConta, type Fornecedor, type PlanoContas, type Empresa,
} from '@/lib/api/financeiro'
import { apiClient } from '@/lib/auth-store'
import { BANCOS_BR } from '@/lib/bancos-br'

// ─── Tipos ────────────────────────────────────────────────────────────────────
type ParcelaForm = { num: number; data: string; valor: string; multa: string; juros: string; desconto: string }

// ─── Schema formulário lançamento ─────────────────────────────────────────────
const lancSchema = z.object({
  empresa:          z.enum(['LARM', 'LM', 'HOLDING', 'RM']),
  banco_conta_id:   z.coerce.number().optional(),
  fornecedor_id:    z.coerce.number().optional(),
  plano_contas_id:  z.coerce.number().min(1, 'Obrigatório'),
  centro_custo:     z.string().optional(),
  historico:        z.string().min(3, 'Obrigatório'),
  nf_doc:           z.string()
    .optional()
    .refine(v => !v || v.replace(/\D/g, '').length >= 9, { message: 'Mínimo 9 dígitos numéricos' }),
  data_emissao:     z.string().min(1, 'Obrigatório'),
  valor_total:      z.coerce.number().min(0.01, 'Obrigatório'),
  num_parcelas:     z.coerce.number().min(1).max(120),
  data_primeira:    z.string().min(1, 'Obrigatório'),
})
type LancFormData = z.infer<typeof lancSchema>

// ─── Schema formulário fornecedor ─────────────────────────────────────────────
const fornSchema = z.object({
  razao_social:  z.string().min(2, 'Obrigatório'),
  nome_fantasia: z.string().optional(),
  cnpj_cpf:      z.string().optional(),
  tipo_pessoa:   z.enum(['PJ', 'PF']),
  categoria:     z.string().optional(),
  empresa:       z.string().default('TODOS'),
  codigo:        z.string()
    .optional()
    .refine(v => !v || v.replace(/\D/g, '').length >= 6, { message: 'Mínimo 6 dígitos' }),
  // Contato
  email:    z.string().email('E-mail inválido').optional().or(z.literal('')),
  telefone: z.string().optional(),
  // Endereço
  cep:       z.string().optional(),
  endereco:  z.string().optional(),
  cidade_uf: z.string().optional(),
  // Dados bancários
  banco_nome:   z.string().optional(),
  codigo_banco: z.string().optional(),
  agencia:      z.string().optional(),
  conta:        z.string().optional(),
  digito:       z.string().optional(),
  tipo_conta:   z.enum(['Corrente', 'Poupança']).default('Corrente'),
  chave_pix:    z.string().optional(),
  tipo_pix:     z.string().optional(),
  obs:          z.string().optional(),
})
type FornFormData = z.infer<typeof fornSchema>

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { P: 'Pendente', Q: 'Quitado', V: 'Vencido', C: 'Conciliado', X: 'Cancelado', pendente: 'Pendente', pago: 'Pago', vencido: 'Vencido' }
const STATUS_CLS: Record<string, string> = {
  P: 'bg-amber-50 text-amber-700', Q: 'bg-green-50 text-green-700', V: 'bg-red-50 text-red-700',
  C: 'bg-blue-50 text-blue-700', X: 'bg-zinc-100 text-zinc-500',
  pendente: 'bg-amber-50 text-amber-700', pago: 'bg-green-50 text-green-700', vencido: 'bg-red-50 text-red-700',
}

// ─── BancoSelect — searchable dropdown ───────────────────────────────────────
function BancoSelect({
  value, onChange, placeholder = 'Selecione o banco…',
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen]       = useState(false)
  const [busca, setBusca]     = useState('')
  const ref                   = useRef<HTMLDivElement>(null)

  const filtered = BANCOS_BR.filter(b =>
    b.codigo.includes(busca) ||
    b.nome.toLowerCase().includes(busca.toLowerCase())
  ).slice(0, 60)

  const selected = BANCOS_BR.find(b => b.codigo === value)

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={selected ? '' : 'text-zinc-400'}>
          {selected ? `${selected.codigo} — ${selected.nome}` : placeholder}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl">
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por código ou nome…"
              className="w-full px-2 py-1.5 text-sm rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              onClick={() => { onChange(''); setOpen(false); setBusca('') }}
            >
              — Nenhum —
            </button>
            {filtered.map(b => (
              <button
                key={b.codigo}
                type="button"
                onClick={() => { onChange(b.codigo); setOpen(false); setBusca('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 ${value === b.codigo ? 'bg-amber-50 dark:bg-amber-900/20 font-medium' : ''}`}
              >
                <span className="font-mono text-amber-600 mr-2">{b.codigo}</span>
                {b.nome}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-sm text-zinc-400 text-center">Nenhum banco encontrado</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modal fornecedor ─────────────────────────────────────────────────────────
function FornecedorModal({
  forn, onClose, onSaved,
}: { forn: Partial<Fornecedor> | null; onClose: () => void; onSaved: (f: Fornecedor) => void }) {
  const isEdit = !!(forn as Fornecedor)?.id
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FornFormData>({
    resolver: zodResolver(fornSchema),
    defaultValues: {
      razao_social: forn?.razao_social || '',
      nome_fantasia: forn?.nome_fantasia || '',
      cnpj_cpf: forn?.cnpj_cpf || '',
      tipo_pessoa: forn?.tipo_pessoa || 'PJ',
      categoria: forn?.categoria || '',
      empresa: forn?.empresa || 'TODOS',
      codigo: forn?.codigo || '',
      email: forn?.email || '',
      telefone: forn?.telefone || '',
      cep: forn?.cep || '',
      endereco: forn?.endereco || '',
      cidade_uf: forn?.cidade_uf || '',
      banco_nome: forn?.banco_nome || '',
      codigo_banco: forn?.codigo_banco || '',
      agencia: forn?.agencia || '',
      conta: forn?.conta || '',
      digito: forn?.digito || '',
      tipo_conta: forn?.tipo_conta || 'Corrente',
      chave_pix: forn?.chave_pix || '',
      tipo_pix: forn?.tipo_pix || '',
      obs: forn?.obs || '',
    },
  })

  const codigoBanco = watch('codigo_banco')

  const onSubmit = async (values: FornFormData) => {
    setSaving(true)
    try {
      // Preenche banco_nome a partir do código escolhido
      const banco = BANCOS_BR.find(b => b.codigo === values.codigo_banco)
      const payload = { ...values, banco_nome: banco?.nome || values.banco_nome }
      const saved = isEdit
        ? await updateFornecedor((forn as Fornecedor).id, payload)
        : await createFornecedor(payload)
      toast.success(isEdit ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!')
      onSaved(saved)
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {message?: string}}})?.response?.data?.message || 'Erro ao salvar fornecedor')
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-700">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-zinc-900 dark:text-white">
              {isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-5">
          {/* Dados básicos */}
          <div>
            <SectionTitle>Dados do Fornecedor</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Razão Social *" error={errors.razao_social?.message} full>
                <input {...register('razao_social')} className={inputCls} />
              </Field>
              <Field label="Nome Fantasia">
                <input {...register('nome_fantasia')} className={inputCls} />
              </Field>
              <Field label="CNPJ / CPF">
                <input {...register('cnpj_cpf')} className={inputCls} placeholder="00.000.000/0001-00" />
              </Field>
              <Field label="Código Interno" error={errors.codigo?.message}>
                <input {...register('codigo')} className={inputCls} placeholder="Mín. 6 dígitos" />
              </Field>
              <Field label="Tipo Pessoa">
                <select {...register('tipo_pessoa')} className={inputCls}>
                  <option value="PJ">Pessoa Jurídica</option>
                  <option value="PF">Pessoa Física</option>
                </select>
              </Field>
              <Field label="Categoria">
                <input {...register('categoria')} className={inputCls} placeholder="Ex: Serviços, Fornecedor…" />
              </Field>
              <Field label="Empresa">
                <select {...register('empresa')} className={inputCls}>
                  {['TODOS','LARM','LM','HOLDING','RM'].map(e => <option key={e}>{e}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Contato */}
          <div>
            <SectionTitle>Contato</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail" error={errors.email?.message}>
                <input {...register('email')} type="email" className={inputCls} />
              </Field>
              <Field label="Telefone">
                <input {...register('telefone')} className={inputCls} placeholder="(00) 00000-0000" />
              </Field>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <SectionTitle>Endereço</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CEP">
                <input {...register('cep')} className={inputCls} placeholder="00000-000" />
              </Field>
              <Field label="Cidade / UF">
                <input {...register('cidade_uf')} className={inputCls} placeholder="São Paulo / SP" />
              </Field>
              <Field label="Endereço completo" full>
                <input {...register('endereco')} className={inputCls} placeholder="Rua, nº, complemento, bairro" />
              </Field>
            </div>
          </div>

          {/* Dados bancários */}
          <div>
            <SectionTitle>Dados Bancários</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Banco" full>
                <BancoSelect
                  value={codigoBanco || ''}
                  onChange={v => setValue('codigo_banco', v)}
                />
              </Field>
              <Field label="Agência">
                <input {...register('agencia')} className={inputCls} placeholder="0000" />
              </Field>
              <Field label="Conta">
                <input {...register('conta')} className={inputCls} placeholder="00000" />
              </Field>
              <Field label="Dígito">
                <input {...register('digito')} className={inputCls} placeholder="0" maxLength={2} />
              </Field>
              <Field label="Tipo de Conta">
                <select {...register('tipo_conta')} className={inputCls}>
                  <option value="Corrente">Conta Corrente</option>
                  <option value="Poupança">Conta Poupança</option>
                </select>
              </Field>
              <Field label="Tipo Chave PIX">
                <select {...register('tipo_pix')} className={inputCls}>
                  <option value="">Selecione…</option>
                  <option value="CPF_CNPJ">CPF / CNPJ</option>
                  <option value="TELEFONE">Telefone</option>
                  <option value="EMAIL">E-mail</option>
                  <option value="EVP">Chave Aleatória (EVP)</option>
                </select>
              </Field>
              <Field label="Chave PIX" full>
                <input {...register('chave_pix')} className={inputCls} placeholder="CPF, telefone, e-mail ou chave aleatória" />
              </Field>
            </div>
          </div>

          {/* Obs */}
          <div>
            <Field label="Observações">
              <textarea {...register('obs')} className={`${inputCls} h-20 resize-none`} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">
              <Save className="h-4 w-4" />
              {saving ? 'Salvando…' : 'Salvar Fornecedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal confirmação exclusão ───────────────────────────────────────────────
function ConfirmDelete({ onConfirm, onCancel, loading }: { onConfirm: () => void; onCancel: () => void; loading?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Excluir lançamento?</h3>
            <p className="text-sm text-zinc-500 mt-1">Esta ação não pode ser desfeita. Somente lançamentos sem parcelas pagas podem ser excluídos.</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-4 py-2 text-sm rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium disabled:opacity-60">
            {loading ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContasPagarPage() {
  const [tab, setTab]               = useState<'lista' | 'novo'>('lista')
  const [titulos, setTitulos]       = useState<ContaPagar[]>([])
  const [resumo, setResumo]         = useState<{
    a_vencer_30d: number; qtd_a_vencer: number
    vencidos: number; qtd_vencidos: number; pago_mes: number
  } | null>(null)
  const [loading, setLoading]       = useState(false)
  const [busca, setBusca]           = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [page, setPage]             = useState(1)
  const [total, setTotal]           = useState(0)

  // Dados dos selects
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [bancos, setBancos]             = useState<BancoConta[]>([])
  const [planos, setPlanos]             = useState<PlanoContas[]>([])

  // Parcelas do formulário
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([])

  // Estado editar/excluir
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [deletingId, setDeletingId]   = useState<number | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Modal fornecedor
  const [fornModal, setFornModal] = useState<Partial<Fornecedor> | null | false>(false)

  // Banco de pagamento selecionado (banco brasileiro)
  const [bancoPagCodigo, setBancoPagCodigo] = useState('')

  const { register, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<LancFormData>({
    resolver: zodResolver(lancSchema),
    defaultValues: { empresa: 'LARM', num_parcelas: 1, data_emissao: format(new Date(), 'yyyy-MM-dd') },
  })

  const valorTotal   = watch('valor_total')
  const numParcelas  = watch('num_parcelas')
  const dataPrimeira = watch('data_primeira')

  // Recalcula preview das parcelas
  useEffect(() => {
    const n = parseInt(String(numParcelas)) || 1
    const v = parseFloat(String(valorTotal)) || 0
    if (!dataPrimeira || v <= 0) { setParcelas([]); return }
    const vp = v / n
    setParcelas(Array.from({ length: n }, (_, i) => ({
      num: i + 1,
      data: format(addMonths(new Date(dataPrimeira + 'T12:00:00'), i), 'yyyy-MM-dd'),
      valor: vp.toFixed(2),
      multa: '0.00',
      juros: '0.00',
      desconto: '0.00',
    })))
  }, [valorTotal, numParcelas, dataPrimeira])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, res2] = await Promise.all([
        getContasPagar({ page, limit: 20, busca: busca || undefined, status: statusFiltro || undefined }),
        getContasPagarResumo(),
      ])
      setTitulos(res.data)
      setTotal(res.pagination.total)
      setResumo(res2)
    } finally { setLoading(false) }
  }, [page, busca, statusFiltro])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    Promise.all([getFornecedores({ limit: 200 }), getBancos(), getPlanoContas()])
      .then(([f, b, p]) => {
        setFornecedores(f.data)
        setBancos(b)
        setPlanos(p.filter(pl => pl.tipo === 'A'))
      })
  }, [])

  // ─── Submit novo lançamento ───────────────────────────────────────────────
  const onSubmit = async (values: LancFormData) => {
    try {
      const payload = {
        ...values,
        empresa: values.empresa as Empresa,
        parcelas: parcelas.map((p, i) => ({
          num_parcela: i + 1,
          total_parcelas: parcelas.length,
          data_vencimento: p.data,
          valor: parseFloat(p.valor),
          multa: parseFloat(p.multa || '0'),
          juros: parseFloat(p.juros || '0'),
          desconto: parseFloat(p.desconto || '0'),
          banco_conta_id: values.banco_conta_id,
          status: 'P' as const,
        })),
      }
      if (editingId) {
        await apiClient.put(`/financeiro/lancamentos-cp/${editingId}`, payload)
        toast.success('Lançamento atualizado!')
      } else {
        await createContaPagar(payload)
        toast.success('Título lançado com sucesso!')
      }
      reset()
      setEditingId(null)
      setTab('lista')
      load()
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {message?: string}}})?.response?.data?.message || 'Erro ao lançar')
    }
  }

  // ─── Abrir edição ─────────────────────────────────────────────────────────
  const handleEdit = async (t: ContaPagar) => {
    try {
      const { data: detail } = await apiClient.get(`/financeiro/lancamentos-cp/${t.id}`)
      const d = detail.data
      setValue('empresa', d.empresa)
      setValue('banco_conta_id', d.banco_conta_id)
      setValue('fornecedor_id', d.fornecedor_id)
      setValue('historico', d.historico)
      setValue('nf_doc', d.nf_doc || '')
      setValue('data_emissao', d.dt_emissao?.slice(0,10) || '')
      setValue('valor_total', d.valor_total)
      setValue('num_parcelas', d.qtd_parcelas || 1)
      if (d.parcelas?.length) {
        setParcelas(d.parcelas.map((p: { numero: number; vencimento?: string; valor?: number; multa?: number; juros?: number; desconto?: number }) => ({
          num: p.numero,
          data: p.vencimento?.slice(0,10) || '',
          valor: String(p.valor || 0),
          multa: String(p.multa || 0),
          juros: String(p.juros || 0),
          desconto: String(p.desconto || 0),
        })))
        setValue('data_primeira', d.parcelas[0]?.vencimento?.slice(0,10) || '')
      }
      setEditingId(t.id)
      setTab('novo')
    } catch { toast.error('Erro ao carregar lançamento') }
  }

  // ─── Confirmar exclusão ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingId) return
    setDeleteLoading(true)
    try {
      await apiClient.delete(`/financeiro/lancamentos-cp/${deletingId}`)
      toast.success('Lançamento excluído!')
      setDeletingId(null)
      load()
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {message?: string}}})?.response?.data?.message || 'Erro ao excluir')
    } finally { setDeleteLoading(false) }
  }

  const fmtBRL = (v: number) => v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'

  const parcelaValorFinal = (p: ParcelaForm) => {
    const v = parseFloat(p.valor || '0')
    const m = parseFloat(p.multa || '0')
    const j = parseFloat(p.juros || '0')
    const d = parseFloat(p.desconto || '0')
    return v + m + j - d
  }

  return (
    <div className="p-6 space-y-4">
      {/* Cards resumo */}
      {resumo && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'A Vencer (30 dias)', value: fmtBRL(resumo.a_vencer_30d), sub: `${resumo.qtd_a_vencer} títulos`, color: 'text-amber-600' },
            { label: 'Vencidos', value: fmtBRL(resumo.vencidos), sub: `${resumo.qtd_vencidos} em atraso`, color: 'text-red-500' },
            { label: 'Pago no Mês', value: fmtBRL(resumo.pago_mes), sub: 'mês atual', color: 'text-green-600' },
            { label: 'Total Lançamentos', value: total.toString(), sub: 'títulos cadastrados', color: 'text-zinc-900 dark:text-white' },
          ].map(c => (
            <div key={c.label} className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{c.label}</p>
              <p className={`text-xl font-semibold font-mono ${c.color}`}>{c.value}</p>
              <p className="text-xs text-zinc-400 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 w-fit">
        {([['lista', 'Lançamentos'], ['novo', editingId ? 'Editar Lançamento' : 'Novo Lançamento']] as const).map(([t, label]) => (
          <button key={t} onClick={() => { if (t === 'lista') { setEditingId(null); reset() } setTab(t) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── LISTA ── */}
      {tab === 'lista' && (
        <>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input className={`${inputCls} pl-9`} placeholder="Fornecedor, histórico..."
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <select className={inputCls} value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).slice(0,5).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => { setEditingId(null); reset(); setTab('novo') }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              <Plus className="h-4 w-4" /> Novo
            </button>
            <button onClick={() => setFornModal({})}
              className="flex items-center gap-2 px-4 py-2 border border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg text-sm font-medium">
              <Building2 className="h-4 w-4" /> Fornecedor
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 text-xs uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">Emissão</th>
                  <th className="px-3 py-3 text-left">Fornecedor</th>
                  <th className="px-3 py-3 text-left">Histórico</th>
                  <th className="px-3 py-3 text-left">NF/Doc</th>
                  <th className="px-3 py-3 text-left">Empresa</th>
                  <th className="px-3 py-3 text-right">Valor</th>
                  <th className="px-3 py-3 text-center">Parcelas</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-zinc-400">Carregando...</td></tr>
                ) : titulos.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-zinc-400">Nenhum lançamento encontrado</td></tr>
                ) : titulos.map(t => (
                  <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{t.dt_emissao?.slice(0,10) || t.data_emissao?.slice(0,10)}</td>
                    <td className="px-3 py-2.5 max-w-[140px] truncate">{t.fornecedor_nome || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500 max-w-[180px] truncate text-xs">{t.historico}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">{t.nf_doc || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">{t.empresa}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-right text-red-500 font-medium">{fmtBRL(t.valor_total)}</td>
                    <td className="px-3 py-2.5 text-xs text-center">{t.qtd_parcelas || t.num_parcelas || 1}x</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_CLS[t.status] || STATUS_CLS['P']}`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => handleEdit(t)}
                          title="Editar"
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-blue-500">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(t.id)}
                          title="Excluir"
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação simples */}
          {total > 20 && (
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{total} registros</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                  className="px-3 py-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50">
                  ‹ Anterior
                </button>
                <span className="px-3 py-1">Pág. {page} / {Math.ceil(total/20)}</span>
                <button onClick={() => setPage(p => Math.min(Math.ceil(total/20), p+1))} disabled={page >= Math.ceil(total/20)}
                  className="px-3 py-1 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50">
                  Próxima ›
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── NOVO / EDITAR LANÇAMENTO ── */}
      {tab === 'novo' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <section className={card}>
            <SectionTitle>Dados do Título</SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Empresa *" error={errors.empresa?.message}>
                <select {...register('empresa')} className={inputCls}>
                  {['LARM','LM','HOLDING','RM'].map(e => <option key={e}>{e}</option>)}
                </select>
              </Field>

              {/* ▶ Banco de pagamento — listagem completa dos bancos brasileiros */}
              <Field label="Banco de Pagamento">
                <BancoSelect
                  value={bancoPagCodigo}
                  onChange={v => {
                    setBancoPagCodigo(v)
                    // também tenta vincular ao banco cadastrado na empresa
                    const banco = bancos.find(b => b.cod_banco === v || b.codigo_banco === v)
                    if (banco) setValue('banco_conta_id', banco.id)
                  }}
                  placeholder="Selecione o banco…"
                />
              </Field>

              {/* Conta bancária cadastrada (opcional, complementar) */}
              {bancos.length > 0 && (
                <Field label="Conta Bancária Cadastrada" full>
                  <select {...register('banco_conta_id')} className={inputCls}>
                    <option value="">Selecione a conta cadastrada (opcional)…</option>
                    {bancos.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.empresa} — {b.banco} {b.conta}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field label="Fornecedor" full>
                <div className="flex gap-2">
                  <select {...register('fornecedor_id')} className={`${inputCls} flex-1`}>
                    <option value="">Selecione...</option>
                    {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
                  </select>
                  <button type="button" onClick={() => setFornModal({})}
                    className="px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800 text-amber-600 font-medium whitespace-nowrap">
                    + Novo
                  </button>
                </div>
              </Field>

              <Field label="Plano de Contas *" error={errors.plano_contas_id?.message}>
                <select {...register('plano_contas_id')} className={inputCls}>
                  <option value="">Selecione...</option>
                  {planos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>)}
                </select>
              </Field>

              <Field label="Centro de Custo">
                <select {...register('centro_custo')} className={inputCls}>
                  <option value="">Selecione...</option>
                  <option>Administrativo</option>
                  <option>Operacional</option>
                  <option>Fazenda São Luiz do Rio Pequeno</option>
                  <option>Residencial Santa Clara</option>
                </select>
              </Field>

              <Field label="Histórico *" error={errors.historico?.message} full>
                <input {...register('historico')} className={inputCls} placeholder="Descrição do pagamento" />
              </Field>

              {/* ▶ NF/Doc — mínimo 9 dígitos numéricos */}
              <Field label="NF / Nº Documento" error={errors.nf_doc?.message}>
                <input
                  {...register('nf_doc')}
                  className={inputCls}
                  placeholder="Mín. 9 dígitos numéricos"
                />
              </Field>

              <Field label="Data de Emissão *" error={errors.data_emissao?.message}>
                <input {...register('data_emissao')} type="date" className={inputCls} />
              </Field>

              <Field label="Valor Total (R$) *" error={errors.valor_total?.message}>
                <input {...register('valor_total')} type="number" step="0.01" className={inputCls} placeholder="0,00" />
              </Field>
            </div>
          </section>

          {/* ── Parcelamento ── */}
          <section className={card}>
            <SectionTitle>Parcelamento</SectionTitle>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Field label="Nº de Parcelas">
                <select {...register('num_parcelas')} className={inputCls}>
                  {[1,2,3,4,6,12,18,24].map(n => <option key={n} value={n}>{n === 1 ? '1x (à vista)' : `${n}x`}</option>)}
                </select>
              </Field>
              <Field label="Data da 1ª Parcela *" error={errors.data_primeira?.message}>
                <input {...register('data_primeira')} type="date" className={inputCls} />
              </Field>
            </div>

            {parcelas.length > 0 && (
              <div className="space-y-2 mt-2">
                {/* Cabeçalho */}
                <div className="grid grid-cols-[80px_1fr_110px_100px_100px_100px_110px] gap-2 px-3 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  <span>Parcela</span>
                  <span>Vencimento</span>
                  <span className="text-right">Valor (R$)</span>
                  <span className="text-right">Multa</span>
                  <span className="text-right">Juros</span>
                  <span className="text-right">Desconto</span>
                  <span className="text-right">Total</span>
                </div>
                {parcelas.map((p, i) => (
                  <div key={i} className="grid grid-cols-[80px_1fr_110px_100px_100px_100px_110px] gap-2 items-center bg-zinc-50 dark:bg-zinc-900/40 rounded-lg px-3 py-2 border border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400">{p.num}/{parcelas.length}</span>
                    <input
                      type="date" value={p.data}
                      onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x, data:e.target.value} : x))}
                      className={`${inputCls} text-xs py-1.5`}
                    />
                    <input type="number" step="0.01" value={p.valor}
                      onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x, valor:e.target.value} : x))}
                      className={`${inputCls} text-right font-mono text-xs py-1.5`} />
                    {/* ▶ Multa */}
                    <input type="number" step="0.01" value={p.multa}
                      onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x, multa:e.target.value} : x))}
                      className={`${inputCls} text-right font-mono text-xs py-1.5 text-red-500`}
                      placeholder="0.00" />
                    {/* ▶ Juros */}
                    <input type="number" step="0.01" value={p.juros}
                      onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x, juros:e.target.value} : x))}
                      className={`${inputCls} text-right font-mono text-xs py-1.5 text-orange-500`}
                      placeholder="0.00" />
                    {/* ▶ Desconto */}
                    <input type="number" step="0.01" value={p.desconto}
                      onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x, desconto:e.target.value} : x))}
                      className={`${inputCls} text-right font-mono text-xs py-1.5 text-green-600`}
                      placeholder="0.00" />
                    {/* Total calculado */}
                    <span className="text-right font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {fmtBRL(parcelaValorFinal(p))}
                    </span>
                  </div>
                ))}
                {/* Totais */}
                <div className="grid grid-cols-[80px_1fr_110px_100px_100px_100px_110px] gap-2 px-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                  <span></span><span></span>
                  <span className="text-right font-mono">{fmtBRL(parcelas.reduce((s,p)=>s+parseFloat(p.valor||'0'),0))}</span>
                  <span className="text-right font-mono text-red-500">{fmtBRL(parcelas.reduce((s,p)=>s+parseFloat(p.multa||'0'),0))}</span>
                  <span className="text-right font-mono text-orange-500">{fmtBRL(parcelas.reduce((s,p)=>s+parseFloat(p.juros||'0'),0))}</span>
                  <span className="text-right font-mono text-green-600">{fmtBRL(parcelas.reduce((s,p)=>s+parseFloat(p.desconto||'0'),0))}</span>
                  <span className="text-right font-mono text-zinc-900 dark:text-white">{fmtBRL(parcelas.reduce((s,p)=>s+parcelaValorFinal(p),0))}</span>
                </div>
                <p className="text-xs text-zinc-400 px-1">
                  <span className="text-red-400">Multa</span> e <span className="text-orange-400">Juros</span> somam ao valor · <span className="text-green-500">Desconto</span> subtrai
                </p>
              </div>
            )}
          </section>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setTab('lista'); setEditingId(null); reset() }}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50">
              Cancelar
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              <Save className="h-4 w-4" />
              {editingId ? 'Salvar Alterações' : 'Lançar Título'}
            </button>
          </div>
        </form>
      )}

      {/* ── Modal confirmação exclusão ── */}
      {deletingId !== null && (
        <ConfirmDelete
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
          loading={deleteLoading}
        />
      )}

      {/* ── Modal fornecedor ── */}
      {fornModal !== false && (
        <FornecedorModal
          forn={fornModal || null}
          onClose={() => setFornModal(false)}
          onSaved={saved => {
            setFornModal(false)
            // Atualiza lista de fornecedores
            getFornecedores({ limit: 200 }).then(r => setFornecedores(r.data))
            toast.success(`Fornecedor ${saved.razao_social} salvo!`)
          }}
        />
      )}
    </div>
  )
}

// ─── Helpers de estilo ────────────────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const card = 'bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
      {children}
    </h3>
  )
}

function Field({ label, children, error, full }: { label: string; children: React.ReactNode; error?: string; full?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${full ? 'col-span-full' : ''}`}>
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
