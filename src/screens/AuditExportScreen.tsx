import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import FilterSelect from '../components/ui/FilterSelect'
import PageHeader from '../components/ui/PageHeader'
import { DeviationStatusBadge, EnforcementBadge } from '../components/ui/badges'
import { useData } from '../data/DataContext'
import { useOrgName } from '../data/OrgContext'
import { evidencePack, lastNDays, rangeFromDates } from '../data/selectors'
import { dayOf } from '../lib/orgTime'
import { fmtDate, fmtDateTime, fmtDateTimeFull, fmtUsd, fmtUsdCents } from '../lib/format'

const PRESETS = [
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
]

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="evidence-section border-t border-slate-200 px-8 py-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">
          {step}. {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function DocTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {head.map((h) => (
            <th
              key={h}
              className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold uppercase tracking-wide text-slate-500"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

const cell = 'border-b border-slate-100 px-2 py-1.5 align-top text-slate-700'

function EmptyNote({ children }: { children: string }) {
  return (
    <p className="rounded-md bg-slate-50 px-3 py-2.5 text-xs text-slate-500">{children}</p>
  )
}

export default function AuditExportScreen() {
  const ds = useData()
  const orgName = useOrgName()
  const [agentId, setAgentId] = useState(ds.agents[0]?.id ?? '')
  const [preset, setPreset] = useState('30')
  const [customStart, setCustomStart] = useState(dayOf(lastNDays(ds, 30).from))
  const [customEnd, setCustomEnd] = useState(ds.rangeEnd)

  const range = useMemo(() => {
    if (preset !== 'custom') return lastNDays(ds, Number(preset))
    // Guard against an inverted custom range while the user is mid-edit.
    const [start, end] =
      customStart <= customEnd ? [customStart, customEnd] : [customEnd, customStart]
    return rangeFromDates(start, end)
  }, [ds, preset, customStart, customEnd])

  const pack = useMemo(() => evidencePack(ds, agentId, range), [ds, agentId, range])

  const agentOptions = useMemo(
    () =>
      ds.agents
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ({ value: a.id, label: a.name })),
    [ds],
  )

  if (!pack) {
    // A fresh workspace has no agents to export yet.
    return (
      <div>
        <PageHeader
          title="Audit Export"
          subtitle="Assemble a defensible evidence pack for one agent over one period"
        />
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-8 text-center">
          <div className="text-base font-semibold text-slate-900">No agents to export yet</div>
          <p className="mt-2 text-sm text-slate-600">
            Evidence packs are built from agent activity. Connect an agent from the Agent
            Registry and this screen will populate.
          </p>
        </div>
      </div>
    )
  }

  const { agent, performance: perf } = pack
  const versions = pack.versionsInEffect
  const versionLabel =
    versions.length === 0
      ? agent.version
      : versions.length === 1
        ? versions[0].version
        : `${versions[0].version} → ${versions[versions.length - 1].version}`

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Audit Export"
          subtitle="Assemble a defensible evidence pack for one agent over one period"
          actions={
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Export PDF
            </button>
          }
        />

        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <FilterSelect
            label="Agent"
            value={agentId}
            options={agentOptions}
            onChange={setAgentId}
            includeAll={false}
          />
          <FilterSelect
            label="Period"
            value={preset}
            options={PRESETS}
            onChange={setPreset}
            includeAll={false}
          />
          {preset === 'custom' && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="date"
                value={customStart}
                min={ds.rangeStart}
                max={ds.rangeEnd}
                onChange={(e) => e.target.value && setCustomStart(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="date"
                value={customEnd}
                min={ds.rangeStart}
                max={ds.rangeEnd}
                onChange={(e) => e.target.value && setCustomEnd(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
              />
            </div>
          )}
          <span className="ml-auto text-xs text-slate-500">
            Records available {fmtDate(ds.rangeStart)} – {fmtDate(ds.rangeEnd)}
          </span>
        </div>
      </div>

      {/* The evidence pack document — this is what prints. */}
      <article className="evidence-pack mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white print:max-w-none print:rounded-none print:border-0">
        <header className="evidence-section px-8 pb-5 pt-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Agent evidence pack
              </div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {agent.name}
              </h2>
              <p className="mt-0.5 text-sm text-slate-600">{agent.purpose}</p>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              <div className="text-sm font-semibold text-slate-900">{orgName}</div>
              <div className="mt-0.5">Timegram Agent Ops</div>
              <div className="mt-1.5">Generated {fmtDateTimeFull(ds.generatedAt)}</div>
              <div>
                Ref: TAO-{agent.id.toUpperCase().replace('AG-', '')}-
                {pack.periodStart.replace(/-/g, '')}-{pack.periodEnd.replace(/-/g, '')}
              </div>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-4 gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-xs">
            <div>
              <dt className="text-slate-500">Period covered</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {fmtDate(pack.periodStart)} – {fmtDate(pack.periodEnd)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Accountable owner</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {agent.owner.name}, {agent.department}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Version in force</dt>
              <dd className="mt-0.5 font-medium text-slate-900">
                {versionLabel}
                <span className="ml-1 font-normal text-slate-500">
                  ({agent.model} at export)
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status at export</dt>
              <dd className="mt-0.5 font-medium capitalize text-slate-900">{agent.status}</dd>
            </div>
          </dl>

          <p className="mt-4 rounded-md border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-xs leading-relaxed text-slate-700">
            <span className="font-semibold text-slate-900">Scope of this record.</span> Timegram
            Agent Ops operates in metadata-only mode. This pack evidences what the agent did, when,
            at what cost, under which policies, and with what human oversight. It contains no
            prompt text, model output, or customer content — those are never captured or stored by
            the platform, and cannot be reproduced here.
          </p>
        </header>

        <Section
          step={1}
          title="Activity summary"
          subtitle="Volume, outcomes, and cost of work performed in the period"
        >
          {perf.tasks === 0 ? (
            <EmptyNote>
              No agent activity was recorded in this period. The agent was paused, retired, or not
              yet deployed for the whole range.
            </EmptyNote>
          ) : (
            <>
              <dl className="mb-4 grid grid-cols-5 gap-3">
                {[
                  { label: 'Tasks performed', value: perf.tasks.toLocaleString('en-US') },
                  {
                    label: 'Completed without escalation',
                    value: `${perf.completed.toLocaleString('en-US')} (${Math.round((perf.completed / perf.tasks) * 100)}%)`,
                  },
                  { label: 'Escalated to a human', value: perf.escalated.toLocaleString('en-US') },
                  { label: 'Failed / incomplete', value: perf.failed.toLocaleString('en-US') },
                  { label: 'Total cost', value: fmtUsd(perf.costUsd) },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="flex flex-col justify-between rounded-md border border-slate-200 px-3 py-2"
                  >
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                      {s.label}
                    </dt>
                    <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
                      {s.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <DocTable head={['Business process', 'Tasks', `${agent.unitLabel}s processed`, 'Cost']}>
                {pack.processBreakdown.map((r) => (
                  <tr key={r.process}>
                    <td className={cell}>{r.process}</td>
                    <td className={`${cell} tabular-nums`}>{r.tasks.toLocaleString('en-US')}</td>
                    <td className={`${cell} tabular-nums`}>{r.units.toLocaleString('en-US')}</td>
                    <td className={`${cell} tabular-nums`}>{fmtUsdCents(r.costUsd)}</td>
                  </tr>
                ))}
              </DocTable>
            </>
          )}
        </Section>

        <Section
          step={2}
          title="Human approval events"
          subtitle="Escalations reviewed and signed off by a named person"
        >
          {pack.approvals.length === 0 ? (
            <EmptyNote>No human approval events were recorded in this period.</EmptyNote>
          ) : (
            <DocTable head={['Timestamp', 'Approver', 'Role', 'Decision recorded']}>
              {pack.approvals.map((a) => (
                <tr key={a.id}>
                  <td className={`${cell} whitespace-nowrap`}>{fmtDateTime(a.timestamp)}</td>
                  <td className={`${cell} whitespace-nowrap font-medium text-slate-800`}>
                    {a.approver}
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{a.approverRole}</td>
                  <td className={cell}>{a.description}</td>
                </tr>
              ))}
            </DocTable>
          )}
        </Section>

        <Section
          step={3}
          title="Policy deviations and resolutions"
          subtitle="Every recorded departure from an assigned SOP policy, with its disposition"
        >
          {pack.deviations.length === 0 ? (
            <EmptyNote>
              No policy deviations were recorded for this agent in this period.
            </EmptyNote>
          ) : (
            <DocTable head={['Timestamp', 'Policy', 'What happened', 'Status', 'Resolution']}>
              {pack.deviations.map((d) => {
                const policy = ds.policies.find((p) => p.id === d.policyId)
                return (
                  <tr key={d.id}>
                    <td className={`${cell} whitespace-nowrap`}>{fmtDateTime(d.timestamp)}</td>
                    <td className={cell}>{policy?.name}</td>
                    <td className={cell}>{d.description}</td>
                    <td className={cell}>
                      <DeviationStatusBadge status={d.status} />
                    </td>
                    <td className={cell}>
                      {d.resolutionNote ? (
                        <>
                          {d.resolutionNote}
                          {d.resolvedAt && (
                            <span className="block text-slate-500">
                              Closed {fmtDate(d.resolvedAt)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">Pending</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </DocTable>
          )}
        </Section>

        <Section
          step={4}
          title="Policy assignments in effect"
          subtitle="The rules this agent operated under during the period"
        >
          <DocTable head={['Policy', 'Rule', 'Enforcement', 'In effect since']}>
            {pack.policyAssignments.map(({ policy, effectiveFrom }) => (
              <tr key={policy.id}>
                <td className={`${cell} whitespace-nowrap font-medium text-slate-800`}>
                  {policy.name}
                </td>
                <td className={cell}>{policy.rule}</td>
                <td className={cell}>
                  <EnforcementBadge mode={policy.enforcement} />
                </td>
                <td className={`${cell} whitespace-nowrap`}>{fmtDate(effectiveFrom)}</td>
              </tr>
            ))}
          </DocTable>
        </Section>

        <Section
          step={5}
          title="Configuration changes"
          subtitle="Version changes that took effect inside the period"
        >
          {pack.configChanges.length === 0 ? (
            <EmptyNote>
              No configuration or version changes took effect during this period. The agent ran
              unchanged throughout.
            </EmptyNote>
          ) : (
            <DocTable head={['Effective date', 'Version', 'Change recorded']}>
              {pack.configChanges.map((v) => (
                <tr key={`${v.version}-${v.date}`}>
                  <td className={`${cell} whitespace-nowrap`}>{fmtDate(v.date)}</td>
                  <td className={`${cell} whitespace-nowrap font-medium text-slate-800`}>
                    {v.version}
                  </td>
                  <td className={cell}>{v.note}</td>
                </tr>
              ))}
            </DocTable>
          )}
        </Section>

        <Section step={6} title="Access and permissions of record">
          <div className="grid grid-cols-3 gap-6 text-xs">
            <div>
              <div className="mb-1.5 font-semibold text-slate-700">Permitted actions</div>
              <ul className="space-y-1 text-slate-600">
                {agent.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 font-semibold text-slate-700">Connected systems</div>
              <ul className="space-y-1 text-slate-600">
                {agent.tools.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 font-semibold text-slate-700">Data domains accessible</div>
              <ul className="space-y-1 text-slate-600">
                {agent.dataDomains.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        </Section>

        <footer className="evidence-section border-t border-slate-200 px-8 py-4 text-[11px] leading-relaxed text-slate-500">
          Prepared by Timegram Agent Ops for {orgName} · Agent {agent.name} · Period{' '}
          {fmtDate(pack.periodStart)} – {fmtDate(pack.periodEnd)} · Generated{' '}
          {fmtDateTimeFull(ds.generatedAt)} · Metadata-only record; no prompt or output content
          is stored by the platform. Demonstration data.
        </footer>
      </article>
    </div>
  )
}
