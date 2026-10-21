"""Gap detector background job for Overlay365 Hypothesis Generation Layer."""
from __future__ import annotations

import json
from typing import List, Optional


def query_ledger_for_high_failures(ledger_records: Optional[List[dict]] = None) -> List[str]:
    """Queries ledger records for domains exhibiting high failure rates."""
    if not ledger_records:
        return []

    domain_counts: dict[str, int] = {}
    failure_counts: dict[str, int] = {}

    for record in ledger_records:
        domain = record.get("domain_task", "other")
        domain_counts[domain] = domain_counts.get(domain, 0) + 1
        verdict = record.get("verdict", "")
        if verdict in ("FAILS_BASELINE", "LEAKAGE_DETECTED", "NOT_REPRODUCED"):
            failure_counts[domain] = failure_counts.get(domain, 0) + 1

    high_failures = []
    for domain, count in domain_counts.items():
        if count > 0 and (failure_counts.get(domain, 0) / count) >= 0.5:
            high_failures.append(domain)

    return high_failures


def find_untransferred_methodologies(high_failure_domains: List[str]) -> List[str]:
    gaps = []
    for domain in high_failure_domains:
        if domain == "neuro_oncology_pseudoprogression":
            gaps.append(
                "Cross-domain gap: ComBat multi-vendor scanner harmonization successfully used in breast cancer is absent in neuro-oncology MRI radiomic pipelines."
            )
        elif domain == "breast_pathology_lymph_node":
            gaps.append(
                "Cross-domain gap: Strict GroupKFold patient-level grouping is missing from multi-center patch classifiers."
            )
        else:
            gaps.append(f"Cross-domain gap: Domain '{domain}' requires methodological audit of leakage resistance and baselines.")
    return gaps


def find_knowledge_gaps(ledger_records: Optional[List[dict]] = None) -> List[str]:
    high_failure_domains = query_ledger_for_high_failures(ledger_records)
    cross_domain_gaps = find_untransferred_methodologies(high_failure_domains)
    return cross_domain_gaps


if __name__ == "__main__":
    gaps = find_knowledge_gaps()
    print(json.dumps(gaps, indent=2))
