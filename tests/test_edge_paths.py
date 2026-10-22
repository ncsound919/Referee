"""
test_edge_paths.py

The paths the main contract suites do not reach: the branches that only fire
when something is missing, refused, or degraded, and the ones that keep the
report tamper-evident when a dependency of the report is unavailable.

Every test here pins a behaviour an operator relies on:

  - a sample_id shared across splits is reported as a critical leak even when
    the patient IDs are disjoint,
  - a table with no training rows cannot claim clean separation, and says so,
  - a score the audit cannot use (non-finite) makes the audit UNVERIFIABLE
    instead of producing a verdict from the rows it could parse,
  - a negative control that cannot be computed is recorded as not assessed,
    not silently dropped,
  - the same critical finding is listed once,
  - a missing package version degrades to ``"unknown"`` rather than inventing
    a number, for every package in the software block,
  - a signing failure still emits a report whose hash verifies,
  - expired rate-limit entries are evicted rather than counted forever,
  - ``/run_experiment`` returns the artifact references of a completed run,
  - all-refused baselines are reported as not assessed instead of crashing,
  - the CLI maps an aborted command to its exit code,
  - calibration refuses explicitly when the intercept solver cannot bracket a
    root, and a degenerate permutation never counts as an exceedance.
"""
from __future__ import annotations

import hashlib
import io
import json
import time

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from referee_core import api, baselines, cli, metrics
from referee_core import audit as audit_mod
from referee_core.audit import _audit, audit_csv, verify_report
from referee_core.engine.registry import EngineAdapter
from referee_core.engine.tumortwin_adapter import TumorTwinAdapter
from referee_core.schema import ClaimSpec, Policy

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _table(n_test: int = 60, n_train: int = 60, seed: int = 0, d: float = 1.2) -> pd.DataFrame:
    """A clean table: disjoint patients, alternating labels, one sample per patient."""
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


def _csv(df: pd.DataFrame) -> str:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return buf.getvalue()


def _claim(**overrides) -> ClaimSpec:
    base = {"claim_id": "edge", "title": "edge path", "claimed_auc": 0.5}
    base.update(overrides)
    return ClaimSpec(**base)


def _policy(**overrides) -> Policy:
    base = {"n_boot": 200, "n_perm": 99}
    base.update(overrides)
    return Policy(**base)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The limiter is process-global; every test here starts and ends clean."""
    api._rate_buckets.clear()
    yield
    api._rate_buckets.clear()


# ---------------------------------------------------------------------------
# Audit: leakage that is not about patient IDs
# ---------------------------------------------------------------------------

def test_a_sample_id_shared_across_splits_is_a_critical_finding():
    """Patient IDs can be disjoint while the same acquisition is in both splits.

    ``load_table`` rejects duplicate sample_ids, so this is asserted against the
    internal audit path - the same path that builds every report.
    """
    df = _table()
    train_sample = df.loc[df["split"] == "train", "sample_id"].iloc[0]
    first_test_row = df.index[df["split"] == "test"][0]
    df.loc[first_test_row, "sample_id"] = train_sample

    report = _audit(df, _claim(), _policy())
    overlap = report["evidence"]["patient_overlap"]
    assert overlap["shared_patients"] == 0
    assert overlap["shared_sample_ids"] == 1
    assert report["dimensions"]["data_integrity"] == "critical"
    assert report["verdict"] == "LEAKAGE_DETECTED"
    assert "1 sample_id(s) appear in both train and test" in report["reasons"]


# ---------------------------------------------------------------------------
# Audit: separation that cannot be checked
# ---------------------------------------------------------------------------

def test_a_table_with_only_test_rows_cannot_have_separation_checked():
    """``eval_on='all'`` with no training rows must not report clean separation."""
    df = _table().query("split == 'test'")

    report = audit_csv(_csv(df), _claim(eval_on="all"))

    assert report["dimensions"]["data_integrity"] == "not_assessable"
    assert report["dimensions"]["statistical_adequacy"] == "met"
    assert report["evidence"]["patient_overlap"]["status"] == "not_assessable"
    assert "eval_includes_training_rows" not in report["evidence"]
    assert report["verdict"] == "UNVERIFIABLE"
    assert any("separation cannot be checked" in reason for reason in report["reasons"])


def test_a_non_finite_score_makes_the_audit_unverifiable():
    """A score the bootstrap cannot use yields no verdict, not a lenient one."""
    df = _table()
    df.loc[df.index[df["split"] == "test"][0], "score"] = np.nan

    report = audit_csv(_csv(df), _claim())

    assert report["dimensions"]["reproducibility"] == "not_assessed"
    assert report["dimensions"]["statistical_adequacy"] == "met"
    assert report["dimensions"]["data_integrity"] == "passed"
    assert report["evidence"]["reproduced_auc"]["status"] == "refused"
    assert "non-finite" in report["evidence"]["reproduced_auc"]["reason"]
    assert "permutation" not in report["evidence"]
    assert report["verdict"] == "UNVERIFIABLE"
    assert report["disposition"] == "incomplete"


# ---------------------------------------------------------------------------
# Audit: negative control and duplicate findings
# ---------------------------------------------------------------------------

def test_a_negative_control_that_cannot_be_computed_is_recorded_as_not_assessed():
    df = _table()
    df["nc_score"] = 0.5
    df.loc[df.index[df["split"] == "test"][1], "nc_score"] = np.inf

    report = audit_csv(_csv(df), _claim())

    assert report["evidence"]["negative_control"]["status"] == "refused"
    assert report["dimensions"]["negative_control"] == "not_assessed"
    assert report["verdict"] == "REPRODUCED"


def test_a_critical_finding_is_listed_once(monkeypatch):
    """Two checks reporting the same finding must not double the reasons list."""
    critical = {"covariate": "batch", "n_levels": 2, "status": "critical", "reason": "batch predicts the label"}
    monkeypatch.setattr(audit_mod.leakage, "nuisance_checks", lambda *a, **k: [dict(critical), dict(critical)])

    report = audit_csv(_csv(_table()), _claim())

    message = "batch: batch predicts the label"
    assert report["dimensions"]["data_integrity"] == "critical"
    assert report["verdict"] == "LEAKAGE_DETECTED"
    assert report["reasons"].count(message) == 1


# ---------------------------------------------------------------------------
# Report integrity when a dependency is unavailable
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("package", "key"),
    [
        ("referee-core", "referee_core"),
        ("numpy", "numpy"),
        ("scipy", "scipy"),
        ("scikit-learn", "scikit-learn"),
    ],
)
def test_a_package_without_metadata_is_reported_as_unknown(monkeypatch, package, key):
    """The software block names the real version or says it does not know."""
    real_version = audit_mod.md.version

    def version(name: str) -> str:
        if name == package:
            raise audit_mod.md.PackageNotFoundError(name)
        return real_version(name)

    monkeypatch.setattr(audit_mod.md, "version", version)

    report = audit_csv(_csv(_table()), _claim())

    assert report["software"][key] == "unknown"
    assert len(report["report_sha256"]) == 64


def test_a_signing_failure_still_emits_a_hash_verifiable_report(monkeypatch):
    """An unavailable signing key must not cost the report its digest."""

    def refuse(digest: str) -> tuple[str, str]:
        raise RuntimeError("signing key unavailable")

    monkeypatch.setattr(audit_mod, "sign_digest", refuse)

    csv_text = _csv(_table())
    report = audit_csv(csv_text, _claim())

    assert report["signature"] is None
    assert report["signer_public_key"] is None
    assert verify_report(report) is True
    assert verify_report(report, csv_text) is True


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_expired_rate_limit_entries_are_evicted():
    """A bucket that has aged out must forget its history, not count it."""
    now = time.time()
    api._rate_buckets["stale"].extend([now - 61.0, now - 120.0, now - 300.0])

    assert api._rate_limited("stale") is False

    bucket = api._rate_buckets["stale"]
    assert len(bucket) == 1
    assert bucket[0] >= now


def test_run_experiment_returns_the_artifact_references_of_a_completed_run(tmp_path):
    (tmp_path / "output.json").write_text("{}", encoding="utf-8")
    snapshot_json = json.dumps({"engine": {"name": "tumortwin"}})
    client = TestClient(api.app)

    resp = client.post(
        "/run_experiment",
        json={
            "engine_name": "tumortwin",
            "snapshot_json": snapshot_json,
            "sha256": hashlib.sha256(snapshot_json.encode()).hexdigest(),
            "workspace": str(tmp_path),
        },
    )

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"results": [{"artifact_id": "sim_output", "path": "output.json"}]}


# ---------------------------------------------------------------------------
# Baselines
# ---------------------------------------------------------------------------

def test_all_baselines_refusing_is_reported_as_not_assessed(monkeypatch):
    """Three refusals are a not-assessed comparison, not an exception."""

    class Refusing:
        def __init__(self, *args, **kwargs):
            raise RuntimeError("refused by the test")

    monkeypatch.setattr(baselines, "LogisticRegression", Refusing)
    monkeypatch.setattr(baselines, "RandomForestClassifier", Refusing)

    df = _table()
    df["tumour_volume"] = np.linspace(0.1, 2.0, len(df))

    result = baselines.run_baselines(df, "train", "test")

    assert result["status"] == "not_assessed"
    assert result["reason"] == "all baselines refused"
    assert [m["model"] for m in result["models"]] == ["LogisticRegression", "ElasticNet", "RandomForest"]
    assert {m["status"] for m in result["models"]} == {"refused"}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _cli_inputs(tmp_path):
    csv_path = tmp_path / "predictions.csv"
    csv_path.write_text(_csv(_table()), encoding="utf-8")
    claim_path = tmp_path / "claim.json"
    claim_path.write_text(json.dumps({"claim_id": "c1", "claimed_auc": 0.8}), encoding="utf-8")
    return ["audit", str(csv_path), str(claim_path)]


def test_a_command_that_aborts_maps_to_its_exit_code(monkeypatch, tmp_path):
    def abort(*args, **kwargs):
        raise SystemExit(3)

    monkeypatch.setattr(cli, "audit_csv", abort)

    assert cli.main(_cli_inputs(tmp_path)) == 3


def test_an_abort_without_a_status_code_is_reported_as_success(monkeypatch, tmp_path):
    def abort(*args, **kwargs):
        raise SystemExit()

    monkeypatch.setattr(cli, "audit_csv", abort)

    assert cli.main(_cli_inputs(tmp_path)) == 0


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def test_calibration_refuses_when_the_intercept_solver_fails(monkeypatch):
    def no_bracket(*args, **kwargs):
        raise ValueError("no sign change")

    monkeypatch.setattr(metrics, "brentq", no_bracket)

    rng = np.random.default_rng(0)
    probs = rng.uniform(0.05, 0.95, 200)
    labels = (rng.random(200) < probs).astype(int)

    result = metrics.calibration(labels, probs)

    assert result == {"status": "refused", "reason": "intercept-in-the-large did not converge"}


def test_a_degenerate_permutation_never_counts_as_an_exceedance(monkeypatch):
    """A reshuffle that leaves one class cannot exceed the observed AUC."""

    class _DegenerateRng:
        def permutation(self, values):
            return np.zeros_like(values)

    df = _table().query("split == 'test'")[["patient_id", "label", "score"]]
    monkeypatch.setattr(metrics.np.random, "default_rng", lambda seed: _DegenerateRng())

    result = metrics.permutation_null(df, "score", 99, 1)

    assert result["status"] == "ok"
    assert result["p_value"] == pytest.approx(1 / 100)


# ---------------------------------------------------------------------------
# Engine protocol
# ---------------------------------------------------------------------------

def test_the_engine_protocol_stubs_are_noop_documentation():
    """``EngineAdapter`` describes the surface; its own bodies carry no behaviour."""
    assert isinstance(TumorTwinAdapter(), EngineAdapter)
    assert EngineAdapter.validate(object(), None, "") is None
    assert EngineAdapter.run(object(), None, "") is None
