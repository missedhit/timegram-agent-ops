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
    /* min-w-0 lets a card sit in a grid track without its widest child
       (a table, a long label) forcing the whole track wider than the screen. */
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3">
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
