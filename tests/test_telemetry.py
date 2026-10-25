"""The Referee's telemetry lane.

Positive controls: a valid event is built deterministically and POSTed with the
bearer token; a successful audit queues exactly one audit.completed event.

Negative controls: an unconfigured receiver sends nothing, a dead receiver
returns a result instead of raising, and a failed audit is recorded with no
response left to attach a background task to.
"""
from __future__ import annotations

import io
import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from referee_core import api, telemetry
from referee_core.api import app


def _make_csv(n: int = 120, seed: int = 42) -> str:
    rng = np.random.default_rng(seed)
    labels = rng.integers(0, 2, size=n)
    scores = labels.astype(float) * 0.7 + 0.15 + rng.normal(0, 0.15, size=n)
    df = pd.DataFrame(
        {
            "patient_id": [f"PT{i:04d}" for i in range(n)],
            "label": labels,
            "score": scores.clip(0.01, 0.99).round(4),
            "split": ["train"] * int(n * 0.7) + ["test"] * (n - int(n * 0.7)),
        }
    )
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def _claim(claim_id: str = "telemetry_001") -> dict:
    return {
        "claim_id": claim_id,
        "title": "Telemetry test claim",
        "claimed_auc": 0.85,
        "eval_on": "test",
        "score_is_probability": False,
    }


class _FakeResponse:
    status = 200

    def read(self) -> bytes:
        return b'{"ok":true,"inserted":true}'

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


def test_build_event_is_deterministic_and_aggregate():
    a = telemetry.build_event(
        "audit.completed",
        subject={"kind": "claim", "id": "claim 42"},
        props={"verdict": "PASSED"},
        ts=1_700_000_000_000,
    )
    b = telemetry.build_event(
        "audit.completed",
        subject={"kind": "claim", "id": "claim 42"},
        props={"verdict": "PASSED"},
        ts=1_700_000_100_000,
    )
    assert a["schema"] == "overlay.ecosystem.event.v1"
    assert a["data_class"] == "aggregate"
    assert a["source"] == "referee"
    assert a["id"].startswith("evt_")
    assert a["id"] == b["id"], "the id is derived from content, not the clock"
    assert a["subject"] == {"kind": "claim", "id": "claim-42"}, "ids are sanitized for the receiver"

    changed = telemetry.build_event(
        "audit.completed", subject={"kind": "claim", "id": "claim 42"}, props={"verdict": "FAILED"}
    )
    assert changed["id"] != a["id"], "a changed result is a new event"


def test_oversized_props_are_truncated_not_sent_invalid():
    event = telemetry.build_event("audit.completed", props={"note": "x" * (telemetry.MAX_PROPS_BYTES + 10)})
    assert event["props"]["truncated"] is True
    assert "note" not in event["props"]


def test_emit_posts_the_envelope_with_the_bearer(monkeypatch):
    captured: dict = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["headers"] = request.headers
        captured["body"] = json.loads(request.data)
        captured["timeout"] = timeout
        return _FakeResponse()

    monkeypatch.setenv("SIEVE_URL", "http://sieve.test:3072/")
    monkeypatch.setenv("SIEVE_AUTH_KEY", "test-key")
    monkeypatch.delenv("SIEVE_TELEMETRY", raising=False)
    monkeypatch.setattr(telemetry.urllib.request, "urlopen", fake_urlopen)

    result = telemetry.emit(telemetry.build_event("audit.completed", props={"verdict": "PASSED"}))

    assert result == {"sent": True, "status": 200, "inserted": True}
    assert captured["url"] == "http://sieve.test:3072/ecosystem/event"
    assert captured["headers"].get("Authorization") == "Bearer test-key"
    assert captured["body"]["schema"] == "overlay.ecosystem.event.v1"
    assert captured["body"]["kind"] == "audit.completed"


def test_emit_skips_without_a_receiver(monkeypatch):
    monkeypatch.delenv("SIEVE_URL", raising=False)
    monkeypatch.delenv("SIEVE_TELEMETRY", raising=False)
    assert telemetry.enabled() is False
    result = telemetry.emit(telemetry.build_event("audit.completed"))
    assert result["sent"] is False
    assert "SIEVE_URL" in result["skipped"]


def test_emit_is_fail_soft(monkeypatch):
    def dead(*_args, **_kwargs):
        raise OSError("connection refused")

    monkeypatch.setenv("SIEVE_URL", "http://sieve.test:3072")
    monkeypatch.delenv("SIEVE_TELEMETRY", raising=False)
    monkeypatch.setattr(telemetry.urllib.request, "urlopen", dead)

    result = telemetry.emit(telemetry.build_event("audit.failed"), timeout=0.1)
    assert result["sent"] is False
    assert "connection refused" in result["error"]


def test_audit_queues_one_completed_event(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setenv("SIEVE_URL", "http://sieve.test:3072")
    monkeypatch.delenv("SIEVE_TELEMETRY", raising=False)
    monkeypatch.setattr(telemetry, "emit", lambda event, timeout=2.0: sent.append(event) or {"sent": True})

    response = TestClient(app).post("/audit", json={"claim": _claim(), "csv_text": _make_csv()})
    assert response.status_code == 200

    completed = [event for event in sent if event["kind"] == "audit.completed"]
    assert len(completed) == 1, "exactly one event per audit"
    assert completed[0]["subject"] == {"kind": "claim", "id": "telemetry_001"}
    assert completed[0]["props"]["verdict"] == response.json()["verdict"]
    assert completed[0]["props"]["report_sha256"] == response.json()["report_sha256"]
    assert completed[0]["duration_ms"] is not None


def test_failed_audit_is_recorded_without_a_response(monkeypatch):
    calls: list[tuple] = []
    monkeypatch.setenv("SIEVE_URL", "http://sieve.test:3072")
    monkeypatch.delenv("SIEVE_TELEMETRY", raising=False)
    monkeypatch.setattr(
        telemetry,
        "schedule",
        lambda background, kind, **fields: calls.append((background, kind, fields)),
    )

    def boom(*_args, **_kwargs):
        raise RuntimeError("engine exploded")

    monkeypatch.setattr(api, "audit_csv", boom)

    response = TestClient(app, raise_server_exceptions=False).post(
        "/audit", json={"claim": _claim(), "csv_text": _make_csv()}
    )
    assert response.status_code == 500
    assert calls, "the failure was reported"
    background, kind, fields = calls[0]
    assert background is None, "a failure has no response to attach a background task to"
    assert kind == "audit.failed"
    assert fields["status"] == "error"
    assert fields["props"]["reason"] == "RuntimeError"
