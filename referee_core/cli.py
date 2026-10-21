"""referee-core audit data.csv claim.json [--policy policy.json] | suite"""
from __future__ import annotations

import json
from pathlib import Path

import typer

from .audit import audit_csv
from .faults import run_suite, sensitivity_to_batch_shortcut, sensitivity_to_inflation
from .schema import ClaimSpec, Policy

app = typer.Typer(help="referee-core deterministic audit CLI")


@app.command()
def audit(csv: Path, claim: Path, policy: Path | None = None) -> None:
    """Run a single audit on a prediction CSV + claim spec."""
    claim_obj = ClaimSpec(**json.loads(claim.read_text()))
    policy_obj = Policy(**json.loads(policy.read_text())) if policy else None
    typer.echo(json.dumps(audit_csv(csv.read_text(), claim_obj, policy_obj), indent=2))


@app.command()
def suite(reps: int = 30) -> None:
    """Run the seeded-fault suite."""
    res = run_suite(reps)
    for r in res["rows"]:
        typer.echo(f"{r['scenario']:36s} expected {r['expected']:17s} {r['correct']}/{r['runs']}  {r['verdicts']}")
    typer.echo(f"detection rate {res['detection_rate']:.3f}   false rejection rate {res['false_rejection_rate']:.3f}")
    for r in sensitivity_to_inflation(reps=reps):
        typer.echo(f"claim inflated by {r['inflation']:.2f}: detected {r['detection_rate']:.0%}")
    for r in sensitivity_to_batch_shortcut(reps=reps):
        typer.echo(f"batch/label association {r['batch_label_association']}: flagged {r['flagged_rate']:.0%} {r['verdicts']}")


def main(argv=None) -> int:
    try:
        app(args=argv, standalone_mode=False)
    except SystemExit as exc:
        return int(exc.code) if exc.code is not None else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())