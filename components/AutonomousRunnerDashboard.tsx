'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Play,
  Pause,
  Square,
  RefreshCw,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  Server,
  Cloud,
  ChevronRight,
  Database,
} from 'lucide-react';

export interface AutonomousTelemetry {
  systemStatus: 'STOPPED' | 'RUNNING' | 'PAUSED';
  currentQuestionIndex: number;
  totalIterationsRun: number;
  successfulReproductions: number;
  reflectionsTriggered: number;
  activePrinciplesCount: number;
  recentHistory: Array<{
    status: string;
    iterationNumber: number;
    question: { id: string; title: string; domain: string };
    computeEngineUsed?: string;
    mev?: {
      mev: number;
      decision: string;
      uTarget: number;
      cCompute: number;
      rRisk: number;
    };
    auditOutput?: {
      overall_verdict?: string;
      decision_sha256?: string;
    };
    nextStepRecommendation?: string;
    timestamp: string;
    reason?: string;
  }>;
  lastRunTimestamp?: string;
}

export function AutonomousRunnerDashboard() {
  const [telemetry, setTelemetry] = useState<AutonomousTelemetry | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedBackend, setSelectedBackend] = useState<'local' | 'cloudflare' | 'kaggle'>('local');
  const [message, setMessage] = useState<string | null>(null);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomous/run');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 6000);
    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  const handleStep = async () => {
    setIsExecuting(true);
    setMessage(`Executing progressive iteration step on ${selectedBackend} backend...`);
    try {
      const res = await fetch('/api/autonomous/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'step', backend: selectedBackend }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Iteration #${data.result?.iterationNumber ?? ''} complete: ${data.result?.status} (${data.result?.nextStepRecommendation ?? 'Progress saved'})`);
      } else {
        setMessage(`Notice: ${data.message || 'Iteration finished'}`);
      }
      await fetchTelemetry();
    } catch (err) {
      setMessage(`Step failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExecuting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleStartDaemon = async () => {
    try {
      const res = await fetch('/api/autonomous/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', intervalMs: 20000 }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Autonomous daemon started (20s interval closed loop)');
        await fetchTelemetry();
      }
    } catch {
      // Non-fatal
    }
  };

  const handlePauseDaemon = async () => {
    try {
      const res = await fetch('/api/autonomous/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      const data = await res.json();
      if (data.status === 'paused' || data.paused) {
        setMessage('Autonomous daemon paused');
        await fetchTelemetry();
      }
    } catch {
      // Non-fatal
    }
  };

  const handleStopDaemon = async () => {
    try {
      const res = await fetch('/api/autonomous/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Autonomous daemon stopped');
        await fetchTelemetry();
      }
    } catch {
      // Non-fatal
    }
  };

  const isRunning = telemetry?.systemStatus === 'RUNNING';

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className={`p-3 rounded-lg border shrink-0 ${isRunning ? 'bg-emerald-950 border-emerald-700/60 text-emerald-400' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
              <Zap className={`w-6 h-6 ${isRunning ? 'animate-pulse text-emerald-400' : ''}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold tracking-wider uppercase text-emerald-400">
                  Continuous Self-Running & Progressive Experimentation Daemon
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    isRunning
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700 animate-pulse'
                      : telemetry?.systemStatus === 'PAUSED'
                      ? 'bg-amber-950/90 text-amber-300 border-amber-700'
                      : 'bg-rose-950/90 text-rose-300 border-rose-700'
                  }`}
                >
                  STATUS: {telemetry?.systemStatus ?? 'INITIALIZING'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Autonomously cycles through the 10-Question Research Agenda, synthesizes hypotheses, attacks with skeptic critique, gates with MEV, dispatches to offload compute, and reinforces the Experience Base.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Backend Selector */}
            <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 rounded-lg p-1 text-xs font-mono">
              <span className="text-slate-500 px-1 text-[11px]">Compute:</span>
              <button
                onClick={() => setSelectedBackend('local')}
                className={`px-2 py-1 rounded transition-colors ${selectedBackend === 'local' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Local
              </button>
              <button
                onClick={() => setSelectedBackend('cloudflare')}
                className={`px-2 py-1 rounded transition-colors ${selectedBackend === 'cloudflare' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Cloudflare
              </button>
              <button
                onClick={() => setSelectedBackend('kaggle')}
                className={`px-2 py-1 rounded transition-colors ${selectedBackend === 'kaggle' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'}`}
              >
                Kaggle
              </button>
            </div>

            {/* Run Step Button */}
            <button
              onClick={handleStep}
              disabled={isExecuting}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-mono font-semibold transition-all shadow-md cursor-pointer"
            >
              <Activity className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin' : ''}`} />
              <span>{isExecuting ? 'Running Step...' : 'Run Single Iteration'}</span>
            </button>

            {/* Start / Pause / Stop Daemon */}
            {!isRunning ? (
              <button
                onClick={handleStartDaemon}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer shadow-sm"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{telemetry?.systemStatus === 'PAUSED' ? 'Resume Daemon' : 'Start Daemon'}</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handlePauseDaemon}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause</span>
                </button>
                <button
                  onClick={handleStopDaemon}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-mono font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </div>
            )}

            <button
              onClick={fetchTelemetry}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Status Notice */}
      {message && (
        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/50 text-xs font-mono text-emerald-300 flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{message}</span>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Total Cycles Run</span>
          <span className="text-xl font-bold text-emerald-400">{telemetry?.totalIterationsRun ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Progressive steps</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Active Question</span>
          <span className="text-xl font-bold text-cyan-400">Q#{((telemetry?.currentQuestionIndex ?? 0) % 10) + 1}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">of 10 agenda items</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Reproduced Audits</span>
          <span className="text-xl font-bold text-indigo-400">{telemetry?.successfulReproductions ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Ledger-committed</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Reflexions Fired</span>
          <span className="text-xl font-bold text-amber-400">{telemetry?.reflectionsTriggered ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Self-learning lessons</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Active Principles</span>
          <span className="text-xl font-bold text-emerald-400">{telemetry?.activePrinciplesCount ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Constraint 1 verified</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Compute Target</span>
          <span className="text-xl font-bold text-purple-400 uppercase">{selectedBackend}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Workers / Cluster</span>
        </div>
      </div>

      {/* 7-Phase Closed-Loop Architecture */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
            Autonomous Closed-Loop Pipeline (Phases 1 → 7)
          </span>
          <span className="text-[11px] font-mono text-emerald-400">Deterministic &amp; Bounded</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-xs font-mono">
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 1</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">Question Selection</span>
            <span className="text-[10px] text-slate-400 block mt-1">10-Question oncology agenda</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 2</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">Hypothesis Synth</span>
            <span className="text-[10px] text-slate-400 block mt-1">Skills &amp; domain fusion</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 3</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">Skeptic Attack</span>
            <span className="text-[10px] text-slate-400 block mt-1">Leakage &amp; confound probe</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 4</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">MEV Gate</span>
            <span className="text-[10px] text-slate-400 block mt-1">Compute cost vs. uplift</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 5</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">Compute Dispatch</span>
            <span className="text-[10px] text-slate-400 block mt-1">Local / CF / Kaggle 3-node</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 6</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">Audit &amp; Ledger</span>
            <span className="text-[10px] text-slate-400 block mt-1">SHA-256 chained verdict</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80">
            <span className="text-[10px] text-slate-500 block uppercase font-bold">Phase 7</span>
            <span className="text-slate-200 font-semibold block text-[11px] mt-0.5">Self-Learning</span>
            <span className="text-[10px] text-slate-400 block mt-1">Reflexion &amp; utility update</span>
          </div>
        </div>
      </div>

      {/* Recent History Feed */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
            Recent Autonomous Iteration Runs
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            {telemetry?.recentHistory?.length ? `${telemetry.recentHistory.length} recorded` : 'No history yet'}
          </span>
        </div>

        {(!telemetry?.recentHistory || telemetry.recentHistory.length === 0) ? (
          <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
            <Activity className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-mono text-slate-400">No autonomous cycles executed yet in this session.</p>
            <p className="text-[11px] text-slate-500">Click &ldquo;Run Single Iteration&rdquo; or &ldquo;Start Daemon&rdquo; above to launch the autonomous engine.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {[...telemetry.recentHistory].reverse().map((run, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-2 text-xs font-mono"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-slate-300 font-bold">
                      #{run.iterationNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        run.status === 'success'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : run.status === 'halted_by_mev'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : run.status === 'skipped'
                          ? 'bg-slate-900 text-slate-400 border border-slate-800'
                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                      }`}
                    >
                      {run.status.toUpperCase()}
                    </span>
                    <span className="text-slate-200 font-semibold">{run.question?.title || 'Autonomous Question'}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-slate-400">
                    {run.computeEngineUsed && (
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-purple-300 border border-slate-800">
                        {run.computeEngineUsed}
                      </span>
                    )}
                    <span>{new Date(run.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                  <div>
                    <span className="text-slate-500">Domain: </span>
                    <span className="text-slate-300">{run.question?.domain || 'General'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">MEV Evaluation: </span>
                    <span className={run.mev?.decision === 'PROCEED' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                      {run.mev ? `${run.mev.decision} (Score: ${run.mev.mev.toFixed(3)})` : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Verdict: </span>
                    <span className="text-slate-300 font-bold">
                      {run.auditOutput?.overall_verdict || run.reason || 'N/A'}
                    </span>
                  </div>
                </div>

                {run.nextStepRecommendation && (
                  <div className="text-[11px] text-indigo-300 bg-indigo-950/20 border border-indigo-900/40 p-2 rounded">
                    <strong>Next Step: </strong> {run.nextStepRecommendation}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
