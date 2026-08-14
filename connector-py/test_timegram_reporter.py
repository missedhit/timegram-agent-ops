"""Tests for timegram_reporter.py — run with `python -m unittest` (no pytest).

Two layers:
  1. Golden vectors — supabase/functions/ingest/vectors.json, the same file
     the vitest suite runs against the TypeScript validators. Any divergence
     between the SDKs shows up as a failure here or there.
  2. Python-only unit tests — values JSON cannot encode (NaN, Infinity, huge
     exact ints, bytes) plus the reporter's network semantics (retry/backoff,
     4xx no-retry, never-raise) and track().
"""

import json
import unittest
from pathlib import Path

from timegram_reporter import (
    MetadataContractError,
    TimegramReporter,
    validate_deviation_event,
    validate_ingest_event,
    validate_register_event,
)

VECTORS_PATH = Path(__file__).resolve().parent.parent / "supabase" / "functions" / "ingest" / "vectors.json"

VALIDATORS = {
    "task": validate_ingest_event,
    "register": validate_register_event,
    "deviation": validate_deviation_event,
}

VALID_TASK = {
    "description": "Audited 28 expense reports in batch #7141",
    "outcome": "completed",
    "duration_sec": 42,
    "cost_usd": 0.67,
    "units": 28,
}


class GoldenVectorsTest(unittest.TestCase):
    """The mechanical half of TS/Python parity."""

    @classmethod
    def setUpClass(cls):
        with open(VECTORS_PATH, encoding="utf-8") as f:
            cls.vectors = json.load(f)

    def test_version_and_unique_names(self):
        self.assertEqual(self.vectors["version"], 1)
        names = [c["name"] for c in self.vectors["cases"]]
        self.assertEqual(len(set(names)), len(names))

    def test_covers_both_verdicts_for_all_contracts(self):
        for contract in VALIDATORS:
            cases = [c for c in self.vectors["cases"] if c["contract"] == contract]
            self.assertTrue(any(c["expect"]["ok"] for c in cases), contract)
            self.assertTrue(any(not c["expect"]["ok"] for c in cases), contract)

    def test_reject_cases_pin_at_least_one_message(self):
        for case in self.vectors["cases"]:
            if case["expect"]["ok"]:
                self.assertNotIn("errorIncludes", case["expect"], case["name"])
            else:
                self.assertTrue(case["expect"].get("errorIncludes"), case["name"])

    def test_all_vectors(self):
        for case in self.vectors["cases"]:
            with self.subTest(case["name"]):
                result = VALIDATORS[case["contract"]](case["payload"])
                self.assertEqual(
                    result["ok"], case["expect"]["ok"], case.get("note", case["name"])
                )
                if not result["ok"]:
                    joined = "\n".join(result["errors"])
                    for substring in case["expect"].get("errorIncludes", []):
                        self.assertIn(substring, joined, case["name"])


class PythonOnlyValidatorTest(unittest.TestCase):
    """Cases JSON cannot represent, so the vectors cannot carry them."""

    def valid_task(self, **overrides):
        return {"agent_id": "ag-x", "business_process": "b", "cost_center": "c", **VALID_TASK, **overrides}

    def test_nan_and_infinity_rejected(self):
        for value in (float("nan"), float("inf"), float("-inf")):
            for field in ("cost_usd", "duration_sec", "units", "tokens"):
                r = validate_ingest_event(self.valid_task(**{field: value}))
                self.assertFalse(r["ok"], f"{field}={value}")

    def test_huge_exact_int_rejected_without_crashing(self):
        # Python parses a 400-digit JSON integer exactly; JS overflows it to
        # Infinity. Both must reject — and Python must not raise OverflowError.
        huge = 10**400
        self.assertFalse(validate_ingest_event(self.valid_task(cost_usd=huge))["ok"])
        self.assertFalse(validate_ingest_event(self.valid_task(duration_sec=huge))["ok"])
        self.assertFalse(
            validate_register_event({"agent_id": "a", "name": "n", "monthly_budget_usd": -(10**400)})["ok"]
        )

    def test_bytes_is_not_a_string(self):
        r = validate_ingest_event(self.valid_task(agent_id=b"ag-x"))
        self.assertFalse(r["ok"])
        self.assertIn('"agent_id": required non-empty string', r["errors"][0])

    def test_bool_outcome_rejected(self):
        self.assertFalse(validate_ingest_event(self.valid_task(outcome=True))["ok"])

    def test_non_string_keys_do_not_crash(self):
        r = validate_ingest_event(self.valid_task(**{}) | {1: "x"})
        self.assertFalse(r["ok"])

    def test_successful_event_roundtrip(self):
        payload = self.valid_task(timestamp="2026-08-14T09:00:00Z", tokens=1200)
        r = validate_ingest_event(payload)
        self.assertTrue(r["ok"])
        self.assertEqual(r["event"], payload)


class StubTransport:
    """Scripted transport: each entry is (status, text) or an Exception."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def __call__(self, url, body, headers, timeout):
        self.calls.append(
            {"url": url, "body": json.loads(body.decode("utf-8")), "headers": headers, "timeout": timeout}
        )
        step = self.script.pop(0) if len(self.script) > 1 else self.script[0]
        if isinstance(step, Exception):
            raise step
        return step


def make_reporter(transport, **overrides):
    options = {
        "ingest_url": "https://example.test/functions/v1/ingest",
        "api_key": "tgk_live_stub",
        "agent_id": "ag-fin-expense",
        "defaults": {"business_process": "Travel & expense", "cost_center": "Corporate"},
        "transport": transport,
        "sleep": overrides.pop("sleep", lambda s: None),
        "on_error": overrides.pop("on_error", lambda err, event: None),
    }
    options.update(overrides)
    return TimegramReporter(**options)


OK_201 = (201, '{"id": "task-1", "auto_registered_agent": false}')


class ReporterContractTest(unittest.TestCase):
    def test_required_constructor_options(self):
        for missing in ("ingest_url", "api_key", "agent_id"):
            kwargs = {"ingest_url": "u", "api_key": "k", "agent_id": "a", missing: ""}
            with self.assertRaises(ValueError) as ctx:
                TimegramReporter(**kwargs)
            self.assertIn(missing, str(ctx.exception))

    def test_contract_violation_raises_before_any_network_call(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        with self.assertRaises(MetadataContractError) as ctx:
            reporter.report(prompt="secret", **VALID_TASK)
        self.assertEqual(transport.calls, [])
        self.assertIn("metadata-only contract", str(ctx.exception))
        self.assertEqual(len(ctx.exception.errors), 1)

    def test_defaults_are_merged_and_none_does_not_clobber(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        result = reporter.report(business_process=None, **VALID_TASK)
        self.assertTrue(result.accepted)
        body = transport.calls[0]["body"]
        self.assertEqual(body["business_process"], "Travel & expense")
        self.assertEqual(body["cost_center"], "Corporate")
        self.assertEqual(body["agent_id"], "ag-fin-expense")

    def test_register_and_deviation_urls_and_agent_override(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        reporter.register_agent(name="Expense Audit Agent", agent_id="ag-other")
        reporter.report_deviation(policy_id="pol-1", description="Blocked a $14k post")
        self.assertTrue(transport.calls[0]["url"].endswith("/ingest/register"))
        self.assertEqual(transport.calls[0]["body"]["agent_id"], "ag-other")
        self.assertTrue(transport.calls[1]["url"].endswith("/ingest/deviation"))
        self.assertEqual(transport.calls[1]["body"]["agent_id"], "ag-fin-expense")

    def test_headers_carry_key_and_content_type(self):
        transport = StubTransport([OK_201])
        make_reporter(transport).report(**VALID_TASK)
        headers = transport.calls[0]["headers"]
        self.assertEqual(headers["x-api-key"], "tgk_live_stub")
        self.assertEqual(headers["Content-Type"], "application/json")


class ReporterNetworkTest(unittest.TestCase):
    def test_accepted_with_server_id(self):
        transport = StubTransport([OK_201])
        result = make_reporter(transport).report(**VALID_TASK)
        self.assertTrue(result.accepted)
        self.assertEqual(result.id, "task-1")
        self.assertIsNone(result.error)

    def test_5xx_retries_then_succeeds_with_backoff(self):
        transport = StubTransport([(500, "boom"), OK_201])
        sleeps = []
        result = make_reporter(transport, sleep=sleeps.append).report(**VALID_TASK)
        self.assertTrue(result.accepted)
        self.assertEqual(len(transport.calls), 2)
        self.assertEqual(sleeps, [0.25])

    def test_exhausted_retries_never_raise_and_call_on_error(self):
        transport = StubTransport([(500, "boom")])
        sleeps, errors = [], []
        reporter = make_reporter(
            transport, sleep=sleeps.append, on_error=lambda err, event: errors.append((err, event))
        )
        result = reporter.report(**VALID_TASK)
        self.assertFalse(result.accepted)
        self.assertEqual(result.error, "HTTP 500: boom")
        self.assertEqual(len(transport.calls), 3)  # first try + max_retries=2
        self.assertEqual(sleeps, [0.25, 0.5])
        self.assertEqual(len(errors), 1)
        self.assertIn("Timegram report failed: HTTP 500: boom", str(errors[0][0]))
        self.assertEqual(errors[0][1]["description"], VALID_TASK["description"])

    def test_4xx_does_not_retry(self):
        transport = StubTransport([(422, "nope")])
        result = make_reporter(transport).report(**VALID_TASK)
        self.assertFalse(result.accepted)
        self.assertEqual(result.error, "HTTP 422: nope")
        self.assertEqual(len(transport.calls), 1)

    def test_4xx_error_body_truncated_to_300_chars(self):
        transport = StubTransport([(422, "x" * 1000)])
        result = make_reporter(transport).report(**VALID_TASK)
        self.assertEqual(result.error, "HTTP 422: " + "x" * 300)

    def test_transport_exception_is_retried_and_never_raises(self):
        transport = StubTransport([ConnectionError("network down")])
        result = make_reporter(transport).report(**VALID_TASK)
        self.assertFalse(result.accepted)
        self.assertEqual(result.error, "network down")
        self.assertEqual(len(transport.calls), 3)

    def test_empty_exception_message_falls_back_to_class_name(self):
        transport = StubTransport([ConnectionError()])
        result = make_reporter(transport).report(**VALID_TASK)
        self.assertEqual(result.error, "ConnectionError")

    def test_non_json_success_body_is_treated_as_failure(self):
        # Mirrors the TS SDK: res.json() throwing inside the try retries.
        transport = StubTransport([(200, "not json")])
        result = make_reporter(transport).report(**VALID_TASK)
        self.assertFalse(result.accepted)
        self.assertEqual(len(transport.calls), 3)

    def test_broken_on_error_hook_is_swallowed(self):
        transport = StubTransport([(500, "boom")])

        def broken_hook(err, event):
            raise RuntimeError("hook bug")

        result = make_reporter(transport, on_error=broken_hook).report(**VALID_TASK)
        self.assertFalse(result.accepted)

    def test_max_retries_zero_means_single_attempt(self):
        transport = StubTransport([(500, "boom")])
        result = make_reporter(transport, max_retries=0).report(**VALID_TASK)
        self.assertFalse(result.accepted)
        self.assertEqual(len(transport.calls), 1)


class TrackTest(unittest.TestCase):
    def test_success_reports_completed_with_integer_duration(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        with reporter.track(description="Auditing batch #7141", cost_usd=0.67, units=28):
            pass
        body = transport.calls[0]["body"]
        self.assertEqual(body["outcome"], "completed")
        self.assertIsInstance(body["duration_sec"], int)
        self.assertGreaterEqual(body["duration_sec"], 0)

    def test_update_enriches_and_can_override_outcome(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        with reporter.track(description="Auditing batch", cost_usd=0.67, units=28) as work:
            work.update(units=31, description="Audited 31 reports, 1 flagged", outcome="escalated")
        body = transport.calls[0]["body"]
        self.assertEqual(body["units"], 31)
        self.assertEqual(body["outcome"], "escalated")

    def test_exception_reports_failed_and_reraises(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        with self.assertRaises(RuntimeError):
            with reporter.track(description="Auditing batch", cost_usd=0.67, units=28):
                raise RuntimeError("agent blew up")
        body = transport.calls[0]["body"]
        self.assertEqual(body["outcome"], "failed")

    def test_contract_violation_in_track_propagates(self):
        transport = StubTransport([OK_201])
        reporter = make_reporter(transport)
        with self.assertRaises(MetadataContractError):
            with reporter.track(description="x" * 400, cost_usd=0.1, units=1):
                pass
        self.assertEqual(transport.calls, [])


if __name__ == "__main__":
    unittest.main()
