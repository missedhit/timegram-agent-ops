/**
 * Demo-date pinning. The seed dataset is anchored to "today" by default so the
 * demo never looks stale, but a live pitch sometimes wants frozen numbers.
 *
 * Precedence: `?asof=YYYY-MM-DD` URL param → VITE_DEMO_ANCHOR env (build-time)
 * → today. Invalid values fall back to today rather than breaking the demo.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a date-only string as a LOCAL calendar date, matching the semantics
 * of parseLocalDate in selectors.ts — bare `new Date('YYYY-MM-DD')` would be
 * UTC midnight and shift the 90-day window in western timezones.
 */
function parseAnchor(value: string): Date | null {
  if (!DATE_ONLY.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  // Reject impossible dates the Date constructor would silently roll over
  // (e.g. 2026-02-31 → Mar 3).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  return date
}

export function resolveAnchor(search: string, envValue: string | undefined): Date {
  const fromParam = new URLSearchParams(search).get('asof')
  if (fromParam) {
    const parsed = parseAnchor(fromParam)
    if (parsed) return parsed
    console.warn(`Ignoring invalid ?asof= value "${fromParam}" — expected YYYY-MM-DD`)
  }
  if (envValue) {
    const parsed = parseAnchor(envValue)
    if (parsed) return parsed
    console.warn(`Ignoring invalid VITE_DEMO_ANCHOR "${envValue}" — expected YYYY-MM-DD`)
  }
  return new Date()
}
