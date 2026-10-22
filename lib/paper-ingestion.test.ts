/**
 * paper-ingestion.test.ts
 *
 * The ingested-paper store. It is pinned to `globalThis` so it survives a hot
 * reload, which means the tests have to be careful about what they leave
 * behind.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addIngestedPaper,
  getAllIngestedPapers,
  updatePaperStatus,
  type IngestedPaper,
} from './paper-ingestion';

function makePaper(overrides: Partial<IngestedPaper> = {}): IngestedPaper {
  return {
    id: 'paper_test_001',
    doi: '10.0000/test-001',
    title: 'A test paper',
    authors: ['A. Tester'],
    journal: 'Journal of Tests',
    year: 2026,
    abstract: 'An abstract.',
    domain: 'breast_cancer',
    questionId: 999,
    questionCode: 'TEST-999',
    extractedClaim: {
      claimId: 'claim_test_001',
      metricName: 'AUC',
      claimedValue: 0.8,
      datasetId: 'TCGA-BRCA',
      splitDescription: 'random',
      sampleSize: 100,
    },
    ingestedAt: new Date().toISOString(),
    status: 'QUEUED',
    ...overrides,
  };
}

test('the store starts with seeded papers', () => {
  const papers = getAllIngestedPapers();
  assert.ok(papers.length >= 3);
  for (const paper of papers) {
    assert.ok(paper.id.length > 0);
    assert.ok(paper.extractedClaim.claimId.length > 0);
  }
});

test('getAllIngestedPapers returns a copy, not the live array', () => {
  const first = getAllIngestedPapers();
  first.pop();
  assert.equal(getAllIngestedPapers().length, first.length + 1);
});

test('a new paper is added to the front of the store', () => {
  const before = getAllIngestedPapers().length;
  const paper = makePaper({ id: 'paper_new_001', doi: '10.0000/new-001' });
  addIngestedPaper(paper);
  const after = getAllIngestedPapers();
  assert.equal(after.length, before + 1);
  assert.equal(after[0].id, 'paper_new_001');
});

test('adding the same id again updates rather than duplicates', () => {
  const paper = makePaper({ id: 'paper_dupe_001', doi: '10.0000/dupe-001' });
  addIngestedPaper(paper);
  const afterFirst = getAllIngestedPapers().length;
  addIngestedPaper({ ...paper, title: 'A corrected title' });
  const afterSecond = getAllIngestedPapers();
  assert.equal(afterSecond.length, afterFirst, 'a duplicate id must not grow the store');
  const found = afterSecond.find((p) => p.id === 'paper_dupe_001');
  assert.equal(found?.title, 'A corrected title');
});

test('adding the same doi under a new id also updates rather than duplicates', () => {
  const paper = makePaper({ id: 'paper_doi_001', doi: '10.0000/doi-shared' });
  addIngestedPaper(paper);
  const afterFirst = getAllIngestedPapers().length;
  addIngestedPaper(makePaper({ id: 'paper_doi_002', doi: '10.0000/doi-shared' }));
  const afterSecond = getAllIngestedPapers();
  assert.equal(afterSecond.length, afterFirst, 'a duplicate doi must not grow the store');
});

test('a paper status can be updated', () => {
  const paper = makePaper({ id: 'paper_status_001', doi: '10.0000/status-001' });
  addIngestedPaper(paper);
  updatePaperStatus('paper_status_001', 'ANALYZING');
  const found = getAllIngestedPapers().find((p) => p.id === 'paper_status_001');
  assert.equal(found?.status, 'ANALYZING');
});

test('a status update can attach experiment details and a resolution', () => {
  const paper = makePaper({ id: 'paper_details_001', doi: '10.0000/details-001' });
  addIngestedPaper(paper);
  updatePaperStatus(
    'paper_details_001',
    'RESOLVED',
    {
      experimentId: 'exp_1',
      computeBackend: 'local-deterministic',
      modelsTested: ['GLMNET'],
      leakageChecks: ['Patient overlap'],
      executedAt: new Date().toISOString(),
    },
    {
      verdict: 'LEAKAGE_DETECTED',
      gatePassed: false,
      resolutionNotes: 'Patient overlap found.',
      resolvedAt: new Date().toISOString(),
    }
  );
  const found = getAllIngestedPapers().find((p) => p.id === 'paper_details_001');
  assert.equal(found?.status, 'RESOLVED');
  assert.equal(found?.experimentDetails?.experimentId, 'exp_1');
  assert.equal(found?.auditResolution?.verdict, 'LEAKAGE_DETECTED');
  assert.equal(found?.auditResolution?.gatePassed, false);
});

test('updating a paper that does not exist is a no-op', () => {
  const before = getAllIngestedPapers().length;
  updatePaperStatus('paper_does_not_exist', 'REJECTED');
  assert.equal(getAllIngestedPapers().length, before);
});
