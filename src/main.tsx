import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import AuthGate from './auth/AuthGate'
import { DataProvider, seedDataSource } from './data/DataContext'
import { dataMode } from './data/dataMode'
import { OrgProvider } from './data/OrgContext'
import { makeSupabaseDataSource } from './data/supabase/SupabaseDataSource'
import { LIVE_ORG_TIMEZONE, setOrgTimeZone } from './lib/orgTime'

// Live workspaces report in the org's business timezone so every member sees
// identical numbers; the seed demo stays viewer-local so it is always fresh.
setOrgTimeZone(dataMode === 'supabase' ? LIVE_ORG_TIMEZONE : 'local')

const routedApp = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
)

/** One workspace: a stable per-org data source, remounted when the org changes. */
function LiveWorkspace({ orgId }: { orgId: string }) {
  const source = useMemo(() => makeSupabaseDataSource(orgId), [orgId])
  return <DataProvider source={source}>{routedApp}</DataProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Seed mode (including the public demo) stays auth-free by construction. */}
    {dataMode === 'supabase' ? (
      <AuthGate>
        <OrgProvider>{(orgId) => <LiveWorkspace key={orgId} orgId={orgId} />}</OrgProvider>
      </AuthGate>
    ) : (
      <DataProvider source={seedDataSource}>{routedApp}</DataProvider>
    )}
  </StrictMode>,
)
