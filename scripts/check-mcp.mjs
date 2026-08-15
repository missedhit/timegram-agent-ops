/**
 * Deployed-endpoint smoke for the MCP function: initialize answers, the four
 * tools list, and — critically — a garbage key produces OUR auth error, not
 * the platform gateway's "Invalid JWT" (which means the dashboard's Verify
 * JWT toggle got re-enabled and no request reaches our code at all).
 * Run with `npm run check:mcp`.
 */
import { loadEnvLocal } from './env.mjs'

const env = loadEnvLocal()
const url = env.VITE_SUPABASE_URL
if (!url) {
  console.error('Missing VITE_SUPABASE_URL in .env.local')
  process.exit(1)
}
const mcpUrl = `${url.replace(/\/+$/, '')}/functions/v1/mcp`

let failed = false
const check = (label, okFlag, detail) => {
  console.log(`${okFlag ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!okFlag) failed = true
}

// Transport failures must FAIL a check and let the remaining checks run —
// never crash the script mid-output (the summary line is the verdict).
const rpc = async (body, headers = {}) => {
  let res
  try {
    res = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { res: { status: 0, headers: new Headers() }, body: null, transportError: e.cause?.message ?? e.message }
  }
  let parsed = null
  try {
    parsed = await res.json()
  } catch {
    // non-JSON body (e.g. a gateway error page) — handled by the checks
  }
  return { res, body: parsed }
}

const statusDetail = (r) => (r.res.status === 0 ? `unreachable: ${r.transportError}` : `HTTP ${r.res.status}`)

{
  const r = await rpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check-mcp', version: '0' } },
  })
  check(
    'initialize answers with serverInfo',
    r.res.status === 200 && r.body?.result?.serverInfo?.name === 'timegram-agent-ops',
    statusDetail(r),
  )
}

{
  const r = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const tools = r.body?.result?.tools ?? []
  // Names, not arity — this is the deployed-artifact tripwire; a stale build
  // with four differently-named tools must FAIL here, not pass silently.
  const names = tools.map((t) => t.name).sort().join(',')
  check(
    'tools/list has the four tools',
    r.res.status === 200 && names === 'register_agent,report_deviation,report_task,workspace_status',
    names || statusDetail(r),
  )
}

{
  const r = await rpc(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'workspace_status', arguments: {} } },
    { Authorization: 'Bearer tgk_live_garbage' },
  )
  if (r.res.status === 401) {
    check(
      'garbage key rejected by OUR code',
      false,
      'HTTP 401 before our code ran — DASHBOARD VERIFY_JWT TOGGLE IS ON: Dashboard → Edge Functions → mcp → Details → turn Verify JWT off',
    )
  } else {
    const text = r.body?.result?.content?.[0]?.text ?? ''
    check(
      'garbage key rejected by OUR code',
      r.res.status === 200 && r.body?.result?.isError === true && text.includes('invalid or missing API key'),
      text.slice(0, 100) || statusDetail(r),
    )
  }
}

{
  let res
  try {
    res = await fetch(mcpUrl)
  } catch (e) {
    res = { status: 0, headers: new Headers(), transportError: e.cause?.message ?? e.message }
  }
  check(
    'GET answers 405 with Allow',
    res.status === 405 && (res.headers.get('allow') ?? '').includes('POST'),
    res.status === 0 ? `unreachable: ${res.transportError}` : `HTTP ${res.status}`,
  )
}

console.log(failed ? `\n${mcpUrl} -> FAILED` : `\n${mcpUrl} -> OK`)
process.exit(failed ? 1 : 0)
