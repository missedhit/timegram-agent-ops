import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function AppShell() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="app-body pl-60">
        <Header />
        <main className="app-main mx-auto max-w-[1400px] px-8 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
