/**
 * Protocol + tool behavior for the MCP quick-connect surface. Everything runs
 * against handleMcpRequest with injected deps (recording stub fetch) — no
 * module mocking, matching the repo's test conventions. The golden-vector
 * parity suite lives in vectors.test.ts; this file covers the HTTP/JSON-RPC
 * shell and the error-mapping seams.
 */

import { describe, expect, it } from 'vitest'
import { MetadataContractError } from '../../../connector/src/reporter'
import { validateIngestEvent } from '../ingest/contract'
import { validateDeviationEvent } from '../ingest/deviation-contract'
import { validateRegisterEvent } from '../ingest/register-contract'
import { AUTH_ERROR_TEXT, TOOLS, handleMcpRequest, type McpDeps, type ToolResult } from './server'

const KEY = 'tgk_live_' + 'a'.repeat(64)
const MCP_URL = 'https://proj.supabase.co/functions/v1/mcp'
const INGEST_URL = 'https://proj.supabase.co/functions/v1/ingest'

const VALIDATORS = {
  task: validateIngestEvent,
  register: validateRegisterEvent,
  deviation: validateDeviationEvent,
}

const TASK = {
  agent_id: 'ag-1',
  description: 'Processed 12 invoices from the morning batch',
  business_process: 'Accounts payable',
  cost_center: 'Finance',
  outcome: 'completed',
  duration_sec: 95,
  cost_usd: 0.31,
  units: 12,
}

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers })

interface RecordedCall {
  url: string
  init: RequestInit | undefined
}

function makeDeps(fetchImpl?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: RecordedCall[] = []
  const deps: McpDeps = {
    validators: VALIDATORS,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (fetchImpl) return fetchImpl(url, init)
      return jsonResponse(201, { id: 'task-ing-1234', accepted: true })
    }) as typeof fetch,
    ingestUrl: INGEST_URL,
    supabaseUrl: 'https://proj.supabase.co',
    serviceKey: 'service-key',
  }
  return { deps, calls }
}

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(MCP_URL, { method: 'POST', headers, body: JSON.stringify(body) })

const AUTH = { authorization: `Bearer ${KEY}` }

const toolCall = (name: string, args: unknown, headers: Record<string, string> = AUTH) =>
  rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, headers)

async function toolResult(res: Response): Promise<ToolResult> {
  const body = (await res.json()) as { result: ToolResult }
  return body.result
}

const headersOf = (call: RecordedCall): Record<string, string> =>
  (call.init?.headers ?? {}) as Record<string, string>

describe('http surface', () => {
  it('answers OPTIONS with CORS, authorization and content-type surviving first', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(new Request(MCP_URL, { method: 'OPTIONS' }), deps)
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toMatch(/^authorization, content-type/)
    expect(res.headers.get('access-control-max-age')).toBe('86400')
  })

  it.each(['GET', 'DELETE'])('answers %s with 405 and an Allow header', async (method) => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(new Request(MCP_URL, { method }), deps)
    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST, OPTIONS')
    expect(((await res.json()) as { error: string }).error).toContain('POST only')
  })

  it('rejects an unparseable body with -32700', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(
      new Request(MCP_URL, { method: 'POST', body: 'not json' }),
      deps,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: number }; id: unknown }
    expect(body.error.code).toBe(-32700)
    expect(body.id).toBeNull()
  })

  it('rejects JSON-RPC batches with -32600', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(rpc([{ jsonrpc: '2.0', id: 1, method: 'ping' }]), deps)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: number; message: string } }
    expect(body.error.code).toBe(-32600)
    expect(body.error.message).toContain('batch')
  })

  it.each([['a string body', '"hello"'], ['a missing method', '{"jsonrpc":"2.0","id":1}']])(
    'rejects %s with -32600',
    async (_label, raw) => {
      const { deps } = makeDeps()
      const res = await handleMcpRequest(new Request(MCP_URL, { method: 'POST', body: raw }), deps)
      expect(res.status).toBe(400)
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32600)
    },
  )

  it.each(['notifications/initialized', 'notifications/cancelled', 'notifications/unknown'])(
    'acknowledges the %s notification with an empty 202',
    async (method) => {
      const { deps, calls } = makeDeps()
      const res = await handleMcpRequest(rpc({ jsonrpc: '2.0', method }), deps)
      expect(res.status).toBe(202)
      expect(await res.text()).toBe('')
      expect(calls).toHaveLength(0)
    },
  )

  it('sends CORS and content-type on JSON-RPC responses', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }), deps)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('content-type')).toBe('application/json')
  })

  it('preflight-allows GET and DELETE so browsers can reach the deliberate 405', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(new Request(MCP_URL, { method: 'OPTIONS' }), deps)
    const methods = res.headers.get('access-control-allow-methods') ?? ''
    expect(methods).toContain('GET')
    expect(methods).toContain('DELETE')
  })

  // Lenient-by-design interop: Claude Code sends only Accept: application/json
  // (claude-code#45368) and other clients send protocol/session headers we
  // ignore. This leniency IS the quick-connect story — pin it.
  const HEADER_QUIRKS: Array<Record<string, string>> = [
    { accept: 'text/html' },
    { accept: 'text/event-stream' },
    { 'mcp-protocol-version': '2025-03-26' },
    { 'mcp-session-id': 'stale-session' },
  ]
  it.each(HEADER_QUIRKS)('serves tools/list regardless of client header quirks %o', async (headers) => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(
      rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers),
      deps,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result: { tools: unknown[] } }
    expect(body.result.tools).toHaveLength(4)
  })
})

describe('initialize', () => {
  const init = (protocolVersion?: unknown) =>
    rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion } })

  it.each(['2025-06-18', '2025-11-25'])('echoes supported version %s', async (version) => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(init(version), deps)
    const body = (await res.json()) as { result: { protocolVersion: string } }
    expect(body.result.protocolVersion).toBe(version)
  })

  it.each(['2025-03-26', '2024-11-05', 'garbage', undefined])(
    'negotiates %s down to 2025-06-18 (2025-03-26 mandates batching, which we reject)',
    async (version) => {
      const { deps } = makeDeps()
      const res = await handleMcpRequest(init(version), deps)
      const body = (await res.json()) as { result: { protocolVersion: string } }
      expect(body.result.protocolVersion).toBe('2025-06-18')
    },
  )

  it('returns serverInfo, tools capability, and positioning instructions — without auth', async () => {
    const { deps, calls } = makeDeps()
    const res = await handleMcpRequest(init('2025-06-18'), deps)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      result: {
        serverInfo: { name: string }
        capabilities: Record<string, unknown>
        instructions: string
      }
    }
    expect(body.result.serverInfo.name).toBe('timegram-agent-ops')
    expect(body.result.capabilities).toEqual({ tools: {} })
    expect(body.result.instructions).toContain('never what they said')
    expect(res.headers.get('mcp-session-id')).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe('tools/list', () => {
  it('lists the four tools without auth, none with an outputSchema', async () => {
    const { deps, calls } = makeDeps()
    const res = await handleMcpRequest(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), deps)
    const body = (await res.json()) as { result: { tools: Array<Record<string, unknown>> } }
    expect(body.result.tools.map((t) => t.name)).toEqual([
      'report_task',
      'register_agent',
      'report_deviation',
      'workspace_status',
    ])
    for (const tool of body.result.tools) {
      expect(tool.outputSchema).toBeUndefined()
      expect((tool.inputSchema as { type: string }).type).toBe('object')
      expect(String(tool.description).length).toBeGreaterThan(0)
    }
    expect(calls).toHaveLength(0)
  })

  it('report_task requires the three mandatory numerics alongside the strings', () => {
    const task = TOOLS.find((t) => t.name === 'report_task')
    expect(task?.inputSchema.required).toEqual([
      'agent_id',
      'description',
      'business_process',
      'cost_center',
      'outcome',
      'duration_sec',
      'cost_usd',
      'units',
    ])
  })

  it('carries the quick-connect vs SDK positioning in the copy', () => {
    const task = TOOLS.find((t) => t.name === 'report_task')
    expect(task?.description).toContain('never what they said')
    expect(task?.description).toContain('measured values')
    expect(task?.description).toContain('SDK')
  })
})

describe('unknown methods and tools', () => {
  it.each(['server/discover', 'resources/list', 'prompts/list', 'nonsense'])(
    'answers %s with -32601',
    async (method) => {
      const { deps } = makeDeps()
      const res = await handleMcpRequest(rpc({ jsonrpc: '2.0', id: 7, method }), deps)
      expect(res.status).toBe(200)
      const body = (await res.json()) as { id: number; error: { code: number } }
      expect(body.error.code).toBe(-32601)
      expect(body.id).toBe(7)
    },
  )

  it('rejects an unknown tool with -32602 naming the available four', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(toolCall('report_tasks', TASK), deps)
    const body = (await res.json()) as { error: { code: number; message: string } }
    expect(body.error.code).toBe(-32602)
    expect(body.error.message).toContain('workspace_status')
    expect(body.error.message).toContain('report_task')
  })
})

describe('tool auth', () => {
  it('fails a tools/call without any key as an isError result, never touching the network', async () => {
    const { deps, calls } = makeDeps()
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK, {}), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(AUTH_ERROR_TEXT)
    expect(calls).toHaveLength(0)
  })

  it('accepts x-api-key as the ingest-parity alias', async () => {
    const { deps, calls } = makeDeps()
    const result = await toolResult(
      await handleMcpRequest(toolCall('report_task', TASK, { 'x-api-key': KEY }), deps),
    )
    expect(result.isError).toBeUndefined()
    expect(headersOf(calls[0])['x-api-key']).toBe(KEY)
  })

  it('prefers Authorization: Bearer over x-api-key', async () => {
    const { deps, calls } = makeDeps()
    await handleMcpRequest(
      toolCall('report_task', TASK, { authorization: `Bearer ${KEY}`, 'x-api-key': 'tgk_other' }),
      deps,
    )
    expect(headersOf(calls[0])['x-api-key']).toBe(KEY)
  })

  it('tolerates a bare key in Authorization (hosted clients send values verbatim)', async () => {
    const { deps, calls } = makeDeps()
    const result = await toolResult(
      await handleMcpRequest(toolCall('report_task', TASK, { authorization: KEY }), deps),
    )
    expect(result.isError).toBeUndefined()
    expect(headersOf(calls[0])['x-api-key']).toBe(KEY)
  })

  it('never lets a host-injected non-tgk bearer shadow a valid x-api-key', async () => {
    const { deps, calls } = makeDeps()
    const result = await toolResult(
      await handleMcpRequest(
        toolCall('report_task', TASK, { authorization: 'Bearer eyJhbGciOi.jwt.value', 'x-api-key': KEY }),
        deps,
      ),
    )
    expect(result.isError).toBeUndefined()
    expect(headersOf(calls[0])['x-api-key']).toBe(KEY)
  })

  it('rejects a non-tgk key locally — an anonymous request must not buy an ingest call', async () => {
    const { deps, calls } = makeDeps()
    const result = await toolResult(
      await handleMcpRequest(toolCall('report_task', TASK, { authorization: 'Bearer not-a-key' }), deps),
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(AUTH_ERROR_TEXT)
    expect(calls).toHaveLength(0)
  })

  it('keeps the literal scripts/check-mcp.mjs greps for', () => {
    // The deployed tripwire matches on this substring — change both together.
    expect(AUTH_ERROR_TEXT).toContain('invalid or missing API key')
  })
})

describe('report_task', () => {
  it('forwards the NORMALIZED event to ingest with the caller key', async () => {
    const { deps, calls } = makeDeps()
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK), deps))
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('Recorded — task id task-ing-1234')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(INGEST_URL)
    const validated = validateIngestEvent(TASK)
    if (!validated.ok) throw new Error('fixture must validate')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(validated.event)
  })

  it('surfaces auto-registration as a follow-up note', async () => {
    const { deps } = makeDeps(() =>
      jsonResponse(201, { id: 'task-ing-9', accepted: true, auto_registered_agent: true }),
    )
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK), deps))
    expect(result.content[0].text).toContain('auto-registered')
    expect(result.content[0].text).toContain('register_agent')
  })

  it('rejects contract violations locally with the exact MetadataContractError text, never sending', async () => {
    const { deps, calls } = makeDeps()
    const payload = { ...TASK, prompt: 'secret' }
    const result = await toolResult(
      await handleMcpRequest(toolCall('report_task', payload), deps),
    )
    expect(result.isError).toBe(true)
    // Byte-for-byte parity with the SDK class, not a hand-copied literal —
    // if the SDK message ever changes, this fails instead of silently diverging.
    const validated = validateIngestEvent(payload)
    if (validated.ok) throw new Error('fixture must violate the contract')
    expect(result.content[0].text).toBe(new MetadataContractError(validated.errors).message)
    expect(result.content[0].text).toContain('content fields are not accepted')
    expect(calls).toHaveLength(0)
  })

  it('treats a missing arguments key as an empty object', async () => {
    const { deps, calls } = makeDeps()
    const res = await handleMcpRequest(
      rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'report_task' } }, AUTH),
      deps,
    )
    const result = await toolResult(res)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('required non-empty string')
    expect(calls).toHaveLength(0)
  })

  it('passes a null arguments value through verbatim to the validator', async () => {
    const { deps } = makeDeps()
    const res = await handleMcpRequest(
      rpc(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'report_task', arguments: null } },
        AUTH,
      ),
      deps,
    )
    const result = await toolResult(res)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('body must be a JSON object')
  })

  it('maps ingest 401 to the shared auth text', async () => {
    const { deps } = makeDeps(() => jsonResponse(401, { error: 'invalid or missing x-api-key' }))
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(AUTH_ERROR_TEXT)
  })

  it('passes ingest 422 error lists through under the workspace-rejection prefix', async () => {
    const { deps } = makeDeps(() =>
      jsonResponse(422, { errors: ['"policy_id": no policy "pol-x" exists in this workspace'] }),
    )
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toMatch(/^Rejected by the workspace:\n {2}- /)
    expect(result.content[0].text).toContain('no policy "pol-x" exists')
  })

  it('hides upstream failure detail behind a fixed retry message', async () => {
    const { deps } = makeDeps(() =>
      jsonResponse(502, { error: 'insert failed: duplicate key value violates constraint tasks_pkey' }),
    )
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe('Timegram ingest temporarily failed — safe to retry.')
    expect(result.content[0].text).not.toContain('tasks_pkey')
  })

  it('degrades a thrown fetch to a readable retry message', async () => {
    const { deps } = makeDeps(() => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    const result = await toolResult(await handleMcpRequest(toolCall('report_task', TASK), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('could not reach')
    expect(result.content[0].text).toContain('retry')
  })
})

describe('register_agent', () => {
  it('posts to /register and words a 201 as created', async () => {
    const { deps, calls } = makeDeps(() => jsonResponse(201, { agent_id: 'ag-1', created: true }))
    const result = await toolResult(
      await handleMcpRequest(toolCall('register_agent', { agent_id: 'ag-1', name: 'Expense Agent' }), deps),
    )
    expect(calls[0].url).toBe(`${INGEST_URL}/register`)
    expect(result.content[0].text).toBe('Registered agent "ag-1".')
  })

  it('words a 200 as an update touching only supplied fields', async () => {
    const { deps } = makeDeps(() => jsonResponse(200, { agent_id: 'ag-1', updated: true }))
    const result = await toolResult(
      await handleMcpRequest(toolCall('register_agent', { agent_id: 'ag-1', name: 'Expense Agent' }), deps),
    )
    expect(result.content[0].text).toContain('Updated agent "ag-1"')
    expect(result.content[0].text).toContain('only the supplied fields')
  })
})

describe('report_deviation', () => {
  const DEVIATION = {
    agent_id: 'ag-1',
    policy_id: 'pol-starter-1',
    description: 'Approved a $12,400 transaction without escalation',
  }

  it('posts to /deviation and reports the open status', async () => {
    const { deps, calls } = makeDeps(() => jsonResponse(201, { id: 'dev-ing-7', accepted: true }))
    const result = await toolResult(
      await handleMcpRequest(toolCall('report_deviation', DEVIATION), deps),
    )
    expect(calls[0].url).toBe(`${INGEST_URL}/deviation`)
    expect(result.content[0].text).toContain('dev-ing-7')
    expect(result.content[0].text).toContain('status: open')
  })

  it('passes the unknown-policy 422 hint through', async () => {
    const { deps } = makeDeps(() =>
      jsonResponse(422, { errors: ['"policy_id": no policy "pol-nope" exists in this workspace'] }),
    )
    const result = await toolResult(
      await handleMcpRequest(toolCall('report_deviation', { ...DEVIATION, policy_id: 'pol-nope' }), deps),
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('pol-nope')
  })
})

describe('workspace_status', () => {
  const statusDeps = (counts: { agents: number; tasks: number; deviations: number }) =>
    makeDeps((url, init) => {
      if (url.includes('/rest/v1/api_keys')) {
        return jsonResponse(200, [{ org_id: 'org-1', orgs: { name: 'Acme Corp' } }])
      }
      const table = (Object.keys(counts) as Array<keyof typeof counts>).find((t) =>
        url.includes(`/rest/v1/${t}`),
      )
      if (!table || init?.method !== 'HEAD') return jsonResponse(500, { error: 'unexpected call' })
      return new Response(null, { status: 200, headers: { 'content-range': `0-0/${counts[table]}` } })
    })

  it('returns the workspace name and live counts', async () => {
    const { deps, calls } = statusDeps({ agents: 5, tasks: 128, deviations: 3 })
    const result = await toolResult(await handleMcpRequest(toolCall('workspace_status', {}), deps))
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('"Acme Corp"')
    expect(result.content[0].text).toContain('5 agents')
    expect(result.content[0].text).toContain('128 tasks')
    expect(result.content[0].text).toContain('3 deviations')
    expect(result.content[0].text).toContain('https://agentworkforce.timegram.io')
    // All reads run under the service role, never the caller's key.
    for (const call of calls) {
      expect(headersOf(call).Authorization).toBe('Bearer service-key')
    }
  })

  it('answers an unknown or revoked key with the shared auth text', async () => {
    const { deps } = makeDeps((url) =>
      url.includes('/rest/v1/api_keys')
        ? jsonResponse(200, [])
        : jsonResponse(500, { error: 'unexpected call' }),
    )
    const result = await toolResult(await handleMcpRequest(toolCall('workspace_status', {}), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe(AUTH_ERROR_TEXT)
  })

  it('reports a failed count lookup as retryable, not as zeros', async () => {
    const { deps } = makeDeps((url) =>
      url.includes('/rest/v1/api_keys')
        ? jsonResponse(200, [{ org_id: 'org-1', orgs: { name: 'Acme Corp' } }])
        : jsonResponse(500, { error: 'boom' }),
    )
    const result = await toolResult(await handleMcpRequest(toolCall('workspace_status', {}), deps))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('workspace lookup failed')
  })

  it('degrades a thrown service-role fetch to an isError result, never a bare 500', async () => {
    const { deps } = makeDeps(() => {
      throw new Error('connection reset')
    })
    const res = await handleMcpRequest(toolCall('workspace_status', {}), deps)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const result = await toolResult(res)
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('safe to retry')
    expect(result.content[0].text).not.toContain('connection reset')
  })
})
