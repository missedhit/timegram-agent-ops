import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import AuthGate from './auth/AuthGate'
import { DataProvider, seedDataSource } from './data/DataContext'
import { dataMode } from './data/dataMode'
import { OrgProvider, type OrgSummary } from './data/OrgContext'
import { makeSupabaseDataSource } from './data/supabase/SupabaseDataSource'
import { setOrgTimeZone } from './lib/orgTime'

const routedApp = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
)

/**
 * One workspace: a stable per-org data source, remounted when the org changes
 * (key={org.id}). Each org reports in its own business timezone so every
 * member sees identical numbers; the seed demo stays viewer-local ('local'
 * default) so it is always fresh.
 */
function LiveWorkspace({ org }: { org: OrgSummary }) {
  const source = useMemo(() => {
    // Before the data loads, so day-bucketing and display agree with the org.
    setOrgTimeZone(org.timezone)
    return makeSupabaseDataSource(org.id)
  }, [org.id, org.timezone])
  return <DataProvider source={source}>{routedApp}</DataProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Seed mode (including the public demo) stays auth-free by construction. */}
    {dataMode === 'supabase' ? (
      <AuthGate>
        <OrgProvider>{(org) => <LiveWorkspace key={org.id} org={org} />}</OrgProvider>
      </AuthGate>
    ) : (
      <DataProvider source={seedDataSource}>{routedApp}</DataProvider>
    )}
  </StrictMode>,
)
