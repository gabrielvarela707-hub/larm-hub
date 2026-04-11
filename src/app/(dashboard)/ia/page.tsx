'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, TrendingUp, Users, DollarSign, Home } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { ChatMessage } from '@/types'

const QUICK_PROMPTS = [
  { icon: DollarSign, label: 'Receitas', prompt: 'Qual é o total de receitas realizadas este mês e a previsão para o mês que vem?' },
  { icon: Users, label: 'Inadimplência', prompt: 'Quantas parcelas estão em atraso e qual o valor total em aberto?' },
  { icon: Home, label: 'Lotes disponíveis', prompt: 'Qual o total de lotes disponíveis para venda agora por empreendimento?' },
  { icon: TrendingUp, label: 'Comissões', prompt: 'Qual o total de comissões a pagar neste mês?' },
]

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'sys_1',
    role: 'assistant',
    content: `Olá! Sou o **Chat IA** do LoteMobile — sua inteligência artificial integrada aos dados reais do seu negócio.

Posso te ajudar com análises financeiras, status de leads, previsões de caixa, inadimplência e muito mais. O que você quer saber?`,
    createdAt: new Date().toISOString(),
  },
]

const MOCK_RESPONSES: Record<string, string> = {
  receita: `Com base nos dados do seu sistema:\n\n**Receitas realizadas em julho/2024:** R$ 853.420,00\n\n**Previsão para agosto/2024:** R$ 900.000,00 (estimativa baseada nos contratos ativos e vencimentos programados)\n\n📈 Isso representa um crescimento de **+5,5%** em relação a julho. Os principais contratos com vencimento em agosto são:\n- Portal do Lago II: 132 parcelas → R$ 248.040\n- Jardim Bella Vita: 38 parcelas → R$ 65.512\n- Demais contratos: R$ 586.448`,

  inadimplencia: `Aqui está o resumo de inadimplência atual:\n\n**Parcelas em atraso:** 3 parcelas\n**Valor total em aberto:** R$ 35.843,00\n\n**Detalhamento:**\n- Marcos Vinícius Borges — Vencimento 05/07 — R$ 2.504 (+multa R$ 164)\n- José dos Santos — Vencimento 28/06 — R$ 1.890 (+multa R$ 132)\n- Outros — R$ 31.449\n\n⚠️ Recomendo ativar a automação de cobrança para contatos automáticos via WhatsApp.`,

  lotes: `**Disponibilidade atual de lotes por empreendimento:**\n\n🏗️ **Portal do Lago II**\n- Disponíveis: 87 lotes\n- Reservados: 21 lotes\n- Vendidos: 132 lotes\n- Taxa de ocupação: 63,7%\n\n🌿 **Jardim Bella Vita**\n- Disponíveis: 112 lotes\n- Reservados: 10 lotes\n- Vendidos: 38 lotes\n- Taxa de ocupação: 30%\n\n✅ **Grand Hill Residence**\n- 100% vendido\n\n**Total disponível para venda: 174 lotes**`,

  comissoes: `**Comissões a pagar em julho/2024:**\n\nBaseado nos contratos assinados e política de comissão configurada:\n\n| Corretor | Contratos | Comissão |\n|---|---|---|\n| Carlos Henrique | 3 vendas | R$ 8.400 |\n| Ana Paula Costa | 2 vendas | R$ 5.600 |\n| Roberto Lima | 1 venda | R$ 2.800 |\n\n**Total a pagar: R$ 21.000,00**\n\nVencimento previsto: 31/07/2024`,
}

function getAIResponse(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('receita') || lower.includes('mês que vem') || lower.includes('previsão')) return MOCK_RESPONSES.receita
  if (lower.includes('atraso') || lower.includes('inadimpl') || lower.includes('aberto')) return MOCK_RESPONSES.inadimplencia
  if (lower.includes('lote') || lower.includes('disponív')) return MOCK_RESPONSES.lotes
  if (lower.includes('comissão') || lower.includes('comissoes')) return MOCK_RESPONSES.comissoes
  return `Entendido! Analisando os dados do seu sistema...\n\nBaseado nas informações atuais: você tem **3 empreendimentos ativos**, **184 leads em andamento**, **226 lotes vendidos** e receita acumulada de **R$ 8.534.200** em 2024.\n\nPode ser mais específico? Posso analisar financeiro, leads, contratos, obras ou qualquer outro módulo do seu sistema.`
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser ? 'bg-blue-600' : 'bg-slate-800'
      )}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className={cn(
        'max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
        isUser
          ? 'bg-blue-600 text-white rounded-br-sm'
          : 'bg-white border border-slate-100 text-slate-800 rounded-bl-sm shadow-card'
      )}>
        <div
          className={cn('prose-chat', isUser ? 'text-white' : '')}
          dangerouslySetInnerHTML={{
            __html: msg.content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\n/g, '<br/>')
              .replace(/\| (.*?) \|/g, '<td>$1</td>')
          }}
        />
      </div>
    </div>
  )
}

export default function ChatIAPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim()) return
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800))
    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: getAIResponse(text),
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, aiMsg])
    setLoading(false)
  }

  return (
    <div className="flex flex-col max-w-3xl mx-auto" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200">
        <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900">Chat IA</h1>
          <p className="text-xs text-slate-500">Conectado aos dados reais do seu sistema</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse-dot" />
          Online
        </div>
      </div>

      {/* Quick prompts */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {QUICK_PROMPTS.map(q => (
          <button
            key={q.label}
            onClick={() => sendMessage(q.prompt)}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:text-blue-700 transition-colors"
          >
            <q.icon className="w-3.5 h-3.5" />
            {q.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white border border-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-card">
              <div className="flex gap-1 items-center h-5">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse-dot [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 bg-white border border-slate-200 rounded-2xl flex items-end gap-2 p-2 shadow-card">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
          placeholder="O que você quer saber? Ex: qual o valor a receber na semana que vem?"
          rows={1}
          className="flex-1 resize-none outline-none text-sm text-slate-800 placeholder:text-slate-400 px-2 py-1.5 max-h-28 leading-relaxed"
          style={{ scrollbarWidth: 'none' }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          className={cn(
            'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors',
            input.trim() && !loading
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          )}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
