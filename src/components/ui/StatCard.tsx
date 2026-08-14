export default function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  /** 'alert' renders the value in red — reserved for deviations and budget alerts. */
  tone?: 'default' | 'alert'
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 sm:px-4 sm:py-3.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${
          tone === 'alert' ? 'text-red-600' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}
