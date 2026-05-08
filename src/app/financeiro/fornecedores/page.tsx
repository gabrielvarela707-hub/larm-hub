'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import {
  Plus, Search, Pencil, Trash2, Building2, User, ChevronLeft, ChevronRight
} from 'lucide-react'
import {
  getFornecedores, createFornecedor, updateFornecedor, deleteFornecedor,
  getPlanoContas, type Fornecedor, type PlanoContas
} from '@/lib/api/financeiro'

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  tipo_pessoa:    z.enum(['PJ', 'PF']),
  cnpj_cpf:       z.string().min(11, 'Obrigatório'),
  razao_social:   z.string().min(3, 'Obrigatório'),
  nome_fantasia:  z.string().optional(),
  inscricao_est:  z.string().optional(),
  categoria:      z.string().optional(),
  plano_contas_id: z.coerce.number().optional(),
  // Endereço
  cep:        z.string().optional(),
  logradouro: z.string().optional(),
  numero:     z.string().optional(),
  complemento: z.string().optional(),
  bairro:     z.string().optional(),
  cidade:     z.string().optional(),
  estado:     z.string().optional(),
  // Contato
  telefone:     z.string().optional(),
  whatsapp:     z.string().optional(),
  email:        z.string().email('E-mail inválido').optional().or(z.literal('')),
  site:         z.string().optional(),
  nome_contato: z.string().optional(),
  // Bancário
  banco_pag:      z.string().optional(),
  agencia_pag:    z.string().optional(),
  conta_pag:      z.string().optional(),
  tipo_conta_pag: z.enum(['CC', 'CP']).optional(),
  pix_chave:      z.string().optional(),
  pix_tipo:       z.string().optional(),
  // Config
  ativo:         z.boolean().default(true),
  bloquear_lanc: z.boolean().default(false),
  requer_aprova: z.boolean().default(false),
  limite_aprova: z.coerce.number().default(5000),
  obs:           z.string().optional(),
})
type FormData = z.infer<typeof schema>

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FornecedoresPage() {
  const [tab, setTab]           = useState<'lista' | 'form'>('lista')
  const [fornecedores, setList] = useState<Fornecedor[]>([])
  const [planos, setPlanos]     = useState<PlanoContas[]>([])
  const [loading, setLoading]   = useState(false)
  const [editing, setEditing]   = useState<Fornecedor | null>(null)
  const [busca, setBusca]       = useState('')
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const LIMIT = 20

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo_pessoa: 'PJ', ativo: true, bloquear_lanc: false, requer_aprova: false, limite_aprova: 5000 },
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getFornecedores({ page, limit: LIMIT, busca: busca || undefined })
      setList(res.data)
      setTotal(res.pagination.total)
    } finally {
      setLoading(false)
    }
  }, [page, busca])

  useEffect(() => { load() }, [load])
  useEffect(() => { getPlanoContas().then(setPlanos) }, [])

  const openNew = () => {
    setEditing(null)
    reset({ tipo_pessoa: 'PJ', ativo: true, bloquear_lanc: false, requer_aprova: false, limite_aprova: 5000 })
    setTab('form')
  }

  const openEdit = (f: Fornecedor) => {
    setEditing(f)
    reset(f as any)
    setTab('form')
  }

  const onSubmit = async (values: FormData) => {
    try {
      if (editing) {
        await updateFornecedor(editing.id, values)
        toast.success('Fornecedor atualizado!')
      } else {
        await createFornecedor(values)
        toast.success('Fornecedor cadastrado!')
      }
      setTab('lista')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao salvar')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Desativar este fornecedor?')) return
    await deleteFornecedor(id)
    toast.success('Fornecedor desativado')
    load()
  }

  const pages = Math.ceil(total / LIMIT)

  // Filtra planos analíticos (só tipo A)
  const planosAnaliticos = planos.filter(p => p.tipo === 'A')

  return (
    <div className="p-6 space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 w-fit">
        {(['lista', 'form'] as const).map(t => (
          <button
            key={t}
            onClick={() => t === 'lista' ? setTab('lista') : openNew()}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              tab === t
                ? 'bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {t === 'lista' ? 'Lista' : tab === 'form' && editing ? 'Editar' : 'Novo Cadastro'}
          </button>
        ))}
      </div>

      {/* ── LISTA ── */}
      {tab === 'lista' && (
        <>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                className="pl-9 pr-3 py-2 w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                placeholder="Buscar fornecedor..."
                value={busca}
                onChange={e => { setBusca(e.target.value); setPage(1) }}
              />
            </div>
            <button
              onClick={openNew}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium"
            >
              <Plus className="h-4 w-4" /> Novo
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Razão Social / Nome</th>
                  <th className="px-4 py-3 text-left">CNPJ / CPF</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Telefone</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-zinc-400">Carregando...</td></tr>
                ) : fornecedores.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-zinc-400">Nenhum fornecedor encontrado</td></tr>
                ) : fornecedores.map(f => (
                  <tr key={f.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-4 py-3 font-medium">{f.razao_social}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{f.cnpj_cpf}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                        f.tipo_pessoa === 'PJ'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {f.tipo_pessoa === 'PJ' ? <Building2 className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        {f.tipo_pessoa}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{f.categoria || '—'}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{f.telefone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        f.ativo
                          ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}>
                        {f.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(f)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
                          <Pencil className="h-3.5 w-3.5 text-zinc-400" />
                        </button>
                        <button onClick={() => handleDelete(f.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {pages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <span>{total} fornecedores</span>
              <div className="flex gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {Array.from({ length: Math.min(5, pages) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded border text-xs ${page === p ? 'bg-amber-500 text-white border-amber-500' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50'}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages}
                  className="p-1.5 rounded border border-zinc-200 dark:border-zinc-700 disabled:opacity-40 hover:bg-zinc-50">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── FORMULÁRIO ── */}
      {tab === 'form' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Dados cadastrais */}
          <section className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Dados Cadastrais
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo de Pessoa *">
                <select {...register('tipo_pessoa')} className={input}>
                  <option value="PJ">Pessoa Jurídica</option>
                  <option value="PF">Pessoa Física</option>
                </select>
              </Field>
              <Field label="CNPJ / CPF *" error={errors.cnpj_cpf?.message}>
                <input {...register('cnpj_cpf')} className={input} placeholder="00.000.000/0001-00" />
              </Field>
              <Field label="Razão Social / Nome *" error={errors.razao_social?.message} full>
                <input {...register('razao_social')} className={input} />
              </Field>
              <Field label="Nome Fantasia">
                <input {...register('nome_fantasia')} className={input} />
              </Field>
              <Field label="Inscrição Estadual">
                <input {...register('inscricao_est')} className={input} placeholder="IE ou ISENTO" />
              </Field>
              <Field label="Categoria">
                <select {...register('categoria')} className={input}>
                  <option value="">Selecione...</option>
                  {['Serviços Gerais','Materiais / Insumos','Pessoal / RH','Utilidades','Imóveis / Ocupação','Financeiro / Bancário','Impostos / Tributos','Outros'].map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Plano de Contas Padrão">
                <select {...register('plano_contas_id')} className={input}>
                  <option value="">Selecione...</option>
                  {planosAnaliticos.map(p => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          {/* Endereço */}
          <section className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Endereço
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="CEP"><input {...register('cep')} className={input} placeholder="00000-000" /></Field>
              <div />
              <Field label="Logradouro" full><input {...register('logradouro')} className={input} /></Field>
              <Field label="Número"><input {...register('numero')} className={input} /></Field>
              <Field label="Complemento"><input {...register('complemento')} className={input} /></Field>
              <Field label="Bairro"><input {...register('bairro')} className={input} /></Field>
              <Field label="Cidade"><input {...register('cidade')} className={input} /></Field>
              <Field label="Estado">
                <select {...register('estado')} className={input}>
                  {['SP','RJ','MG','PR','RS','SC','BA','PE','CE','GO','DF'].map(e => <option key={e}>{e}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* Contato */}
          <section className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Contato
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Telefone *" error={errors.telefone?.message}><input {...register('telefone')} className={input} placeholder="(11) 9 0000-0000" /></Field>
              <Field label="WhatsApp"><input {...register('whatsapp')} className={input} /></Field>
              <Field label="E-mail" error={errors.email?.message}><input {...register('email')} className={input} type="email" /></Field>
              <Field label="Site"><input {...register('site')} className={input} /></Field>
              <Field label="Nome do Contato"><input {...register('nome_contato')} className={input} /></Field>
            </div>
          </section>

          {/* Dados bancários */}
          <section className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Dados Bancários para Pagamento
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Banco">
                <select {...register('banco_pag')} className={input}>
                  <option value="">Selecione...</option>
                  {['001 - Banco do Brasil','033 - Santander','104 - Caixa Econômica','237 - Bradesco','341 - Itaú','655 - Daycoval','077 - Inter'].map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Agência"><input {...register('agencia_pag')} className={input} placeholder="0000" /></Field>
              <Field label="Conta / Dígito"><input {...register('conta_pag')} className={input} placeholder="00000-0" /></Field>
              <Field label="Tipo">
                <select {...register('tipo_conta_pag')} className={input}>
                  <option value="CC">Corrente</option>
                  <option value="CP">Poupança</option>
                </select>
              </Field>
              <Field label="Chave PIX"><input {...register('pix_chave')} className={input} /></Field>
              <Field label="Tipo da Chave">
                <select {...register('pix_tipo')} className={input}>
                  <option value="">Selecione...</option>
                  {['CNPJ','CPF','EMAIL','CELULAR','ALEATORIA'].map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
          </section>

          {/* Configurações */}
          <section className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Configurações
            </h3>
            <div className="space-y-3">
              {[
                { name: 'ativo' as const, label: 'Fornecedor ativo' },
                { name: 'bloquear_lanc' as const, label: 'Bloquear novos lançamentos' },
                { name: 'requer_aprova' as const, label: 'Requer aprovação para pagamentos acima do limite' },
              ].map(({ name, label }) => (
                <label key={name} className="flex items-center justify-between py-2.5 border-b border-zinc-100 dark:border-zinc-700 cursor-pointer">
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
                  <input type="checkbox" {...register(name)} className="w-4 h-4 rounded accent-amber-500" />
                </label>
              ))}
              <Field label="Limite para aprovação (R$)">
                <input {...register('limite_aprova')} type="number" className={input} />
              </Field>
              <Field label="Observações" full>
                <textarea {...register('obs')} rows={3} className={`${input} resize-none`} />
              </Field>
            </div>
          </section>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setTab('lista')} className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              {editing ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────
const input = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'

function Field({ label, children, error, full }: {
  label: string; children: React.ReactNode; error?: string; full?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? 'col-span-full' : ''}`}>
      <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</label>
      {children}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
