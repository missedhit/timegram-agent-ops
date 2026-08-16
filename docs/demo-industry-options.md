# Demo persona options — replacing (or keeping) the insurance dataset

> **DECISION (2026-08-16): Option A adopted.** The seed demo is re-themed to
> Coreline Software (B2B SaaS) in the same branch; Northbridge lives on in git
> history and as the live foundation org's name. Options B and C remain the
> outbound wedges to validate via discovery calls.

> Written 2026-08-16 in response to the founder question: *"I barely understand
> the insurance demo data myself. Agents won't be heavily used in such a
> sensitive industry anyway — what industries actually use agents a lot, feel
> the pain, would pay, and can we actually reach?"* This doc is the decision
> aid: an honest premise check, the selection criteria, six candidate
> personas ranked, what a swap actually costs in this codebase, and a
> recommendation.

---

## 1. Premise check, honestly

Two separate claims are bundled in the question. They deserve different
answers.

**"Agents won't be used much in sensitive industries" — the data says
otherwise.** Cross-industry surveys in early 2026 put banking and insurance
*at the top* of agent-in-production adoption (~47% of enterprises, vs ~18%
healthcare and ~14% government). Regulated, document-heavy, high-volume
back offices are exactly where agents are landing first, because the ROI is
legible and the processes are repeatable. Insurance was a defensible choice
— it is the industry where the audit screen needs no justification.

**"I can't explain the demo data myself" — this one is decisive.** A demo
persona the founder cannot improvise in is a liability on every live call.
The talk track only works if you can ad-lib around it: answer "what's FNOL?",
riff on a storm-surge claim queue, banter about adjusters. If that domain
fluency isn't there, prospects feel it, and the demo reads as staged. Add
the second real problem — **reachability**: a solo founder cold-mailing
mid-size P&C insurers is a 6–12 month committee sale with no warm path in.

So: switching persona is justified — but for **explainability and
reachability** reasons, not adoption reasons. Keep that straight, because it
changes what we switch *to* (and argues for keeping the insurance fixtures
on a shelf rather than burning them — see §6).

## 2. What a persona must deliver

From the founder's own criteria, plus what the six screens need to shine:

1. **Agent density today** — the prospect plausibly runs 5–15 agents *now*,
   not "in our 2027 roadmap." The registry screen is only impressive if the
   viewer thinks "we have this zoo and no list of it."
2. **Felt pain** — at least one of: runaway model spend, an agent breaking a
   money-touching rule, nobody knowing who owns which agent, or an external
   party (customer, client, auditor) asking "prove what your AI did."
3. **Willingness to pay** — a named budget owner (COO/CFO/VP Ops) for whom
   this is a P&L or risk line, not a curiosity.
4. **Reachability for us specifically** — communities and titles a solo
   founder can get 20 conversations with in a month, ideally overlapping
   Timegram's existing time-tracking customer base and region.
5. **Founder fluency** — the founder can narrate the domain without notes.
6. **Story translation** — the three baked-in narratives (over-budget agent
   after a model upgrade + volume surge; a repeat policy violator trending
   worse under log-only; mild background deviations) must map onto workflows
   the persona's buyer recognizes.

## 3. What a swap actually costs in this repo

Cheaper than it looks. A grep for insurance vocabulary
(`claim|insur|FNOL|policyholder|adjuster|broker|Northbridge`) across `src/`:
**152 hits, 104 of them in `src/data/seed/fixtures.ts`**, ~27 in the
narrative tests (`selectors.test.ts`), a handful in `generate.ts`,
`types.ts`, and mapper tests. **Zero hits in any screen component.** The org
name is already centralized (`useOrgName()`, done in M1). Departments and
cost centers are already free-form strings in the live path (M1 migration).

So a persona swap touches:

- `src/data/seed/fixtures.ts` — the rewrite (agents, policies, task
  templates, deviations, version history, cost centers, the broker/policy-
  number flavor constants).
- `src/data/seed/generate.ts` — a few insurance-flavored summary strings.
- Narrative tests — retarget "FNOL over budget" style assertions to the new
  story agents (the tests are the story's tripwire; keep that mechanism).
- `README.md` + `docs/demo-talk-track.md` — re-narrate.
- Starter policies for live PoC orgs (`scripts/data/starter-policies.ts`)
  are already industry-generic — untouched.

Estimate: one focused session for fixtures + tests, one for the talk track.
No screen, selector, ingest, SDK, or MCP work.

## 4. The options, ranked

Scoring against the four founder criteria (● strong / ◐ medium / ○ weak):

| # | Persona | Agent density today | Felt pain | Willingness to pay | Reachable by us | Founder fluency |
|---|---|---|---|---|---|---|
| A | B2B SaaS scale-up (internal agent fleet) | ● | ● | ◐ | ● | ● |
| B | BPO / outsourced services provider | ● | ● | ● | ● (region) | ◐ |
| C | Software / dev agency running coding agents | ● | ● | ◐ | ● (existing base) | ● |
| D | E-commerce / DTC brand | ● | ◐ | ◐ | ● | ◐ |
| E | Staffing & recruiting agency | ◐ | ◐ | ◐ | ◐ | ◐ |
| F | Freight brokerage / logistics | ● | ● | ◐ | ○ | ○ |

### Option A — "Coreline Software": a ~300-person B2B SaaS scale-up

The company every prospect can parse in one sentence, and the world the
founder already lives in (Timegram *is* a B2B SaaS).

- **Why agents are dense here:** SaaS companies are the heaviest agent
  adopters anywhere — support resolution agents (Fin-class tools report
  ~76% average resolution across 12k customers), SDR/RevOps agents (41% of
  enterprise B2B teams had an AI SDR in production by Q1 2026), finance
  agents (AP, dunning, expense audit), coding/incident agents, IT
  provisioning. A 14-agent registry is *understated* for this persona.
- **The pain, felt:** runaway token spend after model upgrades is the most
  universally shared agent horror story in SaaS; support agents issuing
  refunds/credits outside policy is a documented fear; and "we honestly
  don't have a list of our agents or their owners" is near-universal.
- **Proof demand (screen 6):** not a regulator — **enterprise customers'
  vendor security reviews and SOC 2 auditors** now ask what AI agents touch
  customer data and what controls exist. "This is the artifact you attach
  to the security questionnaire" is a *more* relatable line than
  "hand it to your regulator."
- **Story translation (near 1:1):**
  1. FNOL over-budget → **Support Resolution Agent** ~131% of budget after
     an Opus upgrade + a major-outage/launch ticket surge (the storm surge
     analog, verbatim mechanics).
  2. Refund agent → **keeps its name.** "Escalate refunds above $500 to a
     human approver" — same 1→4→4 log-only-to-block arc, now in a domain
     everyone in the room has lived.
  3. AP Invoice Agent → **unchanged**, including the $0.14 vs $2.10 cost-
     per-invoice ROI card.
- **Fleet sketch (14):** Support Resolution, Refund & Credit, Onboarding
  Concierge (Support); AP Invoice, AR Dunning, Expense Audit (Finance);
  SDR Follow-up, Lead Enrichment, CRM Hygiene (Sales Ops); Incident Triage,
  Code Review Assistant, Release Notes (Engineering); Access Provisioning,
  KB Maintenance (IT). Departments: swap `Claims` → `Engineering`; the
  other four already exist in the fixtures. Cost centers → product lines +
  G&A.
- **Buyer & how we find them:** COO / VP CX / Head of AI-enablement / CFO at
  50–500-person SaaS. Channels: founder's own network, SaaS operator
  communities, LinkedIn (titles are clean), Timegram's existing customers.
- **Cons:** crowded-adjacent space — "we have LangSmith/Datadog" comes up
  most here (the talk track's different-buyer answer already handles it);
  SaaS mid-market can be a "nice to have" budget until an incident.

### Option B — "Meridian Business Services": a ~900-seat BPO

The most *differentiated* pitch of the six, and the one where the product's
evidence pack becomes **revenue, not compliance**.

- **Why agents are dense here:** BPO is being rebuilt around agents —
  Capgemini's $3.3B WNS acquisition was explicitly to build "agentic
  intelligent operations." Mid-market BPOs are deploying agents on client
  programs to defend margins while seat-based pricing collapses.
- **The unique angle:** a BPO *bills clients for work performed*. The Work
  Log becomes the client-billing substantiation; Cost-per-outcome becomes
  the margin dashboard per client program; the Audit Export becomes a
  **client-facing deliverable** ("here's what our agents did on your
  account, with named human approvers"). Nobody else pitches an agent-ops
  tool as a billing-proof engine. Willingness to pay is structurally
  highest here.
- **Story translation:** cost centers → **client accounts** (free-form
  dimensions already support this). Over-budget agent on the "Halcyon
  Telecom program" after a model upgrade + client volume surge. Policy
  violator: "adjustments above $1,000 on a client account require a
  client-side approver." The existing on-prem data-residency policy
  translates verbatim as "Client X's data may only be processed on Client
  X's approved models" — block mode.
- **Buyer & reach:** COO / delivery heads at mid-market and nearshore BPOs.
  If the founder's region (large outsourcing industry) provides warm paths,
  this is the strongest network advantage on the board — worth validating
  with 5 conversations before building anything.
- **Cons:** founder fluency is medium unless those networks are real;
  BPO buying can be deal-by-deal (they may want it per-client, which is
  actually fine — org-per-prospect already exists).

### Option C — "Forgeline Studio": a ~60-person software agency running coding agents

The wedge with the most *product* synergy already shipped in this repo.

- **Why agents are dense here:** dev shops run Claude Code / Cursor fleets
  today — the most genuinely-in-production agent workloads anywhere. The M7
  MCP quick-connect targets exactly these tools: **a dev-agency prospect
  can connect their real agents to the live PoC in minutes on the first
  call.** No other persona turns the finale into "your actual agents, live."
- **Timegram synergy (hypothesis to confirm):** if the existing Timegram
  time-tracking base skews toward agencies/software teams, the pitch is
  irresistible in one line: *"You track your people's time with us — this
  is the same thing for your agents."* Warmest outreach list we could own.
- **The pain:** coding-agent token bills are volatile and client-billable;
  clients ask "what am I paying for" → work log = billing justification;
  policies write themselves: "no agent pushes to client production repos
  without human review" (block), "no client code to non-approved model
  providers" (block, the residency policy verbatim), "flag any run over
  $50" (log-only). Over-budget story: the fleet after an Opus upgrade +
  deadline crunch. Cost per merged PR vs blended dev-hour baseline.
- **Buyer & reach:** agency founders/CTOs — the single most reachable
  audience on this list (communities, X, existing customer emails).
- **Cons:** smaller ACVs; agencies are frugal; per-seat coding-agent tools
  ship their own basic usage dashboards (ours is cross-tool + policy +
  client-billing, which is the answer, but the objection exists).

### Option D — "Alder & Oak": an 8-figure DTC e-commerce brand

- **Why:** e-comm support agents are mainstream (70–84% resolution rates
  reported for ecommerce on Fin-class tools); fleets span WISMO/support,
  returns & refunds, catalog enrichment, review response, ad-ops, fraud
  screening. **BFCM is a perfect storm-surge analog** — the over-budget
  story lands as "Black Friday + model upgrade." Refund policy story is
  native ("escalate refunds above $200").
- **Buyer & reach:** Head of CX / Ops at DTC brands; very reachable
  (e-comm operator communities, Shopify ecosystem).
- **Cons:** price-sensitive segment; pain is real but tolerated; audit
  screen is the weakest fit (no one demands proof) — it demos as "chargeback
  and dispute evidence" at best.

### Option E — "TalentBridge": a staffing & recruiting agency

Sourcing/screening/outreach agents at high volume; cost per submittal vs
recruiter baseline; policies around candidate-contact frequency, no-poach
client lists, and EEO-sensitive screening (a genuinely good block-mode
story). Reachable mid-market. **Cons:** agent adoption is real but thinner
than A–D; founder fluency medium; kept as a secondary vertical to sell
*into*, not to re-theme the demo around.

### Option F — "Crestline Freight": a freight brokerage

Voice agents doing carrier check calls, quoting, and appointment setting at
enormous volume (HappyRobot-class deployments); brokers are fast, scrappy
buyers; "never commit to a rate above $X without human approval" is a
beautiful block-mode story; weather events even keep the surge analog.
**Cons:** zero founder network or fluency, US-centric buyer community —
great vertical for someone, probably not our first.

## 5. On "AI SDR company" as a persona — considered and rejected

AI SDR usage is broad (41% of enterprise B2B teams) and the compliance pain
is spectacular (40–60% of pilots fail on deliverability/compliance), which
looks like a fit. But the *buyer* is usually the SDR-tool vendor's problem,
the category has trust damage ("AI slop outreach"), and anchoring our demo
to the most controversial agent category invites the wrong first
impression. SDR agents appear *inside* Option A's fleet instead — one row,
not the theme.

## 6. Recommendation

1. **Re-theme the default demo to Option A (Coreline Software, B2B SaaS).**
   It maximizes founder fluency, is parseable by *every* prospect regardless
   of their industry, keeps two of the three narratives nearly verbatim and
   4 of 5 departments unchanged, and is the cheapest swap (§3). A SaaS
   persona also demos fine to agencies, BPOs, and e-comm prospects; the
   reverse is not true.
2. **Pick the outbound wedge separately from the demo theme — validate B
   and C with discovery calls before writing any fixtures.** The demo
   persona and the target list don't have to match. Run ~10 conversations
   each with BPO delivery heads (B) and agency founders (C) — the two
   options where the Work Log doubles as *client billing proof*, the most
   differentiated pitch we own and the best network fit. If one bites,
   build its dataset as a second persona; org-per-prospect and free-form
   departments mean the live PoC already supports it.
3. **Shelve Northbridge, don't burn it.** Adoption data says regulated
   financial services *lead* agent deployment. When an insurance or banking
   prospect shows up, that persona — and the audit-first talk track — is an
   asset. It lives in git history and can return behind a persona flag if
   ever needed; no need to maintain it actively.
4. **Sharpen one line in the SaaS talk track now:** the audit screen's
   buyer-language shifts from "your regulator" to "your enterprise
   customer's security review / SOC 2 auditor asking what your agents touch."
   That is the proof-pain a SaaS COO has actually felt.

## Sources

- [First Page Sage — Agentic AI Adoption Statistics 2026](https://firstpagesage.com/reports/agentic-ai-adoption-statistics/) (banking/insurance lead at ~47%; healthcare 18%, government 14%)
- [Salesmate — AI Agent Adoption Statistics by Industry 2026](https://www.salesmate.io/blog/ai-agents-adoption-statistics/)
- [Digital Applied — AI SDR Statistics 2026](https://www.digitalapplied.com/blog/ai-sdr-statistics-2026-outbound-sales-data-points) (41% of enterprise B2B teams with an AI SDR in production; pilot failure rates)
- [Fin.ai — AI agent pricing comparison 2026](https://fin.ai/learn/ai-customer-service-agent-pricing-comparison) (~76% avg resolution; per-resolution pricing; ecommerce 70–84%)
- [The Finance Story — Basis raises $100M for accounting AI agents](https://thefinancestory.com/basis-ai-agent-raises-usd-100mn-to-disrupt-accounting) (30% of top-25 US accounting firms)
- [Note — AI BPO market 2026](https://note.com/commodvs/n/ne7861c651aa3?hl=en-US) / Capgemini–WNS $3.3B agentic-AI acquisition
