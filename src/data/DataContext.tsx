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

  return <DataContext.Provider value={dataSet}>{children}</DataContext.Provider>
}

export function useData(): DataSet {
  const ds = useContext(DataContext)
  if (!ds) throw new Error('useData must be used within a DataProvider')
  return ds
}
