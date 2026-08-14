import { describe, expect, it } from 'vitest'
import { validateRegisterEvent } from './register-contract'

const VALID = {
  agent_id: 'invoice-processor',
  name: 'Invoice Processor',
}

describe('agent registration contract', () => {
  it('accepts minimal registration (id + name)', () => {
    const r = validateRegisterEvent(VALID)
    expect(r.ok).toBe(true)
  })

  it('accepts full enrichment', () => {
    const r = validateRegisterEvent({
      ...VALID,
      department: 'Finance',
      purpose: 'Processes vendor invoices with 3-way matching',
      owner_name: 'Priya Raman',
      model: 'GPT-5',
      model_provider: 'OpenAI',
      unit_label: 'invoice',
      monthly_budget_usd: 1500,
      human_baseline_usd_per_unit: 2.1,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.event.unit_label).toBe('invoice')
  })

  it.each(['prompt', 'system_prompt', 'instructions', 'messages', 'content'])(
    'rejects content field "%s" with the metadata-only error',
    (key) => {
      const r = validateRegisterEvent({ ...VALID, [key]: 'You are an invoice auditor…' })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.join(' ')).toContain('metadata-only contract')
    },
  )

  it('rejects unknown fields and over-length labels', () => {
    expect(validateRegisterEvent({ ...VALID, custom: 'x' }).ok).toBe(false)
    expect(validateRegisterEvent({ ...VALID, purpose: 'x'.repeat(400) }).ok).toBe(false)
    expect(validateRegisterEvent({ ...VALID, name: 'x'.repeat(200) }).ok).toBe(false)
  })

  it('rejects bad numbers and empty optionals', () => {
    expect(validateRegisterEvent({ ...VALID, monthly_budget_usd: -5 }).ok).toBe(false)
    expect(validateRegisterEvent({ ...VALID, monthly_budget_usd: Infinity }).ok).toBe(false)
    expect(validateRegisterEvent({ ...VALID, human_baseline_usd_per_unit: 'two' }).ok).toBe(false)
    expect(validateRegisterEvent({ ...VALID, department: '' }).ok).toBe(false)
  })

  it('rejects missing required fields and non-objects', () => {
    expect(validateRegisterEvent({ name: 'No Id' }).ok).toBe(false)
    expect(validateRegisterEvent({ agent_id: 'x' }).ok).toBe(false)
    expect(validateRegisterEvent(null).ok).toBe(false)
    expect(validateRegisterEvent([VALID]).ok).toBe(false)
  })
})
