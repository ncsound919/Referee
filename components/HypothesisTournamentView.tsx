'use client';

import React, { useState, useEffect } from 'react';
import { HypothesisRecord, MOCK_PAPER_CLAIMS } from '@/lib/hypothesis/types';
import { Sparkles, Brain, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight, FlaskConical, Layers, Play } from 'lucide-react';

interface HypothesisTournamentViewProps {
  onRunAuditWithHypothesis?: (claimText: string, domain: string) => void;
}

export function HypothesisTournamentView({ onRunAuditWithHypothesis }: HypothesisTournamentViewProps) {
  const [queue, setQueue] = useState<HypothesisRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [gapDescription, setGapDescription] = useState(
    'Combat cross-validation collapse in multi-center neuro-oncology MRI radiomic feature extraction using ComBat batch harmonization.'
  );
  const [selectedDomain, setSelectedDomain] = useState('neuro_oncology_pseudoprogression');
  const [userRole, setUserRole] = useState('academic');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/hypothesis/generate');
      const data = await res.json();
      if (data.queue) {
        setQueue(data.queue);
      }
    } catch (err) {
      console.error('Failed to fetch hypothesis queue:', err);
    }
  };

  const handleGenerateHypothesis = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatusMessage('Running Generation → Skeptic → Pre-Check Pipeline...');

    try {
      const res = await fetch('/api/hypothesis/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gapDescription,
          domain: selectedDomain,
          userRole,
        }),
      });

      const data = await res.json();
      if (res.ok && data.hypothesis) {
        setStatusMessage(`Successfully queued hypothesis! Skeptic review passed.`);
        await fetchQueue();
      } else {
        setStatusMessage(`Rejected: ${data.reason || data.error}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Error: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner / Intro */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/50 border border-indigo-500/30 p-6 sm:p-8 shadow-xl">
        <div className="max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Hypothesis Generation Layer & Tournament Queue</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
            Grounded → Adversarial Review → Tournament → Referee
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed font-sans">
            Proposes testable, cross-domain oncology hypotheses, runs them through the adversarial Skeptic and FastAPI deterministic pre-checks, and queues them for the Digital Wetlab referee.
          </p>

          {/* 5 Iron Rules Badges */}
          <div className="pt-2 flex flex-wrap gap-2 text-[11px] font-mono">
            <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-300">
              1. Skill Library Boundary
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-300">
              2. Falsification Rule
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-300">
              3. Provenance (DOI)
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-300">
              4. Adversarial Skeptic
            </span>
            <span className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-indigo-300">
              5. FastAPI Pre-Check
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Generator Form */}
        <div className="lg:col-span-1 space-y-6">
          <form onSubmit={handleGenerateHypothesis} className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center space-x-2 text-sm font-mono font-bold text-slate-200 border-b border-slate-800 pb-3">
              <Brain className="w-4 h-4 text-indigo-400" />
              <span>Propose New Hypothesis</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Target Domain</label>
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="neuro_oncology_pseudoprogression">Neuro-Oncology (Pseudoprogression)</option>
                <option value="breast_transcriptomic_metastasis">Breast Cancer (Transcriptomic Metastasis)</option>
                <option value="breast_pathology_lymph_node">Pathology (Lymph Node WSI)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">Knowledge Gap Description</label>
              <textarea
                rows={4}
                value={gapDescription}
                onChange={(e) => setGapDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                placeholder="Describe the research gap..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono text-slate-400">User Role (License Check)</label>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="academic">Academic Researcher</option>
                <option value="industry">Industry / Commercial</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs font-mono transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{isLoading ? 'Running Checks...' : 'Generate & Pre-Check'}</span>
            </button>

            {statusMessage && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-300">
                {statusMessage}
              </div>
            )}
          </form>

          {/* Reference Paper Corpus */}
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3 shadow-xl">
            <div className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
              Grounded Paper Corpus ({MOCK_PAPER_CLAIMS.length})
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {MOCK_PAPER_CLAIMS.map((p) => (
                <div key={p.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-[11px] font-mono space-y-1">
                  <div className="text-indigo-400 font-semibold">{p.doi}</div>
                  <div className="text-slate-400 line-clamp-1">{p.claimText}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Tournament Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
              Tournament Queue & Surviving Hypotheses ({queue.length})
            </div>
            <button
              onClick={fetchQueue}
              className="text-xs font-mono text-indigo-400 hover:text-indigo-300 underline"
            >
              Refresh Queue
            </button>
          </div>

          <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
            {queue.length === 0 ? (
              <div className="text-center py-16 rounded-2xl bg-slate-900/60 border border-slate-800 text-slate-500 font-mono text-xs">
                No hypotheses queued yet. Propose a gap to start the tournament.
              </div>
            ) : (
              queue.map((hyp) => (
                <div key={hyp.id} className="rounded-2xl bg-slate-900 border border-indigo-500/30 p-6 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div className="flex items-center space-x-2.5">
                      <span className="px-2.5 py-1 rounded text-xs font-mono bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold">
                        {hyp.status}
                      </span>
                      <span className="text-xs font-mono text-slate-400">MEV: {hyp.mevScore}</span>
                    </div>
                    {onRunAuditWithHypothesis && (
                      <button
                        onClick={() => onRunAuditWithHypothesis(hyp.claimText, hyp.domain)}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs transition-all cursor-pointer self-start sm:self-auto"
                      >
                        <FlaskConical className="w-3.5 h-3.5" />
                        <span>Run in Digital Wetlab</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 font-sans text-xs">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Claim Text</span>
                      <p className="text-sm font-semibold text-slate-100">{hyp.claimText}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 font-mono">
                        <span className="text-[10px] text-slate-500 uppercase">Testable Pipeline (Skills)</span>
                        <div className="text-slate-300 text-[11px]">
                          {hyp.testablePipeline.join(', ')}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 font-mono">
                        <span className="text-[10px] text-slate-500 uppercase">Expected Outcome</span>
                        <div className="text-emerald-400 text-[11px]">
                          {hyp.expectedOutcome.metric} {hyp.expectedOutcome.direction} by {hyp.expectedOutcome.magnitude}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Adversarial Skeptic Critique</span>
                      <p className="text-slate-300 italic">{hyp.skepticCritique}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Falsification Criterion</span>
                      <p className="text-amber-300">{hyp.falsification}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
