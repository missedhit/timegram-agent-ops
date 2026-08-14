/**
 * Export an organization's data as JSON — one file per table. The Supabase
 * Free tier has NO automated backups, so this is the backup posture until
 * the first real prospect justifies the Pro upgrade: run it before every
 * org-delete and on a habit-forming cadence for live orgs.
 *
 *   npm run org:export -- --org "Acme Test"      one org
 *   npm run org:export -- --all                  every org
 *
 * Output: exports/<slug>-<YYYY-MM-DD>/<table>.json (git-ignored). api_keys
 * rows contain only SHA-256 hashes — raw keys are never stored anywhere.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && !args[idx + 1]?.startsWith('--') ? args[idx + 1] : undefined
}

const orgRef = option('org')
if (!orgRef && !flag('all')) {
  console.error('Usage: npm run org:export -- (--org <name|uuid> | --all)')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Each table with the column(s) that make range-pagination deterministic —
// PostgREST guarantees nothing about row order without an explicit sort, and
// unstable page boundaries silently duplicate or drop rows.
const TABLES: ReadonlyArray<{ name: string; order: string[] }> = [
  { name: 'org_members', order: ['user_id'] },
  { name: 'agents', order: ['id'] },
  { name: 'agent_versions', order: ['agent_id', 'version'] },
  { name: 'policies', order: ['id'] },
  { name: 'agent_policies', order: ['agent_id', 'policy_id'] },
  { name: 'tasks', order: ['id'] },
  { name: 'deviations', order: ['id'] },
  { name: 'approvals', order: ['id'] },
  { name: 'api_keys', order: ['id'] },
]

const PAGE = 1000 // PostgREST default max rows per request — page past it

async function fetchAll(table: string, orderCols: string[], orgId: string) {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*').eq('org_id', orgId)
    for (const col of orderCols) query = query.order(col)
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

async function exportOrg(org: { id: string; name: string }) {
  const slug = org.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const stamp = new Date().toISOString().slice(0, 10)
  // org-id prefix keeps directories unique even when two org names collapse
  // to the same slug — these dumps are the only backup on the Free tier.
  const dir = fileURLToPath(
    new URL(`../exports/${slug || 'org'}-${org.id.slice(0, 8)}-${stamp}`, import.meta.url),
  )
  mkdirSync(dir, { recursive: true })

  const { data: orgRow, error } = await supabase.from('orgs').select('*').eq('id', org.id).single()
  if (error) throw new Error(`orgs: ${error.message}`)
  writeFileSync(`${dir}/orgs.json`, JSON.stringify([orgRow], null, 2), 'utf-8')

  let total = 1
  for (const table of TABLES) {
    const rows = await fetchAll(table.name, table.order, org.id)
    writeFileSync(`${dir}/${table.name}.json`, JSON.stringify(rows, null, 2), 'utf-8')
    total += rows.length
    console.log(`  ${table.name.padEnd(16)} ${rows.length}`)
  }
  console.log(
    `Exported "${org.name}" — ${total} rows → exports/${slug || 'org'}-${org.id.slice(0, 8)}-${stamp}/`,
  )
}

async function main() {
  if (flag('all')) {
    const { data, error } = await supabase.from('orgs').select('id, name').order('name')
    if (error) throw new Error(error.message)
    for (const org of data ?? []) {
      console.log(`\n${org.name}`)
      await exportOrg(org)
    }
    return
  }

  const query = supabase.from('orgs').select('id, name')
  const { data, error } = UUID_RE.test(orgRef!)
    ? await query.eq('id', orgRef!)
    : await query.eq('name', orgRef!)
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    console.error(`No organization matching "${orgRef}".`)
    process.exit(1)
  }
  await exportOrg(data[0])
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
