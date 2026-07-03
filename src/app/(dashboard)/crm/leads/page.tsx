'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Filter,
  Handshake,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { cn, formatDate, formatDateTime, formatPhone, initials } from '@/lib/utils'
import { useTenantConfig } from '@/lib/tenant-config-store'

type YesNo = 'SIM' | 'NÃO' | ''
type LeadTab = 'all' | 'negotiation' | 'future'
type StageFilter = 'all' | 'responded' | 'interested' | 'visited' | 'converted'
type SortOption = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc'
type LeadSection = 'general' | 'future' | 'sold'
type SheetCell = string | number | boolean | Date | null | undefined

type LeadRecord = {
  id: string
  section: LeadSection
  dataLabel: string
  dataISO: string
  nome: string
  telefone: string
  respondeu: YesNo
  interesse: YesNo
  visita: YesNo
  converteu: YesNo
  origem: string
  detalhamento: string
  mentionedDates: string[]
}

type WorkbookData = {
  all: LeadRecord[]
  sold: LeadRecord[]
  future: LeadRecord[]
}

type TimelineItem = {
  id: string
  title: string
  dateLabel: string
  done: boolean
}

type SmsLogEntry = {
  id: string
  leadId: string
  leadName: string
  phoneNumber: string
  message: string
  sentAt: string
  mode: 'mock' | 'live'
  status: 'success' | 'error'
  providerMessageId?: string
  error?: string
}

type SmsApiResult = {
  phoneNumber: string
  success: boolean
  messageId?: string
  requestId?: string
  error?: string
}

const TAB_LABELS: Record<LeadTab, string> = {
  all: 'Todos os leads',
  negotiation: 'Em negociação',
  future: 'Futuras negociações',
}

const SECTION_LABELS: Record<LeadSection, string> = {
  general: 'Base geral',
  sold: 'Venda realizada',
  future: 'Futuras negociações',
}

const YES_BADGE_STYLES: Record<YesNo, string> = {
  SIM: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  'NÃO': 'bg-slate-100 text-slate-600 border border-slate-200',
  '': 'bg-slate-100 text-slate-400 border border-slate-200',
}

function normalizeText(value: SheetCell): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return formatDate(value)
  return String(value).replace(/\s+/g, ' ').trim()
}

function normalizeHeader(value: SheetCell): string {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function toISODate(dateLabel: string): string {
  const match = dateLabel.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return ''
  const [, day, month, year] = match
  return new Date(Number(year), Number(month) - 1, Number(day)).toISOString()
}

function createLead(input: Omit<LeadRecord, 'mentionedDates' | 'dataISO'>): LeadRecord {
  return {
    ...input,
    dataISO: toISODate(input.dataLabel),
    mentionedDates: extractMentionedDates(input.detalhamento),
  }
}

const MOCK_DATA: WorkbookData = {
  all: [
    createLead({ id: 'mock-all-1', section: 'general', dataLabel: '15/09/2025', nome: 'Lead sem nome', telefone: '11 99872-7428', respondeu: 'NÃO', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'SEM RESPOSTA' }),
    createLead({ id: 'mock-all-2', section: 'general', dataLabel: '17/09/2025', nome: 'Lead sem nome', telefone: '21 98819-2379', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'PERGUNTOU SE ERA CONDOMÍNIO' }),
    createLead({ id: 'mock-all-3', section: 'general', dataLabel: '18/09/2025', nome: 'Lead sem nome', telefone: '41 9565-5282', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'PENSOU QUE FOSSE REJENTE FEIJÓ' }),
    createLead({ id: 'mock-all-4', section: 'general', dataLabel: '18/09/2025', nome: 'Lead sem nome', telefone: '12 99623-1061', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'NÃO É COMPRADOR, QUERIA INFORMAÇÕES' }),
    createLead({ id: 'mock-all-5', section: 'general', dataLabel: '19/09/2025', nome: 'Lead sem nome', telefone: '12 98127-8728', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'SOMENTE PESQUISANDO' }),
    createLead({ id: 'mock-all-6', section: 'general', dataLabel: '19/09/2025', nome: 'Lead sem nome', telefone: '12 99671-0477', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'PROCURA LOTE DE ATÉ R$60 MIL' }),
    createLead({ id: 'mock-all-7', section: 'general', dataLabel: '20/09/2025', nome: 'Lead sem nome', telefone: '12 99608-4814', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'ACHOU LONGE, NÃO SABIA QUE ERA EM PINDA' }),
    createLead({ id: 'mock-all-8', section: 'general', dataLabel: '20/09/2025', nome: 'Lead sem nome', telefone: '13 99672-9328', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'PROCURA LOTE DE ATÉ R$65 MIL' }),
    createLead({ id: 'mock-all-9', section: 'general', dataLabel: '21/09/2025', nome: 'Lead sem nome', telefone: '11 97433-2367', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'VALOR FORA DO QUE PROCURA' }),
    createLead({ id: 'mock-all-10', section: 'general', dataLabel: '23/09/2025', nome: 'Lead sem nome', telefone: '15 99782-0090', respondeu: 'SIM', interesse: 'SIM', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'DISSE QUE VIRÁ A PINDA, E FARÁ CONTATO.' }),
    createLead({ id: 'mock-all-11', section: 'general', dataLabel: '24/09/2025', nome: 'Juliana', telefone: '11 95914-6979', respondeu: 'SIM', interesse: 'SIM', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'CONVERSARAM BASTANTE, O NAMORADO TEM FAMÍLIA EM ROSEIRA, ELA IRÁ LEVAR AS INFORMAÇÕES PARA ELE, E VAI DECIDIR O INTERESSE DE COMPRA' }),
    createLead({ id: 'mock-all-12', section: 'general', dataLabel: '29/09/2025', nome: 'Lead sem nome', telefone: '12 97403-8626', respondeu: 'SIM', interesse: 'SIM', visita: 'NÃO', converteu: 'NÃO', origem: 'MORA EM PINDA', detalhamento: 'MORA EM PINDA, ESTÁ CONVERSANDO COM O MARIDO, JÁ INICIAMOS A CONTINUIDADE DO ATENDIMENTO, E AGUARDANDO RETORNO.' }),
    createLead({ id: 'mock-all-13', section: 'general', dataLabel: '01/10/2025', nome: 'Fabrizia', telefone: '12 98852-1503', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'FABRIZIA, ESTAMOS CONVERSANDO' }),
    createLead({ id: 'mock-all-14', section: 'general', dataLabel: '03/10/2025', nome: 'Camila', telefone: '11 94166-8577', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'CAMILA, FEZ CONTATO, E ESTAMOS CONVERSANDO' }),
    createLead({ id: 'mock-all-15', section: 'general', dataLabel: '09/10/2025', nome: 'Leandro', telefone: '13 98170-2002', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'MORA EM SANTOS', detalhamento: 'LEANDRO - RESPONDEU A PRIMEIRA - mora em Santos - estou buscando continuar o diálogo' }),
  ],
  sold: [
    createLead({ id: 'mock-sold-1', section: 'sold', dataLabel: '26/09/2025', nome: 'Edmar', telefone: '11 99764-4978', respondeu: 'SIM', interesse: 'SIM', visita: 'SIM', converteu: 'SIM', origem: 'NÃO INFORMOU', detalhamento: 'INQUILINO DA IMOBILIARIA, JÁ ESTAVA CONVERSANDO COM A CORRETORA, COMPROU O LOTE 01 DA QUADRA Y3' }),
    createLead({ id: 'mock-sold-2', section: 'sold', dataLabel: '08/10/2025', nome: 'Umberto', telefone: '12 99261-4182', respondeu: 'SIM', interesse: 'SIM', visita: 'SIM', converteu: 'SIM', origem: 'MORA NA REGIÃO', detalhamento: 'FECHOU PROPOSTA DO LOTE L-07_UMBERTO, ESTÁ FORA DO PAÍS, ESTAREI PESSOALMENTE COM A ESPOSA - mora em Pinda, DIA 11/10 FIZEMOS A VISITA E ADIANTAMOS TUDO PARA O FECHAMENTO, HOJE CONVERSAREMOS NOVAMENTE, O MARIDO ESTA FORA DO BRASIL;' }),
    createLead({ id: 'mock-sold-3', section: 'sold', dataLabel: '08/10/2025', nome: 'Regina', telefone: '12 99666-0556', respondeu: 'SIM', interesse: 'SIM', visita: 'SIM', converteu: 'SIM', origem: 'MORA NA REGIÃO', detalhamento: 'FECHOU PROPOSTA DO LOTE L-06_REGINA, ESTAMOS CONVERSANDO PARA O CASAL VIR VISITAR O LOTEAMENTO - moram em Pinda' }),
    createLead({ id: 'mock-sold-4', section: 'sold', dataLabel: '11/02/2026', nome: 'Fernanda', telefone: '12 99712-6635', respondeu: 'SIM', interesse: 'SIM', visita: 'SIM', converteu: 'SIM', origem: 'NÃO INFORMOU', detalhamento: 'FECHOU A COMPRA DO LOTE T-1 EM 19/02/2026' }),
  ],
  future: [
    createLead({ id: 'mock-future-1', section: 'future', dataLabel: '23/09/2025', nome: 'Lead sem nome', telefone: '15 99782-0090', respondeu: 'SIM', interesse: 'SIM', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'DISSE QUE VIRÁ A PINDA, E FARÁ CONTATO.' }),
    createLead({ id: 'mock-future-2', section: 'future', dataLabel: '24/09/2025', nome: 'Juliana', telefone: '11 95914-6979', respondeu: 'SIM', interesse: 'SIM', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'CONVERSARAM BASTANTE, O NAMORADO TEM FAMÍLIA EM ROSEIRA, ELA IRÁ LEVAR AS INFORMAÇÕES PARA ELE, E VAI DECIDIR O INTERESSE DE COMPRA' }),
    createLead({ id: 'mock-future-3', section: 'future', dataLabel: '29/09/2025', nome: 'Lead sem nome', telefone: '12 97403-8626', respondeu: 'SIM', interesse: 'SIM', visita: 'NÃO', converteu: 'NÃO', origem: 'MORA EM PINDA', detalhamento: 'MORA EM PINDA, ESTÁ CONVERSANDO COM O MARIDO, JÁ INICIAMOS A CONTINUIDADE DO ATENDIMENTO, E AGUARDANDO RETORNO.' }),
    createLead({ id: 'mock-future-4', section: 'future', dataLabel: '01/10/2025', nome: 'Fabrizia', telefone: '12 98852-1503', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'FABRIZIA, ESTAMOS CONVERSANDO' }),
    createLead({ id: 'mock-future-5', section: 'future', dataLabel: '03/10/2025', nome: 'Camila', telefone: '11 94166-8577', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'CAMILA, FEZ CONTATO, E ESTAMOS CONVERSANDO' }),
    createLead({ id: 'mock-future-6', section: 'future', dataLabel: '04/10/2025', nome: 'Luiz Flavio', telefone: '12 98190-5607', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'LUIZ FLAVIO, JÁ ESTAMOS CONVERSANDO - CORRETOR EM AÇÃO' }),
    createLead({ id: 'mock-future-7', section: 'future', dataLabel: '04/10/2025', nome: 'Samia', telefone: '12 99182-7456', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'SAMIA, A CORRETORA ESTÁ EM ATENDIMENTO' }),
    createLead({ id: 'mock-future-8', section: 'future', dataLabel: '06/10/2025', nome: 'Carla', telefone: '12 98166-2045', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'CORRETOR EM ATENDIMENTO - CLIENTE CARLA' }),
    createLead({ id: 'mock-future-9', section: 'future', dataLabel: '06/10/2025', nome: 'Gisele', telefone: '12 98130-5833', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'GISELE - CORRETOR EM ATENDIMENTO' }),
    createLead({ id: 'mock-future-10', section: 'future', dataLabel: '07/10/2025', nome: 'Flavia', telefone: '12 99756-9770', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'FLAVIA - ESTAMOS CONVERSANDO' }),
    createLead({ id: 'mock-future-11', section: 'future', dataLabel: '07/10/2025', nome: 'Lead sem nome', telefone: '12 99250-5997', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'NÃO INFORMOU', detalhamento: 'É CAMINHONEIRO, VAI AGENDAR UMA VISITA QUANDO CHEGAR' }),
    createLead({ id: 'mock-future-12', section: 'future', dataLabel: '09/10/2025', nome: 'Leandro', telefone: '13 98170-2002', respondeu: 'SIM', interesse: 'NÃO', visita: 'NÃO', converteu: 'NÃO', origem: 'MORA EM SANTOS', detalhamento: 'LEANDRO - RESPONDEU A PRIMEIRA - mora em Santos - estou buscando continuar o diálogo' }),
  ],
}

function parseDateCell(value: SheetCell): { label: string; iso: string } {
  if (value instanceof Date) {
    return {
      label: formatDate(value),
      iso: value.toISOString(),
    }
  }

  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      const date = new Date(parsed.y, parsed.m - 1, parsed.d)
      return {
        label: formatDate(date),
        iso: date.toISOString(),
      }
    }
  }

  const raw = normalizeText(value)
  if (!raw) {
    return { label: '', iso: '' }
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) {
    const [, day, month, year] = brMatch
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return {
      label: raw,
      iso: date.toISOString(),
    }
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return {
      label: formatDate(parsed),
      iso: parsed.toISOString(),
    }
  }

  return { label: raw, iso: '' }
}

function normalizeYesNo(value: SheetCell): YesNo {
  const text = normalizeHeader(value)
  if (text.includes('SIM')) return 'SIM'
  if (text.includes('NAO') || text.includes('NÃO')) return 'NÃO'
  return ''
}

function extractMentionedDates(text: string): string[] {
  const matches = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? []
  return Array.from(new Set(matches))
}

function isHeaderRow(row: SheetCell[]): boolean {
  return normalizeHeader(row[0]) === 'DATA' && normalizeHeader(row[2]) === 'TELEFONE'
}

function parseLeadRows(rows: SheetCell[][], startIndex: number, endIndex: number, section: LeadSection): LeadRecord[] {
  const leads: LeadRecord[] = []

  for (let index = startIndex; index < endIndex; index += 1) {
    const row = rows[index] ?? []
    const firstCell = normalizeHeader(row[0])

    if (!row.length || isHeaderRow(row)) continue
    if (firstCell.startsWith('*')) break

    const data = parseDateCell(row[0])
    const nome = normalizeText(row[1]) || 'Lead sem nome'
    const telefone = normalizeText(row[2])
    const detalhamento = normalizeText(row[8])

    if (!data.label && !telefone && !detalhamento) continue

    leads.push({
      id: `${section}_${index}_${telefone.replace(/\D/g, '') || nome.replace(/\s+/g, '_').toLowerCase()}`,
      section,
      dataLabel: data.label,
      dataISO: data.iso,
      nome,
      telefone,
      respondeu: normalizeYesNo(row[3]),
      interesse: normalizeYesNo(row[4]),
      visita: normalizeYesNo(row[5]),
      converteu: normalizeYesNo(row[6]),
      origem: normalizeText(row[7]) || 'Não informou',
      detalhamento,
      mentionedDates: extractMentionedDates(detalhamento),
    })
  }

  return leads
}

function parseWorkbook(buffer: ArrayBuffer): WorkbookData {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const secondSheet = workbook.Sheets[workbook.SheetNames[1]]

  const firstRows = XLSX.utils.sheet_to_json<SheetCell[]>(firstSheet, {
    header: 1,
    defval: '',
  })

  const generalHeaderIndex = firstRows.findIndex(isHeaderRow)
  const generalLeads = generalHeaderIndex >= 0
    ? parseLeadRows(firstRows, generalHeaderIndex + 1, firstRows.length, 'general')
    : []

  if (!secondSheet) {
    return {
      all: generalLeads,
      sold: [],
      future: [],
    }
  }

  const secondRows = XLSX.utils.sheet_to_json<SheetCell[]>(secondSheet, {
    header: 1,
    defval: '',
  })

  const soldSectionIndex = secondRows.findIndex((row) => normalizeHeader(row[0]).includes('VENDAS REALIZADAS'))
  const futureSectionIndex = secondRows.findIndex((row) => normalizeHeader(row[0]).includes('FUTURAS NEGOCIACOES'))

  const soldHeaderIndex = soldSectionIndex >= 0
    ? secondRows.findIndex((row, rowIndex) => rowIndex > soldSectionIndex && isHeaderRow(row))
    : -1

  const futureHeaderIndex = futureSectionIndex >= 0
    ? secondRows.findIndex((row, rowIndex) => rowIndex > futureSectionIndex && isHeaderRow(row))
    : -1

  const soldLeads = soldHeaderIndex >= 0
    ? parseLeadRows(secondRows, soldHeaderIndex + 1, futureSectionIndex >= 0 ? futureSectionIndex : secondRows.length, 'sold')
    : []

  const futureLeads = futureHeaderIndex >= 0
    ? parseLeadRows(secondRows, futureHeaderIndex + 1, secondRows.length, 'future')
    : []

  return {
    all: generalLeads,
    sold: soldLeads,
    future: futureLeads,
  }
}

function buildTimeline(lead: LeadRecord): TimelineItem[] {
  const fallbackDate = lead.dataLabel || 'Sem data'
  const timeline: TimelineItem[] = [
    {
      id: 'entrada',
      title: lead.section === 'future' ? 'Lead movido para futuras negociações' : 'Lead registrado na base',
      dateLabel: fallbackDate,
      done: true,
    },
  ]

  if (lead.respondeu === 'SIM') {
    timeline.push({ id: 'respondeu', title: 'Respondeu à abordagem', dateLabel: fallbackDate, done: true })
  }

  if (lead.interesse === 'SIM') {
    timeline.push({ id: 'interesse', title: 'Demonstrou interesse', dateLabel: fallbackDate, done: true })
  }

  if (lead.visita === 'SIM') {
    timeline.push({ id: 'visita', title: 'Visita marcada', dateLabel: lead.mentionedDates[0] || fallbackDate, done: true })
  }

  if (lead.converteu === 'SIM') {
    timeline.push({
      id: 'conversao',
      title: 'Conversão registrada',
      dateLabel: lead.mentionedDates[0] || fallbackDate,
      done: true,
    })
  }

  return timeline
}

function ResponseBadge({ value, dateLabel }: { value: YesNo; dateLabel: string }) {
  const label = value || '—'
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', YES_BADGE_STYLES[value])}>
        {label}
      </span>
      {value === 'SIM' && dateLabel && <span className="text-[10px] text-slate-400">{dateLabel}</span>}
    </div>
  )
}

function StatusLine({ label, value, dateLabel }: { label: string; value: YesNo; dateLabel: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2">
        <ResponseBadge value={value} dateLabel={dateLabel} />
      </div>
    </div>
  )
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium text-slate-500">{label}</p>
      </div>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function SmsComposerModal({
  recipients,
  isSending,
  onClose,
  onSend,
  isMockMode,
}: {
  recipients: LeadRecord[]
  isSending: boolean
  onClose: () => void
  onSend: (message: string) => Promise<void>
  isMockMode: boolean
}) {
  const [message, setMessage] = useState(() => {
    const firstName = recipients[0]?.nome?.split(' ')[0] || 'cliente'
    return `Olá ${firstName}, aqui é da equipe do Residencial Santa Clara. Recebemos seu interesse e podemos te passar mais detalhes e disponibilidade. Responda este SMS que seguimos com você.`
  })

  const phonePreview = recipients.slice(0, 3).map((recipient) => formatPhone(recipient.telefone)).join(' · ')

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <div className="mx-auto mt-10 w-full max-w-2xl rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Enviar SMS para lead{recipients.length > 1 ? 's' : ''}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {recipients.length} destinatário{recipients.length > 1 ? 's' : ''} · {isMockMode ? 'modo demonstração' : 'envio real'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-slate-800">Resumo dos destinatários</p>
            <p className="mt-1 text-xs text-slate-500">
              {recipients.map((recipient) => recipient.nome).slice(0, 4).join(', ')}{recipients.length > 4 ? ` e +${recipients.length - 4}` : ''}
            </p>
            <p className="mt-1 text-xs text-slate-400">{phonePreview}{recipients.length > 3 ? ` · +${recipients.length - 3} números` : ''}</p>
          </div>

          <div>
            <label htmlFor="sms-message" className="mb-2 block text-sm font-medium text-slate-700">Mensagem</label>
            <textarea
              id="sms-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={6}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Digite a mensagem do SMS"
            />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>A AWS pode fragmentar mensagens longas em múltiplas partes.</span>
              <span>{message.length} caracteres</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50">
            Cancelar
          </button>
          <button
            onClick={() => onSend(message)}
            disabled={isSending || !message.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isMockMode ? 'Simular envio' : 'Enviar SMS'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailDrawer({
  lead,
  onClose,
  onOpenSms,
  smsLogs,
}: {
  lead: LeadRecord
  onClose: () => void
  onOpenSms: (recipients: LeadRecord[]) => void
  smsLogs: SmsLogEntry[]
}) {
  const timeline = buildTimeline(lead)

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                {initials(lead.nome)}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">{lead.nome}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {SECTION_LABELS[lead.section]} · {lead.dataLabel || 'Sem data'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenSms([lead])}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Enviar SMS
              </button>
              <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Telefone" value={formatPhone(lead.telefone) || 'Não informado'} icon={<Phone className="h-4 w-4 text-blue-600" />} />
            <InfoCard label="Origem" value={lead.origem || 'Não informou'} icon={<Users className="h-4 w-4 text-violet-600" />} />
            <InfoCard label="Último marco" value={lead.dataLabel || 'Sem data'} icon={<CalendarDays className="h-4 w-4 text-amber-600" />} />
            <InfoCard label="Classificação" value={SECTION_LABELS[lead.section]} icon={<Handshake className="h-4 w-4 text-emerald-600" />} />
          </div>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Marco temporal por etapa</h3>
            </div>
            <div className="space-y-3">
              {timeline.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <div className={cn(
                    'mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full',
                    item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500',
                  )}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.dateLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Indicadores da ficha</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <StatusLine label="Respondeu pergunta" value={lead.respondeu} dateLabel={lead.dataLabel} />
              <StatusLine label="Tem interesse" value={lead.interesse} dateLabel={lead.dataLabel} />
              <StatusLine label="Marcou visita" value={lead.visita} dateLabel={lead.mentionedDates[0] || lead.dataLabel} />
              <StatusLine label="Converteu venda" value={lead.converteu} dateLabel={lead.mentionedDates[0] || lead.dataLabel} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Detalhamento</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {lead.detalhamento || 'Sem observações registradas.'}
            </p>
            {lead.mentionedDates.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {lead.mentionedDates.map((date) => (
                  <span key={date} className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                    Data citada: {date}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Histórico de SMS</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">{smsLogs.length} envio(s)</span>
            </div>
            {smsLogs.length === 0 ? (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Nenhum SMS enviado para este lead ainda.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {smsLogs.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        item.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                      )}>
                        {item.status === 'success' ? `${item.mode === 'mock' ? 'Mock' : 'AWS SNS'} OK` : 'Falha'}
                      </span>
                      <span className="text-[11px] text-slate-400">{formatDateTime(item.sentAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.message}</p>
                    {item.error && <p className="mt-2 text-xs text-red-600">{item.error}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

export default function LeadsPage() {
  const hydrate = useTenantConfig((state) => state.hydrate)
  const tenantConfig = useTenantConfig((state) => state.config)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const [data, setData] = useState<WorkbookData>(MOCK_DATA)
  const [fileName, setFileName] = useState('mock-validacao-cliente.xlsx')
  const [activeTab, setActiveTab] = useState<LeadTab>('all')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [smsLogs, setSmsLogs] = useState<SmsLogEntry[]>([])
  const [smsRecipients, setSmsRecipients] = useState<LeadRecord[]>([])
  const [sendingSms, setSendingSms] = useState(false)

  const negotiationLeads = useMemo(() => {
    return data.all.filter((lead) => {
      const inConversation = lead.respondeu === 'SIM' || lead.interesse === 'SIM' || lead.visita === 'SIM'
      return inConversation && lead.converteu !== 'SIM'
    })
  }, [data.all])

  const convertedCount = useMemo(() => {
    if (data.sold.length > 0) return data.sold.length
    return data.all.filter((lead) => lead.converteu === 'SIM').length
  }, [data.all, data.sold])

  const baseRows = useMemo(() => {
    if (activeTab === 'negotiation') return negotiationLeads
    if (activeTab === 'future') return data.future
    return data.all
  }, [activeTab, data.all, data.future, negotiationLeads])

  const sourceOptions = useMemo(() => {
    const values = new Set<string>()
    ;[...data.all, ...data.future, ...data.sold].forEach((lead) => {
      if (lead.origem) values.add(lead.origem)
    })
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'pt-BR'))
  }, [data.all, data.future, data.sold])

  const filteredRows = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase()

    const rows = baseRows.filter((lead) => {
      const matchesSearch = !lowerSearch || [lead.nome, lead.telefone, lead.origem, lead.detalhamento]
        .join(' ')
        .toLowerCase()
        .includes(lowerSearch)

      const matchesSource = sourceFilter === 'all' || lead.origem === sourceFilter

      const matchesStage = (() => {
        switch (stageFilter) {
          case 'responded':
            return lead.respondeu === 'SIM'
          case 'interested':
            return lead.interesse === 'SIM'
          case 'visited':
            return lead.visita === 'SIM'
          case 'converted':
            return lead.converteu === 'SIM'
          default:
            return true
        }
      })()

      return matchesSearch && matchesSource && matchesStage
    })

    return [...rows].sort((left, right) => {
      switch (sortBy) {
        case 'date_asc':
          return new Date(left.dataISO || 0).getTime() - new Date(right.dataISO || 0).getTime()
        case 'name_asc':
          return left.nome.localeCompare(right.nome, 'pt-BR')
        case 'name_desc':
          return right.nome.localeCompare(left.nome, 'pt-BR')
        case 'date_desc':
        default:
          return new Date(right.dataISO || 0).getTime() - new Date(left.dataISO || 0).getTime()
      }
    })
  }, [baseRows, search, sourceFilter, stageFilter, sortBy])

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbookData = parseWorkbook(buffer)
      setData(workbookData)
      setFileName(file.name)
      setErrorMessage('')
      setSelectedLead(null)
    } catch {
      setErrorMessage('Não foi possível ler a planilha. Verifique se o arquivo segue a estrutura enviada.')
    }
  }

  function loadMockExamples() {
    setData(MOCK_DATA)
    setFileName('mock-validacao-cliente.xlsx')
    setSelectedLead(null)
    setErrorMessage('')
  }

  function openSmsModal(recipients: LeadRecord[]) {
    if (recipients.length === 0) return
    setSmsRecipients(recipients)
  }

  async function handleSendSms(message: string) {
    if (smsRecipients.length === 0) return

    setSendingSms(true)
    try {
      const response = await fetch('/api/sms/sns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumbers: smsRecipients.map((recipient) => recipient.telefone),
          message,
          config: {
            snsRegion: tenantConfig.snsRegion,
            snsAccessKeyId: tenantConfig.snsAccessKeyId,
            snsSecretAccessKey: tenantConfig.snsSecretAccessKey,
            snsSenderId: tenantConfig.snsSenderId,
            snsSMSType: tenantConfig.snsSMSType,
            snsMockMode: tenantConfig.snsMockMode,
          },
          dryRun: tenantConfig.snsMockMode,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string; mode?: 'mock' | 'live'; sentAt?: string; results?: SmsApiResult[] }

      if (!response.ok && !payload.results?.length) {
        throw new Error(payload.error || 'Falha ao enviar SMS para os leads selecionados.')
      }

      const sentAt = payload.sentAt || new Date().toISOString()
      const nextLogs = smsRecipients.map((recipient) => {
        const result = payload.results?.find((entry) => entry.phoneNumber.replace(/\D/g, '') === recipient.telefone.replace(/\D/g, ''))
        return {
          id: `${recipient.id}-${sentAt}`,
          leadId: recipient.id,
          leadName: recipient.nome,
          phoneNumber: recipient.telefone,
          message,
          sentAt,
          mode: payload.mode || 'mock',
          status: result?.success === false ? 'error' : 'success',
          providerMessageId: result?.messageId,
          error: result?.error,
        } satisfies SmsLogEntry
      })

      setSmsLogs((current) => [...nextLogs, ...current])
      setSmsRecipients([])
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Falha inesperada no envio de SMS.')
    } finally {
      setSendingSms(false)
    }
  }

  const sourceDataLabel = fileName === 'mock-validacao-cliente.xlsx' ? 'Mock-up carregado para validação' : `Planilha atual: ${fileName}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leads com detalhamento temporal</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Abas para todos os leads, em negociação e futuras negociações, com filtros, ordenação e histórico de SMS.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadMockExamples}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" /> Carregar mock-up
          </button>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <Upload className="h-4 w-4 text-slate-500" />
            Importar planilha
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          </label>

          <button
            onClick={() => openSmsModal(filteredRows)}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> SMS da visão atual
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{sourceDataLabel}</p>
            <p className="mt-1 text-xs text-blue-800">
              {tenantConfig.snsMockMode
                ? 'SMS em modo demonstração: ótimo para a apresentação com o cliente.'
                : 'SMS configurado para envio real via AWS SNS.'}
            </p>
          </div>
          <a href="/configuracoes" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
            Ajustar credenciais <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Todos os leads" value={data.all.length} icon={<Users className="h-4 w-4 text-blue-600" />} />
        <SummaryCard label="Em negociação" value={negotiationLeads.length} icon={<Handshake className="h-4 w-4 text-violet-600" />} />
        <SummaryCard label="Futuras negociações" value={data.future.length} icon={<CalendarCheck2 className="h-4 w-4 text-amber-600" />} />
        <SummaryCard label="Convertidos" value={convertedCount} icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {([
              ['all', data.all.length],
              ['negotiation', negotiationLeads.length],
              ['future', data.future.length],
            ] as Array<[LeadTab, number]>).map(([tab, count]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-full px-3 py-2 text-xs font-semibold transition-colors',
                  activeTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {TAB_LABELS[tab]} · {count}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, telefone, origem..."
                className="w-56 text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="bg-transparent text-sm text-slate-700 outline-none">
                <option value="all">Todas as origens</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as StageFilter)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none"
            >
              <option value="all">Todas as etapas</option>
              <option value="responded">Respondeu</option>
              <option value="interested">Com interesse</option>
              <option value="visited">Visitou</option>
              <option value="converted">Convertido</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none"
            >
              <option value="date_desc">Mais recentes</option>
              <option value="date_asc">Mais antigos</option>
              <option value="name_asc">Nome A-Z</option>
              <option value="name_desc">Nome Z-A</option>
            </select>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[1240px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Data</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Nome</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Telefone</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Respondeu</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Interesse</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Visitou</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Converteu</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Origem</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Detalhamento</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((lead) => {
                const leadSmsLogs = smsLogs.filter((entry) => entry.leadId === lead.id)

                return (
                  <tr key={lead.id} className="align-top transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{lead.dataLabel || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                          {initials(lead.nome)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{lead.nome}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{SECTION_LABELS[lead.section]}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatPhone(lead.telefone) || lead.telefone}</td>
                    <td className="px-4 py-3"><ResponseBadge value={lead.respondeu} dateLabel={lead.dataLabel} /></td>
                    <td className="px-4 py-3"><ResponseBadge value={lead.interesse} dateLabel={lead.dataLabel} /></td>
                    <td className="px-4 py-3"><ResponseBadge value={lead.visita} dateLabel={lead.mentionedDates[0] || lead.dataLabel} /></td>
                    <td className="px-4 py-3"><ResponseBadge value={lead.converteu} dateLabel={lead.mentionedDates[0] || lead.dataLabel} /></td>
                    <td className="px-4 py-3 text-xs text-slate-600">{lead.origem}</td>
                    <td className="px-4 py-3 text-xs leading-5 text-slate-500">
                      <div className="max-w-md">
                        <p className="line-clamp-3">{lead.detalhamento || 'Sem detalhamento'}</p>
                        {leadSmsLogs.length > 0 && (
                          <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            {leadSmsLogs.length} SMS enviado(s)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" /> Ver detalhe
                        </button>
                        <button
                          onClick={() => openSmsModal([lead])}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Enviar SMS
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-slate-400">
            Nenhum lead encontrado com os filtros aplicados.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Exportação e validação</p>
            <p className="mt-1 text-xs text-slate-500">
              O botão abaixo exporta o mock atual para o cliente revisar antes do backend definitivo.
            </p>
          </div>
          <button
            onClick={() => {
              const workbook = XLSX.utils.book_new()
              const rows = filteredRows.map((lead) => ({
                DATA: lead.dataLabel,
                NOME: lead.nome,
                TELEFONE: lead.telefone,
                'RESPONDEU PERGUNTA?': lead.respondeu,
                'TEM INTERESSE?': lead.interesse,
                'MARCOU VISITA?': lead.visita,
                'CONVERTEU VENDA?': lead.converteu,
                'COMO SOUBE/DE ONDE VEIO': lead.origem,
                DETALHAMENTO: lead.detalhamento,
              }))
              XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Leads')
              XLSX.writeFile(workbook, `leads-${activeTab}.xlsx`)
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Exportar visão atual
          </button>
        </div>
      </div>

      {selectedLead && (
        <DetailDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onOpenSms={openSmsModal}
          smsLogs={smsLogs.filter((entry) => entry.leadId === selectedLead.id)}
        />
      )}

      {smsRecipients.length > 0 && (
        <SmsComposerModal
          recipients={smsRecipients}
          isSending={sendingSms}
          onClose={() => setSmsRecipients([])}
          onSend={handleSendSms}
          isMockMode={Boolean(tenantConfig.snsMockMode)}
        />
      )}
    </div>
  )
}
