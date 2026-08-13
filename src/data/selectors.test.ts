import { describe, expect, it } from 'vitest'
import { buildDataSet } from './seed/generate'
import {
  agentPerformance,
  agentsWithDeviations,
  budgetStatuses,
  dailySeries,
  deviationsByAgentMonth,
  evidencePack,
  filterTasks,
  rangeFromDates,
  last30Days,
  last90Days,
  parseLocalDate,
  registrySummary,
  spendByAgent,
  spendByCostCenter,
  spendByDepartment,
  sumCost,
  toIsoDate,
  unitEconomics,
} from './selectors'

const NOW = new Date('2026-08-13T12:00:00')
const ds = buildDataSet(NOW)

describe('cross-screen consistency', () => {
  it('per-agent spend sums to total spend (registry card = cost dashboard)', () => {
    const range = last30Days(ds)
    const perAgent = [...spendByAgent(ds, range).values()].reduce((a, b) => a + b, 0)
    const total = sumCost(filterTasks(ds, { range }))
    expect(perAgent).toBeCloseTo(total, 6)
  })

  it('per-department spend sums to total spend', () => {
    const range = last30Days(ds)
    const perDept = [...spendByDepartment(ds, range).values()].reduce((a, b) => a + b, 0)
    const total = sumCost(filterTasks(ds, { range }))
    expect(perDept).toBeCloseTo(total, 6)
  })

  it('per-cost-center spend sums to total spend', () => {
    const range = last30Days(ds)
    const perCc = [...spendByCostCenter(ds, range).values()].reduce((a, b) => a + b, 0)
    const total = sumCost(filterTasks(ds, { range }))
    expect(perCc).toBeCloseTo(total, 6)
  })

  it('unit economics rows sum back to per-agent spend and never divide by zero', () => {
    const range = last30Days(ds)
    const spend = spendByAgent(ds, range)
    const byAgent = new Map<string, number>()
    for (const row of unitEconomics(ds, range)) {
      expect(row.units).toBeGreaterThan(0)
      expect(Number.isFinite(row.costPerUnit)).toBe(true)
      expect(row.costPerUnit * row.units).toBeCloseTo(row.costUsd, 6)
      byAgent.set(row.agent.id, (byAgent.get(row.agent.id) ?? 0) + row.costUsd)
    }
    for (const [agentId, total] of byAgent) {
      expect(total).toBeCloseTo(spend.get(agentId) ?? 0, 6)
    }
  })

  it('each cost-per-outcome row equals its evidence-pack process row (no double counting)', () => {
    const range = last30Days(ds)
    for (const row of unitEconomics(ds, range).slice(0, 6)) {
      const pack = evidencePack(ds, row.agent.id, range)!
      const packRow = pack.processBreakdown.find((p) => p.process === row.processLabel)
      expect(packRow, `${row.agent.name} / ${row.processLabel} missing from pack`).toBeDefined()
      expect(row.units).toBe(packRow!.units)
      expect(row.costUsd).toBeCloseTo(packRow!.costUsd, 6)
    }
  })

  it('AI beats the human baseline for every process shown on the dashboard', () => {
    for (const row of unitEconomics(ds, last30Days(ds))) {
      expect(
        row.costPerUnit,
        `${row.agent.name}: $${row.costPerUnit.toFixed(2)} vs $${row.humanBaselineUsdPerUnit}`,
      ).toBeLessThan(row.humanBaselineUsdPerUnit)
    }
  })

  it('deviation month matrix accounts for all 25 deviations', () => {
    const matrix = deviationsByAgentMonth(ds)
    const total = matrix.rows.reduce((a, r) => a + r.total, 0)
    expect(total).toBe(ds.deviations.length)
    for (const row of matrix.rows) {
      expect(Object.values(row.counts).reduce((a, b) => a + b, 0)).toBe(row.total)
      for (const key of Object.keys(row.counts)) expect(matrix.months).toContain(key)
    }
  })

  it('30-day window includes the newest activity (regression: UTC-parse day shift)', () => {
    // With UTC parsing of date-only strings this fails in any UTC-negative
    // timezone: the window ends a day early and drops the busiest day.
    const range = last30Days(ds)
    const newest = Math.max(...ds.tasks.map((t) => new Date(t.timestamp).getTime()))
    expect(newest).toBeLessThanOrEqual(range.to)
    expect(newest).toBeGreaterThanOrEqual(range.from)
  })

  it('registry summary matches direct aggregation', () => {
    const s = registrySummary(ds)
    expect(s.totalAgents).toBe(14)
    expect(s.activeAgents).toBe(ds.agents.filter((a) => a.status === 'active').length)
    expect(s.spend30dUsd).toBeCloseTo(sumCost(filterTasks(ds, { range: last30Days(ds) })), 6)
  })
})

describe('chart series and KPIs agree with the underlying task list', () => {
  it('dailySeries covers every day of the range exactly once', () => {
    expect(dailySeries(ds, last30Days(ds))).toHaveLength(30)
    expect(dailySeries(ds, last90Days(ds))).toHaveLength(90)
  })

  it('dailySeries totals equal direct aggregation (charts = cards)', () => {
    const range = last90Days(ds)
    for (const agentId of [undefined, 'ag-clm-fnol', 'ag-sup-refunds']) {
      const series = dailySeries(ds, range, agentId)
      const tasks = filterTasks(ds, { agentId, range })
      expect(series.reduce((a, p) => a + p.tasks, 0)).toBe(tasks.length)
      expect(series.reduce((a, p) => a + p.costUsd, 0)).toBeCloseTo(sumCost(tasks), 6)
    }
  })

  it('agentPerformance matches spendByAgent (detail KPIs = dashboard)', () => {
    const range = last30Days(ds)
    const spend = spendByAgent(ds, range)
    for (const agent of ds.agents) {
      const perf = agentPerformance(ds, agent.id, range)
      expect(perf.costUsd).toBeCloseTo(spend.get(agent.id) ?? 0, 6)
      expect(perf.completed + perf.escalated + perf.failed).toBe(perf.tasks)
    }
  })
})

describe('audit evidence pack', () => {
  const range = last30Days(ds)

  it('totals match the work log for the same agent and period', () => {
    for (const agentId of ['ag-clm-fnol', 'ag-sup-refunds', 'ag-clm-notify']) {
      const pack = evidencePack(ds, agentId, range)!
      const tasks = filterTasks(ds, { agentId, range })
      expect(pack.performance.tasks).toBe(tasks.length)
      expect(pack.performance.costUsd).toBeCloseTo(sumCost(tasks), 6)
      expect(pack.processBreakdown.reduce((a, r) => a + r.tasks, 0)).toBe(tasks.length)
      expect(pack.processBreakdown.reduce((a, r) => a + r.costUsd, 0)).toBeCloseTo(
        sumCost(tasks),
        6,
      )
    }
  })

  it('never includes records outside the requested period or from other agents', () => {
    const pack = evidencePack(ds, 'ag-sup-refunds', range)!
    for (const record of [...pack.approvals, ...pack.deviations]) {
      expect(record.agentId).toBe('ag-sup-refunds')
      const t = new Date(record.timestamp).getTime()
      expect(t).toBeGreaterThanOrEqual(range.from)
      expect(t).toBeLessThanOrEqual(range.to)
    }
  })

  it('never prints a disposition or closure date from after the period end', () => {
    // Sweep every period end in the window: a deviation closed after the
    // period closed must read as still open, with no post-period date.
    for (const agent of ds.agents) {
      for (let day = 1; day <= 90; day += 7) {
        const end = parseLocalDate(ds.rangeEnd)
        end.setDate(end.getDate() - day)
        const start = new Date(end)
        start.setDate(start.getDate() - 29)
        const custom = rangeFromDates(toIsoDate(start), toIsoDate(end))
        const pack = evidencePack(ds, agent.id, custom)!
        for (const d of pack.deviations) {
          if (d.resolvedAt) {
            expect(
              new Date(d.resolvedAt).getTime(),
              `${d.id} closed after the pack's own period end`,
            ).toBeLessThanOrEqual(custom.to)
          }
        }
      }
    }
  })

  it('reports the version actually in force, not the current one', () => {
    const fnol = ds.agents.find((a) => a.id === 'ag-clm-fnol')!
    const firstVersion = fnol.versionHistory[0]
    // A period ending before any later upgrade must report the early version.
    const end = parseLocalDate(fnol.versionHistory[1].date)
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - 29)
    const pack = evidencePack(ds, fnol.id, rangeFromDates(toIsoDate(start), toIsoDate(end)))!
    expect(pack.versionsInEffect.map((v) => v.version)).toEqual([firstVersion.version])
    expect(pack.versionsInEffect[0].version).not.toBe(fnol.version)
  })

  it('returns null for an unknown agent rather than throwing', () => {
    expect(evidencePack(ds, 'ag-does-not-exist', range)).toBeNull()
  })

  it('produces a usable pack for a quiet period (retired agent, no activity)', () => {
    const pack = evidencePack(ds, 'ag-clm-notify', range)!
    expect(pack.performance.tasks).toBe(0)
    expect(pack.processBreakdown).toHaveLength(0)
    expect(pack.policyAssignments.length).toBeGreaterThan(0)
    expect(Number.isFinite(pack.performance.costPerUnit)).toBe(true)
  })

  it('rangeFromDates covers exactly one whole local day, inclusive of both ends', () => {
    const custom = rangeFromDates(ds.rangeEnd, ds.rangeEnd)
    // Bucket by local calendar date, the same way the charts and packs do.
    const sameDay = ds.tasks.filter((t) => toIsoDate(new Date(t.timestamp)) === ds.rangeEnd)
    expect(sameDay.length).toBeGreaterThan(0)
    for (const t of ds.tasks) {
      const inCustom =
        new Date(t.timestamp).getTime() >= custom.from &&
        new Date(t.timestamp).getTime() <= custom.to
      expect(inCustom).toBe(toIsoDate(new Date(t.timestamp)) === ds.rangeEnd)
    }
  })
})

describe('demo narratives survive the calendar', () => {
  // The dataset is anchored to "today", so its numbers shift as days pass.
  // These sweep future demo dates: the story must hold whenever it is shown,
  // not just on the day it was built.
  const anchors = Array.from({ length: 21 }, (_, i) => new Date(2026, 7, 14 + i))

  it('keeps the FNOL agent visibly over budget on every day of the cycle', () => {
    for (const anchor of anchors) {
      const set = buildDataSet(anchor)
      const agent = set.agents.find((a) => a.id === 'ag-clm-fnol')!
      const spend = sumCost(filterTasks(set, { agentId: agent.id, range: last30Days(set) }))
      const ratio = spend / agent.monthlyBudgetUsd
      expect(
        ratio,
        `${anchor.toDateString()}: FNOL at ${Math.round(ratio * 100)}% of budget`,
      ).toBeGreaterThan(1.1)
    }
  })

  it('always flags 2-3 budget alerts, never zero and never a flood', () => {
    for (const anchor of anchors) {
      const set = buildDataSet(anchor)
      const flagged = budgetStatuses(set).filter((b) => b.flag !== 'ok')
      expect(flagged.length, `${anchor.toDateString()}: ${flagged.length} alerts`).toBeGreaterThanOrEqual(2)
      expect(flagged.length).toBeLessThanOrEqual(4)
    }
  })

  it('always keeps open refund deviations on the Refund & Adjustment Agent', () => {
    for (const anchor of anchors) {
      const set = buildDataSet(anchor)
      const open = set.deviations.filter(
        (d) => d.agentId === 'ag-sup-refunds' && d.status === 'open',
      )
      expect(open.length, `${anchor.toDateString()}`).toBeGreaterThan(0)
    }
  })
})

describe('policy alert text agrees with the spend it describes', () => {
  it('every cost-guardrail deviation states its real daily cost and breaches the stated threshold', () => {
    const guardrail = ds.policies.find((p) => p.id === 'pol-cost-guardrail')!
    const threshold = Number(guardrail.rule.match(/([\d.]+)×/)![1])
    const alerts = ds.deviations.filter((d) => d.policyId === 'pol-cost-guardrail')
    expect(alerts.length).toBeGreaterThan(0)

    for (const d of alerts) {
      const claimed = d.description.match(/\$([\d,]+) — ([\d.]+)×/)
      expect(claimed, `unfilled template: ${d.description}`).not.toBeNull()
      const claimedCost = Number(claimed![1].replace(/,/g, ''))
      const claimedRatio = Number(claimed![2])

      const day = toIsoDate(new Date(d.timestamp))
      const dayCost = sumCost(
        ds.tasks.filter((t) => t.agentId === d.agentId && toIsoDate(new Date(t.timestamp)) === day),
      )
      // 30 calendar days ending the day before the alert.
      const windowEnd = parseLocalDate(day)
      windowEnd.setDate(windowEnd.getDate() - 1)
      const windowStart = new Date(windowEnd)
      windowStart.setDate(windowStart.getDate() - 29)
      const trailing =
        sumCost(
          ds.tasks.filter(
            (t) =>
              t.agentId === d.agentId &&
              new Date(t.timestamp).getTime() >= windowStart.setHours(0, 0, 0, 0) &&
              new Date(t.timestamp).getTime() <= windowEnd.setHours(23, 59, 59, 999),
          ),
        ) / 30

      expect(claimedCost, `${d.id} claims $${claimedCost} on a $${dayCost.toFixed(0)} day`).toBe(
        Math.round(dayCost),
      )
      expect(claimedRatio).toBeCloseTo(dayCost / trailing, 1)
      expect(
        dayCost / trailing,
        `${d.id} fired at ${(dayCost / trailing).toFixed(2)}× but the rule needs ${threshold}×`,
      ).toBeGreaterThanOrEqual(threshold)
    }
  })
})

describe('guardrail alert text stays truthful when seeding for an org timezone', () => {
  it('breach amounts match Eastern day totals when generated under America/New_York', async () => {
    const { addCalendarDays, dayOf, setOrgTimeZone } = await import('../lib/orgTime')
    // The live seeder generates under the org timezone (scripts/seed-supabase.ts
    // does exactly this); the invariant must hold for the buckets viewers see.
    setOrgTimeZone('America/New_York')
    try {
      const nyDs = buildDataSet(new Date(2026, 7, 14))
      const alerts = nyDs.deviations.filter((d) => d.policyId === 'pol-cost-guardrail')
      expect(alerts.length).toBeGreaterThan(0)

      for (const d of alerts) {
        const claimed = d.description.match(/\$([\d,]+) — ([\d.]+)×/)
        expect(claimed, d.description).not.toBeNull()
        const claimedCost = Number(claimed![1].replace(/,/g, ''))

        const day = dayOf(d.timestamp)
        const dayTotal = sumCost(
          nyDs.tasks.filter((t) => t.agentId === d.agentId && dayOf(t.timestamp) === day),
        )
        expect(claimedCost, `${d.id} on ${day}`).toBe(Math.round(dayTotal))

        // And it genuinely breaches the stated threshold against the trailing
        // 30 Eastern days.
        let trailing = 0
        for (let k = 1; k <= 30; k++) {
          const prior = addCalendarDays(day, -k)
          trailing += sumCost(
            nyDs.tasks.filter((t) => t.agentId === d.agentId && dayOf(t.timestamp) === prior),
          )
        }
        expect(dayTotal / (trailing / 30), `${d.id} ratio`).toBeGreaterThanOrEqual(1.4)
      }
    } finally {
      setOrgTimeZone('local')
    }
  })
})

describe('selectors stay internally consistent under an org business timezone', () => {
  it('charts, KPIs, and evidence packs still agree when bucketing in America/New_York', async () => {
    const { setOrgTimeZone } = await import('../lib/orgTime')
    setOrgTimeZone('America/New_York')
    try {
      const range = last90Days(ds)
      const series = dailySeries(ds, range)
      const tasks = filterTasks(ds, { range })
      expect(series).toHaveLength(90)
      expect(series.reduce((a, p) => a + p.tasks, 0)).toBe(tasks.length)
      expect(series.reduce((a, p) => a + p.costUsd, 0)).toBeCloseTo(sumCost(tasks), 6)

      const pack = evidencePack(ds, 'ag-clm-fnol', last30Days(ds))!
      const fnolTasks = filterTasks(ds, { agentId: 'ag-clm-fnol', range: last30Days(ds) })
      expect(pack.performance.tasks).toBe(fnolTasks.length)
      expect(pack.performance.costUsd).toBeCloseTo(sumCost(fnolTasks), 6)
    } finally {
      setOrgTimeZone('local')
    }
  })
})

describe('demo narratives hold in the generated data', () => {
  it('FNOL Intake Agent is over its monthly budget (narrative 1)', () => {
    const status = budgetStatuses(ds).find((b) => b.agent.id === 'ag-clm-fnol')
    expect(status).toBeDefined()
    expect(status!.flag).toBe('over')
  })

  it('flags 2-3 agents over or approaching budget', () => {
    const flagged = budgetStatuses(ds).filter((b) => b.flag !== 'ok')
    expect(flagged.length).toBeGreaterThanOrEqual(2)
    expect(flagged.length).toBeLessThanOrEqual(4)
  })

  it('concentrates recent deviations in the three problem agents (narrative 2)', () => {
    const recent = agentsWithDeviations(ds, last30Days(ds))
    expect(recent).toEqual(new Set(['ag-sup-refunds', 'ag-clm-fnol', 'ag-fin-ap']))
  })

  it('Refund & Adjustment Agent has open refund-threshold deviations', () => {
    const open = ds.deviations.filter(
      (d) =>
        d.agentId === 'ag-sup-refunds' &&
        d.policyId === 'pol-refund-escalation' &&
        d.status === 'open',
    )
    expect(open.length).toBeGreaterThanOrEqual(2)
  })
})
