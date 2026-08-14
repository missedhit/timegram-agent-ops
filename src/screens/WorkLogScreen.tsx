import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import FilterSelect from '../components/ui/FilterSelect'
import PageHeader from '../components/ui/PageHeader'
import { TableShell, Td, Th } from '../components/ui/Table'
import { OutcomeBadge } from '../components/ui/badges'
import { useData } from '../data/DataContext'
import { filterTasks, lastNDays, sumCost } from '../data/selectors'
import { fmtCompact, fmtDateTime, fmtDuration, fmtUsd, fmtUsdCents } from '../lib/format'
import type { TaskOutcome } from '../domain/types'

const PAGE_SIZE = 50

const OUTCOME_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'escalated', label: 'Escalated to human' },
  { value: 'failed', label: 'Failed' },
]

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const OUTCOME_VALUES = new Set(['completed', 'escalated', 'failed'])

export default function WorkLogScreen() {
  const ds = useData()
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(0)

  const agentId = params.get('agent') ?? ''
  const department = params.get('department') ?? ''
  const outcomeParam = params.get('outcome') ?? ''
  const outcome = OUTCOME_VALUES.has(outcomeParam) ? (outcomeParam as TaskOutcome) : undefined
  const daysParam = params.get('days') ?? '30'
  const days = ['7', '30', '90'].includes(daysParam) ? Number(daysParam) : 30

  // Reset pagination whenever the effective filters change, no matter where
  // the change came from (our own selects, a sidebar click that clears the
  // query string, or browser back/forward). Render-time state adjustment per
  // React's "adjust state when props change" pattern — no stale frame.
  const filterKey = `${agentId}|${department}|${outcomeParam}|${daysParam}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setPage(0)
  }

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const goToPage = (p: number) => {
    setPage(p)
    window.scrollTo({ top: 0 })
  }

  const agentById = useMemo(() => new Map(ds.agents.map((a) => [a.id, a])), [ds])

  const tasks = useMemo(() => {
    return filterTasks(ds, {
      agentId: agentId || undefined,
      department: department || undefined,
      outcome,
      range: lastNDays(ds, days),
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [ds, agentId, department, outcome, days])

  const summary = useMemo(() => {
    const completed = tasks.filter((t) => t.outcome === 'completed').length
    return {
      count: tasks.length,
      costUsd: sumCost(tasks),
      completionPct: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0,
    }
  }, [tasks])

  const pageCount = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageTasks = tasks.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const agentOptions = ds.agents
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ value: a.id, label: a.name }))

  const anyFilter = agentId || department || outcomeParam

  return (
    <div>
      <PageHeader
        title="Work Log"
        subtitle={`${summary.count.toLocaleString('en-US')} tasks · ${fmtUsd(summary.costUsd)} total cost · ${summary.completionPct}% completed`}
      />

      <div className="mb-3 flex flex-wrap items-center gap-4">
        <FilterSelect label="Agent" value={agentId} options={agentOptions} onChange={(v) => setFilter('agent', v)} />
        <FilterSelect
          label="Department"
          value={department}
          options={ds.departments}
          onChange={(v) => setFilter('department', v)}
        />
        <FilterSelect
          label="Outcome"
          value={outcomeParam}
          options={OUTCOME_OPTIONS}
          onChange={(v) => setFilter('outcome', v)}
        />
        <FilterSelect
          label="Period"
          value={['7', '30', '90'].includes(daysParam) ? daysParam : '30'}
          options={RANGE_OPTIONS}
          onChange={(v) => setFilter('days', v)}
          includeAll={false}
        />
        {anyFilter && (
          <button
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            onClick={() =>
              setParams(new URLSearchParams(daysParam !== '30' ? { days: daysParam } : {}), {
                replace: true,
              })
            }
          >
            Clear filters
          </button>
        )}
      </div>

      <TableShell>
        <thead>
          <tr>
            <Th>Time</Th>
            <Th>Agent</Th>
            <Th>Task</Th>
            <Th>Cost center</Th>
            <Th>Outcome</Th>
            <Th align="right">Duration</Th>
            <Th align="right">Cost</Th>
          </tr>
        </thead>
        <tbody>
          {pageTasks.map((t) => {
            const agent = agentById.get(t.agentId)
            return (
              <tr key={t.id}>
                <Td>
                  <span className="whitespace-nowrap text-xs text-slate-600">
                    {fmtDateTime(t.timestamp)}
                  </span>
                </Td>
                <Td>
                  <Link
                    to={`/agents/${t.agentId}`}
                    className="whitespace-nowrap text-sm font-medium text-slate-800 hover:text-indigo-700"
                  >
                    {agent?.name ?? t.agentId}
                  </Link>
                  <div className="text-xs text-slate-500">{agent?.department}</div>
                </Td>
                <Td>
                  <div className="min-w-[260px] max-w-[420px] text-sm text-slate-800">
                    {t.description}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{t.businessProcess}</div>
                </Td>
                <Td>
                  <span className="whitespace-nowrap text-xs text-slate-600">{t.costCenter}</span>
                </Td>
                <Td>
                  <OutcomeBadge outcome={t.outcome} />
                </Td>
                <Td align="right">
                  <span className="text-xs text-slate-600">{fmtDuration(t.durationSec)}</span>
                </Td>
                <Td align="right">
                  <div className="text-sm text-slate-800">{fmtUsdCents(t.costUsd)}</div>
                  <div className="text-[11px] text-slate-400">{fmtCompact(t.tokens)} tokens</div>
                </Td>
              </tr>
            )
          })}
          {pageTasks.length === 0 && (
            <tr>
              <Td align="center" className="py-8 text-slate-500" colSpan={7}>
                No tasks match the current filters.
              </Td>
            </tr>
          )}
        </tbody>
      </TableShell>

      {tasks.length > PAGE_SIZE && (
        <div className="mt-3 flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, tasks.length)} of{' '}
            {tasks.length.toLocaleString('en-US')} tasks
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage === 0}
              onClick={() => goToPage(currentPage - 1)}
            >
              Previous
            </button>
            <button
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={currentPage >= pageCount - 1}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
