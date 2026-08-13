/**
 * Which DataSource the app uses. Anything other than exactly 'supabase' means
 * seed mode, so the public demo build can never flip to live data by accident.
 */
export type DataMode = 'seed' | 'supabase'

export const dataMode: DataMode =
  import.meta.env.VITE_DATA_MODE === 'supabase' ? 'supabase' : 'seed'
