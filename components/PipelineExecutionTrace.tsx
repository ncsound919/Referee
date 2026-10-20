'use client';

import React from 'react';
import { OrchestrationLogStep } from '@/lib/types';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Activity,
  Layers,
} from 'lucide-react';

interface PipelineExecutionTraceProps {
  steps: OrchestrationLogStep[];
  toolCallCount: number;
}

export function PipelineExecutionTrace({ steps, toolCallCount }: PipelineExecutionTraceProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Deterministic Pipeline Execution Trace
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="text-slate-400">Rule 6 Tool Invocations:</span>
          <span
            className={`px-2 py-0.5 rounded font-bold ${
              toolCallCount > 8
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'bg-slate-800 text-emerald-400 border border-slate-700'
            }`}
          >
            {toolCallCount} / 10 Max
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step) => {
          let statusBadge = (
            <span className="flex items-center space-x-1 text-emerald-400 text-xs font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PASSED</span>
            </span>
          );

          if (step.output_status === 'BLOCKED') {
            statusBadge = (
              <span className="flex items-center space-x-1 text-rose-400 text-xs font-mono font-bold">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>HARD GATE BLOCKED</span>
              </span>
            );
          } else if (step.output_status === 'FAILED') {
            statusBadge = (
              <span className="flex items-center space-x-1 text-amber-400 text-xs font-mono">
                <XCircle className="w-3.5 h-3.5" />
                <span>GATE FAILED</span>
              </span>
            );
          } else if (step.output_status === 'UNVERIFIABLE') {
            statusBadge = (
              <span className="flex items-center space-x-1 text-purple-400 text-xs font-mono">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>UNVERIFIABLE</span>
              </span>
            );
          } else if (step.output_status === 'RUNNING') {
            statusBadge = (
              <span className="flex items-center space-x-1 text-cyan-400 text-xs font-mono">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>RUNNING</span>
              </span>
            );
          }

          return (
            <div
              key={step.step_number}
              className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg text-xs font-mono hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center space-x-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-bold">
                    #{step.step_number}
                  </span>
                  <span className="text-slate-400">{step.layer}</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-emerald-300 font-semibold">{step.tool_name}</span>
                </div>
                {statusBadge}
              </div>

              <div className="text-slate-400 pl-7 text-[11px] mb-1">
                <span className="text-slate-500">Input:</span> {step.input_summary}
              </div>

              <div className="text-slate-200 pl-7 text-[11px] bg-slate-900/60 p-2 rounded border border-slate-800/50">
                <span className="text-emerald-400/80 font-semibold">Engine Result:</span>{' '}
                {step.details}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
