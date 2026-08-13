import { describe, expect, it } from 'vitest'
import type { DataSet } from '../../domain/types'
import { buildDataSet } from '../seed/generate'
import { fromRows, toRows } from './mappers'

/**
 * The anti-fork guarantee: a DataSet pushed through the database row shapes
 * and back must be indistinguishable from the original, so seed mode and
 * supabase mode can never disagree on a single number or ordering.
 */

const ANCHOR = new Date(2026, 7, 14)

/** Activity arrays have no persisted order; compare them canonically. */
function canonical(ds: DataSet): DataSet {
  const byTimestampThenId = <T extends { timestamp: string; id: string }>(a: T, b: T) =>
    a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
  return {
    ...ds,
    tasks: ds.tasks.slice().sort(byTimestampThenId),
    deviations: ds.deviations.slice().sort(byTimestampThenId),
    approvals: ds.approvals.slice().sort(byTimestampThenId),
  }
}

describe('supabase row mappers', () => {
  const original = buildDataSet(ANCHOR)
  const roundTripped = fromRows(toRows(original), original.generatedAt)

  it('round-trips the entire dataset without loss (order, format, and values)', () => {
    expect(canonical(roundTripped)).toEqual(canonical(original))
  })

  it('preserves curated registry and policy ordering exactly', () => {
    expect(roundTripped.agents.map((a) => a.id)).toEqual(original.agents.map((a) => a.id))
    expect(roundTripped.policies.map((p) => p.id)).toEqual(original.policies.map((p) => p.id))
  })

  it('normalizes postgres timestamptz format back to the seed format', () => {
    const rows = toRows(original)
    // Simulate what PostgREST actually returns for timestamptz.
    rows.tasks = rows.tasks.map((t) => ({
      ...t,
      timestamp: t.timestamp.replace(/\.\d{3}Z$/, '+00:00'),
    }))
    const ds = fromRows(rows, original.generatedAt)
    expect(ds.tasks[0].timestamp).toMatch(/\.\d{3}Z$/)
    expect(canonical(ds).tasks.map((t) => t.timestamp)).toEqual(
      canonical(original).tasks.map((t) => t.timestamp),
    )
  })

  it('derives the same activity window the seed declares', () => {
    expect(roundTripped.rangeStart).toBe(original.rangeStart)
    expect(roundTripped.rangeEnd).toBe(original.rangeEnd)
  })

  it('round-trips optional fields (paused/retired agents, unresolved deviations)', () => {
    const paused = roundTripped.agents.find((a) => a.status === 'paused')
    expect(paused?.pausedAt).toBeDefined()
    const active = roundTripped.agents.find((a) => a.status === 'active')
    expect(active).not.toHaveProperty('pausedAt')
    const open = roundTripped.deviations.find((d) => d.status === 'open')
    expect(open).not.toHaveProperty('resolvedAt')
    const resolved = roundTripped.deviations.find((d) => d.status === 'resolved')
    expect(resolved?.resolvedAt).toBeDefined()
  })
})
