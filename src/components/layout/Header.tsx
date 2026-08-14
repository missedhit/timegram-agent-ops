import { EyeOff, LogOut, Menu } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useData } from '../../data/DataContext'
import { dataMode } from '../../data/dataMode'
import { useOrg, useOrgName } from '../../data/OrgContext'
import { fmtDate } from '../../lib/format'

const METADATA_TITLE =
  'Timegram Agent Ops records what agents did, when, at what cost, and whether policy was followed. Prompt and output contents are never stored or displayed.'

export default function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const ds = useData()
  const auth = useAuth()
  const org = useOrg()
  const orgName = useOrgName()

  return (
    <header className="app-header sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="-ml-1.5 shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        {org && org.orgs.length > 1 ? (
          <select
            aria-label="Switch organization"
            className="min-w-0 max-w-[45vw] rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-900 focus:border-indigo-400 focus:outline-none sm:max-w-none"
            value={org.activeOrg.id}
            onChange={(e) => org.setActiveOrg(e.target.value)}
          >
            {org.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate text-sm font-semibold text-slate-900">{orgName}</span>
        )}
        {/* The activity window is reference detail — it yields first on narrow screens. */}
        <span className="hidden shrink-0 text-xs text-slate-500 xl:inline">
          Activity window: {fmtDate(ds.rangeStart)} – {fmtDate(ds.rangeEnd)}
        </span>
        <span
          className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${
            dataMode === 'supabase'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-slate-100 text-slate-500'
          }`}
          title={
            dataMode === 'supabase'
              ? 'Reading from the live database'
              : 'Reading from the built-in demo dataset'
          }
        >
          {dataMode === 'supabase' ? 'Live data' : 'Demo data'}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Full pill on wide screens, icon-only badge on narrow ones. */}
        <div
          className="hidden items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 lg:flex"
          title={METADATA_TITLE}
        >
          <EyeOff className="h-3.5 w-3.5" />
          Metadata-only mode: ON
        </div>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 lg:hidden"
          title={METADATA_TITLE}
          aria-label="Metadata-only mode is on"
        >
          <EyeOff className="h-3.5 w-3.5" />
        </div>
        {auth && (
          <button
            onClick={() => void auth.signOut()}
            title={`Signed in as ${auth.session.user.email ?? 'user'} — sign out`}
            aria-label="Sign out"
            className="flex items-center gap-1 rounded-md p-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        )}
      </div>
    </header>
  )
}
