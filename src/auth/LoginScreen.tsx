import { useState } from 'react'
import { EyeOff } from 'lucide-react'
import { getSupabaseClient } from '../data/supabase/client'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    try {
      const supabase = await getSupabaseClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
          // Access is grant-based: signing in never creates an account.
          shouldCreateUser: false,
        },
      })
      if (error) throw error
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 text-lg font-semibold tracking-tight text-slate-900">
          Timegram <span className="text-indigo-600">Agent Ops</span>
        </div>
        <p className="mb-5 text-sm text-slate-500">Sign in to your workspace</p>

        {state === 'sent' ? (
          <p className="rounded-md bg-indigo-50 px-3 py-2.5 text-sm text-slate-700">
            Check <span className="font-medium text-slate-900">{email}</span> for a sign-in
            link, then return to this tab.
          </p>
        ) : (
          <form onSubmit={sendLink}>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Work email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mb-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={state === 'sending'}
              className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
            {state === 'error' && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </form>
        )}

        <div className="mt-5 flex items-center gap-1.5 border-t border-slate-100 pt-4 text-[11px] text-slate-400">
          <EyeOff className="h-3 w-3" />
          Metadata-only platform — prompt and output contents are never stored.
        </div>
      </div>
    </div>
  )
}
