/**
 * Agent registration contract (POST /ingest/register).
 *
 * Zero-import, shared by the Deno edge runtime and vitest — same pattern as
 * contract.ts. Registration is metadata about the agent as an operational
 * asset: identity, ownership, budget. The same strict allowlist and content
 * blocklist apply — an agent's "purpose" is a business label, never a system
 * prompt.
 */

export interface RegisterEvent {
  agent_id: string
  name: string
  department?: string
  purpose?: string
  owner_name?: string
  model?: string
  model_provider?: string
  unit_label?: string
  monthly_budget_usd?: number
  human_baseline_usd_per_unit?: number
}

export type RegisterValidationResult =
  | { ok: true; event: RegisterEvent }
  | { ok: false; errors: string[] }

const REQUIRED_STRINGS = ['agent_id', 'name'] as const
const OPTIONAL_STRINGS = [
  'department',
  'purpose',
  'owner_name',
  'model',
  'model_provider',
  'unit_label',
] as const
const OPTIONAL_NUMBERS = ['monthly_budget_usd', 'human_baseline_usd_per_unit'] as const

const MAX_LENGTHS: Record<string, number> = {
  agent_id: 100,
  name: 120,
  department: 80,
  purpose: 300,
  owner_name: 120,
  model: 80,
  model_provider: 80,
  unit_label: 40,
}

const ALLOWED_KEYS = new Set<string>([...REQUIRED_STRINGS, ...OPTIONAL_STRINGS, ...OPTIONAL_NUMBERS])

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
])

const isNonNegativeFinite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0

export function validateRegisterEvent(payload: unknown): RegisterValidationResult {
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
      errors.push(`"${key}": max ${MAX_LENGTHS[key]} characters — business labels, not free text`)
    }
  }

  for (const key of OPTIONAL_STRINGS) {
    const v = obj[key]
    if (v === undefined) continue
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push(`"${key}": non-empty string when provided`)
    } else if (v.length > MAX_LENGTHS[key]) {
      errors.push(`"${key}": max ${MAX_LENGTHS[key]} characters — business labels, not free text`)
    }
  }

  for (const key of OPTIONAL_NUMBERS) {
    const v = obj[key]
    if (v !== undefined && !isNonNegativeFinite(v)) {
      errors.push(`"${key}": non-negative number`)
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const optional: Record<string, unknown> = {}
  for (const key of [...OPTIONAL_STRINGS, ...OPTIONAL_NUMBERS]) {
    if (obj[key] !== undefined) optional[key] = obj[key]
  }
  return {
    ok: true,
    event: {
      agent_id: obj.agent_id as string,
      name: obj.name as string,
      ...optional,
    },
  }
}
