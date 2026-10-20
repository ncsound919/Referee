"""Inputs: a claim spec, a policy of thresholds, and one prediction table."""
from __future__ import annotations

import io
from typing import Literal, Optional

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, model_validator

UNIVERSAL_CLAIM_LIMIT = (
    "This audit evaluates reproducibility of a reported metric from supplied predictions, "
    "data-separation integrity, and statistical adequacy. It does not establish clinical "
    "correctness, biological truth, or patient benefit."
)

NUISANCE_COLUMNS = ("batch", "site", "center", "scanner", "plate")


class ClaimSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str = Field(min_length=1)
    title: str = ""
    claimed_auc: float = Field(gt=0.0, le=1.0)
    claimed_auc_ci: Optional[tuple[float, float]] = None
    eval_on: Literal["test", "all"] = "test"
    score_is_probability: bool = False
    split_description: Optional[str] = None   # advisory text only; never changes a verdict

    @model_validator(mode="after")
    def _ci(self) -> "ClaimSpec":
        if self.claimed_auc_ci and not (self.claimed_auc_ci[0] <= self.claimed_auc <= self.claimed_auc_ci[1]):
            raise ValueError("claimed_auc must lie inside claimed_auc_ci")
        return self


class Policy(BaseModel):
    """Thresholds. Defaults are proposals; they are hashed into every report."""
    model_config = ConfigDict(extra="forbid")

    seed: int = 42
    n_boot: int = Field(default=1000, ge=100)
    repro_tolerance: float = 0.02       # |claimed - reproduced| allowed regardless of CI
    min_eval_patients: int = 30
    min_patients_per_class: int = 10
    max_degenerate_frac: float = 0.05
    nuisance_warn_auc: float = 0.65
    shortcut_ratio: float = 0.90        # nuisance excess AUC / model excess AUC for 'critical'
    nc_ci_level: float = 0.99           # negative control fails only if this interval excludes 0.5 ...
    nc_margin: float = 0.05             # ... and the AUC differs from 0.5 by at least this much
    train_label: str = "train"
    test_label: str = "test"


class TableError(ValueError):
    pass


def load_table(csv_text: str) -> pd.DataFrame:
    try:
        df = pd.read_csv(io.StringIO(csv_text), dtype={"patient_id": str, "sample_id": str})
    except Exception as exc:  # malformed CSV
        raise TableError(f"cannot parse CSV: {exc}") from exc
    for col in ("patient_id", "label"):
        if col not in df.columns:
            raise TableError(f"missing required column '{col}'")
    if df["patient_id"].isna().any() or (df["patient_id"].str.strip() == "").any():
        raise TableError("patient_id has empty values")
    if not set(pd.unique(df["label"].dropna())) <= {0, 1}:
        raise TableError("label must be 0 or 1")
    if "sample_id" not in df.columns:
        df["sample_id"] = [f"row{i}" for i in range(len(df))]
    if df["sample_id"].duplicated().any():
        raise TableError("sample_id values must be unique")
    for c in df.columns:
        if c in ("score", "nc_score"):
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df
