import { EyeOff } from 'lucide-react'
import { useData } from '../../data/DataContext'
import { fmtDate } from '../../lib/format'

export default function Header() {
  const ds = useData()

  return (
    <header className="app-header sticky top-0 z-10 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-8 backdrop-blur">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-slate-900">Northbridge Mutual</span>
        <span className="text-xs text-slate-500">
          Activity window: {fmtDate(ds.rangeStart)} – {fmtDate(ds.rangeEnd)}
        </span>
      </div>
      <div
        className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
        title="Timegram Agent Ops records what agents did, when, at what cost, and whether policy was followed. Prompt and output contents are never stored or displayed."
      >
        <EyeOff className="h-3.5 w-3.5" />
        Metadata-only mode: ON
      </div>
    </header>
  )
}
