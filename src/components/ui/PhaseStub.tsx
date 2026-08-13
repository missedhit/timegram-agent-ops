/** Temporary placeholder for screens arriving in a later build phase. */

export default function PhaseStub({ title, phase }: { title: string; phase: number }) {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-600">This screen arrives in Phase {phase}.</p>
        <p className="mt-1 text-xs text-slate-400">
          Navigation and data are already wired — only the view is pending.
        </p>
      </div>
    </div>
  )
}
