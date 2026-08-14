/**
 * Is the signed-in user a platform admin? Resolved from the platform_admins
 * table, which RLS restricts to the caller's own row — so this can only ever
 * reveal the user's own status. Purely a UX signal (show the Admin nav item,
 * gate the /admin route); the admin edge function re-checks on every call.
 */

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getSupabaseClient } from '../data/supabase/client'

export function useAdminStatus(): boolean | null {
  const auth = useAuth()
  const userId = auth?.session.user.id ?? null
  const [status, setStatus] = useState<boolean | null>(userId ? null : false)

  useEffect(() => {
    // Seed mode / signed out: never touch the supabase client.
    if (!userId) {
      setStatus(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const supabase = await getSupabaseClient()
        const { data, error } = await supabase
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', userId)
          .limit(1)
        if (!cancelled) setStatus(!error && (data?.length ?? 0) > 0)
      } catch {
        if (!cancelled) setStatus(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  return status
}
