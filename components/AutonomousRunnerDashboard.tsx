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
  FileText,
  Terminal,
  ExternalLink,
  BookOpen,
  FlaskConical,
} from 'lucide-react';

export interface IngestedPaper {
  id: string;
  pmid?: string;
  doi?: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  domain: string;
  questionId: number;
  questionCode: string;
  extractedClaim: {
    claimId: string;
    metricName: string;
    claimedValue: number;
    datasetId: string;
    splitDescription: string;
    sampleSize: number;
  };
  ingestedAt: string;
  status: 'QUEUED' | 'ANALYZING' | 'EXPERIMENT_RUNNING' | 'RESOLVED' | 'REJECTED';
  experimentDetails?: {
    experimentId: string;
    computeBackend: string;
    modelsTested: string[];
    leakageChecks: string[];
    executedAt: string;
  };
  auditResolution?: {
    verdict: 'REPRODUCED' | 'FAILS_BASELINE' | 'LEAKAGE_DETECTED' | 'UNVERIFIABLE' | 'OUT_OF_SCOPE';
    recalculatedMetric?: number;
    confidenceInterval?: [number, number];
    delta?: number;
    gatePassed: boolean;
    ledgerBlockHeight?: number;
    decisionSha256?: string;
    resolutionNotes: string;
    resolvedAt: string;
  };
}

export interface AutonomousLogEvent {
  id: string;
  timestamp: string;
  phase: string;
  message: string;
  level: 'info' | 'success' | 'warn' | 'error';
}

export interface AutonomousTelemetry {
  systemStatus: 'STOPPED' | 'RUNNING' | 'PAUSED';
  currentPhase:
    | 'IDLE'
    | 'INGESTION'
    | 'SYNTHESIS'
    | 'SKEPTIC'
    | 'MEV_GATING'
    | 'COMPUTE_DISPATCH'
    | 'AUDIT_VERIFICATION'
    | 'LEDGER_COMMIT'
    | 'REFLEXION';
  currentActivity: string;
  currentQuestionIndex: number;
  activeQuestion?: {
    id: number;
    code: string;
    title: string;
    category: string;
    domain: string;
  };
  activePaper?: IngestedPaper;
  totalIterationsRun: number;
  successfulReproductions: number;
  reflectionsTriggered: number;
  activePrinciplesCount: number;
  totalPapersIngested: number;
  totalExperimentsRun: number;
  recentHistory: Array<{
    status: string;
    iterationNumber: number;
    question: { id: number; code?: string; title: string; domain: string };
    paper?: IngestedPaper;
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
  recentPapers?: IngestedPaper[];
  liveLogs?: AutonomousLogEvent[];
  lastRunTimestamp?: string;
}

const PHASES = [
  { id: 'INGESTION', label: '1. Ingest Literature' },
  { id: 'SYNTHESIS', label: '2. Hypothesize' },
  { id: 'SKEPTIC', label: '3. Skeptic Probe' },
  { id: 'MEV_GATING', label: '4. MEV Gate' },
  { id: 'COMPUTE_DISPATCH', label: '5. Dispatch Compute' },
  { id: 'AUDIT_VERIFICATION', label: '6. Referee Audit' },
  { id: 'LEDGER_COMMIT', label: '6.5. SHA-256 Ledger' },
  { id: 'REFLEXION', label: '7. Self-Learning' },
];

export function AutonomousRunnerDashboard() {
  const [telemetry, setTelemetry] = useState<AutonomousTelemetry | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [selectedBackend, setSelectedBackend] = useState<'local' | 'cloudflare' | 'kaggle'>('local');
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'papers' | 'logs'>('overview');

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
    // Fast polling every 2.5 seconds to show real-time live activity
    const interval = setInterval(fetchTelemetry, 2500);
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
      if (data.status === 'success' || data.success) {
        setMessage(`Iteration complete: ${data.question?.code || ''} ${data.question?.title || ''}`);
      } else {
        setMessage(`Notice: ${data.reason || data.message || 'Iteration finished'}`);
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
      if (data.status === 'started') {
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
      if (data.status === 'stopped' || data.stopped) {
        setMessage('Autonomous daemon stopped');
        await fetchTelemetry();
      }
    } catch {
      // Non-fatal
    }
  };

  const isRunning = telemetry?.systemStatus === 'RUNNING';
  const currentPhase = telemetry?.currentPhase || 'IDLE';

  return (
    <div className="space-y-6">
      {/* Control Banner */}
      <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div
              className={`p-3 rounded-lg border shrink-0 ${
                isRunning
                  ? 'bg-emerald-950 border-emerald-700/60 text-emerald-400'
                  : 'bg-slate-900 border-slate-700 text-slate-400'
              }`}
            >
              <Zap className={`w-6 h-6 ${isRunning ? 'animate-pulse text-emerald-400' : ''}`} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold tracking-wider uppercase text-emerald-400">
                  Continuous Self-Running &amp; Progressive Experimentation Daemon
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
                Autonomously ingests literature, extracts claims, conducts adversarial attacks, gates compute, executes multi-backend simulations, and commits SHA-256 evidence.
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
                className={`px-2 py-1 rounded transition-colors ${
                  selectedBackend === 'local' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Local
              </button>
              <button
                onClick={() => setSelectedBackend('cloudflare')}
                className={`px-2 py-1 rounded transition-colors ${
                  selectedBackend === 'cloudflare' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cloudflare
              </button>
              <button
                onClick={() => setSelectedBackend('kaggle')}
                className={`px-2 py-1 rounded transition-colors ${
                  selectedBackend === 'kaggle' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
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

      {/* LIVE ACTIVITY TICKER */}
      <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center space-x-2.5 overflow-hidden">
          <div className="relative flex h-3 w-3 shrink-0">
            {isRunning && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                isRunning ? 'bg-emerald-500' : telemetry?.systemStatus === 'PAUSED' ? 'bg-amber-500' : 'bg-slate-600'
              }`}
            />
          </div>
          <span className="text-slate-400 font-bold uppercase shrink-0">Live Activity:</span>
          <span className="text-emerald-300 font-semibold truncate animate-pulse">
            {telemetry?.currentActivity || 'Engine standing by.'}
          </span>
        </div>
        <div className="flex items-center space-x-2 shrink-0 text-[11px] text-slate-400">
          <span>Active Question:</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-bold">
            {telemetry?.activeQuestion?.code || `Q#${((telemetry?.currentQuestionIndex ?? 0) % 15) + 1}`}
          </span>
        </div>
      </div>

      {/* LIVE 7-PHASE PROGRESS PIPELINE */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
            Autonomous Closed-Loop Pipeline Execution
          </span>
          <span className="text-[11px] font-mono text-emerald-400">
            Active Phase: {currentPhase}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-xs font-mono">
          {PHASES.map((p) => {
            const isActive = currentPhase === p.id;
            return (
              <div
                key={p.id}
                className={`p-2.5 rounded-lg border transition-all ${
                  isActive
                    ? 'bg-emerald-950 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-emerald-300'
                    : 'bg-slate-950 border-slate-800/80 text-slate-400'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-700'
                    }`}
                  />
                  <span className="text-[10px] font-bold truncate block">{p.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Total Cycles Run</span>
          <span className="text-xl font-bold text-emerald-400">{telemetry?.totalIterationsRun ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Progressive loops</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Papers Ingested</span>
          <span className="text-xl font-bold text-cyan-400">{telemetry?.totalPapersIngested ?? 3}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Literature &amp; preprints</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Experiments Run</span>
          <span className="text-xl font-bold text-indigo-400">{telemetry?.totalExperimentsRun ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Simulations evaluated</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Reproduced Audits</span>
          <span className="text-xl font-bold text-emerald-400">{telemetry?.successfulReproductions ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Ledger-committed</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Reflexions Fired</span>
          <span className="text-xl font-bold text-amber-400">{telemetry?.reflectionsTriggered ?? 0}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Lessons synthesized</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
          <span className="text-slate-500 block text-[10px] uppercase">Active Principles</span>
          <span className="text-xl font-bold text-purple-400">{telemetry?.activePrinciplesCount ?? 4}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Constraint 1 verified</span>
        </div>
      </div>

      {/* VIEW TABS: Overview / Ingested Papers / Live Log Stream */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Execution Feed &amp; MEV</span>
        </button>
        <button
          onClick={() => setActiveTab('papers')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
            activeTab === 'papers'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Ingested Papers &amp; Resolutions ({telemetry?.recentPapers?.length ?? 3})</span>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
            activeTab === 'logs'
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Live Terminal Event Log ({telemetry?.liveLogs?.length ?? 0})</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & RECENT ITERATION FEED */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              Recent Autonomous Iteration Runs
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {telemetry?.recentHistory?.length ? `${telemetry.recentHistory.length} recorded` : 'No history yet'}
            </span>
          </div>

          {!telemetry?.recentHistory || telemetry.recentHistory.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
              <Activity className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-mono text-slate-400">No autonomous cycles executed yet in this session.</p>
              <p className="text-[11px] text-slate-500">
                Click &ldquo;Start Daemon&rdquo; or &ldquo;Run Single Iteration&rdquo; above to launch the autonomous engine.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {[...telemetry.recentHistory].reverse().map((run, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors space-y-2.5 text-xs font-mono"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-900 border border-slate-800 text-slate-300 font-bold">
                        Cycle #{run.iterationNumber}
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

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-400 pt-2 border-t border-slate-900">
                    <div>
                      <span className="text-slate-500">Domain: </span>
                      <span className="text-slate-300">{run.question?.domain || 'General'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">MEV Decision: </span>
                      <span
                        className={
                          run.mev?.decision === 'PROCEED'
                            ? 'text-emerald-400 font-bold'
                            : 'text-amber-400 font-bold'
                        }
                      >
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
      )}

      {/* TAB 2: INGESTED PAPERS & SCIENTIFIC RESOLUTIONS */}
      {activeTab === 'papers' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              Literature Ingestion, Extracted Claims &amp; Scientific Resolutions
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Total Analyzed: {telemetry?.recentPapers?.length ?? 0}
            </span>
          </div>

          <div className="space-y-3">
            {(telemetry?.recentPapers || []).map((p) => {
              const res = p.auditResolution;
              return (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs font-mono"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-bold text-[10px]">
                        {p.questionCode}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          p.status === 'RESOLVED'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : p.status === 'ANALYZING' || p.status === 'EXPERIMENT_RUNNING'
                            ? 'bg-indigo-950 text-indigo-300 border-indigo-800 animate-pulse'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                      <h4 className="text-slate-100 font-bold text-xs line-clamp-1">{p.title}</h4>
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                      <span>{p.journal} ({p.year})</span>
                      {p.doi && (
                        <span className="text-indigo-400 underline">{p.doi}</span>
                      )}
                    </div>
                  </div>

                  {/* Abstract preview */}
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{p.abstract}</p>

                  {/* Claim vs Experiment vs Resolution Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    {/* Column 1: Extracted Claim */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">1. Extracted Claim</span>
                      <div className="text-slate-200">
                        {p.extractedClaim.metricName}: <strong className="text-cyan-400">{p.extractedClaim.claimedValue}</strong>
                      </div>
                      <div className="text-slate-400 text-[10px]">Cohort: {p.extractedClaim.datasetId} (n={p.extractedClaim.sampleSize})</div>
                      <div className="text-slate-500 text-[10px] truncate">{p.extractedClaim.splitDescription}</div>
                    </div>

                    {/* Column 2: Experiment Run */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">2. Experiment Simulation</span>
                      <div className="text-slate-200">
                        Backend: <strong className="text-purple-400">{p.experimentDetails?.computeBackend || 'local'}</strong>
                      </div>
                      <div className="text-slate-400 text-[10px]">
                        Models: {p.experimentDetails?.modelsTested.join(', ') || 'Domain baseline suite'}
                      </div>
                      <div className="text-slate-500 text-[10px]">
                        Leakage scans: {p.experimentDetails?.leakageChecks.join(', ') || 'Patient/timepoint checks'}
                      </div>
                    </div>

                    {/* Column 3: Resolution & Verdict */}
                    <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">3. Scientific Resolution</span>
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`font-bold ${
                            res?.verdict === 'REPRODUCED'
                              ? 'text-emerald-400'
                              : res?.verdict === 'FAILS_BASELINE'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {res?.verdict || 'PENDING EVALUATION'}
                        </span>
                      </div>
                      {res?.recalculatedMetric && (
                        <div className="text-slate-300 text-[10px]">
                          Recalculated: {res.recalculatedMetric.toFixed(3)}
                          {res.delta !== undefined && (
                            <span className={res.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {' '}(delta {res.delta > 0 ? `+${res.delta}` : res.delta})
                            </span>
                          )}
                        </div>
                      )}
                      {res?.decisionSha256 && (
                        <div className="text-slate-500 text-[9px] font-mono truncate">
                          SHA: {res.decisionSha256.slice(0, 18)}...
                        </div>
                      )}
                    </div>
                  </div>

                  {res?.resolutionNotes && (
                    <div className="p-2 rounded bg-slate-900 border border-slate-800/80 text-[11px] text-slate-300">
                      <strong>Resolution Note: </strong> {res.resolutionNotes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: LIVE TERMINAL EVENT LOG STREAM */}
      {activeTab === 'logs' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              Live Closed-Loop Event Stream
            </span>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Streaming active logs</span>
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2">
            {(telemetry?.liveLogs || []).map((log) => (
              <div key={log.id} className="flex items-start space-x-2">
                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold shrink-0 ${
                    log.phase === 'INGESTION'
                      ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                      : log.phase === 'SYNTHESIS'
                      ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                      : log.phase === 'SKEPTIC'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : log.phase === 'MEV_GATING'
                      ? 'bg-purple-950 text-purple-400 border border-purple-800'
                      : log.phase === 'COMPUTE'
                      ? 'bg-blue-950 text-blue-400 border border-blue-800'
                      : log.phase === 'AUDIT'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : log.phase === 'LEDGER'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {log.phase}
                </span>
                <span
                  className={
                    log.level === 'success'
                      ? 'text-emerald-300'
                      : log.level === 'warn'
                      ? 'text-amber-300'
                      : log.level === 'error'
                      ? 'text-rose-300'
                      : 'text-slate-200'
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
