import { describe, expect, it } from 'vitest'
import { validateIngestEvent } from './contract'

const VALID = {
  agent_id: 'ag-fin-ap',
  description: 'Processed invoice batch #4471, flagged 3 for review',
  business_process: 'Accounts payable',
  cost_center: 'Corporate',
  outcome: 'completed',
  duration_sec: 312,
  cost_usd: 4.18,
  units: 42,
}

describe('metadata-only ingest contract', () => {
  it('accepts a valid business event', () => {
    const r = validateIngestEvent(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.event.agent_id).toBe('ag-fin-ap')
  })

  it('accepts optional timestamp and tokens', () => {
    const r = validateIngestEvent({ ...VALID, timestamp: '2026-08-14T09:00:00Z', tokens: 84213 })
    expect(r.ok).toBe(true)
  })

  it.each(['prompt', 'completion', 'output', 'input', 'messages', 'content', 'transcript', 'tool_output'])(
    'rejects content field "%s" with the metadata-only error',
    (key) => {
      const r = validateIngestEvent({ ...VALID, [key]: 'sensitive text' })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.errors.join(' ')).toContain('metadata-only contract')
        expect(r.errors.join(' ')).toContain(key)
      }
    },
  )

  it('rejects unknown fields rather than dropping them', () => {
    const r = validateIngestEvent({ ...VALID, custom_blob: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('unknown field')
  })

  it('rejects transcript-length descriptions', () => {
    const r = validateIngestEvent({ ...VALID, description: 'x'.repeat(400) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain('not transcripts')
  })

  it.each([
    [{ ...VALID, outcome: 'done' }, 'outcome'],
    [{ ...VALID, duration_sec: -5 }, 'duration_sec'],
    [{ ...VALID, cost_usd: 'four dollars' }, 'cost_usd'],
    [{ ...VALID, units: 1.5 }, 'units'],
    [{ ...VALID, timestamp: 'yesterday' }, 'timestamp'],
    [{ ...VALID, agent_id: '' }, 'agent_id'],
  ])('rejects bad values (%#)', (payload, field) => {
    const r = validateIngestEvent(payload)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toContain(field)
  })

  it('rejects non-object bodies', () => {
    for (const bad of [null, [], 'string', 42]) {
      expect(validateIngestEvent(bad).ok).toBe(false)
    }
  })
})
