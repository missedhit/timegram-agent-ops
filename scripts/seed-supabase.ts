/**
 * Load the demo dataset into Supabase. Idempotent: fixed org id + upserts, so
 * rerunning changes nothing unless the data changed.
 *
 * Usage:
 *   npm run seed:supabase                       # anchored to today
 *   npm run seed:supabase -- --asof=2026-08-14  # pinned anchor (recommended)
 *   npm run seed:supabase -- --reset            # delete org data first
 *   npm run seed:supabase -- --grant-email=x@y  # add an org membership (B5)
 *
 * Uses the service-role key from .env.local (bypasses RLS by design; the key
 * never leaves this machine).
 */

import { createClient } from '@supabase/supabase-js'
import { buildDataSet } from '../src/data/seed/generate'
import { DEMO_ORG_ID, DEMO_ORG_NAME, toRows } from '../src/data/supabase/mappers'
// @ts-expect-error plain-JS helper without type declarations
import { loadEnvLocal } from './env.mjs'

const env = loadEnvLocal() as Record<string, string>
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const asof = option('asof')
const anchor = asof ? new Date(`${asof}T00:00:00`) : new Date()
if (Number.isNaN(anchor.getTime())) {
  console.error(`Invalid --asof value "${asof}" — expected YYYY-MM-DD`)
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const CHUNK = 500

async function upsertChunked(table: string, rows: object[], onConflict: string) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict })
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  console.log(`  ${table}: ${rows.length} rows`)
}

async function resetOrg() {
  console.log('Resetting org data…')
  // Children cascade from agents/policies; delete leaves first anyway for clarity.
  for (const table of [
    'approvals',
    'deviations',
    'tasks',
    'agent_policies',
    'agent_versions',
    'policies',
    'agents',
  ]) {
    const { error } = await supabase.from(table).delete().eq('org_id', DEMO_ORG_ID)
    if (error) throw new Error(`delete ${table}: ${error.message}`)
  }
}

async function grantMembership(email: string) {
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) throw new Error(`listUsers: ${error.message}`)
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) {
    console.error(
      `No auth user with email ${email} — sign in once via the app's magic link first.`,
    )
    process.exit(1)
  }
  const { error: memberError } = await supabase
    .from('org_members')
    .upsert({ org_id: DEMO_ORG_ID, user_id: user.id, role: 'owner' }, { onConflict: 'org_id,user_id' })
  if (memberError) throw new Error(`org_members: ${memberError.message}`)
  console.log(`Granted org membership to ${email} (${user.id})`)
}

async function main() {
  const grantEmail = option('grant-email')
  if (grantEmail && !flag('reset') && !args.some((a) => a.startsWith('--asof'))) {
    // Grant-only invocation: skip reseeding.
    await grantMembership(grantEmail)
    return
  }

  console.log(`Seeding ${url} as of ${anchor.toDateString()}…`)

  const { error: orgError } = await supabase
    .from('orgs')
    .upsert({ id: DEMO_ORG_ID, name: DEMO_ORG_NAME }, { onConflict: 'id' })
  if (orgError) throw new Error(`orgs: ${orgError.message}`)

  if (flag('reset')) await resetOrg()

  const rows = toRows(buildDataSet(anchor))

  await upsertChunked('agents', rows.agents, 'org_id,id')
  await upsertChunked('agent_versions', rows.agentVersions, 'org_id,agent_id,version')
  await upsertChunked('policies', rows.policies, 'org_id,id')
  await upsertChunked('agent_policies', rows.agentPolicies, 'org_id,agent_id,policy_id')
  await upsertChunked('tasks', rows.tasks, 'org_id,id')
  await upsertChunked('deviations', rows.deviations, 'org_id,id')
  await upsertChunked('approvals', rows.approvals, 'org_id,id')

  if (grantEmail) await grantMembership(grantEmail)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
