/**
 * Connectivity check: confirms .env.local is filled in and the Supabase
 * project answers. Run with `npm run check:supabase`.
 */
import { loadEnvLocal } from './env.mjs'

const env = loadEnvLocal()
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

// Query a real table — the REST root restricts its API spec on new projects,
// so it 401s even with a valid anon key.
const res = await fetch(`${url}/rest/v1/orgs?select=id&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
})
const body = await res.text()
if (res.ok) {
  console.log(`${url} -> HTTP ${res.status} OK (schema present)`)
  process.exit(0)
}
if (res.status === 404 && body.includes('PGRST205')) {
  console.log(`${url} -> connected OK (key valid; schema not applied yet — run migrations)`)
  process.exit(0)
}
console.error(`${url} -> HTTP ${res.status} FAILED: ${body.slice(0, 200)}`)
process.exit(1)
