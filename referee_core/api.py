from __future__ import annotations

import hashlib
import tempfile
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .audit import audit_csv, verify_report
from .engine import EngineRegistry, ManifestSnapshot
from .engine.tumortwin_adapter import TumorTwinAdapter
from .schema import ClaimSpec, Policy

registry = EngineRegistry()
registry.register(TumorTwinAdapter())

app = FastAPI(title="referee-core", version="0.1.0")

MAX_CSV_LENGTH = 25 * 1024 * 1024  # 25 MB


class AuditRequest(BaseModel):
    claim: ClaimSpec
    csv_text: str = Field(..., max_length=MAX_CSV_LENGTH)
    policy: Optional[Policy] = None


class VerifyRequest(BaseModel):
    model_config = {"extra": "allow"}
    report: Optional[dict] = None
    csv_text: Optional[str] = None


class HypothesisPreCheck(BaseModel):
    dataset_ids: List[str]
    user_role: str
    pipeline_skills: List[str]


class RunExperimentRequest(BaseModel):
    engine_name: str
    snapshot_json: str
    sha256: str
    workspace: Optional[str] = None


@app.post("/audit")
def audit(req: AuditRequest) -> dict:
    if len(req.csv_text.encode("utf-8")) > MAX_CSV_LENGTH:
        raise HTTPException(413, "Prediction CSV exceeds 25 MB size limit.")
    return audit_csv(req.csv_text, req.claim, req.policy)


from fastapi import FastAPI, HTTPException, Request


@app.post("/verify")
async def verify(req: Request) -> dict:
    try:
        body = await req.json()
        report_data = body.get("report", body) if isinstance(body, dict) else {}
        csv_text = body.get("csv_text") if isinstance(body, dict) else None
        return {"valid": verify_report(report_data, csv_text)}
    except Exception as exc:
        raise HTTPException(422, f"not a report: {exc}")


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
async def run_experiment(req: RunExperimentRequest):
    # Verify snapshot integrity against SHA-256 digest
    computed_digest = hashlib.sha256(req.snapshot_json.encode("utf-8")).hexdigest()
    if computed_digest != req.sha256:
        raise HTTPException(400, "Snapshot SHA-256 digest does not match supplied snapshot_json")

    workspace = req.workspace or tempfile.mkdtemp(prefix="referee_workspace_")
    snapshot = ManifestSnapshot(canonical_json=req.snapshot_json, sha256=req.sha256)
    adapter = registry.require(req.engine_name)

    # Validate before running
    adapter.validate(snapshot, workspace)
    results = adapter.run(snapshot, workspace)
    return {"results": results}
