# Referee

**Deterministic Audit Engine & Cryptographic Evidence Ledger for Computational Oncology Claims**

Referee audits machine learning claims in computational oncology from patient-level prediction tables. Every number in an audit report is computed deterministically from the data—claim text is advisory only and cannot alter a verdict.

## Key Principles

1. **One Source of Truth**: The Python core (`referee-core`) computes all statistical metrics and leakage measurements from raw prediction tables.
2. **Explicit Provenance**: Every metric displayed in the system carries provenance (`computed`, `reference`, or `simulated`). Only `computed` verdicts derived from data tables can be committed to the public evidence ledger.
3. **Refuse Rather Than Guess**: Missing labels, missing splits, or non-finite numbers trigger explicit refusals (`UNVERIFIABLE`), never fabricated defaults.
4. **Tamper-Evident Ledger**: The evidence ledger chains SHA-256 block digests over the entirety of each audit record. Modifying any verdict, baseline margin, statement, or evidence fails cryptographic chain verification.

## Quickstart

### 1. Python Deterministic Core (`referee-core`)

```bash
# Install in editable mode
pip install -e ".[dev]"

# Run tests
pytest tests/test_core.py

# Audit a prediction table CSV against a claim spec
referee-core audit predictions.csv claim.json

# Run seeded-fault suite
referee-core suite --reps 30

# Start API service
uvicorn referee_core.api:app --reload --port 8000
```

### 2. TypeScript / Next.js Presentation Layer

```bash
# Install dependencies
bun install

# Run unit and integration tests
bun test

# Start development server
bun run dev
```

## Prediction Table Specification

The prediction CSV requires the following columns:
- `patient_id` (string): Normalized and stripped of whitespace to prevent cross-split leakage.
- `label` (0 or 1 integer): Ground truth binary outcome. NaNs are strictly rejected.
- `split` (`train` or `test`): Partition split. Supported aliases (`training`, `val`, `holdout`) are normalized.
- `score` (float): Continuous model risk prediction or probability.

Optional columns:
- `sample_id` (string): Unique identifier per sample or tile.
- `batch`, `site`, `center`, `scanner`, `plate` (string): Nuisance covariates tested for batch shortcuts.
- `nc_score` (float): Negative-control scores.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the complete trust boundary and data provenance specification.
