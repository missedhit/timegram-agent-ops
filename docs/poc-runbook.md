# PoC operations runbook

Day-to-day operations for the prospect PoC environment at
**https://agentworkforce.timegram.io**. The org lifecycle is UI-driven from
the **Platform Admin** screen in the app (visible only to platform admins);
every admin action there is audited in the edge-function logs. The CLI
scripts remain as fallback and need this repo + `.env.local` on the dev
machine. Sections marked **founder gate** need dashboard access or DNS and
cannot be scripted.

---

## Onboard a prospect in 10 minutes

Prereq (one-time, before the FIRST prospect ever): the two hygiene items at
the bottom of this page — custom SMTP and key rotation.

1. Sign in at https://agentworkforce.timegram.io → **Platform Admin** (in
   the sidebar) → **New organization**. Enter the org name, the owner's
   work email, and their timezone (daily cost buckets and "today" follow
   it; defaults to America/New_York) → **Create organization**. Takes a few
   seconds: org, 5 starter policies, the owner's login, and an API key.

2. The key panel appears **once**: click **Download handout** (their
   `CONNECT-<org>.md` with app URL, ingest URL, key, curl / Python / TS
   snippets, and MCP config snippets for Claude Code / Cursor / Claude
   Desktop), skim it, then **Dismiss** — the key cannot be retrieved
   again, only replaced.

3. Email the handout to the prospect (however you share secrets),
   **attaching `connector-py/timegram_reporter.py`** — the handout tells
   them the single-file Python SDK is attached to the same email. (TS
   prospects need repo access instead — a GitHub invite; the TS SDK is used
   from a clone.)

4. Have them (or you, demoing on a call) sign in at
   https://agentworkforce.timegram.io with the owner email — magic link,
   no password — and run the handout's curl snippet. Unknown agents
   auto-register on first report: the Work Log fills immediately; Registry,
   Costs, Policies, and Audit follow from the same events.

5. MCP quick-connect (optional, 2 minutes — great on a call): the handout's
   "Connect via MCP" section has a one-line `claude mcp add …` command.
   Paste it, then ask the agent to call `workspace_status` — it answers
   with the workspace name and live counts, and `report_task` calls land on
   the Work Log like any SDK event. Position MCP as the demo path;
   production telemetry ships the SDK (next step).

6. Done. The prospect connects their real agents by copying
   `connector-py/timegram_reporter.py` (Python, stdlib-only) or using
   `connector/src` (TypeScript, from a repo clone) next to their agent code.

**CLI fallback** (same result, from this repo):

```bash
npm run org:create -- --name "Acme Corp" --owner-email jane@acme.com
```

(`--timezone America/Chicago` optional; handout lands in
`handouts/CONNECT-acme-corp.md`.) To exercise the ingest key from this repo:
put the handout's two values in a scratch `acme.env` file (git-ignored via
`*.env`) and run
`python connector-py/example_expense_agent.py --env-file acme.env`.

## Support

**Where the server logs are (founder gate — dashboard):**
Supabase Dashboard → project `eaeqqipehxxaypvzdxcv` → Edge Functions →
`ingest` → Logs. Every rejected event logs its reason there — including
events arriving via MCP (`mcp` validates locally and forwards to ingest
with the caller's key; the `mcp` logs carry only `[mcp] …` upstream-failure
lines). The `admin`
function's Logs are the audit trail for dashboard actions (one `[admin]`
line per create/issue/revoke/delete, with the acting user id).

**Common errors a prospect will hit:**

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `401 unknown or revoked API key` | Key typo'd, or revoked | Check `npm run org:key -- --org "X" --list`; issue a fresh key if needed |
| `422` with a list of field errors | Metadata contract violation | The error text is self-explanatory by design — it names each offending field; content fields get the metadata-only refusal |
| `422 unknown policy "..."` | Deviation names a policy id not in their workspace | Policy ids are on their Policies screen; starter orgs have `pol-starter-1`…`5` |
| Event accepted but agent shows "Auto-registered from first report" | Normal | Enrich via `/register` (see their handout / SDK `register_agent`) |
| Login shows "Signups not allowed for otp" | The email is not an onboarded auth user — sign-in never creates accounts | Check spelling; onboard them (org:create adds the owner) or add the user in Dashboard → Authentication → Users |
| Magic link never arrives (for a KNOWN user) | SMTP not configured, or rate-limited | The pre-prospect SMTP gate below; built-in Supabase email is ~2/hour |
| MCP server shows "failed" in the client | Wrong URL — or the dashboard "Verify JWT" toggle got re-enabled (the gateway then 401s before our code runs) | `npm run check:mcp` says which; if it's the toggle: Dashboard → Edge Functions → `mcp` → Details → turn Verify JWT off |
| MCP tool call answers "invalid or missing API key" | Key typo'd or revoked — or an old Claude Code build dropping headers on tool calls (known upstream bugs) | Verify the key with `npm run org:key -- --org "X" --list`; have the prospect update Claude Code and re-add the server |
| MCP connects but no Timegram tools appear | Client cached a stale tool list | Reconnect the server in the client (Claude Code: `/mcp` → reconnect); `npm run check:mcp` confirms the deployed server lists all four tools |

**Key rotation (leaked or routine):** Platform Admin → the org's **Manage**
→ **Keys** → issue the new key (label it, e.g. `rotated-2026-08`), hand it
over, then **Revoke** the old one. Issue first, hand over, then revoke —
revocation is immediate; in-flight retries with the old key 401 from that
moment. CLI fallback:

```bash
npm run org:key -- --org "Acme Corp" --issue --label rotated-2026-08
```

```bash
npm run org:key -- --org "Acme Corp" --revoke <old-key-id>
```

**Org switching:** users who belong to several orgs (you) get a dropdown in
the app header; prospects with one org never see it. Active org persists
per browser. The dropdown loads memberships once per sign-in — after
creating an org from Platform Admin, reload the page to see it there.

## Deploys

Every push to `main` deploys BOTH sites: the demo (GitHub Pages, seed mode)
and the app (Cloudflare Pages, live mode). Cloudflare also builds an
auth-gated preview URL per push; magic links requested from a preview
resolve to the production Site URL (agentworkforce.timegram.io) — fine for
the PoC, just don't expect to stay on the preview after login. (Admin
dashboard calls from a preview URL fail CORS by design — use production or
localhost.)

Edge functions deploy manually (not on push), from this repo:

```bash
npx supabase functions deploy ingest --project-ref eaeqqipehxxaypvzdxcv --no-verify-jwt
```

```bash
npx supabase functions deploy admin --project-ref eaeqqipehxxaypvzdxcv
```

```bash
npx supabase functions deploy mcp --project-ref eaeqqipehxxaypvzdxcv --no-verify-jwt
```

ingest and mcp must skip gateway JWT verification (agents authenticate
with raw API keys, not JWTs — mcp carries them in `Authorization: Bearer`,
which the gateway would otherwise misread as a JWT); admin keeps it as
defense-in-depth — its real gate is the in-function platform_admins check.
All three are recorded in `supabase/config.toml`. After any mcp deploy run
`npm run check:mcp` — it catches the dashboard Verify JWT toggle silently
re-enabling.

## Backups (Free tier has none)

JSON dumps are the backup posture until a real prospect justifies the Pro
upgrade (which adds daily backups — that upgrade is the trigger, revisit
then). Per org: Platform Admin → **Manage** → **Export JSON** (downloads
every table). For everything at once, CLI:

```bash
npm run org:export -- --all          # every org, one dated folder each
```

Export before anything destructive and weekly-ish otherwise. Exports
contain business data and key hashes, never raw keys.

## Offboard a prospect

Platform Admin → the org's **Manage** → **Export JSON** (final snapshot) →
**Delete…** → type the organization name exactly → **Delete permanently**.
One cascade removes everything (members, agents, tasks, policies,
deviations, approvals, keys); the report lists sign-in accounts left with
no workspace — optionally remove those in Dashboard → Authentication →
Users. The live foundation org ("Northbridge Mutual") cannot be deleted
from the dashboard at all; the only path is the CLI with `--force`:

```bash
npm run org:delete -- --org "Acme Corp" --yes    # CLI fallback
```

---

## Pre-prospect hygiene (both founder gates — do once, before the first prospect)

### 1. Custom SMTP via Resend — magic links must be reliable

Supabase's built-in email is ~2/hour and best-effort: fine for you, fatal
mid-onboarding. Resend's free tier (100/day) is plenty for a PoC.

1. Create an account at https://resend.com (free tier).
2. Resend → Domains → Add Domain → `timegram.io`. It shows DKIM + SPF DNS
   records — add them in Cloudflare (dash.cloudflare.com → timegram.io →
   DNS) exactly as shown; **do not touch the existing `app`, `demo`, or
   `agentworkforce` records**. Verification usually completes in minutes.
3. Resend → API Keys → Create API key (sending access only) — copy it.
4. Supabase Dashboard → project `eaeqqipehxxaypvzdxcv` → Authentication →
   Emails → SMTP Settings → Enable custom SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
   - Sender email: `no-reply@timegram.io`
   - Sender name: `Timegram Agent Ops`
5. Save, then **test with a non-founder address**. Important: sign-in never
   creates accounts (`shouldCreateUser:false`), so an unknown address gets
   an on-screen "Signups not allowed" error and **no email is sent at all**
   — that outcome says nothing about SMTP. To actually exercise SMTP:
   first add the test address as a user (Dashboard → Authentication →
   Users → Add user → create user, with a personal address you can read),
   then request a magic link at https://agentworkforce.timegram.io and
   confirm it arrives within seconds from no-reply@timegram.io. Delete the
   test user after.

### 2. Rotate the two secrets that passed through chat

The service-role key and the personal access token were pasted into a chat
session during setup. Before the first prospect:

1. **Personal access token** (easy, independent):
   https://supabase.com/dashboard/account/tokens → revoke the existing
   token → Generate new token.
   Then update `.env.local` → `SUPABASE_ACCESS_TOKEN=<new value>`.
2. **Service-role key** — important: ours is a **legacy JWT key**, and
   legacy anon + service_role keys are both signed by the one project JWT
   secret. There is no service-role-only rotation on the legacy path;
   rotating the JWT secret invalidates **both keys and all active user
   sessions**. So the rotation is a short sequence, done in one sitting:
   1. Dashboard → project `eaeqqipehxxaypvzdxcv` → Settings → API → rotate
      the JWT secret. From this moment the live app's anon key is dead —
      continue immediately.
   2. Copy the NEW `service_role` key → `.env.local`
      `SUPABASE_SERVICE_ROLE_KEY=<new>`.
   3. Copy the NEW `anon` key → `.env.local` `VITE_SUPABASE_ANON_KEY=<new>`
      AND Cloudflare Pages → the project → Settings → Environment
      variables → update `VITE_SUPABASE_ANON_KEY` → Save → Deployments →
      Retry deployment (the env var only takes effect on a new build).
   4. Everyone (you) is signed out; sign back in via magic link. Edge
      functions follow the rotation automatically; GitHub Actions holds no
      Supabase secrets.
   (Alternative, zero-downtime path if the dashboard offers it: Settings →
   API Keys → create a new **secret key** (`sb_secret_…`), put THAT in
   `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`, verify step 3 below, and
   leave the legacy keys alone until the app is migrated to a publishable
   key. Don't "disable legacy keys" — the app and edge functions still use
   them.)
3. Confirm nothing broke:

   ```bash
   npm run check:supabase
   npm run org:key -- --org "Northbridge Mutual" --list
   ```

   …and load https://agentworkforce.timegram.io (fresh tab) to confirm the
   app boots and sign-in works.

---

## Quick reference

| Task | UI | CLI fallback |
| --- | --- | --- |
| Onboard | Platform Admin → New organization | `npm run org:create -- --name "X" --owner-email a@b.c` |
| Issue/revoke keys | Platform Admin → Manage → Keys | `npm run org:key -- --org "X" --issue\|--list\|--revoke <id>` |
| Export (backup) | Platform Admin → Manage → Export JSON | `npm run org:export -- --all` |
| Offboard | Platform Admin → Manage → Delete… | `npm run org:delete -- --org "X" --yes` |
| Apply migrations | — | `node scripts/apply-migrations.mjs` |
| Deploy edge functions | — | see Deploys section |
| Reseed live org | — | `npm run seed:supabase` |
| Auth URLs (after domain changes) | — | `node scripts/set-auth-config.mjs` |
| Health check | — | `npm run check:supabase` |
| MCP health check | — | `npm run check:mcp` |
