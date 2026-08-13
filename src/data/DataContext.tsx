/**
 * Data access seam between the UI and wherever the data comes from.
 *
 * Screens only ever call `useData()`. Today the single implementation is the
 * seeded in-browser generator; in production this becomes an API client that
 * returns the same DataSet shape — no screen changes required.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { DataSet } from '../domain/types'
import { resolveAnchor } from './anchor'
import { dataMode } from './dataMode'
import { buildDataSet } from './seed/generate'

export interface DataSource {
  load(): Promise<DataSet>
}

export const seedDataSource: DataSource = {
  load: () =>
    Promise.resolve(
      buildDataSet(resolveAnchor(window.location.search, import.meta.env.VITE_DEMO_ANCHOR)),
    ),
}

const DataContext = createContext<DataSet | null>(null)

export function DataProvider({
  source = seedDataSource,
  children,
}: {
  source?: DataSource
  children: ReactNode
}) {
  const [dataSet, setDataSet] = useState<DataSet | null>(null)

  useEffect(() => {
    let mounted = true
    source.load().then((ds) => {
      if (mounted) setDataSet(ds)
    })
    return () => {
      mounted = false
    }
  }, [source])

  if (!dataSet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace…
      </div>
    )
  }

  // A signed-in user whose account isn't a member of any organization gets an
  // explanation, not an empty dashboard (RLS returns zero rows for them).
  if (dataMode === 'supabase' && dataSet.agents.length === 0) {
    return <NoWorkspaceAccess />
  }

  return <DataContext.Provider value={dataSet}>{children}</DataContext.Provider>
}

function NoWorkspaceAccess() {
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

export function useData(): DataSet {
  const ds = useContext(DataContext)
  if (!ds) throw new Error('useData must be used within a DataProvider')
  return ds
}
