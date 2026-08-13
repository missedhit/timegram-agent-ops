/**
 * Browser Supabase client (anon key — safe to expose; RLS is the boundary).
 * Loaded lazily so supabase-js never enters the seed-mode bundle the public
 * demo serves.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export async function getSupabaseClient(): Promise<SupabaseClient> {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      'VITE_DATA_MODE=supabase requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local',
    )
  }
  const { createClient } = await import('@supabase/supabase-js')
  client = createClient(url, anonKey)
  return client
}
