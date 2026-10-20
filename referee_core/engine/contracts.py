from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ArtifactRef(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    artifact_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    media_type: str = Field(min_length=1)
    schema_id: str = Field(min_length=1)
    units: dict[str, str] = Field(default_factory=dict)


class EngineSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: Literal["tumortwin", "sistem", "umimic"]
    version: str = Field(min_length=1)
    source_revision: str | None = None
    runtime_digest: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)


class RunManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: Literal["1.0"] = "1.0"
    experiment_id: str = Field(min_length=1)
    protocol_id: str = Field(min_length=1)
    engine: EngineSpec
    inputs: tuple[ArtifactRef, ...] = ()
    seed: int = Field(ge=0)
    time_axis_unit: Literal["hour", "day", "generation", "not_applicable"]
    code_revision: str | None = None
    environment_lock_sha256: str | None = Field(
        default=None, pattern=r"^[0-9a-f]{64}$"
    )
