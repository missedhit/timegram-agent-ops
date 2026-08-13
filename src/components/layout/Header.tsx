import { EyeOff, LogOut } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useData } from '../../data/DataContext'
import { dataMode } from '../../data/dataMode'
import { fmtDate } from '../../lib/format'

export default function Header() {
  const ds = useData()
  const auth = useAuth()

  return (
    <header className="app-header sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-slate-900">Northbridge Mutual</span>
        <span className="text-xs text-slate-500">
          Activity window: {fmtDate(ds.rangeStart)} – {fmtDate(ds.rangeEnd)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
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
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
          title="Timegram Agent Ops records what agents did, when, at what cost, and whether policy was followed. Prompt and output contents are never stored or displayed."
        >
          <EyeOff className="h-3.5 w-3.5" />
          Metadata-only mode: ON
        </div>
        {auth && (
          <button
            onClick={() => void auth.signOut()}
            title={`Signed in as ${auth.session.user.email ?? 'user'} — sign out`}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        )}
      </div>
    </header>
  )
}
