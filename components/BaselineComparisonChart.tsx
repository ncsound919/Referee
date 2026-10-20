'use client';

import React from 'react';
import { BaselineHarnessResult } from '@/lib/types';
import { BarChart3, Info, CheckCircle2, XCircle, TrendingUp, Award } from 'lucide-react';

interface BaselineComparisonChartProps {
  result: BaselineHarnessResult;
}

export function BaselineComparisonChart({ result }: BaselineComparisonChartProps) {
  const maxAuc = 1.0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-semibold text-slate-100">
              M3 Domain-Aware Baseline Harness
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Task: <span className="text-slate-200 font-mono">{result.domain_task}</span> • Fixed benchmark suite locked against prompt tampering
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="text-slate-400">Claim vs. Best Baseline:</span>
          <span
            className={`px-2.5 py-1 rounded font-bold ${
              result.claim_beats_baselines
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
            }`}
          >
            {result.margin >= 0 ? `+${result.margin}` : `${result.margin}`} AUC
          </span>
        </div>
      </div>

      {/* Domain Context & Literature Anchor */}
      <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1 font-mono">
        <div className="flex items-center space-x-2 text-cyan-400 font-bold">
          <Info className="w-4 h-4 shrink-0" />
          <span>Why these baselines are fixed:</span>
        </div>
        <p className="text-slate-300 text-[11px] leading-relaxed">{result.why_fixed}</p>
        <div className="text-[10px] text-slate-500 pt-1">
          Reference: {result.clinical_reference}
        </div>
      </div>

      {/* Comparison Visualizer */}
      <div className="space-y-4">
        {/* Claimed Model Bar */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <div className="flex items-center space-x-2 font-semibold">
              <Award className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-100">Submitted Claim Model</span>
            </div>
            <div className="font-mono font-bold text-slate-100">
              AUC {result.claim_test_auc.toFixed(3)}
            </div>
          </div>
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-500 ${
                result.claim_beats_baselines ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              style={{ width: `${(result.claim_test_auc / maxAuc) * 100}%` }}
            />
          </div>
        </div>

        {/* Locked Baseline Models */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider">
            Locked Fixed Baselines:
          </div>

          {result.baselines.map((baseline, idx) => {
            const isBest = baseline.model_name === result.best_baseline_name;
            const beats = result.claim_test_auc > baseline.test_auc;
            const barWidth = (baseline.test_auc / maxAuc) * 100;

            return (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-xs transition-colors ${
                  isBest
                    ? 'border-cyan-500/40 bg-cyan-950/10'
                    : 'border-slate-800 bg-slate-950/40'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1 mb-1 font-mono">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-slate-200">{baseline.model_name}</span>
                    {isBest && (
                      <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px] uppercase font-bold">
                        Top Benchmark
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-3 text-slate-300">
                    <span className="text-slate-500 text-[11px]">CV: {baseline.cv_auc.toFixed(3)}</span>
                    <span className="font-bold text-slate-100">Test AUC: {baseline.test_auc.toFixed(3)}</span>
                    {beats ? (
                      <span className="text-emerald-400 flex items-center space-x-0.5 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Beaten</span>
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center space-x-0.5 text-[11px] font-bold">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>SURPASSES CLAIM</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800/80 h-2 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full transition-all duration-500 ${
                      isBest ? 'bg-cyan-400' : 'bg-slate-400'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-400">
                  {baseline.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
