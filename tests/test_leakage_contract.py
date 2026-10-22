"""
test_leakage_contract.py

Leakage detection is the referee at its sharpest: the question is not "is the
number right" but "was the number allowed to be computed".

These tests pin:
  - the patient-overlap measurement and its two not-assessable states,
  - the nuisance rule, including the ``max(a, 1-a)`` inversion guard and the
    chance-model guard,
  - the advisory patterns, which read the author's prose but never change a
    verdict.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from referee_core import leakage
from referee_core.schema import Policy


def _split_table(seed: int = 0) -> pd.DataFrame:
    """A table with disjoint train/test patients and a nuisance column."""
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for prefix, n, split in (("T", 40, "test"), ("R", 40, "train")):
        for i in range(n):
            label = i % 2
            rows.append(
                {
                    "patient_id": f"{prefix}{i:04d}",
                    "sample_id": f"{prefix}{i:04d}_0",
                    "label": label,
                    "split": split,
                    "score": float(rng.normal(1.2 * label, 1.0)),
                }
            )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Patient overlap
# ---------------------------------------------------------------------------

def test_disjoint_splits_measure_no_overlap():
    df = _split_table()
    result = leakage.patient_overlap(df, Policy())
    assert result["status"] == "ok"
    assert result["shared_patients"] == 0
    assert result["shared_sample_ids"] == 0
    assert result["train_patients"] == 40
    assert result["test_patients"] == 40
    assert result["test_patient_fraction"] == 0.0
    assert result["test_sample_fraction"] == 0.0


def test_a_shared_patient_is_measured_and_its_sample_fraction_reported():
    df = _split_table()
    df.loc[df.index[-1], "patient_id"] = "T0000"
    df.loc[df.index[-1], "sample_id"] = "R0039_0"
    result = leakage.patient_overlap(df, Policy())
    assert result["shared_patients"] == 1
    assert result["test_patient_fraction"] == pytest.approx(1 / 40)
    assert result["test_sample_fraction"] == pytest.approx(1 / 40)


def test_whitespace_variants_of_an_id_count_as_the_same_patient():
    """Finding: ' P12 ' and 'P12' must be the same patient."""
    df = _split_table()
    df.loc[df.index[-1], "patient_id"] = "  T0000  "
    df.loc[df.index[-1], "sample_id"] = "R0039_0"
    result = leakage.patient_overlap(df, Policy())
    assert result["shared_patients"] == 1


def test_overlap_is_not_assessable_without_a_train_row():
    df = _split_table()
    df = df[df["split"] == "test"]
    result = leakage.patient_overlap(df, Policy())
    assert result["status"] == "not_assessable"
    assert "need rows labelled 'train' and 'test'" in result["reason"]


def test_overlap_is_not_assessable_without_a_test_row():
    df = _split_table()
    df = df[df["split"] == "train"]
    result = leakage.patient_overlap(df, Policy())
    assert result["status"] == "not_assessable"


# ---------------------------------------------------------------------------
# The covariate AUC, and the states in which it cannot be computed
# ---------------------------------------------------------------------------

def test_a_covariate_fitted_on_train_rows_names_that_method():
    df = _split_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    train = df[df["split"] == "train"]
    value, method = leakage._covariate_auc(ev, train, "batch")
    assert method == "fit on train rows, scored on evaluation rows"
    assert value == pytest.approx(1.0)


def test_a_covariate_without_a_train_set_uses_grouped_cross_validation():
    df = _split_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    value, method = leakage._covariate_auc(ev, None, "batch")
    assert method == "grouped cross-validation on evaluation rows (no labelled train rows)"
    assert 0.0 <= value <= 1.0


def test_a_covariate_with_too_few_patients_cannot_be_scored():
    df = _split_table()
    df["batch"] = "A"
    ev = df[df["split"] == "test"].head(2)
    ev = ev.assign(patient_id=["P1", "P1"])
    with pytest.raises(ValueError, match="too few patients"):
        leakage._covariate_auc(ev, None, "batch")


def test_a_covariate_whose_training_fold_has_one_class_cannot_be_scored():
    df = _split_table()
    df["batch"] = "A"
    ev = pd.DataFrame(
        {
            "patient_id": ["P1", "P1", "P2", "P2"],
            "label": [0, 0, 1, 1],
            "batch": ["A", "A", "A", "A"],
        }
    )
    with pytest.raises(ValueError, match="a training fold has a single class"):
        leakage._covariate_auc(ev, None, "batch")


# ---------------------------------------------------------------------------
# Nuisance checks
# ---------------------------------------------------------------------------

def test_a_nuisance_that_cannot_be_scored_is_reported_as_not_assessable():
    """No usable train rows and too few patients to cross-validate over."""
    df = _split_table()
    df = df.drop(columns=["split"])
    df["batch"] = "A"
    ev = df.head(2).assign(patient_id=["P1", "P1"])
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "not_assessable"
    assert entry["reason"] == "too few patients"
    assert entry["n_levels"] == 1


def test_a_nuisance_is_not_assessable_when_the_train_rows_carry_one_class():
    """A train split with a single class cannot fit a covariate model, so the
    check falls back to cross-validation - which then also fails."""
    df = _split_table()
    df.loc[df["split"] == "train", "label"] = 0
    df["batch"] = "A"
    ev = pd.DataFrame(
        {
            "patient_id": ["P1", "P1", "P2", "P2"],
            "label": [0, 0, 1, 1],
            "split": ["test"] * 4,
            "batch": ["A"] * 4,
        }
    )
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "not_assessable"
    assert entry["reason"] == "a training fold has a single class"


def test_a_perfect_nuisance_beside_a_strong_model_is_critical():
    df = _split_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "critical"
    assert entry["nuisance_auc"] == pytest.approx(1.0)
    assert entry["effective_auc"] == pytest.approx(1.0)


def test_a_perfect_nuisance_beside_a_chance_model_is_only_a_warning():
    df = _split_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.52, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "warning"


def test_an_unknown_model_auc_cannot_flag_a_nuisance_as_critical():
    df = _split_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=None, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "warning"


def test_a_useless_nuisance_is_reported_as_ok():
    """A covariate that is exactly independent of the label measures an AUC of 0.5."""
    df = _split_table()
    # label is j % 2 for patient index j; this batch assignment is independent of it.
    j = df["patient_id"].str.lstrip("TR").astype(int)
    df["batch"] = np.where((j // 2) % 2 == 0, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "ok"
    assert "reason" not in entry


def test_every_nuisance_column_is_considered():
    df = _split_table()
    for col in ("batch", "site", "center", "scanner", "plate"):
        df[col] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    assert {c["covariate"] for c in checks} == {"batch", "site", "center", "scanner", "plate"}


# ---------------------------------------------------------------------------
# Advisories: prose never changes a verdict, it only produces a note
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("text", "needle"),
    [
        ("We used a random split", "random split"),
        ("Split at the slide-level", "sample-level splitting"),
        ("Split at the tile level", "sample-level splitting"),
        ("Split at the patch-level", "sample-level splitting"),
        ("Split at the scan-level", "sample-level splitting"),
        ("Patient-level split", "patient-level separation"),
        ("Patient stratified split", "patient-level separation"),
        ("patient held out", "patient-level separation"),
    ],
)
def test_advisories_flag_the_documented_phrasings(text, needle):
    advisories = leakage.advisories(text)
    assert advisories
    assert any(needle in a for a in advisories)


def test_advisories_are_case_insensitive():
    assert leakage.advisories("A RANDOM split") == leakage.advisories("a random split")


def test_a_clean_description_produces_no_advisory():
    assert leakage.advisories("Held-out validation set, stratified by site.") == []


def test_no_description_produces_no_advisory():
    assert leakage.advisories(None) == []
    assert leakage.advisories("") == []


def test_a_description_that_breaks_several_rules_produces_several_advisories():
    advisories = leakage.advisories("A random slide-level split, claimed as patient-level")
    assert len(advisories) == 3
