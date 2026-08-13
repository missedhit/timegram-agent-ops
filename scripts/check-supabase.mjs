/**
 * Connectivity check: confirms .env.local is filled in and the Supabase
 * project answers. Run with `npm run check:supabase`.
 */
import { readFileSync } from 'node:fs'

export function loadEnvLocal() {
  let text
  try {
    text = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  } catch {
    console.error('No .env.local found — copy .env.example and fill in the Supabase keys.')
    process.exit(1)
  }
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

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
