'use client'

import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { mockMonthlyRevenue, mockLotAvailability, mockLeadsBySource } from '@/lib/mock-data'

const PIE_COLORS = ['#ef4444', '#22c55e', '#f59e0b']

const SOURCE_COLORS: Record<string, string> = {
  Instagram: '#e1306c',
  Facebook: '#1877f2',
  Site: '#2563eb',
  Indicação: '#059669',
  WhatsApp: '#25d366',
  Outros: '#94a3b8',
}

export function RevenueChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={mockMonthlyRevenue} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: 'none' }}
          formatter={(v: number) => [formatCurrency(v), '']}
        />
        <Area
          type="monotone"
          dataKey="previsao"
          stroke="#cbd5e1"
          strokeWidth={1.5}
          fill="none"
          strokeDasharray="4 4"
          name="Previsto"
        />
        <Area
          type="monotone"
          dataKey="receitas"
          stroke="#2563eb"
          strokeWidth={2}
          fill="url(#colorReceitas)"
          name="Realizado"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function LotAvailabilityChart() {
  return (
    <>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={mockLotAvailability}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={3}
            dataKey="value"
          >
            {mockLotAvailability.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2 mt-2">
        {mockLotAvailability.map((item, i) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: PIE_COLORS[i] }}
              />
              <span className="text-slate-600">{item.name}</span>
            </div>
            <span className="font-medium text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </>
  )
}

export function LeadsBySourceChart() {
  return (
    <div className="space-y-3">
      {mockLeadsBySource.map(item => (
        <div key={item.source} className="flex items-center gap-3">
          <span className="text-xs text-slate-600 w-20 truncate">{item.source}</span>
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${item.value}%`,
                background: SOURCE_COLORS[item.source] ?? '#94a3b8',
              }}
            />
          </div>
          <span className="text-xs font-medium text-slate-900 w-8 text-right">
            {item.value}%
          </span>
        </div>
      ))}
    </div>
  )
}
