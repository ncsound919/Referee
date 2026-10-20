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
import {
  ClaimSpec,
  AuditResults,
  VerdictRecord,
  OrchestrationLogStep,
  RecursiveRepairIteration,
  Principle,
  HarnessEntry,
} from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { executeAuditPipeline, runRecursiveRepairLoop } from '@/lib/orchestrator';
import { getLedgerRecords, verifyLedgerChain, addAuthorResponseToRecord } from '@/lib/ledger';
import {
  getExperienceStore,
  applyUtilityDecay,
  addTrajectorySupportToPrinciple,
} from '@/lib/experience-base';
import {
  getHarnessEntries,
  runHeldOutHarnessValidation,
} from '@/lib/harness-library';
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

  // Initialize with the landmark October 2026 Bone Mets claim audit on first render
  useEffect(() => {
    async function init() {
      const records = getLedgerRecords();
      setLedgerRecords(records);
      setPrinciples(getExperienceStore());
      setHarnesses(getHarnessEntries());

      // Execute initial audit for demo
      const initialRun = await executeAuditPipeline(SAMPLE_CLAIMS.oct2026_bonemets);
      setAuditResults(initialRun.auditResults);
      if (initialRun.verdictRecord) {
        setVerdictRecord(initialRun.verdictRecord);
      }
      setLogSteps(initialRun.logSteps);
      setToolCallCount(initialRun.toolCallCount);
    }
    init();
  }, []);

  const handleDecayUtility = async () => {
    applyUtilityDecay(0.1);
    setPrinciples(getExperienceStore());
  };

  const handlePromoteCandidate = async (principleId: string) => {
    addTrajectorySupportToPrinciple(principleId, `audit_independent_${Date.now()}`);
    setPrinciples(getExperienceStore());
  };

  const handleValidateHarness = async (harnessId: string) => {
    runHeldOutHarnessValidation(harnessId);
    setHarnesses(getHarnessEntries());
  };

  const handleStartAudit = async (spec: ClaimSpec) => {
    setIsLoading(true);
    setCurrentClaimSpec(spec);

    try {
      // Execute the audit pipeline
      const output = await executeAuditPipeline(spec);
      setAuditResults(output.auditResults);
      if (output.verdictRecord) {
        setVerdictRecord(output.verdictRecord);
      }
      setLogSteps(output.logSteps);
      setToolCallCount(output.toolCallCount);

      // Update ledger records
      setLedgerRecords(getLedgerRecords());
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
      const res = await runRecursiveRepairLoop(spec, maxIterations, options);
      setRepairIterations(res.iterations);
      setRepairFinalRecord(res.finalVerdictRecord);
      setLedgerRecords(getLedgerRecords());
      setPrinciples(getExperienceStore());
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
    const resp = addAuthorResponseToRecord(verdictId, authorName, text);
    if (resp) {
      setLedgerRecords(getLedgerRecords());
      if (verdictRecord && verdictRecord.verdict_id === verdictId) {
        setVerdictRecord({
          ...verdictRecord,
          author_responses: [...(verdictRecord.author_responses || []), resp],
        });
      }
      return true;
    }
    return false;
  };

  const handleVerifyChain = async () => {
    return verifyLedgerChain();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        blockCount={ledgerRecords.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section: Full on Audit Console, Compact on Secondary Modules */}
        {activeTab === 'audit' ? (
          <div className="relative rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-2xl">
            <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Deterministic Oncology Claim Referee</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-100">
                The Only Auditor That Knows Credible Oncology Claims.
              </h1>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed font-sans">
                Routes computational oncology claims through a deterministic audit pipeline—license gate, domain-aware baseline harness, leakage detector, and statistical referee—and writes an immutable verdict to a public evidence ledger, including negative results.
              </p>

              {/* Non-Negotiable Agent Rules Chips */}
              <div className="pt-2 flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                  Rule 1: LLM Never Does Math
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                  Rule 2: License is a Hard Gate
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                  Rule 3: Missing Fields Are Unverifiable
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                  Rule 4: Separate Generator & Auditor
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                  Rule 5: Every Verdict In Ledger
                </span>
                <span className="px-2.5 py-1 rounded bg-slate-950/80 border border-slate-800 text-slate-300">
                  Rule 6: Max 10 Tool Calls
                </span>
              </div>
            </div>
          </div>
        ) : (
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

        {/* TAB 2: Immutable Evidence Ledger */}
        {activeTab === 'ledger' && (
          <LedgerExplorerView
            records={ledgerRecords}
            onAddAuthorResponse={handleAddAuthorResponse}
            onVerifyChain={handleVerifyChain}
          />
        )}

        {/* TAB 3: Layer 5 Recursive Bounded Repair */}
        {activeTab === 'repair' && (
          <RecursiveRepairView
            onRunRepair={handleRunRepair}
            isLoading={isRepairLoading}
            iterations={repairIterations}
            finalVerdictRecord={repairFinalRecord}
            initialSpec={currentClaimSpec}
          />
        )}

        {/* TAB 4: Self-Learning Architecture (Reflexion & Harness Library) */}
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

        {/* TAB 5: M2 License Passports */}
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
