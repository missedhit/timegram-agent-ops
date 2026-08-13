/**
 * Core domain model for Timegram Agent Ops.
 *
 * Everything the UI renders is expressed in these types. Dates are ISO 8601
 * strings so the whole dataset is JSON-serializable — the same shape a future
 * backend API would return.
 *
 * Deliberately metadata-only: there is no field anywhere for prompt or output
 * content. Tasks carry descriptions of business activity, never model I/O.
 */

export type Department = 'Finance' | 'Support' | 'Sales Ops' | 'Claims' | 'IT'

export type AgentStatus = 'active' | 'paused' | 'retired'

export type RiskLevel = 'low' | 'medium' | 'high'

export type TaskOutcome = 'completed' | 'escalated' | 'failed'

export type EnforcementMode = 'block' | 'log-only'

export type DeviationStatus = 'open' | 'acknowledged' | 'resolved'

export type ModelProvider = 'Anthropic' | 'OpenAI' | 'Google' | 'On-prem'

export interface AgentOwner {
  name: string
  department: Department
}

export interface AgentVersion {
  version: string
  date: string // ISO date
  note: string
}

export interface Agent {
  id: string
  name: string
  purpose: string
  owner: AgentOwner
  department: Department
  status: AgentStatus
  model: string
  modelProvider: ModelProvider
  tools: string[]
  dataDomains: string[]
  permissions: string[]
  riskLevel: RiskLevel
  version: string
  versionHistory: AgentVersion[]
  deployedAt: string // ISO date
  pausedAt?: string // ISO date, only when status === 'paused'
  retiredAt?: string // ISO date, only when status === 'retired'
  monthlyBudgetUsd: number
  policyIds: string[]
  /** Business unit of work this agent produces, e.g. "invoice", "claim". */
  unitLabel: string
  /** What the same unit of work costs when a human does it, for ROI cards. */
  humanBaselineUsdPerUnit: number
}

export interface WorkTask {
  id: string
  agentId: string
  timestamp: string // ISO datetime
  description: string
  businessProcess: string
  costCenter: string
  outcome: TaskOutcome
  durationSec: number
  costUsd: number
  /** Business units completed in this task (invoices, claims, tickets…). */
  units: number
  /** Secondary detail only — never a primary label in the UI. */
  tokens: number
}

export interface Policy {
  id: string
  name: string
  /** Plain-English rule as a business user would state it. */
  rule: string
  enforcement: EnforcementMode
  agentIds: string[]
  createdAt: string // ISO date
}

export interface Deviation {
  id: string
  timestamp: string // ISO datetime
  agentId: string
  policyId: string
  description: string
  status: DeviationStatus
  resolvedAt?: string // ISO datetime
  resolutionNote?: string
}

/** A human sign-off on escalated agent work. Feeds the audit evidence pack. */
export interface ApprovalEvent {
  id: string
  agentId: string
  /** Task that triggered the approval, when one exists. */
  taskId?: string
  timestamp: string // ISO datetime
  approver: string
  approverRole: string
  description: string
}

export interface DataSet {
  generatedAt: string
  /** Inclusive start of the seeded activity window (ISO date). */
  rangeStart: string
  /** Inclusive end of the seeded activity window (ISO date). */
  rangeEnd: string
  agents: Agent[]
  tasks: WorkTask[]
  policies: Policy[]
  deviations: Deviation[]
  approvals: ApprovalEvent[]
  departments: Department[]
  costCenters: string[]
}
