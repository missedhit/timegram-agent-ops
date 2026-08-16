/**
 * Organization membership and selection for live mode.
 *
 * Sits between AuthGate and DataProvider: loads the signed-in user's org
 * memberships (readable under the member_read_* RLS policies), remembers the
 * active org, and shows a picker in the header only when the user belongs to
 * more than one org (the founder supporting prospects). Seed mode never
 * mounts this — useOrgName() falls back to the demo company.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabaseClient } from './supabase/client'
import { useAuth } from '../auth/AuthContext'

export interface OrgSummary {
  id: string
  name: string
  /** IANA business timezone the workspace reports in. */
  timezone: string
}

interface OrgState {
  orgs: OrgSummary[]
  activeOrg: OrgSummary
  setActiveOrg: (id: string) => void
}

const OrgContext = createContext<OrgState | null>(null)

/** Null in seed mode (provider not mounted). */
export function useOrg(): OrgState | null {
  return useContext(OrgContext)
}

const SEED_ORG_NAME = 'Coreline Software'

/** The workspace's display name; the demo company in seed mode. */
export function useOrgName(): string {
  return useContext(OrgContext)?.activeOrg.name ?? SEED_ORG_NAME
}

const STORAGE_KEY = 'timegram.orgId'

/** Pure so it's unit-testable: last-used org if still a membership, else first. */
export function pickActiveOrg(orgs: OrgSummary[], storedId: string | null): OrgSummary | null {
  if (orgs.length === 0) return null
  return orgs.find((o) => o.id === storedId) ?? orgs[0]
}

export function OrgProvider({ children }: { children: (org: OrgSummary) => ReactNode }) {
  const auth = useAuth()
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; orgs: OrgSummary[]; activeId: string | null }
  >({ status: 'loading' })

  const userId = auth?.session.user.id

  useEffect(() => {
    let mounted = true
    // The signed-in user can change while this provider stays mounted
    // (cross-tab auth events); never leave the previous user's workspace
    // rendered while the new user's memberships load.
    setState({ status: 'loading' })
    ;(async () => {
      try {
        const supabase = await getSupabaseClient()
        const { data, error } = await supabase
          .from('org_members')
          .select('org_id, orgs ( id, name, timezone )')
          .order('org_id')
        if (error) throw new Error(error.message)
        const orgs: OrgSummary[] = (data ?? [])
          .map((row) => row.orgs as unknown as OrgSummary | null)
          .filter((o): o is OrgSummary => o !== null)
          .sort((a, b) => a.name.localeCompare(b.name))
        if (!mounted) return
        const stored = localStorage.getItem(STORAGE_KEY)
        setState({ status: 'ready', orgs, activeId: pickActiveOrg(orgs, stored)?.id ?? null })
      } catch (err) {
        if (mounted) {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      }
    })()
    return () => {
      mounted = false
    }
  }, [userId])

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace…
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-slate-900">
            Couldn&apos;t load your organizations
          </div>
          <p className="mt-2 break-words text-sm text-slate-600">{state.message}</p>
        </div>
      </div>
    )
  }

  const active = pickActiveOrg(state.orgs, state.activeId)
  if (!active) return <NoWorkspaceAccess />

  const setActiveOrg = (id: string) => {
    if (!state.orgs.some((o) => o.id === id)) return
    localStorage.setItem(STORAGE_KEY, id)
    // Org-scoped URL state (routes, agent/filter params) must not replay
    // against the next org; the keyed remount reads window.location as-is.
    window.history.replaceState(null, '', import.meta.env.BASE_URL)
    setState({ ...state, activeId: id })
  }

  return (
    <OrgContext.Provider value={{ orgs: state.orgs, activeOrg: active, setActiveOrg }}>
      {children(active)}
    </OrgContext.Provider>
  )
}

/**
 * A signed-in user whose account isn't a member of any organization gets an
 * explanation, not an empty dashboard (RLS returns zero rows for them).
 */
export function NoWorkspaceAccess() {
  const auth = useAuth()
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="text-base font-semibold text-slate-900">No workspace access yet</div>
        <p className="mt-2 text-sm text-slate-600">
          {auth?.session.user.email ? (
            <>
              <span className="font-medium text-slate-800">{auth.session.user.email}</span> is
              signed in but isn&apos;t a member of an organization.
            </>
          ) : (
            'This account isn’t a member of an organization.'
          )}{' '}
          Ask your workspace admin to grant access, then refresh this page.
        </p>
        {auth && (
          <button
            onClick={() => void auth.signOut()}
            className="mt-4 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}
