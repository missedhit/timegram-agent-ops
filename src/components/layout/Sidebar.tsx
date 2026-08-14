import { Bot, Building2, CircleDollarSign, FileCheck2, ScrollText, ShieldCheck, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAdminStatus } from '../../admin/useAdminStatus'
import { dataMode } from '../../data/dataMode'
import { useOrgName } from '../../data/OrgContext'

const NAV_ITEMS = [
  { to: '/', label: 'Agent Registry', icon: Bot, end: true },
  { to: '/work-log', label: 'Work Log', icon: ScrollText },
  { to: '/costs', label: 'Cost Dashboard', icon: CircleDollarSign },
  { to: '/policies', label: 'Policies & Deviations', icon: ShieldCheck },
  { to: '/audit', label: 'Audit Export', icon: FileCheck2 },
]

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const orgName = useOrgName()
  const isAdmin = useAdminStatus()
  return (
    <>
      {/* Scrim for the mobile drawer only. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-slate-900/40 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <aside
        /* `invisible` when closed keeps the off-canvas nav out of the tab order. */
        className={`app-sidebar fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:visible lg:z-20 lg:translate-x-0 ${
          open ? 'translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            T
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-900">Timegram</div>
            <div className="text-xs leading-tight text-slate-500">Agent Ops</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-1 ml-auto rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
          {isAdmin === true && (
            <>
              <div className="mx-2.5 my-2 border-t border-slate-200" />
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <Building2 className="h-4 w-4 shrink-0" />
                Platform Admin
              </NavLink>
            </>
          )}
        </nav>

        <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-400">
          {orgName}
          <br />
          {dataMode === 'supabase' ? 'Live environment' : 'Demo environment · Seed data'}
        </div>
      </aside>
    </>
  )
}
