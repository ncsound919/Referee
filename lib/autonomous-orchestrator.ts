/**
 * autonomous-orchestrator.ts
 *
 * Fully autonomous, self-running research and progressive experiment engine.
 *
 * Implements the complete closed-loop cycle:
 * 1. Progressive Research Question & Gap Selection (Phases 1 & 2)
 * 2. Grounded Hypothesis Generation & Adversarial Skeptic Screening
 * 3. Jevons Marginal Evidence Value (MEV) Gatekeeper
 * 4. Deterministic Pipeline Synthesis & Multi-Backend Compute Offload (Cloudflare / Kaggle / Local)
 * 5. Deterministic Audit & Immutable Ledger Anchoring
 * 6. Closed-Loop Self-Learning (Layer 2 Reflexion, Trajectory Promotion, Utility Decay)
 * 7. Progressive Advance & Next-Experiment Evolution
 */

import { getSystemStatus, setSystemStatus, SystemStatus } from './ledger';
import { AUTONOMOUS_RESEARCH_QUESTIONS, ResearchQuestion } from './research-questions';
import { generateHypothesis } from './hypothesis/generation';
import { runSkeptic } from './hypothesis/skeptic';
import { HypothesisRecord } from './hypothesis/types';
import { calculateMEV, MevEvaluationResult } from './mev';
import { executeAuditPipeline, AuditRunOutput } from './orchestrator';
import { SAMPLE_CLAIMS } from './sample-claims';
import { ClaimSpec, OncologyDomainTask, Principle } from './types';
import {
  retrieveActivePrinciples,
  addTrajectorySupportToPrinciple,
  applyUtilityDecay,
  updatePrincipleUtility,
  getExperienceStore,
} from './experience-base';
import { executeReflexionLoop } from './reflection';
import { offloadToCloudflareWorker, runKaggleKernel } from './integrations/offload';

export interface AutonomousIterationOutput {
  status: 'success' | 'skipped' | 'halted_by_mev' | 'rejected_by_skeptic' | 'error';
  iterationNumber: number;
  question: ResearchQuestion;
  hypothesis?: Partial<HypothesisRecord>;
  mev?: MevEvaluationResult;
  auditOutput?: AuditRunOutput;
  reflectionResult?: Record<string, unknown>;
  principlesLearned?: Principle[];
  promotedPrinciples?: string[];
  computeEngineUsed?: string;
  nextStepRecommendation?: string;
  timestamp: string;
  reason?: string;
}

export interface AutonomousState {
  systemStatus: SystemStatus;
  currentQuestionIndex: number;
  totalIterationsRun: number;
  successfulReproductions: number;
  reflectionsTriggered: number;
  activePrinciplesCount: number;
  recentHistory: AutonomousIterationOutput[];
  lastRunTimestamp?: string;
}

interface GlobalAutonomousState {
  currentQuestionIndex: number;
  totalIterationsRun: number;
  successfulReproductions: number;
  reflectionsTriggered: number;
  executionHistory: AutonomousIterationOutput[];
  runnerTimer: NodeJS.Timeout | null;
}

const g = globalThis as unknown as { __autonomousEngine?: GlobalAutonomousState };
if (!g.__autonomousEngine) {
  g.__autonomousEngine = {
    currentQuestionIndex: 0,
    totalIterationsRun: 0,
    successfulReproductions: 0,
    reflectionsTriggered: 0,
    executionHistory: [],
    runnerTimer: null,
  };
}
const engineStore = g.__autonomousEngine;

export function getAutonomousState(): AutonomousState {
  const activePrinciples = retrieveActivePrinciples();
  return {
    systemStatus: getSystemStatus(),
    currentQuestionIndex: engineStore.currentQuestionIndex,
    totalIterationsRun: engineStore.totalIterationsRun,
    successfulReproductions: engineStore.successfulReproductions,
    reflectionsTriggered: engineStore.reflectionsTriggered,
    activePrinciplesCount: activePrinciples.length,
    recentHistory: [...engineStore.executionHistory].slice(-10),
    lastRunTimestamp:
      engineStore.executionHistory.length > 0
        ? engineStore.executionHistory[engineStore.executionHistory.length - 1].timestamp
        : undefined,
  };
}

export function startAutonomousRunner(intervalMs: number = 30000): { started: boolean; intervalMs: number } {
  setSystemStatus('RUNNING');

  if (engineStore.runnerTimer) {
    clearInterval(engineStore.runnerTimer);
    engineStore.runnerTimer = null;
  }

  engineStore.runnerTimer = setInterval(async () => {
    try {
      if (getSystemStatus() === 'RUNNING') {
        await runAutonomousIteration();
      }
    } catch (err) {
      console.error('[autonomous-orchestrator] Background iteration error:', err);
    }
  }, intervalMs);

  return { started: true, intervalMs };
}

export function pauseAutonomousRunner(): { paused: boolean } {
  setSystemStatus('PAUSED');
  if (engineStore.runnerTimer) {
    clearInterval(engineStore.runnerTimer);
    engineStore.runnerTimer = null;
  }
  return { paused: true };
}

export function stopAutonomousRunner(): { stopped: boolean } {
  setSystemStatus('STOPPED');
  if (engineStore.runnerTimer) {
    clearInterval(engineStore.runnerTimer);
    engineStore.runnerTimer = null;
  }
  return { stopped: true };
}

/**
 * Execute a single progressive autonomous research cycle
 */
export async function runAutonomousIteration(options?: {
  forceQuestionId?: number;
  targetCompute?: 'local' | 'cloudflare' | 'kaggle';
  attemptNumber?: number;
}): Promise<AutonomousIterationOutput> {
  const status = getSystemStatus();
  if (status !== 'RUNNING') {
    return {
      status: 'skipped',
      iterationNumber: engineStore.totalIterationsRun,
      question: AUTONOMOUS_RESEARCH_QUESTIONS[0],
      reason: `System status is ${status}; set system status to RUNNING to proceed.`,
      timestamp: new Date().toISOString(),
    };
  }

  engineStore.totalIterationsRun++;
  const iterationNum = engineStore.totalIterationsRun;
  const timestamp = new Date().toISOString();

  // ── Step 1: Select Progressive Research Question ───────────────────────────
  let question: ResearchQuestion;
  if (options?.forceQuestionId) {
    question =
      AUTONOMOUS_RESEARCH_QUESTIONS.find((q) => q.id === options.forceQuestionId) ||
      AUTONOMOUS_RESEARCH_QUESTIONS[engineStore.currentQuestionIndex % AUTONOMOUS_RESEARCH_QUESTIONS.length];
  } else {
    question = AUTONOMOUS_RESEARCH_QUESTIONS[engineStore.currentQuestionIndex % AUTONOMOUS_RESEARCH_QUESTIONS.length];
    engineStore.currentQuestionIndex++;
  }

  // ── Step 2: Generate Grounded Hypothesis & Adversarial Review ───────────────
  const domain = question.domain;
  const activePrinciples = retrieveActivePrinciples(domain);
  const hypothesis = await generateHypothesis(question.hypothesis, domain);

  // Run adversarial skeptic check
  const skepticCritique = await runSkeptic(hypothesis);
  if (skepticCritique.isFlawed) {
    const skippedOutput: AutonomousIterationOutput = {
      status: 'rejected_by_skeptic',
      iterationNumber: iterationNum,
      question,
      hypothesis,
      reason: `Adversarial Skeptic rejected hypothesis: ${skepticCritique.critique}`,
      nextStepRecommendation: 'Re-ground hypothesis in validated literature DOIs before executing experiment.',
      timestamp,
    };
    engineStore.executionHistory.push(skippedOutput);
    return skippedOutput;
  }

  // ── Step 3: Jevons MEV Circuit Breaker Gatekeeper ───────────────────────────
  const proposedSkills = hypothesis.testablePipeline || [
    'split_by_patient_level',
    'combat_batch_harmonization',
    'run_statistical_referee',
  ];

  const attemptNumber = options?.attemptNumber || 1;
  const mevEvaluation = await calculateMEV(
    {
      domain,
      skills: proposedSkills,
      repairType: 'BASELINE_ALIGNMENT',
      description: question.title,
    },
    attemptNumber,
    null
  );

  if (mevEvaluation.decision === 'HALT') {
    const haltedOutput: AutonomousIterationOutput = {
      status: 'halted_by_mev',
      iterationNumber: iterationNum,
      question,
      hypothesis,
      mev: mevEvaluation,
      reason: `Jevons MEV circuit breaker tripped: MEV = ${mevEvaluation.mev.toFixed(3)} < 0.15 threshold. ${mevEvaluation.reason}`,
      nextStepRecommendation: 'Pivot research question to an unexplored biological domain to restore marginal evidence value.',
      timestamp,
    };
    engineStore.executionHistory.push(haltedOutput);
    return haltedOutput;
  }

  // ── Step 4: Progressive Compute Offload & Experiment Dispatch ───────────────
  let computeEngineUsed = 'local-deterministic';

  if (options?.targetCompute === 'cloudflare') {
    computeEngineUsed = 'cloudflare-workers';
    await offloadToCloudflareWorker({
      scriptName: 'truth-chain',
      payload: { questionId: question.id, hypothesis: hypothesis.claimText },
    });
  } else if (options?.targetCompute === 'kaggle') {
    computeEngineUsed = 'kaggle-cluster';
    await runKaggleKernel(`referee-q${question.id}-kernel`, {
      title: question.title,
      isGpu: true,
    });
  }

  // ── Step 5: Formulate Test Claim & Execute Deterministic Audit ───────────────
  // Find baseline claim spec or create grounded test spec
  const baseSpec =
    SAMPLE_CLAIMS[question.defaultClaimId] ||
    SAMPLE_CLAIMS.oct2026_bonemets;

  const testSpec: ClaimSpec = {
    ...JSON.parse(JSON.stringify(baseSpec)),
    claim_id: `auto_q${question.id}_iter${iterationNum}`,
    title: `[Autonomous Investigation Q#${question.id}] ${question.title}`,
    domain_task: question.domain as OncologyDomainTask,
    intended_use: 'research',
    user_role: 'academic',
  };

  const auditOutput = await executeAuditPipeline(testSpec);

  // ── Step 6: Closed-Loop Self-Learning & Experience Refinement ───────────────
  let reflectionResult: Record<string, unknown> | undefined;
  const newlyPromoted: string[] = [];

  const verdict = auditOutput.verdictRecord?.verdict || 'FAILS_BASELINE';

  if (verdict === 'REPRODUCED') {
    engineStore.successfulReproductions++;
    // Reinforce utility of principles that contributed to success
    for (const p of activePrinciples) {
      updatePrincipleUtility(p.principle_id, 0.05);
    }
  } else if (verdict === 'FAILS_BASELINE' || verdict === 'LEAKAGE_DETECTED') {
    engineStore.reflectionsTriggered++;
    // Layer 2 Reflexion fires on failure
    const reflexion = await executeReflexionLoop(
      testSpec,
      auditOutput.auditResults,
      verdict,
      []
    );
    reflectionResult = reflexion as unknown as Record<string, unknown>;

    // Promote candidate principles that now have 2 supporting trajectories
    const candidates = getExperienceStore().filter((p) => p.status === 'candidate');
    for (const cand of candidates) {
      const { newlyPromoted: isPromoted } = addTrajectorySupportToPrinciple(
        cand.principle_id,
        `trajectory_auto_iter_${iterationNum}`
      );
      if (isPromoted) {
        newlyPromoted.push(cand.principle_id);
      }
    }
  }

  // Apply periodic utility decay every 10 iterations to prune obsolete heuristics
  if (iterationNum % 10 === 0) {
    applyUtilityDecay(0.05);
  }

  const iterationOutput: AutonomousIterationOutput = {
    status: 'success',
    iterationNumber: iterationNum,
    question,
    hypothesis,
    mev: mevEvaluation,
    auditOutput,
    reflectionResult,
    promotedPrinciples: newlyPromoted,
    computeEngineUsed,
    nextStepRecommendation:
      verdict === 'REPRODUCED'
        ? `Hypothesis verified. Advance Phase to next high-entropy question (Q#${(question.id % 10) + 1}).`
        : `Failure reflected into experience base. Next cycle will apply learned principle to eliminate observed failure mode.`,
    timestamp,
  };

  engineStore.executionHistory.push(iterationOutput);
  return iterationOutput;
}
