/**
 * Platform-admin endpoint — the server side of the /admin dashboard. The
 * browser never writes to the database: every org-lifecycle operation lands
 * here, runs under the service role, and is allowed only for callers with a
 * row in platform_admins.
 *
 * Routes (JSON; GET/POST; authenticated by the caller's session JWT):
 *   GET  /admin/orgs                  — org list + per-org counts + key metadata
 *   POST /admin/orgs                  — full onboarding (org, policies, owner
 *                                       user, membership, key, handout) — the
 *                                       raw key and handout appear ONCE in the
 *                                       response and are never logged
 *   POST /admin/orgs/:id/keys        — issue a key (raw value once)
 *   POST /admin/keys/:id/revoke      — revoke (zero rows matched = 404)
 *   POST /admin/orgs/:id/delete      — body {confirm_name} must equal the org
 *                                       name; "Northbridge Mutual" is always
 *                                       refused (CLI --force is the only path)
 *   GET  /admin/orgs/:id/export      — all tables as one JSON object
 *
 * SECURITY BOUNDARY: platform verify_jwt only proves the caller holds *some*
 * valid project JWT (the public anon key passes it too). The real gate is in
 * code: resolve the user via GoTrue with THEIR token, then require a
 * platform_admins row via the service role. CSRF is structurally absent —
 * auth is a bearer header, never a cookie. CORS allows exactly the production
 * app and localhost dev (Cloudflare preview URLs fail CORS by design).
 *
 * Deployed WITH JWT verification: npx supabase functions deploy admin
 */

import { isUuid, validateCreateOrg, validateDeleteOrg, validateIssueKey } from './admin-contract.ts'
import { handoutMarkdown } from './handout.ts'
import { STARTER_POLICIES } from './starter-policies.ts'

// Deno global exists in the edge runtime; this file is excluded from tsc/vitest.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve: (h: (req: Request) => Promise<Response> | Response) => void
}

const APP_URL = 'https://agentworkforce.timegram.io'
const PROTECTED_ORG = 'Northbridge Mutual'
const ALLOWED_ORIGINS = new Set([APP_URL, 'http://localhost:5173'])

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = () => Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  if (!ALLOWED_ORIGINS.has(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  }
}

function rest(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

function authAdmin(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${supabaseUrl()}/auth/v1/admin/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const randomKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `tgk_live_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

/** Today's calendar date in the org's business timezone ('YYYY-MM-DD'). */
const orgToday = (timezone: string) =>
  new Date().toLocaleDateString('en-CA', { timeZone: timezone })

/**
 * Row count without fetching rows (PostgREST exact count via Content-Range).
 * null = the count could not be determined (non-2xx / missing header): callers
 * must NOT treat that as zero — a transient failure here otherwise flags an
 * in-use account as an orphan or understates a deletion inventory.
 */
async function countRows(filter: string): Promise<number | null> {
  const res = await rest(filter, { method: 'HEAD', headers: { Prefer: 'count=exact' } })
  if (!res.ok) return null
  const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
  return Number.isFinite(total) ? total : null
}

// ---------------------------------------------------------------------------
// Caller identity — the actual security boundary
// ---------------------------------------------------------------------------

interface Caller {
  userId: string
  email: string
}

/** Resolve the calling user from THEIR bearer token; null = not signed in. */
async function resolveCaller(req: Request): Promise<Caller | null> {
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token) return null
  const res = await fetch(`${supabaseUrl()}/auth/v1/user`, {
    headers: { apikey: anonKey(), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const user = (await res.json()) as { id?: string; email?: string }
  if (!user.id) return null
  return { userId: user.id, email: user.email ?? '' }
}

async function isPlatformAdmin(userId: string): Promise<boolean> {
  if (!isUuid(userId)) return false
  const res = await rest(`platform_admins?select=user_id&user_id=eq.${userId}&limit=1`)
  if (!res.ok) return false
  return ((await res.json()) as unknown[]).length > 0
}

// ---------------------------------------------------------------------------
// Org lookups shared by several routes
// ---------------------------------------------------------------------------

interface OrgRow {
  id: string
  name: string
  timezone: string
  created_at: string
}

/** Throws on a transient lookup failure so callers 502 rather than reporting a
 *  false 404 "no such org" for an org that exists. null = genuinely absent. */
async function getOrg(orgId: string): Promise<OrgRow | null> {
  const res = await rest(`orgs?select=id,name,timezone,created_at&id=eq.${orgId}&limit=1`)
  if (!res.ok) throw new Error(`org lookup failed: ${(await res.text()).slice(0, 200)}`)
  const rows = (await res.json()) as OrgRow[]
  return rows[0] ?? null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function listOrgs(): Promise<{ status: number; body: unknown }> {
  const orgsRes = await rest('orgs?select=id,name,timezone,created_at&order=created_at')
  if (!orgsRes.ok) return { status: 502, body: { error: 'failed to list orgs' } }
  const orgs = (await orgsRes.json()) as OrgRow[]

  const keysRes = await rest('api_keys?select=id,org_id,label,created_at,revoked_at&order=created_at')
  const keys = keysRes.ok
    ? ((await keysRes.json()) as Array<{
        id: string
        org_id: string
        label: string
        created_at: string
        revoked_at: string | null
      }>)
    : []

  const rows = await Promise.all(
    orgs.map(async (org) => {
      const [members, agents, tasks] = await Promise.all([
        countRows(`org_members?org_id=eq.${org.id}`),
        countRows(`agents?org_id=eq.${org.id}`),
        countRows(`tasks?org_id=eq.${org.id}`),
      ])
      return {
        ...org,
        protected: org.name === PROTECTED_ORG,
        // Display counts only — a transient blip showing 0 in the refreshable
        // list is harmless (unlike the deletion inventory / orphan check).
        counts: { members: members ?? 0, agents: agents ?? 0, tasks: tasks ?? 0 },
        keys: keys
          .filter((k) => k.org_id === org.id)
          .map(({ id, label, created_at, revoked_at }) => ({ id, label, created_at, revoked_at })),
      }
    }),
  )
  return { status: 200, body: { orgs: rows } }
}

async function createOrg(payload: unknown, caller: Caller): Promise<{ status: number; body: unknown }> {
  const result = validateCreateOrg(payload)
  if (!result.ok) return { status: 422, body: { errors: result.errors } }
  const { name, owner_email, timezone } = result.request

  const dupRes = await rest(`orgs?select=id&name=eq.${encodeURIComponent(name)}&limit=1`)
  if (!dupRes.ok) return { status: 502, body: { error: 'duplicate check failed' } }
  if (((await dupRes.json()) as unknown[]).length > 0) {
    return { status: 409, body: { error: `An organization named "${name}" already exists.` } }
  }

  const orgId = crypto.randomUUID()
  const orgRes = await rest('orgs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: orgId, name, timezone }),
  })
  if (!orgRes.ok) {
    return { status: 502, body: { error: `org insert failed: ${(await orgRes.text()).slice(0, 200)}` } }
  }

  // Everything after the org row compensates on failure: delete the org
  // (cascade cleans partial state) so a retry with the same name works.
  const fail = async (step: string, detail: string) => {
    await rest(`orgs?id=eq.${orgId}`, { method: 'DELETE' }).catch(() => undefined)
    console.log(`[admin] create-org FAILED at ${step} org=${orgId} by=${caller.userId}`)
    return {
      status: 502,
      body: {
        error: `${step} failed: ${detail.slice(0, 200)} — the partial org was rolled back`,
        org_id: orgId,
      },
    }
  }

  const policiesRes = await rest('policies', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(
      STARTER_POLICIES.map((p) => ({
        org_id: orgId,
        id: p.id,
        name: p.name,
        rule: p.rule,
        enforcement: p.enforcement,
        // The org's business day, not the UTC day — an evening onboarding
        // must not stamp policies with a date in the org's future.
        created_at: orgToday(timezone),
        sort_order: p.sort_order,
      })),
    ),
  })
  if (!policiesRes.ok) return fail('starter policies', await policiesRes.text())

  // Owner auth user — paged lookup (50/page default would miss owners past
  // page 1 and make createUser 422 mid-onboarding), created when missing.
  let ownerId: string | null = null
  let ownerNote = 'existing auth user'
  for (let page = 1; ownerId === null; page++) {
    const usersRes = await authAdmin(`users?page=${page}&per_page=1000`)
    if (!usersRes.ok) return fail('owner lookup', await usersRes.text())
    const batch = (await usersRes.json()) as { users: Array<{ id: string; email?: string }> }
    ownerId = batch.users.find((u) => u.email?.toLowerCase() === owner_email)?.id ?? null
    if (batch.users.length < 1000) break
  }
  if (ownerId === null) {
    const createRes = await authAdmin('users', {
      method: 'POST',
      body: JSON.stringify({ email: owner_email, email_confirm: true }),
    })
    if (!createRes.ok) return fail('owner creation', await createRes.text())
    ownerId = ((await createRes.json()) as { id: string }).id
    ownerNote = 'auth user created'
  }

  const memberRes = await rest('org_members', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ org_id: orgId, user_id: ownerId, role: 'owner' }),
  })
  if (!memberRes.ok) return fail('owner membership', await memberRes.text())

  const rawKey = randomKey()
  const keyRes = await rest('api_keys', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ org_id: orgId, key_hash: await sha256Hex(rawKey), label: 'onboarding' }),
  })
  if (!keyRes.ok) return fail('key issuance', await keyRes.text())
  const keyId = ((await keyRes.json()) as Array<{ id: string }>)[0]?.id

  const ingestUrl = `${supabaseUrl()}/functions/v1/ingest`
  const mcpUrl = `${supabaseUrl()}/functions/v1/mcp`
  console.log(`[admin] create-org org=${orgId} name="${name}" owner=${owner_email} by=${caller.userId}`)
  return {
    status: 201,
    body: {
      org: { id: orgId, name, timezone },
      owner_email,
      owner_note: ownerNote,
      raw_key: rawKey,
      key_id: keyId,
      handout_markdown: handoutMarkdown({ orgName: name, appUrl: APP_URL, ingestUrl, mcpUrl, rawKey }),
    },
  }
}

async function issueKey(orgId: string, payload: unknown, caller: Caller) {
  const result = validateIssueKey(payload)
  if (!result.ok) return { status: 422, body: { errors: result.errors } }
  const org = await getOrg(orgId)
  if (!org) return { status: 404, body: { error: 'no such organization' } }

  const rawKey = randomKey()
  const res = await rest('api_keys', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      org_id: orgId,
      key_hash: await sha256Hex(rawKey),
      label: result.request.label,
    }),
  })
  if (!res.ok) return { status: 502, body: { error: `key insert failed: ${(await res.text()).slice(0, 200)}` } }
  const keyId = ((await res.json()) as Array<{ id: string }>)[0]?.id
  console.log(`[admin] issue-key org=${orgId} key=${keyId} label="${result.request.label}" by=${caller.userId}`)
  return { status: 201, body: { raw_key: rawKey, key_id: keyId, label: result.request.label } }
}

async function revokeKey(keyId: string, caller: Caller) {
  // Zero rows matched must be an error, never a false "revoked" message
  // during a leaked-key incident (same guard as the CLI).
  const res = await rest(`api_keys?id=eq.${keyId}&revoked_at=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  })
  if (!res.ok) return { status: 502, body: { error: `revoke failed: ${(await res.text()).slice(0, 200)}` } }
  const rows = (await res.json()) as Array<{ id: string; org_id: string }>
  if (rows.length === 0) {
    return { status: 404, body: { error: 'no active key with that id — nothing revoked' } }
  }
  console.log(`[admin] revoke-key key=${keyId} org=${rows[0].org_id} by=${caller.userId}`)
  return { status: 200, body: { revoked: true, key_id: keyId } }
}

const INVENTORY_TABLES = [
  'org_members',
  'agents',
  'policies',
  'tasks',
  'deviations',
  'approvals',
  'api_keys',
] as const

async function deleteOrg(orgId: string, payload: unknown, caller: Caller) {
  const org = await getOrg(orgId)
  if (!org) return { status: 404, body: { error: 'no such organization' } }
  if (org.name === PROTECTED_ORG) {
    return {
      status: 403,
      body: { error: `"${PROTECTED_ORG}" is the live foundation org — it cannot be deleted from the dashboard.` },
    }
  }
  const result = validateDeleteOrg(payload)
  if (!result.ok) return { status: 422, body: { errors: result.errors } }
  if (result.request.confirm_name !== org.name) {
    return {
      status: 422,
      body: { error: `confirmation does not match — type the organization name exactly: ${org.name}` },
    }
  }

  // null (unknown) is preserved, not coerced to 0 — this is the only record
  // of what was destroyed on the backup-less Free tier.
  const inventory: Record<string, number | null> = {}
  for (const table of INVENTORY_TABLES) {
    inventory[table] = await countRows(`${table}?org_id=eq.${orgId}`)
  }
  const membersRes = await rest(`org_members?select=user_id&org_id=eq.${orgId}`)
  const members = membersRes.ok ? ((await membersRes.json()) as Array<{ user_id: string }>) : []

  const delRes = await rest(`orgs?id=eq.${orgId}`, { method: 'DELETE' })
  if (!delRes.ok) return { status: 502, body: { error: `delete failed: ${(await delRes.text()).slice(0, 200)}` } }

  const orphaned: string[] = []
  for (const m of members) {
    if (!isUuid(m.user_id)) continue
    if ((await countRows(`org_members?user_id=eq.${m.user_id}`)) === 0) {
      const userRes = await authAdmin(`users/${m.user_id}`)
      if (userRes.ok) {
        const user = (await userRes.json()) as { email?: string }
        orphaned.push(user.email ?? m.user_id)
      }
    }
  }

  console.log(`[admin] delete-org org=${orgId} name="${org.name}" by=${caller.userId}`)
  return {
    status: 200,
    body: { deleted: true, org: { id: org.id, name: org.name }, inventory, orphaned_users: orphaned },
  }
}

// Deterministic order per table — unordered range pagination can duplicate
// or drop rows across page boundaries (same rule as the CLI exporter).
const EXPORT_TABLES: ReadonlyArray<{ name: string; order: string }> = [
  { name: 'org_members', order: 'user_id' },
  { name: 'agents', order: 'id' },
  { name: 'agent_versions', order: 'agent_id,version' },
  { name: 'policies', order: 'id' },
  { name: 'agent_policies', order: 'agent_id,policy_id' },
  { name: 'tasks', order: 'id' },
  { name: 'deviations', order: 'id' },
  { name: 'approvals', order: 'id' },
  { name: 'api_keys', order: 'id' },
]

async function exportOrg(orgId: string) {
  const org = await getOrg(orgId)
  if (!org) return { status: 404, body: { error: 'no such organization' } }

  const PAGE = 1000
  const dump: Record<string, unknown[]> = { orgs: [org] }
  for (const table of EXPORT_TABLES) {
    const rows: unknown[] = []
    for (let offset = 0; ; offset += PAGE) {
      const res = await rest(
        `${table.name}?select=*&org_id=eq.${orgId}&order=${table.order}&limit=${PAGE}&offset=${offset}`,
      )
      if (!res.ok) return { status: 502, body: { error: `export of ${table.name} failed` } }
      const batch = (await res.json()) as unknown[]
      rows.push(...batch)
      if (batch.length < PAGE) break
    }
    dump[table.name] = rows
  }
  return { status: 200, body: dump }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = corsFor(req)
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...cors },
    })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'GET or POST only' })

  const caller = await resolveCaller(req)
  if (!caller) return json(401, { error: 'sign in required' })
  if (!(await isPlatformAdmin(caller.userId))) {
    console.log(`[admin] DENIED user=${caller.userId} (${caller.email})`)
    return json(403, { error: 'not a platform admin' })
  }

  let payload: unknown = undefined
  if (req.method === 'POST') {
    try {
      payload = await req.json()
    } catch {
      return json(400, { error: 'body must be valid JSON' })
    }
  }

  const path = new URL(req.url).pathname.replace(/\/+$/, '')
  const sub = path.slice(path.indexOf('/admin') + '/admin'.length) || '/orgs'

  const route = async (): Promise<{ status: number; body: unknown }> => {
    if (sub === '/orgs') {
      if (req.method === 'GET') return listOrgs()
      return createOrg(payload, caller)
    }
    let m = sub.match(/^\/orgs\/([^/]+)\/keys$/)
    if (m && req.method === 'POST') {
      if (!isUuid(m[1])) return { status: 404, body: { error: 'invalid org id' } }
      return issueKey(m[1], payload, caller)
    }
    m = sub.match(/^\/keys\/([^/]+)\/revoke$/)
    if (m && req.method === 'POST') {
      if (!isUuid(m[1])) return { status: 404, body: { error: 'invalid key id' } }
      return revokeKey(m[1], caller)
    }
    m = sub.match(/^\/orgs\/([^/]+)\/delete$/)
    if (m && req.method === 'POST') {
      if (!isUuid(m[1])) return { status: 404, body: { error: 'invalid org id' } }
      return deleteOrg(m[1], payload, caller)
    }
    m = sub.match(/^\/orgs\/([^/]+)\/export$/)
    if (m && req.method === 'GET') {
      if (!isUuid(m[1])) return { status: 404, body: { error: 'invalid org id' } }
      return exportOrg(m[1])
    }
    return {
      status: 404,
      body: { error: 'unknown route — GET/POST /admin/orgs, POST /admin/orgs/:id/keys, POST /admin/keys/:id/revoke, POST /admin/orgs/:id/delete, GET /admin/orgs/:id/export' },
    }
  }

  try {
    const { status, body } = await route()
    return json(status, body)
  } catch (err) {
    // A transient lookup failure (e.g. getOrg) must surface as retry-me, not
    // a false 404 or a naked 500.
    console.log(`[admin] ERROR sub=${sub} by=${caller.userId}: ${err instanceof Error ? err.message : String(err)}`)
    return json(502, { error: 'a database lookup failed — please retry' })
  }
})
