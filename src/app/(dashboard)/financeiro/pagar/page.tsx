'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, X, Check, FileText } from 'lucide-react'
import { apiClient } from '@/lib/auth-store'
import { cn } from '@/lib/utils'

interface Fornecedor { id: number; razao_social: string; empresa: string }
interface BancoConta { id: number; empresa: string; banco_nome: string; agencia: string | null; conta: string | null }
interface PlanoConta  { id: number; codigo: string; descricao: string; tipo: string }
interface TipoDocumento { id: number; nome: string }
interface Parcela     { id?: number; numero: number; valor: number; vencimento: string; status: string }

interface Lancamento {
  id: number; empresa: string; historico: string; produto_servico: string | null
  tipo_documento_id?: number | null; tipo_documento_nome?: string | null
  nf_doc: string | null; documento_nome?: string | null; dt_emissao: string | null; valor_total: number
  qtd_parcelas: number; status: string; conta_contabil: string | null
  descricao_conta: string | null; centro_custo: string | null; obs: string | null
  fornecedor_nome: string | null; banco_nome: string | null; proximo_venc: string | null
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
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return String(d) }
}

export default function PagarPage() {
  const [lista,     setLista]     = useState<Lancamento[]>([])
  const [total,     setTotal]     = useState(0)
  const [totalVlr,  setTotalVlr]  = useState(0)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [showForm,  setShowForm]  = useState(false)

  // Listas para selects
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [bancos,       setBancos]       = useState<BancoConta[]>([])
  const [plano,        setPlano]        = useState<PlanoConta[]>([])
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([])

  // Filtros
  const [fEmpresa, setFEmpresa] = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fBusca,   setFBusca]   = useState('')

  // Form state
  const [fEmp,     setFEmp]     = useState('')
  const [fForn,    setFForn]    = useState('')
  const [fBanco,   setFBanco]   = useState('')
  const [fConta,   setFConta]   = useState('')
  const [fHistorico, setFHistorico] = useState('')
  const [fTipoDoc, setFTipoDoc] = useState('')
  const [fNF,      setFNF]      = useState('')
  const [fEmissao, setFEmissao] = useState(new Date().toISOString().split('T')[0])
  const [fValor,   setFValor]   = useState('')
  const [fNParc,   setFNParc]   = useState(1)
  const [fCC,      setFCC]      = useState('')
  const [fObs,     setFObs]     = useState('')
  const [fDocumentoNome,   setFDocumentoNome]   = useState('')
  const [fDocumentoMime,   setFDocumentoMime]   = useState('')
  const [fDocumentoBase64, setFDocumentoBase64] = useState('')
  const [fDocumentoErro,   setFDocumentoErro]   = useState('')
  const [parcelas, setParcelas] = useState<Parcela[]>([])
  const [errors,   setErrors]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (fEmpresa) params.empresa = fEmpresa
      if (fStatus)  params.status  = fStatus
      if (fBusca)   params.busca   = fBusca
      const r = await apiClient.get('/financeiro/lancamentos-cp', { params })
      setLista(r.data.data)
      setTotal(r.data.total)
      setTotalVlr(r.data.total_valor)
    } catch { }
    finally { setLoading(false) }
  }, [fEmpresa, fStatus, fBusca])

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

  function openNew() { setShowForm(true); setErrors({}) }
  function closeForm() {
    setShowForm(false)
    setFEmp(''); setFForn(''); setFBanco(''); setFConta(''); setFHistorico('')
    setFTipoDoc(''); setFNF(''); setFValor(''); setFNParc(1); setFCC(''); setFObs('')
    setFDocumentoNome(''); setFDocumentoMime(''); setFDocumentoBase64(''); setFDocumentoErro('')
    setParcelas([]); setErrors({})
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

  const inp = 'w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100'
  const F = useCallback(({ label, name, required, children, full }: { label: string; name: string; required?: boolean; children: React.ReactNode; full?: boolean }) => (
    <div className={cn('flex flex-col gap-1', full && 'col-span-2')}>
      <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {errors[name] && <p className="text-[10px] text-red-500">{errors[name]}</p>}
    </div>
  ), [errors])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Contas a Pagar</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} lançamentos · {R$(totalVlr)} em aberto</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] hover:bg-[#162d4a] text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" /> Novo Lançamento
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={fBusca} onChange={e => setFBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Fornecedor ou histórico…"
            className="pl-9 pr-4 py-2 w-full text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-400" />
        </div>
        <select value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
          <option value="">Todas empresas</option>
          {EMPRESAS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700">
          <option value="">Todos status</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
          <option value="vencido">Vencido</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d1b2a] text-white">
                {['Empresa','Fornecedor','Histórico / Documento','Conta','Valor Total','Parcelas','Próx. Venc.','Status'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && [...Array(6)].map((_,i) => (
                <tr key={i} className="border-b border-slate-50">
                  {[...Array(8)].map((_,j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${50+((i*11+j*9)%40)}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && lista.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-12 text-sm">
                  Nenhum lançamento encontrado
                </td></tr>
              )}
              {!loading && lista.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-medium">{l.empresa}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[160px]">
                    <p className="font-medium text-slate-700 truncate">{l.fornecedor_nome || '—'}</p>
                    {l.banco_nome && <p className="text-slate-400 text-[10px]">{l.banco_nome}</p>}
                  </td>
                  <td className="px-3 py-2 max-w-[200px]">
                    <p className="text-slate-700 truncate">{l.historico}</p>
                    {(l.tipo_documento_nome || l.nf_doc) && <p className="text-slate-400 text-[10px] truncate">{[l.tipo_documento_nome, l.nf_doc].filter(Boolean).join(' · ')}</p>}
                    {l.documento_nome && <p className="text-slate-400 text-[10px] truncate">Anexo: {l.documento_nome}</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-[10px]">
                    {l.conta_contabil ? `${l.conta_contabil} – ${l.descricao_conta || ''}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{R$(l.valor_total)}</td>
                  <td className="px-3 py-2 text-center text-slate-500">{l.qtd_parcelas}x</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{fmtDate(l.proximo_venc)}</td>
                  <td className="px-3 py-2">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', STATUS_COLORS[l.status] || STATUS_COLORS.cancelado)}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
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
                  <F label="Fornecedor" name="fornecedor_id">
                    <select className={inp} value={fForn} onChange={e => setFForn(e.target.value)}>
                      <option value="">Selecione (opcional)</option>
                      {fornecedores
                        .filter(f => !fEmp || f.empresa === fEmp || f.empresa === 'TODOS')
                        .map(f => <option key={f.id} value={f.id}>{f.razao_social}</option>)}
                    </select>
                  </F>
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
                        <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2">
                          <span className="text-[10px] font-semibold text-slate-500 w-14">{i+1}/{parcelas.length}</span>
                          <div className="flex-1">
                            <input type="date" value={p.vencimento}
                              onChange={e => updateParcela(i, 'vencimento', e.target.value)}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full" />
                          </div>
                          <div className="w-28">
                            <input type="number" step="0.01" value={p.valor}
                              onChange={e => updateParcela(i, 'valor', parseFloat(e.target.value))}
                              className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-full text-right tabular-nums" />
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
    </div>
  )
}
