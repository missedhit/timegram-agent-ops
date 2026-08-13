import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyPoint } from '../../data/selectors'
import { fmtDateShort, fmtUsd, fmtUsdCents } from '../../lib/format'
import { AXIS_TICK, CHART } from './chartTheme'
import ChartTooltip from './ChartTooltip'

/**
 * Daily spend trend. An optional dashed reference line marks "budget pace"
 * (monthly budget ÷ 30) so a sustained ramp above it is visible at a glance.
 */
export default function CostTrendChart({
  data,
  budgetPerDay,
  height = 190,
}: {
  data: DailyPoint[]
  budgetPerDay?: number
  height?: number
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          tickFormatter={fmtDateShort}
          minTickGap={56}
        />
        <YAxis
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => fmtUsd(v)}
          width={58}
        />
        <Tooltip
          cursor={{ stroke: CHART.axisText, strokeDasharray: '3 3' }}
          content={
            <ChartTooltip<DailyPoint>
              rows={(p) => [
                { label: 'Spend', value: fmtUsdCents(p.costUsd) },
                { label: 'Tasks', value: String(p.tasks) },
              ]}
            />
          }
        />
        {budgetPerDay !== undefined && (
          <ReferenceLine
            y={budgetPerDay}
            stroke={CHART.reference}
            strokeDasharray="4 4"
            label={{
              value: 'Budget pace',
              position: 'insideTopRight',
              fill: CHART.referenceText,
              fontSize: 10,
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="costUsd"
          stroke={CHART.accent}
          strokeWidth={2}
          fill={CHART.accentFill}
          activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
