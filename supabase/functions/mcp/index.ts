/**
 * MCP quick-connect edge function entry. All behavior lives in server.ts
 * (shared with vitest — the contract.ts pattern); this file only wires the
 * Deno runtime: env, the shared ingest validators, and the sibling ingest
 * function's URL. Deployed with --no-verify-jwt (codified in
 * supabase/config.toml) — the gateway must not inspect the caller's
 * Authorization header, which carries a tgk_ API key, not a platform JWT.
 */

import { validateIngestEvent } from '../ingest/contract.ts'
import { validateDeviationEvent } from '../ingest/deviation-contract.ts'
import { validateRegisterEvent } from '../ingest/register-contract.ts'
import { CORS_HEADERS, handleMcpRequest } from './server.ts'

// Deno global exists in the edge runtime; this file is excluded from tsc/vitest.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve: (h: (req: Request) => Promise<Response> | Response) => void
}

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') ?? ''
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req: Request) => {
  try {
    return await handleMcpRequest(req, {
      validators: {
        task: validateIngestEvent,
        register: validateRegisterEvent,
        deviation: validateDeviationEvent,
      },
      fetch: (input, init) => fetch(input, init),
      ingestUrl: `${supabaseUrl()}/functions/v1/ingest`,
      supabaseUrl: supabaseUrl(),
      serviceKey: serviceKey(),
    })
  } catch (e) {
    // Never let a throw reach the runtime's default plaintext 500 — it has no
    // CORS headers, so browser clients see a connection failure, not an error.
    console.log(`[mcp] unhandled: ${(e as Error).message}`)
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: 'internal error — safe to retry' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    )
  }
})
