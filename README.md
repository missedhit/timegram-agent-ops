# Timegram Agent Ops — demo prototype

The HR + finance + audit layer for AI agents, demonstrated on a fictional
~300-person B2B SaaS company (**Coreline Software**) running 14 agents across
Finance, Support, Sales Ops, Engineering, and IT.

**Metadata-only by design:** the product records what agents did, when, at
what cost, and whether policy was followed. Prompt and output contents are
never stored or displayed anywhere in the app.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173.

**Live demo:** https://demo.timegram.io — deployed automatically from `main`
by GitHub Actions.

**Pinning the numbers for a pitch:** append `?asof=YYYY-MM-DD` to any URL
(e.g. `…/costs?asof=2026-08-01`) and the whole dataset anchors to that date —
useful when a screenshotted deck and a live demo need to agree. Without it,
data always covers the 90 days ending yesterday.

Other scripts: `npm test` (data consistency + narrative tests), `npm run build`
(typecheck + production build), `npm run lint`.

## The six screens

| Route | Screen | What it answers |
| --- | --- | --- |
| `/` | Agent Registry | What agents do we have, who owns them, what can they touch? |
| `/agents/:id` | Agent Detail | How is this one agent behaving — activity, cost, policies, deviations? |
| `/work-log` | Work Log | What exactly did the agents do, task by task? |
| `/costs` | Cost Dashboard | What does the agent workforce cost, and what does it replace? |
| `/policies` | SOP Policies & Deviations | What rules apply, and where did agents break them? |
| `/audit` | Audit Export | Can we prove any of this to an auditor? |

The Audit Export screen builds a printable evidence pack for one agent over one
period. **Export PDF** uses browser print; the print stylesheet drops the app
chrome so the PDF is a clean standalone document.

## Demo narratives baked into the data

1. **Incident Triage Agent (Engineering)** — ~131% of its monthly budget after
   an Opus 4.5 upgrade plus post-release alert-surge volume. Visible on the
   registry, the cost dashboard's budget alerts, and as a cost curve crossing
   the budget-pace line on its detail page.
2. **Refund & Credit Agent (Support)** — repeatedly violates "escalate refunds
   above $5,000"; recent deviations still open while older ones were resolved.
   The monthly deviation report shows the trend worsening (1 → 4 → 4) under
   log-only enforcement — the natural segue to "switch it to block mode."
3. **AP Invoice Agent (Finance)** — milder duplicate-invoice deviations so the
   feed looks organic rather than staged around two agents.

## Architecture

| Layer | Where | Notes |
| --- | --- | --- |
| Domain model | `src/domain/types.ts` | JSON-serializable — the shape a future API returns |
| Seed fixtures | `src/data/seed/fixtures.ts` | Hand-authored agents, policies, deviations, narratives |
| Generator | `src/data/seed/generate.ts` | Deterministic (seeded PRNG); dates always relative to today |
| Data access | `src/data/DataContext.tsx` | `useData()` behind a `DataSource` interface — swap the seed generator for an API client without touching screens |
| Aggregations | `src/data/selectors.ts` | Pure functions; every number in the UI is computed here from the single task list |
| Screens | `src/screens/` | One file per screen |
| UI primitives | `src/components/ui/`, `src/components/charts/` | Tables, badges, stat cards, filters, charts |

### Why generated seed data instead of a static file

1. The 90-day activity window always ends yesterday — the demo never looks stale.
2. Totals are computed, never hardcoded, so registry cards, cost dashboard,
   agent detail, work log, and evidence packs always agree (enforced by tests).
3. Same seed → same numbers on every load within a day.

### Tests

`npm test` covers determinism, referential integrity, cross-screen numeric
consistency (per-agent spend sums to the dashboard total; chart series sum to
the KPI cards; evidence packs match the work log), timezone/DST safety, and the
demo narratives themselves — if a seed edit ever breaks the "Incident Triage
is over budget" story, a test fails.

## Taking this to production

The demo constraints are deliberately confined to one file. To move to a real
backend, implement `DataSource.load()` in `src/data/DataContext.tsx` against
your API and delete `src/data/seed/`. Everything else — types, selectors,
screens, tests — carries over unchanged, because no screen imports seed data
directly.

Known demo-grade shortcuts, all intentional: no auth, no persistence, seed data
generated in the browser, and pagination/filtering done client-side over an
in-memory dataset.

## Deliberately out of scope

No auth, no backend, no real integrations, no prompt/output storage, no
multi-tenancy, no settings or onboarding flows.
