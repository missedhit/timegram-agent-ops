import { describe, expect, it } from 'vitest'
import { handoutMarkdown, orgSlug } from './handout'

const OPTS = {
  orgName: 'Acme Corp',
  appUrl: 'https://agentworkforce.timegram.io',
  ingestUrl: 'https://example.supabase.co/functions/v1/ingest',
  rawKey: 'tgk_live_' + 'a'.repeat(64),
}

describe('handout template', () => {
  const md = handoutMarkdown(OPTS)

  it('carries the org name, app URL, ingest URL, and the raw key in all snippets', () => {
    expect(md).toContain('# Connect your agents — Acme Corp')
    expect(md).toContain(OPTS.appUrl)
    // curl + python + ts snippets each embed the key and endpoint
    expect(md.split(OPTS.rawKey).length - 1).toBeGreaterThanOrEqual(4)
    expect(md.split(OPTS.ingestUrl).length - 1).toBeGreaterThanOrEqual(4)
  })

  it('has no unresolved template placeholders', () => {
    expect(md).not.toMatch(/\$\{/)
    expect(md).not.toContain('undefined')
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
