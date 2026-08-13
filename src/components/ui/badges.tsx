/**
 * Status and category badges. Color discipline: neutral base, indigo accent,
 * red strictly reserved for deviations and budget alerts. Status dots use
 * muted green/amber because they are conventional for run-state, but red
 * never appears here for anything except alert semantics.
 */

import type { AgentStatus, DeviationStatus, EnforcementMode, RiskLevel, TaskOutcome } from '../../domain/types'

export function StatusBadge({ status }: { status: AgentStatus }) {
  const dot: Record<AgentStatus, string> = {
    active: 'bg-emerald-500',
    paused: 'bg-amber-400',
    retired: 'bg-slate-300',
  }
  const label: Record<AgentStatus, string> = {
    active: 'Active',
    paused: 'Paused',
    retired: 'Retired',
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <span className={`h-1.5 w-1.5 rounded-full ${dot[status]}`} />
      {label[status]}
    </span>
  )
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, string> = {
    low: 'bg-slate-100 text-slate-600',
    medium: 'bg-slate-100 text-slate-700',
    high: 'bg-amber-50 text-amber-700 border border-amber-200',
  }
  const label: Record<RiskLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' }
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${styles[level]}`}>
      {label[level]}
    </span>
  )
}

export function OutcomeBadge({ outcome }: { outcome: TaskOutcome }) {
  const styles: Record<TaskOutcome, string> = {
    completed: 'bg-slate-100 text-slate-600',
    escalated: 'bg-indigo-50 text-indigo-700',
    failed: 'bg-red-50 text-red-700',
  }
  const label: Record<TaskOutcome, string> = {
    completed: 'Completed',
    escalated: 'Escalated to human',
    failed: 'Failed',
  }
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${styles[outcome]}`}>
      {label[outcome]}
    </span>
  )
}

export function DeviationStatusBadge({ status }: { status: DeviationStatus }) {
  const styles: Record<DeviationStatus, string> = {
    open: 'bg-red-50 text-red-700 border border-red-200',
    acknowledged: 'bg-amber-50 text-amber-700 border border-amber-200',
    resolved: 'bg-slate-100 text-slate-600',
  }
  const label: Record<DeviationStatus, string> = {
    open: 'Open',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
  }
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {label[status]}
    </span>
  )
}

export function EnforcementBadge({ mode }: { mode: EnforcementMode }) {
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${
        mode === 'block' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {mode === 'block' ? 'Block' : 'Log only'}
    </span>
  )
}

/** Small red count pill — deviations only. */
export function OpenDeviationPill({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700"
      title={`${count} open deviation${count === 1 ? '' : 's'}`}
    >
      {count}
    </span>
  )
}
