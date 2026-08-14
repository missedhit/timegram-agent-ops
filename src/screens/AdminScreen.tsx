/**
 * Platform admin — the founder's org-lifecycle dashboard. Every action calls
 * the admin edge function (service-role writes, platform_admins-gated); this
 * screen is UX only and is unreachable in seed mode. Raw API keys and
 * handouts exist only in component state, shown once, cleared on dismiss.
 */

import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Copy, Download, KeyRound, ShieldAlert, Trash2 } from 'lucide-react'
import {
  adminApi,
  AdminApiError,
  type AdminOrg,
  type CreatedOrg,
  type DeletionReport,
} from '../admin/adminApi'
import { useAdminStatus } from '../admin/useAdminStatus'
import { useOrg } from '../data/OrgContext'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import StatCard from '../components/ui/StatCard'
import { TableShell, Td, Th } from '../components/ui/Table'

const PRIMARY_BTN =
  'rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50'
const SECONDARY_BTN =
  'rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const DANGER_BTN =
  'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'
const INPUT =
  'w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none'

const errorText = (err: unknown) =>
  err instanceof AdminApiError ? err.message : 'Something went wrong — try again.'

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={SECONDARY_BTN}
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="mr-1 inline h-3.5 w-3.5" /> : <Copy className="mr-1 inline h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

/** The shown-once panel after creating an org or issuing a key. */
function KeyReveal({
  title,
  rawKey,
  handout,
  orgName,
  onDismiss,
}: {
  title: string
  rawKey: string
  handout?: string
  orgName?: string
  onDismiss: () => void
}) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
        <KeyRound className="h-4 w-4" />
        {title}
      </div>
      <p className="mb-2 text-xs text-indigo-900">
        Shown once — it cannot be retrieved again. Copy it or download the handout before
        dismissing.
      </p>
      <div className="mb-3 overflow-x-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
        {rawKey}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton value={rawKey} label="Copy key" />
        {handout && orgName && (
          <button
            type="button"
            className={PRIMARY_BTN}
            onClick={() => downloadFile(`CONNECT-${slugOf(orgName)}.md`, handout, 'text/markdown')}
          >
            <Download className="mr-1 inline h-3.5 w-3.5" />
            Download handout
          </button>
        )}
        <button type="button" className={SECONDARY_BTN} onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      {handout && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-indigo-800">
            Preview the handout before sending
          </summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-xs text-slate-700">
            {handout}
          </pre>
        </details>
      )}
    </div>
  )
}

function NewOrgCard({ onCreated }: { onCreated: (result: CreatedOrg) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [timezone, setTimezone] = useState('America/New_York')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await adminApi.createOrg({ name, owner_email: email, timezone })
      setName('')
      setEmail('')
      setTimezone('America/New_York')
      onCreated(result)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="New organization"
      subtitle="Creates the org, 5 starter policies, the owner's login, and an API key — then hands you the CONNECT handout."
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-600">
          Organization name
          <input
            className={`mt-1 ${INPUT}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Corp"
            required
            maxLength={120}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Owner email
          <input
            className={`mt-1 ${INPUT}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acme.com"
            required
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Timezone
          <select className={`mt-1 ${INPUT}`} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {Intl.supportedValuesOf('timeZone').map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="whitespace-pre-line text-sm text-red-600 sm:col-span-3">{error}</p>
        )}
        <div className="sm:col-span-3">
          <button type="submit" className={PRIMARY_BTN} disabled={busy}>
            {busy ? 'Creating…' : 'Create organization'}
          </button>
        </div>
      </form>
    </Card>
  )
}

type RowAction = 'keys' | 'delete' | null

function OrgActions({
  org,
  onChanged,
  onKeyIssued,
  onDeleted,
}: {
  org: AdminOrg
  onChanged: () => void
  onKeyIssued: (raw: { raw_key: string; label: string }) => void
  onDeleted: (report: DeletionReport) => void
}) {
  const [action, setAction] = useState<RowAction>(null)
  const [label, setLabel] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const activeKeys = org.keys.filter((k) => !k.revoked_at)

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={SECONDARY_BTN} onClick={() => setAction(action === 'keys' ? null : 'keys')}>
          <KeyRound className="mr-1 inline h-3.5 w-3.5" />
          Keys ({activeKeys.length} active)
        </button>
        <button
          type="button"
          className={SECONDARY_BTN}
          disabled={busy}
          onClick={() =>
            run(async () => {
              const dump = await adminApi.exportOrg(org.id)
              downloadFile(
                `${slugOf(org.name)}-${new Date().toISOString().slice(0, 10)}.json`,
                JSON.stringify(dump, null, 2),
                'application/json',
              )
            })
          }
        >
          <Download className="mr-1 inline h-3.5 w-3.5" />
          Export JSON
        </button>
        {!org.protected && (
          <button
            type="button"
            className={SECONDARY_BTN}
            onClick={() => setAction(action === 'delete' ? null : 'delete')}
          >
            <Trash2 className="mr-1 inline h-3.5 w-3.5" />
            Delete…
          </button>
        )}
        {org.protected && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <ShieldAlert className="h-3.5 w-3.5" />
            Foundation org — cannot be deleted here
          </span>
        )}
      </div>

      {action === 'keys' && (
        <div className="space-y-2">
          {org.keys.length > 0 && (
            <ul className="space-y-1 text-xs text-slate-600">
              {org.keys.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">{k.label}</span>
                  <span>created {k.created_at.slice(0, 10)}</span>
                  {k.revoked_at ? (
                    <span className="text-red-600">revoked {k.revoked_at.slice(0, 10)}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className="font-medium text-indigo-700 hover:underline disabled:opacity-50"
                      onClick={() =>
                        run(async () => {
                          await adminApi.revokeKey(k.id)
                          onChanged()
                        })
                      }
                    >
                      Revoke
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                const issued = await adminApi.issueKey(org.id, label.trim() || 'default')
                setLabel('')
                onKeyIssued(issued)
                onChanged()
              })
            }}
          >
            <input
              className={`${INPUT} max-w-48`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="label (e.g. rotated-2026-08)"
              maxLength={40}
            />
            <button type="submit" className={PRIMARY_BTN} disabled={busy}>
              Issue new key
            </button>
          </form>
        </div>
      )}

      {action === 'delete' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const report = await adminApi.deleteOrg(org.id, confirmName)
              setConfirmName('')
              setAction(null)
              onDeleted(report)
            })
          }}
        >
          <p className="text-xs text-slate-600">
            Permanently deletes <span className="font-semibold">{org.name}</span> and everything in
            it ({org.counts.agents} agents, {org.counts.tasks} tasks, {org.counts.members} members,
            all policies and keys). Export first. Type the organization name to confirm.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className={`${INPUT} max-w-64`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={org.name}
            />
            <button
              type="submit"
              className={DANGER_BTN}
              disabled={busy || confirmName !== org.name}
            >
              Delete permanently
            </button>
          </div>
        </form>
      )}

      {error && <p className="whitespace-pre-line text-sm text-red-600">{error}</p>}
    </div>
  )
}

export default function AdminScreen() {
  const isAdmin = useAdminStatus()
  const org = useOrg()
  const [orgs, setOrgs] = useState<AdminOrg[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedOrg | null>(null)
  const [issuedKey, setIssuedKey] = useState<{ raw_key: string; label: string } | null>(null)
  const [deletion, setDeletion] = useState<DeletionReport | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const { orgs } = await adminApi.listOrgs()
      setOrgs(orgs)
      setLoadError(null)
    } catch (err) {
      setLoadError(errorText(err))
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void refresh()
  }, [isAdmin, refresh])

  if (isAdmin === null) {
    return <div className="py-16 text-center text-sm text-slate-500">Checking access…</div>
  }
  if (!isAdmin) return <Navigate to="/" replace />

  const activeKeyCount = orgs?.reduce(
    (n, o) => n + o.keys.filter((k) => !k.revoked_at).length,
    0,
  )

  const handleDeleted = (report: DeletionReport) => {
    // Deleting the workspace currently mounted underneath us leaves a dead
    // DataProvider — a full reload re-resolves memberships cleanly.
    if (org && report.org.id === org.activeOrg.id) {
      window.location.reload()
      return
    }
    setDeletion(report)
    void refresh()
  }

  return (
    <>
      <PageHeader
        title="Platform admin"
        subtitle="Prospect org lifecycle — creation, keys, backups, offboarding. Every action is audited in the function logs."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Organizations" value={orgs ? String(orgs.length) : '—'} />
        <StatCard label="Active API keys" value={orgs ? String(activeKeyCount) : '—'} />
        <StatCard
          label="Agents (all orgs)"
          value={orgs ? String(orgs.reduce((n, o) => n + o.counts.agents, 0)) : '—'}
        />
        <StatCard
          label="Tasks (all orgs)"
          value={orgs ? String(orgs.reduce((n, o) => n + o.counts.tasks, 0)) : '—'}
        />
      </div>

      <div className="space-y-5">
        {created && (
          <KeyReveal
            title={`${created.org.name} created — owner ${created.owner_email} (${created.owner_note})`}
            rawKey={created.raw_key}
            handout={created.handout_markdown}
            orgName={created.org.name}
            onDismiss={() => setCreated(null)}
          />
        )}
        {issuedKey && (
          <KeyReveal
            title={`New key issued (${issuedKey.label})`}
            rawKey={issuedKey.raw_key}
            onDismiss={() => setIssuedKey(null)}
          />
        )}
        {deletion && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            Deleted <span className="font-semibold">{deletion.org.name}</span> —{' '}
            {Object.entries(deletion.inventory)
              .map(([table, n]) => `${n} ${table}`)
              .join(', ')}
            .
            {deletion.orphaned_users.length > 0 && (
              <>
                {' '}
                Sign-in accounts with no remaining workspace: {deletion.orphaned_users.join(', ')}{' '}
                (remove in Supabase Dashboard → Authentication → Users if offboarding is final).
              </>
            )}{' '}
            <button className="font-medium text-indigo-700 hover:underline" onClick={() => setDeletion(null)}>
              Dismiss
            </button>
          </div>
        )}

        <NewOrgCard
          onCreated={(result) => {
            setCreated(result)
            setIssuedKey(null)
            void refresh()
          }}
        />

        <Card
          title="Organizations"
          subtitle="Switching the workspace dropdown to a newly created org requires a page reload."
          padded={false}
        >
          {loadError ? (
            <p className="px-4 py-6 text-sm text-red-600">{loadError}</p>
          ) : !orgs ? (
            <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <Th>Organization</Th>
                  <Th>Timezone</Th>
                  <Th align="right">Members</Th>
                  <Th align="right">Agents</Th>
                  <Th align="right">Tasks</Th>
                  <Th align="right">Keys</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <Fragment key={o.id}>
                    <tr className="border-b border-slate-100 last:border-0">
                      <Td className="font-medium text-slate-900">{o.name}</Td>
                      <Td>{o.timezone}</Td>
                      <Td align="right">{o.counts.members}</Td>
                      <Td align="right">{o.counts.agents}</Td>
                      <Td align="right">{o.counts.tasks}</Td>
                      <Td align="right">{o.keys.filter((k) => !k.revoked_at).length}</Td>
                      <Td align="right">
                        <button
                          type="button"
                          className="text-sm font-medium text-indigo-700 hover:underline"
                          onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                        >
                          {expanded === o.id ? 'Close' : 'Manage'}
                        </button>
                      </Td>
                    </tr>
                    {expanded === o.id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <OrgActions
                            org={o}
                            onChanged={() => void refresh()}
                            onKeyIssued={(issued) => {
                              setIssuedKey(issued)
                              setCreated(null)
                            }}
                            onDeleted={handleDeleted}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      </div>
    </>
  )
}
