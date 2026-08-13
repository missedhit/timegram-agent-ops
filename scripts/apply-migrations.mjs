/**
 * Apply supabase/migrations/*.sql to the hosted project via the Management
 * API (no database password needed — authenticated by the personal access
 * token). Also records each version in supabase_migrations.schema_migrations
 * so the standard CLI sees them as applied.
 *
 * Run with: node scripts/apply-migrations.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvLocal } from './env.mjs'

const env = loadEnvLocal()
const token = env.SUPABASE_ACCESS_TOKEN
const ref = env.SUPABASE_PROJECT_REF
if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in .env.local')
  process.exit(1)
}

async function runSql(query, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${label}: HTTP ${res.status} — ${body.slice(0, 500)}`)
  }
  return res.json()
}

const dir = fileURLToPath(new URL('../supabase/migrations', import.meta.url))
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort()

// Which versions are already applied?
await runSql(
  `create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (
     version text primary key,
     statements text[],
     name text
   );`,
  'bookkeeping',
)
const applied = new Set(
  (await runSql('select version from supabase_migrations.schema_migrations', 'list')).map(
    (r) => r.version,
  ),
)

for (const file of files) {
  const version = file.split('_')[0]
  const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '')
  if (applied.has(version)) {
    console.log(`skip  ${file} (already applied)`)
    continue
  }
  const sql = readFileSync(join(dir, file), 'utf8')
  await runSql(sql, file)
  await runSql(
    `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}')`,
    `record ${file}`,
  )
  console.log(`apply ${file}`)
}
console.log('Migrations up to date.')
