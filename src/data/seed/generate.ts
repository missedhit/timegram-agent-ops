/**
 * Deterministic seed-data generator.
 *
 * Builds the full DataSet from the hand-authored fixtures plus a seeded
 * pseudo-random stream. Given the same anchor date it always produces the
 * same data, and all dates are relative to "today", so the demo window is
 * always the last 90 days ending yesterday.
 */

import type {
  Agent,
  ApprovalEvent,
  DataSet,
  Deviation,
  Policy,
  TaskOutcome,
  WorkTask,
} from '../../domain/types'
import { dayOf } from '../../lib/orgTime'
import {
  AGENT_FIXTURES,
  APPROVAL_TEMPLATES,
  BROKER_NAMES,
  COST_CENTERS,
  DEPARTMENT_APPROVERS,
  DEPARTMENTS,
  DEVIATION_FIXTURES,
  GENERIC_APPROVAL_TEMPLATE,
  POLICY_FIXTURES,
  POLICY_NUMBER_PREFIX,
  type AgentFixture,
  type CostCenter,
} from './fixtures'

const WINDOW_DAYS = 90
const SEED = 0x5eed_2026

/** Blended $/token used to derive the secondary token-count detail from cost. */
const USD_PER_TOKEN = 0.0000085

/** Sunday..Saturday activity multipliers — weekdays busier, weekends quiet. */
const WEEKDAY_MULTIPLIERS = [0.15, 1.0, 1.1, 1.15, 1.1, 1.0, 0.3]

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) + helpers
// ---------------------------------------------------------------------------

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const randInt = (rng: Rng, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))

const pick = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]

/** Multiplicative jitter: mean × (1 ± spread). */
const jitter = (rng: Rng, mean: number, spread: number) =>
  mean * (1 + (rng() * 2 - 1) * spread)

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/**
 * Step back whole calendar days. Fixed 24h subtraction would land on 23:00 of
 * the previous date across a DST spring-forward, misdating everything before
 * the transition; the Date constructor renormalizes local fields safely.
 */
const daysAgoToDate = (anchor: Date, daysAgo: number) =>
  new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - daysAgo)

const isoDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const daysAgoToIsoDate = (anchor: Date, daysAgo: number) => isoDate(daysAgoToDate(anchor, daysAgo))

const daysAgoToIsoDateTime = (anchor: Date, daysAgo: number, hour: number, minute = 0) => {
  const d = daysAgoToDate(anchor, daysAgo)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

// ---------------------------------------------------------------------------
// Reference-number generators for description placeholders
// ---------------------------------------------------------------------------

const policyNumber = (rng: Rng, costCenter: CostCenter) =>
  `${POLICY_NUMBER_PREFIX[costCenter]}-${randInt(rng, 10000, 89999)}`

const claimNumber = (rng: Rng, year: number) =>
  `CLM-${year}-${String(randInt(rng, 1000, 9999)).padStart(5, '0')}`

const invoiceNumber = (rng: Rng) => `INV-${randInt(rng, 80000, 99999)}`

/** Plural nouns that can follow a generated count in task templates. */
const SINGULAR_NOUNS: Record<string, string> = {
  invoices: 'invoice',
  claims: 'claim',
  opportunities: 'opportunity',
  exceptions: 'exception',
  payments: 'payment',
  reports: 'report',
  complaints: 'complaint',
  quotes: 'quote',
  policies: 'policy',
  appointments: 'appointment',
  documents: 'document',
  pages: 'page',
  tickets: 'ticket',
  accounts: 'account',
  notifications: 'notification',
  policyholders: 'policyholder',
  transactions: 'transaction',
  items: 'item',
  positions: 'position',
}

/** "1 opportunities flagged" → "1 opportunity flagged". */
const fixPlurals = (text: string) =>
  text.replace(/\b1 ([a-z]+)\b/g, (match, noun: string) =>
    SINGULAR_NOUNS[noun] ? `1 ${SINGULAR_NOUNS[noun]}` : match,
  )

function fillTemplate(
  rng: Rng,
  text: string,
  ctx: { units: number; flagged: number; costCenter: CostCenter; year: number },
): string {
  return fixPlurals(
    text
      .replace('{b}', String(randInt(rng, 1000, 9899)))
      .replace('{u}', String(ctx.units))
      .replace('{f}', String(ctx.flagged))
      .replace('{pol}', policyNumber(rng, ctx.costCenter))
      .replace('{claim}', claimNumber(rng, ctx.year))
      .replace('{inv}', invoiceNumber(rng))
      .replace('{brk}', pick(rng, BROKER_NAMES)),
  )
}

// ---------------------------------------------------------------------------
// Agent materialization
// ---------------------------------------------------------------------------

function materializeAgent(fx: AgentFixture, anchor: Date): Agent {
  const history = fx.versionHistory.map((v) => ({
    version: v.version,
    date: daysAgoToIsoDate(anchor, v.daysAgo),
    note: v.note,
  }))
  return {
    id: fx.id,
    name: fx.name,
    purpose: fx.purpose,
    owner: fx.owner,
    department: fx.department,
    status: fx.status,
    model: fx.model,
    modelProvider: fx.modelProvider,
    tools: fx.tools,
    dataDomains: fx.dataDomains,
    permissions: fx.permissions,
    riskLevel: fx.riskLevel,
    version: history[history.length - 1]?.version ?? 'v1.0',
    versionHistory: history,
    deployedAt: daysAgoToIsoDate(anchor, fx.deployedDaysAgo),
    pausedAt: fx.pausedDaysAgo !== undefined ? daysAgoToIsoDate(anchor, fx.pausedDaysAgo) : undefined,
    retiredAt:
      fx.retiredDaysAgo !== undefined ? daysAgoToIsoDate(anchor, fx.retiredDaysAgo) : undefined,
    monthlyBudgetUsd: fx.monthlyBudgetUsd,
    policyIds: fx.policyIds,
    unitLabel: fx.unitLabel,
    humanBaselineUsdPerUnit: fx.humanBaselineUsdPerUnit,
  }
}

/** True when the agent generates work on the day `daysAgo` days before anchor. */
function isActiveOn(fx: AgentFixture, daysAgo: number): boolean {
  if (fx.deployedDaysAgo < daysAgo) return false
  if (fx.retiredDaysAgo !== undefined && daysAgo <= fx.retiredDaysAgo) return false
  if (fx.pausedDaysAgo !== undefined && daysAgo <= fx.pausedDaysAgo) return false
  return true
}

// ---------------------------------------------------------------------------
// Task generation
// ---------------------------------------------------------------------------

function generateTasksForAgent(fx: AgentFixture, anchor: Date, rng: Rng): WorkTask[] {
  const tasks: WorkTask[] = []
  let seq = 0

  for (let daysAgo = WINDOW_DAYS; daysAgo >= 1; daysAgo--) {
    if (!isActiveOn(fx, daysAgo)) continue

    const day = daysAgoToDate(anchor, daysAgo)
    const weekdayMult = WEEKDAY_MULTIPLIERS[day.getDay()]

    // Narrative ramp over the final 28 days (0 → 1 progress).
    const rampProgress = daysAgo <= 28 ? (28 - daysAgo) / 27 : 0
    const volumeMult = 1 + ((fx.gen.volumeRampLast28 ?? 1) - 1) * rampProgress
    const costMult = 1 + ((fx.gen.costRampLast28 ?? 1) - 1) * rampProgress

    const expected = fx.gen.tasksPerDay * weekdayMult * volumeMult * (0.75 + rng() * 0.5)
    const count = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0)

    for (let i = 0; i < count; i++) {
      const template = pick(rng, fx.gen.templates)
      const costCenter = pick(rng, template.costCenters)
      const units = Math.max(1, Math.round(jitter(rng, fx.gen.unitsMean, 0.4)))
      const flagged = Math.min(units, Math.round(units * fx.gen.flagRate * jitter(rng, 1, 0.5)))

      const outcomeRoll = rng()
      const outcome: TaskOutcome =
        outcomeRoll < fx.gen.failureRate
          ? 'failed'
          : outcomeRoll < fx.gen.failureRate + fx.gen.escalationRate
            ? 'escalated'
            : 'completed'

      // Failed runs stop partway, so they cost and last less.
      const costUsd =
        jitter(rng, fx.gen.costMeanUsd, fx.gen.costSpread) * costMult * (outcome === 'failed' ? 0.5 : 1)
      const durationSec = Math.max(
        30,
        Math.round(jitter(rng, fx.gen.durationMeanSec, 0.6) * (outcome === 'failed' ? 0.5 : 1)),
      )

      const timestamp = new Date(day)
      timestamp.setHours(randInt(rng, 7, 18), randInt(rng, 0, 59), randInt(rng, 0, 59), 0)

      tasks.push({
        id: `t-${fx.id}-${++seq}`,
        agentId: fx.id,
        timestamp: timestamp.toISOString(),
        description: fillTemplate(rng, template.text, {
          units,
          flagged,
          costCenter,
          year: timestamp.getFullYear(),
        }),
        businessProcess: template.process,
        costCenter,
        outcome,
        durationSec,
        costUsd: Math.round(costUsd * 100) / 100,
        units,
        tokens: Math.round((costUsd / USD_PER_TOKEN) * jitter(rng, 1, 0.15)),
      })
    }
  }
  return tasks
}

// ---------------------------------------------------------------------------
// Approval events, derived from escalated tasks for cross-screen consistency
// ---------------------------------------------------------------------------

const GUARDRAIL_POLICY_ID = 'pol-cost-guardrail'
/** Must match the threshold stated in the policy rule text. */
const GUARDRAIL_MULTIPLE = 1.4
const TRAILING_WINDOW_DAYS = 30

interface BreachDay {
  daysAgo: number
  costUsd: number
  ratio: number
}

const fmtWholeUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/**
 * Days where an agent's spend actually exceeded GUARDRAIL_MULTIPLE × its
 * trailing 30-day average, worst first, capped at `limit`. Returned in
 * most-recent-first order so narrative fixtures read chronologically.
 */
function guardrailBreaches(
  tasks: WorkTask[],
  agentId: string,
  anchor: Date,
  limit: number,
): BreachDay[] {
  const totals = new Map<string, number>()
  for (const t of tasks) {
    if (t.agentId !== agentId) continue
    // Bucket in ORG time (viewer-local in seed mode, the org's business
    // timezone when the seed script targets the live DB) so the dollar
    // amounts baked into alert text always match the day totals the cost
    // charts will show.
    const key = dayOf(t.timestamp)
    totals.set(key, (totals.get(key) ?? 0) + t.costUsd)
  }
  const costOn = (daysAgo: number) => totals.get(daysAgoToIsoDate(anchor, daysAgo)) ?? 0

  const breaches: BreachDay[] = []
  for (let daysAgo = 1; daysAgo <= 30; daysAgo++) {
    const costUsd = costOn(daysAgo)
    if (costUsd === 0) continue
    let trailing = 0
    for (let k = daysAgo + 1; k <= daysAgo + TRAILING_WINDOW_DAYS; k++) trailing += costOn(k)
    const average = trailing / TRAILING_WINDOW_DAYS
    if (average <= 0) continue
    const ratio = costUsd / average
    if (ratio >= GUARDRAIL_MULTIPLE) breaches.push({ daysAgo, costUsd, ratio })
  }

  return breaches
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit)
    .sort((a, b) => a.daysAgo - b.daysAgo)
}

function generateApprovals(tasks: WorkTask[], agents: Agent[], rng: Rng): ApprovalEvent[] {
  const approvals: ApprovalEvent[] = []
  let counter = 0

  for (const agent of agents) {
    const agentId = agent.id
    const templates = APPROVAL_TEMPLATES[agentId] ?? []
    const escalated = tasks.filter((t) => t.agentId === agentId && t.outcome === 'escalated')

    escalated.forEach((task, idx) => {
      // Roughly every second escalation gets a recorded human sign-off.
      if (idx % 2 !== 0) return
      const approverInfo = DEPARTMENT_APPROVERS[agent.department]
      const template = templates.length > 0 ? pick(rng, templates) : GENERIC_APPROVAL_TEMPLATE
      const costCenter = COST_CENTERS.includes(task.costCenter as CostCenter)
        ? (task.costCenter as CostCenter)
        : 'Corporate'
      const when = new Date(new Date(task.timestamp).getTime() + randInt(rng, 1, 5) * 60 * 60 * 1000)

      approvals.push({
        id: `app-${++counter}`,
        agentId,
        taskId: task.id,
        timestamp: when.toISOString(),
        approver: approverInfo.approver,
        approverRole: approverInfo.role,
        description: template
          .replace('{amt}', randInt(rng, 5100, 13900).toLocaleString('en-US'))
          .replace('{pol}', policyNumber(rng, costCenter))
          .replace('{claim}', claimNumber(rng, when.getFullYear()))
          .replace('{inv}', invoiceNumber(rng)),
      })
    })
  }

  return approvals.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildDataSet(now: Date = new Date()): DataSet {
  const anchor = startOfDay(now)
  const rng = mulberry32(SEED)

  const agents = AGENT_FIXTURES.map((fx) => materializeAgent(fx, anchor))

  const policies: Policy[] = POLICY_FIXTURES.map((fx) => ({
    id: fx.id,
    name: fx.name,
    rule: fx.rule,
    enforcement: fx.enforcement,
    agentIds: AGENT_FIXTURES.filter((a) => a.policyIds.includes(fx.id)).map((a) => a.id),
    createdAt: daysAgoToIsoDate(anchor, fx.createdDaysAgo),
  }))

  const tasks = AGENT_FIXTURES.flatMap((fx) => generateTasksForAgent(fx, anchor, rng))

  // Spend-guardrail deviations are placed on days that genuinely breach the
  // policy, with their real cost and multiple, so the alert text can never
  // contradict the spend shown on the cost trend or the rule beside it.
  const guardrailDays = new Map<string, BreachDay[]>()
  for (const agentId of new Set(
    DEVIATION_FIXTURES.filter((fx) => fx.policyId === GUARDRAIL_POLICY_ID).map((fx) => fx.agentId),
  )) {
    const needed = DEVIATION_FIXTURES.filter(
      (fx) => fx.policyId === GUARDRAIL_POLICY_ID && fx.agentId === agentId,
    ).length
    guardrailDays.set(agentId, guardrailBreaches(tasks, agentId, anchor, needed))
  }
  const guardrailCursor = new Map<string, number>()

  const deviations: Deviation[] = DEVIATION_FIXTURES.map((fx, i) => {
    let daysAgo = fx.daysAgo
    let description = fx.description

    if (fx.policyId === GUARDRAIL_POLICY_ID) {
      const cursor = guardrailCursor.get(fx.agentId) ?? 0
      guardrailCursor.set(fx.agentId, cursor + 1)
      const breach = guardrailDays.get(fx.agentId)?.[cursor]
      if (breach) {
        daysAgo = breach.daysAgo
        description = description
          .replace('{cost}', fmtWholeUsd(breach.costUsd))
          .replace('{mult}', breach.ratio.toFixed(1))
      }
    }

    // Keep each resolution the same number of days after its deviation.
    const resolutionLag =
      fx.resolvedDaysAgo !== undefined ? fx.daysAgo - fx.resolvedDaysAgo : undefined
    const resolvedDaysAgo =
      resolutionLag !== undefined ? Math.max(0, daysAgo - resolutionLag) : undefined

    return {
      id: `dev-${i + 1}`,
      timestamp: daysAgoToIsoDateTime(anchor, daysAgo, fx.hour, randInt(rng, 0, 59)),
      agentId: fx.agentId,
      policyId: fx.policyId,
      description,
      status: fx.status,
      resolvedAt:
        resolvedDaysAgo !== undefined
          ? daysAgoToIsoDateTime(anchor, resolvedDaysAgo, fx.hour + 1)
          : undefined,
      resolutionNote: fx.resolutionNote,
    }
  })

  const approvals = generateApprovals(tasks, agents, rng)

  return {
    generatedAt: now.toISOString(),
    rangeStart: daysAgoToIsoDate(anchor, WINDOW_DAYS),
    rangeEnd: daysAgoToIsoDate(anchor, 1),
    agents,
    tasks,
    policies,
    deviations,
    approvals,
    departments: DEPARTMENTS,
    costCenters: [...COST_CENTERS],
  }
}
