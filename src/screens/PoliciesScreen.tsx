import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import FilterSelect from '../components/ui/FilterSelect'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import { TableShell, Td, Th } from '../components/ui/Table'
import { DeviationStatusBadge, EnforcementBadge } from '../components/ui/badges'
import { useData } from '../data/DataContext'
import {
  agentsWithDeviations,
  deviationsByAgentMonth,
  inRange,
  last30Days,
  parseLocalDate,
} from '../data/selectors'
import { fmtDate, fmtDateTime } from '../lib/format'

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
]

/** '2026-06' → 'Jun' (year shown only when the matrix spans two years). */
const monthLabel = (key: string, withYear: boolean) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    ...(withYear ? { year: '2-digit' } : {}),
  }).format(parseLocalDate(`${key}-01`))

export default function PoliciesScreen() {
  const ds = useData()
  const [agentFilter, setAgentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const agentName = useMemo(() => new Map(ds.agents.map((a) => [a.id, a.name])), [ds])
  const policyName = useMemo(() => new Map(ds.policies.map((p) => [p.id, p.name])), [ds])

  const summary = useMemo(() => {
    const open = ds.deviations.filter((d) => d.status === 'open').length
    const range30 = last30Days(ds)
    return {
      policies: ds.policies.length,
      assignedAgents: new Set(ds.policies.flatMap((p) => p.agentIds)).size,
      open,
      last30: ds.deviations.filter((d) => inRange(d.timestamp, range30)).length,
      agentsInViolation: agentsWithDeviations(ds, range30).size,
    }
  }, [ds])

  const deviations = useMemo(
    () =>
      ds.deviations
        .filter((d) => !agentFilter || d.agentId === agentFilter)
        .filter((d) => !statusFilter || d.status === statusFilter)
        .slice()
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [ds, agentFilter, statusFilter],
  )

  const matrix = useMemo(() => deviationsByAgentMonth(ds), [ds])

  const agentOptions = useMemo(
    () =>
      [...new Set(ds.deviations.map((d) => d.agentId))]
        .map((id) => ({ value: id, label: agentName.get(id) ?? id }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [ds, agentName],
  )

  return (
    <div>
      <PageHeader
        title="SOP Policies & Deviations"
        subtitle="The rules agents must follow, and every time one didn't"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Active policies"
          value={String(summary.policies)}
          sub={`Assigned across ${summary.assignedAgents} agents`}
        />
        <StatCard
          label="Open deviations"
          value={String(summary.open)}
          sub="Awaiting resolution"
          tone={summary.open > 0 ? 'alert' : 'default'}
        />
        <StatCard label="Deviations · last 30 days" value={String(summary.last30)} sub="All statuses" />
        <StatCard
          label="Agents in violation"
          value={String(summary.agentsInViolation)}
          sub="Last 30 days"
          tone={summary.agentsInViolation > 0 ? 'alert' : 'default'}
        />
      </div>

      <div className="mb-4">
        <Card title="SOP policies" subtitle="Plain-English rules with enforcement mode" padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>Policy</Th>
                <Th>Rule</Th>
                <Th>Enforcement</Th>
                <Th>Assigned agents</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {ds.policies.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <span className="whitespace-nowrap text-sm font-medium text-slate-900">
                      {p.name}
                    </span>
                  </Td>
                  <Td>
                    <span className="block max-w-[420px] min-w-[240px] text-sm text-slate-700">
                      {p.rule}
                    </span>
                  </Td>
                  <Td>
                    <EnforcementBadge mode={p.enforcement} />
                  </Td>
                  <Td>
                    <div className="flex max-w-[360px] flex-wrap gap-1">
                      {p.agentIds.slice(0, 4).map((id) => (
                        <Link
                          key={id}
                          to={`/agents/${id}`}
                          className="inline-flex whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          {agentName.get(id) ?? id}
                        </Link>
                      ))}
                      {p.agentIds.length > 4 && (
                        <span
                          className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500"
                          title={p.agentIds
                            .slice(4)
                            .map((id) => agentName.get(id) ?? id)
                            .join(', ')}
                        >
                          +{p.agentIds.length - 4} more
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap text-xs text-slate-600">
                      {fmtDate(p.createdAt)}
                    </span>
                  </Td>
                </tr>
              ))}
              {ds.policies.length === 0 && (
                <tr>
                  <Td align="center" className="py-8 text-slate-500" colSpan={5}>
                    No policies defined yet. Your workspace admin can add starter policies
                    during onboarding.
                  </Td>
                </tr>
              )}
            </tbody>
          </TableShell>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Card
            title="Deviations feed"
            subtitle={`${deviations.length} of ${ds.deviations.length} deviations`}
            padded={false}
            actions={
              <div className="flex items-center gap-3">
                <FilterSelect label="Agent" value={agentFilter} options={agentOptions} onChange={setAgentFilter} />
                <FilterSelect label="Status" value={statusFilter} options={STATUS_OPTIONS} onChange={setStatusFilter} />
              </div>
            }
          >
            <ul className="divide-y divide-slate-100">
              {deviations.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div>
                    <div className="text-sm text-slate-800">{d.description}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {fmtDateTime(d.timestamp)} ·{' '}
                      <Link
                        to={`/agents/${d.agentId}`}
                        className="font-medium text-slate-600 hover:text-indigo-700"
                      >
                        {agentName.get(d.agentId)}
                      </Link>{' '}
                      · {policyName.get(d.policyId)}
                    </div>
                    {d.status === 'resolved' && d.resolutionNote && (
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Resolution:</span>{' '}
                        {d.resolutionNote}
                        {d.resolvedAt && ` (${fmtDate(d.resolvedAt)})`}
                      </div>
                    )}
                  </div>
                  <DeviationStatusBadge status={d.status} />
                </li>
              ))}
              {deviations.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-slate-500">
                  No deviations match the current filters.
                </li>
              )}
            </ul>
          </Card>
        </div>

        <Card title="Monthly deviation report" subtitle="Deviations per agent per month" padded={false}>
          <TableShell>
            <thead>
              <tr>
                <Th>Agent</Th>
                {matrix.months.map((m) => (
                  <Th key={m} align="right">
                    {monthLabel(m, matrix.spansYears)}
                  </Th>
                ))}
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.length === 0 && (
                <tr>
                  <Td align="center" className="py-8 text-slate-500" colSpan={2}>
                    No deviations recorded.
                  </Td>
                </tr>
              )}
              {matrix.rows.map((row) => (
                <tr key={row.agentId}>
                  <Td>
                    <Link
                      to={`/agents/${row.agentId}`}
                      title={agentName.get(row.agentId)}
                      className="block max-w-[104px] truncate text-sm font-medium text-slate-800 hover:text-indigo-700 2xl:max-w-none"
                    >
                      {agentName.get(row.agentId)}
                    </Link>
                  </Td>
                  {matrix.months.map((m) => (
                    <Td key={m} align="right">
                      <span className={row.counts[m] ? 'text-slate-800' : 'text-slate-300'}>
                        {row.counts[m] ?? 0}
                      </span>
                    </Td>
                  ))}
                  <Td align="right">
                    <span className="font-semibold text-slate-900">{row.total}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </Card>
      </div>
    </div>
  )
}
