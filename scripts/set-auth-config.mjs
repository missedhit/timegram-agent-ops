/**
 * Point Supabase auth at the hosted app (M4): sets the magic-link Site URL to
 * https://agentworkforce.timegram.io and allows localhost for dev logins.
 *
 * Run AFTER the Cloudflare Pages custom domain is live:
 *   node scripts/set-auth-config.mjs
 *
 * Idempotent — shows the before/after config each run. Uses the Management
 * API personal access token from .env.local (same auth as apply-migrations).
 */
import { loadEnvLocal } from './env.mjs'

const SITE_URL = 'https://agentworkforce.timegram.io'
const ALLOW_LIST = 'http://localhost:5173,https://agentworkforce.timegram.io'

const env = loadEnvLocal()
const token = env.SUPABASE_ACCESS_TOKEN
const ref = env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in .env.local')
  process.exit(1)
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

async function getConfig(label) {
  const res = await fetch(endpoint, { headers })
  if (!res.ok) {
    console.error(`${label}: HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`)
    process.exit(1)
  }
  const config = await res.json()
  console.log(`${label}: site_url=${config.site_url ?? '(unset)'} uri_allow_list=${config.uri_allow_list ?? '(unset)'}`)
  return config
}

const before = await getConfig('before')

if (before.site_url === SITE_URL && before.uri_allow_list === ALLOW_LIST) {
  console.log('Already configured — nothing to do.')
  process.exit(0)
}

const res = await fetch(endpoint, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ site_url: SITE_URL, uri_allow_list: ALLOW_LIST }),
})
if (!res.ok) {
  console.error(`patch: HTTP ${res.status} — ${(await res.text()).slice(0, 500)}`)
  process.exit(1)
}

await getConfig('after')
console.log('\nDone. Magic links now resolve to the hosted app; localhost:5173 stays allowed for dev.')
