import { describe, expect, it } from 'vitest'
import { pickActiveOrg, type OrgSummary } from './OrgContext'

const ORGS: OrgSummary[] = [
  { id: 'org-a', name: 'Acme Test', timezone: 'America/Chicago' },
  { id: 'org-b', name: 'Coreline Software', timezone: 'America/New_York' },
]

describe('pickActiveOrg', () => {
  it('returns the stored org when it is still a membership', () => {
    expect(pickActiveOrg(ORGS, 'org-b')?.id).toBe('org-b')
  })

  it('falls back to the first org when the stored id is stale or absent', () => {
    expect(pickActiveOrg(ORGS, 'org-gone')?.id).toBe('org-a')
    expect(pickActiveOrg(ORGS, null)?.id).toBe('org-a')
  })

  it('returns null with no memberships', () => {
    expect(pickActiveOrg([], 'org-a')).toBeNull()
  })
})
