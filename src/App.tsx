import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { dataMode } from './data/dataMode'
import AgentDetailScreen from './screens/AgentDetailScreen'
import AuditExportScreen from './screens/AuditExportScreen'
import CostDashboardScreen from './screens/CostDashboardScreen'
import PoliciesScreen from './screens/PoliciesScreen'
import RegistryScreen from './screens/RegistryScreen'
import WorkLogScreen from './screens/WorkLogScreen'

// Lazy + conditionally routed: admin code never enters the seed/demo bundle,
// and in seed mode /admin falls through to the catch-all redirect.
const AdminScreen = lazy(() => import('./screens/AdminScreen'))

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<RegistryScreen />} />
        <Route path="agents/:agentId" element={<AgentDetailScreen />} />
        <Route path="work-log" element={<WorkLogScreen />} />
        <Route path="costs" element={<CostDashboardScreen />} />
        <Route path="policies" element={<PoliciesScreen />} />
        <Route path="audit" element={<AuditExportScreen />} />
        {dataMode === 'supabase' && (
          <Route
            path="admin"
            element={
              <Suspense
                fallback={<div className="py-16 text-center text-sm text-slate-500">Loading…</div>}
              >
                <AdminScreen />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
