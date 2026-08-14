import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'

export default function AppShell() {
  // Below lg the sidebar is an off-canvas drawer; at lg and up it is always
  // visible and this flag is inert.
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  // Navigating from inside the drawer should return to the page.
  useEffect(() => setNavOpen(false), [pathname])

  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <div className="min-h-screen">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="app-body lg:pl-60">
        <Header onOpenNav={() => setNavOpen(true)} />
        <main className="app-main mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
