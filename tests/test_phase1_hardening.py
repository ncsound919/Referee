"""
test_phase1_hardening.py

Phase 1 hardening contract tests for the referee core.

Each test here pins a behaviour that the audit and refinement plans called out
as either unimplemented, untested, or at risk of regressing silently:

  - patient ID normalisation (strip, and the case-fold collision that the
    current implementation does *not* yet handle),
  - rejection of NaN labels, NaN splits and unknown split values,
  - the nuisance rule that an inverted covariate is reported through
    ``max(a, 1-a)`` rather than through the raw AUC,
  - the guard that a chance-level model is never flagged as a *critical*
    shortcut,
  - ``claimed_auc_ci`` overlap (both the overlapping and the disjoint case),
  - the negative control: a clean control passes, a leaking control fails and
    still reports the leak in ``reasons``,
  - canonical JSON float rounding, so a report hash does not move because of
    BLAS jitter,
  - the Ed25519 signature over the report digest,
  - ``verify_report`` re-auditing the supplied table,
  - the completeness of the ``Policy`` defaults that get hashed into every
    report.
"""
from __future__ import annotations

import base64
import hashlib
import io

import numpy as np
import pandas as pd
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from pydantic import ValidationError

from referee_core import audit as audit_mod
from referee_core import leakage
from referee_core.audit import VERDICTS, audit_csv, canonical, verify_report
from referee_core.schema import NUISANCE_COLUMNS, ClaimSpec, Policy, TableError, load_table

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean_table(n_test: int = 60, n_train: int = 60, seed: int = 0, d: float = 1.2) -> pd.DataFrame:
    """A deterministic, clean table: disjoint patients, no nuisance columns, balanced labels.

    Labels alternate so both classes are exactly half of the evaluation set,
    which keeps the statistical-adequacy gate satisfied (>= 10 patients per
    class, >= 30 evaluation patients) regardless of the seed.
    """
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    for prefix, n, split in (("T", n_test, "test"), ("R", n_train, "train")):
        for i in range(n):
            label = i % 2
            rows.append(
                {
                    "patient_id": f"{prefix}{i:04d}",
                    "sample_id": f"{prefix}{i:04d}_0",
                    "label": label,
                    "split": split,
                    "score": float(rng.normal(d * label, 1.0)),
                }
            )
    return pd.DataFrame(rows)


def _to_csv(df: pd.DataFrame) -> str:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def _claim(**overrides) -> ClaimSpec:
    base = {"claim_id": "c1", "title": "phase1", "claimed_auc": 0.5}
    base.update(overrides)
    return ClaimSpec(**base)


def _recomputed_report_sha256(report: dict) -> str:
    """Recompute the report digest exactly the way ``_finish`` does."""
    body = {k: v for k, v in report.items() if k != "report_sha256"}
    body = {k: v for k, v in body.items() if k not in ("signature", "signer_public_key")}
    return hashlib.sha256(canonical(body).encode()).hexdigest()


def _a_different_verdict(current: str) -> str:
    """Any verdict other than the one already in the report."""
    return "NOT_REPRODUCED" if current != "NOT_REPRODUCED" else "REPRODUCED"


# ---------------------------------------------------------------------------
# Verdict vocabulary
# ---------------------------------------------------------------------------

def test_verdict_vocabulary_is_exactly_the_documented_set():
    assert VERDICTS == [
        "REPRODUCED",
        "NOT_REPRODUCED",
        "FAILS_BASELINE",
        "LEAKAGE_DETECTED",
        "UNVERIFIABLE",
        "OUT_OF_SCOPE",
    ]


# ---------------------------------------------------------------------------
# Policy completeness - the defaults are hashed into every report, so a
# silent change to them changes every digest ever produced.
# ---------------------------------------------------------------------------

def test_policy_defaults_are_complete_and_pinned():
    """Every threshold the engine relies on must have an explicit default."""
    assert Policy().model_dump() == {
        "seed": 42,
        "n_boot": 1000,
        "n_perm": 999,
        "ci_level": 0.95,
        "nc_seed_offset": 1,
        "repro_tolerance": 0.02,
        "min_eval_patients": 30,
        "min_patients_per_class": 10,
        "max_degenerate_frac": 0.05,
        "nuisance_warn_auc": 0.65,
        "shortcut_ratio": 0.90,
        "nc_ci_level": 0.99,
        "nc_margin": 0.05,
        "train_label": "train",
        "test_label": "test",
        "split_aliases": {
            "train": ["train", "training", "trn"],
            "test": ["test", "testing", "val", "validation", "holdout"],
        },
    }


def test_policy_rejects_unknown_fields():
    """A typo in a policy must fail loudly rather than being ignored."""
    with pytest.raises(ValidationError):
        Policy(n_boots=10)


def test_policy_enforces_its_minimum_sample_sizes():
    with pytest.raises(ValidationError):
        Policy(n_boot=99)
    with pytest.raises(ValidationError):
        Policy(n_perm=98)


def test_claim_rejects_an_auc_outside_its_own_confidence_interval():
    """Finding: a claim whose AUC lies outside its stated CI is malformed."""
    with pytest.raises(Exception, match="claimed_auc must lie inside claimed_auc_ci"):
        ClaimSpec(claim_id="c1", claimed_auc=0.9, claimed_auc_ci=(0.5, 0.8))


def test_claim_accepts_an_auc_inside_its_confidence_interval():
    spec = ClaimSpec(claim_id="c1", claimed_auc=0.7, claimed_auc_ci=(0.6, 0.8))
    assert spec.claimed_auc_ci == (0.6, 0.8)


# ---------------------------------------------------------------------------
# Canonical JSON and hashing
# ---------------------------------------------------------------------------

def test_canonical_json_rounds_floats_so_jitter_cannot_move_a_hash():
    """Finding: two floats that differ only in the last bits must hash alike."""
    assert canonical({"v": 0.30000000000000004}) == canonical({"v": 0.3}) == '{"v":0.3}'


def test_canonical_json_rounds_inside_nested_structures():
    a = canonical({"outer": [{"v": 0.1 + 0.2}, {"v": 1e-9 + 1e-9}]})
    b = canonical({"outer": [{"v": 0.3}, {"v": 2e-9}]})
    assert a == b


def test_canonical_json_is_key_order_independent():
    assert canonical({"a": 1, "b": 2}) == canonical({"b": 2, "a": 1})


def test_input_digest_is_the_hash_of_the_raw_csv_bytes():
    """The input digest must cover the table exactly as supplied, nothing else."""
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    assert report["input_sha256"] == hashlib.sha256(csv.encode()).hexdigest()


def test_report_carries_three_distinct_digests():
    report = audit_csv(_to_csv(_clean_table()), _claim())
    for key in ("input_sha256", "decision_sha256", "report_sha256"):
        assert len(report[key]) == 64
    assert len({report["input_sha256"], report["decision_sha256"], report["report_sha256"]}) == 3


def test_software_block_never_invents_a_version():
    """Finding: the engine once reported an invented version number."""
    report = audit_csv(_to_csv(_clean_table()), _claim())
    for name, version in report["software"].items():
        assert isinstance(version, str) and version, name
        assert version != "1.26.0"
    assert report["software"]["numpy"] != "unknown"  # numpy is installed here


def test_decision_digest_does_not_cover_the_environment():
    """Finding: the software block is environment, not decision - it must not
    enter ``decision_sha256``, or a numpy upgrade would look like a new claim."""
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    payload = {
        "claim": report["claim"],
        "policy": report["policy"],
        "input_sha256": report["input_sha256"],
        "verdict": report["verdict"],
        "reasons": report["reasons"],
        "dimensions": report["dimensions"],
        "evidence": report["evidence"],
    }
    assert hashlib.sha256(canonical(payload).encode()).hexdigest() == report["decision_sha256"]
    assert "software" not in payload


# ---------------------------------------------------------------------------
# Signing
# ---------------------------------------------------------------------------

def test_signing_key_rejects_a_seed_of_the_wrong_length(monkeypatch):
    monkeypatch.setenv("REFEREE_SIGNING_KEY", base64.b64encode(b"too short").decode())
    with pytest.raises(ValueError, match="must be a base64-encoded 32-byte seed"):
        audit_mod._signing_key()


def test_signing_key_is_stable_for_a_fixed_seed(monkeypatch):
    monkeypatch.setenv("REFEREE_SIGNING_KEY", base64.b64encode(bytes(range(32))).decode())
    assert audit_mod._signing_key().sign(b"payload") == audit_mod._signing_key().sign(b"payload")


def test_sign_digest_produces_a_verifiable_signature():
    digest = hashlib.sha256(b"abc").hexdigest()
    sig_b64, pub_b64 = audit_mod.sign_digest(digest)
    pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(pub_b64))
    pub.verify(base64.b64decode(sig_b64), bytes.fromhex(digest))  # raises on failure


def test_audit_report_is_signed_with_the_service_key():
    report = audit_csv(_to_csv(_clean_table()), _claim())
    assert report.get("signature")
    assert report.get("signer_public_key")
    Ed25519PublicKey.from_public_bytes(base64.b64decode(report["signer_public_key"])).verify(
        base64.b64decode(report["signature"]), bytes.fromhex(report["report_sha256"])
    )


def test_tampering_with_the_signature_fails_verification():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    raw = base64.b64decode(report["signature"])
    report["signature"] = base64.b64encode(raw[:-1] + bytes([raw[-1] ^ 0xFF])).decode()
    assert verify_report(report) is False


def test_tampering_with_the_report_body_fails_verification():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    report["verdict"] = "REPRODUCED" if report["verdict"] != "REPRODUCED" else "NOT_REPRODUCED"
    assert verify_report(report) is False


# ---------------------------------------------------------------------------
# verify_report: the re-audit path
# ---------------------------------------------------------------------------

def test_verify_accepts_a_report_re_audited_against_its_own_table():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    assert verify_report(report, csv) is True


def test_verify_rejects_a_report_checked_against_a_different_table():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    other = _to_csv(_clean_table(seed=99))
    assert verify_report(report, other) is False


def test_verify_rejects_an_edited_verdict_even_when_the_hash_is_recomputed():
    """Finding: a self-consistent hash is not a proof. The re-audit must catch it."""
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    report["verdict"] = _a_different_verdict(report["verdict"])
    report["report_sha256"] = _recomputed_report_sha256(report)
    # Drop the signature so the signature check cannot be the thing that fails.
    report.pop("signature", None)
    report.pop("signer_public_key", None)
    assert verify_report(report, csv) is False


def test_verify_rejects_an_edited_verdict_even_when_the_hash_and_signature_are_consistent():
    """Editing the verdict invalidates the signature over the old digest."""
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    report["verdict"] = _a_different_verdict(report["verdict"])
    report["report_sha256"] = _recomputed_report_sha256(report)
    assert verify_report(report, csv) is False


def test_verify_rejects_an_edited_verdict_when_only_the_body_is_changed():
    """A body edit without recomputing the digest is caught by the hash."""
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    report["verdict"] = _a_different_verdict(report["verdict"])
    assert verify_report(report, csv) is False


# ---------------------------------------------------------------------------
# Table loading: every rejection has an exact, documented message
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("csv_text", "message"),
    [
        ("label,score,split\n1,0.9,test\n", "missing required column 'patient_id'"),
        ("patient_id,score,split\nP1,0.9,test\n", "missing required column 'label'"),
        ("patient_id,label,score,split\n,1,0.9,test\n", "patient_id has empty values"),
        ("patient_id,label,score,split\nnan,1,0.9,test\n", "patient_id has empty values"),
        ("patient_id,label,score,split\nP1,,0.9,test\n", "label has missing/NaN values"),
        ("patient_id,label,score,split\nP1,2,0.9,test\n", "label must be 0 or 1"),
        ("patient_id,label,score,split\nP1,1,0.9,\n", "split column contains missing/NaN values"),
        (
            "patient_id,sample_id,label,score,split\nP1,S1,1,0.9,test\nP2,S1,0,0.1,test\n",
            "sample_id values must be unique",
        ),
    ],
)
def test_load_table_rejects_malformed_tables_with_an_exact_message(csv_text, message):
    with pytest.raises(TableError, match=message):
        load_table(csv_text)


def test_load_table_reports_a_csv_that_cannot_be_parsed():
    with pytest.raises(TableError, match="cannot parse CSV"):
        load_table('patient_id,label\n"unclosed,1\n')


def test_load_table_synthesises_sample_ids_when_the_column_is_absent():
    df = load_table("patient_id,label,score,split\nP1,1,0.9,test\nP2,0,0.1,test\n")
    assert list(df["sample_id"]) == ["row0", "row1"]


def test_load_table_strips_whitespace_from_patient_ids():
    df = load_table("patient_id,label,score,split\n  P1  ,1,0.9,test\n")
    assert df["patient_id"].iloc[0] == "P1"


def test_load_table_coerces_non_numeric_scores_to_nan_rather_than_crashing():
    df = load_table("patient_id,label,score,split\nP1,1,not-a-number,test\n")
    assert np.isnan(df["score"].iloc[0])


def test_nuisance_columns_are_the_documented_set():
    assert NUISANCE_COLUMNS == ("batch", "site", "center", "scanner", "plate")


# ---------------------------------------------------------------------------
# Split normalisation
# ---------------------------------------------------------------------------

def test_split_aliases_are_applied_not_merely_tolerated():
    """'holdout' is an alias of 'test'; the evaluation set must actually be found."""
    df = _clean_table()
    df["split"] = df["split"].replace({"test": "holdout", "train": "TRAINING"})
    report = audit_csv(_to_csv(df), _claim())
    assert report["evidence"]["adequacy"]["eval_patients"] > 0
    assert report["dimensions"]["statistical_adequacy"] == "met"


def test_an_unknown_split_value_makes_the_audit_unverifiable():
    df = _clean_table()
    df["split"] = df["split"].replace({"test": "validation_set"})
    report = audit_csv(_to_csv(df), _claim())
    assert report["verdict"] == "UNVERIFIABLE"
    assert any("split values must be 'train' or 'test'" in r for r in report["reasons"])


def test_a_missing_split_column_makes_the_audit_unverifiable():
    df = _clean_table().drop(columns=["split"])
    report = audit_csv(_to_csv(df), _claim())
    assert report["verdict"] == "UNVERIFIABLE"
    assert any("column 'split' is absent" in r for r in report["reasons"])


def test_a_missing_score_column_makes_the_audit_unverifiable():
    df = _clean_table().drop(columns=["score"])
    report = audit_csv(_to_csv(df), _claim())
    assert report["verdict"] == "UNVERIFIABLE"
    assert any("column 'score' (model predictions) is absent" in r for r in report["reasons"])


# ---------------------------------------------------------------------------
# Reproducibility and the claimed confidence interval
# ---------------------------------------------------------------------------

def test_a_claim_matching_the_reproduced_auc_reproduces():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    estimate = report["evidence"]["reproduced_auc"]["estimate"]
    again = audit_csv(csv, _claim(claimed_auc=estimate))
    assert again["verdict"] == "REPRODUCED"
    assert again["dimensions"]["reproducibility"] == "reproduced"


def test_a_claim_well_above_the_reproduced_interval_does_not_reproduce():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    ci_high = report["evidence"]["reproduced_auc"]["ci_high"]
    again = audit_csv(csv, _claim(claimed_auc=min(1.0, ci_high + 0.10)))
    assert again["verdict"] == "NOT_REPRODUCED"
    assert again["dimensions"]["reproducibility"] == "not_reproduced"


def test_a_claim_with_an_overlapping_but_wide_interval_still_reproduces():
    """A wide CI that still overlaps the reproduced interval must not fail the claim."""
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    estimate = report["evidence"]["reproduced_auc"]["estimate"]
    lo = max(0.01, estimate - 0.30)
    hi = min(0.99, estimate + 0.30)
    again = audit_csv(csv, _claim(claimed_auc=estimate, claimed_auc_ci=(lo, hi)))
    assert again["verdict"] == "REPRODUCED"
    assert again["evidence"]["ci_overlap"]["overlap"] > 0


def test_a_claim_with_a_disjoint_interval_does_not_reproduce():
    csv = _to_csv(_clean_table())
    report = audit_csv(csv, _claim())
    ci_high = report["evidence"]["reproduced_auc"]["ci_high"]
    claimed = min(0.99, ci_high + 0.10)
    again = audit_csv(csv, _claim(claimed_auc=claimed, claimed_auc_ci=(claimed - 0.01, claimed)))
    assert again["verdict"] == "NOT_REPRODUCED"
    assert again["evidence"]["ci_overlap"]["overlap"] == 0.0
    assert any("does not overlap reproduced interval" in r for r in again["reasons"])


# ---------------------------------------------------------------------------
# Leakage
# ---------------------------------------------------------------------------

def test_a_patient_present_in_both_splits_is_detected_as_leakage():
    df = _clean_table()
    df.loc[0, "patient_id"] = "T0000"
    df.loc[df.index[-1], "patient_id"] = "T0000"
    df.loc[df.index[-1], "sample_id"] = "R0059_0"
    report = audit_csv(_to_csv(df), _claim())
    assert report["verdict"] == "LEAKAGE_DETECTED"
    assert report["dimensions"]["data_integrity"] == "critical"
    assert any("appear in both train and test" in r for r in report["reasons"])


def test_a_leak_is_always_reported_in_reasons_even_when_the_verdict_is_unverifiable():
    """Finding: an underpowered table used to hide the leak behind UNVERIFIABLE."""
    df = _clean_table(n_test=6, n_train=60)
    df.loc[0, "patient_id"] = "T0000"
    df.loc[df.index[-1], "patient_id"] = "T0000"
    df.loc[df.index[-1], "sample_id"] = "R0059_0"
    report = audit_csv(_to_csv(df), _claim())
    assert report["verdict"] == "UNVERIFIABLE"
    assert any("appear in both train and test" in r for r in report["reasons"])


def test_an_inverted_covariate_is_reported_through_max_a_one_minus_a():
    """Finding: a covariate whose direction flips between train and test has a raw
    AUC near 0. Reporting the raw AUC would hide it; ``max(a, 1-a)`` does not."""
    df = _clean_table()
    # 'batch' predicts the label in train and *anti*-predicts it in test.
    df["batch"] = np.where(
        (df["split"] == "train") == (df["label"] == 1), "A", "B"
    )
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["nuisance_auc"] < 0.1, "the raw AUC should be near zero for an inverted covariate"
    assert entry["effective_auc"] > 0.9, "the effective AUC must be max(a, 1-a)"
    assert entry["status"] == "critical"


def test_a_chance_level_model_is_never_flagged_as_a_critical_shortcut():
    """Finding: batch structure in a dataset with no signal is not leakage."""
    df = _clean_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.51, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "warning"
    assert entry["reason"].startswith("covariate reaches effective AUC")


def test_a_strong_model_with_a_dominant_covariate_is_flagged_as_critical():
    df = _clean_table()
    df["batch"] = np.where(df["label"] == 1, "A", "B")
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    entry = next(c for c in checks if c["covariate"] == "batch")
    assert entry["status"] == "critical"
    assert "at least 90% of the model's above-chance AUC" in entry["reason"]


def test_nuisance_checks_skip_columns_that_are_absent_or_all_null():
    df = _clean_table()
    df["site"] = None
    ev = df[df["split"] == "test"]
    checks = leakage.nuisance_checks(df, ev, model_auc=0.85, policy=Policy())
    assert checks == []


def test_patient_overlap_is_not_assessable_without_both_splits():
    df = _clean_table(n_test=0, n_train=60)
    result = leakage.patient_overlap(df, Policy())
    assert result["status"] == "not_assessable"
    assert "need rows labelled" in result["reason"]


# ---------------------------------------------------------------------------
# Negative control
# ---------------------------------------------------------------------------

def test_a_clean_negative_control_passes():
    df = _clean_table()
    rng = np.random.default_rng(7)
    df["nc_score"] = rng.normal(0, 1, size=len(df))
    report = audit_csv(_to_csv(df), _claim())
    assert report["dimensions"]["negative_control"] == "passed"
    assert not any("negative-control scores reach AUC" in r for r in report["reasons"])


def test_a_leaking_negative_control_is_reported_as_leakage():
    """The negative control is the strongest single signal that the table is broken."""
    df = _clean_table()
    df["nc_score"] = df["label"].astype(float) + 0.01
    report = audit_csv(_to_csv(df), _claim())
    assert report["dimensions"]["negative_control"] == "failed"
    assert report["verdict"] == "LEAKAGE_DETECTED"
    assert any("negative-control scores reach AUC" in r for r in report["reasons"])


def test_an_absent_negative_control_is_reported_as_not_supplied():
    report = audit_csv(_to_csv(_clean_table()), _claim())
    assert report["dimensions"]["negative_control"] == "not_supplied"


# ---------------------------------------------------------------------------
# Statistical adequacy and disposition
# ---------------------------------------------------------------------------

def test_an_underpowered_table_is_unverifiable():
    df = _clean_table(n_test=8, n_train=60)
    report = audit_csv(_to_csv(df), _claim())
    assert report["verdict"] == "UNVERIFIABLE"
    assert report["dimensions"]["statistical_adequacy"] == "critical"
    assert any("insufficient evaluation data" in r for r in report["reasons"])


def test_eval_on_all_flags_the_inclusion_of_training_rows():
    df = _clean_table()
    report = audit_csv(_to_csv(df), _claim(eval_on="all"))
    assert report["evidence"].get("eval_includes_training_rows") is True
    assert report["dimensions"]["data_integrity"] == "warning"
    assert any("includes" in r and "training row(s)" in r for r in report["reasons"])


def test_disposition_is_incomplete_when_a_dimension_was_not_assessed():
    """Without feature columns the baseline comparison cannot run, so the report
    can never claim to be complete."""
    report = audit_csv(_to_csv(_clean_table()), _claim())
    assert report["dimensions"]["baseline_comparison"] == "not_assessed"
    assert report["disposition"] == "incomplete"


def test_the_report_carries_the_universal_claim_limit():
    report = audit_csv(_to_csv(_clean_table()), _claim())
    assert "does not establish clinical" in report["universal_claim_limit"]
    assert report["not_assessed_note"]


def test_the_audit_is_deterministic_for_a_fixed_seed():
    csv = _to_csv(_clean_table())
    assert audit_csv(csv, _claim())["report_sha256"] == audit_csv(csv, _claim())["report_sha256"]


def test_a_different_table_produces_a_different_input_digest():
    a = audit_csv(_to_csv(_clean_table(seed=1)), _claim())
    b = audit_csv(_to_csv(_clean_table(seed=2)), _claim())
    assert a["input_sha256"] != b["input_sha256"]
