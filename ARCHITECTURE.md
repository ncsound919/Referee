# Referee Architecture & Trust Boundary

## Trust Boundary Specification

Referee is designed around a strict mathematical principle: **every number is computed from the table, never guessed or fabricated.**

```
+--------------------------------------------------------------------------+
|                            USER / WEB CLIENT                             |
|           Submits Prediction CSV + Clinical Claim Specification          |
|                                                                          |
|   The browser dashboard holds no engine, no ledger and no credential.    |
|   It authenticates with an operator session cookie and then talks to    |
|   the API below; it never executes an audit locally.                    |
+--------------------------------------------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
|                  PRESENTATION LAYER (Next.js / TypeScript)               |
|                                                                          |
|  - Data Provenance Enforcer:                                             |
|    Every metric carries provenance: 'computed' | 'reference' | 'simulated'|
|  - Simulated Demo Banner on any unverified synthetic visualization      |
|  - Strict Ledger Gate: Simulated results CANNOT be committed to ledger    |
|  - Operator authentication on every route (API key or session cookie)    |
|    and fail-closed behaviour when no secret is configured                |
+--------------------------------------------------------------------------+
                                     |
                                     | HTTP POST /audit (Prediction CSV)
                                     v
+==========================================================================+
|         AUTHORITATIVE DETERMINISTIC AUDIT ENGINE (referee-core Python)   |
|                                                                          |
|  1. Input Validation (load_table):                                       |
|     - Rejects NaN labels & missing split values honestly                 |
|     - Normalizes patient IDs (strips whitespace, catches variant leaks)  |
|                                                                          |
|  2. Statistical Adequacy Gate:                                           |
|     - Verifies patient counts and per-class representation               |
|     - Never suppresses critical leakage findings if underpowered        |
|                                                                          |
|  3. Cluster Bootstrap Reproducibility:                                    |
|     - Patient-level cluster bootstrap with locked seed                   |
|     - Verification against claimed interval (claimed_auc_ci)             |
|                                                                          |
|  4. Domain Data Integrity & Leakage:                                     |
|     - Measures patient overlap across train/test splits                  |
|     - Bidirectional nuisance covariate check (max(a, 1-a))               |
|     - Prevents false-positive leakage on chance models                   |
|     - Out-of-sample warning on eval_on='all'                             |
|                                                                          |
|  5. Cryptographic Canonical Digest:                                      |
|     - Rounds floats to 6 decimals (eliminates BLAS/compiler jitter)      |
|     - Canonical JSON serialization                                       |
|     - input_sha256 + decision_sha256 + report_sha256                    |
+==========================================================================+
                                     |
                                     | Verified 'computed' report
                                     v
+--------------------------------------------------------------------------+
|               IMMUTABLE PUBLIC EVIDENCE LEDGER (lib/ledger.ts)           |
|                                                                          |
|  - Chained SHA-256 block hashing over ALL block payload fields           |
|  - verifyLedgerChain() recomputes every block hash and rejects edits     |
|  - Real ledger starts clean (empty); historical fixtures isolated        |
|  - Author responses cryptographically hashed and chained to verdicts     |
|  - Server-side only: the ledger store (SQLite) is never shipped to the  |
|    browser, and the browser never writes to it directly                 |
+--------------------------------------------------------------------------+
```

## Credential Boundary

There is exactly one operator secret. It authorises three kinds of client:

| Caller | Credential | Where it is checked |
|---|---|---|
| Service to service (e.g. the Concordance website) | `x-api-key` / `x-referee-key` / `Authorization: Bearer` | `lib/internal-auth.ts` (`requireOperator`) and `referee_core/api.py` (`_RefereeKeyMiddleware`) |
| Browser dashboard | HttpOnly session cookie | `middleware.ts` for pages, `requireOperator` for API calls |
| Health probe | none | `/api/health` and `/health` only |

Both the TypeScript layer and the Python core fail closed: in a production
build with no secret configured they answer `503` rather than serving an
unauthenticated engine. Development mode (`REFEREE_ENV=development`, or a
non-production `NODE_ENV` for the web layer) is the only way to run open, and
it has to be selected deliberately.

## Provenance Taxonomy

1. **`computed`**:
   Directly derived by running the deterministic measurement engine against an uploaded prediction table CSV. Only `computed` reports may be committed to the evidence ledger.

2. **`reference`**:
   Established external benchmark figures from verified peer-reviewed oncology literature (e.g., standard Clinical Cox or ElasticNet baselines from published multi-center cohorts). Used for contextual comparison; never substituted for data.

3. **`simulated`**:
   Exploratory heuristics or what-if projections used in offline demo mode. Always labeled with a visible amber banner in the UI and blocked from ledger commitment.
