import { useMemo, useState } from 'react'
import { useData } from '../data/DataContext'
import { openDeviationCount, registrySummary } from '../data/selectors'
import { fmtDate, fmtUsd } from '../lib/format'
import FilterSelect from '../components/ui/FilterSelect'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import { OpenDeviationPill, RiskBadge, StatusBadge } from '../components/ui/badges'
import { ClickableRow, TableShell, Td, Th } from '../components/ui/Table'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'retired', label: 'Retired' },
]
const RISK_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

/** Active agents first, then paused, then retired — keeps screenshots clean. */
const STATUS_ORDER: Record<string, number> = { active: 0, paused: 1, retired: 2 }

/** "SAP S/4HANA, Coupa +2" — compact list for dense table cells. */
function compactList(items: string[], max = 2): string {
  if (items.length <= max) return items.join(', ')
  return `${items.slice(0, max).join(', ')} +${items.length - max}`
}

export default function RegistryScreen() {
  const ds = useData()
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('')
  const [risk, setRisk] = useState('')

  const summary = useMemo(() => registrySummary(ds), [ds])

  const agents = useMemo(() => {
    return ds.agents
      .filter((a) => !department || a.department === department)
      .filter((a) => !status || a.status === status)
      .filter((a) => !risk || a.riskLevel === risk)
      .slice()
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          a.department.localeCompare(b.department) ||
          a.name.localeCompare(b.name),
      )
  }, [ds, department, status, risk])

  return (
    <div>
      <PageHeader
        title="Agent Registry"
        subtitle="Every AI agent deployed at Northbridge Mutual — ownership, access, and standing"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Total agents" value={String(summary.totalAgents)} sub="Across 5 departments" />
        <StatCard
          label="Active agents"
          value={String(summary.activeAgents)}
          sub={`${summary.totalAgents - summary.activeAgents} paused or retired`}
        />
        <StatCard
          label="Agents with deviations"
          value={String(summary.agentsWithDeviations30d)}
          sub="Last 30 days"
          tone={summary.agentsWithDeviations30d > 0 ? 'alert' : 'default'}
        />
        <StatCard label="Spend" value={fmtUsd(summary.spend30dUsd)} sub="Last 30 days, all agents" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <FilterSelect
          label="Department"
          value={department}
          options={ds.departments}
          onChange={setDepartment}
        />
        <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        <FilterSelect label="Risk" value={risk} options={RISK_OPTIONS} onChange={setRisk} />
        {(department || status || risk) && (
          <button
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            onClick={() => {
              setDepartment('')
              setStatus('')
              setRisk('')
            }}
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500">
          {agents.length} of {ds.agents.length} agents
        </span>
      </div>

      <TableShell>
        <thead>
          <tr>
            <Th>Agent</Th>
            <Th>Owner</Th>
            <Th>Status</Th>
            <Th>Risk</Th>
            <Th>Model</Th>
            <Th>Connected tools</Th>
            <Th>Data domains</Th>
            <Th>Version</Th>
            <Th>Deployed</Th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => (
            <ClickableRow key={agent.id} to={`/agents/${agent.id}`}>
              <Td>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap font-medium text-slate-900">{agent.name}</span>
                  <OpenDeviationPill count={openDeviationCount(ds, agent.id)} />
                </div>
                <div className="mt-0.5 min-w-[220px] max-w-[340px] text-xs text-slate-500">
                  {agent.purpose}
                </div>
              </Td>
              <Td>
                <div className="text-slate-800">{agent.owner.name}</div>
                <div className="text-xs text-slate-500">{agent.department}</div>
              </Td>
              <Td>
                <StatusBadge status={agent.status} />
              </Td>
              <Td>
                <RiskBadge level={agent.riskLevel} />
              </Td>
              <Td>
                <div className="text-slate-800">{agent.model}</div>
                <div className="text-xs text-slate-500">{agent.modelProvider}</div>
              </Td>
              <Td>
                <div className="max-w-[150px] text-xs text-slate-600">{compactList(agent.tools)}</div>
              </Td>
              <Td>
                <div className="max-w-[170px] text-xs text-slate-600">
                  {compactList(agent.dataDomains)}
                </div>
              </Td>
              <Td>
                {/* Status column already communicates paused/retired. */}
                <span className="text-xs text-slate-600">{agent.version.split(' ')[0]}</span>
              </Td>
              <Td>
                <span className="whitespace-nowrap text-xs text-slate-600">
                  {fmtDate(agent.deployedAt)}
                </span>
              </Td>
            </ClickableRow>
          ))}
          {agents.length === 0 && (
            <tr>
              <Td align="center" className="py-8 text-slate-500" colSpan={9}>
                No agents match the current filters.
              </Td>
            </tr>
          )}
        </tbody>
      </TableShell>
    </div>
  )
}
