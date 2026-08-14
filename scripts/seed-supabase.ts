/**
 * Load the demo dataset into Supabase. Idempotent for the same anchor; when
 * the anchor moves, stale generator rows from the previous window are
 * garbage-collected automatically (rows ingested via the API are preserved).
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
import { LIVE_ORG_TIMEZONE, setOrgTimeZone } from '../src/lib/orgTime'
import { buildDataSet } from '../src/data/seed/generate'
import { DEMO_ORG_ID, DEMO_ORG_NAME, toRows } from '../src/data/supabase/mappers'

// The live workspace buckets days in the org business timezone; generate the
// narrative breach amounts in the same timezone so alert text matches the
// charts every viewer sees. (Do NOT use a TZ env var — Node on Windows
// ignores IANA TZ values.)
setOrgTimeZone(LIVE_ORG_TIMEZONE)
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

/**
 * Delete generator-produced rows that are no longer part of the current
 * dataset (a reseed with a different --asof shifts the window, stranding old
 * rows that would silently corrupt every aggregate). Only ids matching the
 * generator's namespace are touched, so API-ingested rows survive.
 */
async function gcStale(table: string, keepIds: Set<string>, generatorId: RegExp) {
  // Paged read — supabase-js caps responses at 1000 rows.
  const ids: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq('org_id', DEMO_ORG_ID)
      .order('id')
      .range(from, from + 999)
    if (error) throw new Error(`gc select ${table}: ${error.message}`)
    ids.push(...(data ?? []).map((r) => r.id as string))
    if (!data || data.length < 1000) break
  }
  const stale = ids.filter((id) => generatorId.test(id) && !keepIds.has(id))
  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200)
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('org_id', DEMO_ORG_ID)
      .in('id', chunk)
    if (error) throw new Error(`gc delete ${table}: ${error.message}`)
  }
  if (stale.length > 0) console.log(`  ${table}: removed ${stale.length} stale rows`)
}

async function grantMembership(email: string) {
  // listUsers is paged (50/page default) — search every page.
  let user
  for (let page = 1; !user; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (data.users.length < 1000) break
  }
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

  // Children first, then tasks; API-ingested rows (task-ing-*) are preserved.
  await gcStale('approvals', new Set(rows.approvals.map((r) => r.id)), /^app-\d+$/)
  await gcStale('deviations', new Set(rows.deviations.map((r) => r.id)), /^dev-\d+$/)
  await gcStale('tasks', new Set(rows.tasks.map((r) => r.id)), /^t-/)

  if (grantEmail) await grantMembership(grantEmail)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
