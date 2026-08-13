/**
 * Organization business time.
 *
 * Seed mode buckets days in the VIEWER's local timezone — the public demo is
 * self-consistent for anyone who opens it, anywhere. Live mode pins all
 * day-bucketing and timestamp display to the org's fixed business timezone,
 * so every member of the workspace sees identical numbers regardless of where
 * they log in from. main.tsx wires the mode at bootstrap; nothing here reads
 * env, so scripts and tests default safely to 'local'.
 */

export type OrgTimeZone = 'local' | string

/** The business timezone for live workspaces (US Eastern for now). */
export const LIVE_ORG_TIMEZONE = 'America/New_York'

let currentTz: OrgTimeZone = 'local'

export function setOrgTimeZone(tz: OrgTimeZone): void {
  currentTz = tz
}

export function orgTimeZone(): OrgTimeZone {
  return currentTz
}

// ---------------------------------------------------------------------------
// Timezone math (Intl-based; no library, DST-safe)
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')

const dtfCache = new Map<string, Intl.DateTimeFormat>()

function fieldsIn(tz: string, epochMs: number) {
  let dtf = dtfCache.get(tz)
  if (!dtf) {
    dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
    dtfCache.set(tz, dtf)
  }
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(epochMs)) parts[p.type] = p.value
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    s: Number(parts.second),
  }
}

/** Calendar day ('YYYY-MM-DD') of an instant, in the org timezone. */
export function dayOf(instant: string | number | Date, tz: OrgTimeZone = currentTz): string {
  const date = instant instanceof Date ? instant : new Date(instant)
  if (tz === 'local') {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }
  const f = fieldsIn(tz, date.getTime())
  return `${f.y}-${pad(f.m)}-${pad(f.d)}`
}

/** Calendar month ('YYYY-MM') of an instant, in the org timezone. */
export function monthOf(instant: string | number, tz: OrgTimeZone = currentTz): string {
  return dayOf(instant, tz).slice(0, 7)
}

/**
 * Inclusive epoch bounds [from, to] of one calendar day in the org timezone.
 * DST-safe: a spring-forward day is 23h long, a fall-back day 25h.
 */
export function dayBounds(
  dateOnly: string,
  tz: OrgTimeZone = currentTz,
): { from: number; to: number } {
  return { from: startOfDayEpoch(dateOnly, tz), to: startOfDayEpoch(addCalendarDays(dateOnly, 1), tz) - 1 }
}

function startOfDayEpoch(dateOnly: string, tz: OrgTimeZone): number {
  const [y, m, d] = dateOnly.split('-').map(Number)
  if (tz === 'local') {
    return new Date(y, m - 1, d).getTime()
  }
  // Two-pass wall-clock alignment: converge on the instant whose wall clock in
  // `tz` reads midnight of the requested date.
  let guess = Date.UTC(y, m - 1, d)
  for (let i = 0; i < 2; i++) {
    const f = fieldsIn(tz, guess)
    const wallAsUtc = Date.UTC(f.y, f.m - 1, f.d, f.h, f.min, f.s)
    guess += Date.UTC(y, m - 1, d) - wallAsUtc
  }
  return guess
}

/** Pure calendar arithmetic on 'YYYY-MM-DD' strings (timezone-free). */
export function addCalendarDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
