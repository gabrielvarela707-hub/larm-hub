'use client'

import type { ElementType } from 'react'
import { useState } from 'react'
import { Plus, Zap, Play, Pause, MoreHorizontal, Mail, MessageCircle, CheckSquare, Bell, Tag, ArrowRight } from 'lucide-react'
import { cn, formatDateTime, relativeTime } from '@/lib/utils'
import { mockAutomations } from '@/lib/mock-data'
import type { Automation, TriggerType, ActionType } from '@/types'
const TRIGGER_LABELS: Record<TriggerType, string> = {
  lead_criado:       'Lead criado',
  lead_sem_resposta: 'Lead sem resposta (48h)',
  proposta_enviada:  'Proposta enviada',
  contrato_assinado: 'Contrato assinado',
  parcela_vencendo:  'Parcela vencendo (D-3)',
  parcela_atrasada:  'Parcela atrasada',
  visita_agendada:   'Visita agendada',
}
const ACTION_ICONS: Record<ActionType, ElementType> = {
  enviar_email:      Mail,
  enviar_whatsapp:   MessageCircle,
  criar_tarefa:      CheckSquare,
  mover_funil:       ArrowRight,
  adicionar_tag:     Tag,
  notificar_corretor: Bell,
const ACTION_COLORS: Record<ActionType, string> = {
  enviar_email:       'bg-blue-100 text-blue-700',
  enviar_whatsapp:    'bg-emerald-100 text-emerald-700',
  criar_tarefa:       'bg-amber-100 text-amber-700',
  mover_funil:        'bg-violet-100 text-violet-700',
  adicionar_tag:      'bg-pink-100 text-pink-700',
  notificar_corretor: 'bg-orange-100 text-orange-700',
const ACTION_LABELS: Record<ActionType, string> = {
  enviar_email:       'E-mail',
  enviar_whatsapp:    'WhatsApp',
  criar_tarefa:       'Tarefa',
  mover_funil:        'Mover funil',
  adicionar_tag:      'Tag',
  notificar_corretor: 'Notif. corretor',
export default function AutomacoesPage() {
  const [automations, setAutomations] = useState<Automation[]>(mockAutomations)
  function toggle(id: string) {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a))
  }
  const active = automations.filter(a => a.active).length
  const total = automations.length
  const totalRuns = automations.reduce((s, a) => s + a.executionCount, 0)
  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Automações de Marketing</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {active} de {total} automações ativas · {totalRuns.toLocaleString('pt-BR')} execuções totais
          </p>
        </div>
        <button className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus className="w-3.5 h-3.5" /> Nova automação
        </button>
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Ativas', value: active, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Total de execuções', value: totalRuns.toLocaleString('pt-BR'), color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Pausadas', value: total - active, color: 'text-slate-600', bg: 'bg-slate-50' },
        ].map(k => (
          <div key={k.label} className="bg-white border border-slate-100 rounded-xl p-4 shadow-card text-center">
            <p className={cn('text-2xl font-semibold', k.color)}>{k.value}</p>
            <p className="text-xs text-slate-500 mt-1">{k.label}</p>
          </div>
        ))}
      {/* Automations list */}
      <div className="space-y-3">
        {automations.map(auto => (
          <div key={auto.id} className={cn(
            'bg-white rounded-xl border shadow-card p-5 transition-all',
            auto.active ? 'border-slate-100' : 'border-slate-100 opacity-70'
          )}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                  auto.active ? 'bg-blue-100' : 'bg-slate-100'
                )}>
                  <Zap className={cn('w-4 h-4', auto.active ? 'text-blue-600' : 'text-slate-400')} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{auto.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      Gatilho: {TRIGGER_LABELS[auto.trigger]}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {auto.executionCount.toLocaleString('pt-BR')} execuções
                    {auto.lastRunAt && (
                      <span className="text-[11px] text-slate-400">
                        Último: {relativeTime(auto.lastRunAt)}
                      </span>
                    )}
                  </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => toggle(auto.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                    auto.active
                      ? 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                  )}
                >
                  {auto.active ? <><Pause className="w-3 h-3" /> Pausar</> : <><Play className="w-3 h-3" /> Ativar</>}
                </button>
                <button className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                  <MoreHorizontal className="w-4 h-4 text-slate-400" />
            </div>
            {/* Actions flow */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <Zap className="w-3 h-3 text-amber-600" />
                <span className="text-xs text-amber-800 font-medium">{TRIGGER_LABELS[auto.trigger]}</span>
              {auto.actions.map((action, idx) => {
                const Icon = ACTION_ICONS[action.type]
                return (
                  <div key={action.id} className="flex items-center gap-2">
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                    <div className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 border border-transparent', ACTION_COLORS[action.type])}>
                      <Icon className="w-3 h-3" />
                      <span className="text-xs font-medium">{ACTION_LABELS[action.type]}</span>
                      {action.delayHours > 0 && (
                        <span className="text-[10px] opacity-70">+{action.delayHours}h</span>
                      )}
                    </div>
                )
              })}
      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800">
        <strong>WhatsApp:</strong> Os envios via WhatsApp utilizam a API oficial da Meta. Os custos de envio são cobrados diretamente pela Meta Platforms. A janela de atendimento permanece aberta por 24h após cada interação do lead.
    </div>
  )
