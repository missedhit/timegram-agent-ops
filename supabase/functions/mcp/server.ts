/**
 * Remote MCP quick-connect surface — JSON-RPC 2.0 over Streamable HTTP in
 * stateless JSON mode. Prospects point any MCP-capable agent (Claude Code,
 * Cursor, VS Code, Windsurf, OpenAI Agents SDK) at this endpoint with their
 * workspace API key and report work without integration code.
 *
 * Design rules:
 *  - MCP is the quick-connect/demo path; the SDKs remain the canonical
 *    production telemetry path (model-discretionary self-reporting is not
 *    audit-grade). Every tool description says so.
 *  - Zero imports and full dependency injection, so the same module runs in
 *    the Deno edge runtime AND under vitest — the contract.ts pattern.
 *  - Stateless and JSON-only: no sessions, no SSE (a held-open stream burns
 *    the isolate against the platform's idle timeout), 405 on GET/DELETE —
 *    spec-blessed in every protocol revision.
 *  - Lenient where real clients are broken: the Accept header is never
 *    inspected (Claude Code sends only application/json — claude-code#45368),
 *    and MCP-Protocol-Version / Mcp-* headers are tolerated and ignored.
 *  - The three write tools validate with the SHARED ingest validators, then
 *    forward the normalized event to the ingest function with the caller's
 *    key — ingest stays the sole owner of auth, inserts, and auto-registration.
 *  - Tool-level failures are isError results (HTTP 200), never HTTP 401/500:
 *    that is the only shape guaranteed to reach the calling model, which can
 *    then relay the remediation text to a human.
 */

// --- dependency seam -------------------------------------------------------

/** Structural match for the three shared contract validators. */
export type ValidatorResult = { ok: true; event: object } | { ok: false; errors: string[] }
export type Validator = (payload: unknown) => ValidatorResult

export interface McpDeps {
  validators: { task: Validator; register: Validator; deviation: Validator }
  fetch: typeof fetch
  /** e.g. https://<project>.supabase.co/functions/v1/ingest */
  ingestUrl: string
  supabaseUrl: string
  serviceKey: string
}

// --- constants -------------------------------------------------------------

const APP_URL = 'https://agentworkforce.timegram.io'

const SERVER_INFO = { name: 'timegram-agent-ops', version: '1.0.0' }

/**
 * 2025-03-26 is deliberately absent: it mandates JSON-RPC batching, which
 * this server rejects. Anything unrecognized negotiates down to the default.
 * The 2026-07-28 stateless-core revision is deferred until clients ship it —
 * this server is already stateless, so adding server/discover is additive.
 */
const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = ['2025-06-18', '2025-11-25']
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

/** One auth-failure copy for every path — asserted by tests and check:mcp. */
export const AUTH_ERROR_TEXT =
  'invalid or missing API key — send it as "Authorization: Bearer tgk_live_…" (or an x-api-key ' +
  'header). The key is in your workspace CONNECT handout; if it was rotated, update the header ' +
  'and reconnect.'

const INSTRUCTIONS =
  'Timegram Agent Ops records what agents did — never what they said. Report each completed ' +
  'unit of work with report_task, enrich registry records with register_agent, record policy ' +
  'departures with report_deviation, and call workspace_status to confirm the connection. ' +
  'Metadata only: business descriptions, outcomes, and numbers — prompts, transcripts, and ' +
  'outputs are rejected. This MCP surface is the quick-connect path; production, audit-grade ' +
  "telemetry should use the Timegram SDK embedded in the agent's code."

/**
 * Origin * is deliberate: this is a bearer-authenticated API surface for
 * third-party MCP clients, never a cookie surface (contrast the admin
 * function's origin allowlist). authorization + content-type lead the header
 * list — Supabase's preflight truncates Access-Control-Allow-Headers
 * (supabase#41334), and those two must survive. GET/DELETE are allowed at
 * the CORS layer so browser clients' preflights pass and the request reaches
 * our deliberate 405 (SDKs branch on it) instead of dying as a CORS error.
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-api-key, mcp-protocol-version, last-event-id',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

// --- tool definitions ------------------------------------------------------

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * inputSchema is advisory — validation always happens by calling the real
 * shared validators, so the contract modules stay the single source of truth.
 * No outputSchema anywhere: clients that validate results against it turn
 * isError responses into opaque protocol faults (woocommerce#64195).
 */
export const TOOLS: readonly ToolDefinition[] = [
  {
    name: 'report_task',
    description:
      'Record one completed unit of agent work in this Timegram Agent Ops workspace — metadata ' +
      'only: a one-line business description, the outcome, and numbers. The platform records ' +
      'what agents did, never what they said — prompts, transcripts, and outputs are rejected ' +
      'by name. Use measured values from your runtime where available (duration, cost, tokens); ' +
      'otherwise give your best honest estimate. Unknown agent_ids are auto-registered on first ' +
      'report; enrich them later with register_agent. This MCP surface is the quick-connect ' +
      "path — production, audit-grade telemetry should use the Timegram SDK embedded in the " +
      "agent's code, which reports measured values.",
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          maxLength: 100,
          description: 'stable id of the reporting agent — unknown ids auto-register on first report',
        },
        description: {
          type: 'string',
          maxLength: 300,
          description: 'one-line business summary of the work — never a transcript',
        },
        business_process: { type: 'string', maxLength: 120 },
        cost_center: { type: 'string', maxLength: 120 },
        outcome: { type: 'string', enum: ['completed', 'escalated', 'failed'] },
        duration_sec: { type: 'integer', minimum: 0 },
        cost_usd: { type: 'number', minimum: 0 },
        units: {
          type: 'integer',
          minimum: 0,
          description: 'units of work completed, e.g. invoices processed',
        },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 with explicit timezone; defaults to now',
        },
        tokens: { type: 'integer', minimum: 0 },
      },
      required: [
        'agent_id',
        'description',
        'business_process',
        'cost_center',
        'outcome',
        'duration_sec',
        'cost_usd',
        'units',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'register_agent',
    description:
      "Create or enrich an agent's registry record in the Timegram workspace: name, purpose, " +
      'owner, department, model, unit label, budgets. Metadata only — describe what the agent ' +
      'is for in business language; never include prompts, system instructions, or transcripts. ' +
      'Calling again with the same agent_id updates only the fields you supply. Omit fields you ' +
      'do not know.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', maxLength: 100 },
        name: { type: 'string', maxLength: 120, description: 'human-readable agent name' },
        department: { type: 'string', maxLength: 80 },
        purpose: {
          type: 'string',
          maxLength: 300,
          description: 'business purpose — a label, never a system prompt',
        },
        owner_name: { type: 'string', maxLength: 120 },
        model: { type: 'string', maxLength: 80 },
        model_provider: { type: 'string', maxLength: 80 },
        unit_label: {
          type: 'string',
          maxLength: 40,
          description: 'what one unit of work is, e.g. "invoice"',
        },
        monthly_budget_usd: { type: 'number', minimum: 0 },
        human_baseline_usd_per_unit: { type: 'number', minimum: 0 },
      },
      required: ['agent_id', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'report_deviation',
    description:
      'Record a policy deviation — the fact that an agent departed from a workspace policy — in ' +
      'business language. policy_id must exist in the workspace (ids are listed on the Policies ' +
      'screen; starter workspaces have pol-starter-1 through pol-starter-5). Never include the ' +
      'content that triggered the deviation — the metadata-only contract rejects content and ' +
      'evidence fields. Report only deviations that actually occurred.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: { type: 'string', maxLength: 100 },
        policy_id: { type: 'string', maxLength: 100 },
        description: {
          type: 'string',
          maxLength: 300,
          description: 'what was departed from, in business language — never the triggering content',
        },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 with explicit timezone; defaults to now',
        },
      },
      required: ['agent_id', 'policy_id', 'description'],
      additionalProperties: false,
    },
  },
  {
    name: 'workspace_status',
    description:
      "Connection check — returns this workspace's name and current counts of registered " +
      'agents, recorded tasks, and policy deviations visible to your API key. Call this first ' +
      'to confirm the connection works. Takes no arguments and reads only aggregate counts, ' +
      'never task contents.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

// --- small helpers ---------------------------------------------------------

type RpcId = string | number | null

const json = (status: number, body: unknown, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...(extraHeaders ?? {}) },
  })

const rpcResult = (id: RpcId, result: unknown) => json(200, { jsonrpc: '2.0', id, result })

const rpcError = (id: RpcId, code: number, message: string, status = 200) =>
  json(status, { jsonrpc: '2.0', id, error: { code, message } })

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const rest = (deps: McpDeps, path: string, init?: RequestInit): Promise<Response> =>
  deps.fetch(`${deps.supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: deps.serviceKey,
      Authorization: `Bearer ${deps.serviceKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

/**
 * Authorization: Bearer is the documented header (portable across MCP
 * clients); x-api-key is the ingest-parity alias. A bare key in Authorization
 * is tolerated — some hosted clients send configured values verbatim. Only
 * tgk_-prefixed values count as keys at all: a host-injected JWT must not
 * shadow a valid x-api-key, and a keyless request must fail locally instead
 * of buying an outbound ingest call (nothing without the prefix can ever
 * authenticate — both resolvers gate on it).
 */
function extractKey(req: Request): string | null {
  const auth = (req.headers.get('authorization') ?? '').trim()
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : auth
  if (bearer.startsWith('tgk_')) return bearer
  const alias = req.headers.get('x-api-key')
  return alias?.startsWith('tgk_') ? alias : null
}

interface OrgIdentity {
  orgId: string
  name: string
}

/** Key → org via SHA-256 digest equality, same mechanism as ingest. */
async function resolveOrg(rawKey: string, deps: McpDeps): Promise<OrgIdentity | null> {
  if (!rawKey.startsWith('tgk_')) return null
  const hash = await sha256Hex(rawKey)
  const res = await rest(
    deps,
    `api_keys?select=org_id,orgs(name)&key_hash=eq.${hash}&revoked_at=is.null&limit=1`,
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ org_id: string; orgs: { name: string } | null }>
  if (!rows[0]) return null
  return { orgId: rows[0].org_id, name: rows[0].orgs?.name ?? 'your workspace' }
}

/** Row count without fetching rows; null = lookup failed (never silently 0). */
async function countRows(deps: McpDeps, filter: string): Promise<number | null> {
  const res = await rest(deps, filter, { method: 'HEAD', headers: { Prefer: 'count=exact' } })
  if (!res.ok) return null
  const total = Number((res.headers.get('content-range') ?? '').split('/')[1])
  return Number.isFinite(total) ? total : null
}

// --- tool execution --------------------------------------------------------

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

const ok = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })
const err = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true })

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const autoRegisterNote = (body: Record<string, unknown>, agentId: string): string =>
  body.auto_registered_agent === true
    ? `\nNote: agent "${agentId}" was auto-registered from this first report — enrich it with register_agent (name, owner, purpose).`
    : ''

/**
 * Validate locally with the shared contract validator (identical error text
 * to the SDKs' MetadataContractError), then forward the NORMALIZED event to
 * ingest with the caller's key. Ingest re-validates — defense in depth.
 */
async function runWriteTool(
  validator: Validator,
  url: string,
  args: unknown,
  rawKey: string,
  deps: McpDeps,
  successText: (body: Record<string, unknown>) => string,
): Promise<ToolResult> {
  const result = validator(args)
  if (!result.ok) {
    return err(`Event rejected by the metadata-only contract:\n  - ${result.errors.join('\n  - ')}`)
  }

  let res: Response
  try {
    res = await deps.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': rawKey },
      body: JSON.stringify(result.event),
    })
  } catch (e) {
    // Same hygiene as the 5xx branch: runtime error text (which embeds the
    // internal URL) goes to the logs, never into a third-party model's context.
    console.log(`[mcp] ingest fetch failed: ${(e as Error).message}`)
    return err('could not reach the Timegram ingest endpoint — safe to retry.')
  }

  if (!res.ok) {
    const detail = await res.text()
    if (res.status === 401) return err(AUTH_ERROR_TEXT)
    if (res.status === 422) {
      const body = ((): Record<string, unknown> => {
        try {
          return asRecord(JSON.parse(detail))
        } catch {
          return {}
        }
      })()
      const errors = Array.isArray(body.errors) ? (body.errors as string[]) : [detail.slice(0, 300)]
      return err(`Rejected by the workspace:\n  - ${errors.join('\n  - ')}`)
    }
    // Raw PostgREST detail never reaches a third-party model's context.
    console.log(`[mcp] ingest ${res.status}: ${detail.slice(0, 300)}`)
    return err('Timegram ingest temporarily failed — safe to retry.')
  }

  const body = asRecord(await res.json().catch(() => ({})))
  return ok(successText(body))
}

export async function callTool(
  name: string,
  args: unknown,
  rawKey: string | null,
  deps: McpDeps,
): Promise<ToolResult> {
  if (!rawKey) return err(AUTH_ERROR_TEXT)

  if (name === 'report_task') {
    const agentId = String(asRecord(args).agent_id ?? '')
    return runWriteTool(
      deps.validators.task,
      deps.ingestUrl,
      args,
      rawKey,
      deps,
      (body) => `Recorded — task id ${body.id ?? 'unknown'}, accepted.${autoRegisterNote(body, agentId)}`,
    )
  }

  if (name === 'register_agent') {
    const agentId = String(asRecord(args).agent_id ?? '')
    return runWriteTool(
      deps.validators.register,
      `${deps.ingestUrl}/register`,
      args,
      rawKey,
      deps,
      (body) =>
        body.created === true
          ? `Registered agent "${agentId}".`
          : `Updated agent "${agentId}" — only the supplied fields changed.`,
    )
  }

  if (name === 'report_deviation') {
    const agentId = String(asRecord(args).agent_id ?? '')
    return runWriteTool(
      deps.validators.deviation,
      `${deps.ingestUrl}/deviation`,
      args,
      rawKey,
      deps,
      (body) =>
        `Recorded — deviation id ${body.id ?? 'unknown'}, accepted (status: open).${autoRegisterNote(body, agentId)}`,
    )
  }

  if (name === 'workspace_status') {
    // The only tool with its own reads (aggregate counts, service role).
    const org = await resolveOrg(rawKey, deps)
    if (!org) return err(AUTH_ERROR_TEXT)
    const [agents, tasks, deviations] = await Promise.all([
      countRows(deps, `agents?org_id=eq.${org.orgId}`),
      countRows(deps, `tasks?org_id=eq.${org.orgId}`),
      countRows(deps, `deviations?org_id=eq.${org.orgId}`),
    ])
    if (agents === null || tasks === null || deviations === null) {
      return err('workspace lookup failed — retry.')
    }
    return ok(
      `Connected to workspace "${org.name}" — ${agents} agents, ${tasks} tasks, ` +
        `${deviations} deviations. You're live: open ${APP_URL} to see the same numbers.`,
    )
  }

  // Unreachable through handleMcpRequest (dispatch gates on TOOLS), but
  // callTool is exported — never let an unknown name fall into a DB read.
  return err(`unknown tool "${name}"`)
}

// --- HTTP + JSON-RPC dispatch ----------------------------------------------

export async function handleMcpRequest(req: Request, deps: McpDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' },
    })
  }
  if (req.method !== 'POST') {
    // Spec-blessed in every protocol revision: no SSE stream, no sessions.
    return json(
      405,
      { error: 'POST only — MCP Streamable HTTP in stateless JSON mode' },
      { Allow: 'POST, OPTIONS' },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'parse error: body must be valid JSON', 400)
  }
  if (Array.isArray(body)) {
    return rpcError(
      null,
      -32600,
      'batch requests are not supported — send one JSON-RPC message per POST',
      400,
    )
  }
  const msg = asRecord(body)
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(
      null,
      -32600,
      'invalid request: "jsonrpc": "2.0" and a string "method" are required',
      400,
    )
  }

  // Notifications (no id) are acknowledged and never answered — 202, empty.
  if (!('id' in msg)) return new Response(null, { status: 202, headers: CORS_HEADERS })
  const id = msg.id as RpcId
  const method = msg.method

  if (method === 'initialize') {
    const params = asRecord(msg.params)
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
    return rpcResult(id, {
      protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
      instructions: INSTRUCTIONS,
    })
  }

  if (method === 'ping') return rpcResult(id, {})

  if (method === 'tools/list') return rpcResult(id, { tools: TOOLS })

  if (method === 'tools/call') {
    const params = asRecord(msg.params)
    const name = params.name
    if (typeof name !== 'string' || !TOOLS.some((t) => t.name === name)) {
      return rpcError(
        id,
        -32602,
        `unknown tool "${String(name)}" — available: ${TOOLS.map((t) => t.name).join(', ')}`,
      )
    }
    // 'arguments' passes through VERBATIM (no ?? {} defaulting): a null/array
    // payload must reach the validator and fail its body-shape branch exactly
    // as it would against ingest — the golden vectors pin this.
    const args = 'arguments' in params ? params.arguments : {}
    let result: ToolResult
    try {
      result = await callTool(name, args, extractKey(req), deps)
    } catch (e) {
      // resolveOrg/countRows parse failures and the like: a tool must degrade
      // to an isError result, never to the runtime's bare 500 (which carries
      // no CORS headers and reads as a connection failure in browser clients).
      console.log(`[mcp] tool ${name} threw: ${(e as Error).message}`)
      result = err('internal error — safe to retry.')
    }
    return rpcResult(id, result)
  }

  // Unknown methods (incl. server/discover, resources/*, prompts/*): clean
  // -32601 so future-era clients fall back to what this server does provide.
  return rpcError(id, -32601, `method "${method}" not found — this server provides tools only`)
}
