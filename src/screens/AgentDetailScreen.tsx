import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import ActivityBarChart from '../components/charts/ActivityBarChart'
import CostTrendChart from '../components/charts/CostTrendChart'
import Card from '../components/ui/Card'
import StatCard from '../components/ui/StatCard'
import { TableShell, Td, Th } from '../components/ui/Table'
import {
  DeviationStatusBadge,
  EnforcementBadge,
  OutcomeBadge,
  RiskBadge,
  StatusBadge,
} from '../components/ui/badges'
import { useData } from '../data/DataContext'
import {
  agentPerformance,
  dailySeries,
  deviationsForAgent,
  filterTasks,
  last30Days,
  last90Days,
} from '../data/selectors'
import { fmtDate, fmtDateTime, fmtDuration, fmtUsd, fmtUsdCents } from '../lib/format'

function Chip({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
      {children}
    </span>
  )
}

function ProfileRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{children}</span>
    </div>
  )
}

export default function AgentDetailScreen() {
  const { agentId } = useParams()
  const ds = useData()
  const agent = ds.agents.find((a) => a.id === agentId)

  const view = useMemo(() => {
    if (!agent) return null
    const range30 = last30Days(ds)
    const range90 = last90Days(ds)
    return {
      perf: agentPerformance(ds, agent.id, range30),
      activity30: dailySeries(ds, range30, agent.id),
      cost90: dailySeries(ds, range90, agent.id),
      deviations: deviationsForAgent(ds, agent.id)
        .slice()
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      recentTasks: filterTasks(ds, { agentId: agent.id })
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 10),
      policies: ds.policies.filter((p) => agent.policyIds.includes(p.id)),
    }
  }, [ds, agent])

  if (!agent || !view) {
    return (
      <div className="text-sm text-slate-600">
        Agent not found.{' '}
        <Link to="/" className="font-medium text-indigo-600 hover:text-indigo-800">
          Back to registry
        </Link>
      </div>
    )
  }

  const { perf, activity30, cost90, deviations, recentTasks, policies } = view
  const overBudget = perf.costUsd > agent.monthlyBudgetUsd
  const budgetPct = Math.round((perf.costUsd / agent.monthlyBudgetUsd) * 100)

  return (
    <div>
      <div className="text-xs text-slate-500">
        <Link to="/" className="hover:text-indigo-600">
          Agent Registry
        </Link>{' '}
        / {agent.name}
      </div>

      <div className="mt-1 mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{agent.name}</h1>
            <StatusBadge status={agent.status} />
            <RiskBadge level={agent.riskLevel} />
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{agent.purpose}</p>
        </div>
        <Link
          to={`/work-log?agent=${agent.id}&days=90`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
        >
          Full work log
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Spend · last 30 days"
          value={fmtUsd(perf.costUsd)}
          sub={`${budgetPct}% of ${fmtUsd(agent.monthlyBudgetUsd)} monthly budget`}
          tone={overBudget ? 'alert' : 'default'}
        />
        <StatCard
          label="Tasks · last 30 days"
          value={perf.tasks.toLocaleString('en-US')}
          sub={`${perf.units.toLocaleString('en-US')} ${agent.unitLabel}s processed`}
        />
        <StatCard
          label="Escalation rate"
          value={`${Math.round(perf.escalationRate * 100)}%`}
          sub={`${perf.escalated} escalated to human · ${perf.failed} failed`}
        />
        <StatCard
          label={`Cost per ${agent.unitLabel}`}
          value={perf.units > 0 ? fmtUsdCents(perf.costPerUnit) : '—'}
          sub={`vs ${fmtUsdCents(agent.humanBaselineUsdPerUnit)} human baseline`}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card title="Activity" subtitle="Tasks per day · last 30 days">
            <ActivityBarChart data={activity30} />
          </Card>

          <Card title="Cost trend" subtitle="Daily spend · last 90 days">
            <CostTrendChart data={cost90} budgetPerDay={agent.monthlyBudgetUsd / 30} />
          </Card>

          <Card
            title="Recent deviations"
            subtitle={
              deviations.length > 0
                ? `${deviations.filter((d) => d.status === 'open').length} open of ${deviations.length} total`
                : undefined
            }
            padded={deviations.length === 0}
          >
            {deviations.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">
                No policy deviations recorded for this agent.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {deviations.slice(0, 6).map((d) => {
                  const policy = ds.policies.find((p) => p.id === d.policyId)
                  return (
                    <li key={d.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                      <div>
                        <div className="text-sm text-slate-800">{d.description}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {fmtDateTime(d.timestamp)} · {policy?.name}
                        </div>
                      </div>
                      <DeviationStatusBadge status={d.status} />
                    </li>
                  )
                })}
                {deviations.length > 6 && (
                  <li className="px-4 py-2 text-xs text-slate-500">
                    Showing the 6 most recent · {deviations.length - 6} earlier deviation
                    {deviations.length - 6 === 1 ? '' : 's'} in the full record
                  </li>
                )}
              </ul>
            )}
          </Card>

          <Card title="Recent activity" subtitle="10 most recent tasks" padded={false}>
            <TableShell>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Task</Th>
                  <Th>Outcome</Th>
                  <Th align="right">Duration</Th>
                  <Th align="right">Cost</Th>
                </tr>
              </thead>
              <tbody>
                {recentTasks.map((t) => (
                  <tr key={t.id}>
                    <Td>
                      <span className="whitespace-nowrap text-xs text-slate-600">
                        {fmtDateTime(t.timestamp)}
                      </span>
                    </Td>
                    <Td>
                      <div className="text-sm text-slate-800">{t.description}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {t.businessProcess} · {t.costCenter}
                      </div>
                    </Td>
                    <Td>
                      <OutcomeBadge outcome={t.outcome} />
                    </Td>
                    <Td align="right">
                      <span className="text-xs text-slate-600">{fmtDuration(t.durationSec)}</span>
                    </Td>
                    <Td align="right">
                      <span className="text-sm text-slate-800">{fmtUsdCents(t.costUsd)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Profile">
            <ProfileRow label="Owner">
              {agent.owner.name}
              <span className="block text-xs text-slate-500">{agent.department}</span>
            </ProfileRow>
            <ProfileRow label="Model">
              {agent.model}
              <span className="block text-xs text-slate-500">{agent.modelProvider}</span>
            </ProfileRow>
            <ProfileRow label="Version">{agent.version}</ProfileRow>
            <ProfileRow label="Deployed">{fmtDate(agent.deployedAt)}</ProfileRow>
            {agent.pausedAt && <ProfileRow label="Paused">{fmtDate(agent.pausedAt)}</ProfileRow>}
            {agent.retiredAt && <ProfileRow label="Retired">{fmtDate(agent.retiredAt)}</ProfileRow>}
            <div className="mt-2 border-t border-slate-100 pt-2.5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Connected tools
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {agent.tools.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
            </div>
            <div className="mt-2.5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Data domains
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {agent.dataDomains.map((d) => (
                  <Chip key={d}>{d}</Chip>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Permissions" subtitle="What this agent is allowed to do">
            <ul className="space-y-1.5 text-sm text-slate-700">
              {agent.permissions.map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                  {p}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Assigned policies" subtitle={`${policies.length} SOP policies`}>
            <ul className="space-y-2.5">
              {policies.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-800">{p.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{p.rule}</div>
                  </div>
                  <EnforcementBadge mode={p.enforcement} />
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Version history">
            <ol className="space-y-2.5">
              {agent.versionHistory
                .slice()
                .reverse()
                .map((v) => (
                  <li key={`${v.version}-${v.date}`} className="flex gap-3">
                    <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
                      {fmtDate(v.date)}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{v.version}</div>
                      <div className="text-xs text-slate-500">{v.note}</div>
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  )
}
