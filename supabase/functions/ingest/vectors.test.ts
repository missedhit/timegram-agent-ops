/**
 * Golden-vector suite — the mechanical half of TS/Python SDK parity.
 *
 * vectors.json is the single source of truth for validator verdicts across
 * languages: this file runs every case through the TS validators, and
 * connector-py/test_timegram_reporter.py runs the same file through the
 * Python mirrors. A behavior change that shows up here without a matching
 * vector update is a contract drift by definition.
 *
 * Coverage rule: every validator branch has at least one vector. Cases with a
 * `note` pin cross-language quirks (UTF-16 lengths, JS trim set, hour-24
 * timestamps, bool-vs-int, double overflow) — do not "simplify" them away.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateIngestEvent } from './contract'
import { validateRegisterEvent } from './register-contract'
import { validateDeviationEvent } from './deviation-contract'

interface VectorCase {
  name: string
  contract: 'task' | 'register' | 'deviation'
  note?: string
  payload: unknown
  expect: { ok: boolean; errorIncludes?: string[] }
}

const file = JSON.parse(
  readFileSync(new URL('./vectors.json', import.meta.url), 'utf-8'),
) as { version: number; cases: VectorCase[] }

const validators = {
  task: validateIngestEvent,
  register: validateRegisterEvent,
  deviation: validateDeviationEvent,
} as const

describe('golden vectors', () => {
  it('is version 1 with unique case names', () => {
    expect(file.version).toBe(1)
    const names = file.cases.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('covers accept and reject verdicts for all three contracts', () => {
    for (const contract of ['task', 'register', 'deviation'] as const) {
      const of = file.cases.filter((c) => c.contract === contract)
      expect(of.some((c) => c.expect.ok), `${contract} accept`).toBe(true)
      expect(of.some((c) => !c.expect.ok), `${contract} reject`).toBe(true)
    }
  })

  it('pins at least one error message on every reject case', () => {
    for (const c of file.cases) {
      if (!c.expect.ok) {
        expect(c.expect.errorIncludes?.length, c.name).toBeGreaterThan(0)
      } else {
        expect(c.expect.errorIncludes, c.name).toBeUndefined()
      }
    }
  })

  for (const c of file.cases) {
    it(`${c.contract}: ${c.name}`, () => {
      const result = validators[c.contract](c.payload)
      expect(result.ok, c.note ?? c.name).toBe(c.expect.ok)
      if (!result.ok) {
        const joined = result.errors.join('\n')
        for (const substring of c.expect.errorIncludes ?? []) {
          expect(joined).toContain(substring)
        }
      }
    })
  }
})
