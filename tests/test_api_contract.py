"""
test_api_contract.py

The HTTP surface of the referee core. These tests pin the behaviour an operator
depends on:

  - the service fails closed when no key is configured, and opens only when
    REFEREE_ENV says so,
  - every accepted credential header is honoured,
  - the rate limiter actually refuses a burst,
  - ``/audit_batch`` audits each item independently,
  - ``/verify`` re-audits when it is given the table,
  - ``/run_experiment`` refuses to fabricate a result.

The rate-limiter test resets the module-level bucket first: the limiter is
process-global, so an earlier test would otherwise consume the budget.
"""
from __future__ import annotations

import hashlib
import importlib
import io
import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from referee_core import api
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


def _make_claim(claimed_auc: float = 0.85) -> dict:
    return {
        "claim_id": "api_contract_001",
        "title": "API contract claim",
        "claimed_auc": claimed_auc,
        "eval_on": "test",
        "score_is_probability": False,
        "split_description": "random 70/30",
    }


client = TestClient(app)
# A client that returns 500 instead of re-raising, so the server-side
# refusals can be asserted on.
raw_client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Health and authentication
# ---------------------------------------------------------------------------

def test_health_is_reachable_without_a_credential():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "referee-core"


def test_the_documentation_endpoints_are_reachable_without_a_credential():
    assert client.get("/openapi.json").status_code == 200


def test_a_service_without_a_key_fails_closed_in_production(monkeypatch):
    """Finding: a missing secret used to be indistinguishable from a working one."""
    monkeypatch.setenv("REFEREE_ENV", "production")
    monkeypatch.delenv("REFEREE_API_KEY", raising=False)
    reloaded = importlib.reload(api)
    try:
        prod_client = TestClient(reloaded.app, raise_server_exceptions=False)
        resp = prod_client.post("/audit", json={"claim": _make_claim(), "csv_text": _make_csv()})
        assert resp.status_code == 503
        assert "REFEREE_API_KEY is not configured" in resp.json()["detail"]
    finally:
        monkeypatch.setenv("REFEREE_ENV", "development")
        importlib.reload(api)


def test_health_is_still_reachable_when_the_service_fails_closed(monkeypatch):
    monkeypatch.setenv("REFEREE_ENV", "production")
    monkeypatch.delenv("REFEREE_API_KEY", raising=False)
    reloaded = importlib.reload(api)
    try:
        prod_client = TestClient(reloaded.app, raise_server_exceptions=False)
        assert prod_client.get("/health").status_code == 200
    finally:
        monkeypatch.setenv("REFEREE_ENV", "development")
        importlib.reload(api)


@pytest.mark.parametrize(
    "headers",
    [
        {"x-referee-key": "s3cret"},
        {"x-api-key": "s3cret"},
        {"authorization": "Bearer s3cret"},
    ],
)
def test_every_accepted_credential_header_is_honoured(monkeypatch, headers):
    monkeypatch.setenv("REFEREE_API_KEY", "s3cret")
    reloaded = importlib.reload(api)
    try:
        authed = TestClient(reloaded.app, raise_server_exceptions=False)
        assert authed.get("/health").status_code == 200
        # /health is exempt, so use a protected route to prove the key was read.
        resp = authed.post("/verify", json={}, headers=headers)
        assert resp.status_code == 200, resp.text
    finally:
        monkeypatch.delenv("REFEREE_API_KEY", raising=False)
        importlib.reload(api)


def test_a_wrong_credential_is_refused(monkeypatch):
    monkeypatch.setenv("REFEREE_API_KEY", "s3cret")
    reloaded = importlib.reload(api)
    try:
        authed = TestClient(reloaded.app, raise_server_exceptions=False)
        resp = authed.post("/verify", json={}, headers={"x-referee-key": "wrong"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "invalid or missing referee API key"
    finally:
        monkeypatch.delenv("REFEREE_API_KEY", raising=False)
        importlib.reload(api)


def test_a_missing_credential_is_refused(monkeypatch):
    monkeypatch.setenv("REFEREE_API_KEY", "s3cret")
    reloaded = importlib.reload(api)
    try:
        authed = TestClient(reloaded.app, raise_server_exceptions=False)
        resp = authed.post("/verify", json={})
        assert resp.status_code == 401
    finally:
        monkeypatch.delenv("REFEREE_API_KEY", raising=False)
        importlib.reload(api)


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def test_the_default_rate_limit_is_sixty_requests_a_minute():
    assert api._RATE_LIMIT == 60


def test_a_burst_is_rate_limited():
    """Finding: the limiter existed but was never exercised."""
    api._rate_buckets.clear()
    statuses = [client.post("/verify", json={}).status_code for _ in range(api._RATE_LIMIT + 1)]
    assert statuses.count(200) == api._RATE_LIMIT
    assert statuses[-1] == 429
    api._rate_buckets.clear()


def test_a_rate_limited_response_explains_itself():
    api._rate_buckets.clear()
    for _ in range(api._RATE_LIMIT):
        client.post("/verify", json={})
    resp = client.post("/verify", json={})
    assert resp.status_code == 429
    assert resp.json()["detail"] == "rate limit exceeded"
    api._rate_buckets.clear()


def test_the_rate_limit_is_per_client():
    api._rate_buckets.clear()
    for _ in range(api._RATE_LIMIT):
        client.post("/verify", json={})
    assert api._rate_limited("a-different-client") is False
    assert api._rate_limited("testclient") is True
    api._rate_buckets.clear()


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

def test_audit_returns_a_report_with_the_three_digests():
    resp = client.post("/audit", json={"claim": _make_claim(), "csv_text": _make_csv()})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for key in ("input_sha256", "decision_sha256", "report_sha256"):
        assert len(body[key]) == 64


def test_audit_batch_audits_each_item():
    csv = _make_csv()
    resp = client.post(
        "/audit_batch",
        json={"items": [{"claim": _make_claim(), "csv_text": csv}, {"claim": _make_claim(0.60), "csv_text": csv}]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 2
    assert len(body["reports"]) == 2
    for report in body["reports"]:
        assert "verdict" in report
        assert len(report["report_sha256"]) == 64


def test_audit_batch_refuses_an_oversized_item():
    oversized = "a" * (25 * 1024 * 1024 + 1)
    resp = client.post(
        "/audit_batch",
        json={"items": [{"claim": _make_claim(), "csv_text": oversized}]},
    )
    assert resp.status_code == 413
    assert "exceeds 25 MB size limit" in resp.text


def test_audit_batch_with_no_items_returns_an_empty_batch():
    resp = client.post("/audit_batch", json={"items": []})
    assert resp.status_code == 200
    assert resp.json() == {"reports": [], "count": 0}


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

def test_verify_accepts_a_report_checked_against_its_own_table():
    csv = _make_csv()
    report = client.post("/audit", json={"claim": _make_claim(), "csv_text": csv}).json()
    resp = client.post("/verify", json={"report": report, "csv_text": csv})
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


def test_verify_rejects_a_report_checked_against_a_different_table():
    csv = _make_csv()
    report = client.post("/audit", json={"claim": _make_claim(), "csv_text": csv}).json()
    resp = client.post("/verify", json={"report": report, "csv_text": _make_csv(seed=7)})
    assert resp.status_code == 200
    assert resp.json()["valid"] is False


def test_verify_accepts_a_bare_report_that_is_not_wrapped():
    csv = _make_csv()
    report = client.post("/audit", json={"claim": _make_claim(), "csv_text": csv}).json()
    resp = client.post("/verify", json=report)
    assert resp.status_code == 200
    assert resp.json()["valid"] is True


def test_verify_refuses_a_body_that_is_not_a_report():
    resp = client.post("/verify", json={"not": "a report at all"})
    assert resp.status_code == 200
    assert resp.json()["valid"] is False


def test_verify_refuses_a_body_that_is_not_json():
    resp = client.post("/verify", content=b"not json", headers={"content-type": "application/json"})
    assert resp.status_code == 422
    assert "not a report" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Pre-check
# ---------------------------------------------------------------------------

def test_pre_check_blocks_the_licensed_dataset_for_an_academic_role():
    resp = client.post(
        "/pre_check",
        json={
            "dataset_ids": ["MSK-MET"],
            "user_role": "academic",
            "pipeline_skills": ["split_by_patient_level"],
        },
    )
    assert resp.json()["status"] == "REJECTED"
    assert "License blocked for MSK-MET" in resp.json()["reason"]


def test_pre_check_allows_the_licensed_dataset_for_a_licenced_role():
    resp = client.post(
        "/pre_check",
        json={
            "dataset_ids": ["MSK-MET"],
            "user_role": "commercial",
            "pipeline_skills": ["split_by_patient_level"],
        },
    )
    assert resp.json()["status"] == "PASSED"


@pytest.mark.parametrize(
    "skill",
    [
        "split_by_patient_level",
        "run_glmnet_baseline",
        "run_statistical_referee",
        "check_batch_confound",
        "combat_batch_harmonization",
        "run_clinical_cox_baseline",
        "multimodal_clinical_fusion",
        "check_scanner_nuisance_kernel",
        "split_longitudinal_timepoint_held_out",
    ],
)
def test_every_documented_skill_is_accepted(skill):
    resp = client.post(
        "/pre_check",
        json={"dataset_ids": ["TCGA-BRCA"], "user_role": "academic", "pipeline_skills": [skill]},
    )
    assert resp.json()["status"] == "PASSED", skill


def test_pre_check_rejects_an_unknown_skill():
    resp = client.post(
        "/pre_check",
        json={"dataset_ids": ["TCGA-BRCA"], "user_role": "academic", "pipeline_skills": ["invent_science"]},
    )
    assert resp.json()["status"] == "REJECTED"
    assert "does not exist in deterministic library" in resp.json()["reason"]


# ---------------------------------------------------------------------------
# Run experiment
# ---------------------------------------------------------------------------

def test_run_experiment_refuses_an_unknown_engine():
    snapshot_json = json.dumps({"engine": {"name": "nope"}})
    resp = raw_client.post(
        "/run_experiment",
        json={
            "engine_name": "nope",
            "snapshot_json": snapshot_json,
            "sha256": hashlib.sha256(snapshot_json.encode()).hexdigest(),
        },
    )
    assert resp.status_code == 500


def test_run_experiment_refuses_to_fabricate_a_result():
    """The engine must not answer with a made-up simulation.

    The refusal is raised, not returned: FastAPI turns it into a 500 and the
    body carries no results. The exact refusal wording is asserted against the
    adapter directly in ``test_engine_contract.py``.
    """
    snapshot_json = json.dumps({"engine": {"name": "tumortwin"}})
    resp = raw_client.post(
        "/run_experiment",
        json={
            "engine_name": "tumortwin",
            "snapshot_json": snapshot_json,
            "sha256": hashlib.sha256(snapshot_json.encode()).hexdigest(),
            "workspace": "unused-workspace-for-test",
        },
    )
    assert resp.status_code == 500
    assert "results" not in resp.text
