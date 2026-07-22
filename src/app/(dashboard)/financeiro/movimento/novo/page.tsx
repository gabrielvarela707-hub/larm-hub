'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

type TipoLancamento = 'tarifa_bancaria' | 'rendimento_aplicacao' | 'distribuicao_lucros' | 'reembolso_despesas'

interface BancoConta {
  id: number
  empresa: string
  banco_nome: string
  agencia: string | null
  conta: string | null
  digito?: string | null
}

interface PlanoConta {
  id: number
  codigo: string
  descricao: string
  tipo: string
}

interface FormState {
  banco_conta_id: string
  tipo: TipoLancamento
  data: string
  valor: string
  descricao: string
  contraparte: string
  plano_conta_id: string
}

const DEFAULT_DESCRIPTIONS: Record<TipoLancamento, string> = {
  tarifa_bancaria: 'Tarifas bancárias',
  rendimento_aplicacao: 'Rendimento de aplicação',
  distribuicao_lucros: 'Distribuição de lucros',
  reembolso_despesas: 'Reembolso de despesas',
}

const CLASSIFICATIONS: Record<TipoLancamento, { conta: string; natureza: string; movimento: string }> = {
  tarifa_bancaria: {
    conta: 'DESPESAS BANCARIAS E COMISSOES',
    natureza: '5.2.2',
    movimento: 'Saída',
  },
  rendimento_aplicacao: {
    conta: 'REND. S/APLICACOES FINANCEIRAS',
    natureza: '5.1.3',
    movimento: 'Entrada',
  },
  distribuicao_lucros: {
    conta: 'DISTRIBUIÇÃO DE LUCROS',
    natureza: '',
    movimento: 'Entrada',
  },
  reembolso_despesas: {
    conta: 'REEMBOLSO DE DESPESAS',
    natureza: '',
    movimento: 'Entrada',
  },
}

function todayISO() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function parseMoney(value: string) {
  let raw = value.trim().replace(/R\$/gi, '').replace(/\s/g, '')
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.')
  raw = raw.replace(/[^0-9.-]/g, '')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function accountLabel(conta: BancoConta) {
  const account = [conta.agencia, conta.conta && conta.digito ? `${conta.conta}-${conta.digito}` : conta.conta]
    .filter(Boolean)
    .join(' / ')
  return [conta.empresa, conta.banco_nome, account].filter(Boolean).join(' — ')
}

export default function NovoMovimentoPage() {
  const router = useRouter()
  const [contas, setContas] = useState<BancoConta[]>([])
  const [planoContas, setPlanoContas] = useState<PlanoConta[]>([])
  const [loadingContas, setLoadingContas] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>({
    banco_conta_id: '',
    tipo: 'tarifa_bancaria',
    data: todayISO(),
    valor: '',
    descricao: DEFAULT_DESCRIPTIONS.tarifa_bancaria,
    contraparte: '',
    plano_conta_id: '',
  })

  useEffect(() => {
    let active = true

    Promise.all([
      apiClient.get('/financeiro/bancos/select'),
      apiClient.get('/financeiro/plano-contas?ativo=1'),
    ])
      .then(([contasResponse, planoResponse]) => {
        if (!active) return
        setContas(contasResponse.data?.data ?? [])
        const analyticAccounts = (planoResponse.data?.data ?? []).filter((item: PlanoConta) => item.tipo === 'A')
        setPlanoContas(analyticAccounts)
        const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
        const suggested = analyticAccounts.find((item: PlanoConta) =>
          normalize(item.descricao).includes('DESPESAS BANCARIAS') ||
          normalize(item.descricao).includes('COMISSOES BANCARIAS')
        )
        if (suggested) {
          setForm(previous => previous.plano_conta_id
            ? previous
            : { ...previous, plano_conta_id: String(suggested.id) })
        }
      })
      .catch(() => {
        if (!active) return
        setErrors({ _geral: 'Não foi possível carregar as contas bancárias e contábeis.' })
      })
      .finally(() => {
        if (active) setLoadingContas(false)
      })

    return () => { active = false }
  }, [])

  const contaSelecionada = useMemo(
    () => contas.find(conta => String(conta.id) === form.banco_conta_id) ?? null,
    [contas, form.banco_conta_id]
  )

  const classificacaoPadrao = CLASSIFICATIONS[form.tipo]
  const planoSelecionado = useMemo(
    () => planoContas.find(conta => String(conta.id) === form.plano_conta_id) ?? null,
    [planoContas, form.plano_conta_id]
  )
  const classificacao = {
    ...classificacaoPadrao,
    conta: planoSelecionado?.descricao || classificacaoPadrao.conta,
    natureza: planoSelecionado?.codigo || classificacaoPadrao.natureza,
  }
  const inputClass = 'w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400'

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(previous => ({ ...previous, [key]: value }))
    setErrors(previous => ({ ...previous, [key]: '', _geral: '' }))
  }

  function findSuggestedPlan(tipo: TipoLancamento) {
    const terms: Record<TipoLancamento, string[]> = {
      tarifa_bancaria: ['DESPESAS BANCARIAS', 'COMISSOES BANCARIAS'],
      rendimento_aplicacao: ['REND. S/APLICACOES', 'RENDIMENTO DE APLICACAO'],
      distribuicao_lucros: ['DISTRIBUICAO DE LUCROS', 'LUCROS DISTRIBUIDOS'],
      reembolso_despesas: ['REEMBOLSO DE DESPESAS', 'REEMBOLSOS'],
    }
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    return planoContas.find(item => terms[tipo].some(term => normalize(item.descricao).includes(term)))
  }

  function changeTipo(tipo: TipoLancamento) {
    const suggested = findSuggestedPlan(tipo)
    setForm(previous => ({
      ...previous,
      tipo,
      descricao: DEFAULT_DESCRIPTIONS[tipo],
      plano_conta_id: suggested ? String(suggested.id) : '',
    }))
    setErrors(previous => ({ ...previous, tipo: '', descricao: '', plano_conta_id: '', _geral: '' }))
  }

  function validate() {
    const next: Record<string, string> = {}
    if (!form.banco_conta_id) next.banco_conta_id = 'Selecione a conta bancária.'
    if (!form.data) next.data = 'Informe a data.'
    if (parseMoney(form.valor) <= 0) next.valor = 'Informe um valor maior que zero.'
    if (!form.descricao.trim()) next.descricao = 'Informe o histórico do lançamento.'
    if (!form.plano_conta_id) next.plano_conta_id = 'Selecione a conta contábil.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function save() {
    if (!validate()) return

    setSaving(true)
    setSuccess('')
    try {
      const response = await apiClient.post('/financeiro/movimento/manual', {
        banco_conta_id: Number(form.banco_conta_id),
        tipo: form.tipo,
        data: form.data,
        valor: parseMoney(form.valor),
        descricao: form.descricao.trim(),
        contraparte: form.contraparte.trim() || null,
        plano_conta_id: Number(form.plano_conta_id),
      })

      setSuccess(response.data?.message || 'Lançamento salvo com sucesso.')
      window.setTimeout(() => router.push('/financeiro/movimento'), 700)
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
      setErrors({ _geral: message || 'Não foi possível salvar o lançamento.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Novo lançamento bancário</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastre entradas e saídas diretamente no Movimento Bancário, com conta bancária e classificação contábil.
          </p>
        </div>
        <Link
          href="/financeiro/movimento"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 md:p-6 space-y-6">
        {errors._geral && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errors._geral}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="space-y-1.5 md:col-span-2">
            <span className="block text-xs font-semibold text-slate-600">Conta bancária *</span>
            <select
              value={form.banco_conta_id}
              onChange={event => update('banco_conta_id', event.target.value)}
              disabled={loadingContas}
              className={cn(inputClass, errors.banco_conta_id && 'border-red-300')}
            >
              <option value="">{loadingContas ? 'Carregando contas...' : 'Selecione a conta'}</option>
              {contas.map(conta => (
                <option key={conta.id} value={conta.id}>{accountLabel(conta)}</option>
              ))}
            </select>
            {errors.banco_conta_id && <p className="text-xs text-red-500">{errors.banco_conta_id}</p>}
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-600">Tipo de lançamento *</span>
            <select
              value={form.tipo}
              onChange={event => changeTipo(event.target.value as TipoLancamento)}
              className={inputClass}
            >
              <option value="tarifa_bancaria">Tarifa bancária</option>
              <option value="rendimento_aplicacao">Rendimento de aplicação</option>
              <option value="distribuicao_lucros">Distribuição de lucros</option>
              <option value="reembolso_despesas">Reembolso de despesas</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-600">Data *</span>
            <input
              type="date"
              value={form.data}
              onChange={event => update('data', event.target.value)}
              className={cn(inputClass, errors.data && 'border-red-300')}
            />
            {errors.data && <p className="text-xs text-red-500">{errors.data}</p>}
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-600">Valor *</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={form.valor}
              onChange={event => update('valor', event.target.value)}
              className={cn(inputClass, errors.valor && 'border-red-300')}
            />
            {errors.valor && <p className="text-xs text-red-500">{errors.valor}</p>}
          </label>

          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-slate-600">Movimento</span>
            <input value={classificacao.movimento} readOnly className={cn(inputClass, 'bg-slate-50')} />
          </label>


          <label className="space-y-1.5 md:col-span-2">
            <span className="block text-xs font-semibold text-slate-600">Conta contábil *</span>
            <select
              value={form.plano_conta_id}
              onChange={event => update('plano_conta_id', event.target.value)}
              className={cn(inputClass, errors.plano_conta_id && 'border-red-300')}
            >
              <option value="">Selecione a classificação</option>
              {planoContas.map(conta => (
                <option key={conta.id} value={conta.id}>{conta.codigo} — {conta.descricao}</option>
              ))}
            </select>
            {errors.plano_conta_id && <p className="text-xs text-red-500">{errors.plano_conta_id}</p>}
            {form.tipo === 'reembolso_despesas' && (
              <p className="text-xs text-slate-400">O reembolso pode ser classificado em outra conta quando necessário.</p>
            )}
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="block text-xs font-semibold text-slate-600">Fornecedor / favorecido / origem</span>
            <input
              value={form.contraparte}
              onChange={event => update('contraparte', event.target.value)}
              maxLength={255}
              placeholder="Ex.: Lucky Capital Empreendimentos Ltda"
              className={inputClass}
            />
          </label>

          <label className="space-y-1.5 md:col-span-2">
            <span className="block text-xs font-semibold text-slate-600">Histórico *</span>
            <input
              value={form.descricao}
              onChange={event => update('descricao', event.target.value)}
              maxLength={500}
              className={cn(inputClass, errors.descricao && 'border-red-300')}
            />
            {errors.descricao && <p className="text-xs text-red-500">{errors.descricao}</p>}
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-600 mb-3">Classificação do lançamento</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Empresa</p>
              <p className="font-medium text-slate-700">{contaSelecionada?.empresa || '—'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Conta contábil</p>
              <p className="font-medium text-slate-700">{classificacao.conta}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Natureza financeira</p>
              <p className="font-medium text-slate-700">{classificacao.natureza}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
          <Link
            href="/financeiro/movimento"
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={saving || loadingContas || Boolean(success)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-[#1e3a5f] text-white hover:bg-[#162d4a] disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Salvando...' : 'Salvar lançamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
