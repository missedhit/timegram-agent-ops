import { Bot, CircleDollarSign, FileCheck2, ScrollText, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { dataMode } from '../../data/dataMode'

const NAV_ITEMS = [
  { to: '/', label: 'Agent Registry', icon: Bot, end: true },
  { to: '/work-log', label: 'Work Log', icon: ScrollText },
  { to: '/costs', label: 'Cost Dashboard', icon: CircleDollarSign },
  { to: '/policies', label: 'Policies & Deviations', icon: ShieldCheck },
  { to: '/audit', label: 'Audit Export', icon: FileCheck2 },
]

export default function Sidebar() {
  return (
    <aside className="app-sidebar fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          T
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight text-slate-900">Timegram</div>
          <div className="text-xs leading-tight text-slate-500">Agent Ops</div>
        </div>
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
      </nav>

      <div className="border-t border-slate-200 px-5 py-3 text-xs text-slate-400">
        Northbridge Mutual
        <br />
        {dataMode === 'supabase' ? 'Live environment' : 'Demo environment · Seed data'}
      </div>
    </aside>
  )
}
