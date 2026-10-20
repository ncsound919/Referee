from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from .contracts import ArtifactRef, RunManifest


@dataclass(frozen=True)
class ManifestSnapshot:
    canonical_json: str
    sha256: str


def sha256_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    file_path = Path(path)
    if not file_path.is_file():
        raise FileNotFoundError(f"Expected a regular file, found: {file_path}")
    digest = hashlib.sha256()
    with file_path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def snapshot_manifest(manifest: RunManifest) -> ManifestSnapshot:
    payload = manifest.model_dump(mode="json")
    canonical_text = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )
    digest = hashlib.sha256(canonical_text.encode("utf-8")).hexdigest()
    return ManifestSnapshot(canonical_json=canonical_text, sha256=digest)


def manifest_digest(manifest: RunManifest) -> str:
    return snapshot_manifest(manifest).sha256


def verify_artifact(artifact: ArtifactRef, workspace: str | Path) -> None:
    root = Path(workspace).resolve()
    candidate = (root / artifact.path).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"Artifact path escapes workspace: {artifact.path}")
    if not candidate.is_file():
        raise FileNotFoundError(f"Artifact is missing: {candidate}")
    actual = sha256_file(candidate)
    if actual != artifact.sha256:
        raise ValueError(
            f"Artifact hash mismatch for {artifact.artifact_id}: "
            f"expected {artifact.sha256}, observed {actual}"
        )
