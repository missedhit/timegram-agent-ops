import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fmtUsd } from '../../lib/format'

export interface RankedBarRow {
  key: string
  label: string
  sublabel?: string
  value: number
  /** Optional route target; the label becomes a link. */
  to?: string
  /** Optional trailing element, e.g. an over-budget pill. */
  tag?: ReactNode
}

/**
 * Ranked magnitude list with inline bars. Single accent hue and direct value
 * labels — no legend or tooltip needed at this density.
 */
/**
 * Whole-dollar row labels that still add up to the rounded list total.
 * Rounding each row independently makes a column of $1-off values that
 * visibly fails to sum to the headline figure on the same screen.
 */
function wholeDollarLabels(values: number[]): number[] {
  const floors = values.map((v) => Math.floor(v))
  const target = Math.round(values.reduce((a, b) => a + b, 0))
  let deficit = target - floors.reduce((a, b) => a + b, 0)
  const byRemainder = values
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem)
  const out = [...floors]
  for (let k = 0; deficit > 0 && k < byRemainder.length; k++, deficit--) out[byRemainder[k].i] += 1
  return out
}

export default function RankedBars({ rows }: { rows: RankedBarRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const labels = wholeDollarLabels(rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r, idx) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 truncate">
              {r.to ? (
                <Link
                  to={r.to}
                  title={r.label}
                  className="truncate font-medium text-slate-800 hover:text-indigo-700"
                >
                  {r.label}
                </Link>
              ) : (
                <span title={r.label} className="truncate font-medium text-slate-800">
                  {r.label}
                </span>
              )}
              {r.sublabel && <span className="shrink-0 text-xs text-slate-500">{r.sublabel}</span>}
              {r.tag}
            </span>
            <span className="shrink-0 tabular-nums text-slate-700">{fmtUsd(labels[idx])}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600"
              style={{ width: `${Math.max((r.value / max) * 100, 0.5)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
