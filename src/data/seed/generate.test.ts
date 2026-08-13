import { describe, expect, it } from 'vitest'
import { buildDataSet } from './generate'

// Fixed anchor so tests are reproducible regardless of when they run.
const NOW = new Date('2026-08-13T12:00:00')

describe('buildDataSet', () => {
  const ds = buildDataSet(NOW)

  it('is deterministic for the same anchor date', () => {
    const again = buildDataSet(NOW)
    expect(JSON.stringify(again)).toBe(JSON.stringify(ds))
  })

  it('generates roughly 2,000 tasks over 90 days', () => {
    expect(ds.tasks.length).toBeGreaterThan(1600)
    expect(ds.tasks.length).toBeLessThan(2600)
  })

  it('keeps every task inside the 90-day window', () => {
    // Date-only strings are local calendar dates; parse them as local time.
    const start = new Date(`${ds.rangeStart}T00:00:00`).getTime()
    const end = new Date(`${ds.rangeEnd}T00:00:00`).getTime() + 24 * 60 * 60 * 1000
    for (const t of ds.tasks) {
      const ts = new Date(t.timestamp).getTime()
      expect(ts).toBeGreaterThanOrEqual(start)
      expect(ts).toBeLessThan(end)
    }
  })

  it('gives every agent with escalated work at least one human approval record', () => {
    const escalatedAgents = new Set(
      ds.tasks.filter((t) => t.outcome === 'escalated').map((t) => t.agentId),
    )
    const approvedAgents = new Set(ds.approvals.map((a) => a.agentId))
    for (const agentId of escalatedAgents) {
      expect(approvedAgents.has(agentId), `${agentId} has escalations but no approvals`).toBe(true)
    }
  })

  it('stops generating work after an agent is paused or retired', () => {
    for (const agent of ds.agents) {
      const cutoffIso = agent.retiredAt ?? agent.pausedAt
      if (!cutoffIso) continue
      const cutoff = new Date(cutoffIso).getTime()
      const after = ds.tasks.filter(
        (t) => t.agentId === agent.id && new Date(t.timestamp).getTime() > cutoff,
      )
      expect(after, `${agent.name} has tasks after ${cutoffIso}`).toHaveLength(0)
    }
  })

  it('only references existing agents and policies', () => {
    const agentIds = new Set(ds.agents.map((a) => a.id))
    const policyIds = new Set(ds.policies.map((p) => p.id))
    for (const t of ds.tasks) expect(agentIds.has(t.agentId)).toBe(true)
    for (const d of ds.deviations) {
      expect(agentIds.has(d.agentId)).toBe(true)
      expect(policyIds.has(d.policyId)).toBe(true)
    }
    for (const a of ds.approvals) expect(agentIds.has(a.agentId)).toBe(true)
    for (const p of ds.policies) {
      for (const id of p.agentIds) expect(agentIds.has(id)).toBe(true)
    }
  })

  it('ships the specified fixture counts', () => {
    expect(ds.agents).toHaveLength(14)
    expect(ds.policies).toHaveLength(8)
    expect(ds.deviations).toHaveLength(25)
    expect(ds.approvals.length).toBeGreaterThan(20)
  })

  it('links policy assignments both ways', () => {
    for (const p of ds.policies) {
      for (const agentId of p.agentIds) {
        const agent = ds.agents.find((a) => a.id === agentId)
        expect(agent?.policyIds).toContain(p.id)
      }
    }
  })
})
