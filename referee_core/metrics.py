"""Metrics computed from data. Every function returns a value or an explicit refusal; never NaN."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import brentq
from scipy.special import expit, logit
from scipy.stats import rankdata
from sklearn.linear_model import LogisticRegression


def refused(reason: str) -> dict:
    return {"status": "refused", "reason": reason}


def auc(y: np.ndarray, s: np.ndarray) -> float:
    """Mann-Whitney AUC with average ranks for ties."""
    y = np.asarray(y)
    n1 = int((y == 1).sum())
    n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        raise ValueError("AUC needs both classes")
    r = rankdata(s)
    return float((r[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def _groups(patients: np.ndarray) -> list[np.ndarray]:
    order = np.argsort(patients, kind="stable")
    sp = patients[order]
    cuts = np.flatnonzero(sp[1:] != sp[:-1]) + 1
    return np.split(order, cuts)


def cluster_bootstrap_auc(df: pd.DataFrame, score_col: str, n_boot: int, seed: int,
                          max_degenerate_frac: float = 0.05, ci_level: float = 0.95) -> dict:
    """Patient-level cluster bootstrap (all samples of a resampled patient move together)."""
    y = df["label"].to_numpy()
    s = df[score_col].to_numpy(dtype=float)
    if not np.isfinite(s).all():
        return refused(f"{score_col} has missing or non-finite values in evaluation rows")
    if len(set(y)) < 2:
        return refused("evaluation rows contain a single class")
    point = auc(y, s)
    groups = _groups(df["patient_id"].to_numpy())
    P = len(groups)
    rng = np.random.default_rng(seed)
    vals, degenerate = [], 0
    for _ in range(n_boot):
        pick = rng.integers(0, P, P)
        idx = np.concatenate([groups[i] for i in pick])
        yb = y[idx]
        if yb.min() == yb.max():
            degenerate += 1
            continue
        vals.append(auc(yb, s[idx]))
    if degenerate / n_boot > max_degenerate_frac:
        return refused(f"{degenerate} of {n_boot} bootstrap resamples had a single class")
    tail = 100 * (1 - ci_level) / 2
    lo, hi = np.percentile(vals, [tail, 100 - tail])
    return {"status": "ok", "estimate": point, "ci_low": float(lo), "ci_high": float(hi),
            "n_patients": P, "n_samples": len(y), "n_pos": int((y == 1).sum()),
            "n_neg": int((y == 0).sum()), "n_boot": n_boot, "seed": seed, "ci_level": ci_level,
            "degenerate_resamples": degenerate}


def calibration(y: np.ndarray, p: np.ndarray) -> dict:
    """Calibration slope (logistic recalibration), intercept-in-the-large (slope fixed at 1), Brier."""
    p = np.asarray(p, dtype=float)
    y = np.asarray(y)
    if not np.isfinite(p).all() or p.min() < 0 or p.max() > 1:
        return refused("scores are not probabilities in [0, 1]")
    if len(set(y)) < 2:
        return refused("single class")
    eps = 1e-6
    lp = logit(np.clip(p, eps, 1 - eps))
    if np.ptp(lp) < 1e-9:
        return refused("scores are constant")
    lr = LogisticRegression(C=1e6, max_iter=1000).fit(lp.reshape(-1, 1), y)
    def f(a: float) -> float:
        return float(expit(a + lp).sum() - y.sum())
    try:
        a = brentq(f, -20, 20)
    except ValueError:
        return refused("intercept-in-the-large did not converge")
    return {"status": "ok", "slope": float(lr.coef_[0, 0]), "intercept_in_the_large": float(a),
            "brier": float(np.mean((p - y) ** 2)), "n": len(y)}


def permutation_null(df: pd.DataFrame, score_col: str, n_perm: int, seed: int) -> dict:
    """Patient-level label permutation. Only defined when labels are constant within patient."""
    g = df.groupby("patient_id")["label"].nunique()
    if (g > 1).any():
        return refused("labels vary within patient; patient-level permutation is not defined")
    y = df["label"].to_numpy()
    s = df[score_col].to_numpy(dtype=float)
    obs = auc(y, s)
    groups = _groups(df["patient_id"].to_numpy())
    plabel = np.array([y[g_[0]] for g_ in groups])
    rng = np.random.default_rng(seed)
    exceed = 0
    for _ in range(n_perm):
        perm = rng.permutation(plabel)
        yp = np.empty_like(y)
        for lab, g_ in zip(perm, groups, strict=True):
            yp[g_] = lab
        if yp.min() == yp.max():
            continue
        exceed += auc(yp, s) >= obs
    return {"status": "ok", "observed_auc": obs, "p_value": float((exceed + 1) / (n_perm + 1)),
            "n_perm": n_perm}
