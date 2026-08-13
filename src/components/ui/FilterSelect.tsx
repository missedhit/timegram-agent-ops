export interface FilterOption {
  value: string
  label: string
}

const normalize = (opt: string | FilterOption): FilterOption =>
  typeof opt === 'string' ? { value: opt, label: opt } : opt

export default function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
  includeAll = true,
}: {
  label: string
  value: string
  /** '' is injected automatically as the "All" option unless includeAll is false. */
  options: Array<string | FilterOption>
  onChange: (value: string) => void
  allLabel?: string
  /** Disable for filters that always have a concrete value (e.g. time period). */
  includeAll?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <select
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {includeAll && <option value="">{allLabel}</option>}
        {options.map(normalize).map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
