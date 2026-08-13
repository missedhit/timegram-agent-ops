/**
 * Simulates an agent reporting completed work to the ingest endpoint.
 *
 *   npm run emit:task                    # valid event → 201, appears in Work Log
 *   npm run emit:task -- --with-content  # includes a prompt field → 422 rejection
 *
 * The pair is the design-partner pitch: data flows in, and the platform
 * refuses anything that isn't metadata.
 */

// @ts-expect-error plain-JS helper without type declarations
import { loadEnvLocal } from './env.mjs'

const env = loadEnvLocal() as Record<string, string>
const url = env.INGEST_URL
const apiKey = env.INGEST_API_KEY
if (!url || !apiKey) {
  console.error('Missing INGEST_URL or INGEST_API_KEY in .env.local')
  process.exit(1)
}

const withContent = process.argv.includes('--with-content')

const event: Record<string, unknown> = {
  agent_id: 'ag-fin-ap',
  description: `Processed invoice batch #${9000 + Math.floor(Math.random() * 999)} — ${
    20 + Math.floor(Math.random() * 15)
  } invoices matched, 2 flagged for review`,
  business_process: 'Accounts payable',
  cost_center: 'Corporate',
  outcome: 'completed',
  duration_sec: 540 + Math.floor(Math.random() * 300),
  cost_usd: Number((3 + Math.random() * 4).toFixed(2)),
  units: 20 + Math.floor(Math.random() * 15),
  tokens: 350_000 + Math.floor(Math.random() * 150_000),
}

if (withContent) {
  event.prompt = 'Extract the vendor, amount and due date from the following invoice text: …'
}

console.log(`POST ${url}`)
console.log(JSON.stringify(event, null, 2))

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
  body: JSON.stringify(event),
})

const body = await res.json()
console.log(`\nHTTP ${res.status}`)
console.log(JSON.stringify(body, null, 2))
process.exit(res.status < 300 ? 0 : withContent ? 0 : 1)
