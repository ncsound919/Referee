"""Leakage checks computed from the table. Split-description text yields advisories only."""
from __future__ import annotations

import re

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.preprocessing import OneHotEncoder

from .metrics import auc
from .schema import NUISANCE_COLUMNS, Policy

ADVISORY_PATTERNS = [
    (r"random", "text mentions a random split; the table is what was checked, not the text"),
    (r"slide[- ]level|tile[- ]level|patch[- ]level|scan[- ]level",
     "text suggests sample-level splitting; confirm with the patient_id overlap result"),
    (r"patient[- ](level|stratified|held)", "text claims patient-level separation; see the measured overlap"),
]


def patient_overlap(df: pd.DataFrame, policy: Policy) -> dict:
    tr = df[df["split"] == policy.train_label]
    te = df[df["split"] == policy.test_label]
    if tr.empty or te.empty:
        return {"status": "not_assessable",
                "reason": f"need rows labelled '{policy.train_label}' and '{policy.test_label}'"}

    train_pats = set(tr["patient_id"].astype(str).str.strip())
    test_pats = set(te["patient_id"].astype(str).str.strip())
    shared = train_pats & test_pats

    train_samples = set(tr["sample_id"].astype(str).str.strip())
    test_samples = set(te["sample_id"].astype(str).str.strip())
    dup_samples = train_samples & test_samples

    te_in_train = te["patient_id"].astype(str).str.strip().isin(shared)
    return {"status": "ok", "train_patients": len(train_pats),
            "test_patients": len(test_pats), "shared_patients": len(shared),
            "test_patient_fraction": len(shared) / len(test_pats),
            "test_sample_fraction": float(te_in_train.mean()),
            "shared_sample_ids": len(dup_samples)}


def _covariate_auc(df_eval: pd.DataFrame, df_train: pd.DataFrame | None, col: str) -> tuple[float, str]:
    """AUC of a model that sees only the covariate. Fit on train rows when available."""
    enc = OneHotEncoder(handle_unknown="ignore")
    if df_train is not None and df_train["label"].nunique() == 2 and df_train[col].notna().any():
        X = enc.fit_transform(df_train[[col]].astype(str))
        m = LogisticRegression(max_iter=500).fit(X, df_train["label"])
        s = m.predict_proba(enc.transform(df_eval[[col]].astype(str)))[:, 1]
        return auc(df_eval["label"].to_numpy(), s), "fit on train rows, scored on evaluation rows"
    groups = df_eval["patient_id"].to_numpy()
    n_splits = min(5, len(set(groups)))
    if n_splits < 2:
        raise ValueError("too few patients")
    oof = np.zeros(len(df_eval))
    y = df_eval["label"].to_numpy()
    X_all = enc.fit_transform(df_eval[[col]].astype(str))
    for tr_i, te_i in GroupKFold(n_splits=n_splits).split(X_all, y, groups):
        if len(set(y[tr_i])) < 2:
            raise ValueError("a training fold has a single class")
        oof[te_i] = LogisticRegression(max_iter=500).fit(X_all[tr_i], y[tr_i]).predict_proba(X_all[te_i])[:, 1]
    return auc(y, oof), "grouped cross-validation on evaluation rows (no labelled train rows)"


def nuisance_checks(df: pd.DataFrame, df_eval: pd.DataFrame, model_auc: float | None,
                    policy: Policy) -> list[dict]:
    out = []
    train = df[df["split"] == policy.train_label] if "split" in df.columns else None
    for col in NUISANCE_COLUMNS:
        if col not in df_eval.columns or df_eval[col].isna().all():
            continue
        entry = {"covariate": col, "n_levels": int(df_eval[col].nunique())}
        try:
            a, how = _covariate_auc(df_eval, train, col)
        except ValueError as exc:
            out.append({**entry, "status": "not_assessable", "reason": str(exc)})
            continue

        effective_a = max(a, 1.0 - a)
        entry.update(nuisance_auc=a, effective_auc=effective_a, method=how)
        flagged = effective_a >= policy.nuisance_warn_auc

        # Model at chance (AUC <= 0.55) must not be flagged critical simply because dataset has batch structure
        model_above_chance = model_auc is not None and (model_auc - 0.5) >= 0.05
        dominant = (
            model_above_chance and
            flagged and
            (effective_a - 0.5) >= policy.shortcut_ratio * (model_auc - 0.5)
        )
        entry["status"] = "critical" if dominant else ("warning" if flagged else "ok")
        if dominant:
            entry["reason"] = (f"covariate alone reaches effective AUC {effective_a:.3f}, at least "
                               f"{policy.shortcut_ratio:.0%} of the model's above-chance AUC ({model_auc:.3f})")
        elif flagged:
            entry["reason"] = f"covariate reaches effective AUC {effective_a:.3f} >= {policy.nuisance_warn_auc}"
        out.append(entry)
    return out


def advisories(split_description: str | None) -> list[str]:
    if not split_description:
        return []
    return [msg for pat, msg in ADVISORY_PATTERNS if re.search(pat, split_description, re.I)]
