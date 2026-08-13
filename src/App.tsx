import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import AgentDetailScreen from './screens/AgentDetailScreen'
import AuditExportScreen from './screens/AuditExportScreen'
import CostDashboardScreen from './screens/CostDashboardScreen'
import PoliciesScreen from './screens/PoliciesScreen'
import RegistryScreen from './screens/RegistryScreen'
import WorkLogScreen from './screens/WorkLogScreen'

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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
