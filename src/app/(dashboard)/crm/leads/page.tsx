'use client'

import { useMemo, useState, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import {
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileSpreadsheet,
  Filter,
  Handshake,
  Phone,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { cn, formatDate, formatPhone, initials } from '@/lib/utils'

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

const EMPTY_DATA: WorkbookData = {
  all: [],
  sold: [],
  future: [],
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
  return (
    normalizeHeader(row[0]) === 'DATA' &&
    normalizeHeader(row[2]) === 'TELEFONE'
  )
}

function parseLeadRows(rows: SheetCell[][], startIndex: number, endIndex: number, section: LeadSection): LeadRecord[] {
  const leads: LeadRecord[] = []

  for (let index = startIndex; index < endIndex; index += 1) {
    const row = rows[index] ?? []
    const firstCell = normalizeHeader(row[0])

    if (!row.length || isHeaderRow(row)) {
      continue
    }

    if (firstCell.startsWith('*')) {
      break
    }

    const data = parseDateCell(row[0])
    const nome = normalizeText(row[1]) || 'Lead sem nome'
    const telefone = normalizeText(row[2])
    const detalhamento = normalizeText(row[8])

    if (!data.label && !telefone && !detalhamento) {
      continue
    }

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
    timeline.push({ id: 'visita', title: 'Visita marcada', dateLabel: fallbackDate, done: true })
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
      {value === 'SIM' && dateLabel && (
        <span className="text-[10px] text-slate-400">{dateLabel}</span>
      )}
    </div>
  )
}

function DetailDrawer({ lead, onClose }: { lead: LeadRecord; onClose: () => void }) {
  const timeline = buildTimeline(lead)

  return (
    <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose}>
      <aside
        className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
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
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
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
              <StatusLine label="Marcou visita" value={lead.visita} dateLabel={lead.dataLabel} />
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
        </div>
      </aside>
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

export default function LeadsPage() {
  const [data, setData] = useState<WorkbookData>(EMPTY_DATA)
  const [fileName, setFileName] = useState('')
  const [activeTab, setActiveTab] = useState<LeadTab>('all')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('date_desc')
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

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
    ;[...data.all, ...data.future].forEach((lead) => {
      if (lead.origem) values.add(lead.origem)
    })
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'pt-BR'))
  }, [data.all, data.future])

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
          return (new Date(left.dataISO || 0).getTime()) - (new Date(right.dataISO || 0).getTime())
        case 'name_asc':
          return left.nome.localeCompare(right.nome, 'pt-BR')
        case 'name_desc':
          return right.nome.localeCompare(left.nome, 'pt-BR')
        case 'date_desc':
        default:
          return (new Date(right.dataISO || 0).getTime()) - (new Date(left.dataISO || 0).getTime())
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leads com detalhamento temporal</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Visualização em abas para todos os leads, em negociação e futuras negociações, com filtros e marco temporal por resposta.
          </p>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
          <Upload className="h-4 w-4" />
          Importar planilha
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        </label>
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
                  activeTab === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {TAB_LABELS[tab]} · {count}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, telefone, origem..."
                className="w-56 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className="bg-transparent outline-none">
                <option value="all">Todas as origens</option>
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
            </div>

            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as StageFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none"
            >
              <option value="all">Todas as etapas</option>
              <option value="responded">Respondeu</option>
              <option value="interested">Tem interesse</option>
              <option value="visited">Marcou visita</option>
              <option value="converted">Converteu</option>
            </select>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none"
            >
              <option value="date_desc">Mais recentes</option>
              <option value="date_asc">Mais antigas</option>
              <option value="name_asc">Nome A-Z</option>
              <option value="name_desc">Nome Z-A</option>
            </select>
          </div>
        </div>

        {fileName && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
            <FileSpreadsheet className="h-4 w-4 text-blue-600" />
            <p className="text-xs font-medium text-blue-700">Arquivo carregado: {fileName}</p>
            <span className="text-xs text-blue-500">{filteredRows.length} registros na aba atual após filtros</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {!fileName ? (
          <div className="mt-5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-card">
              <FileSpreadsheet className="h-7 w-7 text-slate-400" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900">Importe a planilha de leads</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              A visualização foi preparada para mostrar o detalhamento da base geral, a aba de futuras negociações e o marco temporal de cada resposta.
              Após importar, você poderá ordenar, filtrar e abrir o detalhe completo de cada lead.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
              <Download className="h-3.5 w-3.5" />
              Estrutura esperada: DATA, NOME, TELEFONE, RESPONDEU, INTERESSE, VISITA, CONVERTEU, ORIGEM, DETALHAMENTO
            </div>
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1280px] w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Data</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Nome</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Telefone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Respondeu?</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Tem interesse?</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Marcou visita?</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Converteu?</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Origem</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Detalhamento</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((lead) => (
                    <tr key={lead.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{lead.dataLabel || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                            {initials(lead.nome)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{lead.nome}</p>
                            <p className="text-xs text-slate-400">{SECTION_LABELS[lead.section]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatPhone(lead.telefone) || 'Não informado'}</td>
                      <td className="px-4 py-3"><ResponseBadge value={lead.respondeu} dateLabel={lead.dataLabel} /></td>
                      <td className="px-4 py-3"><ResponseBadge value={lead.interesse} dateLabel={lead.dataLabel} /></td>
                      <td className="px-4 py-3"><ResponseBadge value={lead.visita} dateLabel={lead.dataLabel} /></td>
                      <td className="px-4 py-3"><ResponseBadge value={lead.converteu} dateLabel={lead.mentionedDates[0] || lead.dataLabel} /></td>
                      <td className="px-4 py-3 text-slate-600">{lead.origem}</td>
                      <td className="px-4 py-3">
                        <p className="max-w-[420px] truncate text-slate-500">{lead.detalhamento || 'Sem observação'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedLead(lead)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver detalhe
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredRows.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                  <Search className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-700">Nenhum lead encontrado</p>
                <p className="max-w-xl text-sm text-slate-500">
                  Ajuste a aba, os filtros ou a ordenação para localizar os registros desejados.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedLead && <DetailDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />}

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-violet-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">Detalhamento pronto para evolução de histórico</p>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Hoje o marco temporal usa a data existente na planilha para cada etapa marcada como SIM. Se você quiser datas separadas para resposta, interesse, visita e conversão,
              o próximo passo ideal é incluir colunas específicas para cada etapa na base de origem.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
            Próximo passo
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
