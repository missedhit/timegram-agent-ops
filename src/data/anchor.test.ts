import { describe, expect, it } from 'vitest'
import { resolveAnchor } from './anchor'

describe('resolveAnchor', () => {
  it('uses a valid ?asof= param as a local calendar date', () => {
    const d = resolveAnchor('?asof=2026-08-01', undefined)
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 1])
    expect(d.getHours()).toBe(0)
  })

  it('prefers the URL param over the env value', () => {
    const d = resolveAnchor('?asof=2026-08-01', '2026-07-01')
    expect(d.getMonth()).toBe(7)
  })

  it('falls back to the env value when no param is present', () => {
    const d = resolveAnchor('', '2026-07-15')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 6, 15])
  })

  it.each(['not-a-date', '2026-13-01', '2026-02-31', '08/01/2026', '2026-8-1'])(
    'falls back to today for invalid value %s',
    (bad) => {
      const now = new Date()
      const d = resolveAnchor(`?asof=${bad}`, undefined)
      expect(d.getFullYear()).toBe(now.getFullYear())
      expect(d.getMonth()).toBe(now.getMonth())
      expect(d.getDate()).toBe(now.getDate())
    },
  )

  it('invalid param falls through to a valid env value', () => {
    const d = resolveAnchor('?asof=garbage', '2026-06-01')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 1])
  })

  it('defaults to today with no inputs', () => {
    const now = new Date()
    const d = resolveAnchor('', undefined)
    expect(d.getDate()).toBe(now.getDate())
  })
})
