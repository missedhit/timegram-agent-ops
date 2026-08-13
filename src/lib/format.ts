/** Shared display formatting. Keep all number/date presentation here. */

import { orgTimeZone, type OrgTimeZone } from './orgTime'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Date-only strings in the DataSet are local calendar dates. Parsing them with
 * bare `new Date()` would treat them as UTC midnight and render the previous
 * day anywhere west of UTC.
 */
function parseIso(iso: string): Date {
  if (DATE_ONLY.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(iso)
}

const usdWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const usdCents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** "$12,431" — for totals and budgets. */
export const fmtUsd = (value: number) => usdWhole.format(value)

/** "$4.18" — for per-task and per-unit costs. */
export const fmtUsdCents = (value: number) => usdCents.format(value)

type DateStyle = 'date' | 'dateShort' | 'dateTime' | 'dateTimeFull'

const DATE_STYLE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  date: { month: 'short', day: 'numeric', year: 'numeric' },
  dateShort: { month: 'short', day: 'numeric' },
  dateTime: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  dateTimeFull: {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(style: DateStyle, tz: OrgTimeZone): Intl.DateTimeFormat {
  const key = `${style}|${tz}`
  let fmt = formatterCache.get(key)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      ...DATE_STYLE_OPTIONS[style],
      ...(tz !== 'local' ? { timeZone: tz } : {}),
    })
    formatterCache.set(key, fmt)
  }
  return fmt
}

/**
 * Formatting an invalid/empty date must render a placeholder, never throw —
 * Intl.format on an Invalid Date throws a RangeError, which unmounts the whole
 * React tree (a blank screen) if any row of an empty dataset reaches it.
 *
 * Date-only strings are calendar dates and render as-is; full timestamps are
 * instants and render in the org timezone (viewer-local in seed mode, the
 * org's business timezone in live mode).
 */
const safeFormat = (style: DateStyle, iso: string) => {
  const isDateOnly = DATE_ONLY.test(iso)
  const d = parseIso(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return getFormatter(style, isDateOnly ? 'local' : orgTimeZone()).format(d)
}

/** "Aug 12, 2026" */
export const fmtDate = (iso: string) => safeFormat('date', iso)

/** "Aug 12" */
export const fmtDateShort = (iso: string) => safeFormat('dateShort', iso)

/** "Aug 12, 3:41 PM" */
export const fmtDateTime = (iso: string) => safeFormat('dateTime', iso)

/** "Aug 12, 2026, 3:41 PM" — for document provenance stamps, which need the year. */
export const fmtDateTimeFull = (iso: string) => safeFormat('dateTimeFull', iso)

/** "12m 40s" / "1h 05m" / "38s" */
export function fmtDuration(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** "1.2M" / "38.4k" — used for the secondary token detail. */
export function fmtCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}
