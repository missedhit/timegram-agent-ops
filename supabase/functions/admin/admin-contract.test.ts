import { describe, expect, it } from 'vitest'
import {
  isUuid,
  validateCreateOrg,
  validateDeleteOrg,
  validateIssueKey,
} from './admin-contract'

const VALID = { name: 'Acme Corp', owner_email: 'jane@acme.com' }

describe('admin contract: create org', () => {
  it('accepts a valid request and defaults the timezone', () => {
    const r = validateCreateOrg(VALID)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.request.timezone).toBe('America/New_York')
      expect(r.request.owner_email).toBe('jane@acme.com')
    }
  })

  it('trims and lowercases the owner email, trims the name', () => {
    const r = validateCreateOrg({ name: '  Acme Corp  ', owner_email: ' Jane@Acme.COM ' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.request.name).toBe('Acme Corp')
      expect(r.request.owner_email).toBe('jane@acme.com')
    }
  })

  it('accepts a valid IANA timezone and rejects an invalid one', () => {
    expect(validateCreateOrg({ ...VALID, timezone: 'America/Chicago' }).ok).toBe(true)
    const bad = validateCreateOrg({ ...VALID, timezone: 'Mars/Olympus_Mons' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.join(' ')).toContain('IANA')
  })

  it.each([
    ['missing name', { owner_email: 'a@b.co' }],
    ['empty name', { ...VALID, name: '  ' }],
    ['overlong name', { ...VALID, name: 'x'.repeat(121) }],
    ['missing email', { name: 'Acme' }],
    ['bad email', { ...VALID, owner_email: 'not-an-email' }],
    ['unknown field', { ...VALID, plan: 'enterprise' }],
    ['array body', [VALID]],
    ['null body', null],
  ])('rejects %s', (_label, payload) => {
    expect(validateCreateOrg(payload).ok).toBe(false)
  })
})

describe('admin contract: issue key', () => {
  it('defaults the label and accepts a custom one', () => {
    const d = validateIssueKey({})
    expect(d.ok && d.request.label).toBe('default')
    const c = validateIssueKey({ label: 'rotated-2026-08' })
    expect(c.ok && c.request.label).toBe('rotated-2026-08')
  })

  it('rejects empty, overlong, and unknown fields', () => {
    expect(validateIssueKey({ label: ' ' }).ok).toBe(false)
    expect(validateIssueKey({ label: 'x'.repeat(41) }).ok).toBe(false)
    expect(validateIssueKey({ name: 'x' }).ok).toBe(false)
  })
})

describe('admin contract: delete org', () => {
  it('requires confirm_name', () => {
    expect(validateDeleteOrg({}).ok).toBe(false)
    const r = validateDeleteOrg({ confirm_name: 'Acme Corp' })
    expect(r.ok && r.request.confirm_name).toBe('Acme Corp')
  })
})

describe('admin contract: uuid guard', () => {
  it('accepts canonical uuids and rejects everything else', () => {
    expect(isUuid('a2488910-9100-477a-8d10-6d4144aa713b')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('a2488910910047 7a8d106d4144aa713b')).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid('a2488910-9100-477a-8d10-6d4144aa713b/../x')).toBe(false)
  })
})
