/**
 * Onboard a prospect organization end to end (M5 full version):
 *
 *   org row (duplicate-name refusal) → 5 starter policies → owner auth user
 *   (created if missing — works with public signups disabled) → owner
 *   membership → ingest API key → handouts/CONNECT-<slug>.md
 *
 *   npm run org:create -- --name "Acme Corp" --owner-email jane@acme.com
 *                          [--timezone America/Chicago]
 *
 * The handout (git-ignored — it contains the raw API key) is everything the
 * prospect needs: app URL, ingest URL, key, TS/Python/curl snippets. Total
 * runtime is a few seconds; see docs/poc-runbook.md for the full 10-minute
 * onboarding flow around it.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { STARTER_POLICIES } from './data/starter-policies'
// @ts-expect-error plain-JS helper without type declarations
import { loadEnvLocal } from './env.mjs'

const APP_URL = 'https://agentworkforce.timegram.io'

const env = loadEnvLocal() as Record<string, string>
const url = env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const ingestUrl = `${url.replace(/\/+$/, '')}/functions/v1/ingest`

const option = (name: string) => {
  const idx = process.argv.indexOf(`--${name}`)
  const value = idx >= 0 ? process.argv[idx + 1] : undefined
  return value?.startsWith('--') ? undefined : value
}

const name = option('name')
const ownerEmail = option('owner-email')
const timezone = option('timezone') ?? 'America/New_York'
if (!name || !ownerEmail) {
  console.error(
    'Usage: npm run org:create -- --name "Acme Corp" --owner-email jane@acme.com [--timezone America/Chicago]',
  )
  process.exit(1)
}
if (!Intl.supportedValuesOf('timeZone').includes(timezone)) {
  console.error(`"${timezone}" is not a valid IANA timezone (e.g. America/New_York).`)
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const slug = name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

function handoutMarkdown(rawKey: string): string {
  return `# Connect your agents — ${name}

Welcome to Timegram Agent Ops. This page has everything needed to see your
own agents in your workspace. Nothing here touches your models or prompts:
the platform records **what agents did — never what they said**. The reporting
contract structurally cannot carry prompts, outputs, or customer content
(such fields are rejected client-side and server-side by name).

## Your workspace

- **App**: ${APP_URL} — sign in with your work email (magic link, no password)
- **Ingest endpoint**: \`${ingestUrl}\`
- **API key** (keep secret — treat like a password):

\`\`\`
${rawKey}
\`\`\`

If the key is ever exposed, tell us — revocation is immediate and a new key
takes seconds.

## Report your first task (60 seconds, curl)

\`\`\`bash
curl -X POST '${ingestUrl}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-api-key: ${rawKey}' \\
  -d '{
    "agent_id": "my-first-agent",
    "description": "Processed 12 invoices from the morning batch",
    "business_process": "Accounts payable",
    "cost_center": "Finance",
    "outcome": "completed",
    "duration_sec": 95,
    "cost_usd": 0.31,
    "units": 12
  }'
\`\`\`

Unknown agents are auto-registered on first report, so this works
immediately — open the Work Log in the app and it is already there. Enrich
the agent (name, owner, budget) any time via \`/register\`.

## Python (any stack, no dependencies)

Copy \`timegram_reporter.py\` — the single-file SDK attached to the same
email as this page (stdlib only, Python 3.9+) — next to your agent:

\`\`\`python
from timegram_reporter import TimegramReporter

timegram = TimegramReporter(
    ingest_url="${ingestUrl}",
    api_key="${rawKey}",
    agent_id="my-first-agent",
    defaults={"business_process": "Accounts payable", "cost_center": "Finance"},
)

with timegram.track(description="Processing morning invoice batch", cost_usd=0.31, units=12) as work:
    result = run_my_agent()          # your existing code, unchanged
    work.update(units=result.count)  # enrich from the result
\`\`\`

## TypeScript / JavaScript

The TS SDK lives in the \`connector/\` folder of our repo and imports shared
contract modules, so it is used from a clone rather than a single copied
file — ask us for repo access (or a bundled build) and import it in place:

\`\`\`ts
import { TimegramReporter } from '<repo>/connector/src'

const timegram = new TimegramReporter({
  ingestUrl: '${ingestUrl}',
  apiKey: '${rawKey}',
  agentId: 'my-first-agent',
  defaults: { business_process: 'Accounts payable', cost_center: 'Finance' },
})

await timegram.report({
  description: 'Processed 12 invoices from the morning batch',
  outcome: 'completed',
  duration_sec: 95,
  cost_usd: 0.31,
  units: 12,
})
\`\`\`

## What gets recorded

Task metadata only: a one-line business description, outcome
(completed / escalated / failed), duration, cost, units of work, optional
tokens. Policy deviations (via \`/deviation\`) carry the same discipline — a
business-language description of what was departed from, never the content
that triggered it. Your Policies screen starts with five standard policies
you can react against on day one.

Questions or a key rotation: reply to the email this came with.
`
}

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

  // 1. Org row
  const orgId = randomUUID()
  const { error: orgError } = await supabase.from('orgs').insert({ id: orgId, name, timezone })
  if (orgError) throw new Error(`orgs: ${orgError.message}`)

  // 2. Starter policies — the Policies screen is never empty, and the
  // deviation flow has real targets from the first minute. created_at is
  // "today" in the ORG's timezone (an evening onboarding must not stamp
  // policies with a date in the org's future — same rule as deployed_at).
  const today = new Date().toLocaleDateString('en-CA', { timeZone: timezone })
  const { error: policiesError } = await supabase.from('policies').insert(
    STARTER_POLICIES.map((p) => ({
      org_id: orgId,
      id: p.id,
      name: p.name,
      rule: p.rule,
      enforcement: p.enforcement,
      created_at: today,
      sort_order: p.sort_order,
    })),
  )
  if (policiesError) throw new Error(`policies: ${policiesError.message}`)

  // 3. Owner auth user — created if missing. email_confirm:true works with
  // public signups disabled, and their daily login stays the ordinary
  // magic-link flow. listUsers is paged (50/page default) — page through
  // all of them or an existing owner beyond page 1 looks missing and
  // createUser 422s mid-onboarding.
  let user
  for (let page = 1; !user; page++) {
    const { data: batch, error: usersError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (usersError) throw new Error(`listUsers: ${usersError.message}`)
    user = batch.users.find((u) => u.email?.toLowerCase() === ownerEmail.toLowerCase())
    if (batch.users.length < 1000) break
  }
  let userNote = 'existing auth user'
  if (!user) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: ownerEmail,
      email_confirm: true,
    })
    if (createError) throw new Error(`createUser: ${createError.message}`)
    user = created.user
    userNote = 'auth user created'
  }

  // 4. Owner membership
  const { error: memberError } = await supabase
    .from('org_members')
    .insert({ org_id: orgId, user_id: user.id, role: 'owner' })
  if (memberError) throw new Error(`org_members: ${memberError.message}`)

  // 5. Ingest API key — raw value exists only in the handout.
  const rawKey = `tgk_live_${randomBytes(32).toString('hex')}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')
  const { error: keyError } = await supabase
    .from('api_keys')
    .insert({ org_id: orgId, key_hash: keyHash, label: 'onboarding' })
  if (keyError) throw new Error(`api_keys: ${keyError.message}`)

  // 6. Handout (git-ignored — it contains the raw key)
  const handoutDir = fileURLToPath(new URL('../handouts', import.meta.url))
  mkdirSync(handoutDir, { recursive: true })
  const handoutPath = `${handoutDir}/CONNECT-${slug}.md`
  writeFileSync(handoutPath, handoutMarkdown(rawKey), 'utf-8')

  console.log(`Created organization "${name}"`)
  console.log(`  org id   : ${orgId}`)
  console.log(`  timezone : ${timezone}`)
  console.log(`  owner    : ${ownerEmail} (${userNote})`)
  console.log(`  policies : ${STARTER_POLICIES.length} starter policies`)
  console.log(`  API key  : issued (label "onboarding") — raw key is in the handout only`)
  console.log(`  handout  : handouts/CONNECT-${slug}.md`)
  console.log()
  console.log('Next: send the handout to the prospect; they sign in at')
  console.log(`${APP_URL} with ${ownerEmail} and run the curl or Python snippet.`)
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
