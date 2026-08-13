import { fmtDate } from '../../lib/format'

/**
 * Shared tooltip chrome for Recharts. `rows` receives the hovered payload
 * point and returns label/value pairs to display.
 */
export default function ChartTooltip<T>({
  active,
  label,
  payload,
  rows,
}: {
  active?: boolean
  label?: string | number
  payload?: Array<{ payload: T }>
  rows: (point: T) => Array<{ label: string; value: string }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      {typeof label === 'string' && label && (
        <div className="mb-0.5 font-medium text-slate-900">{fmtDate(label)}</div>
      )}
      {rows(point).map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4">
          <span className="text-slate-500">{r.label}</span>
          <span className="font-medium tabular-nums text-slate-900">{r.value}</span>
        </div>
      ))}
    </div>
  )
}
