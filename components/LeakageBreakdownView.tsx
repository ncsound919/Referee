'use client';

import React from 'react';
import { LeakageCheckResult } from '@/lib/types';
import { ShieldAlert, CheckCircle2, AlertOctagon, HelpCircle, AlertTriangle } from 'lucide-react';

interface LeakageBreakdownViewProps {
  result: LeakageCheckResult;
}

export function LeakageBreakdownView({ result }: LeakageBreakdownViewProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-semibold text-slate-100">
              M4 Domain-Specific Leakage Detector
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pathology slide overlap • Longitudinal patient × timepoint • Batch / plate confounding • Scanner nuisance classifiers
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {result.leakage_detected ? (
            <span className="px-3 py-1 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-xs font-mono font-bold flex items-center space-x-1.5">
              <AlertOctagon className="w-4 h-4" />
              <span>LEAKAGE DETECTED</span>
            </span>
          ) : result.status === 'UNVERIFIABLE' ? (
            <span className="px-3 py-1 rounded bg-purple-500/20 text-purple-400 border border-purple-500/40 text-xs font-mono font-bold flex items-center space-x-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>UNVERIFIABLE (RULE 3)</span>
            </span>
          ) : (
            <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-bold flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>CLEAN PARTITION (0% LEAK)</span>
            </span>
          )}
        </div>
      </div>

      {/* Domain Rule Metrics Meters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Patient Overlap Rate */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 mb-1">
            Patient-Level Overlap Rate
          </div>
          <div className="flex items-baseline space-x-2">
            <span
              className={`text-xl font-bold font-mono ${
                result.patient_overlap_rate > 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {(result.patient_overlap_rate * 100).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">cross-fold</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${result.patient_overlap_rate > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, result.patient_overlap_rate * 250)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">
            Target: 0.0%. Any patient co-occurrence invalidates generalizability.
          </p>
        </div>

        {/* Batch Confound R² */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 mb-1">
            Batch / Plate Confound R²
          </div>
          <div className="flex items-baseline space-x-2">
            <span
              className={`text-xl font-bold font-mono ${
                result.batch_confound_r2 > 0.15 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {result.batch_confound_r2.toFixed(3)}
            </span>
            <span className="text-xs text-slate-500">label variance</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${result.batch_confound_r2 > 0.15 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${result.batch_confound_r2 * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">
            R² &gt; 0.15 indicates batch artifact dominates biological signature.
          </p>
        </div>

        {/* Nuisance Classifier AUC */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 mb-1">
            Scanner / Site Nuisance AUC
          </div>
          <div className="flex items-baseline space-x-2">
            <span
              className={`text-xl font-bold font-mono ${
                result.nuisance_classifier_auc > 0.65 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {result.nuisance_classifier_auc.toFixed(3)}
            </span>
            <span className="text-xs text-slate-500">site predictability</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${result.nuisance_classifier_auc > 0.65 ? 'bg-rose-500' : 'bg-emerald-500'}`}
              style={{ width: `${(result.nuisance_classifier_auc - 0.5) * 200}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">
            Threshold: ≤ 0.60. Higher indicates model learns acquisition hardware.
          </p>
        </div>
      </div>

      {/* Rule Violations List */}
      {result.violations.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold text-rose-400 font-mono uppercase tracking-wider">
            Critical Domain Violations Detected ({result.violations.length}):
          </div>

          <div className="space-y-2">
            {result.violations.map((v, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg border border-rose-900/40 bg-rose-950/20 text-xs font-mono space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-300">{v.rule_name}</span>
                  <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800 text-[10px] uppercase font-bold">
                    {v.severity}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px]">{v.description}</div>
                <div className="text-slate-400 text-[11px] bg-slate-950/60 p-2 rounded">
                  <span className="text-slate-500">Evidence:</span> {v.evidence}
                </div>
                <div className="text-amber-400 text-[11px]">
                  <span className="text-slate-500">Metric Impact:</span> {v.metric_impact}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unverifiable Warnings */}
      {result.unverifiable_reasons.length > 0 && (
        <div className="p-3.5 rounded-lg border border-purple-900/40 bg-purple-950/20 text-xs font-mono space-y-2">
          <div className="flex items-center space-x-2 text-purple-300 font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>Rule 3 Enforced: Missing Fields Are Unverifiable, Not Guessed</span>
          </div>
          <ul className="list-disc list-inside text-slate-300 text-[11px] space-y-1">
            {result.unverifiable_reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
