import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPoint } from '../../data/selectors'
import { fmtDateShort } from '../../lib/format'
import { AXIS_TICK, CHART } from './chartTheme'
import ChartTooltip from './ChartTooltip'

/** Tasks-per-day bar chart. Single series — the card title names it. */
export default function ActivityBarChart({ data, height = 160 }: { data: DailyPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          tickFormatter={fmtDateShort}
          minTickGap={48}
        />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
          content={
            <ChartTooltip<DailyPoint>
              rows={(p) => [{ label: 'Tasks', value: String(p.tasks) }]}
            />
          }
        />
        <Bar dataKey="tasks" fill={CHART.accent} radius={[3, 3, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  )
}
