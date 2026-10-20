from __future__ import annotations

from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ValidationError

from .audit import audit_csv, verify_report
from .schema import ClaimSpec, Policy
from .engine import EngineRegistry
from .engine.tumortwin_adapter import TumorTwinAdapter

registry = EngineRegistry()
registry.register(TumorTwinAdapter())

app = FastAPI(title="referee-core", version="0.1.0")


class AuditRequest(BaseModel):
    claim: ClaimSpec
    csv_text: str
    policy: Optional[Policy] = None


class HypothesisPreCheck(BaseModel):
    dataset_ids: List[str]
    user_role: str
    pipeline_skills: List[str]


@app.post("/audit")
def audit(req: AuditRequest) -> dict:
    return audit_csv(req.csv_text, req.claim, req.policy)


@app.post("/verify")
def verify(report: dict) -> dict:
    try:
        return {"valid": verify_report(report)}
    except KeyError as exc:
        raise HTTPException(422, f"not a report: missing {exc}")


@app.post("/pre_check")
async def pre_check_hypothesis(req: HypothesisPreCheck):
    valid_skills = [
        "split_by_patient_level",
        "run_glmnet_baseline",
        "run_statistical_referee",
        "check_batch_confound",
        "combat_batch_harmonization",
        "run_clinical_cox_baseline",
        "multimodal_clinical_fusion",
        "check_scanner_nuisance_kernel",
        "split_longitudinal_timepoint_held_out",
    ]
    for skill in req.pipeline_skills:
        if skill not in valid_skills:
            return {"status": "REJECTED", "reason": f"Skill {skill} does not exist in deterministic library."}

    for ds in req.dataset_ids:
        if ds == "MSK-MET" and req.user_role == "academic":
            return {"status": "REJECTED", "reason": f"License blocked for {ds} under academic role."}

    return {"status": "PASSED"}


@app.post("/run_experiment")
async def run_experiment(engine_name: str, snapshot_json: str, sha256: str):
    from .engine import ManifestSnapshot
    snapshot = ManifestSnapshot(canonical_json=snapshot_json, sha256=sha256)
    adapter = registry.require(engine_name)
    results = adapter.run(snapshot, "/tmp/workspace")
    return {"results": results}
