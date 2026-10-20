"""Gap detector background job for Overlay365 Hypothesis Generation Layer."""
from __future__ import annotations

import json
from typing import List


def query_ledger_for_high_failures() -> List[str]:
    # Returns domains with high failure rates in the immutable ledger
    return ["neuro_oncology_pseudoprogression", "breast_pathology_lymph_node"]


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
    return gaps


def find_knowledge_gaps() -> List[str]:
    high_failure_domains = query_ledger_for_high_failures()
    cross_domain_gaps = find_untransferred_methodologies(high_failure_domains)
    return cross_domain_gaps


if __name__ == "__main__":
    gaps = find_knowledge_gaps()
    print(json.dumps(gaps, indent=2))
