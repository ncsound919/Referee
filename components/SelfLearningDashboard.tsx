'use client';

import React, { useState } from 'react';
import { Principle, HarnessEntry, OncologyDomainTask } from '@/lib/types';
import { AutonomousRunnerDashboard } from './AutonomousRunnerDashboard';
import {
  Brain,
  ShieldAlert,
  Sparkles,
  Lock,
  Sliders,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCw,
  TrendingDown,
  BookOpen,
  Award,
  Layers,
  Search,
  ExternalLink,
  ChevronRight,
  UserCheck,
  Zap,
} from 'lucide-react';

interface SelfLearningDashboardProps {
  principles: Principle[];
  harnesses: HarnessEntry[];
  onDecayUtility: () => Promise<void>;
  onPromoteCandidate: (principleId: string) => Promise<void>;
  onValidateHarness: (harnessId: string) => Promise<void>;
  isLoading: boolean;
}

export function SelfLearningDashboard({
  principles,
  harnesses,
  onDecayUtility,
  onPromoteCandidate,
  onValidateHarness,
  isLoading,
}: SelfLearningDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<'principles' | 'harnesses' | 'reflexion' | 'boundary' | 'autonomous'>('autonomous');
  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const activePrinciples = principles.filter((p) => p.status === 'active');
  const candidatePrinciples = principles.filter((p) => p.status === 'candidate');
  const prunedPrinciples = principles.filter((p) => p.status === 'pruned');
  const flaggedPrinciples = principles.filter((p) => p.status === 'flagged_for_human_review');

  const filteredPrinciples = principles.filter((p) => {
    const matchesDomain = selectedDomain === 'ALL' || p.domain === selectedDomain;
    const matchesSearch =
      p.principle_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.trigger.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lesson.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDomain && matchesSearch;
  });

  const handleDecay = async () => {
    await onDecayUtility();
    setActionMessage('Simulated 10% monthly utility decay applied. Obsolete principles (< 0.3) pruned.');
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handlePromote = async (id: string) => {
    await onPromoteCandidate(id);
    setActionMessage(`Candidate ${id} confirmed with 2nd independent trajectory (Constraint 1 satisfied) -> Promoted to ACTIVE.`);
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleValidateHarness = async (id: string) => {
    await onValidateHarness(id);
    setActionMessage(`Held-out validation complete for harness playbook ${id} (Constraint 2).`);
    setTimeout(() => setActionMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* The One-Sentence Autonomy Contract */}
      <div className="relative rounded-xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/30 p-6 shadow-xl overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 rounded-lg bg-indigo-950 border border-indigo-700/60 text-indigo-400 shrink-0">
            <Brain className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold tracking-wider uppercase text-indigo-400">
                The Autonomy Contract (Reflexion • Voyager • EvolveR)
              </span>
              <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800">
                Bounded &amp; Auditable
              </span>
            </div>
            <p className="text-sm sm:text-base text-slate-100 font-semibold leading-relaxed">
              &ldquo;The Overlay365 Referee Agent may learn how to audit better, but it may never learn what counts as a valid audit.&rdquo;
            </p>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              The deterministic engine is the fixed point. The agent orbits it, accumulating strategic principles, refining claim extraction, and proposing bounded repairs. The learning mechanism is strictly separated from the execution environment.
            </p>
          </div>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-300 font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionMessage}</span>
          </div>
          <span className="text-[10px] text-slate-400">Experience Store Updated</span>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSubTab('autonomous')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeSubTab === 'autonomous'
                ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>Autonomous Closed-Loop</span>
          </button>
          <button
            onClick={() => setActiveSubTab('principles')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeSubTab === 'principles'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Experience Base ({principles.length} Principles)
          </button>
          <button
            onClick={() => setActiveSubTab('harnesses')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeSubTab === 'harnesses'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Harness Library ({harnesses.length} Playbooks)
          </button>
          <button
            onClick={() => setActiveSubTab('reflexion')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeSubTab === 'reflexion'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Reflexion Loop Architecture
          </button>
          <button
            onClick={() => setActiveSubTab('boundary')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeSubTab === 'boundary'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            Physics vs. Strategy Boundary
          </button>
        </div>

        {/* Global Decay Simulation Action */}
        <button
          onClick={handleDecay}
          disabled={isLoading}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono transition-colors"
          title="Constraint 3: Utility decay prunes unused principles below 0.3"
        >
          <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
          <span>Simulate Monthly Decay (-10%)</span>
        </button>
      </div>

      {/* SUBTAB 1: Experience Base (Principles) */}
      {activeSubTab === 'principles' && (
        <div className="space-y-4">
          {/* Summary Metric Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Active Principles</span>
              <span className="text-lg font-bold text-emerald-400">{activePrinciples.length}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Retrievable by Orchestrator</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Candidate (Constraint 1)</span>
              <span className="text-lg font-bold text-cyan-400">{candidatePrinciples.length}</span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Pending 2nd Trajectory</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Pruned (Utility &lt; 0.3)</span>
              <span className="text-lg font-bold text-slate-500">{prunedPrinciples.length}</span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Decayed Obsolete Rules</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-slate-500 block text-[10px] uppercase">Human Review (Constraint 4)</span>
              <span className="text-lg font-bold text-rose-400">{flaggedPrinciples.length}</span>
              <span className="text-[10px] text-rose-400/80 block mt-0.5">Protected Hard Stops</span>
            </div>
          </div>

          {/* Search & Domain Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search triggers or lessons..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
              {[
                { id: 'ALL', label: 'All Domains' },
                { id: 'neuro_oncology_pseudoprogression', label: 'Neuro-Oncology' },
                { id: 'breast_transcriptomic_metastasis', label: 'Breast Transcriptomics' },
                { id: 'breast_pathology_lymph_node', label: 'Pathology WSI' },
                { id: 'glioma_grade_survival', label: 'Glioma Grade' },
              ].map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDomain(d.id)}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors border ${
                    selectedDomain === d.id
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Principles Table */}
          <div className="space-y-3">
            {filteredPrinciples.map((p) => {
              const isCandidate = p.status === 'candidate';
              const isPruned = p.status === 'pruned';
              const isFlagged = p.status === 'flagged_for_human_review';

              return (
                <div
                  key={p.principle_id}
                  className={`p-4 rounded-xl border text-xs font-mono space-y-2 transition-colors ${
                    isFlagged
                      ? 'bg-rose-950/20 border-rose-900/50'
                      : isPruned
                      ? 'bg-slate-950/40 border-slate-900 opacity-60'
                      : isCandidate
                      ? 'bg-slate-950 border-cyan-800/40 ring-1 ring-cyan-800/20'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Principle Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-[11px]">
                        {p.principle_id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                          p.status === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : p.status === 'candidate'
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                            : p.status === 'flagged_for_human_review'
                            ? 'bg-rose-950 text-rose-400 border-rose-800'
                            : 'bg-slate-900 text-slate-500 border-slate-800'
                        }`}
                      >
                        {p.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Domain: <span className="text-indigo-300">{p.domain}</span>
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-[11px]">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-slate-500">Utility Score:</span>
                        <span
                          className={`font-bold ${
                            p.utility_score >= 0.8
                              ? 'text-emerald-400'
                              : p.utility_score >= 0.5
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {p.utility_score.toFixed(2)}
                        </span>
                      </div>
                      <span className="text-slate-500">Source: {p.source}</span>
                    </div>
                  </div>

                  {/* Trigger & Lesson */}
                  <div className="space-y-1">
                    <div className="text-slate-400 text-[11px]">
                      <span className="text-slate-500 font-semibold">Trigger:</span> {p.trigger}
                    </div>
                    <div className="text-slate-200 text-xs font-sans leading-relaxed bg-slate-900/60 p-2.5 rounded border border-slate-800/60">
                      <span className="text-indigo-400 font-mono font-bold text-[11px]">Lesson: </span>
                      {p.lesson}
                    </div>
                  </div>

                  {/* Supporting Trajectories & Candidate Promotion */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500">Evidence Trajectories:</span>
                      <span className="text-slate-300 font-mono">
                        [{p.evidence_trajectories.join(', ')}] ({p.evidence_trajectories.length})
                      </span>
                    </div>

                    {isCandidate && (
                      <button
                        onClick={() => handlePromote(p.principle_id)}
                        disabled={isLoading}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold uppercase transition-colors"
                      >
                        <UserCheck className="w-3 h-3" />
                        <span>Supply 2nd Trajectory (Constraint 1)</span>
                      </button>
                    )}

                    {p.suggested_repair_type && (
                      <span className="text-indigo-300 text-[10px]">
                        Suggested Repair: <span className="font-bold">{p.suggested_repair_type}</span>
                      </span>
                    )}
                  </div>

                  {p.human_review_notes && (
                    <div className="p-2 rounded bg-rose-950/40 border border-rose-900/60 text-rose-300 text-[10px]">
                      {p.human_review_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBTAB 2: Harness Library */}
      {activeSubTab === 'harnesses' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono">
            <span className="font-bold text-indigo-400">Layer 4: Harness Library (Harness² &amp; GLoW Framework):</span>{' '}
            Consolidated domain playbooks derived from clusters of 3+ high-utility principles. Harness entries govern the sequence and emphasis of tool calls without modifying deterministic tools.
          </div>

          <div className="space-y-3">
            {harnesses.map((h) => (
              <div
                key={h.harness_id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-100 text-sm">{h.harness_id}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        h.status === 'active'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : h.status === 'testing'
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}
                    >
                      {h.status}
                    </span>
                    <span className="text-slate-400">{h.domain}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="text-slate-400">
                      Avg Steps: <span className="text-emerald-400 font-bold">{h.performance.avg_iterations_to_verdict}</span>
                    </span>
                    <span className="text-slate-400">
                      Accuracy vs Review: <span className="text-cyan-400 font-bold">{(h.performance.accuracy_vs_human_review * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/60 rounded border border-slate-800/70 text-slate-200 font-sans leading-relaxed text-xs">
                  <span className="font-mono text-indigo-400 font-bold block text-[11px] mb-1">
                    Playbook Strategy:
                  </span>
                  {h.strategy}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="text-slate-500">
                    Source: {h.source} (Evaluated: {h.last_evaluated})
                  </div>

                  <button
                    onClick={() => handleValidateHarness(h.harness_id)}
                    disabled={isLoading}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] transition-colors"
                  >
                    <Award className="w-3 h-3" />
                    <span>Run Held-Out Validation (Constraint 2)</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 3: Reflexion Loop Architecture */}
      {activeSubTab === 'reflexion' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 text-xs font-mono">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-100 font-sans">
              Layer 2: The Reflexion Loop (Reflexion-Style Verbal Reinforcement)
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Deterministic Reflector: Reads failed trajectories, identifies failure classes, and distills structured principles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-indigo-400 font-bold block uppercase text-[11px]">
                When Reflection Fires
              </span>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Audit ends in <strong>FAILS_BASELINE</strong> with repair exhausted.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Audit ends in <strong>LEAKAGE_DETECTED</strong> with repair exhausted.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Claim marked sub-verdict: <strong>IRREPARABLE_WITHIN_BUDGET</strong>.</span>
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-rose-400 font-bold block uppercase text-[11px]">
                When Reflection Is Blocked
              </span>
              <ul className="space-y-1.5 text-slate-300 text-[11px]">
                <li className="flex items-start space-x-2">
                  <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span><strong>REPRODUCED</strong>: Success is logged to ledger, not reflected upon.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span><strong>UNVERIFIABLE</strong>: Missing information is not a learning signal.</span>
                </li>
                <li className="flex items-start space-x-2">
                  <XCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <span><strong>OUT_OF_SCOPE</strong>: License gate hard stops are unchangeable physics.</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-cyan-400 font-bold block uppercase text-[11px]">
              What the Reflector Does NOT Do
            </span>
            <p className="text-slate-300 leading-relaxed font-sans text-xs">
              It does not question the verdict. The verdict is deterministic ground truth. The reflector&apos;s job is to learn why the agent failed to anticipate the verdict, not to argue with the verdict.
            </p>
          </div>
        </div>
      )}

      {/* SUBTAB 4: Physics vs Strategy Boundary */}
      {activeSubTab === 'boundary' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5 text-xs font-mono">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-100 font-sans">
              The Physics vs. Strategy Boundary Matrix
            </h3>
            <p className="text-slate-400 text-xs mt-1">
              Separation of the learning mechanism from the execution environment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
                <Lock className="w-4 h-4" />
                <span>IMMUTABLE (Referee&apos;s Physics)</span>
              </div>
              <ul className="space-y-2 text-slate-300 text-xs font-sans">
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">M3 Baseline Harness:</strong> Fixed per task type (GLMNET, Random Forest, XGBoost, Clinical Cox). Prompt injection cannot modify baselines.
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">M4 Leakage Detection Rules:</strong> Patient-level overlap, timepoint contamination, batch confound R², and scanner nuisance classifiers.
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">M5 Statistical Referee:</strong> Locked 1,000 bootstrap seed, 0.30 negative-control gate, Never-NaN enforcement.
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">M2 License Gate:</strong> Hard stop behavior on non-commercial datasets (MSK-MET, METABRIC).
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">Verdict Taxonomy:</strong> Strictly 5 values (REPRODUCED, FAILS_BASELINE, LEAKAGE_DETECTED, UNVERIFIABLE, OUT_OF_SCOPE).
                </li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                <Sliders className="w-4 h-4" />
                <span>MUTABLE (Agent&apos;s Strategy)</span>
              </div>
              <ul className="space-y-2 text-slate-300 text-xs font-sans">
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">ClaimSpec Extraction:</strong> Refining prompts and heuristics to parse messy text, abstracts, and repositories without guessing.
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">Tool Sequencing &amp; Harness:</strong> Prioritizing timepoint leakage checks before baselines in neuro-oncology to save tool steps.
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">Bounded Repair Strategy:</strong> Learning which repair to try first (LEAKAGE_FIX vs BASELINE_ALIGNMENT vs FEATURE_RESTRICTION).
                </li>
                <li className="p-2 rounded bg-slate-900 border border-slate-800">
                  <strong className="text-slate-100 font-mono">Failure Mode Heuristics:</strong> Knowing that breast transcriptomic claims collapse from CV to test, while neuro-oncology claims leak serial MRI timepoints.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 5: Autonomous Runner Dashboard */}
      {activeSubTab === 'autonomous' && <AutonomousRunnerDashboard />}
    </div>
  );
}
