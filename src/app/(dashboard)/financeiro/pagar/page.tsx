'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Plus, Search, X, Check, FileText, Loader2, Sparkles } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface Fornecedor { id: number; razao_social: string; empresa: string; cnpj_cpf?: string | null; nome_fantasia?: string | null }
interface BancoConta { id: number; empresa: string; banco_nome: string; agencia: string | null; conta: string | null }
interface PlanoConta  { id: number; codigo: string; descricao: string; tipo: string }
interface TipoDocumento { id: number; nome: string }
interface Parcela     { id?: number; numero: number; valor: number; vencimento: string; status: string }
interface NovoFornecedorForm {
  razao_social: string
  nome_fantasia: string
  cnpj_cpf: string
  tipo_pessoa: 'PJ' | 'PF'
  empresa: string
}
type SortKey = 'empresa' | 'fornecedor' | 'tipo_documento' | 'numero' | 'parcela' | 'valor' | 'emissao' | 'vencimento' | 'pagamento' | 'status'
interface AiContaPagarResult {
  fornecedor_nome?: string | null
  fornecedor_cnpj?: string | null
  tipo_documento?: string | null
  numero_documento?: string | null
  historico?: string | null
  data_emissao?: string | null
  data_vencimento?: string | null
  valor_total?: number | null
  parcelas?: { numero: number; valor: number; vencimento: string }[]
}

interface Lancamento {
  id: number; empresa: string; historico: string; produto_servico: string | null
  tipo_documento_id?: number | null; tipo_documento_nome?: string | null
  nf_doc: string | null; documento_nome?: string | null; dt_emissao: string | null; valor_total: number
  qtd_parcelas: number; status: string; conta_contabil: string | null
  descricao_conta: string | null; centro_custo: string | null; obs: string | null
  fornecedor_nome: string | null; banco_nome: string | null; proximo_venc: string | null
  parcela_id?: number | null; parcela_numero?: number | null; parcela_valor?: number | null
  parcela_vencimento?: string | null; parcela_status?: string | null; parcela_dt_pagamento?: string | null
  parcela_motivo_baixa?: string | null; parcela_acrescimo?: number | null; parcela_desconto?: number | null
  parcela_juros?: number | null; parcela_multa?: number | null; parcela_valor_final?: number | null
  parcela_forma_pagamento?: string | null
}

interface BaixaForm {
  valor_parcela: string
  motivo_baixa: string
  acrescimo: string
  desconto: string
  juros: string
  multa: string
  valor_final: string
  forma_pagamento: string
  dt_pagamento: string
}

const EMPRESAS = ['LARM', 'LUCKY', 'LM', 'HOLDING', 'RM']
const STATUS_COLORS: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-700',
  pago:     'bg-green-100 text-green-700',
  vencido:  'bg-red-100 text-red-700',
  cancelado:'bg-slate-100 text-slate-500',
}

const R$ = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const todayISO = () => new Date().toISOString().split('T')[0]
const moneyToNumber = (v: string | number | null | undefined) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0

  const raw = String(v ?? '').trim()
  if (!raw) return 0

  // Campo type=number normalmente envia decimal com ponto (500.00).
  // Campo digitado em PT-BR pode vir com vírgula (500,00).
  // Antes removíamos todo ponto, o que transformava 500.00 em 50000.
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw

  const n = Number(normalized.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}
const sortText = (v: unknown) => String(v ?? '').toLocaleLowerCase('pt-BR')
const sortDate = (v: string | null | undefined) => v ? (Date.parse(v) || 0) : 0
const getSortValue = (l: Lancamento, key: SortKey): string | number => {
  switch (key) {
    case 'empresa': return sortText(l.empresa)
    case 'fornecedor': return sortText(l.fornecedor_nome)
    case 'tipo_documento': return sortText(l.tipo_documento_nome)
    case 'numero': return sortText(l.nf_doc)
    case 'parcela': return Number(l.parcela_numero || 0)
    case 'valor': return Number(l.parcela_valor ?? l.valor_total ?? 0)
    case 'emissao': return sortDate(l.dt_emissao)
    case 'vencimento': return sortDate(l.parcela_vencimento || l.proximo_venc)
    case 'pagamento': return sortDate(l.parcela_dt_pagamento)
    case 'status': return sortText(l.parcela_status || l.status)
    default: return ''
  }
}

export default function PagarPage() {
  const [lista,     setLista]     = useState<Lancamento[]>([])
  const [total,     setTotal]     = useState(0)
  const [totalVlr,  setTotalVlr]  = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [showFornecedorModal, setShowFornecedorModal] = useState(false)
  const [savingFornecedor, setSavingFornecedor] = useState(false)
  const [fornecedorErrors, setFornecedorErrors] = useState<Record<string, string>>({})
  const [showBaixaModal, setShowBaixaModal] = useState(false)
  const [savingBaixa, setSavingBaixa] = useState(false)
  const [baixaErrors, setBaixaErrors] = useState<Record<string, string>>({})
  const [baixaParcela, setBaixaParcela] = useState<Lancamento | null>(null)
  const [baixaForm, setBaixaForm] = useState<BaixaForm>({
    valor_parcela: '',
    motivo_baixa: '',
    acrescimo: '0',
    desconto: '0',
    juros: '0',
    multa: '0',
    valor_final: '',
    forma_pagamento: '',
    dt_pagamento: todayISO(),
  })

  // Listas para selects
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [bancos,       setBancos]       = useState<BancoConta[]>([])
  const [plano,        setPlano]        = useState<PlanoConta[]>([])
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([])

  // Filtros
  const [fEmpresa, setFEmpresa] = useState('')
  const [fFornecedorFiltro, setFFornecedorFiltro] = useState('')
  const [fTipoDocFiltro, setFTipoDocFiltro] = useState('')
  const [fPeriodoInicio, setFPeriodoInicio] = useState('')
  const [fPeriodoFim, setFPeriodoFim] = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fBusca,   setFBusca]   = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('vencimento')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Form state
  const [fEmp,     setFEmp]     = useState('')
  const [fForn,    setFForn]    = useState('')
  const [fBanco,   setFBanco]   = useState('')
  const [fConta,   setFConta]   = useState('')
  const [fHistorico, setFHistorico] = useState('')
  const [fTipoDoc, setFTipoDoc] = useState('')
  const [fNF,      setFNF]      = useState('')
  const [fEmissao, setFEmissao] = useState(todayISO())
  const [fValor,   setFValor]   = useState('')
  const [fNParc,   setFNParc]   = useState(1)
  const [fCC,      setFCC]      = useState('')
  const [fObs,     setFObs]     = useState('')
  const [novoFornecedor, setNovoFornecedor] = useState<NovoFornecedorForm>({
    razao_social: '',
    nome_fantasia: '',
    cnpj_cpf: '',
    tipo_pessoa: 'PJ',
    empresa: '',
  })
  const [fDocumentoNome,   setFDocumentoNome]   = useState('')
  const [fDocumentoMime,   setFDocumentoMime]   = useState('')
  const [fDocumentoBase64, setFDocumentoBase64] = useState('')
  const [fDocumentoErro,   setFDocumentoErro]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const aiParcelasRef = useRef<Parcela[] | null>(null)
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (fEmpresa) params.empresa = fEmpresa
      if (fFornecedorFiltro) params.fornecedor_id = fFornecedorFiltro
      if (fTipoDocFiltro) params.tipo_documento_id = fTipoDocFiltro
      if (fPeriodoInicio) params.venc_inicio = fPeriodoInicio
      if (fPeriodoFim) params.venc_fim = fPeriodoFim
      if (fStatus)  params.status  = fStatus
      if (fBusca)   params.busca   = fBusca
      const r = await apiClient.get('/financeiro/lancamentos-cp', { params })
      setLista(r.data.data)
      setTotal(r.data.total)
      setTotalVlr(r.data.total_valor)
    } catch { }
    finally { setLoading(false) }
  }, [fEmpresa, fFornecedorFiltro, fTipoDocFiltro, fPeriodoInicio, fPeriodoFim, fStatus, fBusca])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    Promise.all([
      apiClient.get('/financeiro/fornecedores/select'),
      apiClient.get('/financeiro/bancos/select'),
      apiClient.get('/financeiro/plano-contas'),
      apiClient.get('/financeiro/tipos-documento/ativos', { params: { modulo: 'pagar' } }),
    ]).then(([f, b, p, td]) => {
      setFornecedores(f.data.data)
      setBancos(b.data.data)
      setPlano(p.data.data.filter((c: PlanoConta) => c.tipo === 'A'))
      setTiposDocumento(td.data.data || [])
    }).catch(() => {})
  }, [])

  // Recalcula parcelas ao mudar valor ou nparcs
  useEffect(() => {
    if (aiParcelasRef.current) {
      setParcelas(aiParcelasRef.current)
      aiParcelasRef.current = null
      return
    }

    const vlr = parseFloat(fValor) || 0
    const n   = fNParc || 1
    if (vlr <= 0) { setParcelas([]); return }
    const base = new Date(fEmissao || new Date())
    const ps: Parcela[] = Array.from({ length: n }, (_, i) => {
      const d = new Date(base)
      d.setMonth(d.getMonth() + i + 1)
      return {
        numero: i + 1,
        valor: parseFloat((vlr / n).toFixed(2)),
        vencimento: d.toISOString().split('T')[0],
        status: 'pendente',
      }
    })
    setParcelas(ps)
  }, [fValor, fNParc, fEmissao])

  function updateParcela(i: number, key: keyof Parcela, val: string | number) {
    setParcelas(p => p.map((x, idx) => idx === i ? { ...x, [key]: val } : x))
  }

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDir(key === 'valor' ? 'desc' : 'asc')
  }

  function openFornecedorModal() {
    setFornecedorErrors({})
    setNovoFornecedor({
      razao_social: '',
      nome_fantasia: '',
      cnpj_cpf: '',
      tipo_pessoa: 'PJ',
      empresa: fEmp || 'TODOS',
    })
    setShowFornecedorModal(true)
  }

  function closeFornecedorModal() {
    if (savingFornecedor) return
    setShowFornecedorModal(false)
    setFornecedorErrors({})
  }

  async function saveFornecedorRapido() {
    const e: Record<string, string> = {}
    if (!novoFornecedor.razao_social.trim()) e.razao_social = 'Obrigatório'
    if (!novoFornecedor.empresa) e.empresa = 'Obrigatório'
    setFornecedorErrors(e)
    if (Object.keys(e).length) return

    setSavingFornecedor(true)
    try {
      const payload = {
        razao_social: novoFornecedor.razao_social.trim(),
        nome_fantasia: novoFornecedor.nome_fantasia.trim() || null,
        cnpj_cpf: novoFornecedor.cnpj_cpf.trim() || null,
        tipo_pessoa: novoFornecedor.tipo_pessoa,
        empresa: novoFornecedor.empresa,
        categoria: null,
      }
      const r = await apiClient.post('/financeiro/fornecedores', payload)
      const criado = r.data.data as Fornecedor
      const sel = await apiClient.get('/financeiro/fornecedores/select')
      setFornecedores(sel.data.data || [])
      setFForn(String(criado.id))
      if (!fEmp && criado.empresa && criado.empresa !== 'TODOS') setFEmp(criado.empresa)
      setShowFornecedorModal(false)
      setFornecedorErrors({})
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao cadastrar fornecedor'
      setFornecedorErrors({ _geral: msg })
    } finally {
      setSavingFornecedor(false)
    }
  }

  function openNew() { setShowForm(true); setErrors({}) }
  function closeForm() {
    setShowForm(false)
    setFEmp(''); setFForn(''); setFBanco(''); setFConta(''); setFHistorico('')
    setFTipoDoc(''); setFNF(''); setFValor(''); setFNParc(1); setFCC(''); setFObs('')
    setFDocumentoNome(''); setFDocumentoMime(''); setFDocumentoBase64(''); setFDocumentoErro('')
    setAiMessage(''); setAiLoading(false); aiParcelasRef.current = null
    setParcelas([]); setErrors({})
    setShowFornecedorModal(false); setFornecedorErrors({})
    setShowBaixaModal(false); setBaixaParcela(null); setBaixaErrors({})
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!fEmp)       e.empresa   = 'Obrigatório'
    if (!fHistorico) e.historico = 'Obrigatório'
    if (!fValor || parseFloat(fValor) <= 0) e.valor = 'Informe um valor válido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleDocumentoChange(file: File | null) {
    setFDocumentoErro('')
    setAiMessage('')
    setFDocumentoNome('')
    setFDocumentoMime('')
    setFDocumentoBase64('')

    if (!file) return

    const permitido = file.type === 'application/pdf' || file.type.startsWith('image/')
    if (!permitido) {
      setFDocumentoErro('Envie apenas PDF ou imagem')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setFDocumentoErro('Arquivo muito grande. Limite sugerido: 5MB')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const base64 = result.includes(',') ? result.split(',')[1] : result
      setFDocumentoNome(file.name)
      setFDocumentoMime(file.type)
      setFDocumentoBase64(base64)
    }
    reader.onerror = () => setFDocumentoErro('Não foi possível ler o arquivo')
    reader.readAsDataURL(file)
  }

  function findFornecedorByAi(data: AiContaPagarResult) {
    const cnpjDigits = String(data.fornecedor_cnpj || '').replace(/\D/g, '')
    if (cnpjDigits) {
      const byDoc = fornecedores.find(f => String(f.cnpj_cpf || '').replace(/\D/g, '') === cnpjDigits)
      if (byDoc) return byDoc
    }

    const nome = String(data.fornecedor_nome || '').trim().toLowerCase()
    if (!nome) return null
    return fornecedores.find(f => {
      const razao = String(f.razao_social || '').toLowerCase().trim()
      const fantasia = String(f.nome_fantasia || '').toLowerCase().trim()
      return (razao.length > 2 && (razao.includes(nome) || nome.includes(razao)))
        || (fantasia.length > 2 && (fantasia.includes(nome) || nome.includes(fantasia)))
    }) || null
  }

  function applyAiResult(data: AiContaPagarResult) {
    const fornecedor = findFornecedorByAi(data)
    if (fornecedor) {
      setFForn(String(fornecedor.id))
      if (!fEmp && fornecedor.empresa) setFEmp(fornecedor.empresa)
    }

    if (data.tipo_documento) {
      const tipo = tiposDocumento.find(t => {
        const a = t.nome.toLowerCase()
        const b = String(data.tipo_documento || '').toLowerCase()
        return a.includes(b) || b.includes(a)
      })
      if (tipo) setFTipoDoc(String(tipo.id))
    }

    if (data.numero_documento) setFNF(data.numero_documento)
    if (data.historico) setFHistorico(data.historico)
    if (data.data_emissao) setFEmissao(data.data_emissao)

    const valor = Number(data.valor_total || 0)
    if (valor > 0) setFValor(valor.toFixed(2))

    const aiParcelas = Array.isArray(data.parcelas) && data.parcelas.length
      ? data.parcelas
      : (data.data_vencimento && valor > 0 ? [{ numero: 1, valor, vencimento: data.data_vencimento }] : [])

    if (aiParcelas.length) {
      aiParcelasRef.current = aiParcelas.map((p, idx) => ({
        numero: Number(p.numero) || idx + 1,
        valor: Number(p.valor) || valor || 0,
        vencimento: p.vencimento,
        status: 'pendente',
      }))
      setFNParc(aiParcelasRef.current.length)
    }
  }

  async function analisarDocumentoIA() {
    if (!fDocumentoBase64 || !fDocumentoMime) {
      setAiMessage('Selecione primeiro um PDF ou imagem da conta.')
      return
    }

    setAiLoading(true)
    setAiMessage('')
    try {
      const r = await apiClient.post<{ ok: boolean; data: AiContaPagarResult; provider?: string; message?: string }>('/financeiro/lancamentos-cp/analisar-documento', {
        documento_nome: fDocumentoNome,
        documento_mime: fDocumentoMime,
        documento_base64: fDocumentoBase64,
      })

      applyAiResult(r.data.data || {})
      const prov = r.data.provider === 'gemini' ? 'Gemini' : 'OpenAI'
      setAiMessage(`Dados lidos com ${prov}. Confira antes de salvar.`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
        || 'Não foi possível analisar o documento com IA.'
      setAiMessage(msg)
    } finally {
      setAiLoading(false)
    }
  }

  async function save() {
    if (!validate()) return
    setSaving(true)
    try {
      const contaObj = plano.find(p => p.codigo === fConta)
      await apiClient.post('/financeiro/lancamentos-cp', {
        empresa:         fEmp,
        fornecedor_id:   fForn   || null,
        banco_conta_id:  fBanco  || null,
        conta_contabil:  fConta  || null,
        descricao_conta: contaObj?.descricao || null,
        historico:       fHistorico,
        tipo_documento_id: fTipoDoc || null,
        produto_servico: null,
        nf_doc:          fNF      || null,
        documento_nome:  fDocumentoNome   || null,
        documento_mime:  fDocumentoMime   || null,
        documento_base64:fDocumentoBase64 || null,
        dt_emissao:      fEmissao || null,
        valor_total:     parseFloat(fValor),
        qtd_parcelas:    fNParc,
        centro_custo:    fCC      || null,
        obs:             fObs     || null,
        parcelas,
      })
      closeForm()
      load()
    } catch (err: unknown) {
      setErrors({ _geral: (err instanceof Error ? err.message : 'Erro ao salvar') || 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  function calculaValorFinalBaixa(form: BaixaForm) {
    const valor = moneyToNumber(form.valor_parcela)
    const acrescimo = moneyToNumber(form.acrescimo)
    const juros = moneyToNumber(form.juros)
    const multa = moneyToNumber(form.multa)
    const desconto = moneyToNumber(form.desconto)
    return Math.max(0, valor + acrescimo + juros + multa - desconto)
  }

  function openBaixaModal(l: Lancamento) {
    if (!l.parcela_id) return
    const valor = Number(l.parcela_valor ?? l.valor_total ?? 0)
    const form: BaixaForm = {
      valor_parcela: valor.toFixed(2),
      motivo_baixa: l.parcela_motivo_baixa || '',
      acrescimo: String(Number(l.parcela_acrescimo || 0)),
      desconto: String(Number(l.parcela_desconto || 0)),
      juros: String(Number(l.parcela_juros || 0)),
      multa: String(Number(l.parcela_multa || 0)),
      valor_final: String(Number(l.parcela_valor_final || valor).toFixed(2)),
      forma_pagamento: l.parcela_forma_pagamento || '',
      dt_pagamento: l.parcela_dt_pagamento || todayISO(),
    }
    form.valor_final = calculaValorFinalBaixa(form).toFixed(2)
    setBaixaParcela(l)
    setBaixaForm(form)
    setBaixaErrors({})
    setShowBaixaModal(true)
  }

  function updateBaixaForm<K extends keyof BaixaForm>(key: K, value: BaixaForm[K]) {
    setBaixaForm(prev => {
      const next = { ...prev, [key]: value }
      if (['valor_parcela', 'acrescimo', 'desconto', 'juros', 'multa'].includes(key)) {
        next.valor_final = calculaValorFinalBaixa(next).toFixed(2)
      }
      return next
    })
  }

  function closeBaixaModal() {
    if (savingBaixa) return
    setShowBaixaModal(false)
    setBaixaParcela(null)
    setBaixaErrors({})
  }

  async function salvarBaixa() {
    if (!baixaParcela?.id || !baixaParcela.parcela_id) return
    const e: Record<string, string> = {}
    if (!baixaForm.dt_pagamento) e.dt_pagamento = 'Obrigatório'
    if (!baixaForm.forma_pagamento.trim()) e.forma_pagamento = 'Obrigatório'
    setBaixaErrors(e)
    if (Object.keys(e).length) return

    setSavingBaixa(true)
    try {
      await apiClient.put(`/financeiro/lancamentos-cp/${baixaParcela.id}/parcelas/${baixaParcela.parcela_id}/pagar`, {
        dt_pagamento: baixaForm.dt_pagamento,
        valor_parcela: moneyToNumber(baixaForm.valor_parcela),
        motivo_baixa: baixaForm.motivo_baixa.trim() || null,
        acrescimo: moneyToNumber(baixaForm.acrescimo),
        desconto: moneyToNumber(baixaForm.desconto),
        juros: moneyToNumber(baixaForm.juros),
        multa: moneyToNumber(baixaForm.multa),
        valor_final: moneyToNumber(baixaForm.valor_final),
        forma_pagamento: baixaForm.forma_pagamento.trim(),
      })
      closeBaixaModal()
      load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Erro ao dar baixa na parcela'
      setBaixaErrors({ _geral: msg })
    } finally {
      setSavingBaixa(false)
    }
  }

  const inp = 'w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
  const F = useCallback(({ label, name, required, children, full }: { label: string; name: string; required?: boolean; children: React.ReactNode; full?: boolean }) => (
    <div className={cn('flex flex-col gap-1', full && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500">{errors[name]}</p>}
    </div>
  ), [errors])

  const sortedLista = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...lista].sort((a, b) => {
      const av = getSortValue(a, sortKey)
      const bv = getSortValue(b, sortKey)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir
    })
  }, [lista, sortKey, sortDir])

  const TH = ({ label, k, align = 'left' }: { label: string; k: SortKey; align?: 'left' | 'right' | 'center' }) => (
    <th className={cn('px-3 py-2.5 font-semibold whitespace-nowrap', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left')}>
      <button type="button" onClick={() => sortBy(k)} className={cn('inline-flex items-center gap-1 hover:text-blue-100', align === 'right' && 'justify-end w-full', align === 'center' && 'justify-center w-full')}>
        {label}
        <span className="text-[10px] opacity-70">{sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Contas a Pagar</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} parcelas · {R$(totalVlr)} em aberto</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo Lançamento
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3 items-end">
          <div className="md:col-span-2 xl:col-span-2">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Busca</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={fBusca} onChange={e => setFBusca(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                placeholder="Fornecedor, histórico ou documento…"
                className="pl-9 pr-4 py-2 w-full text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Fornecedor</label>
            <select value={fFornecedorFiltro} onChange={e => setFFornecedorFiltro(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
              <option value="">Todos fornecedores</option>
              {fornecedores
                .filter(f => !fEmpresa || f.empresa === fEmpresa || f.empresa === 'TODOS')
                .map(f => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Tipo de documento</label>
            <select value={fTipoDocFiltro} onChange={e => setFTipoDocFiltro(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
              <option value="">Todos tipos</option>
              {tiposDocumento.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vencimento de</label>
            <input value={fPeriodoInicio} onChange={e => setFPeriodoInicio(e.target.value)} type="date"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700" />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">Vencimento até</label>
            <input value={fPeriodoFim} onChange={e => setFPeriodoFim(e.target.value)} type="date"
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700" />
          </div>

          <div className="grid grid-cols-2 gap-2 md:col-span-2 xl:col-span-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Empresa</label>
              <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
                <option value="">Todas</option>
                {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
              <select value={fStatus} onChange={e => setFStatus(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white text-slate-700">
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
              </select>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">O período filtra pela data de vencimento das parcelas.</p>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                <TH label="Empresa" k="empresa" />
                <TH label="Fornecedor" k="fornecedor" />
                <TH label="Tipo de documento" k="tipo_documento" />
                <TH label="Número" k="numero" />
                <TH label="Parcela" k="parcela" align="center" />
                <TH label="Valor" k="valor" align="right" />
                <TH label="Emissão" k="emissao" />
                <TH label="Vencimento" k="vencimento" />
                <TH label="Pagamento" k="pagamento" />
                <TH label="Status" k="status" />
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(6)].map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(10)].map((_,j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50+((i*11+j*9)%40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && lista.length === 0 && (
                <tr><td colSpan={10} className="text-center text-slate-400 py-12 text-sm">
                  Nenhum lançamento encontrado
                </td></tr>
              )}
              {!loading && sortedLista.map(l => {
                const statusParcela = l.parcela_status || l.status
                const valorParcela = Number(l.parcela_valor ?? l.valor_total ?? 0)
                return (
                  <tr key={`${l.id}-${l.parcela_id || l.parcela_numero || 'sem-parcela'}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{l.empresa}</span>
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <p className="font-medium text-slate-700 truncate">{l.fornecedor_nome || '—'}</p>
                      {l.banco_nome && <p className="text-slate-400 text-[10px] truncate">{l.banco_nome}</p>}
                    </td>
                    <td className="px-3 py-2 max-w-[150px] text-slate-600 truncate">{l.tipo_documento_nome || '—'}</td>
                    <td className="px-3 py-2 max-w-[130px] text-slate-600 truncate">
                      <p className="truncate">{l.nf_doc || '—'}</p>
                      {l.documento_nome && <p className="text-slate-400 text-[10px] truncate">Anexo: {l.documento_nome}</p>}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 whitespace-nowrap">
                      {l.parcela_numero ? `${l.parcela_numero}/${l.qtd_parcelas || 1}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">{R$(valorParcela)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.dt_emissao)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.parcela_vencimento || l.proximo_venc)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.parcela_dt_pagamento)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', STATUS_COLORS[statusParcela] || STATUS_COLORS.cancelado)}>
                          {statusParcela || '—'}
                        </span>
                        {statusParcela !== 'pago' && statusParcela !== 'cancelado' && l.parcela_id && (
                          <button
                            type="button"
                            onClick={() => openBaixaModal(l)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Dar baixa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-800">Novo Lançamento — Contas a Pagar</h2>
                <p className="text-xs text-slate-500 mt-0.5">Preencha os dados do lançamento e suas parcelas</p>
              </div>
              <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {errors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{errors._geral}</div>
              )}

              {/* Dados principais */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Dados do Lançamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <F label="Empresa" name="empresa" required>
                    <select className={inp} value={fEmp} onChange={e => setFEmp(e.target.value)}>
                      <option value="">Selecione</option>
                      {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </F>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-slate-600">Fornecedor</label>
                      <button type="button" onClick={openFornecedorModal} className="text-[10px] font-semibold text-blue-700 hover:text-blue-900">
                        + Novo fornecedor
                      </button>
                    </div>
                    <select className={inp} value={fForn} onChange={e => setFForn(e.target.value)}>
                      <option value="">Selecione (opcional)</option>
                      {fornecedores
                        .filter(f => !fEmp || f.empresa === fEmp || f.empresa === 'TODOS')
                        .map(f => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <F label="Histórico" name="historico" required>
                      <input className={inp} value={fHistorico} onChange={e => setFHistorico(e.target.value)}
                        placeholder="Descrição do lançamento" />
                    </F>
                  </div>
                  <F label="Tipo de Documento" name="tipo_documento_id">
                    <select className={inp} value={fTipoDoc} onChange={e => setFTipoDoc(e.target.value)}>
                      <option value="">Selecione</option>
                      {tiposDocumento.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </F>
                  <F label="Número do Documento" name="nf_doc">
                    <input className={inp} value={fNF} onChange={e => setFNF(e.target.value)} placeholder="Ex.: NF, boleto, recibo" />
                  </F>
                  <F label="Documento em PDF ou imagem" name="documento_arquivo" full>
                    <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 cursor-pointer hover:bg-slate-100">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{fDocumentoNome || 'Selecionar arquivo PDF ou imagem'}</span>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        className="hidden"
                        onChange={e => handleDocumentoChange(e.target.files?.[0] || null)}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={analisarDocumentoIA}
                        disabled={aiLoading || !fDocumentoBase64}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {aiLoading ? 'Lendo documento...' : 'Ler dados com IA'}
                      </button>
                      {aiMessage && <span className={cn('text-[10px]', aiMessage.includes('Confira') ? 'text-emerald-600' : 'text-amber-600')}>{aiMessage}</span>}
                    </div>
                    {fDocumentoErro && <p className="text-[10px] text-red-500">{fDocumentoErro}</p>}
                  </F>
                  <F label="Plano de Contas" name="conta_contabil">
                    <select className={inp} value={fConta} onChange={e => setFConta(e.target.value)}>
                      <option value="">Selecione</option>
                      {plano.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo} – {c.descricao}</option>)}
                    </select>
                  </F>
                  <F label="Banco para Pagamento" name="banco_conta_id">
                    <select className={inp} value={fBanco} onChange={e => setFBanco(e.target.value)}>
                      <option value="">Selecione</option>
                      {bancos
                        .filter(b => !fEmp || b.empresa === fEmp)
                        .map(b => <option key={b.id} value={b.id}>{b.empresa} – {b.banco_nome} {b.agencia ? `ag.${b.agencia}` : ''} {b.conta || ''}</option>)}
                    </select>
                  </F>
                  <F label="Data de Emissão" name="dt_emissao">
                    <input className={inp} type="date" value={fEmissao} onChange={e => setFEmissao(e.target.value)} />
                  </F>
                  <F label="Centro de Custo" name="centro_custo">
                    <input className={inp} value={fCC} onChange={e => setFCC(e.target.value)} placeholder="Opcional" />
                  </F>
                </div>
              </div>

              {/* Valor e parcelas */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Valor e Parcelas</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <F label="Valor Total (R$)" name="valor" required>
                    <input className={inp} type="number" step="0.01" min="0"
                      value={fValor} onChange={e => setFValor(e.target.value)} placeholder="0,00" />
                  </F>
                  <F label="Número de Parcelas" name="qtd_parcelas">
                    <select className={inp} value={fNParc} onChange={e => setFNParc(parseInt(e.target.value))}>
                      {[1,2,3,4,5,6,7,8,9,10,11,12,18,24,36].map(n => (
                        <option key={n} value={n}>{n === 1 ? '1 (à vista)' : `${n}x`}</option>
                      ))}
                    </select>
                  </F>
                </div>

                {parcelas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-600 mb-2">Parcelas e Vencimentos</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {parcelas.map((p, i) => (
                        <div key={i} className="grid grid-cols-[76px_1fr_120px_120px] items-end gap-3 bg-slate-50 rounded-lg px-3 py-2">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Parcela</label>
                            <div className="text-xs font-semibold text-slate-600">{p.numero || i + 1}/{parcelas.length}</div>
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Vencimento</label>
                            <input type="date" value={p.vencimento}
                              onChange={e => updateParcela(i, 'vencimento', e.target.value)}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Valor</label>
                            <input type="number" step="0.01" value={p.valor}
                              onChange={e => updateParcela(i, 'valor', parseFloat(e.target.value) || 0)}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full text-right tabular-nums" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Status</label>
                            <select value={p.status || 'pendente'} onChange={e => updateParcela(i, 'status', e.target.value)}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full">
                              <option value="pendente">Pendente</option>
                              <option value="pago">Pago</option>
                              <option value="vencido">Vencido</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Obs */}
              <F label="Observações" name="obs">
                <textarea className={cn(inp, 'min-h-[56px] resize-none')}
                  value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Notas adicionais..." />
              </F>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button onClick={closeForm} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60">
                {saving ? 'Salvando…' : <><Check className="w-3.5 h-3.5" /> Salvar Lançamento</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBaixaModal && baixaParcela && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Baixa da Parcela</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {baixaParcela.fornecedor_nome || 'Fornecedor não informado'} · Parcela {baixaParcela.parcela_numero || '—'}/{baixaParcela.qtd_parcelas || 1}
                </p>
              </div>
              <button type="button" onClick={closeBaixaModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {baixaErrors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{baixaErrors._geral}</div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Valor da parcela</label>
                  <input className={inp} type="number" step="0.01" min="0"
                    value={baixaForm.valor_parcela} onChange={e => updateBaixaForm('valor_parcela', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Data de pagamento <span className="text-red-500">*</span></label>
                  <input className={cn(inp, baixaErrors.dt_pagamento && 'border-red-300')} type="date"
                    value={baixaForm.dt_pagamento} onChange={e => updateBaixaForm('dt_pagamento', e.target.value)} />
                  {baixaErrors.dt_pagamento && <p className="text-[10px] text-red-500 mt-1">{baixaErrors.dt_pagamento}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Acréscimos</label>
                  <input className={inp} type="number" step="0.01" min="0"
                    value={baixaForm.acrescimo} onChange={e => updateBaixaForm('acrescimo', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Descontos</label>
                  <input className={inp} type="number" step="0.01" min="0"
                    value={baixaForm.desconto} onChange={e => updateBaixaForm('desconto', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Juros</label>
                  <input className={inp} type="number" step="0.01" min="0"
                    value={baixaForm.juros} onChange={e => updateBaixaForm('juros', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Multa</label>
                  <input className={inp} type="number" step="0.01" min="0"
                    value={baixaForm.multa} onChange={e => updateBaixaForm('multa', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Valor final</label>
                  <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:outline-none"
                    type="number" step="0.01" value={baixaForm.valor_final} readOnly />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Forma de pagamento <span className="text-red-500">*</span></label>
                  <select className={cn(inp, baixaErrors.forma_pagamento && 'border-red-300')}
                    value={baixaForm.forma_pagamento} onChange={e => updateBaixaForm('forma_pagamento', e.target.value)}>
                    <option value="">Selecione</option>
                    <option value="Pix">Pix</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Débito automático">Débito automático</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Outro">Outro</option>
                  </select>
                  {baixaErrors.forma_pagamento && <p className="text-[10px] text-red-500 mt-1">{baixaErrors.forma_pagamento}</p>}
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600">Motivo da baixa</label>
                  <textarea className={cn(inp, 'min-h-[58px] resize-none')}
                    value={baixaForm.motivo_baixa} onChange={e => updateBaixaForm('motivo_baixa', e.target.value)}
                    placeholder="Ex.: pagamento realizado conforme boleto / ajuste manual / negociação" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button type="button" onClick={closeBaixaModal} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={salvarBaixa} disabled={savingBaixa}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-60">
                {savingBaixa ? 'Baixando…' : <><Check className="w-3.5 h-3.5" /> Confirmar baixa</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFornecedorModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center p-4 pt-10 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Novo Fornecedor</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cadastro rápido para usar neste lançamento</p>
              </div>
              <button type="button" onClick={closeFornecedorModal} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {fornecedorErrors._geral && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">{fornecedorErrors._geral}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-600">Razão Social <span className="text-red-500">*</span></label>
                  <input className={cn(inp, fornecedorErrors.razao_social && 'border-red-300')} value={novoFornecedor.razao_social}
                    onChange={e => setNovoFornecedor(v => ({ ...v, razao_social: e.target.value }))} placeholder="Nome completo / razão social" />
                  {fornecedorErrors.razao_social && <p className="text-[10px] text-red-500 mt-1">{fornecedorErrors.razao_social}</p>}
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Nome Fantasia</label>
                  <input className={inp} value={novoFornecedor.nome_fantasia}
                    onChange={e => setNovoFornecedor(v => ({ ...v, nome_fantasia: e.target.value }))} placeholder="Opcional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">CNPJ / CPF</label>
                  <input className={inp} value={novoFornecedor.cnpj_cpf}
                    onChange={e => setNovoFornecedor(v => ({ ...v, cnpj_cpf: e.target.value }))} placeholder="Opcional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Tipo de Pessoa</label>
                  <select className={inp} value={novoFornecedor.tipo_pessoa} onChange={e => setNovoFornecedor(v => ({ ...v, tipo_pessoa: e.target.value as 'PJ' | 'PF' }))}>
                    <option value="PJ">Pessoa Jurídica</option>
                    <option value="PF">Pessoa Física</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Empresa <span className="text-red-500">*</span></label>
                  <select className={cn(inp, fornecedorErrors.empresa && 'border-red-300')} value={novoFornecedor.empresa} onChange={e => setNovoFornecedor(v => ({ ...v, empresa: e.target.value }))}>
                    <option value="">Selecione</option>
                    <option value="TODOS">Todas</option>
                    {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                  {fornecedorErrors.empresa && <p className="text-[10px] text-red-500 mt-1">{fornecedorErrors.empresa}</p>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button type="button" onClick={closeFornecedorModal} className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                Cancelar
              </button>
              <button type="button" onClick={saveFornecedorRapido} disabled={savingFornecedor}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-[#1e3a5f] hover:bg-[#162d4a] text-white rounded-lg disabled:opacity-60">
                {savingFornecedor ? 'Salvando…' : <><Check className="w-3.5 h-3.5" /> Salvar Fornecedor</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
