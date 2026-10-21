import { expect, test, describe } from 'bun:test';
import {
  runAutonomousIteration,
  getAutonomousState,
  startAutonomousRunner,
  stopAutonomousRunner,
} from '../lib/autonomous-orchestrator';
import { setSystemStatus } from '../lib/ledger';
import { GET as autoGet, POST as autoPost } from '../app/api/autonomous/run/route';
import { getExperienceStore, retrieveActivePrinciples, addTrajectorySupportToPrinciple } from '../lib/experience-base';

describe('Autonomous Self-Running & Progressive Experimentation System', () => {
  test('Autonomous state returns initial baseline telemetry', () => {
    const state = getAutonomousState();
    expect(state).toBeDefined();
    expect(state.currentQuestionIndex).toBeGreaterThanOrEqual(0);
    expect(typeof state.totalIterationsRun).toBe('number');
    expect(Array.isArray(state.recentHistory)).toBe(true);
  });

  test('Autonomous iteration skips cleanly when system is STOPPED', async () => {
    setSystemStatus('STOPPED');
    const result = await runAutonomousIteration();
    expect(result.status).toBe('skipped');
    expect(String(result.reason)).toContain('STOPPED');
  });

  test('Autonomous iteration executes full closed-loop cycle when RUNNING', async () => {
    setSystemStatus('RUNNING');
    const result = await runAutonomousIteration({ forceQuestionId: 1 });

    expect(result.status).toBe('success');
    expect(result.iterationNumber).toBeGreaterThanOrEqual(1);
    expect(result.question).toBeDefined();
    expect(result.question.id).toBe(1);
    expect(result.hypothesis).toBeDefined();
    expect(result.mev).toBeDefined();
    expect(result.auditOutput).toBeDefined();
    expect(result.auditOutput?.auditResults).toBeDefined();
    expect(result.nextStepRecommendation).toBeDefined();
  });

  test('Closed-loop self-learning promotes candidate principles with 2 trajectories', () => {
    // Check candidate principle bp_cand_031
    const all = getExperienceStore();
    const cand = all.find((p) => p.principle_id === 'bp_cand_031');
    expect(cand).toBeDefined();

    // Add trajectory support
    const res = addTrajectorySupportToPrinciple('bp_cand_031', 'traj_autonomous_test_01');
    expect(res.principle).toBeDefined();

    // Verify it is now retrievable in active principles
    const active = retrieveActivePrinciples('breast_transcriptomic_metastasis');
    expect(active.some((p) => p.principle_id === 'bp_cand_031')).toBe(true);
  });

  test('Autonomous iteration supports targeting Cloudflare compute backend', async () => {
    setSystemStatus('RUNNING');
    const result = await runAutonomousIteration({
      forceQuestionId: 2,
      targetCompute: 'cloudflare',
    });

    expect(result.status).toBe('success');
    expect(result.computeEngineUsed).toBe('cloudflare-workers');
    expect(result.question.id).toBe(2);
  });

  test('Autonomous iteration supports targeting Kaggle cluster compute backend', async () => {
    setSystemStatus('RUNNING');
    const result = await runAutonomousIteration({
      forceQuestionId: 3,
      targetCompute: 'kaggle',
    });

    expect(result.status).toBe('success');
    expect(result.computeEngineUsed).toBe('kaggle-cluster');
    expect(result.question.id).toBe(3);
  });

  test('Autonomous runner daemon can be started and stopped', () => {
    const startRes = startAutonomousRunner(60000);
    expect(startRes.started).toBe(true);
    expect(startRes.intervalMs).toBe(60000);

    const stopRes = stopAutonomousRunner();
    expect(stopRes.stopped).toBe(true);
  });

  test('GET /api/autonomous/run returns telemetry status', async () => {
    const res = await autoGet();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.totalIterationsRun).toBeDefined();
    expect(body.activePrinciplesCount).toBeGreaterThanOrEqual(1);
    expect(body.recentHistory).toBeDefined();
  });

  test('POST /api/autonomous/run executes progressive iteration step', async () => {
    const req = new Request('http://localhost/api/autonomous/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'step', forceQuestionId: 4 }),
    });

    const res = await autoPost(req as any);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.question.id).toBe(4);
    expect(body.auditOutput).toBeDefined();
  });

  test('POST /api/autonomous/run controls runner lifecycle (start/stop/status)', async () => {
    // Status action
    const reqStatus = new Request('http://localhost/api/autonomous/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    const resStatus = await autoPost(reqStatus as any);
    expect(resStatus.status).toBe(200);

    // Start action
    const reqStart = new Request('http://localhost/api/autonomous/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', intervalMs: 90000 }),
    });
    const resStart = await autoPost(reqStart as any);
    expect(resStart.status).toBe(200);
    const bodyStart = await resStart.json();
    expect(bodyStart.status).toBe('started');

    // Stop action
    const reqStop = new Request('http://localhost/api/autonomous/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    const resStop = await autoPost(reqStop as any);
    expect(resStop.status).toBe(200);
    const bodyStop = await resStop.json();
    expect(bodyStop.status).toBe('stopped');
  });
});
