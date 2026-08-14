# Timegram Agent Ops — Reporter SDK

Report what your AI agents **did** — never what they said. This SDK sends
task-level business metadata to your Timegram Agent Ops workspace: description,
outcome, duration, cost, units of work. It is structurally incapable of sending
prompts, model output, or customer content: the same validator that guards the
server API runs inside the client, and content-carrying fields are rejected
before any network call.

Zero dependencies. Node 18+, edge runtimes, or browsers.

## Quickstart

```ts
import { TimegramReporter } from '@timegram/agent-ops-reporter'

const timegram = new TimegramReporter({
  ingestUrl: process.env.TIMEGRAM_INGEST_URL!,
  apiKey: process.env.TIMEGRAM_API_KEY!,
  agentId: 'ag-fin-expense', // your agent's id in the registry
  defaults: { business_process: 'Travel & expense', cost_center: 'Corporate' },
})

// Simplest form — report a completed unit of work:
await timegram.report({
  description: 'Audited 34 expense reports, 1 flagged for policy review',
  outcome: 'completed',
  duration_sec: 118,
  cost_usd: 0.82,
  units: 34,
  tokens: 310_000, // optional, secondary detail
})
```

Or let the SDK time the work and report the outcome automatically:

```ts
const result = await timegram.track(
  { description: 'Auditing expense batch #7412', cost_usd: 0.82, units: 34 },
  () => auditBatch(reports),                       // your agent's actual work
  (res) => ({ units: res.processed }),             // enrich from the result
)
// completed on return, failed (and re-thrown) on throw — duration measured.
```

## The metadata-only contract

| Field | Type | Required |
| --- | --- | --- |
| `description` | string, ≤300 chars, business language | ✔ |
| `business_process` | string | ✔ (or reporter default) |
| `cost_center` | string | ✔ (or reporter default) |
| `outcome` | `completed` \| `escalated` \| `failed` | ✔ |
| `duration_sec` | integer ≥ 0 | ✔ |
| `cost_usd` | number ≥ 0 | ✔ |
| `units` | integer ≥ 0 (invoices, claims, tickets…) | ✔ |
| `timestamp` | ISO 8601 (defaults to receive time) | optional |
| `tokens` | integer ≥ 0 | optional |

Anything else is rejected — unknown fields with a strict-allowlist error, and
content-carrying fields (`prompt`, `output`, `messages`, `content`,
`transcript`, …) with:

> `metadata-only contract — content fields are not accepted. This platform
> records what agents did, never what they said.`

Try it: `npm run example:agent -- --try-content` from the repo root.

## Registration and deviations

```ts
// Register (or enrich) the agent in the workspace registry — idempotent,
// typically called at startup:
await timegram.registerAgent({
  name: 'Expense Audit Agent',
  department: 'Finance',
  owner_name: 'Marcus Feld',
  unit_label: 'report',
  monthly_budget_usd: 400,
  human_baseline_usd_per_unit: 4.5,
})

// Report a policy departure (policy ids are on the workspace's Policies
// screen). Deviations arrive 'open'; resolution happens in the workspace.
await timegram.reportDeviation({
  policy_id: 'pol-starter-1',
  description: 'Approved a $12,400 batch without human sign-off; flagged',
})
```

An event that names an agent the registry hasn't seen auto-registers a minimal
agent (marked as such) so a first report never bounces — enrich it later with
`registerAgent`.

## Failure behavior

Reporting must never break your agent. Contract violations throw
`MetadataContractError` at the call site (that's a bug in the integration);
network and server failures never throw — sends retry with backoff, then
degrade to the `onError` callback and `{ accepted: false }`.

## Reference integration

[`example/expense-audit-agent.ts`](example/expense-audit-agent.ts) is a
complete worked example: a batch-processing agent reporting three tasks,
including an escalation, through `track()`.
