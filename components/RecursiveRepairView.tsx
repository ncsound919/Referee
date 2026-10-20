'use client';

import React, { useState } from 'react';
import { ClaimSpec, RecursiveRepairIteration, VerdictRecord } from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import {
  Layers,
  Play,
  RotateCw,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Sliders,
  Scale,
  Cpu,
  RefreshCw,
  Clock,
  Gauge,
  HelpCircle,
  AlertTriangle,
  Flame,
} from 'lucide-react';

interface RecursiveRepairViewProps {
  onRunRepair: (
    spec: ClaimSpec,
    maxIterations: number,
    options?: {
      forceDuplicatePipeline?: boolean;
      forceHighComputeGnn?: boolean;
    }
  ) => Promise<void>;
  isLoading: boolean;
  iterations: RecursiveRepairIteration[];
  finalVerdictRecord?: VerdictRecord;
  initialSpec?: ClaimSpec;
}

export function RecursiveRepairView({
  onRunRepair,
  isLoading,
  iterations,
  finalVerdictRecord,
  initialSpec,
}: RecursiveRepairViewProps) {
  const [selectedSpecKey, setSelectedSpecKey] = useState<string>('camelyon_lymph');
  const [maxIter, setMaxIter] = useState<number>(5);

  // Interactive MEV Simulator States
  const [simUTarget, setSimUTarget] = useState<number>(0.82);
  const [simCCompute, setSimCCompute] = useState<number>(0.25);
  const [simRRisk, setSimRRisk] = useState<number>(0.0);
  const [simIteration, setSimIteration] = useState<number>(1);
  const [showSimInfo, setShowSimInfo] = useState<boolean>(false);

  // Calculate live simulator MEV
  const simNumerator = Number((simUTarget - simCCompute - simRRisk).toFixed(3));
  const simMevRaw = simNumerator / Math.max(1, simIteration);
  const simMev = Number(simMevRaw.toFixed(3));
  const simDecision = simIteration >= 5 || simMev < 0.15 ? 'HALT' : 'PROCEED';
  const simHaltReason =
    simIteration >= 5
      ? 'Hard stop: Max iteration limit (5) reached.'
      : simRRisk >= 0.7
      ? `Excessive redundancy risk (${(simRRisk * 100).toFixed(0)}% repeat proposal).`
      : simCCompute >= 0.7
      ? `Disproportionate compute cost (${simCCompute.toFixed(2)}) outweighs utility.`
      : simIteration >= 3
      ? `Diminishing returns penalty at iteration ${simIteration} diluted MEV.`
      : 'MEV below 0.150 threshold.';

  const handleLaunchRepair = (options?: {
    forceDuplicatePipeline?: boolean;
    forceHighComputeGnn?: boolean;
  }) => {
    const spec = initialSpec || SAMPLE_CLAIMS[selectedSpecKey];
    if (spec) {
      onRunRepair(spec, maxIter, options);
    }
  };

  const applyPreset = (preset: 'standard' | 'redundant' | 'heavy_gnn' | 'fatigue') => {
    if (preset === 'standard') {
      setSimUTarget(0.84);
      setSimCCompute(0.25);
      setSimRRisk(0.0);
      setSimIteration(1);
    } else if (preset === 'redundant') {
      setSimUTarget(0.80);
      setSimCCompute(0.20);
      setSimRRisk(1.0);
      setSimIteration(2);
    } else if (preset === 'heavy_gnn') {
      setSimUTarget(0.65);
      setSimCCompute(0.90);
      setSimRRisk(0.10);
      setSimIteration(2);
    } else if (preset === 'fatigue') {
      setSimUTarget(0.55);
      setSimCCompute(0.25);
      setSimRRisk(0.15);
      setSimIteration(4);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Layer 5: Recursive Bounded Repair Loop
            </h3>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
              Jevons MEV Model Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic Decision Model (William Stanley Jevons marginal utility). Evaluates whether proposed repairs yield sufficient marginal evidence before allowing tool execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">Iterations:</span>
            <select
              value={maxIter}
              onChange={(e) => setMaxIter(Number(e.target.value))}
              disabled={isLoading}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200"
            >
              <option value={3}>3 Steps</option>
              <option value={5}>5 Steps (Max)</option>
            </select>
          </div>

          <button
            onClick={() => handleLaunchRepair()}
            disabled={isLoading}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg font-medium text-xs font-mono transition-colors shadow-lg ${
              isLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 active:scale-95'
            }`}
          >
            {isLoading ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Auditing Loop...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Execute Bounded Repair</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Jevons Marginal Evidence Value (MEV) Mathematical Card */}
      <div className="rounded-xl border border-indigo-900/60 bg-gradient-to-br from-indigo-950/40 via-slate-950 to-slate-950 p-4 sm:p-5 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Scale className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs sm:text-sm font-bold text-slate-100 font-mono">
                The Marginal Evidence Value (MEV) Model
              </h4>
              <button
                onClick={() => setShowSimInfo(!showSimInfo)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
                title="Toggle details"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 max-w-2xl">
              Deterministic gatekeeper executed by the Next.js/FastAPI orchestrator prior to iteration \(N+1\). If marginal value drops below the hard stop threshold, the system halts immediately.
            </p>
          </div>

          {/* Render Formula Banner */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-lg px-4 py-2 text-center font-mono text-xs">
            <span className="text-slate-400">Deterministic Physics: </span>
            <span className="text-indigo-300 font-bold">
              MEV = (U<sub>target</sub> - C<sub>compute</sub> - R<sub>risk</sub>) / I<sub>iterations</sub>
            </span>
          </div>
        </div>

        {/* 4 Term Definitions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 text-[11px] font-mono">
          <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-indigo-300 font-bold">
              <span>U<sub>target</sub> (Target Utility)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                0.0 - 1.0
              </span>
            </div>
            <p className="text-slate-400 text-[10px] leading-tight">
              Empirical probability of valid scientific conclusion from matching ExperienceBase cases.
            </p>
          </div>

          <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-amber-300 font-bold">
              <span>C<sub>compute</sub> (Compute Cost)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800">
                0.0 - 1.0
              </span>
            </div>
            <p className="text-slate-400 text-[10px] leading-tight">
              Normalized cost of proposed pipeline (e.g. baseline: 0.15, GNN/ResNet: 0.90).
            </p>
          </div>

          <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-rose-300 font-bold">
              <span>R<sub>risk</sub> (Redundancy)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800">
                0.0 - 1.0
              </span>
            </div>
            <p className="text-slate-400 text-[10px] leading-tight">
              Similarity to previous failed pipeline. If duplicate proposal, R<sub>risk</sub> = 1.0.
            </p>
          </div>

          <div className="p-2.5 rounded bg-slate-900/50 border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-emerald-300 font-bold">
              <span>I<sub>iterations</sub> (Penalty)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                1 - 5
              </span>
            </div>
            <p className="text-slate-400 text-[10px] leading-tight">
              Denominator enforcing diminishing returns. Bar rises with each subsequent iteration.
            </p>
          </div>
        </div>

        {/* Hard Stop Rules & Scientific Ethos Banner */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-[11px] font-mono">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-slate-400 font-semibold">Deterministic Circuit Breakers:</span>
            <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800 text-[10px]">
              MEV &lt; 0.150 &rarr; HALT (IRREPARABLE_WITHIN_BUDGET)
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800 text-[10px]">
              I<sub>iter</sub> &ge; 5 &rarr; UNCONDITIONAL HALT
            </span>
          </div>

          <div className="text-slate-400 italic text-[10px] text-right">
            &ldquo;A rigorous, exhausted scientist who stops when evidence runs dry, not a chatbot that spins forever.&rdquo;
          </div>
        </div>
      </div>

      {/* Interactive MEV Simulator & Circuit Breaker Inspector */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Gauge className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold text-slate-200 font-mono">
              Interactive MEV Simulator &amp; Circuit Breaker Tester
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-mono mr-1">Presets:</span>
            <button
              onClick={() => applyPreset('standard')}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-700 transition-colors"
            >
              Standard Grounded Fix
            </button>
            <button
              onClick={() => applyPreset('redundant')}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-rose-300 border border-slate-700 transition-colors"
            >
              Duplicate (R=1.0)
            </button>
            <button
              onClick={() => applyPreset('heavy_gnn')}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 transition-colors"
            >
              Heavy GNN (C=0.90)
            </button>
            <button
              onClick={() => applyPreset('fatigue')}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-colors"
            >
              Iter 4 Fatigue
            </button>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="space-y-1.5">
            <div className="flex justify-between text-indigo-300">
              <span>U<sub>target</sub>:</span>
              <span className="font-bold">{simUTarget.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.10"
              max="1.0"
              step="0.02"
              value={simUTarget}
              onChange={(e) => setSimUTarget(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="text-[10px] text-slate-500">Expected scientific uplift</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-amber-300">
              <span>C<sub>compute</sub>:</span>
              <span className="font-bold">{simCCompute.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="0.95"
              step="0.05"
              value={simCCompute}
              onChange={(e) => setSimCCompute(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="text-[10px] text-slate-500">Pipeline compute budget</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-rose-300">
              <span>R<sub>risk</sub>:</span>
              <span className="font-bold">{simRRisk.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="1.0"
              step="0.05"
              value={simRRisk}
              onChange={(e) => setSimRRisk(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
            <div className="text-[10px] text-slate-500">Redundancy / similarity</div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-emerald-300">
              <span>I<sub>iterations</sub>:</span>
              <span className="font-bold">{simIteration}</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={simIteration}
              onChange={(e) => setSimIteration(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
            <div className="text-[10px] text-slate-500">Loop count penalty</div>
          </div>
        </div>

        {/* Live Evaluation Display Box */}
        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-mono text-xs">
          <div className="space-y-1">
            <div className="text-slate-400 text-[11px]">
              Calculated Value:{' '}
              <span className="text-slate-200">
                ({simUTarget.toFixed(2)} - {simCCompute.toFixed(2)} - {simRRisk.toFixed(2)}) / {simIteration} ={' '}
                <strong
                  className={`text-sm ${
                    simDecision === 'PROCEED' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {simMev.toFixed(3)}
                </strong>
              </span>
            </div>
            <div className="text-[10px] text-slate-400">
              {simDecision === 'PROCEED'
                ? 'Marginal value exceeds 0.150 threshold; trial execution is warranted.'
                : `Gatekeeper tripped: ${simHaltReason}`}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span
              className={`px-3 py-1 rounded font-bold text-xs border flex items-center space-x-1.5 ${
                simDecision === 'PROCEED'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                  : 'bg-rose-950/80 text-rose-300 border-rose-700'
              }`}
            >
              {simDecision === 'PROCEED' ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>DECISION: PROCEED</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  <span>DECISION: HALT</span>
                </>
              )}
            </span>

            {/* Quick Live Audit Triggers for Redundancy & Heavy Compute */}
            <button
              onClick={() => handleLaunchRepair({ forceDuplicatePipeline: true })}
              disabled={isLoading}
              className="text-[10px] font-mono px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800 transition-colors"
              title="Runs loop and forces identical pipeline proposal on iter 2 to test MEV circuit breaker"
            >
              Test Redundant Circuit Breaker
            </button>
            <button
              onClick={() => handleLaunchRepair({ forceHighComputeGnn: true })}
              disabled={isLoading}
              className="text-[10px] font-mono px-2.5 py-1 rounded bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-800 transition-colors"
              title="Runs loop and forces heavy GNN (cost 0.90) to test compute cost circuit breaker"
            >
              Test Heavy GNN Circuit Breaker
            </button>
          </div>
        </div>
      </div>

      {/* Target Claim Selector if no active run */}
      {!iterations.length && !isLoading && (
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-300 font-mono">
            Choose Claim to Subject to Methodological Repair:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div
              onClick={() => setSelectedSpecKey('camelyon_lymph')}
              className={`p-3 rounded-lg border cursor-pointer text-xs transition-colors ${
                selectedSpecKey === 'camelyon_lymph'
                  ? 'border-indigo-500 bg-indigo-950/20'
                  : 'border-slate-800 bg-slate-950 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-slate-200">CAMELYON17 Slide Leakage</div>
              <p className="text-slate-400 text-[11px] mt-1">
                Repairs slide-level cross contamination by enforcing GroupKFold patient stratification.
              </p>
            </div>

            <div
              onClick={() => setSelectedSpecKey('glio_pseudoprog')}
              className={`p-3 rounded-lg border cursor-pointer text-xs transition-colors ${
                selectedSpecKey === 'glio_pseudoprog'
                  ? 'border-indigo-500 bg-indigo-950/20'
                  : 'border-slate-800 bg-slate-950 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-slate-200">Glioma Pseudoprogression</div>
              <p className="text-slate-400 text-[11px] mt-1">
                Enforces patient-held-out longitudinal split and multi-scanner debiasing.
              </p>
            </div>

            <div
              onClick={() => setSelectedSpecKey('oct2026_bonemets')}
              className={`p-3 rounded-lg border cursor-pointer text-xs transition-colors ${
                selectedSpecKey === 'oct2026_bonemets'
                  ? 'border-indigo-500 bg-indigo-950/20'
                  : 'border-slate-800 bg-slate-950 hover:border-slate-700'
              }`}
            >
              <div className="font-semibold text-slate-200">October 2026 Bone Mets</div>
              <p className="text-slate-400 text-[11px] mt-1">
                Applies ComBat batch harmonization and tests whether transcriptomics beats clinical Cox.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Iteration Timeline Results with Real MEV Telemetry */}
      {iterations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Repair History ({iterations.length} Iterations):</span>
            {finalVerdictRecord && (
              <span
                className={`font-bold px-2.5 py-0.5 rounded border ${
                  finalVerdictRecord.verdict === 'REPRODUCED'
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30'
                    : 'border-rose-500 text-rose-400 bg-rose-950/30'
                }`}
              >
                Final Verdict: {finalVerdictRecord.verdict}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {iterations.map((step) => {
              const isHalted = step.action_taken.includes('HALTED BY JEVONS MEV');
              const isReproduced = step.new_verdict === 'REPRODUCED';

              return (
                <div
                  key={step.iteration}
                  className={`p-4 rounded-lg bg-slate-950 border text-xs font-mono space-y-3 ${
                    isHalted
                      ? 'border-rose-800/80 bg-rose-950/10'
                      : isReproduced
                      ? 'border-emerald-800/80 bg-emerald-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`px-2 py-0.5 rounded font-bold border ${
                          isHalted
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                        }`}
                      >
                        Iteration #{step.iteration}
                      </span>
                      <span className="text-slate-200 font-semibold">{step.action_taken}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500">{step.previous_verdict}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span
                        className={`font-bold ${
                          isReproduced
                            ? 'text-emerald-400'
                            : isHalted
                            ? 'text-rose-400'
                            : step.new_verdict === 'LEAKAGE_DETECTED'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {isHalted ? 'IRREPARABLE_WITHIN_BUDGET' : step.new_verdict}
                      </span>
                    </div>
                  </div>

                  {/* MEV Gatekeeper Telemetry Badge */}
                  {step.mev && (
                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center space-x-2">
                        <Scale className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-slate-300 font-bold">MEV Gatekeeper:</span>
                        <span
                          className={`font-mono font-bold px-1.5 py-0.2 rounded border ${
                            step.mev.decision === 'PROCEED'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-rose-950 text-rose-300 border-rose-800'
                          }`}
                        >
                          MEV = {step.mev.mev.toFixed(3)} [{step.mev.decision}]
                        </span>
                      </div>

                      <div className="text-[10px] text-slate-400 flex flex-wrap items-center gap-2">
                        <span>U<sub>tgt</sub>: {step.mev.uTarget.toFixed(2)}</span>
                        <span>&bull;</span>
                        <span>C<sub>comp</sub>: {step.mev.cCompute.toFixed(2)}</span>
                        <span>&bull;</span>
                        <span>R<sub>risk</sub>: {step.mev.rRisk.toFixed(2)}</span>
                        <span>&bull;</span>
                        <span>I<sub>iter</sub>: {step.mev.iteration}</span>
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 pl-4 border-l-2 border-indigo-500/50 space-y-1">
                    <div>
                      <span className="text-slate-500">Parameter Modified:</span>{' '}
                      <span className="text-indigo-300">{step.parameter_adjusted}</span>
                    </div>
                    {!isHalted && (
                      <div>
                        <span className="text-slate-500">Observed Test AUC:</span>{' '}
                        <span className="text-slate-200">{step.claim_auc.toFixed(3)}</span> (Best
                        Baseline: {step.baseline_auc.toFixed(3)})
                      </div>
                    )}
                    <div className="text-slate-300">{step.notes}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
