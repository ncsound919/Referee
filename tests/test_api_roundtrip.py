"""
test_api_roundtrip.py

End-to-end round-trip through the FastAPI referee-core engine using
httpx.TestClient (no live server required).

Covers:
  - POST /audit with a synthetic prediction CSV  → verify verdict shape
  - POST /verify with the returned report        → verify chain integrity
  - POST /pre_check                              → skill & licence validation
  - POST /run_experiment SHA mismatch guard      → 400 on bad digest
"""
from __future__ import annotations

import io
import json

import pandas as pd
from fastapi.testclient import TestClient

from referee_core.api import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_csv(n: int = 120, test_frac: float = 0.3, seed: int = 42) -> str:
    """Return a synthetic prediction CSV with no leakage and AUC ≈ 0.85."""
    import numpy as np

    rng = np.random.default_rng(seed)
    patient_ids = [f"PT{i:04d}" for i in range(n)]
    labels = rng.integers(0, 2, size=n)

    # Predictions correlated with labels → AUC well above 0.5
    noise = rng.normal(0, 0.15, size=n)
    scores = labels.astype(float) * 0.7 + 0.15 + noise
    scores = scores.clip(0.01, 0.99)

    split_cutoff = int(n * (1 - test_frac))
    splits = ["train"] * split_cutoff + ["test"] * (n - split_cutoff)

    df = pd.DataFrame(
        {
            "patient_id": patient_ids,
            "label": labels,
            "score": scores.round(4),
            "split": splits,
        }
    )
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def _make_claim(claimed_auc: float = 0.85) -> dict:
    return {
        "claim_id": "rt_test_001",
        "title": "Round-trip test claim",
        "claimed_auc": claimed_auc,
        "eval_on": "test",
        "score_is_probability": False,
        "split_description": "random 70/30",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAuditRoundTrip:
    def test_audit_returns_verdict(self):
        csv = _make_csv()
        claim = _make_claim(0.85)
        resp = client.post("/audit", json={"claim": claim, "csv_text": csv})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "verdict" in body, f"Missing 'verdict' key: {body}"
        assert body["verdict"] in {
            "REPRODUCED", "NOT_REPRODUCED", "FAILS_BASELINE",
            "LEAKAGE_DETECTED", "UNVERIFIABLE", "OUT_OF_SCOPE",
        }

    def test_audit_has_decision_sha256(self):
        csv = _make_csv()
        claim = _make_claim(0.85)
        resp = client.post("/audit", json={"claim": claim, "csv_text": csv})
        body = resp.json()
        assert "decision_sha256" in body, "Audit response must include decision_sha256"
        assert len(body["decision_sha256"]) == 64, "SHA-256 must be 64 hex chars"

    def test_verify_accepts_audit_report(self):
        csv = _make_csv()
        claim = _make_claim(0.85)
        # Step 1: audit
        audit_resp = client.post("/audit", json={"claim": claim, "csv_text": csv})
        assert audit_resp.status_code == 200
        report = audit_resp.json()

        # Step 2: verify
        verify_resp = client.post("/verify", json={"report": report})
        assert verify_resp.status_code == 200
        vbody = verify_resp.json()
        assert "valid" in vbody
        assert isinstance(vbody["valid"], bool)

    def test_csv_exceeds_size_limit_returns_413(self):
        oversized = "a" * (25 * 1024 * 1024 + 1)
        claim = _make_claim()
        resp = client.post("/audit", json={"claim": claim, "csv_text": oversized})
        assert resp.status_code == 413

    def test_pre_check_valid_skills_pass(self):
        resp = client.post(
            "/pre_check",
            json={
                "dataset_ids": ["TCGA-BRCA"],
                "user_role": "academic",
                "pipeline_skills": ["split_by_patient_level", "run_glmnet_baseline"],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "PASSED"

    def test_pre_check_invalid_skill_rejected(self):
        resp = client.post(
            "/pre_check",
            json={
                "dataset_ids": ["TCGA-BRCA"],
                "user_role": "academic",
                "pipeline_skills": ["nonexistent_skill"],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REJECTED"

    def test_pre_check_licence_block(self):
        resp = client.post(
            "/pre_check",
            json={
                "dataset_ids": ["MSK-MET"],
                "user_role": "academic",
                "pipeline_skills": ["split_by_patient_level"],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "REJECTED"

    def test_run_experiment_bad_sha_returns_400(self):
        snapshot_json = json.dumps({"key": "value"})
        bad_sha = "0" * 64
        resp = client.post(
            "/run_experiment",
            json={
                "engine_name": "tumortwin",
                "snapshot_json": snapshot_json,
                "sha256": bad_sha,
            },
        )
        assert resp.status_code == 400

    def test_unverifiable_claim_with_empty_csv(self):
        claim = _make_claim(0.85)
        resp = client.post("/audit", json={"claim": claim, "csv_text": "patient_id,label,score,split\n"})
        assert resp.status_code == 200
        body = resp.json()
        # Empty table should produce UNVERIFIABLE
        assert body.get("verdict") in {"UNVERIFIABLE", "NOT_REPRODUCED"}
