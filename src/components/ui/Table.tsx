/** Lightweight styled table primitives shared by every screen. */

import type { ReactNode } from 'react'
import { useHref, useNavigate } from 'react-router-dom'

export function TableShell({ children }: { children: ReactNode }) {
  return (
    /* The scroll container also caps the min-content width of any grid or flex
       ancestor, so a wide table scrolls itself instead of widening the page. */
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, align = 'left' }: { children?: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

const TD_ALIGN = {
  left: 'text-left',
  right: 'text-right tabular-nums',
  center: 'text-center',
} as const

export function Td({
  children,
  align = 'left',
  className = '',
  colSpan,
}: {
  children?: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  colSpan?: number
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-slate-100 px-2 py-2.5 align-top ${TD_ALIGN[align]} ${className}`}
    >
      {children}
    </td>
  )
}

/**
 * Row that navigates like a link: keyboard focusable (Enter/Space), and
 * ctrl/cmd-click or middle-click opens the target in a new tab. An <a> cannot
 * legally wrap a <tr>, so the link semantics are recreated on the row itself.
 */
export function ClickableRow({ children, to }: { children: ReactNode; to: string }) {
  const navigate = useNavigate()
  const href = useHref(to)
  const open = (e: { metaKey: boolean; ctrlKey: boolean }) => {
    if (e.metaKey || e.ctrlKey) window.open(href, '_blank')
    else navigate(to)
  }
  return (
    <tr
      role="link"
      tabIndex={0}
      className="cursor-pointer transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
      onClick={open}
      onAuxClick={(e) => {
        if (e.button === 1) window.open(href, '_blank')
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open(e)
        }
      }}
    >
      {children}
    </tr>
  )
}
