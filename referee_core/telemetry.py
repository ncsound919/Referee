"""Ecosystem telemetry: the Referee's lane into the Sieve spine.

The engine is the only component that computes an audit number, so it is also
the only honest source for "an audit ran, and here is what it concluded".
Every event is ``overlay.ecosystem.event.v1`` (shared with the Concordance
website and the Android app) and is delivered fail-soft:

* no ``SIEVE_URL`` -> nothing is attempted, and ``emit`` says so;
* a receiver that is down, slow, or refuses the event -> a result dict, never an
  exception into the audit path. A failed telemetry hop must not turn a valid
  report into a 500.

No claim title, CSV content, or patient-level value enters the envelope. The
props carry the verdict, the report hash, and the shape of the run.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any

SCHEMA = "overlay.ecosystem.event.v1"
SOURCE = "referee"
MAX_PROPS_BYTES = 8_192
TIMEOUT_SECONDS = 2.0

_SAFE = re.compile(r"[^A-Za-z0-9_.:@/-]+")


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def enabled() -> bool:
    """True only when a receiver is configured and emission is not switched off."""
    if _env("SIEVE_TELEMETRY", "1") == "0":
        return False
    return bool(_env("SIEVE_URL"))


def safe_id(value: Any) -> str | None:
    """Make an id acceptable to the receiver's pattern (or drop it).

    A claim id is free text in some producers; an event with an invalid subject
    would be refused at the boundary and the audit would vanish from the spine.
    Sanitising here keeps the event, and the original value stays in the report.
    """
    if value is None:
        return None
    text = _SAFE.sub("-", str(value).strip())[:120].strip("-")
    if not text:
        return None
    if not re.match(r"^[A-Za-z0-9]", text):
        text = f"x-{text}"[:120]
    return text


def _cap_props(props: dict[str, Any] | None) -> dict[str, Any] | None:
    if props is None:
        return None
    try:
        encoded = json.dumps(props, separators=(",", ":"), default=str, sort_keys=True).encode()
    except (TypeError, ValueError):
        return {"truncated": True, "reason": "unserializable"}
    if len(encoded) <= MAX_PROPS_BYTES:
        return props
    return {"truncated": True, "bytes": len(encoded)}


def build_event(
    kind: str,
    *,
    status: str = "ok",
    severity: str = "info",
    subject: dict[str, Any] | None = None,
    props: dict[str, Any] | None = None,
    duration_ms: int | float | None = None,
    event_id: str | None = None,
    ts: int | None = None,
) -> dict[str, Any]:
    subject_clean: dict[str, str] | None = None
    if subject:
        sk = _SAFE.sub("-", str(subject.get("kind") or "").strip().lower())[:64].strip("-")
        sid = safe_id(subject.get("id"))
        if sk or sid:
            subject_clean = {"kind": sk or "subject", "id": sid or "unknown"}

    event: dict[str, Any] = {
        "schema": SCHEMA,
        "ts": int(ts if ts is not None else time.time() * 1000),
        "source": SOURCE,
        "kind": kind,
        "severity": severity,
        "status": status,
        "subject": subject_clean,
        "session": None,
        "duration_ms": int(duration_ms) if duration_ms is not None else None,
        "data_class": "aggregate",
        "props": _cap_props(props),
    }
    if event_id:
        event["id"] = event_id
    else:
        basis = json.dumps(
            {
                "source": event["source"],
                "kind": event["kind"],
                "subject": event["subject"],
                "props": event["props"],
            },
            separators=(",", ":"),
            sort_keys=True,
            default=str,
        )
        event["id"] = "evt_" + hashlib.sha256(basis.encode()).hexdigest()[:24]
    return event


def emit(event: dict[str, Any], timeout: float = TIMEOUT_SECONDS) -> dict[str, Any]:
    """POST one event. Never raises; the result names what happened."""
    if not enabled():
        return {"sent": False, "skipped": "SIEVE_URL not configured"}

    url = _env("SIEVE_URL").rstrip("/") + "/ecosystem/event"
    key = _env("SIEVE_AUTH_KEY")
    headers = {"content-type": "application/json"}
    if key:
        headers["authorization"] = f"Bearer {key}"
    request = urllib.request.Request(
        url,
        data=json.dumps(event).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - configured host
            body = json.loads(response.read().decode("utf-8") or "{}")
            return {
                "sent": True,
                "status": response.status,
                "inserted": bool(body.get("inserted", True)),
            }
    except urllib.error.HTTPError as exc:
        return {"sent": False, "status": exc.code, "error": f"HTTP {exc.code}"}
    except Exception as exc:  # noqa: BLE001 - telemetry must not break an audit
        return {"sent": False, "error": str(exc)[:200]}


def schedule(background: Any, kind: str, **fields: Any) -> None:
    """Queue one event without blocking the audit.

    The success path passes FastAPI's ``BackgroundTasks`` so delivery happens
    after the response. A failure path has no response to attach to (Starlette
    never runs background tasks when the handler raises), so those callers pass
    ``None`` and the event goes out on a daemon thread instead of being lost.
    """
    if not enabled():
        return
    event = build_event(kind, **fields)
    if background is not None:
        background.add_task(emit, event)
    else:
        threading.Thread(target=emit, args=(event,), daemon=True).start()


def elapsed_ms(started: float) -> int:
    return max(0, int((time.perf_counter() - started) * 1000))
