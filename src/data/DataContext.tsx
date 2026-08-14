/**
 * Data access seam between the UI and wherever the data comes from.
 *
 * Screens only ever call `useData()`. Today the single implementation is the
 * seeded in-browser generator; in production this becomes an API client that
 * returns the same DataSet shape — no screen changes required.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DataSet } from '../domain/types'
import { resolveAnchor } from './anchor'
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
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let mounted = true
    setError(null)
    source.load().then(
      (ds) => {
        if (mounted) setDataSet(ds)
      },
      // A rejected load must surface, not leave the app on the spinner forever.
      (err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err))
      },
    )
    return () => {
      mounted = false
    }
  }, [source, attempt])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="text-base font-semibold text-slate-900">Couldn&apos;t load the workspace</div>
          <p className="mt-2 break-words text-sm text-slate-600">{error}</p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="mt-4 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!dataSet) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading workspace…
      </div>
    )
  }

  // Membership gating lives in OrgProvider now — a workspace with zero agents
  // is a legitimate fresh org and renders the connect-your-first-agent UX.
  return <DataContext.Provider value={dataSet}>{children}</DataContext.Provider>
}

export function useData(): DataSet {
  const ds = useContext(DataContext)
  if (!ds) throw new Error('useData must be used within a DataProvider')
  return ds
}
