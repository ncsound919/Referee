/**
 * baselines-all-domains.test.ts
 *
 * The baseline harness ships a locked, domain-specific reference set for every
 * oncology task the referee supports. The existing contract tests exercise the
 * breast transcriptomic set; this file walks every domain so that a domain whose
 * reference baselines were never executed cannot silently ship empty or wrong.
 *
 * The rules pinned here:
 *  - every domain has its own title, clinical reference and at least two
 *    baselines, all marked as reference provenance;
 *  - the reported "best baseline" is the strongest one for that domain;
 *  - `beaten_by_claim` is set per baseline and matches the claimed metric;
 *  - an unknown task falls back to the generic set instead of inventing one.
 */
import { describe, expect, test } from 'bun:test';

import { DOMAIN_BASELINES, runBaselineHarnessTool } from '../lib/baselines';
import type { ClaimSpec, OncologyDomainTask } from '../lib/types';

function claim(domainTask: OncologyDomainTask, value: number): ClaimSpec {
  return {
    claim_id: `clm_${domainTask}`,
    title: 'Domain baseline probe',
    authors: ['Test Author'],
    publication_reference: {},
    domain_task: domainTask,
    dataset_id: 'METABRIC',
    claimed_metric: { name: 'AUC', value, split_type: 'test' },
    split_description: 'patient-level 70/30',
    intended_use: 'research',
    user_role: 'academic',
    institutional_affiliation: 'Academic Institute',
    repository_url: 'https://github.com/example',
    missing_fields: [],
  };
}

const DOMAINS = Object.keys(DOMAIN_BASELINES) as OncologyDomainTask[];

describe('every supported domain has locked reference baselines', () => {
  test.each(DOMAINS)('%s runs and reports reference provenance', (domain) => {
    const result = runBaselineHarnessTool(claim(domain, 0.5));

    expect(result.domain_task).toBe(domain);
    expect(result.baselines.length).toBeGreaterThanOrEqual(2);
    expect(result.provenance).toBe('reference');
    expect(result.clinical_reference).toBe(DOMAIN_BASELINES[domain].clinical_reference);
    expect(result.why_fixed).toBe(DOMAIN_BASELINES[domain].why_fixed);
    for (const baseline of result.baselines) {
      expect(baseline.provenance).toBe('reference');
      expect(baseline.test_auc).toBeGreaterThan(0);
      expect(baseline.test_auc).toBeLessThanOrEqual(1);
      expect(baseline.model_name.length).toBeGreaterThan(0);
    }
  });

  test.each(DOMAINS)('%s names the strongest baseline as the best one', (domain) => {
    const result = runBaselineHarnessTool(claim(domain, 0.5));
    const strongest = Math.max(...result.baselines.map((b) => b.test_auc));

    expect(result.best_baseline_auc).toBe(strongest);
    const best = result.baselines.find((b) => b.model_name === result.best_baseline_name);
    expect(best?.test_auc).toBe(strongest);
  });

  test.each(DOMAINS)('%s flags each baseline the claim does and does not beat', (domain) => {
    const below = runBaselineHarnessTool(claim(domain, 0.01));
    expect(below.claim_beats_baselines).toBe(false);
    expect(below.baselines.every((b) => b.beaten_by_claim === false)).toBe(true);
    expect(below.margin).toBeLessThan(0);

    const above = runBaselineHarnessTool(claim(domain, 0.999));
    expect(above.claim_beats_baselines).toBe(true);
    expect(above.baselines.every((b) => b.beaten_by_claim === true)).toBe(true);
    expect(above.margin).toBeGreaterThan(0);
  });

  test('the margin is the claim minus the best baseline, rounded to four places', () => {
    const result = runBaselineHarnessTool(claim('other', 0.7));
    expect(result.margin).toBe(Number((0.7 - result.best_baseline_auc).toFixed(4)));
  });

  test('a task with no locked set falls back to the generic baselines', () => {
    const result = runBaselineHarnessTool(claim('not_a_real_task' as OncologyDomainTask, 0.8));
    const generic = DOMAIN_BASELINES.other.getBaselines(claim('other', 0.8));

    expect(result.baselines.map((b) => b.model_name)).toEqual(generic.map((b) => b.model_name));
    expect(result.clinical_reference).toBe(DOMAIN_BASELINES.other.clinical_reference);
    expect(result.best_baseline_auc).toBe(generic[1].test_auc);
  });
});
