/**
 * Issue, list, and revoke per-organization ingest API keys.
 *
 *   npm run org:key -- --org "Acme Test" --issue [--label production]
 *   npm run org:key -- --org "Acme Test" --list
 *   npm run org:key -- --org "Acme Test" --revoke <key-id>
 *
 * Keys are shown exactly once at issuance; only the SHA-256 hash is stored.
 */

import { createHash, randomBytes } from 'node:crypto'
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
if (!orgRef) {
  console.error('Usage: npm run org:key -- --org <name|uuid> (--issue [--label x] | --list | --revoke <key-id>)')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveOrg(): Promise<{ id: string; name: string }> {
  const query = supabase.from('orgs').select('id, name')
  const { data, error } = UUID_RE.test(orgRef!)
    ? await query.eq('id', orgRef!)
    : await query.eq('name', orgRef!)
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    console.error(`No organization matching "${orgRef}".`)
    process.exit(1)
  }
  return data[0]
}

async function main() {
  const org = await resolveOrg()

  if (flag('issue')) {
    const raw = `tgk_live_${randomBytes(32).toString('hex')}`
    const keyHash = createHash('sha256').update(raw).digest('hex')
    const label = option('label') ?? 'default'
    const { data, error } = await supabase
      .from('api_keys')
      .insert({ org_id: org.id, key_hash: keyHash, label })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    console.log(`Issued API key for "${org.name}" (label: ${label}, key id: ${data.id})`)
    console.log()
    console.log(`  ${raw}`)
    console.log()
    console.log('Shown once — store it in the prospect handout / their secret manager.')
    return
  }

  if (flag('list')) {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, label, created_at, revoked_at')
      .eq('org_id', org.id)
      .order('created_at')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      console.log(`No keys for "${org.name}".`)
      return
    }
    for (const k of data) {
      console.log(
        `${k.id}  ${k.label.padEnd(12)}  created ${k.created_at.slice(0, 10)}  ${
          k.revoked_at ? `REVOKED ${k.revoked_at.slice(0, 10)}` : 'active'
        }`,
      )
    }
    return
  }

  const revokeId = option('revoke')
  if (revokeId) {
    // .select() forces the affected rows back — a zero-row match must be an
    // error, never a false "revoked" message during a leaked-key incident.
    const { data, error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('org_id', org.id)
      .eq('id', revokeId)
      .is('revoked_at', null)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      console.error(
        `No active key ${revokeId} in "${org.name}" — nothing revoked. Check the id with --list.`,
      )
      process.exit(1)
    }
    console.log(`Revoked key ${revokeId} for "${org.name}". Takes effect immediately.`)
    return
  }

  console.error('Pick one of --issue, --list, --revoke <key-id>.')
  process.exit(1)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
