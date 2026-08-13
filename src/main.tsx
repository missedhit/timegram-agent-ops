import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import './index.css'
import App from './App'
import AuthGate from './auth/AuthGate'
import { DataProvider, seedDataSource } from './data/DataContext'
import { dataMode } from './data/dataMode'
import { supabaseDataSource } from './data/supabase/SupabaseDataSource'

const source = dataMode === 'supabase' ? supabaseDataSource : seedDataSource

const app = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <DataProvider source={source}>
      <App />
    </DataProvider>
  </BrowserRouter>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Seed mode (including the public demo) stays auth-free by construction. */}
    {dataMode === 'supabase' ? <AuthGate>{app}</AuthGate> : app}
  </StrictMode>,
)
