import { describe, expect, it } from 'vitest'
import { validateDeviationEvent } from './deviation-contract'

const VALID = {
  agent_id: 'invoice-processor',
  policy_id: 'pol-starter-1',
  description: 'Attempted to post a $14,200 transaction without human approval; blocked',
}

describe('deviation contract', () => {
  it('accepts a valid deviation', () => {
    expect(validateDeviationEvent(VALID).ok).toBe(true)
  })

  it('accepts an explicit timestamp with timezone', () => {
    expect(validateDeviationEvent({ ...VALID, timestamp: '2026-08-14T09:00:00Z' }).ok).toBe(true)
  })

  it.each(['prompt', 'output', 'transcript', 'evidence', 'messages'])(
    'rejects content field "%s"',
    (key) => {
      const r = validateDeviationEvent({ ...VALID, [key]: 'sensitive' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toContain('metadata-only contract')
    },
  )

  it('rejects unknown fields, over-length text, and bad timestamps', () => {
    expect(validateDeviationEvent({ ...VALID, severity: 'high' }).ok).toBe(false)
    expect(validateDeviationEvent({ ...VALID, description: 'x'.repeat(400) }).ok).toBe(false)
    expect(validateDeviationEvent({ ...VALID, timestamp: '2026-02-30T10:00:00Z' }).ok).toBe(false)
    expect(validateDeviationEvent({ ...VALID, timestamp: '2026-08-14T09:00:00' }).ok).toBe(false)
  })

  it('rejects missing required fields', () => {
    for (const key of ['agent_id', 'policy_id', 'description'] as const) {
      const bad = { ...VALID, [key]: undefined }
      expect(validateDeviationEvent(bad).ok, key).toBe(false)
    }
  })
})
