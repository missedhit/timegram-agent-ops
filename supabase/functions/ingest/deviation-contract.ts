/**
 * Policy deviation contract (POST /ingest/deviation).
 *
 * Zero-import, shared by the Deno edge runtime and vitest. A deviation is a
 * metadata record that a policy was departed from — what happened in business
 * language, never the content that triggered it. Deviations arrive with
 * status 'open'; resolution is a human act performed in the workspace, not an
 * API write.
 */

export interface DeviationEvent {
  agent_id: string
  policy_id: string
  description: string
  /** Optional ISO 8601; defaults to now at insert time. */
  timestamp?: string
}

export type DeviationValidationResult =
  | { ok: true; event: DeviationEvent }
  | { ok: false; errors: string[] }

const REQUIRED_STRINGS = ['agent_id', 'policy_id', 'description'] as const

const MAX_LENGTHS: Record<(typeof REQUIRED_STRINGS)[number], number> = {
  agent_id: 100,
  policy_id: 100,
  description: 300,
}

const ALLOWED_KEYS = new Set<string>([...REQUIRED_STRINGS, 'timestamp'])

const CONTENT_KEYS = new Set([
  'prompt',
  'prompts',
  'system_prompt',
  'instructions',
  'completion',
  'completions',
  'input',
  'inputs',
  'output',
  'outputs',
  'message',
  'messages',
  'content',
  'contents',
  'transcript',
  'response',
  'responses',
  'conversation',
  'text',
  'body',
  'attachments',
  'tool_input',
  'tool_output',
  'evidence',
])

const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

const isValidTimestamp = (t: string): boolean => {
  if (!TIMESTAMP_RE.test(t)) return false
  if (Number.isNaN(new Date(t).getTime())) return false
  const [y, m, d] = t.slice(0, 10).split('-').map(Number)
  const check = new Date(Date.UTC(y, m - 1, d))
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
}

export function validateDeviationEvent(payload: unknown): DeviationValidationResult {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, errors: ['body must be a JSON object'] }
  }
  const obj = payload as Record<string, unknown>
  const errors: string[] = []

  for (const key of Object.keys(obj)) {
    if (CONTENT_KEYS.has(key)) {
      errors.push(
        `"${key}": metadata-only contract — content fields are not accepted. ` +
          'This platform records what agents did, never what they said.',
      )
    } else if (!ALLOWED_KEYS.has(key)) {
      errors.push(`"${key}": unknown field (strict allowlist)`)
    }
  }

  for (const key of REQUIRED_STRINGS) {
    const v = obj[key]
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`"${key}": required non-empty string`)
    } else if (v.length > MAX_LENGTHS[key]) {
      errors.push(
        key === 'description'
          ? `"description": max ${MAX_LENGTHS.description} characters — descriptions are business summaries, not transcripts`
          : `"${key}": max ${MAX_LENGTHS[key]} characters — business labels, not free text`,
      )
    }
  }

  if (obj.timestamp !== undefined) {
    if (typeof obj.timestamp !== 'string' || !isValidTimestamp(obj.timestamp)) {
      errors.push(
        '"timestamp": ISO 8601 datetime string with explicit timezone (e.g. 2026-08-14T09:00:00Z)',
      )
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    event: {
      agent_id: obj.agent_id as string,
      policy_id: obj.policy_id as string,
      description: obj.description as string,
      ...(obj.timestamp !== undefined ? { timestamp: obj.timestamp as string } : {}),
    },
  }
}
