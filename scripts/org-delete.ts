/**
 * Offboard an organization. Shows what will be destroyed, then deletes the
 * org row — every per-org table cascades from it (org_members, agents →
 * tasks/deviations/approvals/agent_versions/agent_policies, policies,
 * api_keys), so this is a single, complete, irreversible removal.
 *
 *   npm run org:delete -- --org "Acme Test" --yes
 *
 * Safety: refuses without --yes; refuses the live foundation org
 * ("Northbridge Mutual") without an additional --force. Auth users are NOT
 * deleted — members left with zero orgs are listed so you can remove them
 * in the dashboard if the prospect relationship is fully over.
 */

import { createClient } from '@supabase/supabase-js'
// @ts-expect-error plain-JS helper without type declarations
import { loadEnvLocal } from './env.mjs'

const PROTECTED_ORG = 'Northbridge Mutual'

const env = loadEnvLocal() as Record<string, string>
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && !args[idx + 1]?.startsWith('--') ? args[idx + 1] : undefined
}

const orgRef = option('org')
if (!orgRef) {
  console.error('Usage: npm run org:delete -- --org <name|uuid> --yes [--force]')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Tables that hang off an org, for the pre-delete inventory (deletion itself
// is the single orgs-row delete — these all cascade).
const INVENTORY_TABLES = [
  'org_members',
  'agents',
  'policies',
  'tasks',
  'deviations',
  'approvals',
  'api_keys',
] as const

async function main() {
  const query = supabase.from('orgs').select('id, name')
  const { data, error } = UUID_RE.test(orgRef!)
    ? await query.eq('id', orgRef!)
    : await query.eq('name', orgRef!)
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    console.error(`No organization matching "${orgRef}".`)
    process.exit(1)
  }
  const org = data[0]

  if (org.name === PROTECTED_ORG && !flag('force')) {
    console.error(
      `"${PROTECTED_ORG}" is the live foundation org — deleting it requires --force.`,
    )
    process.exit(1)
  }

  console.log(`Organization "${org.name}" (${org.id}) contains:`)
  for (const table of INVENTORY_TABLES) {
    const { count, error: countError } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('org_id', org.id)
    if (countError) throw new Error(`${table}: ${countError.message}`)
    console.log(`  ${table.padEnd(12)} ${count ?? 0}`)
  }

  if (!flag('yes')) {
    console.log('\nDry run — nothing deleted. Re-run with --yes to delete permanently.')
    console.log('Consider `npm run org:export` first; the Free tier has no backups.')
    return
  }

  // Remember members to report orphans afterward.
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', org.id)

  const { error: deleteError } = await supabase.from('orgs').delete().eq('id', org.id)
  if (deleteError) throw new Error(`delete: ${deleteError.message}`)
  console.log(`\nDeleted "${org.name}" and everything under it.`)

  for (const m of members ?? []) {
    const { count } = await supabase
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', m.user_id)
    if ((count ?? 0) === 0) {
      const { data: u } = await supabase.auth.admin.getUserById(m.user_id)
      console.log(
        `Note: auth user ${u?.user?.email ?? m.user_id} now belongs to no org — ` +
          'remove in Dashboard → Authentication → Users if offboarding is final.',
      )
    }
  }
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
