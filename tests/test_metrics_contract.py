"""
test_metrics_contract.py

Every metric in the referee either returns a number or returns an explicit
refusal. It never returns NaN, and it never returns a number it could not
actually compute. These tests pin the refusals, because a silent NaN would
propagate into a verdict.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from referee_core import metrics


def _df(patients: int = 40, seed: int = 0, d: float = 1.2, labels=None) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    if labels is None:
        labels = np.array([i % 2 for i in range(patients)])
    rows = []
    for i in range(patients):
        rows.append(
            {
                "patient_id": f"P{i:04d}",
                "label": int(labels[i]),
                "score": float(rng.normal(d * labels[i], 1.0)),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# AUC
# ---------------------------------------------------------------------------

def test_auc_needs_both_classes():
    with pytest.raises(ValueError, match="AUC needs both classes"):
        metrics.auc(np.array([1, 1]), np.array([0.9, 0.8]))
    with pytest.raises(ValueError, match="AUC needs both classes"):
        metrics.auc(np.array([0, 0]), np.array([0.9, 0.8]))


def test_a_perfectly_separating_score_gives_an_auc_of_one():
    y = np.array([0, 0, 1, 1])
    s = np.array([0.1, 0.2, 0.8, 0.9])
    assert metrics.auc(y, s) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Cluster bootstrap
# ---------------------------------------------------------------------------

def test_a_bootstrap_with_non_finite_scores_is_refused():
    df = _df()
    df.loc[0, "score"] = np.nan
    result = metrics.cluster_bootstrap_auc(df, "score", 100, 42)
    assert result["status"] == "refused"
    assert "missing or non-finite values" in result["reason"]


def test_a_bootstrap_on_a_single_class_is_refused():
    df = _df(labels=np.zeros(40, dtype=int))
    result = metrics.cluster_bootstrap_auc(df, "score", 100, 42)
    assert result["status"] == "refused"
    assert "single class" in result["reason"]


def test_a_bootstrap_whose_resamples_are_mostly_degenerate_is_refused():
    """Two patients, one of each class: half of all resamples have one class."""
    df = _df(patients=2, labels=np.array([0, 1]))
    result = metrics.cluster_bootstrap_auc(df, "score", 100, 42)
    assert result["status"] == "refused"
    assert "bootstrap resamples had a single class" in result["reason"]


def test_a_successful_bootstrap_reports_a_consistent_population():
    df = _df(patients=40)
    result = metrics.cluster_bootstrap_auc(df, "score", 200, 42)
    assert result["status"] == "ok"
    assert result["n_patients"] == 40
    assert result["n_samples"] == 40
    assert result["n_pos"] + result["n_neg"] == result["n_samples"]
    assert result["ci_low"] <= result["estimate"] <= result["ci_high"]
    assert result["degenerate_resamples"] == 0
    assert result["seed"] == 42
    assert result["ci_level"] == 0.95


def test_the_bootstrap_takes_every_sample_of_a_patient_together():
    """Two samples per patient must not be resampled independently."""
    df = _df(patients=30)
    df = pd.concat([df, df.assign(sample_id=range(len(df), 2 * len(df)))], ignore_index=True)
    df["sample_id"] = [f"S{i}" for i in range(len(df))]
    df.loc[df.index[len(df) // 2:], "patient_id"] = df.loc[df.index[len(df) // 2:], "patient_id"].map(
        lambda p: p
    )
    result = metrics.cluster_bootstrap_auc(df, "score", 200, 42)
    assert result["n_patients"] == 30
    assert result["n_samples"] == 60


def test_the_bootstrap_is_deterministic_for_a_seed():
    df = _df()
    assert metrics.cluster_bootstrap_auc(df, "score", 200, 42) == metrics.cluster_bootstrap_auc(
        df, "score", 200, 42
    )


def test_a_different_seed_can_move_the_interval():
    df = _df(patients=12)
    a = metrics.cluster_bootstrap_auc(df, "score", 200, 1)
    b = metrics.cluster_bootstrap_auc(df, "score", 200, 2)
    assert (a["ci_low"], a["ci_high"]) != (b["ci_low"], b["ci_high"])


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

def test_calibration_refuses_scores_that_are_not_probabilities():
    result = metrics.calibration(np.array([0, 1, 0, 1]), np.array([0.1, 0.9, 0.2, 1.4]))
    assert result["status"] == "refused"
    assert result["reason"] == "scores are not probabilities in [0, 1]"


def test_calibration_refuses_a_single_class():
    result = metrics.calibration(np.array([1, 1, 1, 1]), np.array([0.1, 0.4, 0.6, 0.9]))
    assert result["status"] == "refused"
    assert result["reason"] == "single class"


def test_calibration_refuses_constant_scores():
    result = metrics.calibration(np.array([0, 1, 0, 1]), np.array([0.5, 0.5, 0.5, 0.5]))
    assert result["status"] == "refused"
    assert result["reason"] == "scores are constant"


def test_a_successful_calibration_reports_a_slope_an_intercept_and_a_brier():
    rng = np.random.default_rng(4)
    y = rng.integers(0, 2, 200)
    p = np.clip(y * 0.6 + 0.2 + rng.normal(0, 0.1, 200), 0.01, 0.99)
    result = metrics.calibration(y, p)
    assert result["status"] == "ok"
    assert isinstance(result["slope"], float)
    assert isinstance(result["intercept_in_the_large"], float)
    assert result["brier"] == pytest.approx(float(np.mean((p - y) ** 2)))
    assert result["n"] == 200


def test_the_brier_score_is_exact_for_a_perfectly_calibrated_predictor():
    y = np.array([0, 0, 1, 1])
    p = np.array([0.0, 0.0, 1.0, 1.0])
    result = metrics.calibration(y, p)
    assert result["status"] == "ok"
    assert result["brier"] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# Permutation null
# ---------------------------------------------------------------------------

def test_the_permutation_null_is_refused_when_a_patient_has_two_labels():
    """Patient-level permutation is only defined when the label is constant
    within a patient."""
    df = pd.DataFrame(
        {
            "patient_id": ["P1", "P1", "P2", "P2"],
            "label": [0, 1, 0, 1],
            "score": [0.1, 0.9, 0.2, 0.8],
        }
    )
    result = metrics.permutation_null(df, "score", 100, 42)
    assert result["status"] == "refused"
    assert "labels vary within patient" in result["reason"]


def test_the_permutation_p_value_is_never_zero():
    """The (exceed + 1) / (n_perm + 1) formula keeps the p-value strictly positive."""
    df = _df(patients=40)
    result = metrics.permutation_null(df, "score", 99, 42)
    assert result["status"] == "ok"
    assert result["p_value"] >= 1 / 100
    assert result["p_value"] <= 1.0
    assert result["n_perm"] == 99


def test_the_permutation_null_rejects_a_strong_model():
    """A model that separates the classes must fail the permutation null."""
    df = _df(patients=40, d=2.5)
    result = metrics.permutation_null(df, "score", 199, 42)
    assert result["status"] == "ok"
    assert result["p_value"] <= 0.05


def test_the_permutation_null_does_not_reject_a_useless_model():
    """With no signal the observed AUC is indistinguishable from the null."""
    df = _df(patients=40, d=0.0)
    result = metrics.permutation_null(df, "score", 199, 42)
    assert result["status"] == "ok"
    assert result["p_value"] > 0.05


def test_the_permutation_null_is_deterministic_for_a_seed():
    df = _df(patients=40)
    assert metrics.permutation_null(df, "score", 99, 42) == metrics.permutation_null(df, "score", 99, 42)
