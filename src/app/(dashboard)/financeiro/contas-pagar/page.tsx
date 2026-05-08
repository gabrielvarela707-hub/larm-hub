'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Plus, Search, Check, Pencil } from 'lucide-react'
import { addMonths, format } from 'date-fns'
import {
  getContasPagar, createContaPagar, quitarParcela, getContasPagarResumo,
  getFornecedores, getBancos, getPlanoContas,
  type ContaPagar, type BancoConta, type Fornecedor, type PlanoContas, type Empresa,
} from '@/lib/api/financeiro'

// ─── Schema ───────────────────────────────────────────────────────────────────
const schema = z.object({
  empresa:         z.enum(['LARM', 'LM', 'HOLDING', 'RM']),
  banco_conta_id:  z.coerce.number().optional(),
  fornecedor_id:   z.coerce.number().optional(),
  plano_contas_id: z.coerce.number().min(1, 'Obrigatório'),
  centro_custo:    z.string().optional(),
  historico:       z.string().min(3, 'Obrigatório'),
  nf_doc:          z.string().optional(),
  data_emissao:    z.string().min(1, 'Obrigatório'),
  valor_total:     z.coerce.number().min(0.01, 'Obrigatório'),
  num_parcelas:    z.coerce.number().min(1).max(120),
  data_primeira:   z.string().min(1, 'Obrigatório'),
})
type FormData = z.infer<typeof schema>

const STATUS_LABEL: Record<string, string> = { P: 'Pendente', Q: 'Quitado', V: 'Vencido', C: 'Conciliado', X: 'Cancelado' }
const STATUS_CLS: Record<string, string> = {
  P: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  Q: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  V: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  C: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  X: 'bg-zinc-100 text-zinc-500',
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ContasPagarPage() {
  const [tab, setTab]           = useState<'lista' | 'novo'>('lista')
  const [titulos, setTitulos]   = useState<ContaPagar[]>([])
  const [resumo, setResumo]     = useState<any>(null)
  const [loading, setLoading]   = useState(false)
  const [busca, setBusca]       = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)

  // Selects data
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [bancos, setBancos]             = useState<BancoConta[]>([])
  const [planos, setPlanos]             = useState<PlanoContas[]>([])

  // Parcelas calculadas para preview
  const [parcelas, setParcelas] = useState<{ num: number; data: string; valor: string }[]>([])

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { empresa: 'LARM', num_parcelas: 1, data_emissao: format(new Date(), 'yyyy-MM-dd') },
  })

  const valorTotal    = watch('valor_total')
  const numParcelas   = watch('num_parcelas')
  const dataPrimeira  = watch('data_primeira')

  // Recalcula preview das parcelas
  useEffect(() => {
    const n = parseInt(String(numParcelas)) || 1
    const v = parseFloat(String(valorTotal)) || 0
    if (!dataPrimeira || v <= 0) { setParcelas([]); return }
    const vp = v / n
    const data = Array.from({ length: n }, (_, i) => ({
      num: i + 1,
      data: format(addMonths(new Date(dataPrimeira + 'T12:00:00'), i), 'yyyy-MM-dd'),
      valor: vp.toFixed(2),
    }))
    setParcelas(data)
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
    Promise.all([
      getFornecedores({ limit: 200 }),
      getBancos(),
      getPlanoContas(),
    ]).then(([f, b, p]) => {
      setFornecedores(f.data)
      setBancos(b)
      setPlanos(p.filter(pl => pl.tipo === 'A'))
    })
  }, [])

  const onSubmit = async (values: FormData) => {
    try {
      await createContaPagar({
        ...values,
        empresa: values.empresa as Empresa,
        parcelas: parcelas.map((p, i) => ({
          num_parcela: i + 1,
          total_parcelas: parcelas.length,
          data_vencimento: p.data,
          valor: parseFloat(p.valor),
          banco_conta_id: values.banco_conta_id,
          status: 'P',
        })),
      })
      toast.success('Título lançado com sucesso!')
      reset()
      setTab('lista')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao lançar')
    }
  }

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
        {([['lista', 'Lançamentos'], ['novo', 'Novo Lançamento']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
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
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button onClick={() => setTab('novo')}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              <Plus className="h-4 w-4" /> Novo
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 text-xs uppercase tracking-wide">
                  <th className="px-3 py-3 text-left">Emissão</th>
                  <th className="px-3 py-3 text-left">Fornecedor</th>
                  <th className="px-3 py-3 text-left">Histórico</th>
                  <th className="px-3 py-3 text-left">Plano</th>
                  <th className="px-3 py-3 text-left">Empresa</th>
                  <th className="px-3 py-3 text-right">Valor</th>
                  <th className="px-3 py-3 text-left">Parcelas</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-zinc-400">Carregando...</td></tr>
                ) : titulos.map(t => (
                  <tr key={t.id} className="border-t border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                    <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{t.data_emissao?.slice(0,10)}</td>
                    <td className="px-3 py-2.5 max-w-[140px] truncate">{(t as any).fornecedor_nome || '—'}</td>
                    <td className="px-3 py-2.5 text-zinc-500 max-w-[180px] truncate text-xs">{t.historico}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs max-w-[120px] truncate">{(t as any).plano_descricao || '—'}</td>
                    <td className="px-3 py-2.5"><span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">{t.empresa}</span></td>
                    <td className="px-3 py-2.5 font-mono text-right text-red-500 font-medium">{fmtBRL(t.valor_total)}</td>
                    <td className="px-3 py-2.5 text-xs text-center">{t.num_parcelas}x</td>
                    <td className="px-3 py-2.5"><span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_CLS[t.status]}`}>{STATUS_LABEL[t.status]}</span></td>
                    <td className="px-3 py-2.5">
                      <button className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded"><Pencil className="h-3.5 w-3.5 text-zinc-400" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── NOVO LANÇAMENTO ── */}
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
              <Field label="Banco / Conta de Pagamento">
                <select {...register('banco_conta_id')} className={inputCls}>
                  <option value="">Selecione...</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.empresa} — {b.banco} {b.conta}</option>)}
                </select>
              </Field>
              <Field label="Fornecedor" full>
                <select {...register('fornecedor_id')} className={inputCls}>
                  <option value="">Selecione...</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
                </select>
              </Field>
              <Field label="Plano de Contas *" error={errors.plano_contas_id?.message}>
                <select {...register('plano_contas_id')} className={inputCls}>
                  <option value="">Selecione...</option>
                  {planos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.descricao}</option>)}
                </select>
              </Field>
              <Field label="Centro de Custo">
                <select {...register('centro_custo')} className={inputCls}>
                  <option>Administrativo</option>
                  <option>Operacional</option>
                  <option>Fazenda São Luiz do Rio Pequeno</option>
                  <option>Residencial Santa Clara</option>
                </select>
              </Field>
              <Field label="Histórico *" error={errors.historico?.message} full>
                <input {...register('historico')} className={inputCls} placeholder="Descrição do pagamento" />
              </Field>
              <Field label="NF / DOC">
                <input {...register('nf_doc')} className={inputCls} />
              </Field>
              <Field label="Data de Emissão *" error={errors.data_emissao?.message}>
                <input {...register('data_emissao')} type="date" className={inputCls} />
              </Field>
              <Field label="Valor Total (R$) *" error={errors.valor_total?.message}>
                <input {...register('valor_total')} type="number" step="0.01" className={inputCls} placeholder="0,00" />
              </Field>
            </div>
          </section>

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
                {parcelas.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-3 border border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs text-zinc-400 min-w-[70px]">Parcela {p.num}/{parcelas.length}</span>
                    <input
                      type="date" value={p.data}
                      onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, data: e.target.value } : x))}
                      className={`${inputCls} flex-1 max-w-[160px]`}
                    />
                    <input
                      type="number" step="0.01" value={p.valor}
                      onChange={e => setParcelas(prev => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                      className={`${inputCls} w-[130px] text-right font-mono`}
                    />
                    <span className="text-xs text-zinc-400">R$</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setTab('lista'); reset() }}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50">
              Cancelar
            </button>
            <button type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              Lançar Título
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inputCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
const card = 'bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4 pb-3 border-b border-zinc-100 dark:border-zinc-700">
      {children}
    </h3>
  )
}

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
