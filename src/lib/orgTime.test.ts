import { afterEach, describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  dayBounds,
  dayOf,
  monthOf,
  orgTimeZone,
  setOrgTimeZone,
} from './orgTime'

const NY = 'America/New_York'
const HOUR = 3600_000

afterEach(() => setOrgTimeZone('local'))

describe('org timezone day math (America/New_York)', () => {
  it('buckets instants into Eastern calendar days regardless of host timezone', () => {
    // EDT (UTC-4): 03:59Z is 23:59 the previous evening in New York.
    expect(dayOf('2026-08-14T03:59:00.000Z', NY)).toBe('2026-08-13')
    expect(dayOf('2026-08-14T04:00:00.000Z', NY)).toBe('2026-08-14')
    // EST (UTC-5) in winter.
    expect(dayOf('2026-01-10T04:59:00.000Z', NY)).toBe('2026-01-09')
    expect(dayOf('2026-01-10T05:00:00.000Z', NY)).toBe('2026-01-10')
  })

  it('monthOf follows the same boundary', () => {
    expect(monthOf('2026-08-01T03:00:00.000Z', NY)).toBe('2026-07')
    expect(monthOf('2026-08-01T05:00:00.000Z', NY)).toBe('2026-08')
  })

  it('day bounds are exact and DST-aware (23h spring-forward, 25h fall-back)', () => {
    const normal = dayBounds('2026-08-14', NY)
    expect(normal.to - normal.from + 1).toBe(24 * HOUR)

    const springForward = dayBounds('2026-03-08', NY) // EST→EDT
    expect(springForward.to - springForward.from + 1).toBe(23 * HOUR)

    const fallBack = dayBounds('2026-11-01', NY) // EDT→EST
    expect(fallBack.to - fallBack.from + 1).toBe(25 * HOUR)
  })

  it('day bounds partition time: every instant belongs to exactly its own day', () => {
    for (const day of ['2026-03-08', '2026-11-01', '2026-08-14']) {
      const b = dayBounds(day, NY)
      expect(dayOf(b.from, NY)).toBe(day)
      expect(dayOf(b.to, NY)).toBe(day)
      expect(dayOf(b.from - 1, NY)).toBe(addCalendarDays(day, -1))
      expect(dayOf(b.to + 1, NY)).toBe(addCalendarDays(day, 1))
    }
  })

  it('handles timezones whose spring-forward gap starts at midnight', () => {
    // In these zones 00:00 does not exist on the transition day — the day
    // starts at 01:00. dayBounds must return the first EXISTING instant, keep
    // the day partition contiguous, and never land on the previous day.
    for (const [tz, gapDay] of [
      ['America/Santiago', '2026-09-06'],
      ['America/Havana', '2026-03-08'],
    ] as const) {
      const b = dayBounds(gapDay, tz)
      expect(dayOf(b.from, tz), `${tz} from-day`).toBe(gapDay)
      expect(dayOf(b.from - 1, tz), `${tz} instant before`).toBe(addCalendarDays(gapDay, -1))
      expect(dayOf(b.to, tz), `${tz} to-day`).toBe(gapDay)
      // 23-hour day, and contiguous with its neighbor.
      expect(b.to - b.from + 1, `${tz} length`).toBe(23 * HOUR)
      expect(dayBounds(addCalendarDays(gapDay, -1), tz).to + 1, `${tz} continuity`).toBe(b.from)
    }
  })

  it('addCalendarDays handles month and year wraps', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addCalendarDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addCalendarDays('2026-08-14', -29)).toBe('2026-07-16')
  })

  it('defaults to local mode and follows the configured org timezone', () => {
    expect(orgTimeZone()).toBe('local')
    const utcMidnight = '2026-08-14T00:30:00.000Z'
    setOrgTimeZone(NY)
    expect(dayOf(utcMidnight)).toBe('2026-08-13') // 20:30 EDT the day before
    setOrgTimeZone('local')
    const d = new Date(utcMidnight)
    const localDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(dayOf(utcMidnight)).toBe(localDay)
  })
})
