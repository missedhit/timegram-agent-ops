/**
 * Client for the admin edge function — the only write path the dashboard
 * has (the browser never writes to the database directly). Plain fetch
 * rather than functions.invoke so 4xx bodies (validation lists, duplicate
 * names, the protected-org refusal) surface as readable messages.
 */

import { getSupabaseClient } from '../data/supabase/client'

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin`

export interface AdminKey {
  id: string
  label: string
  created_at: string
  revoked_at: string | null
}

export interface AdminOrg {
  id: string
  name: string
  timezone: string
  created_at: string
  protected: boolean
  counts: { members: number; agents: number; tasks: number }
  keys: AdminKey[]
}

export interface CreatedOrg {
  org: { id: string; name: string; timezone: string }
  owner_email: string
  owner_note: string
  raw_key: string
  key_id: string
  handout_markdown: string
}

export interface DeletionReport {
  deleted: true
  org: { id: string; name: string }
  /** null = the count could not be determined (a transient failure), not 0. */
  inventory: Record<string, number | null>
  orphaned_users: string[]
}

export class AdminApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = await getSupabaseClient()
  // Per-request token: getSession() refreshes when stale, so a dashboard tab
  // left open for hours keeps working.
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AdminApiError(401, 'Your session has expired — sign in again.')

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    errors?: string[]
  } & T
  if (!res.ok) {
    const message = body.errors?.join('\n') ?? body.error ?? `HTTP ${res.status}`
    throw new AdminApiError(res.status, message)
  }
  return body
}

export const adminApi = {
  listOrgs: () => adminFetch<{ orgs: AdminOrg[] }>('/orgs'),

  createOrg: (input: { name: string; owner_email: string; timezone: string }) =>
    adminFetch<CreatedOrg>('/orgs', { method: 'POST', body: JSON.stringify(input) }),

  issueKey: (orgId: string, label: string) =>
    adminFetch<{ raw_key: string; key_id: string; label: string }>(`/orgs/${orgId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  revokeKey: (keyId: string) =>
    adminFetch<{ revoked: true; key_id: string }>(`/keys/${keyId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  deleteOrg: (orgId: string, confirmName: string) =>
    adminFetch<DeletionReport>(`/orgs/${orgId}/delete`, {
      method: 'POST',
      body: JSON.stringify({ confirm_name: confirmName }),
    }),

  exportOrg: (orgId: string) => adminFetch<Record<string, unknown[]>>(`/orgs/${orgId}/export`),
}
