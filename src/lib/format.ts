/** Shared display formatting. Keep all number/date presentation here. */

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

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const dateShortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

const dateTimeFullFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** "Aug 12, 2026" */
export const fmtDate = (iso: string) => dateFmt.format(parseIso(iso))

/** "Aug 12" */
export const fmtDateShort = (iso: string) => dateShortFmt.format(parseIso(iso))

/** "Aug 12, 3:41 PM" */
export const fmtDateTime = (iso: string) => dateTimeFmt.format(parseIso(iso))

/** "Aug 12, 2026, 3:41 PM" — for document provenance stamps, which need the year. */
export const fmtDateTimeFull = (iso: string) => dateTimeFullFmt.format(parseIso(iso))

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
