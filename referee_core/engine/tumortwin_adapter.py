from __future__ import annotations
import os
from .provenance import ManifestSnapshot


class TumorTwinAdapter:
    name = "tumortwin"

    def validate(self, snapshot: ManifestSnapshot, workspace: str) -> None:
        if not os.path.isdir(workspace):
            os.makedirs(workspace, exist_ok=True)

    def run(self, snapshot: ManifestSnapshot, workspace: str) -> list[dict[str, str]]:
        output_file = os.path.join(workspace, "output.json")
        if not os.path.exists(output_file):
            raise RuntimeError(
                f"TumorTwin engine execution refused: no external TumorTwin simulator is configured in workspace {workspace}. "
                "No simulation was run and no synthetic biological results were generated."
            )
        return [{"artifact_id": "sim_output", "path": "output.json"}]
