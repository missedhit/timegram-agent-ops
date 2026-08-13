/**
 * Timegram Agent Ops reporter — the client side of the metadata-only ingest
 * contract. Zero dependencies; works in any Node 18+ / edge / browser runtime
 * with fetch.
 *
 * Design rules:
 *  - Contract violations throw MetadataContractError immediately (programmer
 *    error, same messages the server would return — the validator is the same
 *    module the edge function runs).
 *  - Network problems NEVER throw: reporting must never crash the host agent.
 *    Sends retry with backoff, then degrade to onError + { accepted: false }.
 */

import {
  validateIngestEvent,
  type IngestEvent,
} from '../../supabase/functions/ingest/contract'

export type { IngestEvent }

/** Per-event input; agent id and defaults-covered fields may come from the reporter. */
export type ReportInput = Omit<IngestEvent, 'agent_id' | 'business_process' | 'cost_center'> &
  Partial<Pick<IngestEvent, 'agent_id' | 'business_process' | 'cost_center'>>

export interface ReportResult {
  accepted: boolean
  /** Server-assigned task id when accepted. */
  id?: string
  /** Present when accepted is false. */
  error?: string
}

/** The event violated the metadata-only contract. Never sent over the wire. */
export class MetadataContractError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(`Event rejected by the metadata-only contract:\n  - ${errors.join('\n  - ')}`)
    this.name = 'MetadataContractError'
    this.errors = errors
  }
}

export interface TimegramReporterOptions {
  /** e.g. https://<project>.supabase.co/functions/v1/ingest */
  ingestUrl: string
  apiKey: string
  /** Registered agent id every event reports under (overridable per event). */
  agentId: string
  /** Defaults merged into every event. */
  defaults?: Partial<Pick<IngestEvent, 'business_process' | 'cost_center'>>
  /** Called when a send ultimately fails. Default: console.warn. */
  onError?: (error: Error, event: IngestEvent) => void
  /** Retries after the first attempt. Default 2. */
  maxRetries?: number
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
  /** Injectable for tests. */
  sleepImpl?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class TimegramReporter {
  private readonly opts: Required<Pick<TimegramReporterOptions, 'ingestUrl' | 'apiKey' | 'agentId'>> &
    TimegramReporterOptions

  constructor(options: TimegramReporterOptions) {
    for (const key of ['ingestUrl', 'apiKey', 'agentId'] as const) {
      if (!options[key]) throw new Error(`TimegramReporter: "${key}" is required`)
    }
    this.opts = options as typeof this.opts
  }

  /**
   * Validate locally and send one completed unit of work.
   * Throws MetadataContractError for contract violations; resolves
   * { accepted: false } (never throws) for network/server failures.
   */
  async report(input: ReportInput): Promise<ReportResult> {
    // Explicitly-undefined keys must not clobber reporter defaults.
    const provided = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    )
    const candidate = {
      agent_id: this.opts.agentId,
      ...this.opts.defaults,
      ...provided,
    }

    const result = validateIngestEvent(candidate)
    if (!result.ok) throw new MetadataContractError(result.errors)
    const event = result.event

    const fetchImpl = this.opts.fetchImpl ?? fetch
    const sleep = this.opts.sleepImpl ?? defaultSleep
    const maxRetries = this.opts.maxRetries ?? 2

    let lastError = 'unknown error'
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(250 * 2 ** (attempt - 1))
      try {
        const res = await fetchImpl(this.opts.ingestUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': this.opts.apiKey },
          body: JSON.stringify(event),
        })
        if (res.ok) {
          const body = (await res.json()) as { id?: string }
          return { accepted: true, id: body.id }
        }
        lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`
        // 4xx won't improve on retry — the server disagreed with this event.
        if (res.status >= 400 && res.status < 500) break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }

    const error = new Error(`Timegram report failed: ${lastError}`)
    ;(this.opts.onError ?? ((e: Error) => console.warn(e.message)))(error, event)
    return { accepted: false, error: lastError }
  }

  /**
   * Run one unit of agent work and report it automatically: duration is
   * measured, outcome is 'completed' on return and 'failed' on throw (the
   * original error is re-thrown after reporting). `finalize` can enrich the
   * event from the work's result — units processed, cost, a better description.
   */
  async track<T>(
    event: Omit<ReportInput, 'duration_sec' | 'outcome'> & { outcome?: IngestEvent['outcome'] },
    work: () => Promise<T>,
    finalize?: (result: T) => Partial<Omit<ReportInput, 'duration_sec'>>,
  ): Promise<T> {
    const startedAt = Date.now()
    const durationSec = () => Math.max(0, Math.round((Date.now() - startedAt) / 1000))

    try {
      const result = await work()
      await this.report({
        outcome: 'completed',
        ...event,
        ...(finalize ? finalize(result) : {}),
        duration_sec: durationSec(),
      })
      return result
    } catch (err) {
      await this.report({
        ...event,
        outcome: 'failed',
        duration_sec: durationSec(),
      })
      throw err
    }
  }
}
