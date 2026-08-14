# Timegram Agent Ops — Python Reporter

Report what your AI agents **did** — never what they said. Single file,
standard library only, Python 3.9+: copy
[`timegram_reporter.py`](timegram_reporter.py) next to your agent and import
it. No pip install, no dependencies.

The same metadata-only contract that guards the server API is mirrored inside
the client, so content-carrying fields are rejected before any network call —
and the mirror is enforced mechanically: both this SDK and the TypeScript SDK
run the same golden-vector suite
([`supabase/functions/ingest/vectors.json`](../supabase/functions/ingest/vectors.json))
in CI.

## Quickstart

```python
from timegram_reporter import TimegramReporter

timegram = TimegramReporter(
    ingest_url=os.environ["TIMEGRAM_INGEST_URL"],  # https://<project>.supabase.co/functions/v1/ingest
    api_key=os.environ["TIMEGRAM_API_KEY"],
    agent_id="ag-fin-expense",  # your agent's id in the registry
    defaults={"business_process": "Travel & expense", "cost_center": "Corporate"},
)

# Simplest form — report a completed unit of work:
timegram.report(
    description="Audited 34 expense reports, 1 flagged for policy review",
    outcome="completed",
    duration_sec=118,
    cost_usd=0.82,
    units=34,
    tokens=310_000,  # optional, secondary detail
)
```

Or let the SDK time the work and report the outcome automatically:

```python
with timegram.track(description="Auditing expense batch #7412", cost_usd=0.82, units=34) as work:
    result = audit_batch(reports)          # your agent's actual work
    work.update(units=result.processed)    # enrich from the result
# completed on normal exit, failed (and re-raised) on exception — duration measured.
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
| `timestamp` | ISO 8601 with offset (defaults to receive time) | optional |
| `tokens` | integer ≥ 0 | optional |

Anything else is rejected — unknown fields with a strict-allowlist error, and
content-carrying fields (`prompt`, `output`, `messages`, `content`,
`transcript`, …) with:

> `metadata-only contract — content fields are not accepted. This platform
> records what agents did, never what they said.`

Try it: `python connector-py/example_expense_agent.py --try-content` from the
repo root.

## Registration and deviations

```python
# Register (or enrich) the agent in the workspace registry — idempotent,
# typically called at startup:
timegram.register_agent(
    name="Expense Audit Agent",
    department="Finance",
    owner_name="Marcus Feld",
    unit_label="report",
    monthly_budget_usd=400,
    human_baseline_usd_per_unit=4.5,
)

# Report a policy departure (policy ids are on the workspace's Policies
# screen). Deviations arrive 'open'; resolution happens in the workspace.
timegram.report_deviation(
    policy_id="pol-starter-1",
    description="Approved a $12,400 batch without human sign-off; flagged",
)
```

An event that names an agent the registry hasn't seen auto-registers a minimal
agent (marked as such) so a first report never bounces — enrich it later with
`register_agent`.

## Failure behavior

Reporting must never break your agent. Contract violations raise
`MetadataContractError` at the call site (that's a bug in the integration);
network and server failures never raise — sends retry with backoff (0.25 s,
0.5 s), give up on 4xx immediately (the server disagreed; retrying won't
help), then degrade to the `on_error` callback and `ReportResult(accepted=False)`.

## Testing

```
python -m unittest discover -s connector-py
```

The suite runs the shared golden vectors through the mirrored validators plus
Python-only cases (NaN/Infinity, huge exact ints, `bool` vs `int`) and
stubbed-transport tests for the retry semantics. The mirrors intentionally
reproduce JavaScript semantics — UTF-16 length caps, the JS `trim()`
whitespace set, ECMAScript timestamp rules — see the notes at the top of
`timegram_reporter.py` before "fixing" one of them.

## Reference integration

[`example_expense_agent.py`](example_expense_agent.py) is a complete worked
example: a batch-processing agent reporting three tasks, including an
escalation, through `track()`, plus deviation reporting and the content
refusal.
