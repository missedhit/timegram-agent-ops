/**
 * Create an organization and grant its owner. Minimal M1 version — starter
 * policies, API key issuance, and the CONNECT handout arrive with the
 * onboarding kit milestone.
 *
 *   npm run org:create -- --name "Acme Test" --owner-email jane@acme.com
 *
 * The owner email must already exist as an auth user (sign in once via magic
 * link, or the onboarding kit will create it via the admin API).
 */

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
// @ts-expect-error plain-JS helper without type declarations
import { loadEnvLocal } from './env.mjs'

const env = loadEnvLocal() as Record<string, string>
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const option = (name: string) => {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 ? process.argv[idx + 1] : undefined
}

const name = option('name')
const ownerEmail = option('owner-email')
if (!name || !ownerEmail) {
  console.error('Usage: npm run org:create -- --name "Acme Corp" --owner-email jane@acme.com')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

async function main() {
  const { data: existing, error: lookupError } = await supabase
    .from('orgs')
    .select('id, name')
    .eq('name', name)
  if (lookupError) throw new Error(lookupError.message)
  if (existing && existing.length > 0) {
    console.error(`An organization named "${name}" already exists (${existing[0].id}).`)
    process.exit(1)
  }

  const orgId = randomUUID()
  const { error: orgError } = await supabase.from('orgs').insert({ id: orgId, name })
  if (orgError) throw new Error(`orgs: ${orgError.message}`)

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError) throw new Error(`listUsers: ${usersError.message}`)
  const user = users.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase())
  if (!user) {
    console.error(
      `No auth user with email ${ownerEmail} — have them sign in once via magic link first.`,
    )
    process.exit(1)
  }

  const { error: memberError } = await supabase
    .from('org_members')
    .insert({ org_id: orgId, user_id: user.id, role: 'owner' })
  if (memberError) throw new Error(`org_members: ${memberError.message}`)

  console.log(`Created organization "${name}"`)
  console.log(`  org id : ${orgId}`)
  console.log(`  owner  : ${ownerEmail} (${user.id})`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
