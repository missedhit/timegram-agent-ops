"""Example integration: an "expense audit agent" reporting its work to
Timegram Agent Ops from Python. This is the reference code a design partner
adapts — the SDK wraps each unit of business work; nothing about the agent's
model, prompts, or outputs ever leaves the process.

Run from the repo root (INGEST_URL / INGEST_API_KEY come from the
environment; .env.local at the repo root is loaded automatically if present):

    python connector-py/example_expense_agent.py                     # 3 tasks in the Work Log
    python connector-py/example_expense_agent.py --try-content       # the client-side refusal
    python connector-py/example_expense_agent.py --report-deviation [policy-id]
    python connector-py/example_expense_agent.py --env-file path/to/.env
"""

import os
import random
import sys
import time
from pathlib import Path

from timegram_reporter import MetadataContractError, TimegramReporter


def load_env_file(path):
    """Minimal KEY=VALUE loader (stdlib only); existing env vars win."""
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def audit_batch(reports):
    """Stand-in for real agent work (an LLM call, a rules engine, an RPA step…)."""
    time.sleep(0.4 + random.random() * 0.8)
    return {"reports": reports, "flagged": 1 if random.random() < 0.5 else 0}


def main(argv):
    if "--env-file" in argv:
        load_env_file(argv[argv.index("--env-file") + 1])
    else:
        default_env = Path(__file__).resolve().parent.parent / ".env.local"
        if default_env.exists():
            load_env_file(default_env)

    reporter = TimegramReporter(
        ingest_url=os.environ.get("INGEST_URL", ""),
        api_key=os.environ.get("INGEST_API_KEY", ""),
        agent_id="ag-fin-expense-py",  # distinct from the TS example's agent
        defaults={"business_process": "Travel & expense", "cost_center": "Corporate"},
    )

    # Register (or re-enrich) this agent in the workspace registry at startup —
    # idempotent, and how the Registry learns names, owners, and budgets.
    reporter.register_agent(
        name="Expense Audit Agent (Python)",
        department="Finance",
        purpose="Audits employee expense reports against travel & expense policy",
        owner_name="Marcus Feld",
        model="Claude Haiku 4.5",
        model_provider="Anthropic",
        unit_label="report",
        monthly_budget_usd=400,
        human_baseline_usd_per_unit=4.5,
    )

    if "--report-deviation" in argv:
        # How a policy departure reaches the compliance screens (policy ids
        # come from the workspace's Policies screen).
        index = argv.index("--report-deviation")
        policy_id = argv[index + 1] if len(argv) > index + 1 else "pol-starter-1"
        result = reporter.report_deviation(
            policy_id=policy_id,
            description="Approved a $12,400 expense batch without human sign-off; flagged for review",
        )
        print(f"Deviation reported: {result!r}")
        return

    if "--try-content" in argv:
        # What happens if an integration tries to attach model I/O:
        try:
            reporter.report(
                description="Audited expense batch",
                outcome="completed",
                duration_sec=30,
                cost_usd=0.5,
                units=10,
                prompt="You are an expense auditor. Review the following receipts: …",
            )
        except MetadataContractError as err:
            print("Rejected client-side, before any network call:\n")
            print(err)
            return
        return

    print("Expense audit agent starting a run of 3 batches...\n")

    for batch_size in (26, 31, 22):
        batch_no = 7000 + random.randrange(999)
        with reporter.track(
            description=f"Audited expense report batch #{batch_no}",
            cost_usd=round(batch_size * 0.024, 2),
            units=batch_size,
            tokens=batch_size * 9000,
        ) as work:
            result = audit_batch(batch_size)
            work.update(
                description=(
                    f"Audited {result['reports']} expense reports in batch #{batch_no}, "
                    f"{result['flagged']} flagged for policy review"
                ),
                outcome="escalated" if result["flagged"] > 0 else None,
            )
        print(f"  reported batch #{batch_no} ({batch_size} reports)")

    print("\nDone - open the Work Log to see the run.")


if __name__ == "__main__":
    main(sys.argv[1:])
