from __future__ import annotations

import hashlib
import hmac
import os
import tempfile
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .audit import audit_csv, verify_report
from .engine import EngineRegistry, ManifestSnapshot
from .engine.tumortwin_adapter import TumorTwinAdapter
from .schema import ClaimSpec, Policy

registry = EngineRegistry()
registry.register(TumorTwinAdapter())

app = FastAPI(title="referee-core", version="0.1.0")

MAX_CSV_LENGTH = 25 * 1024 * 1024  # 25 MB


# Simple in-process fixed-window rate limiter (per client IP).
_RATE_LIMIT = int(os.environ.get("REFEREE_RATE_LIMIT_PER_MIN", "60"))
_rate_buckets: dict[str, deque] = defaultdict(deque)

# Deployment mode. "production" is the default so that a missing
# REFEREE_API_KEY closes the service instead of exposing it. Local development
# and the test suite opt out explicitly with REFEREE_ENV=development.
_IS_PRODUCTION = os.environ.get("REFEREE_ENV", "production").strip().lower() not in (
    "development",
    "dev",
    "test",
    "local",
)


def _rate_limited(client: str) -> bool:
    now = time.time()
    bucket = _rate_buckets[client]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT:
        return True
    bucket.append(now)
    return False


class _RefereeKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        expected = os.environ.get("REFEREE_API_KEY")
        if not expected:
            # Fail closed. A service that silently opens when its secret is
            # missing is indistinguishable from a service that is working, and
            # this one holds the deterministic engine behind paid compute.
            # REFEREE_ENV=development is the only way to run it open, and it
            # must be set deliberately (local dev / CI only).
            if _IS_PRODUCTION:
                return JSONResponse(
                    {
                        "detail": (
                            "REFEREE_API_KEY is not configured. Set it, or set "
                            "REFEREE_ENV=development to run the service open "
                            "(local development and tests only)."
                        )
                    },
                    status_code=503,
                )
        else:
            supplied = (
                request.headers.get("x-referee-key")
                or request.headers.get("x-api-key")
                or request.headers.get("authorization", "").removeprefix("Bearer ").strip()
            )
            if not supplied or not hmac.compare_digest(supplied, expected):
                return JSONResponse({"detail": "invalid or missing referee API key"}, status_code=401)

        client = request.client.host if request.client else "unknown"
        if _rate_limited(client):
            return JSONResponse({"detail": "rate limit exceeded"}, status_code=429)

        return await call_next(request)


app.add_middleware(_RefereeKeyMiddleware)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "referee-core", "version": "0.1.0"}


class AuditRequest(BaseModel):
    claim: ClaimSpec
    csv_text: str
    policy: Policy | None = None


class BatchAuditItem(BaseModel):
    claim: ClaimSpec
    csv_text: str
    policy: Policy | None = None


class BatchAuditRequest(BaseModel):
    items: list[BatchAuditItem]


class VerifyRequest(BaseModel):
    model_config = {"extra": "allow"}
    report: dict | None = None
    csv_text: str | None = None


class HypothesisPreCheck(BaseModel):
    dataset_ids: list[str]
    user_role: str
    pipeline_skills: list[str]


class RunExperimentRequest(BaseModel):
    engine_name: str
    snapshot_json: str
    sha256: str
    workspace: str | None = None


@app.post("/audit")
def audit(req: AuditRequest) -> dict:
    if len(req.csv_text.encode("utf-8")) > MAX_CSV_LENGTH:
        raise HTTPException(413, "Prediction CSV exceeds 25 MB size limit.")
    return audit_csv(req.csv_text, req.claim, req.policy)


@app.post("/audit_batch")
def audit_batch(req: BatchAuditRequest) -> dict:
    reports = []
    for item in req.items:
        if len(item.csv_text.encode("utf-8")) > MAX_CSV_LENGTH:
            raise HTTPException(413, "Prediction CSV exceeds 25 MB size limit.")
        reports.append(audit_csv(item.csv_text, item.claim, item.policy))
    return {"reports": reports, "count": len(reports)}


@app.post("/verify")
async def verify(req: Request) -> dict:
    try:
        body = await req.json()
        report_data = body.get("report", body) if isinstance(body, dict) else {}
        csv_text = body.get("csv_text") if isinstance(body, dict) else None
        return {"valid": verify_report(report_data, csv_text)}
    except Exception as exc:
        raise HTTPException(422, f"not a report: {exc}") from exc


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
