/**
 * Request contracts for the admin edge function (POST /admin/*). Zero-import,
 * shared by the Deno edge runtime and vitest — same pattern as the ingest
 * contracts. Strict allowlists: unknown fields are rejected, not dropped.
 */

export interface CreateOrgRequest {
  name: string
  owner_email: string
  timezone: string
}

export type AdminValidation<T> = { ok: true; request: T } | { ok: false; errors: string[] }

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value)

const DEFAULT_TIMEZONE = 'America/New_York'

// Deliberately loose: real deliverability is proven by the magic link, not a
// regex. This only rejects obvious non-addresses before creating auth users.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

const scanKeys = (obj: Record<string, unknown>, allowed: string[], errors: string[]) => {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`"${key}": unknown field (strict allowlist)`)
  }
}

const asObject = (payload: unknown): Record<string, unknown> | null =>
  typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null

export function validateCreateOrg(payload: unknown): AdminValidation<CreateOrgRequest> {
  const obj = asObject(payload)
  if (!obj) return { ok: false, errors: ['body must be a JSON object'] }
  const errors: string[] = []

  scanKeys(obj, ['name', 'owner_email', 'timezone'], errors)

  if (!isNonEmptyString(obj.name)) {
    errors.push('"name": required non-empty string')
  } else if (obj.name.trim().length > 120) {
    errors.push('"name": max 120 characters')
  }

  if (!isNonEmptyString(obj.owner_email)) {
    errors.push('"owner_email": required non-empty string')
  } else if (obj.owner_email.trim().length > 254 || !EMAIL_RE.test(obj.owner_email.trim())) {
    errors.push('"owner_email": must be a plausible email address')
  }

  let timezone = DEFAULT_TIMEZONE
  if (obj.timezone !== undefined) {
    if (!isNonEmptyString(obj.timezone)) {
      errors.push('"timezone": non-empty string when provided')
    } else if (!Intl.supportedValuesOf('timeZone').includes(obj.timezone.trim())) {
      errors.push('"timezone": must be a valid IANA timezone (e.g. America/New_York)')
    } else {
      timezone = obj.timezone.trim()
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    request: {
      name: (obj.name as string).trim(),
      owner_email: (obj.owner_email as string).trim().toLowerCase(),
      timezone,
    },
  }
}

export function validateIssueKey(payload: unknown): AdminValidation<{ label: string }> {
  const obj = asObject(payload)
  if (!obj) return { ok: false, errors: ['body must be a JSON object'] }
  const errors: string[] = []

  scanKeys(obj, ['label'], errors)

  let label = 'default'
  if (obj.label !== undefined) {
    if (!isNonEmptyString(obj.label)) {
      errors.push('"label": non-empty string when provided')
    } else if (obj.label.trim().length > 40) {
      errors.push('"label": max 40 characters')
    } else {
      label = obj.label.trim()
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, request: { label } }
}

export function validateDeleteOrg(payload: unknown): AdminValidation<{ confirm_name: string }> {
  const obj = asObject(payload)
  if (!obj) return { ok: false, errors: ['body must be a JSON object'] }
  const errors: string[] = []

  scanKeys(obj, ['confirm_name'], errors)

  if (!isNonEmptyString(obj.confirm_name)) {
    errors.push('"confirm_name": required — type the organization name exactly to confirm deletion')
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, request: { confirm_name: (obj.confirm_name as string).trim() } }
}
