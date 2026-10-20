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
