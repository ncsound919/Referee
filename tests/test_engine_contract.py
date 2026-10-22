"""
test_engine_contract.py

The engine contracts are what make a run reproducible: a manifest is snapshotted
into canonical JSON, digested, and every artifact it references is verified
against that digest before anything is executed.

The contract that matters most is the refusal: the engine must never fabricate a
result. These tests pin that refusal, the provenance digests, the registry
guards, and the manifest schemas.
"""
from __future__ import annotations

import hashlib
import json

import pytest
from pydantic import ValidationError

from referee_core.engine import (
    ArtifactRef,
    EngineNotRegistered,
    EngineRegistry,
    EngineSpec,
    ManifestSnapshot,
    RunManifest,
    manifest_digest,
    sha256_file,
    snapshot_manifest,
    verify_artifact,
)
from referee_core.engine.tumortwin_adapter import TumorTwinAdapter

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def test_registering_the_same_adapter_twice_is_refused():
    registry = EngineRegistry()
    registry.register(TumorTwinAdapter())
    with pytest.raises(ValueError, match="already registered"):
        registry.register(TumorTwinAdapter())


def test_an_unregistered_engine_is_refused_with_an_explicit_message():
    registry = EngineRegistry()
    with pytest.raises(EngineNotRegistered) as excinfo:
        registry.require("nope")
    message = str(excinfo.value)
    assert "No validated adapter is registered for 'nope'" in message
    assert "No simulation was run" in message


def test_a_registered_adapter_is_returned():
    registry = EngineRegistry()
    adapter = TumorTwinAdapter()
    registry.register(adapter)
    assert registry.require("tumortwin") is adapter


def test_the_adapter_is_selected_from_the_persisted_manifest_not_a_model():
    registry = EngineRegistry()
    adapter = TumorTwinAdapter()
    registry.register(adapter)
    snapshot = ManifestSnapshot(
        canonical_json=json.dumps({"engine": {"name": "tumortwin"}}),
        sha256="0" * 64,
    )
    assert registry.require_for_snapshot(snapshot) is adapter


@pytest.mark.parametrize(
    "canonical_json",
    ["not json at all", json.dumps({"no": "engine"}), json.dumps({"engine": {}})],
)
def test_a_snapshot_without_a_valid_engine_name_is_refused(canonical_json):
    registry = EngineRegistry()
    registry.register(TumorTwinAdapter())
    snapshot = ManifestSnapshot(canonical_json=canonical_json, sha256="0" * 64)
    with pytest.raises(ValueError, match="Snapshot does not contain a valid engine name"):
        registry.require_for_snapshot(snapshot)


# ---------------------------------------------------------------------------
# Provenance
# ---------------------------------------------------------------------------

def test_sha256_file_matches_the_digest_of_the_bytes(tmp_path):
    target = tmp_path / "artifact.bin"
    payload = b"concordance" * 1000
    target.write_bytes(payload)
    assert sha256_file(target) == hashlib.sha256(payload).hexdigest()


def test_sha256_file_refuses_a_directory(tmp_path):
    with pytest.raises(FileNotFoundError, match="Expected a regular file"):
        sha256_file(tmp_path)


def test_sha256_file_refuses_a_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="Expected a regular file"):
        sha256_file(tmp_path / "absent.bin")


def test_the_snapshot_is_canonical_json_and_its_own_digest():
    manifest = RunManifest(
        experiment_id="exp-1",
        protocol_id="proto-1",
        engine=EngineSpec(name="tumortwin", version="1.2.3"),
        seed=7,
        time_axis_unit="hour",
    )
    snapshot = snapshot_manifest(manifest)
    assert snapshot.sha256 == hashlib.sha256(snapshot.canonical_json.encode()).hexdigest()
    assert snapshot.canonical_json == json.dumps(
        manifest.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def test_the_manifest_digest_matches_the_snapshot_digest():
    manifest = RunManifest(
        experiment_id="exp-1",
        protocol_id="proto-1",
        engine=EngineSpec(name="tumortwin", version="1.2.3"),
        seed=7,
        time_axis_unit="hour",
    )
    assert manifest_digest(manifest) == snapshot_manifest(manifest).sha256


def test_the_snapshot_digest_changes_when_the_seed_changes():
    def build(seed: int) -> RunManifest:
        return RunManifest(
            experiment_id="exp-1",
            protocol_id="proto-1",
            engine=EngineSpec(name="tumortwin", version="1.2.3"),
            seed=seed,
            time_axis_unit="hour",
        )

    assert manifest_digest(build(7)) != manifest_digest(build(8))


# ---------------------------------------------------------------------------
# Artifact verification
# ---------------------------------------------------------------------------

def _artifact(path: str, digest: str, artifact_id: str = "a1") -> ArtifactRef:
    return ArtifactRef(
        artifact_id=artifact_id,
        path=path,
        sha256=digest,
        media_type="application/json",
        schema_id="s1",
    )


def test_a_matching_artifact_verifies(tmp_path):
    target = tmp_path / "output.json"
    payload = b'{"ok": true}'
    target.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    assert verify_artifact(_artifact("output.json", digest), tmp_path) is None


def test_an_artifact_whose_path_escapes_the_workspace_is_refused(tmp_path):
    artifact = _artifact("../outside.json", "0" * 64)
    with pytest.raises(ValueError, match="escapes workspace"):
        verify_artifact(artifact, tmp_path)


def test_a_missing_artifact_is_refused(tmp_path):
    with pytest.raises(FileNotFoundError, match="Artifact is missing"):
        verify_artifact(_artifact("absent.json", "0" * 64), tmp_path)


def test_an_artifact_whose_digest_does_not_match_is_refused(tmp_path):
    target = tmp_path / "output.json"
    target.write_bytes(b'{"ok": true}')
    with pytest.raises(ValueError, match="Artifact hash mismatch"):
        verify_artifact(_artifact("output.json", "0" * 64), tmp_path)


def test_the_hash_mismatch_message_names_both_digests(tmp_path):
    target = tmp_path / "output.json"
    target.write_bytes(b'{"ok": true}')
    artifact = _artifact("output.json", "0" * 64, artifact_id="sim_output")
    with pytest.raises(ValueError) as excinfo:
        verify_artifact(artifact, tmp_path)
    assert "sim_output" in str(excinfo.value)
    assert "0" * 64 in str(excinfo.value)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

def test_an_artifact_digest_must_be_a_lowercase_sha256_hex():
    with pytest.raises(ValidationError):
        ArtifactRef(
            artifact_id="a1",
            path="output.json",
            sha256="NOTHEX",
            media_type="application/json",
            schema_id="s1",
        )


def test_an_artifact_is_frozen():
    artifact = _artifact("output.json", "0" * 64)
    with pytest.raises(ValidationError):
        artifact.path = "other.json"


def test_a_manifest_rejects_an_unknown_field():
    with pytest.raises(ValidationError):
        RunManifest(
            experiment_id="exp-1",
            protocol_id="proto-1",
            engine=EngineSpec(name="tumortwin", version="1.2.3"),
            seed=7,
            time_axis_unit="hour",
            unexpected="value",
        )


def test_a_manifest_rejects_an_unknown_schema_version():
    with pytest.raises(ValidationError):
        RunManifest(
            schema_version="2.0",
            experiment_id="exp-1",
            protocol_id="proto-1",
            engine=EngineSpec(name="tumortwin", version="1.2.3"),
            seed=7,
            time_axis_unit="hour",
        )


def test_an_engine_name_outside_the_allow_list_is_refused():
    with pytest.raises(ValidationError):
        EngineSpec(name="not-an-engine", version="1.0")


def test_a_negative_seed_is_refused():
    with pytest.raises(ValidationError):
        RunManifest(
            experiment_id="exp-1",
            protocol_id="proto-1",
            engine=EngineSpec(name="tumortwin", version="1.2.3"),
            seed=-1,
            time_axis_unit="hour",
        )


# ---------------------------------------------------------------------------
# The TumorTwin adapter: the refusal that must never be replaced by a stub
# ---------------------------------------------------------------------------

def test_validation_creates_the_workspace(tmp_path):
    workspace = tmp_path / "ws"
    adapter = TumorTwinAdapter()
    adapter.validate(ManifestSnapshot(canonical_json="{}", sha256="0" * 64), str(workspace))
    assert workspace.is_dir()


def test_running_without_a_simulator_refuses_instead_of_inventing_a_result(tmp_path):
    """This is the single most important assertion in the engine."""
    adapter = TumorTwinAdapter()
    with pytest.raises(RuntimeError) as excinfo:
        adapter.run(ManifestSnapshot(canonical_json="{}", sha256="0" * 64), str(tmp_path))
    message = str(excinfo.value)
    assert "refused" in message
    assert "No simulation was run" in message
    assert "no synthetic biological results were generated" in message


def test_running_with_a_simulator_output_returns_the_artifact_reference(tmp_path):
    (tmp_path / "output.json").write_text("{}", encoding="utf-8")
    adapter = TumorTwinAdapter()
    results = adapter.run(ManifestSnapshot(canonical_json="{}", sha256="0" * 64), str(tmp_path))
    assert results == [{"artifact_id": "sim_output", "path": "output.json"}]
