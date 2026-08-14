"""Timegram Agent Ops reporter — Python mirror of connector/src/reporter.ts.

Single file, standard library only (urllib), so it distributes by copy-paste:
drop this file next to your agent and import it. Python 3.9+.

Design rules (identical to the TypeScript SDK):
  - Contract violations raise MetadataContractError immediately, with the
    same messages the server would return — the validators below mirror the
    zero-import contract modules the edge function runs, and the shared
    golden vectors (supabase/functions/ingest/vectors.json) enforce that
    mechanically in CI.
  - Network problems NEVER raise: reporting must never crash the host agent.
    Sends retry with backoff, then degrade to on_error + accepted=False.

Parity notes — the validators reproduce JavaScript semantics, not Python's:
  - Length caps count UTF-16 code units (JS String.prototype.length), so an
    astral emoji counts as 2.
  - "Non-empty" uses the JS trim whitespace set (which strips U+FEFF and
    NBSP; Python's str.strip() does not strip U+FEFF).
  - bool is rejected wherever a number is expected (JS typeof; Python bool
    subclasses int and must be excluded explicitly).
  - Numbers are judged as the IEEE double JSON.parse would produce: an
    integral float like 3.0 is a valid integer, and a JSON number too large
    for a double (1e400) is non-finite and rejected.
  - Timestamps follow ECMAScript Date rules: ASCII digits only, hour 24
    allowed only as exactly 24:00:00 with a zero fraction, offsets bounded
    at 23:59, and years 0000-0099 rejected (the JS Date.UTC two-digit-year
    remapping makes them fail the calendar round-trip check).
"""

from __future__ import annotations

import contextlib
import datetime
import json
import math
import re
import sys
import time
import urllib.error
import urllib.request

__all__ = [
    "MetadataContractError",
    "ReportResult",
    "TimegramReporter",
    "validate_deviation_event",
    "validate_ingest_event",
    "validate_register_event",
]

INT4_MAX = 2147483647  # Postgres int4 bound — beyond it must fail here, not 500 at insert

# ---------------------------------------------------------------------------
# JavaScript-semantics helpers (see "Parity notes" above)
# ---------------------------------------------------------------------------

# ECMA-262 WhiteSpace + LineTerminator, written as explicit escapes: TAB LF
# VT FF CR SP NBSP ZWNBSP, the Zs category, LS PS. (U+0085 NEL is Python
# whitespace but NOT JavaScript's, so it is deliberately absent.)
_JS_WHITESPACE = (
    "\t\n\x0b\x0c\r \xa0\u1680"
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def _js_trim(s):
    return s.strip(_JS_WHITESPACE)


def _utf16_len(s):
    """JS String.prototype.length: UTF-16 code units, astral chars count 2."""
    return sum(2 if ord(ch) > 0xFFFF else 1 for ch in s)


def _js_number(v):
    """The IEEE double JavaScript would hold for this JSON value, or None.

    bool is excluded (JS typeof true is 'boolean'). Python parses huge JSON
    integer literals exactly, but JSON.parse overflows them to Infinity —
    mirror that instead of raising OverflowError.
    """
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    try:
        return float(v)
    except OverflowError:
        return math.inf if v > 0 else -math.inf


def _is_non_negative_number(v):
    f = _js_number(v)
    return f is not None and math.isfinite(f) and f >= 0


def _is_non_negative_int(v):
    f = _js_number(v)
    return (
        f is not None
        and math.isfinite(f)
        and f >= 0
        and f.is_integer()
        and f <= INT4_MAX
    )


# re.ASCII: JS \d is ASCII-only. fullmatch: JS $ does not match before a
# trailing newline, Python's $ does.
_TIMESTAMP_RE = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})", re.ASCII
)


def _is_valid_timestamp(t):
    """Strict ISO 8601 with explicit offset, per ECMAScript Date semantics."""
    m = _TIMESTAMP_RE.fullmatch(t)
    if m is None:
        return False
    year, month, day = int(t[0:4]), int(t[5:7]), int(t[8:10])
    hh, mm, ss = int(t[11:13]), int(t[14:16]), int(t[17:19])
    frac = m.group(1) or ""
    if hh == 24:
        # ES Date allows hour 24 only as exactly 24:00:00 with a zero fraction.
        # Digit scan, not int(): CPython 3.11+ caps int-from-string at 4300
        # digits and would raise on a longer (regex-legal) fraction.
        if mm != 0 or ss != 0 or (frac and frac[1:].lstrip("0") != ""):
            return False
    elif hh > 23 or mm > 59 or ss > 59:
        return False
    offset = m.group(2)
    if offset != "Z" and (int(offset[1:3]) > 23 or int(offset[4:6]) > 59):
        return False
    # JS Date.UTC remaps years 0-99 to 1900-1999, so the TS validator's
    # calendar round-trip check rejects every timestamp in those years.
    if year < 100:
        return False
    try:
        datetime.date(year, month, day)
    except ValueError:
        return False
    return True


# ---------------------------------------------------------------------------
# Contract validators — mirrors of supabase/functions/ingest/*.ts
# ---------------------------------------------------------------------------

_BODY_MSG = "body must be a JSON object"
_TIMESTAMP_MSG = (
    '"timestamp": ISO 8601 datetime string with explicit timezone (e.g. 2026-08-14T09:00:00Z)'
)


def _content_msg(key):
    return (
        f'"{key}": metadata-only contract — content fields are not accepted. '
        "This platform records what agents did, never what they said."
    )


def _unknown_msg(key):
    return f'"{key}": unknown field (strict allowlist)'


def _required_msg(key):
    return f'"{key}": required non-empty string'


def _max_label_msg(key, limit):
    return f'"{key}": max {limit} characters — business labels, not free text'


def _max_desc_msg(limit):
    return (
        f'"description": max {limit} characters — '
        "descriptions are business summaries, not transcripts"
    )


_BASE_CONTENT_KEYS = frozenset(
    (
        "prompt",
        "prompts",
        "system_prompt",
        "completion",
        "completions",
        "input",
        "inputs",
        "output",
        "outputs",
        "message",
        "messages",
        "content",
        "contents",
        "transcript",
        "response",
        "responses",
        "conversation",
        "text",
        "body",
        "attachments",
        "tool_input",
        "tool_output",
    )
)

_TASK_REQUIRED_STRINGS = ("agent_id", "description", "business_process", "cost_center")
_TASK_OUTCOMES = ("completed", "escalated", "failed")
_TASK_MAX_LENGTHS = {
    "agent_id": 100,
    "description": 300,
    "business_process": 120,
    "cost_center": 120,
}
_TASK_ALLOWED_KEYS = frozenset(
    (*_TASK_REQUIRED_STRINGS, "outcome", "duration_sec", "cost_usd", "units", "timestamp", "tokens")
)
_TASK_CONTENT_KEYS = _BASE_CONTENT_KEYS

_REGISTER_REQUIRED_STRINGS = ("agent_id", "name")
_REGISTER_OPTIONAL_STRINGS = (
    "department",
    "purpose",
    "owner_name",
    "model",
    "model_provider",
    "unit_label",
)
_REGISTER_OPTIONAL_NUMBERS = ("monthly_budget_usd", "human_baseline_usd_per_unit")
_REGISTER_MAX_LENGTHS = {
    "agent_id": 100,
    "name": 120,
    "department": 80,
    "purpose": 300,
    "owner_name": 120,
    "model": 80,
    "model_provider": 80,
    "unit_label": 40,
}
_REGISTER_ALLOWED_KEYS = frozenset(
    (*_REGISTER_REQUIRED_STRINGS, *_REGISTER_OPTIONAL_STRINGS, *_REGISTER_OPTIONAL_NUMBERS)
)
_REGISTER_CONTENT_KEYS = _BASE_CONTENT_KEYS | {"instructions"}

_DEVIATION_REQUIRED_STRINGS = ("agent_id", "policy_id", "description")
_DEVIATION_MAX_LENGTHS = {"agent_id": 100, "policy_id": 100, "description": 300}
_DEVIATION_ALLOWED_KEYS = frozenset((*_DEVIATION_REQUIRED_STRINGS, "timestamp"))
_DEVIATION_CONTENT_KEYS = _BASE_CONTENT_KEYS | {"instructions", "evidence"}


def _is_array_index_key(key):
    """A canonical ECMAScript array-index key: ASCII digits, no leading zero
    (except "0" itself), value <= 2**32 - 2."""
    return (
        isinstance(key, str)
        and key.isascii()
        and key.isdigit()
        and (key == "0" or not key.startswith("0"))
        and len(key) <= 10
        and int(key) <= 4294967294
    )


def _js_key_order(obj):
    """Object.keys enumeration order: array-index keys first in ascending
    numeric order, then the remaining keys in insertion order — so error
    LISTS match the TS validators, not just error sets."""
    indices = sorted((k for k in obj if _is_array_index_key(k)), key=int)
    rest = [k for k in obj if not _is_array_index_key(k)]
    return indices + rest


def _scan_keys(obj, content_keys, allowed_keys, errors):
    for key in _js_key_order(obj):
        if key in content_keys:
            errors.append(_content_msg(key))
        elif key not in allowed_keys:
            errors.append(_unknown_msg(key))


def _check_required_string(obj, key, max_lengths, errors, desc_message=False):
    v = obj.get(key)
    if not isinstance(v, str) or _js_trim(v) == "":
        errors.append(_required_msg(key))
    elif _utf16_len(v) > max_lengths[key]:
        if desc_message and key == "description":
            errors.append(_max_desc_msg(max_lengths[key]))
        else:
            errors.append(_max_label_msg(key, max_lengths[key]))


def validate_ingest_event(payload):
    """Mirror of validateIngestEvent (contract.ts). Returns
    {"ok": True, "event": {...}} or {"ok": False, "errors": [...]}."""
    if not isinstance(payload, dict):
        return {"ok": False, "errors": [_BODY_MSG]}
    obj = payload
    errors = []

    _scan_keys(obj, _TASK_CONTENT_KEYS, _TASK_ALLOWED_KEYS, errors)

    for key in _TASK_REQUIRED_STRINGS:
        _check_required_string(obj, key, _TASK_MAX_LENGTHS, errors, desc_message=True)

    if obj.get("outcome") not in _TASK_OUTCOMES:
        errors.append('"outcome": must be one of ' + ", ".join(_TASK_OUTCOMES))
    if not _is_non_negative_int(obj.get("duration_sec")):
        errors.append('"duration_sec": non-negative integer seconds')
    if not _is_non_negative_number(obj.get("cost_usd")):
        errors.append('"cost_usd": non-negative number')
    if not _is_non_negative_int(obj.get("units")):
        errors.append('"units": non-negative integer')

    if "timestamp" in obj:
        if not isinstance(obj["timestamp"], str) or not _is_valid_timestamp(obj["timestamp"]):
            errors.append(_TIMESTAMP_MSG)
    if "tokens" in obj and not _is_non_negative_int(obj["tokens"]):
        errors.append('"tokens": non-negative integer')

    if errors:
        return {"ok": False, "errors": errors}

    event = {key: obj[key] for key in _TASK_REQUIRED_STRINGS}
    event.update(
        outcome=obj["outcome"],
        duration_sec=obj["duration_sec"],
        cost_usd=obj["cost_usd"],
        units=obj["units"],
    )
    if "timestamp" in obj:
        event["timestamp"] = obj["timestamp"]
    if "tokens" in obj:
        event["tokens"] = obj["tokens"]
    return {"ok": True, "event": event}


def validate_register_event(payload):
    """Mirror of validateRegisterEvent (register-contract.ts)."""
    if not isinstance(payload, dict):
        return {"ok": False, "errors": [_BODY_MSG]}
    obj = payload
    errors = []

    _scan_keys(obj, _REGISTER_CONTENT_KEYS, _REGISTER_ALLOWED_KEYS, errors)

    for key in _REGISTER_REQUIRED_STRINGS:
        _check_required_string(obj, key, _REGISTER_MAX_LENGTHS, errors)

    for key in _REGISTER_OPTIONAL_STRINGS:
        if key not in obj:
            continue
        v = obj[key]
        if not isinstance(v, str) or _js_trim(v) == "":
            errors.append(f'"{key}": non-empty string when provided')
        elif _utf16_len(v) > _REGISTER_MAX_LENGTHS[key]:
            errors.append(_max_label_msg(key, _REGISTER_MAX_LENGTHS[key]))

    for key in _REGISTER_OPTIONAL_NUMBERS:
        if key in obj and not _is_non_negative_number(obj[key]):
            errors.append(f'"{key}": non-negative number')

    if errors:
        return {"ok": False, "errors": errors}

    event = {"agent_id": obj["agent_id"], "name": obj["name"]}
    for key in (*_REGISTER_OPTIONAL_STRINGS, *_REGISTER_OPTIONAL_NUMBERS):
        if key in obj:
            event[key] = obj[key]
    return {"ok": True, "event": event}


def validate_deviation_event(payload):
    """Mirror of validateDeviationEvent (deviation-contract.ts)."""
    if not isinstance(payload, dict):
        return {"ok": False, "errors": [_BODY_MSG]}
    obj = payload
    errors = []

    _scan_keys(obj, _DEVIATION_CONTENT_KEYS, _DEVIATION_ALLOWED_KEYS, errors)

    for key in _DEVIATION_REQUIRED_STRINGS:
        _check_required_string(obj, key, _DEVIATION_MAX_LENGTHS, errors, desc_message=True)

    if "timestamp" in obj:
        if not isinstance(obj["timestamp"], str) or not _is_valid_timestamp(obj["timestamp"]):
            errors.append(_TIMESTAMP_MSG)

    if errors:
        return {"ok": False, "errors": errors}

    event = {key: obj[key] for key in _DEVIATION_REQUIRED_STRINGS}
    if "timestamp" in obj:
        event["timestamp"] = obj["timestamp"]
    return {"ok": True, "event": event}


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------


class MetadataContractError(ValueError):
    """The event violated the metadata-only contract. Never sent over the wire."""

    def __init__(self, errors):
        self.errors = list(errors)
        super().__init__(
            "Event rejected by the metadata-only contract:\n  - " + "\n  - ".join(self.errors)
        )


class ReportResult:
    """Outcome of one send: accepted, server-assigned id, or the last error."""

    __slots__ = ("accepted", "id", "error")

    def __init__(self, accepted, id=None, error=None):
        self.accepted = accepted
        self.id = id
        self.error = error

    def __repr__(self):
        return f"ReportResult(accepted={self.accepted!r}, id={self.id!r}, error={self.error!r})"


def _strip_none(fields):
    """None means "not provided" — it must not clobber reporter defaults
    (the analog of stripUndefined in the TS SDK)."""
    return {k: v for k, v in fields.items() if v is not None}


def _reject_json_constant(name):
    """Python's json.loads accepts NaN/Infinity by default; JSON.parse (the
    TS SDK's parser) does not — reject them so both SDKs retry such bodies."""
    raise ValueError(f"invalid JSON literal: {name}")


def _default_transport(url, body, headers, timeout):
    """POST via urllib. Returns (status, response_text); raises on transport
    failure. HTTPError is a response, not a failure — the caller decides."""
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "replace")


def _js_round(x):
    """Math.round rounds half toward +Infinity (2.5→3, -2.5→-2); Python's
    round() is banker's rounding and would disagree on exact halves."""
    return math.floor(x + 0.5)


class _TrackedWork:
    """Mutable event under construction inside a `with reporter.track(...)` block."""

    def __init__(self, fields):
        self.fields = dict(fields)

    def update(self, **fields):
        """Enrich the event from work results — units processed, cost, a
        better description, an explicit outcome."""
        self.fields.update(_strip_none(fields))


class TimegramReporter:
    """Client for the Timegram Agent Ops metadata-only ingest API.

    reporter = TimegramReporter(
        ingest_url="https://<project>.supabase.co/functions/v1/ingest",
        api_key="tgk_live_...",
        agent_id="ag-fin-expense",
        defaults={"business_process": "Travel & expense", "cost_center": "Corporate"},
    )
    """

    def __init__(
        self,
        ingest_url,
        api_key,
        agent_id,
        *,
        defaults=None,
        on_error=None,
        max_retries=2,
        timeout=10.0,
        transport=None,
        sleep=None,
    ):
        for name, value in (("ingest_url", ingest_url), ("api_key", api_key), ("agent_id", agent_id)):
            if not value:
                raise ValueError(f'TimegramReporter: "{name}" is required')
        self.ingest_url = ingest_url.rstrip("/")
        self.api_key = api_key
        self.agent_id = agent_id
        self.defaults = dict(defaults or {})
        self.max_retries = max_retries
        self.timeout = timeout
        self._on_error = on_error or (lambda err, event: print(str(err), file=sys.stderr))
        self._transport = transport or _default_transport
        self._sleep = sleep or time.sleep

    # -- the three wire calls ------------------------------------------------

    def report(self, **fields):
        """Validate locally and send one completed unit of work.

        Raises MetadataContractError for contract violations; returns
        ReportResult(accepted=False) — never raises — for network/server
        failures. Pass timestamp=... (ISO 8601 with offset) to backfill.
        """
        candidate = {"agent_id": self.agent_id, **self.defaults, **_strip_none(fields)}
        result = validate_ingest_event(candidate)
        if not result["ok"]:
            raise MetadataContractError(result["errors"])
        return self._send(self.ingest_url, result["event"])

    def register_agent(self, **meta):
        """Register (or enrich) this reporter's agent in the workspace
        registry — name, department, owner, budget, human baseline. Same
        metadata-only contract; same never-raise network semantics."""
        candidate = {"agent_id": self.agent_id, **_strip_none(meta)}
        result = validate_register_event(candidate)
        if not result["ok"]:
            raise MetadataContractError(result["errors"])
        return self._send(self.ingest_url + "/register", result["event"])

    def report_deviation(self, **fields):
        """Report a policy deviation (arrives 'open'; resolution happens in
        the workspace, not via API)."""
        candidate = {"agent_id": self.agent_id, **_strip_none(fields)}
        result = validate_deviation_event(candidate)
        if not result["ok"]:
            raise MetadataContractError(result["errors"])
        return self._send(self.ingest_url + "/deviation", result["event"])

    # -- tracking ------------------------------------------------------------

    @contextlib.contextmanager
    def track(self, **fields):
        """Run one unit of agent work and report it automatically.

        with reporter.track(description="Audited batch #7141", units=28, cost_usd=0.67) as work:
            result = do_the_work()
            work.update(units=result.count)

        Duration is measured; outcome is 'completed' on normal exit (unless
        the block set one via update) and 'failed' on exception — the
        exception is re-raised after reporting.
        """
        work = _TrackedWork(_strip_none(fields))
        started = time.monotonic()
        try:
            yield work
        except BaseException:
            work.fields["outcome"] = "failed"
            work.fields["duration_sec"] = max(0, _js_round(time.monotonic() - started))
            self.report(**work.fields)
            raise
        work.fields.setdefault("outcome", "completed")
        work.fields["duration_sec"] = max(0, _js_round(time.monotonic() - started))
        self.report(**work.fields)

    # -- transport -----------------------------------------------------------

    def _send(self, url, event):
        body = json.dumps(event).encode("utf-8")
        headers = {"Content-Type": "application/json", "x-api-key": self.api_key}

        last_error = "unknown error"
        for attempt in range(self.max_retries + 1):
            if attempt > 0:
                self._sleep(0.25 * 2 ** (attempt - 1))
            try:
                status, text = self._transport(url, body, headers, self.timeout)
                if 200 <= status < 300:
                    # Mirror the TS SDK's `(await res.json()).id`: JSON.parse
                    # rejects NaN/Infinity, and `.id` on null throws — both
                    # land in the retry path, so they must raise here too.
                    data = json.loads(text, parse_constant=_reject_json_constant)
                    if data is None:
                        raise ValueError("null response body has no id")
                    server_id = data.get("id") if isinstance(data, dict) else None
                    return ReportResult(True, id=server_id)
                last_error = f"HTTP {status}: {text[:300]}"
                # 4xx won't improve on retry — the server disagreed with this event.
                if 400 <= status < 500:
                    break
            except Exception as err:  # noqa: BLE001 — reporting must never crash the host
                last_error = str(err) or err.__class__.__name__

        error = RuntimeError(f"Timegram report failed: {last_error}")
        try:
            self._on_error(error, event)
        except Exception:  # noqa: BLE001 — a broken error hook must not crash the host either
            pass
        return ReportResult(False, error=last_error)
