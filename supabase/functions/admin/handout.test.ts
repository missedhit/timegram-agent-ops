import { describe, expect, it } from 'vitest'
import { handoutMarkdown, orgSlug } from './handout'

const OPTS = {
  orgName: 'Acme Corp',
  appUrl: 'https://agentworkforce.timegram.io',
  ingestUrl: 'https://example.supabase.co/functions/v1/ingest',
  mcpUrl: 'https://example.supabase.co/functions/v1/mcp',
  rawKey: 'tgk_live_' + 'a'.repeat(64),
}

describe('handout template', () => {
  const md = handoutMarkdown(OPTS)

  it('carries the org name, app URL, ingest URL, and the raw key in all snippets', () => {
    expect(md).toContain('# Connect your agents — Acme Corp')
    expect(md).toContain(OPTS.appUrl)
    // Exact count so a NEW committed-file snippet with an inline key fails
    // loudly: key block, curl, python, ts, claude-mcp-add, mcp-remote env.
    expect(md.split(OPTS.rawKey).length - 1).toBe(6)
    expect(md.split(OPTS.ingestUrl).length - 1).toBeGreaterThanOrEqual(4)
  })

  it('has no unresolved template placeholders', () => {
    // Allowlist of the client-side placeholders that MUST render verbatim;
    // any other ${…} is an unresolved (or wrongly escaped) template value.
    expect(md.match(/\$\{[^}]+\}/g) ?? []).toEqual([
      '${TIMEGRAM_API_KEY}',
      '${env:TIMEGRAM_API_KEY}',
      '${AUTH_HEADER}',
    ])
    expect(md).not.toContain('undefined')
  })

  it('carries the MCP quick-connect section with env-var-only committed snippets', () => {
    expect(md).toContain('## Connect via MCP')
    // CLI one-liner + .mcp.json + mcp-remote bridge all point at the endpoint
    expect(md.split(OPTS.mcpUrl).length - 1).toBeGreaterThanOrEqual(3)
    expect(md).toContain('workspace_status')
    // committed-file snippets use placeholders, never the raw key inline
    expect(md).toContain('${TIMEGRAM_API_KEY}')
    expect(md).toContain('"type": "http"')
    expect(md).toContain('mcp-remote')
  })

  it('states the metadata-only positioning', () => {
    expect(md).toContain('what agents did — never what they said')
  })
})

describe('org slug', () => {
  it('matches the CLI slug rules', () => {
    expect(orgSlug('Acme Corp')).toBe('acme-corp')
    expect(orgSlug('  Demo Prospect, Inc.  ')).toBe('demo-prospect-inc')
    expect(orgSlug('!!!')).toBe('')
  })
})
