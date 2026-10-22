/**
 * hypothesis-skeptic.test.ts
 *
 * The skeptic is the adversarial check on a generated hypothesis. It must be
 * able to reject a hypothesis for three distinct reasons, and it must not
 * invent a rejection it cannot justify.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { runSkeptic } from './hypothesis/skeptic';
import { MOCK_PAPER_CLAIMS, VALID_SKILLS_LIST } from './hypothesis/types';

const GOOD_GROUNDING = MOCK_PAPER_CLAIMS.map((p) => p.doi);

test('a well-formed hypothesis passes the adversarial review', async () => {
  const result = await runSkeptic({
    groundingSources: [GOOD_GROUNDING[0]],
    testablePipeline: ['split_by_patient_level'],
    falsification: 'The claim fails if the held-out AUC is below 0.70.',
  });
  assert.equal(result.isFlawed, false);
  assert.equal(result.flawType, 'NONE');
  assert.ok(result.critique.length > 0);
});

test('an unverifiable grounding source is rejected', async () => {
  const result = await runSkeptic({
    groundingSources: ['10.0000/does-not-exist'],
    testablePipeline: ['split_by_patient_level'],
    falsification: 'The claim fails if the held-out AUC is below 0.70.',
  });
  assert.equal(result.isFlawed, true);
  assert.equal(result.flawType, 'GROUNDING_FALSE');
});

test('one bad grounding source among good ones is still rejected', async () => {
  const result = await runSkeptic({
    groundingSources: [GOOD_GROUNDING[0], '10.0000/fabricated'],
    testablePipeline: ['split_by_patient_level'],
    falsification: 'The claim fails if the held-out AUC is below 0.70.',
  });
  assert.equal(result.isFlawed, true);
  assert.equal(result.flawType, 'GROUNDING_FALSE');
});

test('an unknown skill in the pipeline is rejected', async () => {
  const result = await runSkeptic({
    groundingSources: [GOOD_GROUNDING[0]],
    testablePipeline: ['split_by_patient_level', 'summarise_with_a_language_model'],
    falsification: 'The claim fails if the held-out AUC is below 0.70.',
  });
  assert.equal(result.isFlawed, true);
  assert.equal(result.flawType, 'PIPELINE_INVALID');
});

test('a missing falsification criterion is rejected', async () => {
  const result = await runSkeptic({
    groundingSources: [GOOD_GROUNDING[0]],
    testablePipeline: ['split_by_patient_level'],
    falsification: '',
  });
  assert.equal(result.isFlawed, true);
  assert.equal(result.flawType, 'FALSIFICATION_WEAK');
});

test('a trivially short falsification criterion is rejected', async () => {
  const result = await runSkeptic({
    groundingSources: [GOOD_GROUNDING[0]],
    testablePipeline: ['split_by_patient_level'],
    falsification: 'wrong',
  });
  assert.equal(result.isFlawed, true);
  assert.equal(result.flawType, 'FALSIFICATION_WEAK');
});

test('the grounding check runs before the pipeline check', async () => {
  const result = await runSkeptic({
    groundingSources: ['10.0000/fabricated'],
    testablePipeline: ['also_fabricated'],
    falsification: '',
  });
  assert.equal(result.flawType, 'GROUNDING_FALSE');
});

test('every skill in the library is one the skeptic accepts', () => {
  for (const skill of VALID_SKILLS_LIST) {
    assert.ok(skill.length > 0);
  }
  assert.equal(new Set(VALID_SKILLS_LIST).size, VALID_SKILLS_LIST.length);
});
