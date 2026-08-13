import type { ReactNode } from 'react'

/** Titled content card used across detail and dashboard screens. */
export default function Card({
  title,
  subtitle,
  actions,
  children,
  padded = true,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  /** Disable for flush content like tables. */
  padded?: boolean
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className={padded ? 'px-4 py-3' : ''}>{children}</div>
    </section>
  )
}
