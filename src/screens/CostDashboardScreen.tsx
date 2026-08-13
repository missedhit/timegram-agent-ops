import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import CostTrendChart from '../components/charts/CostTrendChart'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import RankedBars from '../components/ui/RankedBars'
import StatCard from '../components/ui/StatCard'
import { useData } from '../data/DataContext'
import {
  budgetStatuses,
  dailySeries,
  filterTasks,
  last30Days,
  last90Days,
  spendByAgent,
  spendByCostCenter,
  spendByDepartment,
  sumCost,
  unitEconomics,
} from '../data/selectors'
import { fmtUsd, fmtUsdCents } from '../lib/format'

function BudgetBar({ ratio }: { ratio: number }) {
  const pct = Math.min(ratio * 100, 100)
  const color = ratio > 1 ? 'bg-red-500' : ratio >= 0.9 ? 'bg-amber-400' : 'bg-indigo-600'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function OverBudgetPill({ flag }: { flag: 'over' | 'approaching' }) {
  return flag === 'over' ? (
    <span className="inline-flex shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
      Over budget
    </span>
  ) : (
    <span className="inline-flex shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
      Approaching limit
    </span>
  )
}

export default function CostDashboardScreen() {
  const ds = useData()

  const view = useMemo(() => {
    const range30 = last30Days(ds)
    const range90 = last90Days(ds)
    const tasks30 = filterTasks(ds, { range: range30 })
    const budgets = budgetStatuses(ds)
    const agentName = new Map(ds.agents.map((a) => [a.id, a.name]))
    const flagById = new Map(budgets.map((b) => [b.agent.id, b.flag]))

    return {
      spend30: sumCost(tasks30),
      spend90: sumCost(filterTasks(ds, { range: range90 })),
      avgTaskCost: tasks30.length > 0 ? sumCost(tasks30) / tasks30.length : 0,
      taskCount30: tasks30.length,
      alerts: budgets.filter((b) => b.flag !== 'ok'),
      // Match the population the spend numerator covers: paused agents still
      // booked spend inside the window, so their budget belongs here too.
      totalBudget: ds.agents
        .filter((a) => a.status !== 'retired')
        .reduce((acc, a) => acc + a.monthlyBudgetUsd, 0),
      trend90: dailySeries(ds, range90),
      byAgent: [...spendByAgent(ds, range30).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, value]) => ({
          key: id,
          label: agentName.get(id) ?? id,
          value,
          to: `/agents/${id}`,
          tag:
            flagById.get(id) && flagById.get(id) !== 'ok' ? (
              <OverBudgetPill flag={flagById.get(id) as 'over' | 'approaching'} />
            ) : undefined,
        })),
      byDepartment: [...spendByDepartment(ds, range30).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([dept, value]) => ({ key: dept, label: dept, value })),
      byCostCenter: [...spendByCostCenter(ds, range30).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cc, value]) => ({ key: cc, label: cc, value })),
      economics: unitEconomics(ds, range30).slice(0, 6),
    }
  }, [ds])

  return (
    <div>
      <PageHeader
        title="Cost Dashboard"
        subtitle="What the agent workforce costs, where it goes, and what it replaces"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Spend · last 30 days" value={fmtUsd(view.spend30)} sub="All agents, all departments" />
        <StatCard label="Spend · last 90 days" value={fmtUsd(view.spend90)} sub="Full activity window" />
        <StatCard
          label="Avg cost per task"
          value={fmtUsdCents(view.avgTaskCost)}
          sub={`${view.taskCount30.toLocaleString('en-US')} tasks · last 30 days`}
        />
        <StatCard
          label="Budget alerts"
          value={String(view.alerts.length)}
          sub={`Of ${fmtUsd(view.totalBudget)} combined monthly budget`}
          tone={view.alerts.length > 0 ? 'alert' : 'default'}
        />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Card title="Spend trend" subtitle="Daily spend, all agents · last 90 days">
            <CostTrendChart data={view.trend90} budgetPerDay={view.totalBudget / 30} height={220} />
          </Card>
        </div>
        <Card title="Budget alerts" subtitle="Spend vs monthly budget · last 30 days">
          <ul className="space-y-3.5">
            {view.alerts.map((b) => (
              <li key={b.agent.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <Link
                    to={`/agents/${b.agent.id}`}
                    className="truncate font-medium text-slate-800 hover:text-indigo-700"
                  >
                    {b.agent.name}
                  </Link>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${
                      b.flag === 'over' ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    {Math.round(b.ratio * 100)}%
                  </span>
                </div>
                <BudgetBar ratio={b.ratio} />
                <div className="mt-1 text-xs text-slate-500">
                  {fmtUsd(b.spend30dUsd)} of {fmtUsd(b.monthlyBudgetUsd)} budget
                </div>
              </li>
            ))}
            {view.alerts.length === 0 && (
              <li className="py-4 text-center text-sm text-slate-500">
                All agents are within budget.
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <Card title="Spend by agent" subtitle="Last 30 days">
          <RankedBars rows={view.byAgent} />
        </Card>
        <Card title="Spend by department" subtitle="Last 30 days">
          <RankedBars rows={view.byDepartment} />
        </Card>
        <Card title="Spend by cost center" subtitle="Last 30 days">
          <RankedBars rows={view.byCostCenter} />
        </Card>
      </div>

      <Card
        title="Cost per outcome"
        subtitle="AI cost per unit of work vs human baseline · last 30 days"
      >
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {view.economics.map((row) => (
            <div
              key={`${row.agent.id}-${row.processLabel}`}
              className="rounded-lg border border-slate-200 px-3.5 py-3"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {row.processLabel}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">
                  {fmtUsdCents(row.costPerUnit)}
                </span>
                <span className="text-xs text-slate-500">per {row.agent.unitLabel}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                vs {fmtUsdCents(row.humanBaselineUsdPerUnit)} human baseline
              </div>
              <div className="mt-1.5 text-xs font-medium text-indigo-700">
                ≈ {fmtUsd(row.savedUsd)} saved · {row.units.toLocaleString('en-US')}{' '}
                {row.agent.unitLabel}s ·{' '}
                <Link to={`/agents/${row.agent.id}`} className="hover:underline">
                  {row.agent.name}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
