from __future__ import annotations

import hashlib
import hmac
import os
import tempfile
import time
from collections import defaultdict, deque

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from . import _build, telemetry
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


def _accepted_key_digests() -> tuple[bytes, ...]:
    """SHA-256 digests of every key this instance should accept.

    ``REFEREE_API_KEY`` may hold more than one key, separated by commas,
    semicolons or whitespace. That is what makes a rotation possible without
    downtime: add the replacement alongside the current key, move every client
    over, then drop the old one. Empty entries are ignored, so a trailing
    comma or a blank line in the environment file cannot open the service.

    Digests rather than the raw keys, so the comparison below is constant-time
    regardless of key length.
    """
    raw = os.environ.get("REFEREE_API_KEY") or ""
    return tuple(
        hashlib.sha256(part.encode()).digest()
        for part in raw.replace(",", " ").replace(";", " ").split()
    )


def _key_matches(supplied: str, digests: tuple[bytes, ...]) -> bool:
    """True when ``supplied`` matches any accepted key.

    Every digest is compared, without an early exit, so the time taken does
    not reveal which position in the ring matched.
    """
    candidate = hashlib.sha256(supplied.encode()).digest()
    matched = False
    for digest in digests:
        matched |= hmac.compare_digest(candidate, digest)
    return matched


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

        accepted = _accepted_key_digests()
        if not accepted:
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
            if not supplied or not _key_matches(supplied, accepted):
                return JSONResponse({"detail": "invalid or missing referee API key"}, status_code=401)

        client = request.client.host if request.client else "unknown"
        if _rate_limited(client):
            return JSONResponse({"detail": "rate limit exceeded"}, status_code=429)

        return await call_next(request)


app.add_middleware(_RefereeKeyMiddleware)


@app.get("/telemetry/status")
def telemetry_status(probe: bool = False) -> dict:
    """Operator view of the Sieve lane, with an optional live delivery probe.

    The engine treats telemetry as optional, so a deployment can look healthy
    while its lane is silent. This reports the switch and the receiver without
    echoing the key, and `?probe=1` performs one real POST so the answer comes
    from the receiver rather than from configuration.
    """
    result: dict = {
        "enabled": telemetry.enabled(),
        "receiver_configured": bool(os.environ.get("SIEVE_URL")),
        "switch": os.environ.get("SIEVE_TELEMETRY", "1"),
        "schema": telemetry.SCHEMA,
    }
    if probe and telemetry.enabled():
        result["probe"] = telemetry.emit(
            telemetry.build_event("audit.probe", props={"probe": True})
        )
    return result


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "referee-core",
        "version": "0.1.0",
        # The deploy workflow bakes the commit SHA into _build.py, so a probe can
        # tell a stale instance from the current one without shelling into it.
        "build_sha": os.environ.get("REFEREE_BUILD_SHA") or _build.BUILD_SHA,
    }


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
def audit(req: AuditRequest, background: BackgroundTasks) -> dict:
    started = time.perf_counter()
    csv_bytes = len(req.csv_text.encode("utf-8"))
    if csv_bytes > MAX_CSV_LENGTH:
        telemetry.schedule(
            None,
            "audit.failed",
            status="error",
            severity="error",
            subject={"kind": "claim", "id": req.claim.claim_id},
            props={"reason": "csv_too_large", "bytes": csv_bytes},
            duration_ms=telemetry.elapsed_ms(started),
        )
        raise HTTPException(413, "Prediction CSV exceeds 25 MB size limit.")
    try:
        report = audit_csv(req.csv_text, req.claim, req.policy)
    except Exception as exc:
        # The audit did not produce a number; record that it failed, then let
        # the caller see the real error. Telemetry never replaces the result.
        telemetry.schedule(
            None,
            "audit.failed",
            status="error",
            severity="error",
            subject={"kind": "claim", "id": req.claim.claim_id},
            props={"reason": type(exc).__name__},
            duration_ms=telemetry.elapsed_ms(started),
        )
        raise
    telemetry.schedule(
        background,
        "audit.completed",
        subject={"kind": "claim", "id": req.claim.claim_id},
        props={
            "verdict": report.get("verdict"),
            "report_sha256": report.get("report_sha256"),
            "claimed_auc": req.claim.claimed_auc,
            "n_boot": req.policy.n_boot if req.policy else None,
        },
        duration_ms=telemetry.elapsed_ms(started),
    )
    return report


@app.post("/audit_batch")
def audit_batch(req: BatchAuditRequest, background: BackgroundTasks) -> dict:
    started = time.perf_counter()
    reports = []
    for item in req.items:
        if len(item.csv_text.encode("utf-8")) > MAX_CSV_LENGTH:
            telemetry.schedule(
                None,
                "audit.failed",
                status="error",
                severity="error",
                subject={"kind": "claim", "id": item.claim.claim_id},
                props={"reason": "csv_too_large", "completed_before_failure": len(reports)},
                duration_ms=telemetry.elapsed_ms(started),
            )
            raise HTTPException(413, "Prediction CSV exceeds 25 MB size limit.")
        reports.append(audit_csv(item.csv_text, item.claim, item.policy))
    telemetry.schedule(
        background,
        "audit.batch",
        props={
            "count": len(reports),
            "verdicts": {
                v: sum(1 for r in reports if r.get("verdict") == v)
                for v in {r.get("verdict") for r in reports}
                if v is not None
            },
        },
        duration_ms=telemetry.elapsed_ms(started),
    )
    return {"reports": reports, "count": len(reports)}


@app.post("/verify")
async def verify(req: Request, background: BackgroundTasks) -> dict:
    started = time.perf_counter()
    try:
        body = await req.json()
        report_data = body.get("report", body) if isinstance(body, dict) else {}
        csv_text = body.get("csv_text") if isinstance(body, dict) else None
        valid = verify_report(report_data, csv_text)
        claim_id = report_data.get("claim_id") if isinstance(report_data, dict) else None
        report_hash = report_data.get("report_sha256") if isinstance(report_data, dict) else None
        telemetry.schedule(
            background,
            "audit.verified",
            subject={"kind": "report", "id": claim_id or report_hash},
            props={"valid": bool(valid)},
            duration_ms=telemetry.elapsed_ms(started),
        )
        return {"valid": valid}
    except Exception as exc:
        telemetry.schedule(
            None,
            "audit.verified",
            status="error",
            severity="warn",
            props={"reason": type(exc).__name__},
            duration_ms=telemetry.elapsed_ms(started),
        )
        raise HTTPException(422, f"not a report: {exc}") from exc


@app.post("/pre_check")
async def pre_check_hypothesis(req: HypothesisPreCheck, background: BackgroundTasks):
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
            telemetry.schedule(
                background,
                "audit.precheck",
                status="denied",
                severity="warn",
                props={"result": "REJECTED", "reason": "unknown_skill", "skill": skill},
            )
            return {"status": "REJECTED", "reason": f"Skill {skill} does not exist in deterministic library."}

    for ds in req.dataset_ids:
        if ds == "MSK-MET" and req.user_role == "academic":
            telemetry.schedule(
                background,
                "audit.precheck",
                status="denied",
                severity="warn",
                props={"result": "REJECTED", "reason": "license_blocked", "dataset": ds},
            )
            return {"status": "REJECTED", "reason": f"License blocked for {ds} under academic role."}

    telemetry.schedule(
        background,
        "audit.precheck",
        props={
            "result": "PASSED",
            "role": req.user_role,
            "datasets": len(req.dataset_ids),
            "skills": len(req.pipeline_skills),
        },
    )
    return {"status": "PASSED"}


@app.post("/run_experiment")
async def run_experiment(req: RunExperimentRequest, background: BackgroundTasks):
    started = time.perf_counter()
    # Verify snapshot integrity against SHA-256 digest
    computed_digest = hashlib.sha256(req.snapshot_json.encode("utf-8")).hexdigest()
    if computed_digest != req.sha256:
        telemetry.schedule(
            None,
            "audit.experiment.failed",
            status="error",
            severity="error",
            subject={"kind": "engine", "id": req.engine_name},
            props={"reason": "digest_mismatch"},
            duration_ms=telemetry.elapsed_ms(started),
        )
        raise HTTPException(400, "Snapshot SHA-256 digest does not match supplied snapshot_json")

    workspace = req.workspace or tempfile.mkdtemp(prefix="referee_workspace_")
    snapshot = ManifestSnapshot(canonical_json=req.snapshot_json, sha256=req.sha256)
    adapter = registry.require(req.engine_name)

    # Validate before running
    adapter.validate(snapshot, workspace)
    results = adapter.run(snapshot, workspace)
    telemetry.schedule(
        background,
        "audit.experiment",
        subject={"kind": "engine", "id": req.engine_name},
        props={"sha256": req.sha256, "result_count": len(results) if hasattr(results, "__len__") else None},
        duration_ms=telemetry.elapsed_ms(started),
    )
    return {"results": results}
