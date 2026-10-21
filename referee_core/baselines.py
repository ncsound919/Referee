"""Optional baseline comparison: train simple models on train rows, score on test rows.

Only runs when the prediction table carries feature columns beyond the reserved
ones. Without features, baseline_comparison stays 'not_assessed' (as before).
"""
from __future__ import annotations

import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from .metrics import auc

RESERVED = {"patient_id", "sample_id", "label", "split", "score", "nc_score",
            "batch", "site", "center", "scanner", "plate"}


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in RESERVED]


def run_baselines(df: pd.DataFrame, train_label: str, test_label: str) -> dict:
    feats = feature_columns(df)
    if not feats:
        return {"status": "not_assessed", "reason": "no feature columns supplied"}

    tr = df[df["split"] == train_label]
    te = df[df["split"] == test_label]
    if tr.empty or te.empty:
        return {"status": "not_assessed", "reason": "need train and test rows"}

    # Coerce features to numeric where possible.
    for c in feats:
        tr[c] = pd.to_numeric(tr[c], errors="coerce")
        te[c] = pd.to_numeric(te[c], errors="coerce")
    tr = tr.dropna(subset=feats)
    te = te.dropna(subset=feats)
    if tr.empty or te.empty or tr["label"].nunique() < 2 or te["label"].nunique() < 2:
        return {"status": "not_assessed", "reason": "insufficient labelled data"}

    Xtr = tr[feats].to_numpy(dtype=float)
    ytr = tr["label"].to_numpy()
    Xte = te[feats].to_numpy(dtype=float)
    yte = te["label"].to_numpy()

    scaler = StandardScaler().fit(Xtr)
    Xtr_s = scaler.transform(Xtr)
    Xte_s = scaler.transform(Xte)

    results = []
    # Logistic regression (clinical-style linear)
    try:
        lr = LogisticRegression(max_iter=1000).fit(Xtr_s, ytr)
        s = lr.predict_proba(Xte_s)[:, 1]
        results.append({"model": "LogisticRegression", "test_auc": float(auc(yte, s))})
    except Exception as exc:  # pragma: no cover
        results.append({"model": "LogisticRegression", "status": "refused", "reason": str(exc)})

    # ElasticNet (as a classifier via logistic with elasticnet penalty)
    try:
        en = LogisticRegression(penalty="elasticnet", solver="saga", l1_ratio=0.5, max_iter=2000).fit(Xtr_s, ytr)
        s = en.predict_proba(Xte_s)[:, 1]
        results.append({"model": "ElasticNet", "test_auc": float(auc(yte, s))})
    except Exception as exc:  # pragma: no cover
        results.append({"model": "ElasticNet", "status": "refused", "reason": str(exc)})

    # Random forest
    try:
        rf = RandomForestClassifier(n_estimators=200, random_state=42).fit(Xtr, ytr)
        s = rf.predict_proba(Xte)[:, 1]
        results.append({"model": "RandomForest", "test_auc": float(auc(yte, s))})
    except Exception as exc:  # pragma: no cover
        results.append({"model": "RandomForest", "status": "refused", "reason": str(exc)})

    ok = [r for r in results if "test_auc" in r]
    if not ok:
        return {"status": "not_assessed", "reason": "all baselines refused", "models": results}
    best = max(ok, key=lambda r: r["test_auc"])
    return {
        "status": "assessed",
        "models": results,
        "best_model": best["model"],
        "best_test_auc": best["test_auc"],
    }
