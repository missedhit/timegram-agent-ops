/**
 * Golden-vector parity for the MCP surface: every case in the shared
 * vectors.json is driven through a full JSON-RPC tools/call dispatch, so the
 * MCP layer provably applies the exact ingest contracts — accept cases
 * forward the validator's NORMALIZED event, reject cases become isError
 * results carrying the same error text, and the network is never touched on
 * a reject. This extends the existing TS/Python parity mechanism to MCP.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateIngestEvent } from '../ingest/contract'
import { validateDeviationEvent } from '../ingest/deviation-contract'
import { validateRegisterEvent } from '../ingest/register-contract'
import { handleMcpRequest, type McpDeps } from './server'

interface VectorCase {
  name: string
  contract: 'task' | 'register' | 'deviation'
  note?: string
  payload: unknown
  expect: { ok: boolean; errorIncludes?: string[] }
}

const file = JSON.parse(
  readFileSync(new URL('../ingest/vectors.json', import.meta.url), 'utf-8'),
) as { version: number; cases: VectorCase[] }

const TOOL_FOR: Record<VectorCase['contract'], string> = {
  task: 'report_task',
  register: 'register_agent',
  deviation: 'report_deviation',
}

const VALIDATORS = {
  task: validateIngestEvent,
  register: validateRegisterEvent,
  deviation: validateDeviationEvent,
}

const KEY = 'tgk_live_' + 'a'.repeat(64)

interface RecordedCall {
  url: string
  init: RequestInit | undefined
}

function makeDeps() {
  const calls: RecordedCall[] = []
  const deps: McpDeps = {
    validators: VALIDATORS,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response(JSON.stringify({ id: 'x', accepted: true }), { status: 201 })
    }) as typeof fetch,
    ingestUrl: 'https://proj.supabase.co/functions/v1/ingest',
    supabaseUrl: 'https://proj.supabase.co',
    serviceKey: 'service-key',
  }
  return { deps, calls }
}

describe('vector file coverage', () => {
  it('the tool dispatch map covers every contract present in the file', () => {
    const contracts = new Set(file.cases.map((c) => c.contract))
    expect(contracts.size).toBeGreaterThan(0)
    for (const contract of contracts) {
      expect(TOOL_FOR[contract], `no MCP tool mapped for contract "${contract}"`).toBeDefined()
    }
  })
})

describe('golden vectors through tools/call', () => {
  for (const c of file.cases) {
    it(c.name, async () => {
      const { deps, calls } = makeDeps()
      const res = await handleMcpRequest(
        new Request('https://proj.supabase.co/functions/v1/mcp', {
          method: 'POST',
          headers: { 'x-api-key': KEY },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            // payload passes through VERBATIM — null/array/scalar payloads
            // must reach the validator's body-shape branch, exactly as they
            // would against ingest.
            params: { name: TOOL_FOR[c.contract], arguments: c.payload },
          }),
        }),
        deps,
      )
      expect(res.status).toBe(200)
      const result = ((await res.json()) as {
        result: { isError?: boolean; content: Array<{ text: string }> }
      }).result

      if (c.expect.ok) {
        expect(result.isError, c.note ?? c.name).toBeUndefined()
        expect(calls, 'accepted events forward exactly once').toHaveLength(1)
        const validated = VALIDATORS[c.contract](c.payload)
        if (!validated.ok) throw new Error(`vector "${c.name}" expected ok but the validator rejected`)
        // Compare in wire form: JSON serialization canonicalizes -0 to 0,
        // identically to what the SDKs put on the wire.
        expect(JSON.parse(String(calls[0].init?.body)), 'the NORMALIZED event is forwarded').toEqual(
          JSON.parse(JSON.stringify(validated.event)),
        )
      } else {
        expect(result.isError, c.note ?? c.name).toBe(true)
        expect(calls, 'rejected events never touch the network').toHaveLength(0)
        // The tool text is the MetadataContractError format ("  - " bullets).
        // Pin the wrapper first — replace() no-ops silently if the format
        // drifts, and only one vector's errorIncludes would catch that.
        expect(result.content[0].text).toMatch(/^Event rejected by the metadata-only contract:\n {2}- /)
        // Then reconstruct the plain errors.join('\n') the vectors assert
        // against — some errorIncludes span two lines to pin error ORDER.
        const text = result.content[0].text
          .replace('Event rejected by the metadata-only contract:\n  - ', '')
          .split('\n  - ')
          .join('\n')
        for (const substring of c.expect.errorIncludes ?? []) {
          expect(text).toContain(substring)
        }
      }
    })
  }
})
