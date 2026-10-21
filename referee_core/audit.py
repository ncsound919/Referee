"""The audit: every verdict is computed from the table; text never changes it."""
from __future__ import annotations

import base64
import hashlib
import importlib.metadata as md
import json
import os

import pandas as pd
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from . import baselines, leakage, metrics
from .schema import UNIVERSAL_CLAIM_LIMIT, ClaimSpec, Policy, TableError, load_table

VERDICTS = ["REPRODUCED", "NOT_REPRODUCED", "FAILS_BASELINE", "LEAKAGE_DETECTED", "UNVERIFIABLE", "OUT_OF_SCOPE"]


def _signing_key() -> Ed25519PrivateKey:
    raw = os.environ.get("REFEREE_SIGNING_KEY")
    if raw:
        seed = base64.b64decode(raw)
        if len(seed) != 32:
            raise ValueError("REFEREE_SIGNING_KEY must be a base64-encoded 32-byte seed")
        return Ed25519PrivateKey.from_private_bytes(seed)
    # Ephemeral dev key (not stable across restarts) — production must set REFEREE_SIGNING_KEY.
    return Ed25519PrivateKey.generate()


_SIGNING_KEY = _signing_key()


def sign_digest(digest_hex: str) -> tuple[str, str]:
    sig = _SIGNING_KEY.sign(bytes.fromhex(digest_hex))
    pub = _SIGNING_KEY.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    return base64.b64encode(sig).decode(), base64.b64encode(pub).decode()


def _round_floats(obj, precision: int = 6):
    if isinstance(obj, float):
        return round(obj, precision)
    if isinstance(obj, dict):
        return {k: _round_floats(v, precision) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_round_floats(v, precision) for v in obj]
    return obj


def canonical(obj) -> str:
    """Canonical JSON with float rounding to fixed precision to prevent BLAS/compiler jitter."""
    return json.dumps(_round_floats(obj), sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False)


def _normalize_split_val(val: str, policy: Policy) -> str:
    s = str(val).strip().lower()
    for canon, aliases in policy.split_aliases.items():
        if s == canon.lower() or s in [a.lower() for a in aliases]:
            return canon
    return str(val).strip()


def _eval_rows(df: pd.DataFrame, claim: ClaimSpec, policy: Policy) -> pd.DataFrame:
    if claim.eval_on == "test":
        return df[df["split"] == policy.test_label]
    return df


def audit_csv(csv_text: str, claim: ClaimSpec, policy: Policy | None = None) -> dict:
    policy = policy or Policy()
    input_sha = hashlib.sha256(csv_text.encode()).hexdigest()
    try:
        df = load_table(csv_text)
    except TableError as exc:
        return _finish(claim, policy, input_sha, _unverifiable([f"table problem: {exc}"]))
    return _finish(claim, policy, input_sha, _audit(df, claim, policy))


def _unverifiable(reasons: list[str], **extra) -> dict:
    dims = dict.fromkeys(("reproducibility", "baseline_comparison", "data_integrity", "statistical_adequacy", "negative_control", "calibration"), "not_assessed")
    return {"verdict": "UNVERIFIABLE", "reasons": reasons, "dimensions": dims, "evidence": {}, **extra}


def _audit(df: pd.DataFrame, claim: ClaimSpec, policy: Policy) -> dict:
    missing = []
    if "score" not in df.columns:
        missing.append("column 'score' (model predictions) is absent")
    if "split" not in df.columns:
        missing.append("column 'split' is absent, so train/test separation cannot be checked")
    if missing:
        return _unverifiable(missing)

    # Normalize split values using policy aliases (case-folding and aliases)
    df["split"] = df["split"].apply(lambda s: _normalize_split_val(s, policy))
    valid_splits = {policy.train_label, policy.test_label}
    unrecognized = set(pd.unique(df["split"].dropna())) - valid_splits
    if unrecognized:
        return _unverifiable([f"split values must be '{policy.train_label}' or '{policy.test_label}', found: {sorted(unrecognized)}"])

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
    boot = metrics.cluster_bootstrap_auc(
        ev, "score", policy.n_boot, policy.seed, policy.max_degenerate_frac, ci_level=policy.ci_level
    )
    evidence["reproduced_auc"] = boot
    if boot["status"] == "refused":
        dims["reproducibility"] = "not_assessed"
        reasons.append(f"reproduction refused: {boot['reason']}")
    else:
        exceeds = claim.claimed_auc > boot["ci_high"] and (claim.claimed_auc - boot["estimate"]) > policy.repro_tolerance
        dims["reproducibility"] = "not_reproduced" if exceeds else "reproduced"
        evidence["claim_vs_reproduced"] = {"claimed": claim.claimed_auc, "reproduced": boot["estimate"],
                                           "difference": claim.claimed_auc - boot["estimate"]}

        # Utilize claimed_auc_ci consistency check if provided
        if claim.claimed_auc_ci:
            ci_lo, ci_hi = claim.claimed_auc_ci
            rep_lo, rep_hi = boot["ci_low"], boot["ci_high"]
            overlap = max(0.0, min(ci_hi, rep_hi) - max(ci_lo, rep_lo))
            evidence["ci_overlap"] = {"claimed": [ci_lo, ci_hi], "reproduced": [rep_lo, rep_hi], "overlap": overlap}
            if overlap == 0.0 and (ci_lo > rep_hi or rep_lo > ci_hi):
                dims["reproducibility"] = "not_reproduced"
                reasons.append(
                    f"claimed CI [{ci_lo:.3f}, {ci_hi:.3f}] does not overlap reproduced interval [{rep_lo:.3f}, {rep_hi:.3f}]"
                )

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

    # When eval_on='all', check if training rows are included
    if claim.eval_on == "all":
        train_rows = int((df["split"] == policy.train_label).sum())
        if train_rows > 0:
            evidence["eval_includes_training_rows"] = True
            reasons.append(f"eval_on='all' includes {train_rows} training row(s) in evaluation; cannot assert clean separation")

    if ov["status"] != "ok":
        dims["data_integrity"] = "not_assessable"
    elif critical:
        dims["data_integrity"] = "critical"
    elif (claim.eval_on == "all" and (df["split"] == policy.train_label).sum() > 0) or any(n["status"] == "warning" for n in nuis):
        dims["data_integrity"] = "warning"
    else:
        dims["data_integrity"] = "passed"

    # --- baseline comparison (only when feature columns are present) ---
    base_res = baselines.run_baselines(df, policy.train_label, policy.test_label)
    evidence["baseline_comparison"] = base_res
    if base_res.get("status") == "assessed":
        dims["baseline_comparison"] = "assessed"
    else:
        dims["baseline_comparison"] = "not_assessed"

    # --- negative control ---
    if "nc_score" in ev.columns and ev["nc_score"].notna().any():
        nc = metrics.cluster_bootstrap_auc(ev, "nc_score", policy.n_boot, policy.seed + policy.nc_seed_offset,
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
        evidence["permutation"] = metrics.permutation_null(ev, "score", policy.n_perm, policy.seed)

    # --- calibration ---
    if claim.score_is_probability and boot["status"] == "ok":
        cal = metrics.calibration(ev["label"].to_numpy(), ev["score"].to_numpy())
        evidence["calibration"] = cal
        dims["calibration"] = "assessed" if cal["status"] == "ok" else "not_assessed"
    else:
        dims["calibration"] = "not_assessed"

    # Always document critical findings in reasons, regardless of verdict
    if critical:
        for c_msg in critical:
            if c_msg not in reasons:
                reasons.append(c_msg)

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
    elif dims.get("baseline_comparison") == "assessed" and claim.claimed_auc <= evidence["baseline_comparison"].get("best_test_auc", 1.0):
        verdict = "FAILS_BASELINE"
        reasons.append(f"claimed AUC {claim.claimed_auc:.3f} does not beat the best baseline "
                       f"({evidence['baseline_comparison'].get('best_model')}, "
                       f"AUC {evidence['baseline_comparison'].get('best_test_auc'):.3f})")
    elif dims["reproducibility"] == "not_reproduced":
        verdict = "NOT_REPRODUCED"
        reasons.append(f"claimed AUC {claim.claimed_auc:.3f} exceeds the reproduced {policy.ci_level:.0%} interval "
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
        core_version = "unknown"
    try:
        np_version = md.version("numpy")
    except Exception:
        np_version = "unknown"
    try:
        scipy_version = md.version("scipy")
    except Exception:
        scipy_version = "unknown"
    try:
        skl_version = md.version("scikit-learn")
    except Exception:
        skl_version = "unknown"

    complete = all(v not in ("not_assessed", "not_assessable", "not_supplied") for v in body["dimensions"].values())

    decision_payload = {
        "claim": claim.model_dump(mode="json"),
        "policy": policy.model_dump(mode="json"),
        "input_sha256": input_sha,
        "verdict": body["verdict"],
        "reasons": body["reasons"],
        "dimensions": body["dimensions"],
        "evidence": body["evidence"],
    }
    decision_sha256 = hashlib.sha256(canonical(decision_payload).encode()).hexdigest()

    report = {
        "report_version": "1",
        "claim": claim.model_dump(mode="json"),
        "policy": policy.model_dump(mode="json"),
        "input_sha256": input_sha,
        "decision_sha256": decision_sha256,
        "software": {"referee_core": core_version, "numpy": np_version,
                     "scipy": scipy_version, "scikit-learn": skl_version},
        **body,
        "disposition": "complete" if complete else "incomplete",
        "universal_claim_limit": UNIVERSAL_CLAIM_LIMIT,
        "not_assessed_note": ("Baseline comparison needs features and is not implemented in this version; "
                              "a REPRODUCED verdict does not mean the model beats a baseline."),
    }
    report["report_sha256"] = hashlib.sha256(canonical({k: v for k, v in report.items() if k != "report_sha256"}).encode()).hexdigest()
    # Sign the report digest with the service Ed25519 key.
    try:
        sig, pub = sign_digest(report["report_sha256"])
        report["signature"] = sig
        report["signer_public_key"] = pub
    except Exception:
        report["signature"] = None
        report["signer_public_key"] = None
    return report


def verify_report(report: dict, csv_text: str | None = None) -> bool:
    body = {k: v for k, v in report.items() if k != "report_sha256"}
    # Strip signature fields from the hashed body (they are not part of the report hash).
    body = {k: v for k, v in body.items() if k not in ("signature", "signer_public_key")}
    if hashlib.sha256(canonical(body).encode()).hexdigest() != report.get("report_sha256"):
        return False
    # Verify the Ed25519 signature if present.
    sig_b64 = report.get("signature")
    pub_b64 = report.get("signer_public_key")
    if sig_b64 and pub_b64:
        try:
            from cryptography.hazmat.primitives.asymmetric.ed25519 import (
                Ed25519PublicKey,
            )
            pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(pub_b64))
            pub.verify(base64.b64decode(sig_b64), bytes.fromhex(report.get("report_sha256")))
        except Exception:
            return False
    if csv_text is not None:
        computed_input_sha = hashlib.sha256(csv_text.encode()).hexdigest()
        if computed_input_sha != report.get("input_sha256"):
            return False
        # Re-run audit to verify deterministic reproducibility
        re_audit = audit_csv(csv_text, ClaimSpec(**report["claim"]), Policy(**report["policy"]))
        if re_audit.get("verdict") != report.get("verdict"):
            return False
    return True
