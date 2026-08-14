/**
 * Multi-tenant ingest endpoint. Agents (or the platforms running them) report
 * work here; org identity comes ONLY from the API key.
 *
 * Routes (all POST, authenticated by x-api-key):
 *   /ingest            — task event (contract.ts)
 *   /ingest/register   — agent registration/enrichment upsert (register-contract.ts)
 *   /ingest/deviation  — policy deviation, arrives 'open' (deviation-contract.ts)
 *
 * Keys are stored as SHA-256 hashes (api_keys table); lookup is by unique
 * digest equality, so no secret-dependent string comparison happens in JS and
 * the raw key never touches the database. A task or deviation naming an
 * unknown agent auto-registers a minimal agent first — a prospect's first
 * event must never bounce. Deployed with --no-verify-jwt.
 */

import { validateIngestEvent } from './contract.ts'
import { validateRegisterEvent, type RegisterEvent } from './register-contract.ts'
import { validateDeviationEvent } from './deviation-contract.ts'

// Deno global exists in the edge runtime; this file is excluded from tsc/vitest.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve: (h: (req: Request) => Promise<Response> | Response) => void
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Resolve the org for a raw API key; null = invalid/revoked. */
async function resolveOrg(rawKey: string | null): Promise<string | null> {
  if (!rawKey || !rawKey.startsWith('tgk_')) return null
  const hash = await sha256Hex(rawKey)
  const res = await rest(`api_keys?select=org_id&key_hash=eq.${hash}&revoked_at=is.null&limit=1`)
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ org_id: string }>
  return rows[0]?.org_id ?? null
}

/** Minimal agent row for auto-registration; enrichable via /register later. */
function minimalAgentRow(orgId: string, agentId: string) {
  return {
    org_id: orgId,
    id: agentId,
    name: agentId,
    purpose: 'Auto-registered from first report — enrich via /ingest/register',
    owner_name: 'Unassigned',
    owner_department: 'Unassigned',
    department: 'Unassigned',
    status: 'active',
    model: 'Unknown',
    model_provider: 'Unknown',
    tools: [],
    data_domains: [],
    permissions: [],
    risk_level: 'medium',
    version: 'v1',
    deployed_at: new Date().toISOString().slice(0, 10),
    monthly_budget_usd: 0,
    unit_label: 'task',
    human_baseline_usd_per_unit: 0,
    // Sorts after every curated agent so auto-registrations are visible but
    // never displace a configured registry.
    sort_order: 1000000,
  }
}

async function insertAutoAgent(orgId: string, agentId: string): Promise<boolean> {
  const res = await rest('agents?on_conflict=org_id,id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(minimalAgentRow(orgId, agentId)),
  })
  return res.ok
}

/** Insert with one auto-registration retry when the agent FK is the failure. */
async function insertWithAutoRegister(
  table: 'tasks' | 'deviations',
  orgId: string,
  agentId: string,
  row: Record<string, unknown>,
): Promise<{ ok: true; autoRegistered: boolean } | { ok: false; status: number; body: unknown }> {
  let autoRegistered = false
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await rest(table, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    })
    if (res.ok) return { ok: true, autoRegistered }
    const detail = await res.text()

    const agentFkFailure = detail.includes('23503') && detail.includes('agent')
    if (agentFkFailure && attempt === 0) {
      if (await insertAutoAgent(orgId, agentId)) {
        autoRegistered = true
        continue
      }
    }
    if (detail.includes('23503') && detail.includes('polic')) {
      return {
        ok: false,
        status: 422,
        body: { errors: [`"policy_id": no policy "${row.policy_id}" exists in this workspace`] },
      }
    }
    return { ok: false, status: 502, body: { error: `insert failed: ${detail.slice(0, 200)}` } }
  }
  return { ok: false, status: 502, body: { error: 'insert failed after auto-registration' } }
}

const randomId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

async function handleTask(orgId: string, payload: unknown): Promise<Response> {
  const result = validateIngestEvent(payload)
  if (!result.ok) return json(422, { errors: result.errors })
  const event = result.event

  const id = randomId('task-ing')
  const row = {
    org_id: orgId,
    id,
    agent_id: event.agent_id,
    timestamp: new Date(event.timestamp ?? Date.now()).toISOString(),
    description: event.description,
    business_process: event.business_process,
    cost_center: event.cost_center,
    outcome: event.outcome,
    duration_sec: event.duration_sec,
    cost_usd: event.cost_usd,
    units: event.units,
    tokens: event.tokens ?? 0,
  }
  const insert = await insertWithAutoRegister('tasks', orgId, event.agent_id, row)
  if (!insert.ok) return json(insert.status, insert.body)
  return json(201, {
    id,
    accepted: true,
    ...(insert.autoRegistered ? { auto_registered_agent: true } : {}),
  })
}

async function handleRegister(orgId: string, payload: unknown): Promise<Response> {
  const result = validateRegisterEvent(payload)
  if (!result.ok) return json(422, { errors: result.errors })
  const event = result.event

  const existingRes = await rest(
    `agents?select=id&org_id=eq.${orgId}&id=eq.${encodeURIComponent(event.agent_id)}&limit=1`,
  )
  const existing = existingRes.ok ? ((await existingRes.json()) as unknown[]) : []
  const isNew = existing.length === 0

  // Merge provided fields over the minimal defaults (new) or existing row
  // (enrichment) — PostgREST upsert with merge-duplicates patches columns.
  const updates: Record<string, unknown> = { name: event.name }
  const fieldMap: Array<[keyof RegisterEvent, string]> = [
    ['department', 'department'],
    ['purpose', 'purpose'],
    ['owner_name', 'owner_name'],
    ['model', 'model'],
    ['model_provider', 'model_provider'],
    ['unit_label', 'unit_label'],
    ['monthly_budget_usd', 'monthly_budget_usd'],
    ['human_baseline_usd_per_unit', 'human_baseline_usd_per_unit'],
  ]
  for (const [from, to] of fieldMap) {
    if (event[from] !== undefined) updates[to] = event[from]
  }

  // New agents insert a complete row (every NOT NULL column present);
  // existing agents get a partial PATCH of only the provided fields.
  const res = isNew
    ? await rest('agents?on_conflict=org_id,id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...minimalAgentRow(orgId, event.agent_id), ...updates }),
      })
    : await rest(`agents?org_id=eq.${orgId}&id=eq.${encodeURIComponent(event.agent_id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(updates),
      })
  if (!res.ok) {
    const detail = await res.text()
    return json(502, { error: `register failed: ${detail.slice(0, 200)}` })
  }
  return json(isNew ? 201 : 200, { agent_id: event.agent_id, [isNew ? 'created' : 'updated']: true })
}

async function handleDeviation(orgId: string, payload: unknown): Promise<Response> {
  const result = validateDeviationEvent(payload)
  if (!result.ok) return json(422, { errors: result.errors })
  const event = result.event

  const id = randomId('dev-ing')
  const row = {
    org_id: orgId,
    id,
    agent_id: event.agent_id,
    policy_id: event.policy_id,
    timestamp: new Date(event.timestamp ?? Date.now()).toISOString(),
    description: event.description,
    status: 'open',
  }
  const insert = await insertWithAutoRegister('deviations', orgId, event.agent_id, row)
  if (!insert.ok) return json(insert.status, insert.body)
  return json(201, {
    id,
    accepted: true,
    ...(insert.autoRegistered ? { auto_registered_agent: true } : {}),
  })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const orgId = await resolveOrg(req.headers.get('x-api-key'))
  if (!orgId) return json(401, { error: 'invalid or missing x-api-key' })

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'body must be valid JSON' })
  }

  const path = new URL(req.url).pathname.replace(/\/+$/, '')
  if (path.endsWith('/ingest')) return handleTask(orgId, payload)
  if (path.endsWith('/ingest/register')) return handleRegister(orgId, payload)
  if (path.endsWith('/ingest/deviation')) return handleDeviation(orgId, payload)
  return json(404, { error: 'unknown route — POST /ingest, /ingest/register, or /ingest/deviation' })
})
