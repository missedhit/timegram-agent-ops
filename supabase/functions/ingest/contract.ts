/**
 * The metadata-only ingest contract.
 *
 * Self-contained validator with zero imports so the same file runs in the
 * Deno edge runtime AND under vitest (supabase/functions/ingest/contract.test.ts).
 *
 * Two rules make the platform's positioning an enforced architectural fact:
 *   1. Strict allowlist — unknown fields are rejected, not dropped.
 *   2. Content blocklist — fields that could carry prompt/output content get
 *      a distinct, quotable error.
 */

export interface IngestEvent {
  agent_id: string
  description: string
  business_process: string
  cost_center: string
  outcome: 'completed' | 'escalated' | 'failed'
  duration_sec: number
  cost_usd: number
  units: number
  /** Optional ISO 8601; defaults to now at insert time. */
  timestamp?: string
  /** Optional secondary detail. */
  tokens?: number
}

export type ValidationResult =
  | { ok: true; event: IngestEvent }
  | { ok: false; errors: string[] }

const REQUIRED_STRINGS = ['agent_id', 'description', 'business_process', 'cost_center'] as const
const OUTCOMES = ['completed', 'escalated', 'failed'] as const

const ALLOWED_KEYS = new Set<string>([
  ...REQUIRED_STRINGS,
  'outcome',
  'duration_sec',
  'cost_usd',
  'units',
  'timestamp',
  'tokens',
])

/**
 * Fields that could carry model I/O or customer content. These are rejected
 * with an explicit contract error rather than a generic unknown-key error —
 * the refusal is part of the product.
 */
const CONTENT_KEYS = new Set([
  'prompt',
  'prompts',
  'system_prompt',
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
])

const MAX_DESCRIPTION_LENGTH = 300

const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0

const isNonNegativeInt = (v: unknown): v is number => isNonNegativeNumber(v) && Number.isInteger(v)

export function validateIngestEvent(payload: unknown): ValidationResult {
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
    }
  }

  if (
    typeof obj.description === 'string' &&
    obj.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    errors.push(
      `"description": max ${MAX_DESCRIPTION_LENGTH} characters — descriptions are business summaries, not transcripts`,
    )
  }

  if (!OUTCOMES.includes(obj.outcome as (typeof OUTCOMES)[number])) {
    errors.push(`"outcome": must be one of ${OUTCOMES.join(', ')}`)
  }
  if (!isNonNegativeInt(obj.duration_sec)) errors.push('"duration_sec": non-negative integer seconds')
  if (!isNonNegativeNumber(obj.cost_usd)) errors.push('"cost_usd": non-negative number')
  if (!isNonNegativeInt(obj.units)) errors.push('"units": non-negative integer')

  if (obj.timestamp !== undefined) {
    if (typeof obj.timestamp !== 'string' || Number.isNaN(new Date(obj.timestamp).getTime())) {
      errors.push('"timestamp": ISO 8601 datetime string')
    }
  }
  if (obj.tokens !== undefined && !isNonNegativeInt(obj.tokens)) {
    errors.push('"tokens": non-negative integer')
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    event: {
      agent_id: obj.agent_id as string,
      description: obj.description as string,
      business_process: obj.business_process as string,
      cost_center: obj.cost_center as string,
      outcome: obj.outcome as IngestEvent['outcome'],
      duration_sec: obj.duration_sec as number,
      cost_usd: obj.cost_usd as number,
      units: obj.units as number,
      ...(obj.timestamp !== undefined ? { timestamp: obj.timestamp as string } : {}),
      ...(obj.tokens !== undefined ? { tokens: obj.tokens as number } : {}),
    },
  }
}
