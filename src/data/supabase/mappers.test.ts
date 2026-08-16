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

  it('a workspace with agents but no tasks yields a valid one-day window (regression: blank screen / infinite loop)', async () => {
    const rows = toRows(original)
    const emptyRows = { ...rows, tasks: [], deviations: [], approvals: [] }
    const ds = fromRows(emptyRows, original.generatedAt)
    // Window must be a real calendar day, never ''.
    expect(ds.rangeStart).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(ds.rangeEnd).toBe(ds.rangeStart)

    const { dailySeries, last30Days, registrySummary } = await import('../selectors')
    const { setOrgTimeZone } = await import('../../lib/orgTime')
    // Local mode: dailySeries must terminate and produce zero-filled days.
    const series = dailySeries(ds, last30Days(ds))
    expect(series).toHaveLength(30)
    expect(series.every((p) => p.tasks === 0)).toBe(true)
    // Org-timezone mode (live): no RangeError from any headline selector.
    setOrgTimeZone('America/New_York')
    try {
      expect(registrySummary(ds).spend30dUsd).toBe(0)
      expect(dailySeries(ds, last30Days(ds))).toHaveLength(30)
    } finally {
      setOrgTimeZone('local')
    }
  })

  it('derived dimensions come from the org data, not the demo vocabulary', () => {
    const rows = toRows(original)
    const ds = fromRows(rows, original.generatedAt, { dimensions: 'derived' })
    const expectedDepts = [...new Set(original.agents.map((a) => a.department))].sort()
    const expectedCcs = [...new Set(original.tasks.map((t) => t.costCenter))].sort()
    expect(ds.departments).toEqual(expectedDepts)
    expect(ds.costCenters).toEqual(expectedCcs)

    // A single-department prospect org derives exactly its own vocabulary.
    const onlyEngineering = {
      ...rows,
      agents: rows.agents.filter((a) => a.department === 'Engineering'),
      agentVersions: [],
      agentPolicies: [],
      policies: [],
      tasks: rows.tasks.filter((t) =>
        rows.agents.some((a) => a.id === t.agent_id && a.department === 'Engineering'),
      ),
      deviations: [],
      approvals: [],
    }
    const engineeringDs = fromRows(onlyEngineering, original.generatedAt, { dimensions: 'derived' })
    expect(engineeringDs.departments).toEqual(['Engineering'])
    expect(engineeringDs.costCenters.length).toBeGreaterThan(0)
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
