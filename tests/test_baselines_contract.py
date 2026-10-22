"""
test_baselines_contract.py

Baseline comparison is the one dimension the referee can fully assess, and it
is the dimension that turns a "the metric reproduces" claim into "the metric
reproduces *and beats a trivial baseline*".

These tests pin:
  - the reserved-column list that decides what counts as a feature,
  - each of the four ``not_assessed`` reasons,
  - the assessed path: which models run, and how the best one is chosen,
  - the ``FAILS_BASELINE`` verdict, which the core otherwise never produces.
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd
import pytest

from referee_core import baselines
from referee_core.audit import audit_csv
from referee_core.schema import ClaimSpec


def _table(n_test: int = 60, n_train: int = 60, seed: int = 0, with_feature: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for prefix, n, split in (("T", n_test, "test"), ("R", n_train, "train")):
        for i in range(n):
            label = i % 2
            row = {
                "patient_id": f"{prefix}{i:04d}",
                "sample_id": f"{prefix}{i:04d}_0",
                "label": label,
                "split": split,
                "score": float(rng.normal(1.2 * label, 1.0)),
            }
            if with_feature:
                # A feature that perfectly predicts the label.
                row["marker"] = float(label)
            rows.append(row)
    return pd.DataFrame(rows)


def _to_csv(df: pd.DataFrame) -> str:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Feature selection
# ---------------------------------------------------------------------------

def test_reserved_columns_are_the_documented_set():
    assert {
        "patient_id", "sample_id", "label", "split", "score", "nc_score",
        "batch", "site", "center", "scanner", "plate",
    } == baselines.RESERVED


def test_the_models_own_predictions_are_not_a_baseline_feature():
    """The model under audit must not be allowed to audit itself."""
    df = _table()
    assert "score" not in baselines.feature_columns(df)
    assert "label" not in baselines.feature_columns(df)


def test_nuisance_columns_are_not_features_either():
    df = _table()
    df["batch"] = "A"
    df["site"] = "B"
    assert baselines.feature_columns(df) == []


def test_a_real_feature_is_picked_up():
    df = _table(with_feature=True)
    assert baselines.feature_columns(df) == ["marker"]


# ---------------------------------------------------------------------------
# The four not_assessed reasons
# ---------------------------------------------------------------------------

def test_no_features_means_the_baselines_were_not_assessed():
    result = baselines.run_baselines(_table(), "train", "test")
    assert result == {"status": "not_assessed", "reason": "no feature columns supplied"}


def test_missing_train_or_test_rows_means_the_baselines_were_not_assessed():
    df = _table(n_test=0, with_feature=True)
    result = baselines.run_baselines(df, "train", "test")
    assert result["status"] == "not_assessed"
    assert result["reason"] == "need train and test rows"


def test_a_single_class_on_one_side_means_the_baselines_were_not_assessed():
    df = _table(with_feature=True)
    df.loc[df["split"] == "test", "label"] = 1
    result = baselines.run_baselines(df, "train", "test")
    assert result["status"] == "not_assessed"
    assert result["reason"] == "insufficient labelled data"


def test_features_that_cannot_be_coerced_to_numbers_leave_no_usable_rows():
    df = _table(with_feature=True)
    df["marker"] = "not-a-number"
    result = baselines.run_baselines(df, "train", "test")
    assert result["status"] == "not_assessed"
    assert result["reason"] == "insufficient labelled data"


# ---------------------------------------------------------------------------
# The assessed path
# ---------------------------------------------------------------------------

def test_all_three_baseline_models_run_and_are_reported():
    result = baselines.run_baselines(_table(with_feature=True), "train", "test")
    assert result["status"] == "assessed"
    assert {m["model"] for m in result["models"]} == {"LogisticRegression", "ElasticNet", "RandomForest"}
    for model in result["models"]:
        assert 0.0 <= model["test_auc"] <= 1.0


def test_the_best_model_is_the_one_with_the_highest_test_auc():
    result = baselines.run_baselines(_table(with_feature=True), "train", "test")
    best = max(m["test_auc"] for m in result["models"])
    assert result["best_test_auc"] == best
    named = next(m for m in result["models"] if m["model"] == result["best_model"])
    assert named["test_auc"] == result["best_test_auc"]


def test_a_perfect_feature_produces_a_perfect_baseline():
    result = baselines.run_baselines(_table(with_feature=True), "train", "test")
    assert result["best_test_auc"] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# The FAILS_BASELINE verdict
# ---------------------------------------------------------------------------

def test_a_claim_that_does_not_beat_the_baseline_fails_it():
    """Finding: the core never produced FAILS_BASELINE, so a model that merely
    reproduced a weak metric could claim success."""
    csv = _to_csv(_table(with_feature=True))
    claim = ClaimSpec(claim_id="c1", claimed_auc=0.60)
    report = audit_csv(csv, claim)
    assert report["dimensions"]["baseline_comparison"] == "assessed"
    assert report["verdict"] == "FAILS_BASELINE"
    assert any("does not beat the best baseline" in r for r in report["reasons"])


def test_a_claim_that_beats_the_baseline_is_not_failed_by_it():
    """With a noisy feature the baseline is weak, so a strong claim survives."""
    df = _table(with_feature=True)
    rng = np.random.default_rng(3)
    df["marker"] = df["marker"] + rng.normal(0, 1.0, size=len(df))
    csv = _to_csv(df)
    claim = ClaimSpec(claim_id="c1", claimed_auc=0.99)
    report = audit_csv(csv, claim)
    assert report["dimensions"]["baseline_comparison"] == "assessed"
    assert report["evidence"]["baseline_comparison"]["best_test_auc"] < 0.99
    assert report["verdict"] != "FAILS_BASELINE"


def test_a_report_without_features_stays_incomplete():
    csv = _to_csv(_table())
    report = audit_csv(csv, ClaimSpec(claim_id="c1", claimed_auc=0.60))
    assert report["dimensions"]["baseline_comparison"] == "not_assessed"
    assert report["disposition"] == "incomplete"
    assert report["evidence"]["baseline_comparison"]["reason"] == "no feature columns supplied"
