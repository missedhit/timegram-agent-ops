/**
 * Ingest endpoint: agents (or the platforms running them) report completed
 * work here. Validates against the metadata-only contract and inserts a task
 * row via the service role. Deployed with --no-verify-jwt; auth is the
 * x-api-key header checked against the INGEST_API_KEY function secret.
 */

import { validateIngestEvent } from './contract.ts'

// Deno global exists in the edge runtime; this file is excluded from tsc/vitest.
declare const Deno: { env: { get(name: string): string | undefined }; serve: (h: (req: Request) => Promise<Response> | Response) => void }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const apiKey = Deno.env.get('INGEST_API_KEY')
  if (!apiKey || req.headers.get('x-api-key') !== apiKey) {
    return json(401, { error: 'invalid or missing x-api-key' })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json(400, { error: 'body must be valid JSON' })
  }

  const result = validateIngestEvent(payload)
  if (!result.ok) return json(422, { errors: result.errors })

  const orgId = Deno.env.get('INGEST_ORG_ID')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!orgId || !supabaseUrl || !serviceKey) {
    return json(500, { error: 'function is missing configuration' })
  }

  const event = result.event
  const id = `task-ing-${crypto.randomUUID().slice(0, 8)}`
  const row = {
    org_id: orgId,
    id,
    agent_id: event.agent_id,
    // Store the normalized instant the validator blessed, never the raw string.
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

  const res = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  })

  if (!res.ok) {
    const detail = await res.text()
    // Unknown agent_id trips the FK constraint — surface it usefully.
    if (detail.includes('23503')) {
      return json(422, { errors: [`"agent_id": no agent "${event.agent_id}" is registered`] })
    }
    return json(502, { error: `insert failed: ${detail.slice(0, 200)}` })
  }

  return json(201, { id, accepted: true })
})
