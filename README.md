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
pytest

# Audit a prediction table CSV against a claim spec
referee-core audit predictions.csv claim.json

# Run seeded-fault suite
referee-core suite --reps 30

# Start API service
# REFEREE_ENV=development only for local work. In production the service
# refuses every request (503) until REFEREE_API_KEY is set.
REFEREE_ENV=development uvicorn referee_core.api:app --reload --port 8000
```

### 2. TypeScript / Next.js Presentation Layer

```bash
# Install dependencies
bun install

# Run unit and integration tests
bun test

# Typecheck and production build
bunx tsc --noEmit
bun run build

# Start development server
bun run dev
```

## Authentication

Every API route requires the operator credential. One secret authorises both
forms of client:

| Client | How it authenticates |
|---|---|
| Service to service | `x-api-key`, `x-referee-key`, or `Authorization: Bearer` header |
| Browser dashboard | An HttpOnly session cookie minted by `POST /api/session` |

Set one of `INTERNAL_API_KEY`, `REFEREE_INTERNAL_KEY` or `REFEREE_API_KEY`.

**The service fails closed.** In a production build, a missing secret closes
every route with `503 service_not_configured` rather than serving an
unauthenticated engine - a service that silently opens when its secret is
missing is indistinguishable from one that is working. Outside production
(local development and the test suite) the routes run open, which is what
`REFEREE_ENV=development` selects explicitly.

The browser console lives behind `middleware.ts`: unauthenticated page
requests are redirected to `/login`, where the operator key is exchanged for a
session cookie. API requests are answered with `401`, not a redirect, so a
machine client gets a usable error.

The Python core enforces the same rule independently: with `REFEREE_API_KEY`
unset and `REFEREE_ENV` at its default of `production`, every route except
`/health` answers `503`.

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
