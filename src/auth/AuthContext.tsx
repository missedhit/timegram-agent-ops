/**
 * Session state for supabase mode. In seed mode this provider is never
 * mounted and useAuth() returns null, so the demo stays auth-free.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient } from '../data/supabase/client'

export interface AuthState {
  session: Session
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Null outside supabase mode (or before login). */
export function useAuth(): AuthState | null {
  return useContext(AuthContext)
}

export function AuthReadyContext({
  session,
  children,
}: {
  session: Session
  children: ReactNode
}) {
  const signOut = async () => {
    const supabase = await getSupabaseClient()
    await supabase.auth.signOut()
  }
  return <AuthContext.Provider value={{ session, signOut }}>{children}</AuthContext.Provider>
}

export function useSession(): { loading: boolean; session: Session | null } {
  const [state, setState] = useState<{ loading: boolean; session: Session | null }>({
    loading: true,
    session: null,
  })

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let mounted = true
    getSupabaseClient().then((supabase) => {
      supabase.auth.getSession().then(({ data }) => {
        if (mounted) setState({ loading: false, session: data.session })
      })
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        if (mounted) setState({ loading: false, session })
      })
      unsubscribe = () => sub.subscription.unsubscribe()
    })
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [])

  return state
}
