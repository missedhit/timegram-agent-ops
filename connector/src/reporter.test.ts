import { describe, expect, it, vi } from 'vitest'
import { MetadataContractError, TimegramReporter, type ReportInput } from './reporter'

const BASE: ReportInput = {
  description: 'Audited 12 expense reports, 1 flagged',
  business_process: 'Travel & expense',
  cost_center: 'Corporate',
  outcome: 'completed',
  duration_sec: 45,
  cost_usd: 0.82,
  units: 12,
}

const okResponse = () =>
  new Response(JSON.stringify({ id: 'task-ing-test', accepted: true }), { status: 201 })

function reporter(overrides: Partial<ConstructorParameters<typeof TimegramReporter>[0]> = {}) {
  return new TimegramReporter({
    ingestUrl: 'https://example.test/ingest',
    apiKey: 'k',
    agentId: 'ag-fin-expense',
    sleepImpl: () => Promise.resolve(),
    ...overrides,
  })
}

describe('TimegramReporter.report', () => {
  it('sends a valid event with auth header and returns the server id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const r = reporter({ fetchImpl })
    const result = await r.report(BASE)
    expect(result).toEqual({ accepted: true, id: 'task-ing-test' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://example.test/ingest')
    expect(init.headers['x-api-key']).toBe('k')
    expect(JSON.parse(init.body).agent_id).toBe('ag-fin-expense')
  })

  it('rejects content fields locally — nothing reaches the network', async () => {
    const fetchImpl = vi.fn()
    const r = reporter({ fetchImpl })
    await expect(
      r.report({ ...BASE, prompt: 'summarize this receipt…' } as unknown as ReportInput),
    ).rejects.toThrow(MetadataContractError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('carries the same error text the server uses', async () => {
    const r = reporter({ fetchImpl: vi.fn() })
    const err = await r
      .report({ ...BASE, output: 'x' } as unknown as ReportInput)
      .catch((e: MetadataContractError) => e)
    expect(err).toBeInstanceOf(MetadataContractError)
    expect((err as MetadataContractError).errors.join(' ')).toContain('metadata-only contract')
  })

  it('retries transient failures then succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse())
    const result = await reporter({ fetchImpl }).report(BASE)
    expect(result.accepted).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('never throws on exhausted retries — degrades to onError', async () => {
    const onError = vi.fn()
    const fetchImpl = vi.fn().mockRejectedValue(new Error('down'))
    const result = await reporter({ fetchImpl, onError, maxRetries: 2 }).report(BASE)
    expect(result.accepted).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('does not retry 4xx server verdicts', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ errors: ['bad'] }), { status: 422 }))
    const result = await reporter({ fetchImpl }).report(BASE)
    expect(result.accepted).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('merges reporter defaults under the event', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const r = reporter({
      fetchImpl,
      defaults: { business_process: 'Travel & expense', cost_center: 'Corporate' },
    })
    await r.report({ ...BASE, business_process: undefined, cost_center: undefined } as never)
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(sent.business_process).toBe('Travel & expense')
  })
})

describe('TimegramReporter.track', () => {
  it('reports completed with measured duration and finalizer enrichment', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const r = reporter({ fetchImpl })
    const result = await r.track(
      { ...BASE },
      async () => ({ processed: 34 }),
      (res) => ({ units: res.processed, description: `Audited ${res.processed} expense reports` }),
    )
    expect(result.processed).toBe(34)
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(sent.outcome).toBe('completed')
    expect(sent.units).toBe(34)
    expect(sent.duration_sec).toBeGreaterThanOrEqual(0)
  })

  it('reports failed and re-throws when the work throws', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse())
    const r = reporter({ fetchImpl })
    await expect(
      r.track({ ...BASE }, async () => {
        throw new Error('upstream system down')
      }),
    ).rejects.toThrow('upstream system down')
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(sent.outcome).toBe('failed')
  })
})
