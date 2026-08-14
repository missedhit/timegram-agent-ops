/**
 * Domain ⇄ database row mappers.
 *
 * The single translation layer between src/domain/types.ts and the Supabase
 * schema. Both the seed loader (scripts/seed-supabase.ts) and the live
 * SupabaseDataSource use THESE functions, and a round-trip test
 * (buildDataSet → toRows → fromRows deep-equals the original) makes it
 * structurally impossible for seed mode and supabase mode to drift apart.
 *
 * Pure module: no supabase-js import, so tests need no mocking.
 */

import type {
  Agent,
  AgentStatus,
  AgentVersion,
  ApprovalEvent,
  DataSet,
  Department,
  Deviation,
  DeviationStatus,
  EnforcementMode,
  ModelProvider,
  Policy,
  RiskLevel,
  TaskOutcome,
  WorkTask,
} from '../../domain/types'
import { dayOf } from '../../lib/orgTime'
import { COST_CENTERS, DEPARTMENTS } from '../seed/fixtures'

/** The demo tenant. Fixed so reseeding is idempotent. */
export const DEMO_ORG_ID = '00000000-0000-4000-8000-000000000001'
export const DEMO_ORG_NAME = 'Northbridge Mutual'

// ---------------------------------------------------------------------------
// Row shapes (snake_case mirrors of the SQL schema)
// ---------------------------------------------------------------------------

export interface AgentRow {
  org_id: string
  id: string
  name: string
  purpose: string
  owner_name: string
  owner_department: string
  department: string
  status: string
  model: string
  model_provider: string
  tools: string[]
  data_domains: string[]
  permissions: string[]
  risk_level: string
  version: string
  deployed_at: string
  paused_at: string | null
  retired_at: string | null
  monthly_budget_usd: number
  unit_label: string
  human_baseline_usd_per_unit: number
  sort_order: number
}

export interface AgentVersionRow {
  org_id: string
  agent_id: string
  version: string
  date: string
  note: string
  sort_order: number
}

export interface PolicyRow {
  org_id: string
  id: string
  name: string
  rule: string
  enforcement: string
  created_at: string
  sort_order: number
}

export interface AgentPolicyRow {
  org_id: string
  agent_id: string
  policy_id: string
  sort_order: number
}

export interface TaskRow {
  org_id: string
  id: string
  agent_id: string
  timestamp: string
  description: string
  business_process: string
  cost_center: string
  outcome: string
  duration_sec: number
  cost_usd: number
  units: number
  tokens: number
}

export interface DeviationRow {
  org_id: string
  id: string
  agent_id: string
  policy_id: string
  timestamp: string
  description: string
  status: string
  resolved_at: string | null
  resolution_note: string | null
}

export interface ApprovalRow {
  org_id: string
  id: string
  agent_id: string
  task_id: string | null
  timestamp: string
  approver: string
  approver_role: string
  description: string
}

export interface DataSetRows {
  agents: AgentRow[]
  agentVersions: AgentVersionRow[]
  policies: PolicyRow[]
  agentPolicies: AgentPolicyRow[]
  tasks: TaskRow[]
  deviations: DeviationRow[]
  approvals: ApprovalRow[]
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Postgres timestamptz round-trips as '2026-08-12T09:31:00+00:00'; the seed
 * emits '2026-08-12T09:31:00.000Z'. Selectors sort these strings
 * lexicographically, so normalize to the seed's exact format.
 */
const isoUtc = (value: string) => new Date(value).toISOString()

/** Date-only columns come back as 'YYYY-MM-DD' — trim any time suffix defensively. */
const isoDateOnly = (value: string) => value.slice(0, 10)

// ---------------------------------------------------------------------------
// Domain → rows (seed loader)
// ---------------------------------------------------------------------------

export function toRows(ds: DataSet, orgId: string = DEMO_ORG_ID): DataSetRows {
  return {
    agents: ds.agents.map((a, i) => ({
      org_id: orgId,
      id: a.id,
      name: a.name,
      purpose: a.purpose,
      owner_name: a.owner.name,
      owner_department: a.owner.department,
      department: a.department,
      status: a.status,
      model: a.model,
      model_provider: a.modelProvider,
      tools: a.tools,
      data_domains: a.dataDomains,
      permissions: a.permissions,
      risk_level: a.riskLevel,
      version: a.version,
      deployed_at: a.deployedAt,
      paused_at: a.pausedAt ?? null,
      retired_at: a.retiredAt ?? null,
      monthly_budget_usd: a.monthlyBudgetUsd,
      unit_label: a.unitLabel,
      human_baseline_usd_per_unit: a.humanBaselineUsdPerUnit,
      sort_order: i,
    })),
    agentVersions: ds.agents.flatMap((a) =>
      a.versionHistory.map((v, i) => ({
        org_id: orgId,
        agent_id: a.id,
        version: v.version,
        date: v.date,
        note: v.note,
        sort_order: i,
      })),
    ),
    policies: ds.policies.map((p, i) => ({
      org_id: orgId,
      id: p.id,
      name: p.name,
      rule: p.rule,
      enforcement: p.enforcement,
      created_at: p.createdAt,
      sort_order: i,
    })),
    agentPolicies: ds.agents.flatMap((a) =>
      a.policyIds.map((policyId, i) => ({
        org_id: orgId,
        agent_id: a.id,
        policy_id: policyId,
        sort_order: i,
      })),
    ),
    tasks: ds.tasks.map((t) => ({
      org_id: orgId,
      id: t.id,
      agent_id: t.agentId,
      timestamp: t.timestamp,
      description: t.description,
      business_process: t.businessProcess,
      cost_center: t.costCenter,
      outcome: t.outcome,
      duration_sec: t.durationSec,
      cost_usd: t.costUsd,
      units: t.units,
      tokens: t.tokens,
    })),
    deviations: ds.deviations.map((d) => ({
      org_id: orgId,
      id: d.id,
      agent_id: d.agentId,
      policy_id: d.policyId,
      timestamp: d.timestamp,
      description: d.description,
      status: d.status,
      resolved_at: d.resolvedAt ?? null,
      resolution_note: d.resolutionNote ?? null,
    })),
    approvals: ds.approvals.map((a) => ({
      org_id: orgId,
      id: a.id,
      agent_id: a.agentId,
      task_id: a.taskId ?? null,
      timestamp: a.timestamp,
      approver: a.approver,
      approver_role: a.approverRole,
      description: a.description,
    })),
  }
}

// ---------------------------------------------------------------------------
// Rows → domain (SupabaseDataSource)
// ---------------------------------------------------------------------------

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order

/** Deterministic order for activity records regardless of DB return order. */
const byTimestampThenId = <T extends { timestamp: string; id: string }>(a: T, b: T) =>
  a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)

export interface FromRowsOptions {
  /**
   * 'seed-fixtures' (default): departments/costCenters come from the demo
   * vocabulary constants — keeps the seed round-trip byte-identical.
   * 'derived': computed from the org's own data — what live workspaces use,
   * since every prospect brings their own org chart and cost centers.
   */
  dimensions?: 'seed-fixtures' | 'derived'
}

export function fromRows(
  rows: DataSetRows,
  generatedAt: string,
  options: FromRowsOptions = {},
): DataSet {
  const versionsByAgent = new Map<string, AgentVersionRow[]>()
  for (const v of rows.agentVersions) {
    const list = versionsByAgent.get(v.agent_id) ?? []
    list.push(v)
    versionsByAgent.set(v.agent_id, list)
  }

  const policiesByAgent = new Map<string, AgentPolicyRow[]>()
  for (const ap of rows.agentPolicies) {
    const list = policiesByAgent.get(ap.agent_id) ?? []
    list.push(ap)
    policiesByAgent.set(ap.agent_id, list)
  }

  const agents: Agent[] = rows.agents
    .slice()
    .sort(bySortOrder)
    .map((r) => ({
      id: r.id,
      name: r.name,
      purpose: r.purpose,
      owner: { name: r.owner_name, department: r.owner_department as Department },
      department: r.department as Department,
      status: r.status as AgentStatus,
      model: r.model,
      modelProvider: r.model_provider as ModelProvider,
      tools: r.tools,
      dataDomains: r.data_domains,
      permissions: r.permissions,
      riskLevel: r.risk_level as RiskLevel,
      version: r.version,
      versionHistory: (versionsByAgent.get(r.id) ?? []).sort(bySortOrder).map(
        (v): AgentVersion => ({
          version: v.version,
          date: isoDateOnly(v.date),
          note: v.note,
        }),
      ),
      deployedAt: isoDateOnly(r.deployed_at),
      ...(r.paused_at ? { pausedAt: isoDateOnly(r.paused_at) } : {}),
      ...(r.retired_at ? { retiredAt: isoDateOnly(r.retired_at) } : {}),
      monthlyBudgetUsd: Number(r.monthly_budget_usd),
      policyIds: (policiesByAgent.get(r.id) ?? []).sort(bySortOrder).map((ap) => ap.policy_id),
      unitLabel: r.unit_label,
      humanBaselineUsdPerUnit: Number(r.human_baseline_usd_per_unit),
    }))

  // Policy.agentIds is derived the same way the seed derives it: agents in
  // registry order that carry the policy.
  const policies: Policy[] = rows.policies
    .slice()
    .sort(bySortOrder)
    .map((r) => ({
      id: r.id,
      name: r.name,
      rule: r.rule,
      enforcement: r.enforcement as EnforcementMode,
      agentIds: agents.filter((a) => a.policyIds.includes(r.id)).map((a) => a.id),
      createdAt: isoDateOnly(r.created_at),
    }))

  const tasks: WorkTask[] = rows.tasks
    .map(
      (r): WorkTask => ({
        id: r.id,
        agentId: r.agent_id,
        timestamp: isoUtc(r.timestamp),
        description: r.description,
        businessProcess: r.business_process,
        costCenter: r.cost_center,
        outcome: r.outcome as TaskOutcome,
        durationSec: Number(r.duration_sec),
        costUsd: Number(r.cost_usd),
        units: Number(r.units),
        tokens: Number(r.tokens),
      }),
    )
    .sort(byTimestampThenId)

  const deviations: Deviation[] = rows.deviations
    .map(
      (r): Deviation => ({
        id: r.id,
        agentId: r.agent_id,
        policyId: r.policy_id,
        timestamp: isoUtc(r.timestamp),
        description: r.description,
        status: r.status as DeviationStatus,
        ...(r.resolved_at ? { resolvedAt: isoUtc(r.resolved_at) } : {}),
        ...(r.resolution_note ? { resolutionNote: r.resolution_note } : {}),
      }),
    )
    .sort(byTimestampThenId)

  const approvals: ApprovalEvent[] = rows.approvals
    .map(
      (r): ApprovalEvent => ({
        id: r.id,
        agentId: r.agent_id,
        ...(r.task_id ? { taskId: r.task_id } : {}),
        timestamp: isoUtc(r.timestamp),
        approver: r.approver,
        approverRole: r.approver_role,
        description: r.description,
      }),
    )
    .sort(byTimestampThenId)

  // The activity window is derived from the data itself (org-time calendar days).
  // A workspace with agents but no activity yet must still yield a valid
  // one-day window: '' here cascades into a RangeError blank screen (org-tz
  // mode) or an infinite dailySeries loop (local mode).
  const taskDays = tasks.map((t) => dayOf(t.timestamp))
  const fallbackDay = dayOf(generatedAt)
  const rangeStart =
    taskDays.length > 0 ? taskDays.reduce((a, b) => (a < b ? a : b)) : fallbackDay
  const rangeEnd = taskDays.length > 0 ? taskDays.reduce((a, b) => (a > b ? a : b)) : fallbackDay

  const derived = options.dimensions === 'derived'
  const departments = derived
    ? [...new Set(agents.map((a) => a.department).filter(Boolean))].sort()
    : DEPARTMENTS
  const costCenters = derived
    ? [...new Set(tasks.map((t) => t.costCenter).filter(Boolean))].sort()
    : [...COST_CENTERS]

  return {
    generatedAt,
    rangeStart,
    rangeEnd,
    agents,
    tasks,
    policies,
    deviations,
    approvals,
    departments,
    costCenters,
  }
}

