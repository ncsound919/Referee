'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { ClaimEntrySection } from '@/components/ClaimEntrySection';
import { PipelineExecutionTrace } from '@/components/PipelineExecutionTrace';
import { VerdictDisplay } from '@/components/VerdictDisplay';
import { BaselineComparisonChart } from '@/components/BaselineComparisonChart';
import { StatisticalRefereeView } from '@/components/StatisticalRefereeView';
import { LeakageBreakdownView } from '@/components/LeakageBreakdownView';
import { RecursiveRepairView } from '@/components/RecursiveRepairView';
import { LedgerExplorerView } from '@/components/LedgerExplorerView';
import { LicenseMatrixView } from '@/components/LicenseMatrixView';
import { SelfLearningDashboard } from '@/components/SelfLearningDashboard';
import { ResearchQuestionsView } from '@/components/ResearchQuestionsView';
import { HypothesisTournamentView } from '@/components/HypothesisTournamentView';
import { IngestionControlView } from '@/components/IngestionControlView';
import { TumorTwinControlView } from '@/components/TumorTwinControlView';
import {
  ClaimSpec,
  AuditResults,
  VerdictRecord,
  OrchestrationLogStep,
  RecursiveRepairIteration,
  Principle,
  HarnessEntry,
  SystemStatus,
} from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import {
  ShieldAlert,
  Cpu,
  Database,
  Layers,
  Lock,
  Sparkles,
  Info,
  CheckCircle2,
  FileText,
  AlertTriangle,
} from 'lucide-react';

/**
 * Shape returned by `POST /api/demo/pipeline`.
 *
 * The demo pipeline runs on the server. It used to run inside this browser
 * bundle, which put the evidence ledger (and its `node:sqlite` store) into the
 * client build and let a browser fabricate a verdict locally.
 */
interface DemoPipelineOutput {
  success: boolean;
  terminalMessage: string;
  auditResults: AuditResults;
  verdictRecord?: VerdictRecord;
  logSteps: OrchestrationLogStep[];
  toolCallCount: number;
}

/** POST JSON and return the parsed body, or null on any failure. */
async function postJson(url: string, body: unknown): Promise<unknown> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

/** Run the simulated demo pipeline on the server. */
async function runDemoPipeline(spec: ClaimSpec): Promise<DemoPipelineOutput | null> {
  const data = await postJson('/api/demo/pipeline', { claim_spec: spec });
  return (data as DemoPipelineOutput | null) ?? null;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('audit');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentClaimSpec, setCurrentClaimSpec] = useState<ClaimSpec>(
    SAMPLE_CLAIMS.oct2026_bonemets
  );
  const [auditResults, setAuditResults] = useState<AuditResults | null>(null);
  const [verdictRecord, setVerdictRecord] = useState<VerdictRecord | null>(null);
  const [logSteps, setLogSteps] = useState<OrchestrationLogStep[]>([]);
  const [toolCallCount, setToolCallCount] = useState<number>(4);

  // Ledger state
  const [ledgerRecords, setLedgerRecords] = useState<VerdictRecord[]>([]);

  // Self-Learning state (Experience Base & Harness Library)
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [harnesses, setHarnesses] = useState<HarnessEntry[]>([]);

  // Recursive Repair state
  const [repairIterations, setRepairIterations] = useState<RecursiveRepairIteration[]>([]);
  const [repairFinalRecord, setRepairFinalRecord] = useState<VerdictRecord | undefined>(undefined);
  const [isRepairLoading, setIsRepairLoading] = useState<boolean>(false);
  const [systemStatus, setLocalSystemStatus] = useState<SystemStatus>('STOPPED');
  const [currentActivity, setCurrentActivity] = useState<string>('');
  const [currentPhase, setCurrentPhase] = useState<string>('IDLE');

  // Poll autonomous state periodically so top bar reflects live activities
  useEffect(() => {
    async function pollAutonomous() {
      try {
        const res = await fetch('/api/autonomous/run');
        if (res.ok) {
          const data = await res.json();
          if (data.systemStatus) setLocalSystemStatus(data.systemStatus);
          if (data.currentActivity) setCurrentActivity(data.currentActivity);
          if (data.currentPhase) setCurrentPhase(data.currentPhase);
        }
      } catch {}
    }
    pollAutonomous();
    const interval = setInterval(pollAutonomous, 2500);
    return () => clearInterval(interval);
  }, []);

  /** Reload the evidence ledger from the server. */
  const refreshLedger = async () => {
    try {
      const res = await fetch('/api/ledger');
      if (!res.ok) return;
      const data = (await res.json()) as { ledger?: VerdictRecord[] };
      setLedgerRecords(data.ledger ?? []);
    } catch {
      /* keep the last known state */
    }
  };

  /** Reload the experience base from the server. */
  const refreshExperience = async () => {
    try {
      const res = await fetch('/api/experience');
      if (!res.ok) return;
      const data = (await res.json()) as { principles?: Principle[] };
      setPrinciples(data.principles ?? []);
    } catch {
      /* keep the last known state */
    }
  };

  /** Reload the harness library from the server. */
  const refreshHarnesses = async () => {
    try {
      const res = await fetch('/api/harness');
      if (!res.ok) return;
      const data = (await res.json()) as { harnesses?: HarnessEntry[] };
      setHarnesses(data.harnesses ?? []);
    } catch {
      /* keep the last known state */
    }
  };

  // Initialize with the landmark October 2026 Bone Mets claim audit on first render
  useEffect(() => {
    async function init() {
      await Promise.all([refreshLedger(), refreshExperience(), refreshHarnesses()]);

      // Execute initial audit for demo
      const initialRun = await runDemoPipeline(SAMPLE_CLAIMS.oct2026_bonemets);
      if (initialRun) {
        setAuditResults(initialRun.auditResults);
        if (initialRun.verdictRecord) {
          setVerdictRecord(initialRun.verdictRecord);
        }
        setLogSteps(initialRun.logSteps);
        setToolCallCount(initialRun.toolCallCount);
      }
    }
    init();
  }, []);

  const handleDecayUtility = async () => {
    await postJson('/api/experience', { action: 'decay', decay_rate: 0.1 });
    await refreshExperience();
  };

  const handlePromoteCandidate = async (principleId: string) => {
    await postJson('/api/experience', {
      action: 'support_trajectory',
      principle_id: principleId,
      trajectory_id: `audit_independent_${Date.now()}`,
    });
    await refreshExperience();
  };

  const handleValidateHarness = async (harnessId: string) => {
    await postJson('/api/harness', { action: 'validate_held_out', harness_id: harnessId });
    await refreshHarnesses();
  };

  const handleStartAudit = async (spec: ClaimSpec) => {
    setIsLoading(true);
    setCurrentClaimSpec(spec);

    try {
      const output = await runDemoPipeline(spec);
      if (output) {
        setAuditResults(output.auditResults);
        if (output.verdictRecord) {
          setVerdictRecord(output.verdictRecord);
        }
        setLogSteps(output.logSteps);
        setToolCallCount(output.toolCallCount);
      }

      // Update ledger records
      await refreshLedger();
    } catch (err: unknown) {
      console.error('Audit run error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunRepair = async (
    spec: ClaimSpec,
    maxIterations: number,
    options?: {
      forceDuplicatePipeline?: boolean;
      forceHighComputeGnn?: boolean;
    }
  ) => {
    setIsRepairLoading(true);
    try {
      const res = await postJson('/api/recursive-repair', {
        claim_spec: spec,
        max_iterations: maxIterations,
        ...(options ?? {}),
      });
      if (res) {
        const payload = res as {
          iterations?: RecursiveRepairIteration[];
          finalVerdictRecord?: VerdictRecord;
        };
        setRepairIterations(payload.iterations ?? []);
        setRepairFinalRecord(payload.finalVerdictRecord);
      }
      await refreshLedger();
      await refreshExperience();
    } catch (err) {
      console.error('Repair loop error:', err);
    } finally {
      setIsRepairLoading(false);
    }
  };

  const handleAddAuthorResponse = async (
    verdictId: string,
    authorName: string,
    text: string
  ): Promise<boolean> => {
    const res = await postJson('/api/ledger', {
      verdict_id: verdictId,
      author_name: authorName,
      response_text: text,
    });
    if (!res) return false;

    const response = (res as { response?: VerdictRecord['author_responses'][number] }).response;
    await refreshLedger();
    if (response && verdictRecord && verdictRecord.verdict_id === verdictId) {
      setVerdictRecord({
        ...verdictRecord,
        author_responses: [...(verdictRecord.author_responses || []), response],
      });
    }
    return Boolean(response);
  };

  const handleVerifyChain = async (): Promise<{ isValid: boolean; verifiedBlocks: number }> => {
    try {
      const res = await fetch('/api/ledger?verify=true');
      if (!res.ok) return { isValid: false, verifiedBlocks: 0 };
      const data = (await res.json()) as { isValid?: boolean; verifiedBlocks?: number };
      return { isValid: Boolean(data.isValid), verifiedBlocks: data.verifiedBlocks ?? 0 };
    } catch {
      return { isValid: false, verifiedBlocks: 0 };
    }
  };

  const handleRunAuditForQuestion = (claim: ClaimSpec) => {
    setActiveTab('audit');
    handleStartAudit(claim);
  };

  const handleRunAuditWithHypothesis = (claimText: string, domain: string) => {
    setActiveTab('audit');
    const customClaim: ClaimSpec = {
      ...currentClaimSpec,
      domain_task: domain as any,
      title: `[Hypothesis Tournament]: ${claimText.slice(0, 50)}...`,
      raw_claim_text: claimText,
    };
    handleStartAudit(customClaim);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        blockCount={ledgerRecords.length}
      />

      {/* Autonomous System Control Bar */}
      <div className="bg-slate-900 border-b border-slate-800 p-2.5 flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center space-x-2 mr-2">
          <span
            className={`w-2 h-2 rounded-full ${
              systemStatus === 'RUNNING'
                ? 'bg-emerald-400 animate-pulse'
                : systemStatus === 'PAUSED'
                ? 'bg-amber-400'
                : 'bg-rose-500'
            }`}
          />
          <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
            Autonomous Engine:
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
              systemStatus === 'RUNNING'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : systemStatus === 'PAUSED'
                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}
          >
            {systemStatus}
          </span>
        </div>
        <button
          onClick={async () => {
            setLocalSystemStatus('RUNNING');
            try {
              await fetch('/api/autonomous/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' }),
              });
            } catch {}
          }}
          className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold cursor-pointer shadow-sm transition-colors ${
            systemStatus === 'RUNNING'
              ? 'bg-emerald-500 text-white ring-2 ring-emerald-400'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          START DAEMON
        </button>
        <button 
          onClick={async () => {
            setLocalSystemStatus('PAUSED');
            try {
              await fetch('/api/autonomous/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'pause' }),
              });
            } catch {}
          }}
          className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold cursor-pointer shadow-sm transition-colors ${
            systemStatus === 'PAUSED'
              ? 'bg-amber-500 text-white ring-2 ring-amber-400'
              : 'bg-amber-600 hover:bg-amber-500 text-white'
          }`}
        >
          PAUSE
        </button>
        <button 
          onClick={async () => {
            setLocalSystemStatus('STOPPED');
            try {
              await fetch('/api/autonomous/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop' }),
              });
            } catch {}
          }}
          className={`px-3 py-1.5 rounded-lg font-mono text-xs font-semibold cursor-pointer shadow-sm transition-colors ${
            systemStatus === 'STOPPED'
              ? 'bg-rose-700 text-white ring-2 ring-rose-400'
              : 'bg-rose-600 hover:bg-rose-500 text-white'
          }`}
        >
          STOP
        </button>
        <button
          onClick={() => setActiveTab('learning')}
          className="px-3 py-1.5 rounded-lg bg-indigo-950/70 border border-indigo-700/60 hover:bg-indigo-900/80 text-indigo-300 font-mono text-xs cursor-pointer transition-colors"
        >
          Open Autonomous Closed-Loop Console →
        </button>

        {/* Live Activity & Phase Ticker */}
        {currentActivity && (
          <div className="w-full flex items-center justify-center space-x-2 pt-1 border-t border-slate-800/60 text-xs font-mono">
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300 text-[10px] font-bold">
              {currentPhase}
            </span>
            <span className="text-emerald-300 text-[11px] truncate max-w-2xl animate-pulse">
              {currentActivity}
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Compact Header for Audit Tab */}
        {activeTab === 'audit' && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-200 font-semibold">Deterministic Oncology Claim Referee</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 hidden sm:inline">Rules 1–6 Enforced</span>
            </div>
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                Ledger Blocks: #{ledgerRecords.length}
              </span>
            </div>
          </div>
        )}
        {activeTab !== 'audit' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-200 font-semibold uppercase tracking-wider">
                Overlay365 Referee Engine
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400">Deterministic Guardrails Enforced</span>
            </div>
            <div className="flex items-center space-x-3 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                Ledger Blocks: #{ledgerRecords.length}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                Active Principles: {principles.filter((p) => p.status === 'active').length}
              </span>
              <button
                onClick={() => setActiveTab('audit')}
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors cursor-pointer"
              >
                ← Back to Claim Audit
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: Audit Console */}
        {activeTab === 'audit' && (
          <div className="space-y-8">
            {/* Layer 1: Claim Entry */}
            <ClaimEntrySection onStartAudit={handleStartAudit} isLoading={isLoading} />

            {/* Layer 4: Prominent Verdict Display */}
            {verdictRecord && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="uppercase tracking-wider font-bold text-emerald-400">
                    Latest Pipeline Verdict
                  </span>
                  <span>Block #{verdictRecord.block_height} in Ledger</span>
                </div>
                <VerdictDisplay
                  record={verdictRecord}
                  principles={principles}
                  onNavigateToLedger={() => setActiveTab('ledger')}
                />
              </div>
            )}

            {/* Layer 3: Deterministic Engines Grid */}
            {auditResults && (
              <div className="space-y-6">
                {/* M3 Domain Baselines */}
                {auditResults.baseline_result && (
                  <BaselineComparisonChart result={auditResults.baseline_result} />
                )}

                {/* M4 Domain Leakage Breakdown */}
                {auditResults.leakage_result && (
                  <LeakageBreakdownView result={auditResults.leakage_result} />
                )}

                {/* M5 Statistical Referee */}
                {auditResults.referee_result && (
                  <StatisticalRefereeView result={auditResults.referee_result} />
                )}
              </div>
            )}

            {/* Layer 2: Tool-Bound Orchestrator Log Trace */}
            {logSteps.length > 0 && (
              <PipelineExecutionTrace steps={logSteps} toolCallCount={toolCallCount} />
            )}
          </div>
        )}

        {/* TAB 2: TumorTwin Simulation */}
        {activeTab === 'tumortwin' && <TumorTwinControlView />}

        {/* TAB 3: Hypothesis Tournament */}
        {activeTab === 'hypothesis' && (
          <HypothesisTournamentView onRunAuditWithHypothesis={handleRunAuditWithHypothesis} />
        )}

        {/* TAB 4: Autonomous Research Questions */}
        {activeTab === 'questions' && (
          <ResearchQuestionsView onRunAuditForQuestion={handleRunAuditForQuestion} />
        )}

        {/* TAB 5: Data Ingestion */}
        {activeTab === 'ingestion' && (
          <IngestionControlView />
        )}

        {/* TAB 6: Immutable Evidence Ledger */}
        {activeTab === 'ledger' && (
          <LedgerExplorerView
            records={ledgerRecords}
            onAddAuthorResponse={handleAddAuthorResponse}
            onVerifyChain={handleVerifyChain}
          />
        )}

        {/* TAB 7: Layer 5 Recursive Bounded Repair */}
        {activeTab === 'repair' && (
          <RecursiveRepairView
            onRunRepair={handleRunRepair}
            isLoading={isRepairLoading}
            iterations={repairIterations}
            finalVerdictRecord={repairFinalRecord}
            initialSpec={currentClaimSpec}
          />
        )}

        {/* TAB 8: Self-Learning Architecture (Reflexion & Harness Library) */}
        {activeTab === 'learning' && (
          <SelfLearningDashboard
            principles={principles}
            harnesses={harnesses}
            onDecayUtility={handleDecayUtility}
            onPromoteCandidate={handlePromoteCandidate}
            onValidateHarness={handleValidateHarness}
            isLoading={isLoading || isRepairLoading}
          />
        )}

        {/* TAB 9: M2 License Passports */}
        {activeTab === 'licenses' && <LicenseMatrixView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Overlay365 Referee Agent • Computational Oncology Claim Auditor</span>
          <span>
            Deterministic Pipeline: M2 License Gate | M3 Baselines | M4 Leakage | M5 Referee | Layer 4 Ledger
          </span>
        </div>
      </footer>
    </div>
  );
}
