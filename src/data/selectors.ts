/**
 * Pure aggregation functions over the DataSet.
 *
 * Every number shown anywhere in the UI is computed here, from the single
 * task list — so the registry summary, cost dashboard, and agent detail can
 * never disagree. Keep these pure (no React, no Date.now()) so they stay
 * unit-testable and portable to a future backend.
 */

import { addCalendarDays, dayBounds, dayOf, monthOf } from '../lib/orgTime'
import type {
  Agent,
  AgentVersion,
  ApprovalEvent,
  DataSet,
  Deviation,
  Policy,
  TaskOutcome,
  WorkTask,
} from '../domain/types'

export interface DateRange {
  /** Inclusive, millisecond epoch. */
  from: number
  /** Inclusive, millisecond epoch. */
  to: number
}

const parseTime = (iso: string) => new Date(iso).getTime()

/**
 * Parse a date-only ISO string ('2026-08-12') as a LOCAL calendar date.
 * Bare `new Date('2026-08-12')` is spec-defined as UTC midnight, which lands
 * on the previous local day anywhere west of UTC and would shift every
 * "last 30 days" figure by a full day.
 */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Local calendar date of a Date as 'YYYY-MM-DD'. */
export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** End of the dataset window as an inclusive [from, to] range of the last N days. */
export function lastNDays(ds: DataSet, n: number): DateRange {
  // Calendar-day stepping in org time, not n×24h — DST-safe by construction.
  return {
    from: dayBounds(addCalendarDays(ds.rangeEnd, -(n - 1))).from,
    to: dayBounds(ds.rangeEnd).to,
  }
}

export const last30Days = (ds: DataSet): DateRange => lastNDays(ds, 30)
export const last90Days = (ds: DataSet): DateRange => lastNDays(ds, 90)

/** Inclusive range from two date-only strings ('YYYY-MM-DD'), in org time. */
export function rangeFromDates(startIso: string, endIso: string): DateRange {
  return { from: dayBounds(startIso).from, to: dayBounds(endIso).to }
}

export const inRange = (iso: string, range: DateRange): boolean => {
  const t = parseTime(iso)
  return t >= range.from && t <= range.to
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const agentById = (ds: DataSet): Map<string, Agent> =>
  new Map(ds.agents.map((a) => [a.id, a]))

// ---------------------------------------------------------------------------
// Task filtering and spend aggregation
// ---------------------------------------------------------------------------

export interface TaskFilter {
  agentId?: string
  department?: string
  outcome?: TaskOutcome
  costCenter?: string
  range?: DateRange
}

export function filterTasks(ds: DataSet, filter: TaskFilter): WorkTask[] {
  const byId = filter.department ? agentById(ds) : null
  return ds.tasks.filter((t) => {
    if (filter.agentId && t.agentId !== filter.agentId) return false
    if (filter.outcome && t.outcome !== filter.outcome) return false
    if (filter.costCenter && t.costCenter !== filter.costCenter) return false
    if (filter.department && byId?.get(t.agentId)?.department !== filter.department) return false
    if (filter.range && !inRange(t.timestamp, filter.range)) return false
    return true
  })
}

export const sumCost = (tasks: WorkTask[]): number =>
  tasks.reduce((acc, t) => acc + t.costUsd, 0)

export function spendByAgent(ds: DataSet, range: DateRange): Map<string, number> {
  const result = new Map<string, number>()
  for (const t of ds.tasks) {
    if (!inRange(t.timestamp, range)) continue
    result.set(t.agentId, (result.get(t.agentId) ?? 0) + t.costUsd)
  }
  return result
}

export function spendByDepartment(ds: DataSet, range: DateRange): Map<string, number> {
  const byId = agentById(ds)
  const result = new Map<string, number>()
  for (const t of ds.tasks) {
    if (!inRange(t.timestamp, range)) continue
    const dept = byId.get(t.agentId)?.department ?? 'Unknown'
    result.set(dept, (result.get(dept) ?? 0) + t.costUsd)
  }
  return result
}

export function spendByCostCenter(ds: DataSet, range: DateRange): Map<string, number> {
  const result = new Map<string, number>()
  for (const t of ds.tasks) {
    if (!inRange(t.timestamp, range)) continue
    result.set(t.costCenter, (result.get(t.costCenter) ?? 0) + t.costUsd)
  }
  return result
}

// ---------------------------------------------------------------------------
// Unit economics (cost-per-outcome cards)
// ---------------------------------------------------------------------------

export interface UnitEconomics {
  agent: Agent
  /** One row per business process — never an agent-wide roll-up. */
  processLabel: string
  units: number
  costUsd: number
  costPerUnit: number
  humanBaselineUsdPerUnit: number
  /** units × (human baseline − AI cost per unit) over the range. */
  savedUsd: number
}

/**
 * Cost-per-unit vs human baseline, computed per business process so each card
 * reconciles exactly with the matching row of that agent's evidence pack.
 * Rolling several processes into one card would count the same underlying
 * item more than once (an invoice is matched, validated, then reconciled).
 */
export function unitEconomics(ds: DataSet, range: DateRange): UnitEconomics[] {
  const result: UnitEconomics[] = []
  for (const agent of ds.agents) {
    const byProcess = new Map<string, { units: number; costUsd: number }>()
    for (const t of filterTasks(ds, { agentId: agent.id, range })) {
      const row = byProcess.get(t.businessProcess) ?? { units: 0, costUsd: 0 }
      row.units += t.units
      row.costUsd += t.costUsd
      byProcess.set(t.businessProcess, row)
    }
    for (const [processLabel, { units, costUsd }] of byProcess) {
      if (units === 0) continue
      const costPerUnit = costUsd / units
      result.push({
        agent,
        processLabel,
        units,
        costUsd,
        costPerUnit,
        humanBaselineUsdPerUnit: agent.humanBaselineUsdPerUnit,
        savedUsd: units * (agent.humanBaselineUsdPerUnit - costPerUnit),
      })
    }
  }
  return result.sort((a, b) => b.savedUsd - a.savedUsd)
}

// ---------------------------------------------------------------------------
// Deviation report (per agent per month)
// ---------------------------------------------------------------------------

export interface DeviationMonthMatrix {
  /** Month keys 'YYYY-MM', oldest first. */
  months: string[]
  /** True when the months cross a calendar-year boundary. */
  spansYears: boolean
  rows: Array<{ agentId: string; counts: Record<string, number>; total: number }>
}

/** Deviation counts per agent per calendar month, agents sorted worst-first. */
export function deviationsByAgentMonth(ds: DataSet): DeviationMonthMatrix {
  const months = [...new Set(ds.deviations.map((d) => monthOf(d.timestamp)))].sort()
  const byAgent = new Map<string, Record<string, number>>()
  for (const d of ds.deviations) {
    const counts = byAgent.get(d.agentId) ?? {}
    const key = monthOf(d.timestamp)
    counts[key] = (counts[key] ?? 0) + 1
    byAgent.set(d.agentId, counts)
  }
  const rows = [...byAgent.entries()]
    .map(([agentId, counts]) => ({
      agentId,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total)
  const spansYears = new Set(months.map((m) => m.slice(0, 4))).size > 1
  return { months, spansYears, rows }
}

// ---------------------------------------------------------------------------
// Time series (charts)
// ---------------------------------------------------------------------------

export interface DailyPoint {
  /** Local calendar date, 'YYYY-MM-DD'. */
  date: string
  tasks: number
  costUsd: number
}

/**
 * Per-day task count and spend across `range`, zero-filled so charts show
 * quiet days as gaps in activity rather than missing points.
 */
export function dailySeries(ds: DataSet, range: DateRange, agentId?: string): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>()
  const lastDay = dayOf(range.to)
  for (let day = dayOf(range.from); day <= lastDay; day = addCalendarDays(day, 1)) {
    byDate.set(day, { date: day, tasks: 0, costUsd: 0 })
  }
  for (const t of ds.tasks) {
    if (agentId && t.agentId !== agentId) continue
    if (!inRange(t.timestamp, range)) continue
    const point = byDate.get(dayOf(t.timestamp))
    if (!point) continue
    point.tasks += 1
    point.costUsd += t.costUsd
  }
  return [...byDate.values()]
}

// ---------------------------------------------------------------------------
// Per-agent performance (detail screen KPIs)
// ---------------------------------------------------------------------------

export interface AgentPerformance {
  tasks: number
  completed: number
  escalated: number
  failed: number
  costUsd: number
  units: number
  /** costUsd / units; 0 when no units were processed. */
  costPerUnit: number
  /** escalated / tasks; 0 when no tasks. */
  escalationRate: number
}

export function agentPerformance(ds: DataSet, agentId: string, range: DateRange): AgentPerformance {
  const tasks = filterTasks(ds, { agentId, range })
  const completed = tasks.filter((t) => t.outcome === 'completed').length
  const escalated = tasks.filter((t) => t.outcome === 'escalated').length
  const failed = tasks.filter((t) => t.outcome === 'failed').length
  const costUsd = sumCost(tasks)
  const units = tasks.reduce((acc, t) => acc + t.units, 0)
  return {
    tasks: tasks.length,
    completed,
    escalated,
    failed,
    costUsd,
    units,
    costPerUnit: units > 0 ? costUsd / units : 0,
    escalationRate: tasks.length > 0 ? escalated / tasks.length : 0,
  }
}

// ---------------------------------------------------------------------------
// Deviations
// ---------------------------------------------------------------------------

export const deviationsForAgent = (ds: DataSet, agentId: string): Deviation[] =>
  ds.deviations.filter((d) => d.agentId === agentId)

export function agentsWithDeviations(ds: DataSet, range: DateRange): Set<string> {
  const result = new Set<string>()
  for (const d of ds.deviations) {
    if (inRange(d.timestamp, range)) result.add(d.agentId)
  }
  return result
}

export const openDeviationCount = (ds: DataSet, agentId: string): number =>
  ds.deviations.filter((d) => d.agentId === agentId && d.status === 'open').length

// ---------------------------------------------------------------------------
// Audit evidence pack
// ---------------------------------------------------------------------------

export interface ProcessBreakdownRow {
  process: string
  tasks: number
  units: number
  costUsd: number
}

export interface PolicyAssignment {
  policy: Policy
  /** Later of the policy's creation and the agent's deployment. */
  effectiveFrom: string
}

export interface EvidencePack {
  agent: Agent
  /** Inclusive period covered, as local date strings. */
  periodStart: string
  periodEnd: string
  /** Version(s) actually in force during the period, oldest first. */
  versionsInEffect: AgentVersion[]
  performance: AgentPerformance
  processBreakdown: ProcessBreakdownRow[]
  approvals: ApprovalEvent[]
  deviations: Deviation[]
  policyAssignments: PolicyAssignment[]
  /** Version-history entries that took effect inside the period. */
  configChanges: AgentVersion[]
}

/**
 * Version entries in force at any point during the period, oldest first —
 * including the one that was already running when the period opened. The data
 * model carries no per-version model name, so the model itself can only ever
 * be reported as-of-export.
 */
export function versionsInEffect(
  agent: Agent,
  periodStart: string,
  periodEnd: string,
): AgentVersion[] {
  // versionHistory is oldest-first and dates are 'YYYY-MM-DD', so string
  // comparison is chronological.
  const upToEnd = agent.versionHistory.filter((v) => v.date <= periodEnd)
  if (upToEnd.length === 0) return []
  let startIdx = 0
  for (let i = 0; i < upToEnd.length; i++) {
    if (upToEnd[i].date <= periodStart) startIdx = i
  }
  return upToEnd.slice(startIdx)
}

/**
 * Everything needed to evidence one agent's conduct over one period, drawn
 * from the same task/approval/deviation records as every other screen.
 * Metadata only: activity, approvals, policy state — never model input/output.
 */
export function evidencePack(ds: DataSet, agentId: string, range: DateRange): EvidencePack | null {
  const agent = ds.agents.find((a) => a.id === agentId)
  if (!agent) return null

  const tasks = filterTasks(ds, { agentId, range })
  const byProcess = new Map<string, ProcessBreakdownRow>()
  for (const t of tasks) {
    const row = byProcess.get(t.businessProcess) ?? {
      process: t.businessProcess,
      tasks: 0,
      units: 0,
      costUsd: 0,
    }
    row.tasks += 1
    row.units += t.units
    row.costUsd += t.costUsd
    byProcess.set(t.businessProcess, row)
  }

  const periodStart = dayOf(range.from)
  const periodEnd = dayOf(range.to)

  return {
    agent,
    periodStart,
    periodEnd,
    versionsInEffect: versionsInEffect(agent, periodStart, periodEnd),
    performance: agentPerformance(ds, agentId, range),
    processBreakdown: [...byProcess.values()].sort((a, b) => b.costUsd - a.costUsd),
    approvals: ds.approvals
      .filter((a) => a.agentId === agentId && inRange(a.timestamp, range))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    deviations: ds.deviations
      .filter((d) => d.agentId === agentId && inRange(d.timestamp, range))
      // As-of-period-end snapshot: a closure dated after the period had not
      // happened yet when the period closed, so the pack must not print a
      // disposition or date outside the window it claims to cover.
      .map((d) =>
        d.resolvedAt && parseTime(d.resolvedAt) > range.to
          ? { ...d, status: 'open' as const, resolvedAt: undefined, resolutionNote: undefined }
          : d,
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    policyAssignments: ds.policies
      .filter((p) => p.agentIds.includes(agentId))
      .map((policy) => ({
        policy,
        effectiveFrom:
          policy.createdAt > agent.deployedAt ? policy.createdAt : agent.deployedAt,
      }))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    configChanges: agent.versionHistory
      // A version "took effect inside the period" if the middle of its
      // effective day (org time) falls in the range.
      .filter((v) => {
        const mid = dayBounds(v.date).from + 12 * 3600_000
        return mid >= range.from && mid <= range.to
      })
      .slice()
      .reverse(),
  }
}

// ---------------------------------------------------------------------------
// Registry summary + budget status
// ---------------------------------------------------------------------------

export interface RegistrySummary {
  totalAgents: number
  activeAgents: number
  agentsWithDeviations30d: number
  spend30dUsd: number
}

export function registrySummary(ds: DataSet): RegistrySummary {
  const range = last30Days(ds)
  return {
    totalAgents: ds.agents.length,
    activeAgents: ds.agents.filter((a) => a.status === 'active').length,
    agentsWithDeviations30d: agentsWithDeviations(ds, range).size,
    spend30dUsd: sumCost(filterTasks(ds, { range })),
  }
}

export interface BudgetStatus {
  agent: Agent
  monthlyBudgetUsd: number
  spend30dUsd: number
  /** spend / budget; 1.0 = exactly on budget. */
  ratio: number
  flag: 'over' | 'approaching' | 'ok'
}

/** Per-agent budget posture over the last 30 days, sorted worst-first. */
export function budgetStatuses(ds: DataSet): BudgetStatus[] {
  const spend = spendByAgent(ds, last30Days(ds))
  return ds.agents
    .map((agent) => {
      const spend30dUsd = spend.get(agent.id) ?? 0
      const ratio = agent.monthlyBudgetUsd > 0 ? spend30dUsd / agent.monthlyBudgetUsd : 0
      const flag: BudgetStatus['flag'] =
        ratio > 1 ? 'over' : ratio >= 0.9 ? 'approaching' : 'ok'
      return { agent, monthlyBudgetUsd: agent.monthlyBudgetUsd, spend30dUsd, ratio, flag }
    })
    .sort((a, b) => b.ratio - a.ratio)
}
