# PoC environment — working plan (COMPLETE — see remaining founder gates)

> Last updated 2026-08-14 (third session). **ALL MILESTONES M0–M5 ARE DONE
> and every adversarial review is ABSORBED** (M0 timezone fixes; M1+M2: 10
> findings; M3: 9 findings; M5 final review: 11 findings). The M5 acceptance
> dry-run passed on 2026-08-14: org:create "Demo Prospect Inc" → handout →
> Python example + deviation via the handout key (3 tasks, 1 open deviation
> on pol-starter-1, 5 starter policies) → org:export → org:delete --yes →
> clean, with Northbridge protected behind --force. Day-to-day operations
> now live in **docs/poc-runbook.md** — that is the working document from
> here on; this plan is the record.
>
> **M6 (post-plan addition, same session): the org lifecycle is now
> UI-driven.** A Platform Admin screen at /admin (visible only to
> platform_admins members; founder bootstrapped) covers create-org +
> handout download, key issue/revoke, JSON export, and delete — backed by a
> new `admin` edge function (service-role writes, session-JWT + 
> platform_admins gate, CORS for the app origins, audit lines in function
> logs). The browser still never writes to the DB. CLI scripts remain as
> fallback; the runbook is UI-first. Verified: 24-check server gauntlet
> (auth chain, lifecycle, ingest parity with a dashboard-issued key,
> Northbridge protection) + full UI click-through with a throwaway admin.
>
> **Remaining founder gates (all in the runbook as numbered steps):**
> 1. Resend SMTP before the first prospect login (built-in email ~2/hr) —
>    runbook "Pre-prospect hygiene §1".
> 2. Rotate the personal access token + service-role key that passed
>    through chat — runbook "Pre-prospect hygiene §2" (read it first: the
>    legacy JWT rotation also swaps the anon key and needs a Cloudflare
>    Pages env update + redeploy in the same sitting).
> 3. The full incognito acceptance run from the runbook alone (after SMTP):
>    onboard a throwaway org end to end in under 10 minutes.
> 4. Small M4 leftover: phone login + org-switch spot check.

## Where things stand right now

| Thing | State |
| --- | --- |
| Public demo | https://demo.timegram.io — done, seed mode, auto-deploys from `main` |
| Live app | **https://agentworkforce.timegram.io — hosted on Cloudflare Pages, auto-deploys from `main`** (localhost:5173 still works for dev) |
| Supabase | Project `eaeqqipehxxaypvzdxcv`: schema + RLS + magic-link auth + ingest function, all live |
| Connectors | TypeScript SDK in `connector/` AND Python (`connector-py/timegram_reporter.py`, stdlib-only, copy-paste distribution) — parity enforced by shared golden vectors in CI |
| Tests | 214 vitest + 32 unittest green, both suites in CI on every push |
| Onboarding kit | **UI-driven: Platform Admin screen at /admin** (create org + handout, keys, export, delete) backed by the `admin` edge function; CLI scripts (`org:create` etc.) as fallback; docs/poc-runbook.md is UI-first |
| M0–M6 | ✅ All done, adversarial reviews absorbed (M0: timezone fixes; M1+M2: 10 findings; M3: 9; M5: 11; M6: pending review) |

**Next action: none in this plan — operate via docs/poc-runbook.md.** The
founder gates listed in the header are the only outstanding work.

## Resuming from another device (phone, web, another laptop)

Point a new Claude Code session at the repo `missedhit/timegram-agent-ops` and say:
**"Read docs/poc-plan.md and continue from M0."** That's enough context to resume.

**Can be done from anywhere** (code lives in git, tests run in CI on push):
- All of M0, M1, M2 code + contracts + tests
- M3 Python reporter and golden vectors
- Docs, runbook, handout templates (M5 authoring)

**Needs the Windows dev machine** (secrets live in git-ignored `.env.local`;
see `.env.example` for the shape):
- Applying migrations (`node scripts/apply-migrations.mjs`), seeding, deploying
  edge functions — all need `SUPABASE_ACCESS_TOKEN` / service-role key
- Browser verification of the live app and demo
- Anything touching the Supabase project directly

So from a phone: author and push; land the machine-bound steps in the next
desktop session. Every milestone below marks its own founder gates.

**Founder gates still outstanding:** Resend SMTP + secret rotation + the
incognito acceptance run (all M5 hygiene — exact steps in
docs/poc-runbook.md). M4's Cloudflare gate is done. Everything else is
scripted.

---

# Timegram Agent Ops — Prospect-ready PoC environment

## Context

The demo (demo.timegram.io) and the single-org live foundation are done, but a demo doesn't close clients. The founder needs a **live PoC environment to hand serious prospects**: they log in at **agentworkforce.timegram.io**, connect their real agents easily (any stack), and watch their own registry/work-log/costs/policies/audit screens fill up. (`app.timegram.io` is already taken by an existing Timegram product — this new app must not touch it.) Today the live app is localhost-only, hard-wired to one org (`DEMO_ORG_ID` in `src/data/supabase/mappers.ts`), gated by a single shared ingest key, agents exist only via seed fixtures, and `Department` is a 5-value union with a DB CHECK.

Founder decisions (fixed): **Cloudflare Pages** hosting at **agentworkforce.timegram.io** · **Python reporter** added (TS exists; npm publish deferred — copy-paste/git distribution for PoC) · **org-per-prospect** in the one Supabase project (RLS isolation) · **deviation reporting via API in scope**.

Constraints: seed mode / public demo stays byte-identical (94+ tests green throughout); Windows dev, hosted-only Supabase (Management-API migrations via `scripts/apply-migrations.mjs`); zero-import contract modules shared Deno/vitest; no client-side DB writes ever; solo founder → scripts over admin UIs, exact numbered clicks for every gate; each milestone ends with a founder-visible checkpoint + adversarial review (established rhythm).

## Key architecture decisions

1. **OrgProvider** (new `src/data/OrgContext.tsx`) between `AuthGate` and `DataProvider` (live only): loads memberships+orgs (readable under existing RLS), exposes `{orgs, activeOrg, setActiveOrg}`, renders `NoWorkspaceAccess` (moves here from DataContext) when none, header dropdown when >1 (founder). Active org in `localStorage`, validated against memberships. `SupabaseDataSource` → factory `makeSupabaseDataSource(orgId)`; `DataProvider` already reloads on `source` change. Org name via `useOrgName()` replaces 5 hard-coded "Northbridge Mutual" strings (Header, Sidebar, Registry, AuditExport ×2); seed mode provides the constant.
2. **`fromRows(rows, generatedAt, {dimensions})`**: default `'seed-fixtures'` (round-trip test untouched); live passes `'derived'` — departments/costCenters = sorted uniques from data.
3. **Per-org API keys, hashed at rest**: `api_keys(org_id, key_hash sha256, label, created_at, revoked_at)`, service-role only. Raw `tgk_live_…` shown once at issuance; app never displays keys.
4. **One edge function, three routes**: `POST /ingest` (task), `/ingest/register` (agent upsert), `/ingest/deviation`. Org resolved from key-hash lookup — org identity can ONLY come from the key.
5. **Auto-registration**: task event with unknown `agent_id` → FK 23503 → create minimal agent (purpose "Auto-registered from first report — enrich via /ingest/register", `sort_order` 1e6) → retry once → 201 with `auto_registered_agent: true`. A prospect's first event must never bounce.
6. **Golden vectors** (`supabase/functions/ingest/vectors.json`): ~30–40 valid/invalid payloads + expected verdicts per contract, consumed by BOTH vitest and the Python tests — SDK parity enforced mechanically.

## M0 — Land the org-timezone review findings (first; fixes are review-validated)

1. **Empty-workspace crash (high)**: `fromRows` with agents-but-no-tasks yields `rangeEnd: ''` → RangeError blank screen (NY mode) / infinite `dailySeries` loop (local). Fix in `src/data/supabase/mappers.ts:369`: fall back to `dayOf(generatedAt)` for both range ends when no tasks. Add fromRows-empty + dailySeries-termination tests.
2. **Midnight-gap DST convergence (medium)**: `startOfDayEpoch` two-pass fails for timezones whose spring-forward starts at 00:00 (Santiago/Havana — NY safe today). Fix in `src/lib/orgTime.ts`: iterate until converged, clamp to first existing instant of the day; add partition tests for America/Santiago 2026-09-06 + America/Havana 2026-03-08.
3. **Guardrail text vs Eastern buckets (medium)**: seeder bakes breach-day $ amounts in seeder-local (Karachi) days; live app re-buckets Eastern. Fix: `generate.ts` guardrailBreaches buckets via `dayOf` (behavior-identical in local mode); `scripts/seed-supabase.ts` calls `setOrgTimeZone(LIVE_ORG_TIMEZONE)` before `buildDataSet`; **reseed the live org** after.

Checkpoint: tests green (+new), demo pinned-URL byte-identical, live org reseeded, task #12 closed.

## M1 — Multi-tenant app

- Migration `20260815000100_free_form_departments.sql`: drop `agents` department + model_provider CHECKs (confirm auto-generated constraint names via a pg_constraint query through the migrations script first). `Department`/`ModelProvider` → `string` in `src/domain/types.ts`.
- OrgProvider + org dropdown + org-name plumbing per decision 1; `makeSupabaseDataSource(orgId)` + `dimensions: 'derived'`.
- **Empty-org UX + NaN guards** (verified spots): Registry zero-agents → "Connect your first agent" panel (ingest URL + TS/Python snippets with `YOUR_API_KEY` placeholder); AgentDetail `budgetPct` (÷0) + `budgetPerDay` line → hide when budget 0 ("No monthly budget set"); CostDashboard `totalBudget/30` + "$0 combined budget" copy; unitEconomics baseline-0 rows filtered from Cost-per-outcome ("no human baseline set" on detail); AuditExport zero-agents panel instead of `return null`; WorkLog/Policies empty-table notes. Already safe: budgetStatuses, agentPerformance, avgTaskCost, fmtDate('').
- Minimal `scripts/org-create.ts` (org row + owner membership via existing `grantMembership` pattern in `scripts/seed-supabase.ts`).
- Tests: pickActiveOrg unit tests; derived-dimensions test; empty-DataSet selector sweep (no NaN/Infinity, termination).

Checkpoint: founder creates "Acme Test", signs in, switches orgs via header dropdown, all 5 screens render cleanly with zeros; demo unchanged; review.

## M2 — Multi-tenant ingest + registration

- Migrations: `api_keys` table (above); `ingest_hardening_2` char-length CHECKs on deviations.description + agents name/purpose/owner_name/unit_label/model/department.
- `supabase/functions/ingest/index.ts` v2: key-hash → org lookup (401 otherwise; delete INGEST_API_KEY/INGEST_ORG_ID usage), pathname routing, auto-registration, deviation insert (id `dev-ing-<hex>` — safe from seed GC regexes, status open, no resolution via API), unknown policy_id → 422 with the policy name hint.
- New zero-import contracts + tests: `register-contract.ts` (required agent_id ≤100, name ≤120; optional department/purpose/owner_name/model/unit_label/monthly_budget_usd/human_baseline_usd_per_unit, all capped; same content blocklist), `deviation-contract.ts` (agent_id, policy_id ≤100, description ≤300, optional strict timestamp). Widen vitest include to `supabase/functions/**/*-contract.test.ts` pattern (keep index.ts out).
- SDK: `registerAgent()`, `reportDeviation()` on `connector/src/reporter.ts` (client-side validation, same never-throw network semantics); example agent registers at startup + demos a deviation; README update.
- `scripts/org-key.ts` — `--issue/--list/--revoke`; `tgk_live_<32 bytes hex>`, printed once, hash stored.
- Deploy: `npx supabase functions deploy ingest … --no-verify-jwt`; `npx supabase secrets unset INGEST_API_KEY INGEST_ORG_ID`. Update `.env.local` INGEST_API_KEY to a per-org key (Northbridge) so `emit:task`/`example:agent` keep working.

Checkpoint: Acme key → emit:task lands in Acme Work Log with auto-registered agent; `--with-content` 422; register curl enriches the agent live; deviation curl appears on Policies; Northbridge isolated on its own key. Review focus: cross-org isolation, routing edge cases, bounded auto-register retry.

## M3 — Python reporter + golden vectors

- `supabase/functions/ingest/vectors.json` (format: `{version, cases:[{name, contract: task|register|deviation, payload, expect:{ok, errorIncludes[]}}]}`; coverage rule: every validator branch ≥1 vector) + `vectors.test.ts` (vitest dispatch to the three validators).
- `connector-py/timegram_reporter.py` — single file, **stdlib only** (urllib; no pip deps → copy-paste distribution): full mirrored validator + `MetadataContractError`, `TimegramReporter.report/register_agent/report_deviation`, `track()` as context manager (completed on exit, failed+re-raise on exception), retries/never-crash, 4xx no-retry. Watch Python traps: `bool` is `int`, int/float boundaries, timestamp regex parity.
- `connector-py/test_timegram_reporter.py` — **`python -m unittest`** (no pytest dep), loads vectors.json relatively + stubbed-transport tests. `connector-py/README.md` + `example_expense_agent.py`.
- CI: add Python 3.12 job (`actions/setup-python@v5` + unittest discover).

Checkpoint: Python example fills Acme Work Log; both test suites green in one CI run. Review focus: validator parity.

## M4 — Hosted live app on Cloudflare Pages

- Repo: `public/_redirects` (`/* /index.html 200`) — inert on GH Pages (demo keeps its 404.html mechanism); `scripts/set-auth-config.mjs` — PATCH auth config: `site_url: 'https://agentworkforce.timegram.io'`, `uri_allow_list: 'http://localhost:5173,https://agentworkforce.timegram.io'`.
- **Founder gate (exact clicks)**: create Cloudflare account → Workers & Pages → Create → Pages → Connect to Git → `missedhit/timegram-agent-ops`; build command `npm run build`, output `dist`, env vars `VITE_DATA_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (safe-public; RLS is the boundary), **`NODE_VERSION=22`**; deploy; Custom domains → add `agentworkforce.timegram.io` (CNAME `agentworkforce` → `<project>.pages.dev`, added wherever the `demo` CNAME lives — **do not touch the existing `app` record**); then run set-auth-config script.
- Note: every push deploys demo (GH Pages, seed) AND app (CF Pages, live); CF preview URLs are auth-gated, magic links resolve to production Site URL (fine for PoC, documented in runbook).

Checkpoint: founder logs into https://agentworkforce.timegram.io from their phone, switches orgs, sees live data; deep link `/costs` survives cold load; demo unchanged; the pre-existing app.timegram.io product is untouched.

## M5 — Onboarding kit + ops hygiene

- `scripts/org-create.ts` (full): org row (duplicate-name refusal) → starter policies from `scripts/data/starter-policies.ts` (5 generic: >$10k transaction escalation [block], PII boundary [block], external-comms human review [log-only], approved-tools-only [block], 120%-budget acknowledgment [log-only]) → owner user via `auth.admin.createUser({email, email_confirm: true})` (works with signups disabled; login flow then identical to daily use) → org_members → API key → writes `handouts/CONNECT-<slug>.md` (git-ignored): app URL, ingest URL, their key, TS + Python + curl snippets, metadata-only paragraph.
- `scripts/org-key.ts` finalize; `scripts/org-delete.ts` (`--yes`, cascades); `scripts/export-org.ts` (JSON dump per table — backup posture on Free tier which has **no automated backups**; upgrade trigger = first real prospect live).
- `docs/poc-runbook.md`: onboard-in-10-min, support (edge-function logs path, common 401/422s), offboard, key rotation, org switcher.
- **Pre-prospect hygiene (founder-gated, in runbook as numbered steps)**: (1) rotate service-role key + personal access token (both passed through chat) — dashboard paths + which env entries to update (`.env.local`; CF Pages holds only anon key; edge functions auto-follow rotation; GH Actions holds no Supabase secrets); (2) **custom SMTP before first prospect login** — built-in email is ~2/hr; Resend free tier: verify timegram.io (DKIM/SPF DNS), API key → Supabase Auth SMTP settings (host smtp.resend.com:465, user `resend`, sender no-reply@timegram.io), test with a non-founder address.

Checkpoint (the acceptance test for the whole plan): founder onboards "Demo Prospect Inc" **from the runbook alone** — org:create → handout → incognito login via Resend-delivered magic link → `python example_expense_agent.py` with the handout key → data on all screens — in under 10 minutes; then org-delete cleans up. Final adversarial review across the full diff.

## Risks (top 5)

1. Empty-org crash/loop already exists on `da354cc` (M0 fixes first, before any prospect can hit it).
2. Seed-demo regression while widening the domain model → default `'seed-fixtures'` path untouched + pinned-URL byte-check each milestone.
3. Cross-org ingest leakage → org_id only ever derives from key hash; explicit adversarial test in M2 review.
4. Magic-link deliverability mid-onboarding → Resend SMTP is a blocking checklist item, tested pre-prospect.
5. TS/Python contract drift → golden vectors with branch-coverage rule in one CI.

## Verification

Per milestone: `npm test` green (M3+: `python -m unittest` too), `npx tsc --noEmit`, demo pinned-URL (`?asof=2026-08-01` → $11,900 / May 3–Jul 31) byte-identical, the stated founder checkpoint performed in the browser, adversarial review workflow of the milestone diff with confirmed findings fixed before proceeding.
