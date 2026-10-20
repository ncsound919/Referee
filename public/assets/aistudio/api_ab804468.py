from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ValidationError

from .audit import audit_csv, verify_report
from .schema import ClaimSpec, Policy

app = FastAPI(title="referee-core", version="0.1.0")


class AuditRequest(BaseModel):
    claim: ClaimSpec
    csv_text: str
    policy: Optional[Policy] = None


@app.post("/audit")
def audit(req: AuditRequest) -> dict:
    return audit_csv(req.csv_text, req.claim, req.policy)


@app.post("/verify")
def verify(report: dict) -> dict:
    try:
        return {"valid": verify_report(report)}
    except KeyError as exc:
        raise HTTPException(422, f"not a report: missing {exc}")
