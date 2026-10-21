'use client';

import React from 'react';
import { VerdictRecord, Principle } from '@/lib/types';
import { FlaskConical, Sparkles, ArrowRight, Brain, Cpu, CheckCircle2 } from 'lucide-react';

interface NextExperimentSetupCardProps {
  record: VerdictRecord;
  /**
   * Active principles for the domain, supplied by the caller.
   *
   * These used to be read straight out of `@/lib/experience-base` inside this
   * component, which put server-side state in the browser bundle. The
   * dashboard now loads the experience base from `/api/experience` and passes
   * the relevant slice down.
   */
  principles?: Principle[];
  onLaunchNextExperiment?: (skills: string[], description: string) => void;
}

export function NextExperimentSetupCard({
  record,
  principles,
  onLaunchNextExperiment,
}: NextExperimentSetupCardProps) {
  // Active principles for this record's domain, mirroring the server-side
  // `retrieveActivePrinciples` selection (status, utility floor, domain match).
  const activePrinciples = (principles ?? [])
    .filter((p) => p.status === 'active' && p.utility_score >= 0.3)
    .filter((p) => {
      const domain = record.domain_task;
      if (!domain || domain === 'other') return true;
      return p.domain === domain;
    })
    .sort((a, b) => b.utility_score - a.utility_score);

  // Determine intelligent next experiment recommendation based on verdict
  const getNextExperimentRecommendation = () => {
    const verdict = record.verdict;

    if (verdict === 'LEAKAGE_DETECTED') {
      return {
        title: 'Recommended Repair: Enforce Patient-Level Stratification & ComBat Harmonization',
        skills: ['split_by_patient_level', 'combat_batch_harmonization', 'run_statistical_referee'],
        rationale: 'The previous audit caught data leakage across patient records or batch runs. The self-learning Experience Base recommends applying GroupKFold partitioning on patient identifiers and empirical Bayes batch correction.',
        estimatedUplift: 0.82,
        computeCost: 0.35,
        riskOfRedundancy: 0.05,
      };
    } else if (verdict === 'FAILS_BASELINE') {
      return {
        title: 'Recommended Repair: Multimodal Clinical Covariate Fusion',
        skills: ['multimodal_clinical_fusion', 'run_clinical_cox_baseline', 'run_statistical_referee'],
        rationale: 'The model failed to beat locked baseline models. Self-learning principles indicate that fusing clinical staging, age, and receptor status features unlocks generalizable prognostic signal.',
        estimatedUplift: 0.78,
        computeCost: 0.45,
        riskOfRedundancy: 0.10,
      };
    } else if (verdict === 'UNVERIFIABLE') {
      return {
        title: 'Recommended Repair: Supply Verified Split Protocol & Identifiers',
        skills: ['split_by_patient_level', 'run_statistical_referee'],
        rationale: 'Essential split fields were missing. To satisfy Rule 3, supply explicit institutional partition metadata and patient identifiers.',
        estimatedUplift: 0.75,
        computeCost: 0.20,
        riskOfRedundancy: 0.00,
      };
    } else {
      return {
        title: 'Next Research Frontier: External Multi-Center Validation & Cross-Cohort Testing',
        skills: ['external_cohort_validation', 'run_statistical_referee', 'decision_curve_analysis'],
        rationale: 'Since the model successfully reproduced on internal data, the self-learning engine recommends validating robustness across an independent hospital cohort (e.g., GSE2034 or CAMELYON17 center 5).',
        estimatedUplift: 0.85,
        computeCost: 0.60,
        riskOfRedundancy: 0.15,
      };
    }
  };

  const recommendation = getNextExperimentRecommendation();
  const samplePrinciple = activePrinciples.length > 0 ? activePrinciples[0] : null;

  return (
    <div className="rounded-2xl bg-slate-900 border border-emerald-500/30 p-6 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono">
            <FlaskConical className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">
                Self-Learning Next Experiment Setup
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
                Driven by Experience Base
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 tracking-tight">
              {recommendation.title}
            </h3>
          </div>
        </div>

        {onLaunchNextExperiment && (
          <button
            onClick={() => onLaunchNextExperiment(recommendation.skills, recommendation.rationale)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer self-start sm:self-auto"
          >
            <Sparkles className="w-4 h-4" />
            <span>Launch Recommended Experiment</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-sans">
        {/* Left: Self-Learning Principle Guidance */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center space-x-2 font-mono text-cyan-400 font-semibold">
            <Brain className="w-4 h-4" />
            <span>Retrieved Experience Principle</span>
          </div>
          {samplePrinciple ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>ID: {samplePrinciple.principle_id}</span>
                <span className="text-emerald-400">Utility: {samplePrinciple.utility_score}</span>
              </div>
              <p className="text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800 font-mono text-[11px]">
                {samplePrinciple.lesson}
              </p>
            </div>
          ) : (
            <p className="text-slate-400">No active domain principles retrieved yet. Trajectories are accumulating.</p>
          )}
        </div>

        {/* Right: Marginal Evidence Value (MEV) Projection */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center space-x-2 font-mono text-emerald-400 font-semibold">
            <Cpu className="w-4 h-4" />
            <span>Projected MEV Gatekeeper Score</span>
          </div>
          <div className="space-y-2.5 font-mono text-slate-300">
            <div className="flex justify-between items-center bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-400">Target Utility (U_target):</span>
              <span className="text-emerald-400 font-bold">{recommendation.estimatedUplift.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-400">Compute Cost (C_compute):</span>
              <span className="text-amber-400 font-bold">{recommendation.computeCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-slate-400">Redundancy Risk (R_risk):</span>
              <span className="text-cyan-400 font-bold">{recommendation.riskOfRedundancy.toFixed(2)}</span>
            </div>
            <div className="text-[11px] text-slate-500 pt-1">
              Formula: MEV = (U_target - C_compute - R_risk) / Iterations ≥ 0.15 threshold.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
