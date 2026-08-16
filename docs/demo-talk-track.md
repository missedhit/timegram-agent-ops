# Timegram Agent Ops — Discovery Demo Talk Track

The 10-minute demo, screen by screen, with the exact clicks and the line that
lands on each one. The dataset regenerates daily so dollar figures drift — the
*story* never does (tests enforce it). For any call where your deck screenshots
must match the live screen, open the demo with `?asof=YYYY-MM-DD` pinned to the
date you screenshotted.

---

## Before the call (2 minutes)

- Open **https://demo.timegram.io** in a clean browser window (bookmark bar
  hidden). If you're using a pinned date, open `https://demo.timegram.io/?asof=…`.
- One tab is enough — the whole demo is in-app navigation.
- If a technical evaluator is on the call and you want the live-ingest finale,
  have a terminal ready in the project folder (`npm run example:agent` should
  have been tested that morning).
- Know your prospect's agent count. Every line below gets sharper when you can
  say "you have 6 agents today; this is what 14 looks like."

## The cold open — say this before touching the screen (30 seconds)

> "Every company we talk to is deploying AI agents right now, and almost none
> of them can answer four questions: **what agents do we actually have, what
> did they do, what did they cost, and did they follow policy** — and a fifth
> that's coming: **can you prove it to an auditor?** This is the system of
> record that answers all five. One important thing before I start: everything
> you'll see is *metadata*. We never see or store what an agent read or wrote —
> no prompts, no outputs, no customer content. That's not a setting; it's
> architecture. You'll see the badge top-right on every screen."

Demo persona: *Coreline Software, a ~300-person B2B SaaS company running 14
agents across Finance, Support, Sales Ops, Engineering, and IT.*

---

## 1. Agent Registry — "the HR file" (90 seconds)

**You're on it when the page loads.**

- Sweep the summary cards: total agents, active, **agents with deviations (red)**, monthly spend.
- Point at one row end to end: *owner, department, status, model, tools, data
  domains, version, deploy date* — "every agent has a named human owner and a
  documented blast radius."
- Click **Risk → High**: two agents. "Risk-rate the fleet like any other
  workforce."

> **The line:** "Most companies can't produce this table today. This is
> headcount planning, except the headcount is software."

Note the model column while you're here: Claude, GPT, Gemini, and an on-prem
Llama — "we're neutral; we govern whatever you run."

**Click the Incident Triage Agent row** (it has a red deviation pill).

## 2. Agent Detail — "the problem employee" (2 minutes)

This page is the first baked-in story: **Incident Triage is ~30% over its
monthly budget.**

- The red spend card: "This agent blew through its budget this month."
- Cost trend chart: the daily spend line **crosses the dashed budget-pace line**
  in the final weeks. Hover it.
- Now scroll the right column to **Version history**: *"Upgraded to Claude
  Opus 4.5"* — dated right where the ramp starts. Then Recent deviations: cost
  guardrail alerts citing post-release alert volume, with their real multiples.

> **The line:** "In thirty seconds you just did a root-cause on an AI cost
> overrun: a model upgrade plus a rough release week. Today, this analysis is
> someone exporting API bills into a spreadsheet — if anyone does it at all."

Also on this page, gesture briefly: permissions, assigned policies, cost per
alert vs the human baseline. "The whole personnel file."

**Click "Full work log" (top right).**

## 3. Work Log — "what they actually did" (90 seconds)

Arrives pre-filtered to Incident Triage's 90 days.

- Read one row aloud: *"Triaged post-release alert surge — 31 regressions
  severity-ranked."* "Business language. Your VP Engineering reads this, not
  just your ML team."
- Point at the cost column: dollars first, token count in small gray text.
  "Finance sees dollars; tokens are a footnote."
- Clear the filter, show the full company feed; flip Outcome → **Escalated to
  human**: "every hand-off to a person is a first-class record — that matters
  for the audit story in a minute."

> **The line:** "Notice what's *not* here: no prompts, no transcripts. We know
> the agent correlated 44 alerts. We never see the alert payloads, your code,
> or your customers' data."

**Sidebar → Cost Dashboard.**

## 4. Cost Dashboard — "the CFO screen" (2 minutes)

- Budget alerts panel: two agents flagged, spend-vs-budget bars. "Budgets per
  agent, like any cost center."
- Spend by department: Engineering dominates. "Tells you where the agent
  workforce actually lives."
- **Cost per outcome cards — this is the ROI slide:** find *Accounts payable:
  $0.14 per invoice vs $2.10 human baseline*. Read the savings figure.

> **The line:** "This is the number your CFO asks for and nobody has: not what
> the API bill was — what a unit of *work* costs versus the human baseline,
> process by process. This is how you justify the next ten agents."

**Sidebar → Policies & Deviations.**

## 5. SOP Policies & Deviations — "the compliance screen" (2 minutes)

The second baked-in story lives here: **the Refund & Credit Agent.**

- Policies table, first row: *"Escalate any refund above $5,000 to a human
  approver before processing"* — **enforcement: Log only.**
- Deviations feed: filter Status → **Open**. Refund agent violations at the top.
- **Monthly deviation report** (right): read the Refund agent's row left to
  right — **1, then 4, then 4.** "It's not improving."

> **The line:** "Plain-English rules, written by ops — not YAML written by
> engineers. And here's the conversation this screen starts: this policy is in
> log-only mode and the violations are trending up. Someone in this room gets
> to decide — today — to flip it to *block*. That's governance as a decision,
> not a post-mortem."

**Sidebar → Audit Export.**

## 6. Audit Export — "prove it" (90 seconds)

- Pick **Incident Triage Agent**, Last 30 days. Scroll slowly.
- Read the scope statement out loud — it's the positioning in auditor language:
  *"contains no prompt text, model output, or customer content — those are
  never captured or stored by the platform."*
- Walk the sections by name: activity summary → **human approval events with
  named approvers** → deviations with dispositions → policies in effect →
  **configuration changes** ("there's the Opus upgrade again — an auditor ties
  the cost change to a dated decision").
- Click **Export PDF**: the app chrome drops away, it's a clean document.

> **The line:** "When your biggest customer's security review, your SOC 2
> auditor, or your own board asks 'what are these agents doing?' — this is the
> artifact you hand them. Every enterprise deal you close will eventually ask
> for this."

---

## The finale for technical evaluators (90 seconds, optional)

In the terminal, narrate: "This is a real agent reporting into the live
platform — watch the Work Log."

```bash
npm run example:agent
```

Three tasks appear at the top of the Work Log (live workspace). Then:

```bash
npm run example:agent -- --try-content
```

Read the output verbatim:

> `"prompt": metadata-only contract — content fields are not accepted. This
> platform records what agents did, never what they said.`

> **The line:** "That refusal happened *inside your network*, before a byte
> left the machine — and the server enforces the identical contract, down to
> database constraints. Metadata-only isn't a promise in our privacy policy.
> It's a 422."

Integration ask, if they raise it: "a five-line SDK call wrapping whatever your
agents already do — any stack, any model."

---

## Objection handling

| They say | You say |
| --- | --- |
| "How does data get in?" | "A tiny SDK call — or a plain HTTPS POST — at the end of each unit of agent work. Five lines in any stack. You saw it run live." |
| "Do you see our prompts / data?" | "We can't. The ingest API rejects content fields with an error — it's enforced in the schema, not policy. That's the whole product bet." |
| "We already have LLM observability (LangSmith / Datadog…)." | "Those are for your engineers — traces and tokens. This is for your COO, CFO, and compliance: owners, budgets, policies, evidence packs. Different buyer, different question." |
| "Our agents run on [vendor]." | "So do Coreline's — Claude, GPT, Gemini, and an on-prem model on one screen. We're the layer above." |
| "Can't we build this?" | "You could build the dashboard. The moat is the policy engine, the evidence pack format, and the metadata-only contract your auditor will accept. That's what you'd be rebuilding in year two." |
| "What does it cost?" | Bridge to discovery: "Depends on fleet size — how many agents are you running today, and who owns them?" |

## Close with discovery questions

1. "Could you produce the registry screen for your agents today? Who would you ask?"
2. "Who gets the call when an agent overspends — and how would they find out?"
3. "What's the policy an agent could break that would actually scare you?"
4. "Has a customer security review, SOC 2 audit, or your board asked about your AI agents yet?"
5. "If we stood this up with your top three agents in two weeks, who needs to see it?"

---

## The 3-minute version

Registry (30s: "the fleet, owned and risk-rated") → Incident Triage detail
(60s: the over-budget root-cause story) → Policies (45s: refund story, 1→4→4,
log-only vs block) → Audit Export (45s: scroll the pack, read the scope
statement, "this is what you hand the security review"). Skip Work Log and
Cost Dashboard; both are one-liners over your shoulder if asked.

## The one-sentence positioning

> "The HR, finance, and audit layer for your AI agents — what they did, what
> it cost, whether they followed policy, and proof you can hand an auditor —
> without ever seeing a prompt."
