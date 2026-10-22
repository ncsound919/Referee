"""
test_faults_contract.py

The seeded-fault suite is the referee's own regression harness: it injects a
known fault into a synthetic table and checks that the engine produces the
verdict that fault deserves.

These tests pin:
  - every scenario in the suite, and the verdict each one must produce,
  - the separation between the detection rate (seeded faults) and the false
    rejection rate (clean controls),
  - the two sensitivity sweeps, which answer "how strong does the fault have
    to be before it is caught?",
  - the CLI entry points.
"""
from __future__ import annotations

import json

import pytest

from referee_core import faults
from referee_core.cli import main


# ---------------------------------------------------------------------------
# The scenario table
# ---------------------------------------------------------------------------

def test_the_suite_covers_every_documented_verdict():
    expected = {sc.expected for sc in faults.SCENARIOS}
    assert expected == {"REPRODUCED", "NOT_REPRODUCED", "LEAKAGE_DETECTED", "UNVERIFIABLE"}


def test_the_clean_controls_are_marked_as_having_no_seeded_fault():
    clean = [sc for sc in faults.SCENARIOS if not sc.seeded_fault]
    assert {sc.name for sc in clean} == {
        "clean",
        "clean_with_null_negative_control",
        "clean_with_uninformative_batch",
        "clean_repeated_measures",
    }


def test_every_seeded_fault_is_marked_as_seeded():
    for sc in faults.SCENARIOS:
        if sc.name.startswith("clean"):
            assert sc.seeded_fault is False, sc.name
        else:
            assert sc.seeded_fault is True, sc.name


def test_the_scenario_names_are_unique():
    names = [sc.name for sc in faults.SCENARIOS]
    assert len(names) == len(set(names))


# ---------------------------------------------------------------------------
# The suite itself
# ---------------------------------------------------------------------------

def test_the_suite_reports_a_row_per_scenario():
    result = faults.run_suite(reps=2, n_boot=100)
    assert len(result["rows"]) == len(faults.SCENARIOS)
    for row in result["rows"]:
        assert row["runs"] == 2
        assert 0.0 <= row["rate"] <= 1.0
        assert sum(row["verdicts"].values()) == 2


def test_the_suite_separates_detection_rate_from_false_rejection_rate():
    """Finding: the false rejection rate must be measured over the clean
    controls, not over the faulty ones."""
    result = faults.run_suite(reps=2, n_boot=100)
    assert result["detection_rate"] is not None
    assert result["false_rejection_rate"] is not None
    assert 0.0 <= result["detection_rate"] <= 1.0
    assert 0.0 <= result["false_rejection_rate"] <= 1.0


def test_the_suite_can_be_restricted_to_a_subset():
    subset = [sc for sc in faults.SCENARIOS if sc.name == "clean"]
    result = faults.run_suite(reps=1, n_boot=100, scenarios=subset)
    assert len(result["rows"]) == 1
    assert result["detection_rate"] is None
    assert result["false_rejection_rate"] is not None


def test_a_clean_table_is_not_mislabelled_as_leakage():
    """The clean control must survive its own audit."""
    import numpy as np

    rng = np.random.default_rng(5)
    df = faults._base(rng, n_pat=200, d=1.2)
    csv_text, claim = faults._csv(df), faults._claim(df, "clean")
    from referee_core.audit import audit_csv

    assert audit_csv(csv_text, claim)["verdict"] == "REPRODUCED"


def test_a_patient_leak_is_caught():
    import numpy as np

    from referee_core.audit import audit_csv

    rng = np.random.default_rng(6)
    csv_text, claim = faults._patient_leak(rng)
    assert audit_csv(csv_text, claim)["verdict"] == "LEAKAGE_DETECTED"


def test_an_inflated_claim_is_caught():
    import numpy as np

    from referee_core.audit import audit_csv

    rng = np.random.default_rng(7)
    csv_text, claim = faults._inflated(0.12)(rng)
    assert audit_csv(csv_text, claim)["verdict"] == "NOT_REPRODUCED"


def test_a_missing_score_column_is_unverifiable():
    import numpy as np

    from referee_core.audit import audit_csv

    rng = np.random.default_rng(8)
    csv_text, claim = faults._missing_score(rng)
    assert audit_csv(csv_text, claim)["verdict"] == "UNVERIFIABLE"


def test_a_table_with_too_few_patients_is_unverifiable():
    import numpy as np

    from referee_core.audit import audit_csv

    rng = np.random.default_rng(9)
    csv_text, claim = faults._too_small(rng)
    assert audit_csv(csv_text, claim)["verdict"] == "UNVERIFIABLE"


# ---------------------------------------------------------------------------
# Sensitivity sweeps
# ---------------------------------------------------------------------------

def test_the_inflation_sweep_returns_one_row_per_delta():
    result = faults.sensitivity_to_inflation(deltas=(0.02, 0.10), reps=2, n_boot=100)
    assert [r["inflation"] for r in result] == [0.02, 0.10]
    for row in result:
        assert 0.0 <= row["detection_rate"] <= 1.0


def test_the_inflation_sweep_gets_more_sensitive_as_the_claim_grows():
    """A bigger overclaim must be at least as easy to detect."""
    result = faults.sensitivity_to_inflation(deltas=(0.02, 0.06, 0.12), reps=3, n_boot=100)
    rates = [r["detection_rate"] for r in result]
    assert rates == sorted(rates), rates


def test_the_batch_shortcut_sweep_returns_one_row_per_setting():
    result = faults.sensitivity_to_batch_shortcut(settings=((0.2, 2.0), (0.9, 2.0)), reps=2, n_boot=100)
    assert [r["batch_label_association"] for r in result] == [0.2, 0.9]
    for row in result:
        assert 0.0 <= row["flagged_rate"] <= 1.0
        assert sum(row["verdicts"].values()) == 2


def test_the_batch_shortcut_sweep_gets_more_sensitive_as_the_association_grows():
    result = faults.sensitivity_to_batch_shortcut(settings=((0.2, 2.0), (0.6, 2.0), (0.9, 2.0)), reps=3, n_boot=100)
    rates = [r["flagged_rate"] for r in result]
    assert rates == sorted(rates), rates


# ---------------------------------------------------------------------------
# The CLI
# ---------------------------------------------------------------------------

def test_the_audit_command_writes_a_report(tmp_path, capsys):
    import numpy as np

    rng = np.random.default_rng(11)
    df = faults._base(rng, n_pat=200, d=1.2)
    csv_path = tmp_path / "table.csv"
    csv_path.write_text(faults._csv(df), encoding="utf-8")
    claim_path = tmp_path / "claim.json"
    claim_path.write_text(json.dumps(faults._claim(df, "cli").model_dump(mode="json")), encoding="utf-8")

    assert main(["audit", str(csv_path), str(claim_path)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["verdict"] in {
        "REPRODUCED", "NOT_REPRODUCED", "FAILS_BASELINE",
        "LEAKAGE_DETECTED", "UNVERIFIABLE", "OUT_OF_SCOPE",
    }
    assert len(payload["report_sha256"]) == 64


def test_the_audit_command_accepts_a_policy_file(tmp_path, capsys):
    import numpy as np

    rng = np.random.default_rng(12)
    df = faults._base(rng, n_pat=200, d=1.2)
    csv_path = tmp_path / "table.csv"
    csv_path.write_text(faults._csv(df), encoding="utf-8")
    claim_path = tmp_path / "claim.json"
    claim_path.write_text(json.dumps(faults._claim(df, "cli").model_dump(mode="json")), encoding="utf-8")
    policy_path = tmp_path / "policy.json"
    policy_path.write_text(json.dumps({"seed": 7, "n_boot": 100}), encoding="utf-8")

    assert main(["audit", str(csv_path), str(claim_path), "--policy", str(policy_path)]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["policy"]["seed"] == 7
    assert payload["policy"]["n_boot"] == 100


def test_the_audit_command_fails_on_a_missing_csv(tmp_path):
    claim_path = tmp_path / "claim.json"
    claim_path.write_text(json.dumps({"claim_id": "c", "claimed_auc": 0.8}), encoding="utf-8")
    with pytest.raises(Exception):
        main(["audit", str(tmp_path / "absent.csv"), str(claim_path)])


def test_the_audit_command_fails_on_a_malformed_claim(tmp_path):
    csv_path = tmp_path / "table.csv"
    csv_path.write_text("patient_id,label,score,split\nP1,1,0.9,test\n", encoding="utf-8")
    claim_path = tmp_path / "claim.json"
    claim_path.write_text("{not json", encoding="utf-8")
    with pytest.raises(Exception):
        main(["audit", str(csv_path), str(claim_path)])


def test_an_unknown_subcommand_is_refused():
    with pytest.raises(Exception):
        main(["invent-a-command"])
