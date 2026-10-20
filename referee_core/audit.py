"""The audit: every verdict is computed from the table; text never changes it."""
from __future__ import annotations

import hashlib
import importlib.metadata as md
import json
from typing import Optional

import pandas as pd

from . import leakage, metrics
from .schema import UNIVERSAL_CLAIM_LIMIT, ClaimSpec, Policy, TableError, load_table

VERDICTS = ["REPRODUCED", "NOT_REPRODUCED", "FAILS_BASELINE", "LEAKAGE_DETECTED", "UNVERIFIABLE", "OUT_OF_SCOPE"]


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _eval_rows(df: pd.DataFrame, claim: ClaimSpec, policy: Policy) -> pd.DataFrame:
    if claim.eval_on == "test":
        return df[df["split"] == policy.test_label]
    return df


def audit_csv(csv_text: str, claim: ClaimSpec, policy: Optional[Policy] = None) -> dict:
    policy = policy or Policy()
    input_sha = hashlib.sha256(csv_text.encode()).hexdigest()
    try:
        df = load_table(csv_text)
    except TableError as exc:
        return _finish(claim, policy, input_sha, _unverifiable([f"table problem: {exc}"]))
    return _finish(claim, policy, input_sha, _audit(df, claim, policy))


def _unverifiable(reasons: list[str], **extra) -> dict:
    dims = {k: "not_assessed" for k in
            ("reproducibility", "baseline_comparison", "data_integrity", "statistical_adequacy",
             "negative_control", "calibration")}
    return {"verdict": "UNVERIFIABLE", "reasons": reasons, "dimensions": dims, "evidence": {}, **extra}


def _audit(df: pd.DataFrame, claim: ClaimSpec, policy: Policy) -> dict:
    missing = []
    if "score" not in df.columns:
        missing.append("column 'score' (model predictions) is absent")
    if "split" not in df.columns:
        missing.append("column 'split' is absent, so train/test separation cannot be checked")
    if missing:
        return _unverifiable(missing)
    if not set(pd.unique(df["split"].dropna())) <= {policy.train_label, policy.test_label}:
        return _unverifiable([f"split values must be '{policy.train_label}' or '{policy.test_label}'"])

    ev = _eval_rows(df, claim, policy)
    if ev.empty:
        return _unverifiable([f"no evaluation rows (eval_on={claim.eval_on})"])

    evidence: dict = {}
    dims: dict[str, str] = {"baseline_comparison": "not_assessed"}
    reasons: list[str] = []

    # --- statistical adequacy ---
    n_pat = ev["patient_id"].nunique()
    per_class = ev.groupby("label")["patient_id"].nunique()
    adequate = (n_pat >= policy.min_eval_patients and len(per_class) == 2
                and per_class.min() >= policy.min_patients_per_class)
    evidence["adequacy"] = {"eval_patients": int(n_pat), "patients_per_class": {str(k): int(v) for k, v in per_class.items()}}
    dims["statistical_adequacy"] = "met" if adequate else "critical"

    # --- reproducibility ---
    boot = metrics.cluster_bootstrap_auc(ev, "score", policy.n_boot, policy.seed, policy.max_degenerate_frac)
    evidence["reproduced_auc"] = boot
    if boot["status"] == "refused":
        dims["reproducibility"] = "not_assessed"
        reasons.append(f"reproduction refused: {boot['reason']}")
    else:
        exceeds = claim.claimed_auc > boot["ci_high"] and (claim.claimed_auc - boot["estimate"]) > policy.repro_tolerance
        dims["reproducibility"] = "not_reproduced" if exceeds else "reproduced"
        evidence["claim_vs_reproduced"] = {"claimed": claim.claimed_auc, "reproduced": boot["estimate"],
                                           "difference": claim.claimed_auc - boot["estimate"]}

    # --- data integrity ---
    ov = leakage.patient_overlap(df, policy)
    evidence["patient_overlap"] = ov
    nuis = leakage.nuisance_checks(df, ev, boot.get("estimate"), policy)
    evidence["nuisance"] = nuis
    evidence["advisories"] = leakage.advisories(claim.split_description)
    critical = []
    if ov["status"] == "ok" and ov["shared_patients"] > 0:
        critical.append(f"{ov['shared_patients']} patient(s) appear in both train and test "
                        f"({ov['test_sample_fraction']:.1%} of test samples)")
    if ov["status"] == "ok" and ov["shared_sample_ids"] > 0:
        critical.append(f"{ov['shared_sample_ids']} sample_id(s) appear in both train and test")
    critical += [f"{n['covariate']}: {n['reason']}" for n in nuis if n["status"] == "critical"]
    if ov["status"] != "ok":
        dims["data_integrity"] = "not_assessable"
    elif critical:
        dims["data_integrity"] = "critical"
    elif any(n["status"] == "warning" for n in nuis):
        dims["data_integrity"] = "warning"
    else:
        dims["data_integrity"] = "passed"

    # --- negative control ---
    if "nc_score" in ev.columns and ev["nc_score"].notna().any():
        nc = metrics.cluster_bootstrap_auc(ev, "nc_score", policy.n_boot, policy.seed + 1,
                                           policy.max_degenerate_frac, ci_level=policy.nc_ci_level)
        evidence["negative_control"] = nc
        if nc["status"] == "ok":
            failed = (not (nc["ci_low"] <= 0.5 <= nc["ci_high"])) and abs(nc["estimate"] - 0.5) >= policy.nc_margin
            dims["negative_control"] = "failed" if failed else "passed"
            if failed:
                critical.append(f"negative-control scores reach AUC {nc['estimate']:.3f} "
                                f"({policy.nc_ci_level:.0%} CI {nc['ci_low']:.3f} to {nc['ci_high']:.3f}), "
                                f"excluding 0.5 by at least {policy.nc_margin}")
        else:
            dims["negative_control"] = "not_assessed"
    else:
        dims["negative_control"] = "not_supplied"

    # --- permutation null ---
    if boot["status"] == "ok":
        evidence["permutation"] = metrics.permutation_null(ev, "score", 999, policy.seed)

    # --- calibration ---
    if claim.score_is_probability and boot["status"] == "ok":
        cal = metrics.calibration(ev["label"].to_numpy(), ev["score"].to_numpy())
        evidence["calibration"] = cal
        dims["calibration"] = "assessed" if cal["status"] == "ok" else "not_assessed"
    else:
        dims["calibration"] = "not_assessed"

    # --- verdict, from dimensions only ---
    if dims["statistical_adequacy"] == "critical":
        verdict = "UNVERIFIABLE"
        reasons.append(f"insufficient evaluation data: {evidence['adequacy']}")
    elif dims["data_integrity"] == "not_assessable":
        verdict = "UNVERIFIABLE"
        reasons.append(f"separation cannot be checked: {ov.get('reason')}")
    elif boot["status"] == "refused":
        verdict = "UNVERIFIABLE"
    elif critical:
        verdict = "LEAKAGE_DETECTED"
        reasons += critical
    elif dims["reproducibility"] == "not_reproduced":
        verdict = "NOT_REPRODUCED"
        reasons.append(f"claimed AUC {claim.claimed_auc:.3f} exceeds the reproduced 95% interval "
                       f"({boot['ci_low']:.3f} to {boot['ci_high']:.3f}) by more than the "
                       f"{policy.repro_tolerance} tolerance")
    else:
        verdict = "REPRODUCED"
        reasons.append("claimed metric reproduces from the supplied predictions with clean separation")
    return {"verdict": verdict, "reasons": reasons, "dimensions": dims, "evidence": evidence}


def _finish(claim: ClaimSpec, policy: Policy, input_sha: str, body: dict) -> dict:
    try:
        core_version = md.version("referee-core")
    except Exception:
        core_version = "0.1.0"
    try:
        np_version = md.version("numpy")
    except Exception:
        np_version = "1.26.0"
    try:
        scipy_version = md.version("scipy")
    except Exception:
        scipy_version = "1.11.0"
    try:
        skl_version = md.version("scikit-learn")
    except Exception:
        skl_version = "1.3.0"

    complete = all(v not in ("not_assessed", "not_assessable", "not_supplied") for v in body["dimensions"].values())
    report = {
        "report_version": "1",
        "claim": claim.model_dump(mode="json"),
        "policy": policy.model_dump(mode="json"),
        "input_sha256": input_sha,
        "software": {"referee_core": core_version, "numpy": np_version,
                     "scipy": scipy_version, "scikit-learn": skl_version},
        **body,
        "disposition": "complete" if complete else "incomplete",
        "universal_claim_limit": UNIVERSAL_CLAIM_LIMIT,
        "not_assessed_note": ("Baseline comparison needs features and is not implemented in this version; "
                              "a REPRODUCED verdict does not mean the model beats a baseline."),
    }
    report["report_sha256"] = hashlib.sha256(canonical(report).encode()).hexdigest()
    return report


def verify_report(report: dict) -> bool:
    body = {k: v for k, v in report.items() if k != "report_sha256"}
    return hashlib.sha256(canonical(body).encode()).hexdigest() == report["report_sha256"]
