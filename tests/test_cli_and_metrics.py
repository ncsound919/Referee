"""
test_cli_and_metrics.py

Extended Python test suite covering:
  - referee-core CLI commands (audit, verify, suite)
  - Calibration slope and intercept-in-the-large
  - Patient-level cluster bootstrap CI
  - Patient-level permutation null p-value
  - Patient overlap leakage detector
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pandas as pd

from referee_core import cli, leakage, metrics
from referee_core.schema import Policy

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_sample_csv(n: int = 100, seed: int = 42) -> str:
    rng = np.random.default_rng(seed)
    y = rng.integers(0, 2, size=n)
    scores = np.clip(y * 0.6 + rng.normal(0.2, 0.2, size=n), 0.01, 0.99)
    df = pd.DataFrame({
        "patient_id": [f"PT{i:03d}" for i in range(n)],
        "label": y,
        "score": scores.round(4),
        "split": ["train"] * 60 + ["test"] * 40,
    })
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# CLI Tests
# ---------------------------------------------------------------------------

class TestRefereeCLI:
    def test_cli_audit_command(self, tmp_path: Path):
        csv_file = tmp_path / "predictions.csv"
        csv_file.write_text(_make_sample_csv())

        claim_data = {
            "claim_id": "cli_test_001",
            "title": "CLI Audit Test",
            "claimed_auc": 0.80,
            "eval_on": "test",
            "score_is_probability": False,
        }
        claim_file = tmp_path / "claim.json"
        claim_file.write_text(json.dumps(claim_data))

        # Run cli main with audit args
        ret = cli.main(["audit", str(csv_file), str(claim_file)])
        assert ret == 0

    def test_cli_audit_with_custom_policy(self, tmp_path: Path):
        csv_file = tmp_path / "predictions.csv"
        csv_file.write_text(_make_sample_csv())

        claim_file = tmp_path / "claim.json"
        claim_file.write_text(json.dumps({
            "claim_id": "cli_policy_test",
            "title": "CLI Policy Test",
            "claimed_auc": 0.80,
            "eval_on": "test",
        }))

        policy_file = tmp_path / "policy.json"
        policy_file.write_text(json.dumps({
            "seed": 123,
            "n_boot": 150,
            "repro_tolerance": 0.05,
        }))

        ret = cli.main(["audit", str(csv_file), str(claim_file), "--policy", str(policy_file)])
        assert ret == 0

    def test_cli_suite_smoke(self):
        # Smoke test running 1 rep of the seeded fault suite
        ret = cli.main(["suite", "--reps", "1"])
        assert ret == 0


# ---------------------------------------------------------------------------
# Metrics & Leakage Tests
# ---------------------------------------------------------------------------

class TestMetricsEdgeCases:
    def test_calibration_slope_and_brier(self):
        # Synthetic probabilities matching true log-odds
        rng = np.random.default_rng(10)
        probs = rng.uniform(0.1, 0.9, size=500)
        y = (rng.uniform(0, 1, size=500) < probs).astype(int)

        cal = metrics.calibration(y, probs)
        assert cal["status"] == "ok"
        assert "slope" in cal
        assert "intercept_in_the_large" in cal
        assert "brier" in cal
        assert 0.0 <= cal["brier"] <= 1.0
        # A well-calibrated model has slope near 1.0
        assert 0.7 <= cal["slope"] <= 1.3

    def test_calibration_refused_on_out_of_bounds_probabilities(self):
        y = np.array([0, 1, 0, 1])
        # Probabilities outside [0, 1]
        out_of_bounds = np.array([-0.1, 0.5, 0.8, 1.2])
        cal = metrics.calibration(y, out_of_bounds)
        assert cal["status"] == "refused"
        assert "scores are not probabilities in [0, 1]" in cal["reason"]

    def test_cluster_bootstrap_confidence_interval(self):
        rng = np.random.default_rng(42)
        n = 80
        y = rng.integers(0, 2, size=n)
        scores = y * 0.7 + rng.normal(0, 0.3, size=n)

        df = pd.DataFrame({
            "patient_id": [f"PT_{i}" for i in range(n)],
            "label": y,
            "score": scores,
        })

        boot = metrics.cluster_bootstrap_auc(df, "score", n_boot=200, seed=42)
        assert boot["status"] == "ok"
        assert "estimate" in boot
        assert "ci_low" in boot
        assert "ci_high" in boot
        assert boot["ci_low"] <= boot["estimate"] <= boot["ci_high"]

    def test_permutation_null_p_value(self):
        rng = np.random.default_rng(33)
        # Strong signal: p-value should be very small
        y = np.array([0] * 40 + [1] * 40)
        score = np.array(rng.normal(0, 0.5, 40).tolist() + rng.normal(3, 0.5, 40).tolist())

        df = pd.DataFrame({
            "patient_id": [f"PT_{i}" for i in range(80)],
            "label": y,
            "score": score,
        })

        res = metrics.permutation_null(df, "score", n_perm=199, seed=42)
        assert res["status"] == "ok"
        assert res["p_value"] < 0.05

    def test_patient_overlap_detector(self):
        policy = Policy()
        # Clean dataframe with no overlap
        clean_df = pd.DataFrame({
            "patient_id": ["P1", "P2", "P3", "P4"],
            "sample_id": ["S1", "S2", "S3", "S4"],
            "split": ["train", "train", "test", "test"],
        })
        res_clean = leakage.patient_overlap(clean_df, policy)
        assert res_clean["status"] == "ok"
        assert res_clean["shared_patients"] == 0
        assert res_clean["test_patient_fraction"] == 0.0

        # Contaminated dataframe where P2 is in both train and test
        leaked_df = pd.DataFrame({
            "patient_id": ["P1", "P2", "P2", "P3"],
            "sample_id": ["S1", "S2_a", "S2_b", "S3"],
            "split": ["train", "train", "test", "test"],
        })
        res_leaked = leakage.patient_overlap(leaked_df, policy)
        assert res_leaked["status"] == "ok"
        assert res_leaked["shared_patients"] == 1
        assert res_leaked["test_patient_fraction"] > 0.0
