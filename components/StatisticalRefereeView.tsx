'use client';

import React from 'react';
import { StatisticalRefereeResult } from '@/lib/types';
import {
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldCheck,
  TrendingUp,
  Percent,
} from 'lucide-react';

interface StatisticalRefereeViewProps {
  result: StatisticalRefereeResult;
}

export function StatisticalRefereeView({ result }: StatisticalRefereeViewProps) {
  const [ciLower, ciUpper] = result.bootstrap_ci_95;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-slate-100">
              M5 Statistical Referee (Locked Engine)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cluster Bootstrap (N=1,000, seed={result.bootstrap_seed}) • 0.30 Negative-Control Gate • Calibration • Decision Curve Analysis
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Never-NaN Enforced</span>
          </span>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Bootstrap AUC Estimate */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 mb-1">
            Cluster Bootstrap Mean
          </div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {result.claim_auc_estimate.toFixed(3)}
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            95% CI: [{ciLower.toFixed(3)}, {ciUpper.toFixed(3)}]
          </div>
        </div>

        {/* 0.30 Negative-Control Gate */}
        <div
          className={`p-4 rounded-lg border ${
            result.negative_control_gate_passed
              ? 'bg-slate-950 border-slate-800'
              : 'bg-rose-950/20 border-rose-800/50'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
            <span>Negative-Control Gate</span>
            <span className="text-[10px] text-slate-500">Threshold: ≤ 0.30</span>
          </div>
          <div className="flex items-baseline space-x-2">
            <span
              className={`text-xl font-bold font-mono ${
                result.negative_control_gate_passed ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {result.negative_control_agreement.toFixed(3)}
            </span>
            <span className="text-xs text-slate-400">agreement</span>
          </div>
          <div className="flex items-center space-x-1 text-[11px] font-mono mt-1">
            {result.negative_control_gate_passed ? (
              <span className="text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Passed (No Spurious Leak)</span>
              </span>
            ) : (
              <span className="text-rose-400 flex items-center space-x-1 font-bold">
                <XCircle className="w-3 h-3" />
                <span>Failed (&gt; 0.30 Spurious)</span>
              </span>
            )}
          </div>
        </div>

        {/* Calibration Slope & Intercept */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 mb-1">Calibration Slope / Int.</div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {result.calibration_slope.toFixed(2)}{' '}
            <span className="text-xs text-slate-400 font-normal">
              (int: {result.calibration_intercept.toFixed(2)})
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            Ideal: slope=1.00, int=0.00
          </div>
        </div>

        {/* Brier Score */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="text-[11px] font-mono text-slate-400 mb-1">Brier Score</div>
          <div className="text-xl font-bold font-mono text-slate-100">
            {result.brier_score.toFixed(3)}
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-1">
            P-value vs Null (0.50): {result.p_value_vs_baseline < 0.001 ? '< 0.001' : result.p_value_vs_baseline.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Calibration Curve Visualizer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Calibration Plot */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-200 font-mono">
              Calibration Plot (Observed vs Predicted)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">10 Probability Deciles</span>
          </div>

          <div className="relative h-44 w-full bg-slate-900/50 rounded border border-slate-800/80 p-2 flex flex-col justify-between">
            {/* SVG line and points */}
            <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* Perfect calibration 45-degree reference line */}
              <line x1="0" y1="100" x2="100" y2="0" stroke="#475569" strokeDasharray="3 3" strokeWidth="1" />

              {/* Model calibration line */}
              {result.calibration_curve.map((pt, i, arr) => {
                if (i === 0) return null;
                const prev = arr[i - 1];
                const x1 = prev.predicted_prob * 100;
                const y1 = 100 - prev.observed_freq * 100;
                const x2 = pt.predicted_prob * 100;
                const y2 = 100 - pt.observed_freq * 100;
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#10b981"
                    strokeWidth="2"
                  />
                );
              })}

              {/* Points */}
              {result.calibration_curve.map((pt, i) => {
                const cx = pt.predicted_prob * 100;
                const cy = 100 - pt.observed_freq * 100;
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={cy}
                    r="2.5"
                    fill="#34d399"
                    stroke="#047857"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>

            <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-1">
              <span>0.0 Predicted</span>
              <span>0.5</span>
              <span>1.0 Predicted</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            Dashed line = Ideal diagonal. Deviations indicate under-confidence or extreme probability compression.
          </p>
        </div>

        {/* Decision Curve Analysis (DCA) Net Benefit */}
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-200 font-mono">
              Decision Curve Analysis (Clinical Net Benefit)
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Vickers & Elkin Protocol</span>
          </div>

          <div className="relative h-44 w-full bg-slate-900/50 rounded border border-slate-800/80 p-2 flex flex-col justify-between overflow-hidden">
            <svg className="w-full h-full overflow-hidden" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <clipPath id="dca-clip-boundary">
                  <rect x="0" y="5" width="100" height="88" />
                </clipPath>
              </defs>

              {/* Zero net benefit line (Treat None) */}
              <line x1="0" y1="85" x2="100" y2="85" stroke="#64748b" strokeWidth="1" strokeDasharray="3 3" />

              <g clipPath="url(#dca-clip-boundary)">
                {/* Treat All curve */}
                {result.decision_curve.map((pt, i, arr) => {
                  if (i === 0) return null;
                  const prev = arr[i - 1];
                  const x1 = (prev.threshold / 0.65) * 100;
                  // Clamp y to bottom baseline (88) so negative net benefits don't puncture container
                  const rawY1 = 85 - prev.net_benefit_treat_all * 180;
                  const y1 = Math.min(88, Math.max(8, rawY1));
                  const x2 = (pt.threshold / 0.65) * 100;
                  const rawY2 = 85 - pt.net_benefit_treat_all * 180;
                  const y2 = Math.min(88, Math.max(8, rawY2));

                  return (
                    <line
                      key={`all_${i}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#f59e0b"
                      strokeDasharray="2 2"
                      strokeWidth="1.5"
                    />
                  );
                })}

                {/* Model Net Benefit curve */}
                {result.decision_curve.map((pt, i, arr) => {
                  if (i === 0) return null;
                  const prev = arr[i - 1];
                  const x1 = (prev.threshold / 0.65) * 100;
                  const rawY1 = 85 - prev.net_benefit_model * 180;
                  const y1 = Math.min(88, Math.max(8, rawY1));
                  const x2 = (pt.threshold / 0.65) * 100;
                  const rawY2 = 85 - pt.net_benefit_model * 180;
                  const y2 = Math.min(88, Math.max(8, rawY2));

                  return (
                    <line
                      key={`model_${i}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                    />
                  );
                })}
              </g>
            </svg>

            <div className="flex justify-between text-[9px] text-slate-500 font-mono pt-1">
              <span>Threshold: 5%</span>
              <span>Threshold: 35%</span>
              <span>Threshold: 65%</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 mt-2 font-mono">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-cyan-400 rounded" />
              <span>Model Net Benefit</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-amber-400 border-dashed rounded" />
              <span>Treat All Strategy</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-0.5 bg-slate-500 rounded" />
              <span>Treat None</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
