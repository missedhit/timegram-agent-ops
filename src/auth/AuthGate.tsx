import type { ReactNode } from 'react'
import { AuthReadyContext, useSession } from './AuthContext'
import LoginScreen from './LoginScreen'

/**
 * Gates the app behind a session. Only mounted in supabase mode — seed mode
 * (including the public demo) renders without any of this.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session } = useSession()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Checking session…
      </div>
    )
  }

  if (!session) return <LoginScreen />

  return <AuthReadyContext session={session}>{children}</AuthReadyContext>
}
