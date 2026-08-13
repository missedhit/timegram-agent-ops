/**
 * Example integration: an "expense audit agent" reporting its work to
 * Timegram Agent Ops. This is the reference code a design partner adapts —
 * the SDK wraps each unit of business work; nothing about the agent's model,
 * prompts, or outputs ever leaves the process.
 *
 * Run from the repo root:
 *   npm run example:agent                  # 3 tasks appear in the Work Log
 *   npm run example:agent -- --try-content # shows the client-side refusal
 *
 * Config comes from the environment (the npm script loads .env.local):
 *   INGEST_URL, INGEST_API_KEY
 */

import { MetadataContractError, TimegramReporter } from '../src'

const reporter = new TimegramReporter({
  ingestUrl: process.env.INGEST_URL ?? '',
  apiKey: process.env.INGEST_API_KEY ?? '',
  agentId: 'ag-fin-expense', // Expense Audit Agent in the registry
  defaults: { business_process: 'Travel & expense', cost_center: 'Corporate' },
})

/** Stand-in for real agent work (an LLM call, a rules engine, an RPA step…). */
const auditBatch = async (reports: number) => {
  await new Promise((r) => setTimeout(r, 400 + Math.random() * 800))
  return { reports, flagged: Math.random() < 0.5 ? 1 : 0 }
}

async function main() {
  if (process.argv.includes('--try-content')) {
    // What happens if an integration tries to attach model I/O:
    try {
      await reporter.report({
        description: 'Audited expense batch',
        outcome: 'completed',
        duration_sec: 30,
        cost_usd: 0.5,
        units: 10,
        // @ts-expect-error — the types already forbid this; the runtime
        // contract catches untyped callers too.
        prompt: 'You are an expense auditor. Review the following receipts: …',
      })
    } catch (err) {
      if (err instanceof MetadataContractError) {
        console.log('Rejected client-side, before any network call:\n')
        console.log(err.message)
        return
      }
      throw err
    }
    return
  }

  console.log('Expense audit agent starting a run of 3 batches…\n')

  for (const batchSize of [28, 34, 19]) {
    const batchNo = 7000 + Math.floor(Math.random() * 999)
    await reporter.track(
      {
        description: `Audited expense report batch #${batchNo}`,
        cost_usd: Number((batchSize * 0.024).toFixed(2)),
        units: batchSize,
        tokens: batchSize * 9000,
      },
      () => auditBatch(batchSize),
      ({ reports, flagged }) => ({
        description: `Audited ${reports} expense reports in batch #${batchNo}, ${flagged} flagged for policy review`,
        ...(flagged > 0 ? { outcome: 'escalated' as const } : {}),
      }),
    )
    console.log(`  reported batch #${batchNo} (${batchSize} reports)`)
  }

  console.log('\nDone — open the Work Log to see the run.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
