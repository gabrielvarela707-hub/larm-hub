'use client'
/**
 * src/app/financeiro/bancos/page.tsx
 * Gestão de Bancos, Contas e Saldos Iniciais
 */

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Plus, Pencil, TrendingUp, Building2 } from 'lucide-react'
import { getBancos, createBanco, updateBanco, updateSaldosIniciais, type BancoConta } from '@/lib/api/financeiro'

const schema = z.object({
  empresa:       z.enum(['LARM', 'LM', 'HOLDING', 'RM']),
  banco:         z.string().min(2, 'Obrigatório'),
  cod_banco:     z.string().optional(),
  agencia:       z.string().min(1, 'Obrigatório'),
  conta:         z.string().min(1, 'Obrigatório'),
  tipo_conta:    z.enum(['CC', 'CP', 'CI']),
  apelido:       z.string().optional(),
  limite_chq:    z.coerce.number().default(0),
  data_saldo_ini: z.string().optional(),
  saldo_inicial:  z.coerce.number().default(0),
})
type FormData = z.infer<typeof schema>

const EMPRESAS = ['LARM', 'LM', 'HOLDING', 'RM'] as const
const BANCOS_LIST = ['001 - Banco do Brasil','033 - Santander','104 - Caixa Econômica','237 - Bradesco','341 - Itaú','655 - Daycoval','077 - Banco Inter','336 - C6 Bank','756 - Sicoob']

export default function BancosPage() {
  const [tab, setTab]     = useState<'contas' | 'novo' | 'saldos'>('contas')
  const [bancos, setBancos] = useState<BancoConta[]>([])
  const [editing, setEditing] = useState<BancoConta | null>(null)
  const [saldosEdit, setSaldosEdit] = useState<Record<number, { saldo: string; data: string }>>({})

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { empresa: 'LARM', tipo_conta: 'CC', saldo_inicial: 0, limite_chq: 0 },
  })

  const load = async () => {
    const data = await getBancos()
    setBancos(data)
    // Init saldos edit state
    const s: Record<number, { saldo: string; data: string }> = {}
    data.forEach(b => {
      s[b.id] = {
        saldo: b.saldo_inicial.toFixed(2),
        data: b.data_saldo_ini?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      }
    })
    setSaldosEdit(s)
  }

  useEffect(() => { load() }, [])

  const onSubmit = async (values: FormData) => {
    try {
      if (editing) {
        await updateBanco(editing.id, values)
        toast.success('Conta atualizada!')
      } else {
        await createBanco(values)
        toast.success('Conta cadastrada!')
      }
      reset()
      setEditing(null)
      setTab('contas')
      load()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erro ao salvar')
    }
  }

  const saveSaldos = async () => {
    const saldos = Object.entries(saldosEdit).map(([id, v]) => ({
      id: parseInt(id),
      saldo_inicial: parseFloat(v.saldo) || 0,
      data_saldo_ini: v.data,
    }))
    await updateSaldosIniciais(saldos)
    toast.success('Saldos iniciais salvos!')
    load()
  }

  const openEdit = (b: BancoConta) => {
    setEditing(b)
    reset({ ...b, data_saldo_ini: b.data_saldo_ini?.slice(0, 10) })
    setTab('novo')
  }

  const total = bancos.reduce((s, b) => s + b.saldo_inicial, 0)
  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="p-6 space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 col-span-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Total Consolidado</p>
          <p className="text-lg font-semibold font-mono text-amber-600">{fmtBRL(total)}</p>
          <p className="text-xs text-zinc-400 mt-1">saldo implantação</p>
        </div>
        {EMPRESAS.map(emp => {
          const tot = bancos.filter(b => b.empresa === emp).reduce((s, b) => s + b.saldo_inicial, 0)
          return (
            <div key={emp} className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{emp}</p>
              <p className="text-base font-semibold font-mono text-zinc-800 dark:text-zinc-100">{fmtBRL(tot)}</p>
              <p className="text-xs text-zinc-400 mt-1">{bancos.filter(b => b.empresa === emp).length} contas</p>
            </div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 w-fit">
        {([['contas','Contas Cadastradas'],['novo', editing ? 'Editar Conta' : 'Nova Conta'],['saldos','Saldos Iniciais']] as const).map(([t, l]) => (
          <button key={t} onClick={() => { if(t !== 'novo') setEditing(null); setTab(t) }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? 'bg-white dark:bg-zinc-700 shadow text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── LISTA DE CONTAS ── */}
      {tab === 'contas' && (
        <div className="grid grid-cols-3 gap-4">
          {bancos.map(b => (
            <div key={b.id} className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm">{b.banco}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{b.empresa} · Ag. {b.agencia}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  b.tipo_conta === 'CC' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                  b.tipo_conta === 'CI' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                  'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                }`}>{b.tipo_conta}</span>
              </div>
              <div className={`text-xl font-semibold font-mono ${b.saldo_inicial >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmtBRL(b.saldo_inicial)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-zinc-400 uppercase tracking-wide" style={{fontSize:'10px'}}>Conta</div>
                  <div className="text-zinc-700 dark:text-zinc-300 font-mono">{b.conta}</div>
                </div>
                {b.apelido && <div>
                  <div className="text-zinc-400 uppercase tracking-wide" style={{fontSize:'10px'}}>Apelido</div>
                  <div className="text-zinc-700 dark:text-zinc-300 truncate">{b.apelido}</div>
                </div>}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => openEdit(b)}
                  className="flex-1 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-center gap-1">
                  <Pencil className="h-3 w-3" /> Editar
                </button>
                <button onClick={() => toast.success('Extrato carregado!')}
                  className="flex-1 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 flex items-center justify-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Extrato
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => { setEditing(null); reset(); setTab('novo') }}
            className="rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-4 flex flex-col items-center justify-center gap-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-zinc-400 hover:text-zinc-600">
            <Plus className="h-6 w-6" />
            <span className="text-sm">Nova Conta</span>
          </button>
        </div>
      )}

      {/* ── FORMULÁRIO ── */}
      {tab === 'novo' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Dados da Conta Bancária
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Empresa *</label>
                <select {...register('empresa')} className={iCls}>
                  {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Tipo de Conta *</label>
                <select {...register('tipo_conta')} className={iCls}>
                  <option value="CC">Conta Corrente</option>
                  <option value="CP">Conta Poupança</option>
                  <option value="CI">Conta Investimento</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Banco *</label>
                <select {...register('banco')} className={iCls}>
                  <option value="">Selecione...</option>
                  {BANCOS_LIST.map(b => <option key={b}>{b}</option>)}
                </select>
                {errors.banco && <span className="text-xs text-red-500">{errors.banco.message}</span>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Código do Banco</label>
                <input {...register('cod_banco')} className={iCls} placeholder="237" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Agência *</label>
                <input {...register('agencia')} className={iCls} placeholder="0000-0" />
                {errors.agencia && <span className="text-xs text-red-500">{errors.agencia.message}</span>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Número da Conta *</label>
                <input {...register('conta')} className={iCls} placeholder="000000-0" />
                {errors.conta && <span className="text-xs text-red-500">{errors.conta.message}</span>}
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className="text-xs text-zinc-500">Apelido / Nome da Conta</label>
                <input {...register('apelido')} className={iCls} placeholder="Ex: Bradesco Principal LARM" />
              </div>
            </div>

            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-600 pt-2 pb-3 border-b border-zinc-100 dark:border-zinc-700">
              Saldo Inicial (data de implantação)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Data do Saldo Inicial *</label>
                <input {...register('data_saldo_ini')} type="date" className={iCls} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-500">Saldo Inicial (R$) *</label>
                <input {...register('saldo_inicial')} type="number" step="0.01" className={iCls} />
              </div>
            </div>
            <p className="text-xs text-zinc-400">O saldo inicial é o saldo da conta na data de implantação do sistema. Todos os movimentos lançados são acumulados a partir desta data.</p>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setTab('contas'); setEditing(null); reset() }}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm hover:bg-zinc-50">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              {editing ? 'Salvar Alterações' : 'Cadastrar Conta'}
            </button>
          </div>
        </form>
      )}

      {/* ── SALDOS INICIAIS ── */}
      {tab === 'saldos' && (
        <div className="bg-white dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-700">
            <div>
              <h3 className="text-sm font-semibold">Saldos Iniciais por Conta</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Defina o saldo de cada conta na data de implantação do sistema</p>
            </div>
            <button onClick={saveSaldos} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
              Salvar Todos
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/60 text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Banco</th>
                <th className="px-4 py-3 text-left">Agência</th>
                <th className="px-4 py-3 text-left">Conta</th>
                <th className="px-4 py-3 text-left">Tipo</th>
                <th className="px-4 py-3 text-left">Data Saldo</th>
                <th className="px-4 py-3 text-right">Saldo Inicial (R$)</th>
              </tr>
            </thead>
            <tbody>
              {bancos.map(b => (
                <tr key={b.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2.5"><span className="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">{b.empresa}</span></td>
                  <td className="px-4 py-2.5 text-sm">{b.banco}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{b.agencia}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{b.conta}</td>
                  <td className="px-4 py-2.5 text-xs">{b.tipo_conta}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="date"
                      value={saldosEdit[b.id]?.data || ''}
                      onChange={e => setSaldosEdit(prev => ({ ...prev, [b.id]: { ...prev[b.id], data: e.target.value } }))}
                      className={`${iCls} w-[140px]`}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number" step="0.01"
                      value={saldosEdit[b.id]?.saldo || '0'}
                      onChange={e => setSaldosEdit(prev => ({ ...prev, [b.id]: { ...prev[b.id], saldo: e.target.value } }))}
                      className={`${iCls} w-[160px] text-right font-mono`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const iCls = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
