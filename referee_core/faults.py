"""Seeded-fault suite (M9): synthetic pipelines with known flaws and known-good controls."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import pandas as pd

from .audit import audit_csv
from .metrics import auc
from .schema import ClaimSpec, Policy


def _split_patients(rng, n_pat, frac_test=0.4):
    ids = np.arange(n_pat)
    rng.shuffle(ids)
    test = set(ids[: int(n_pat * frac_test)])
    return np.array([i in test for i in range(n_pat)])


def _base(rng, n_pat=400, reps=1, d=1.2, batch_effect=0.0, batch_label_corr=0.0):
    """Patient-level table with a genuine signal of size d (binormal), optional batch structure."""
    y_p = (rng.random(n_pat) < 0.4).astype(int)
    is_test = _split_patients(rng, n_pat)
    batch_p = np.where(rng.random(n_pat) < (0.5 + batch_label_corr * (y_p - 0.5)), "B1", "B2")
    rows = []
    for p in range(n_pat):
        for r in range(reps):
            rows.append({"patient_id": f"P{p}", "sample_id": f"P{p}_{r}", "label": int(y_p[p]),
                             "split": "test" if is_test[p] else "train", "batch": batch_p[p],
                             "score": rng.normal(d * y_p[p], 1.0)
                             + batch_effect * (batch_p[p] == "B1")})
    return pd.DataFrame(rows)


def _claim(df, name, claimed=None, **kw):
    te = df[df["split"] == "test"]
    est = auc(te["label"].to_numpy(), te["score"].to_numpy())
    return ClaimSpec(claim_id=name, claimed_auc=round(min(claimed if claimed is not None else est, 1.0), 3), **kw)


def _csv(df):
    return df.to_csv(index=False)


@dataclass
class Scenario:
    name: str
    expected: str
    build: Callable[[np.random.Generator], tuple[str, ClaimSpec]]
    seeded_fault: bool


def _clean(rng):
    df = _base(rng, n_pat=int(rng.integers(250, 500)), d=float(rng.uniform(0.8, 1.5)))
    return _csv(df), _claim(df, "clean")


def _clean_nc(rng):
    df = _base(rng, n_pat=int(rng.integers(250, 500)), d=float(rng.uniform(0.8, 1.5)))
    df["nc_score"] = rng.normal(0, 1, len(df))
    return _csv(df), _claim(df, "clean_nc")


def _clean_batch(rng):
    df = _base(rng, d=float(rng.uniform(0.9, 1.5)), batch_label_corr=0.0)
    return _csv(df), _claim(df, "clean_batch")


def _clean_repeats(rng):
    """Repeated samples per patient, split by patient: must not be flagged."""
    df = _base(rng, n_pat=int(rng.integers(200, 350)), reps=3, d=float(rng.uniform(0.9, 1.5)))
    return _csv(df), _claim(df, "clean_repeats")


def _patient_leak(rng):
    n_pat = 300
    y_p = (rng.random(n_pat) < 0.4).astype(int)
    effect = rng.normal(0, 1.2, n_pat)           # patient-specific signature a model can memorise
    rows = []
    for p in range(n_pat):
        for r in range(4):
            split = "test" if rng.random() < 0.4 else "train"   # sample-level random split
            rows.append({"patient_id": f"P{p}", "sample_id": f"P{p}_{r}", "label": int(y_p[p]), "split": split,
                             "score": effect[p] * (2 * y_p[p] - 1) + rng.normal(0, 0.6)})
    df = pd.DataFrame(rows)
    return _csv(df), _claim(df, "patient_leak")


def _batch_shortcut(rng):
    n_pat = 400
    df = _base(rng, n_pat=n_pat, d=0.0, batch_effect=2.0, batch_label_corr=0.9)
    return _csv(df), _claim(df, "batch_shortcut")


def _inflated(delta):
    def build(rng):
        df = _base(rng, n_pat=int(rng.integers(250, 500)), d=float(rng.uniform(0.8, 1.3)))
        te = df[df["split"] == "test"]
        est = auc(te["label"].to_numpy(), te["score"].to_numpy())
        return _csv(df), _claim(df, f"inflated_{delta}", claimed=est + delta)
    return build


def _no_signal(rng):
    df = _base(rng, d=0.0)
    return _csv(df), _claim(df, "no_signal", claimed=0.75)


def _missing_split(rng):
    df = _base(rng).drop(columns=["split"])
    return _csv(df), ClaimSpec(claim_id="missing_split", claimed_auc=0.8)


def _missing_score(rng):
    df = _base(rng).drop(columns=["score"])
    return _csv(df), ClaimSpec(claim_id="missing_score", claimed_auc=0.8)


def _nc_fail(rng):
    df = _base(rng, d=1.2)
    df["nc_score"] = rng.normal(0.8 * df["label"].to_numpy(), 1.0)
    return _csv(df), _claim(df, "nc_fail")


def _too_small(rng):
    df = _base(rng, n_pat=40, d=1.2)
    return _csv(df), _claim(df, "too_small")


SCENARIOS = [
    Scenario("clean", "REPRODUCED", _clean, False),
    Scenario("clean_with_null_negative_control", "REPRODUCED", _clean_nc, False),
    Scenario("clean_with_uninformative_batch", "REPRODUCED", _clean_batch, False),
    Scenario("clean_repeated_measures", "REPRODUCED", _clean_repeats, False),
    Scenario("patient_leakage", "LEAKAGE_DETECTED", _patient_leak, True),
    Scenario("batch_shortcut", "LEAKAGE_DETECTED", _batch_shortcut, True),
    Scenario("negative_control_fails", "LEAKAGE_DETECTED", _nc_fail, True),
    Scenario("inflated_claim_+0.12", "NOT_REPRODUCED", _inflated(0.12), True),
    Scenario("no_signal_overclaim", "NOT_REPRODUCED", _no_signal, True),
    Scenario("missing_split_column", "UNVERIFIABLE", _missing_split, True),
    Scenario("missing_score_column", "UNVERIFIABLE", _missing_score, True),
    Scenario("too_few_patients", "UNVERIFIABLE", _too_small, True),
]


def run_suite(reps: int = 30, seed: int = 2026, n_boot: int = 300, scenarios=None) -> dict:
    scenarios = scenarios or SCENARIOS
    rng = np.random.default_rng(seed)
    policy = Policy(n_boot=n_boot)
    rows = []
    for sc in scenarios:
        hits = 0
        got = {}
        for _ in range(reps):
            csv_text, claim = sc.build(rng)
            v = audit_csv(csv_text, claim, policy)["verdict"]
            got[v] = got.get(v, 0) + 1
            hits += v == sc.expected
        rows.append({"scenario": sc.name, "seeded_fault": sc.seeded_fault, "expected": sc.expected,
                     "correct": hits, "runs": reps, "rate": hits / reps, "verdicts": got})
    faults = [r for r in rows if r["seeded_fault"]]
    good = [r for r in rows if not r["seeded_fault"]]
    def rate(group):
        return sum(r["correct"] for r in group) / sum(r["runs"] for r in group) if group else None
    return {"rows": rows, "detection_rate": rate(faults),
            "false_rejection_rate": (1 - rate(good)) if good else None}


def sensitivity_to_inflation(deltas=(0.02, 0.04, 0.06, 0.08, 0.10, 0.15), reps=30, seed=7, n_boot=300) -> list[dict]:
    out = []
    for dlt in deltas:
        sc = Scenario(f"inflated_{dlt}", "NOT_REPRODUCED", _inflated(dlt), True)
        r = run_suite(reps, seed, n_boot, [sc])["rows"][0]
        out.append({"inflation": dlt, "detection_rate": r["rate"]})
    return out


def _batch_strength(corr, effect):
    def build(rng):
        df = _base(rng, n_pat=400, d=0.0, batch_effect=effect, batch_label_corr=corr)
        return _csv(df), _claim(df, f"batch_{corr}_{effect}")
    return build


def sensitivity_to_batch_shortcut(settings=((0.2, 2.0), (0.4, 2.0), (0.6, 2.0), (0.9, 2.0)),
                                  reps=30, seed=11, n_boot=300) -> list[dict]:
    """How strong must a batch/label association be before the shortcut is flagged?"""
    out = []
    for corr, eff in settings:
        sc = Scenario(f"batch_{corr}", "LEAKAGE_DETECTED", _batch_strength(corr, eff), True)
        r = run_suite(reps, seed, n_boot, [sc])["rows"][0]
        out.append({"batch_label_association": corr, "flagged_rate": r["rate"], "verdicts": r["verdicts"]})
    return out
