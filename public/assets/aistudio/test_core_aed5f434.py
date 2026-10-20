import io
import json

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from scipy.stats import norm
from sklearn.metrics import brier_score_loss, roc_auc_score

from referee_core import faults, leakage, metrics
from referee_core.api import app
from referee_core.audit import audit_csv, verify_report
from referee_core.schema import ClaimSpec, Policy, TableError, load_table


def table(n_pat=200, d=1.2, seed=0, reps=1, leak=False):
    rng = np.random.default_rng(seed)
    rows = []
    y = (rng.random(n_pat) < 0.4).astype(int)
    test = rng.random(n_pat) < 0.4
    for p in range(n_pat):
        for r in range(reps):
            split = ("test" if (rng.random() < 0.4) else "train") if leak else ("test" if test[p] else "train")
            rows.append(dict(patient_id=f"P{p}", sample_id=f"P{p}_{r}", label=int(y[p]), split=split,
                             score=rng.normal(d * y[p], 1)))
    return pd.DataFrame(rows)


# ---------- metrics against reference implementations ----------

def test_auc_matches_sklearn_including_ties():
    rng = np.random.default_rng(1)
    for _ in range(20):
        y = rng.integers(0, 2, 300)
        s = np.round(rng.normal(y * 0.7, 1), 1)          # rounding creates many ties
        assert metrics.auc(y, s) == pytest.approx(roc_auc_score(y, s), abs=1e-12)


def test_bootstrap_ci_coverage_against_analytic_binormal_auc():
    """True AUC of N(d,1) vs N(0,1) is Phi(d/sqrt 2). A 95% CI should cover it about 95% of the time."""
    d, rng = 1.0, np.random.default_rng(3)
    truth = norm.cdf(d / np.sqrt(2))
    cover, reps = 0, 200
    for k in range(reps):
        y = (rng.random(150) < 0.5).astype(int)
        df = pd.DataFrame({"patient_id": [f"p{i}" for i in range(150)], "label": y,
                           "score": rng.normal(d * y, 1)})
        r = metrics.cluster_bootstrap_auc(df, "score", 300, seed=k)
        cover += r["ci_low"] <= truth <= r["ci_high"]
    assert 0.90 <= cover / reps <= 0.99


def test_cluster_bootstrap_is_wider_than_naive_when_samples_cluster():
    rng = np.random.default_rng(5)
    n_pat, reps = 60, 8
    y_p = (rng.random(n_pat) < 0.5).astype(int)
    eff = rng.normal(0, 1, n_pat)
    rows = [dict(patient_id=f"p{p}", label=int(y_p[p]), score=eff[p] + 0.8 * y_p[p] + rng.normal(0, 0.3))
            for p in range(n_pat) for _ in range(reps)]
    df = pd.DataFrame(rows)
    clustered = metrics.cluster_bootstrap_auc(df, "score", 400, 1)
    naive_df = df.assign(patient_id=[f"s{i}" for i in range(len(df))])
    naive = metrics.cluster_bootstrap_auc(naive_df, "score", 400, 1)
    assert (clustered["ci_high"] - clustered["ci_low"]) > 1.5 * (naive["ci_high"] - naive["ci_low"])


def test_bootstrap_is_deterministic_for_a_seed():
    df = table(100).query("split == 'test'")
    a = metrics.cluster_bootstrap_auc(df, "score", 200, 42)
    b = metrics.cluster_bootstrap_auc(df, "score", 200, 42)
    assert a == b


def test_calibration_matches_reference_and_detects_overconfidence():
    rng = np.random.default_rng(9)
    n = 4000
    p_true = rng.uniform(0.05, 0.95, n)
    y = (rng.random(n) < p_true).astype(int)
    good = metrics.calibration(y, p_true)
    assert good["slope"] == pytest.approx(1.0, abs=0.12)
    assert abs(good["intercept_in_the_large"]) < 0.12
    assert good["brier"] == pytest.approx(brier_score_loss(y, p_true), abs=1e-12)
    lp = np.log(p_true / (1 - p_true))
    overconf = 1 / (1 + np.exp(-2.5 * lp))
    assert metrics.calibration(y, overconf)["slope"] < 0.6


def test_never_nan_explicit_refusals():
    one_class = pd.DataFrame({"patient_id": ["a", "b"], "label": [1, 1], "score": [0.1, 0.2]})
    assert metrics.cluster_bootstrap_auc(one_class, "score", 100, 1)["status"] == "refused"
    nan_scores = pd.DataFrame({"patient_id": ["a", "b"], "label": [0, 1], "score": [np.nan, 0.2]})
    assert metrics.cluster_bootstrap_auc(nan_scores, "score", 100, 1)["status"] == "refused"
    assert metrics.calibration(np.array([0, 1]), np.array([5.0, -2.0]))["status"] == "refused"
    assert metrics.calibration(np.array([0, 1, 0, 1]), np.array([0.5] * 4))["status"] == "refused"


def test_permutation_null_detects_signal_and_refuses_varying_labels():
    df = table(150, d=1.5).query("split == 'test'")
    assert metrics.permutation_null(df, "score", 299, 1)["p_value"] < 0.01
    noise = df.assign(score=np.random.default_rng(1).normal(size=len(df)))
    assert metrics.permutation_null(noise, "score", 299, 1)["p_value"] > 0.05
    varying = pd.DataFrame({"patient_id": ["a", "a", "b", "b"], "label": [0, 1, 0, 1], "score": [1, 2, 3, 4.0]})
    assert metrics.permutation_null(varying, "score", 50, 1)["status"] == "refused"


# ---------- leakage ----------

def test_patient_overlap_is_exact():
    df = pd.DataFrame({"patient_id": ["a", "b", "c", "a", "d"], "sample_id": list("12345"),
                       "split": ["train", "train", "train", "test", "test"], "label": [0, 1, 0, 1, 0]})
    ov = leakage.patient_overlap(df, Policy())
    assert ov["shared_patients"] == 1 and ov["test_patient_fraction"] == 0.5
    assert ov["test_sample_fraction"] == 0.5 and ov["shared_sample_ids"] == 0


def test_nuisance_flags_a_covariate_that_predicts_the_label():
    rng = np.random.default_rng(2)
    df = table(300, d=0.0, seed=2)
    df["batch"] = np.where(df["label"] == 1, "B1", "B2")
    df.loc[rng.random(len(df)) < 0.1, "batch"] = "B1"
    te = df[df["split"] == "test"]
    res = leakage.nuisance_checks(df, te, model_auc=0.7, policy=Policy())[0]
    assert res["nuisance_auc"] > 0.8 and res["status"] == "critical"
    df["batch"] = np.where(rng.random(len(df)) < 0.5, "B1", "B2")
    te = df[df["split"] == "test"]
    assert leakage.nuisance_checks(df, te, model_auc=0.7, policy=Policy())[0]["status"] == "ok"


# ---------- verdicts from data, never from text ----------

def claim_for(df, **kw):
    te = df[df["split"] == "test"]
    return ClaimSpec(claim_id="c", claimed_auc=round(metrics.auc(te["label"].to_numpy(), te["score"].to_numpy()), 3), **kw)


def test_reproduced_report_is_incomplete_and_says_baseline_not_assessed():
    df = table(300)
    r = audit_csv(df.to_csv(index=False), claim_for(df))
    assert r["verdict"] == "REPRODUCED"
    assert r["dimensions"]["baseline_comparison"] == "not_assessed" and r["disposition"] == "incomplete"
    assert "does not mean the model beats a baseline" in r["not_assessed_note"]


def test_split_description_text_cannot_change_the_verdict():
    """Regression for the keyword-matching flaw: the same table gives the same verdict whatever the text says."""
    df = table(300, leak=True, reps=3)
    csv = df.to_csv(index=False)
    verdicts = set()
    for text in [None, "random 80/20 slide-level", "patient-level split, batch-balanced, ComBat applied"]:
        r = audit_csv(csv, claim_for(df, split_description=text))
        verdicts.add(r["verdict"])
    assert verdicts == {"LEAKAGE_DETECTED"}


def test_inflating_the_claimed_number_is_caught_from_the_data():
    df = table(300)
    honest = claim_for(df)
    inflated = ClaimSpec(claim_id="c", claimed_auc=min(honest.claimed_auc + 0.15, 1.0))
    assert audit_csv(df.to_csv(index=False), inflated)["verdict"] == "NOT_REPRODUCED"


def test_malformed_tables_are_unverifiable_not_errors():
    for bad in ["", "a,b\n1,2", "patient_id,label\n,1", "patient_id,label\na,2"]:
        r = audit_csv(bad, ClaimSpec(claim_id="c", claimed_auc=0.8))
        assert r["verdict"] == "UNVERIFIABLE" and r["reasons"]


def test_report_hash_is_deterministic_and_tamper_evident():
    df = table(150)
    a = audit_csv(df.to_csv(index=False), claim_for(df))
    b = audit_csv(df.to_csv(index=False), claim_for(df))
    assert a["report_sha256"] == b["report_sha256"] and verify_report(a)
    a["verdict"] = "NOT_REPRODUCED"
    assert not verify_report(a)
    c = audit_csv(df.to_csv(index=False), claim_for(df), Policy(seed=7))
    assert c["report_sha256"] != b["report_sha256"]


def test_calibration_is_reported_only_when_scores_are_declared_probabilities():
    df = table(300)
    df["score"] = 1 / (1 + np.exp(-(df["score"] - 0.6)))
    on = audit_csv(df.to_csv(index=False), claim_for(df, score_is_probability=True))
    off = audit_csv(df.to_csv(index=False), claim_for(df))
    assert on["evidence"]["calibration"]["status"] == "ok" and off["dimensions"]["calibration"] == "not_assessed"


# ---------- seeded-fault suite: the targets proposed in the outline ----------

def test_seeded_fault_suite_meets_the_proposed_targets():
    res = faults.run_suite(reps=30, seed=2026, n_boot=300)
    for r in res["rows"]:
        print(f"{r['scenario']:36s} {r['correct']}/{r['runs']} {r['verdicts']}")
    print("detection", res["detection_rate"], "false rejection", res["false_rejection_rate"])
    assert res["detection_rate"] >= 0.90
    assert res["false_rejection_rate"] <= 0.05


def test_negative_control_gate_does_not_fail_clean_pipelines():
    """Regression: a plain 95% interval wrongly failed about 1 in 8 pure-noise controls."""
    sc = [s for s in faults.SCENARIOS if s.name == "clean_with_null_negative_control"]
    res = faults.run_suite(reps=60, seed=99, n_boot=300, scenarios=sc)
    assert res["rows"][0]["rate"] >= 0.95


# ---------- API ----------

def test_api_audit_and_verify_roundtrip():
    client = TestClient(app)
    df = table(200)
    body = {"claim": claim_for(df).model_dump(mode="json"), "csv_text": df.to_csv(index=False)}
    r = client.post("/audit", json=body)
    assert r.status_code == 200 and r.json()["verdict"] == "REPRODUCED"
    assert client.post("/verify", json=r.json()).json() == {"valid": True}
    bad = r.json()
    bad["verdict"] = "LEAKAGE_DETECTED"
    assert client.post("/verify", json=bad).json() == {"valid": False}
    assert client.post("/audit", json={"claim": {"claim_id": "x", "claimed_auc": 1.7}, "csv_text": ""}).status_code == 422
