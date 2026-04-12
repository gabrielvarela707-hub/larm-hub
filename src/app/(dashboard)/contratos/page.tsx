'use client'

import { useState } from 'react'
import {
  Plus, FileText, Upload, Download, Eye, Search,
  CheckCircle, Clock, X, AlertCircle, Pencil, Tag,
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

type ContratoStatus = 'rascunho' | 'aguardando_assinatura' | 'assinado' | 'distratado' | 'quitado'

interface Contrato {
  id: string
  numero: string
  comprador: string
  cpf: string
  telefone: string
  lote: string
  valor: number
  entrada: number
  parcelas: number
  valorParcela: number
  status: ContratoStatus
  assinadoEm?: string
  criadoEm: string
  corretor: string
}

const STATUS_CFG: Record<ContratoStatus, { label: string; color: string }> = {
  rascunho:             { label: 'Rascunho',            color: 'bg-slate-100 text-slate-600' },
  aguardando_assinatura:{ label: 'Aguard. assinatura',  color: 'bg-amber-100 text-amber-700' },
  assinado:             { label: 'Assinado',            color: 'bg-blue-100 text-blue-700' },
  distratado:           { label: 'Distratado',          color: 'bg-red-100 text-red-700' },
  quitado:              { label: 'Quitado',             color: 'bg-emerald-100 text-emerald-700' },
}

const MOCK: Contrato[] = [
  { id: 'c1', numero: 'SC-001/2026', comprador: 'Carlos Henrique Silva', cpf: '123.456.789-00', telefone: '(12) 99876-5432', lote: 'Qd A · Lt 01', valor: 220000, entrada: 22000, parcelas: 180, valorParcela: 1100, status: 'assinado', assinadoEm: '2026-03-15T00:00:00Z', criadoEm: '2026-03-10T00:00:00Z', corretor: 'Ana Paula' },
  { id: 'c2', numero: 'SC-002/2026', comprador: 'Fernanda Lima Cruz', cpf: '987.654.321-00', telefone: '(12) 99712-6635', lote: 'Qd B · Lt 07', valor: 195000, entrada: 19500, parcelas: 150, valorParcela: 1170, status: 'aguardando_assinatura', criadoEm: '2026-04-01T00:00:00Z', corretor: 'Carlos Henrique' },
  { id: 'c3', numero: 'SC-003/2026', comprador: 'Roberto Carlos Machado', cpf: '111.222.333-44', telefone: '(11) 99712-6635', lote: 'Qd A · Lt 05', valor: 185000, entrada: 18500, parcelas: 180, valorParcela: 930, status: 'rascunho', criadoEm: '2026-04-08T00:00:00Z', corretor: 'Ana Paula' },
]

interface TemplateField {
  id: string
  label: string
  tag: string
  example: string
}

const TEMPLATE_FIELDS: TemplateField[] = [
  { id: 'f1', label: 'Nome do comprador',   tag: '{{NOME_COMPRADOR}}',  example: 'Carlos Henrique Silva' },
  { id: 'f2', label: 'CPF do comprador',    tag: '{{CPF_COMPRADOR}}',   example: '123.456.789-00' },
  { id: 'f3', label: 'Valor total',         tag: '{{VALOR_TOTAL}}',     example: 'R$ 220.000,00' },
  { id: 'f4', label: 'Valor da entrada',    tag: '{{VALOR_ENTRADA}}',   example: 'R$ 22.000,00' },
  { id: 'f5', label: 'Qtd de parcelas',     tag: '{{QTD_PARCELAS}}',    example: '180' },
  { id: 'f6', label: 'Valor da parcela',    tag: '{{VALOR_PARCELA}}',   example: 'R$ 1.100,00' },
  { id: 'f7', label: 'Descricao do lote',   tag: '{{LOTE}}',            example: 'Quadra A, Lote 01' },
  { id: 'f8', label: 'Area do lote',        tag: '{{AREA_LOTE}}',       example: '300 m²' },
  { id: 'f9', label: 'Data do contrato',    tag: '{{DATA_CONTRATO}}',   example: '15/03/2026' },
  { id: 'f10',label: 'Nome do corretor',    tag: '{{CORRETOR}}',        example: 'Ana Paula Costa' },
  { id: 'f11',label: 'Empreendimento',      tag: '{{EMPREENDIMENTO}}',  example: 'Residencial Santa Clara' },
]

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>(MOCK)
  const [search, setSearch]       = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [copiedTag, setCopiedTag]       = useState('')

  const filtered = contratos.filter(c =>
    !search || c.comprador.toLowerCase().includes(search.toLowerCase()) ||
    c.numero.includes(search)
  )

  function copyTag(tag: string) {
    navigator.clipboard?.writeText(tag)
    setCopiedTag(tag)
    setTimeout(() => setCopiedTag(''), 1500)
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Contratos</h1>
          <p className="text-sm text-slate-500 mt-0.5">{contratos.length} contratos · {contratos.filter(c=>c.status==='assinado').length} assinados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplate(true)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Upload className="w-4 h-4" /> Modelo de contrato
          </button>
          <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo contrato
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {(['rascunho','aguardando_assinatura','assinado','quitado'] as ContratoStatus[]).map(s => (
          <div key={s} className="bg-white border border-slate-100 rounded-xl p-4 shadow-card text-center">
            <p className="text-2xl font-bold text-slate-900">{contratos.filter(c=>c.status===s).length}</p>
            <p className={cn('text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block', STATUS_CFG[s].color)}>
              {STATUS_CFG[s].label}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 w-fit">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar contrato..." className="text-sm outline-none w-48 placeholder:text-slate-400" />
      </div>

      <div className="bg-white rounded-xl border border-slate-100 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              {['Numero','Comprador','Lote','Valor total','Parcelas','Corretor','Status','Acoes'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-blue-700">{c.numero}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{c.comprador}</p>
                  <p className="text-xs text-slate-400">{c.cpf}</p>
                </td>
                <td className="px-4 py-3 text-slate-600 text-xs">{c.lote}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{formatCurrency(c.valor)}</td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  <p>{c.parcelas}x de {formatCurrency(c.valorParcela)}</p>
                  <p className="text-slate-400">Entrada: {formatCurrency(c.entrada)}</p>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{c.corretor}</td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_CFG[c.status].color)}>
                    {STATUS_CFG[c.status].label}
                  </span>
                  {c.assinadoEm && <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(c.assinadoEm)}</p>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button className="p-1.5 rounded hover:bg-blue-100 text-slate-400 hover:text-blue-600 transition-colors" title="Ver">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Download">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {c.status !== 'assinado' && (
                      <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors" title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Template modal */}
      {showTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowTemplate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-dialog" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Modelo de Contrato</h2>
                <p className="text-xs text-slate-500 mt-0.5">Faca upload do .docx e use as tags abaixo para campos dinamicos</p>
              </div>
              <button onClick={() => setShowTemplate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-600 mb-1.5">Nome do modelo</label>
                <input value={templateName} onChange={e => setTemplateName(e.target.value)}
                  placeholder="ex: Contrato Padrao Santa Clara 2026"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>

              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-200 rounded-xl p-8 cursor-pointer hover:border-blue-300 hover:bg-slate-50 transition-colors">
                <input type="file" accept=".docx,.pdf,.doc" className="hidden" />
                <Upload className="w-10 h-10 text-slate-400" />
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700">Clique para fazer upload do modelo</p>
                  <p className="text-xs text-slate-500 mt-0.5">Word (.docx) ou PDF — max 10MB</p>
                </div>
              </label>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-blue-600" />
                  <p className="text-sm font-semibold text-slate-900">Tags para campos dinamicos</p>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                  Insira estas tags no seu documento Word nos locais que mudam por contrato. O sistema substituira automaticamente pelos dados reais.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {TEMPLATE_FIELDS.map(field => (
                    <div key={field.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700">{field.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">ex: {field.example}</p>
                      </div>
                      <button onClick={() => copyTag(field.tag)}
                        className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors',
                          copiedTag === field.tag
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-white border border-slate-200 text-blue-700 hover:bg-blue-50'
                        )}>
                        {copiedTag === field.tag ? <><CheckCircle className="w-3 h-3" /> Copiado!</> : field.tag}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 leading-relaxed">
                <strong>Como usar:</strong> No Word, onde estiver o nome do comprador escreva <code>{'{{NOME_COMPRADOR}}'}</code>. Quando o sistema gerar o contrato, substituira automaticamente pelo nome real do cliente.
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowTemplate(false)} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" /> Salvar modelo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
