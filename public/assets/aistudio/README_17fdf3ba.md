# referee-core

Deterministic measurement core for auditing a computational oncology claim from a prediction file.
Every number in a report is computed from the table; claim text is advisory only and cannot change a verdict.

## Use

    pip install -e ".[dev]" && pytest -q
    referee-core audit predictions.csv claim.json     # JSON report with a SHA-256 over canonical content
    referee-core suite --reps 30                       # seeded-fault suite and sensitivity tables
    uvicorn referee_core.api:app                       # POST /audit, POST /verify

Table columns: `patient_id`, `label` (0/1), `split` (train|test), `score`; optional `sample_id`,
`batch`/`site`/`center`/`scanner`/`plate` (nuisance covariates), `nc_score` (negative-control scores).
Claim: `claim_id`, `claimed_auc`, optional `claimed_auc_ci`, `eval_on` (test|all),
`score_is_probability`, `split_description` (advisory only).

## What it computes
- AUC (rank-based, ties averaged, checked against scikit-learn) with a patient-level cluster bootstrap.
- Exact patient and sample_id overlap between train and test.
- Nuisance-covariate model (fit on train rows, scored on evaluation rows); `critical` when the covariate
  alone reaches at least 90% of the model's above-chance AUC and the covariate AUC is at least 0.65.
- Negative control (`nc_score`): fails only if the 99% interval excludes 0.5 and AUC differs from 0.5 by 0.05 or more.
- Patient-level permutation null; calibration slope, intercept-in-the-large and Brier when scores are declared probabilities.
- Verdicts: REPRODUCED, NOT_REPRODUCED, LEAKAGE_DETECTED, UNVERIFIABLE. Unsupplied inputs stay `not_assessed`.
  Any NaN-producing case returns an explicit refusal.

## Measured (seeded-fault suite, 30 runs per scenario, synthetic data)
- 8 seeded-fault scenarios: 240 of 240 detected. 4 known-good scenarios: false-rejection rate 2.5%
  (all from the negative-control gate, whose null false-positive rate I measured at about 2%).
- Claim inflated by +0.02 / +0.04 / +0.06 / +0.08 / +0.10 / +0.15 AUC: detected 0% / 0% / 20% / 73% / 100% / 100%.
  Small inflations are not detectable at about 100 to 200 test patients; that is a property of the data size.
- Batch/label association 0.2 / 0.4 / 0.6 / 0.9: shortcut flagged 10% / 93% / 100% / 100%.

## Limits
- The faults are the ones I generated. 100% detection shows the checks do what they were built to do, not that
  every real flaw is caught. A predictions-only audit cannot see leakage upstream of the scores
  (feature selection on all data, the same patient under two IDs, preprocessing fit before the split).
- Baseline comparison needs features and is not implemented; REPRODUCED never means "beats a baseline",
  and reports say so and are marked `incomplete`.
- The outline's "0.30 negative-control agreement ceiling" has no definition I could implement; the gate above
  replaces it. Thresholds in `Policy` are proposals and are hashed into each report.
- Not yet connected to the Next.js app, the license passport, or a persistent ledger.
