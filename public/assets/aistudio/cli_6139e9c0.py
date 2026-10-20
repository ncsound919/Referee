"""referee-core audit data.csv claim.json [--policy policy.json] | suite"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .audit import audit_csv
from .faults import run_suite, sensitivity_to_batch_shortcut, sensitivity_to_inflation
from .schema import ClaimSpec, Policy


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="referee-core")
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("audit")
    a.add_argument("csv")
    a.add_argument("claim")
    a.add_argument("--policy")
    s = sub.add_parser("suite")
    s.add_argument("--reps", type=int, default=30)
    args = ap.parse_args(argv)
    if args.cmd == "audit":
        claim = ClaimSpec(**json.loads(Path(args.claim).read_text()))
        policy = Policy(**json.loads(Path(args.policy).read_text())) if args.policy else None
        print(json.dumps(audit_csv(Path(args.csv).read_text(), claim, policy), indent=2))
    else:
        res = run_suite(args.reps)
        for r in res["rows"]:
            print(f"{r['scenario']:36s} expected {r['expected']:17s} {r['correct']}/{r['runs']}  {r['verdicts']}")
        print(f"detection rate {res['detection_rate']:.3f}   false rejection rate {res['false_rejection_rate']:.3f}")
        for r in sensitivity_to_inflation(reps=args.reps):
            print(f"claim inflated by {r['inflation']:.2f}: detected {r['detection_rate']:.0%}")
        for r in sensitivity_to_batch_shortcut(reps=args.reps):
            print(f"batch/label association {r['batch_label_association']}: flagged {r['flagged_rate']:.0%} {r['verdicts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
