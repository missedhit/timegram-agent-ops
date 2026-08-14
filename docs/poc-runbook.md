# PoC operations runbook

Day-to-day operations for the prospect PoC environment at
**https://agentworkforce.timegram.io**. Everything here is executable by one
person from this repo on the dev machine (`.env.local` holds the secrets;
`.env.example` shows the shape). Sections marked **founder gate** need
dashboard access or DNS and cannot be scripted.

---

## Onboard a prospect in 10 minutes

Prereq (one-time, before the FIRST prospect ever): the two hygiene items at
the bottom of this page — custom SMTP and key rotation.

1. Create the org (≈10 seconds — org row, 5 starter policies, owner login,
   API key, handout):

   ```bash
   npm run org:create -- --name "Acme Corp" --owner-email jane@acme.com
   ```

   Add `--timezone America/Chicago` if the prospect isn't Eastern (daily
   cost buckets and "today" follow it; default America/New_York).

2. Open `handouts/CONNECT-acme-corp.md`, skim that it looks right, and send
   it to the prospect (email or however you share secrets with them). It
   contains their app URL, ingest URL, API key, and copy-paste snippets for
   curl / Python / TypeScript.

3. Have them (or you, demoing on a call) sign in at
   https://agentworkforce.timegram.io with the owner email — magic link,
   no password.

4. First data: run the handout's curl snippet, or from this repo — put the
   two values from the handout in a scratch file and point the example at it:

   ```bash
   printf 'INGEST_URL=https://<project>.supabase.co/functions/v1/ingest\nINGEST_API_KEY=tgk_live_...\n' > acme.env
   ```

   ```bash
   python connector-py/example_expense_agent.py --env-file acme.env
   ```

   (Delete the scratch file after.) Unknown agents auto-register
   on first report — the Work Log fills immediately; Registry, Costs,
   Policies, and Audit follow from the same events.

5. Done. The prospect connects their real agents by copying
   `connector-py/timegram_reporter.py` (Python, stdlib-only) or
   `connector/src` (TypeScript) next to their agent code.

## Support

**Where the server logs are (founder gate — dashboard):**
Supabase Dashboard → project `eaeqqipehxxaypvzdxcv` → Edge Functions →
`ingest` → Logs. Every rejected event logs its reason there.

**Common errors a prospect will hit:**

| Symptom | Meaning | Fix |
| --- | --- | --- |
| `401 unknown or revoked API key` | Key typo'd, or revoked | Check `npm run org:key -- --org "X" --list`; issue a fresh key if needed |
| `422` with a list of field errors | Metadata contract violation | The error text is self-explanatory by design — it names each offending field; content fields get the metadata-only refusal |
| `422 unknown policy "..."` | Deviation names a policy id not in their workspace | Policy ids are on their Policies screen; starter orgs have `pol-starter-1`…`5` |
| Event accepted but agent shows "Auto-registered from first report" | Normal | Enrich via `/register` (snippet in their handout / SDK `register_agent`) |
| Magic link never arrives | SMTP not configured, or rate-limited | The pre-prospect SMTP gate below; built-in Supabase email is ~2/hour |

**Key rotation (leaked or routine):**

```bash
npm run org:key -- --org "Acme Corp" --list
npm run org:key -- --org "Acme Corp" --issue --label rotated-2026-08
npm run org:key -- --org "Acme Corp" --revoke <old-key-id>
```

Issue first, hand over, then revoke — revocation is immediate; in-flight
retries with the old key 401 from that moment.

**Org switching:** users who belong to several orgs (you) get a dropdown in
the app header; prospects with one org never see it. Active org persists
per browser.

## Backups (Free tier has none)

`exports/` JSON dumps are the backup posture until a real prospect
justifies the Pro upgrade (which adds daily backups — that upgrade is the
trigger, revisit then):

```bash
npm run org:export -- --all          # every org, one dated folder each
npm run org:export -- --org "Acme Corp"
```

Run `--all` before anything destructive and weekly-ish otherwise. Exports
contain business data and key hashes, never raw keys.

## Offboard a prospect

```bash
npm run org:export -- --org "Acme Corp"   # keep a final snapshot
npm run org:delete -- --org "Acme Corp"          # dry run: prints row counts
npm run org:delete -- --org "Acme Corp" --yes    # deletes permanently
```

One cascade removes everything (members, agents, tasks, policies,
deviations, approvals, keys). The live foundation org ("Northbridge
Mutual") additionally requires `--force`. If the script reports the owner
now belongs to no org, optionally remove that auth user: Dashboard →
Authentication → Users.

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
5. Save, then **test with a non-founder address** (not your own — yours may
   be cached/whitelisted): use a personal address, request a magic link at
   https://agentworkforce.timegram.io, confirm it arrives within seconds
   and the sender shows no-reply@timegram.io. (Any address can request a
   link; only emails you've onboarded get a workspace after signing in.)

### 2. Rotate the two secrets that passed through chat

The service-role key and the personal access token were pasted into a chat
session during setup. Before the first prospect:

1. **Service-role key**: Dashboard → project `eaeqqipehxxaypvzdxcv` →
   Settings → API Keys → `service_role` → Rotate (legacy keys page: "JWT
   Keys"/"API Keys" depending on dashboard version — rotate the
   service_role secret).
   Then update `.env.local` → `SUPABASE_SERVICE_ROLE_KEY=<new value>`.
   Nothing else holds it: Cloudflare Pages has only the anon key, edge
   functions follow the rotation automatically, GitHub Actions has no
   Supabase secrets.
2. **Personal access token**: https://supabase.com/dashboard/account/tokens
   → revoke the existing token → Generate new token.
   Then update `.env.local` → `SUPABASE_ACCESS_TOKEN=<new value>`.
3. Confirm nothing broke:

   ```bash
   npm run check:supabase
   npm run org:key -- --org "Northbridge Mutual" --list
   ```

The anon key does NOT need rotation — it is public by design (ships in the
app bundle; RLS is the boundary).

---

## Quick reference

| Task | Command |
| --- | --- |
| Onboard | `npm run org:create -- --name "X" --owner-email a@b.c` |
| Issue/list/revoke keys | `npm run org:key -- --org "X" --issue\|--list\|--revoke <id>` |
| Export (backup) | `npm run org:export -- --all` |
| Offboard | `npm run org:delete -- --org "X" --yes` |
| Apply migrations | `node scripts/apply-migrations.mjs` |
| Reseed live org | `npm run seed:supabase` |
| Auth URLs (after domain changes) | `node scripts/set-auth-config.mjs` |
| Health check | `npm run check:supabase` |
