from __future__ import annotations
from .registry import EngineAdapter
from .provenance import ManifestSnapshot
import os

class TumorTwinAdapter:
    name = "tumortwin"

    def validate(self, snapshot: ManifestSnapshot, workspace: str) -> None:
        print(f"Validating TumorTwin simulation for snapshot: {snapshot.sha256}")

    def run(self, snapshot: ManifestSnapshot, workspace: str) -> list[dict[str, str]]:
        print(f"Running TumorTwin simulation in: {workspace}")
        return [{"artifact_id": "sim_output", "path": "output.json"}]
