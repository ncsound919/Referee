'use client';

import React, { useState } from 'react';
import { AUTONOMOUS_RESEARCH_QUESTIONS, ResearchQuestion } from '@/lib/research-questions';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { ClaimSpec } from '@/lib/types';
import { Sparkles, FlaskConical, CheckCircle2, ArrowRight, BookOpen, Layers } from 'lucide-react';

interface ResearchQuestionsViewProps {
  onRunAuditForQuestion: (claim: ClaimSpec) => void;
}

export function ResearchQuestionsView({ onRunAuditForQuestion }: ResearchQuestionsViewProps) {
  const [selectedPhase, setSelectedPhase] = useState<1 | 2 | 'all'>('all');
  const [activeQuestion, setActiveQuestion] = useState<ResearchQuestion>(AUTONOMOUS_RESEARCH_QUESTIONS[0]);

  const filteredQuestions = AUTONOMOUS_RESEARCH_QUESTIONS.filter(
    (q) => selectedPhase === 'all' || q.phase === selectedPhase
  );

  const handleLaunchExperiment = (q: ResearchQuestion) => {
    const claim = SAMPLE_CLAIMS[q.defaultClaimId] || SAMPLE_CLAIMS.oct2026_bonemets;
    // Override title/domain to match research question
    const customizedClaim: ClaimSpec = {
      ...claim,
      domain_task: q.domain,
      title: `[Research Q${q.id}]: ${q.title}`,
      raw_claim_text: `Testable Hypothesis: ${q.hypothesis}`,
    };
    onRunAuditForQuestion(customizedClaim);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Autonomous Research Basis</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              Ten Testable Hypotheses in Computational Oncology
            </h2>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Based on our hybrid architecture—the deterministic referee, digital wetlab, and Jevons MEV gatekeeper—these ten deep questions serve as the foundational research agenda for breast cancer, neuro-oncology, metastasis, and tumor profiling.
            </p>
          </div>
          <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start">
            <button
              onClick={() => setSelectedPhase('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                selectedPhase === 'all'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All (10)
            </button>
            <button
              onClick={() => setSelectedPhase(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                selectedPhase === 1
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Phase 1 (Core)
            </button>
            <button
              onClick={() => setSelectedPhase(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                selectedPhase === 2
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Phase 2 (Meta)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Questions List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider px-1">
            Registered Research Agenda ({filteredQuestions.length})
          </div>
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
            {filteredQuestions.map((q) => {
              const isSelected = activeQuestion.id === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => setActiveQuestion(q)}
                  className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-semibold">
                      Q{q.id} • Phase {q.phase}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      {q.domain.split('_')[0]}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200 line-clamp-2">
                    {q.title}
                  </h3>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Hypothesis & Experiment Launcher */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold">
                  Q{activeQuestion.id}
                </div>
                <div>
                  <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                    Phase {activeQuestion.phase} • Domain: {activeQuestion.domain}
                  </span>
                  <h3 className="text-lg font-bold text-slate-100">{activeQuestion.title}</h3>
                </div>
              </div>
              <button
                onClick={() => handleLaunchExperiment(activeQuestion)}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer self-start sm:self-auto"
              >
                <FlaskConical className="w-4 h-4" />
                <span>Run Wetlab Experiment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 font-sans text-sm">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Context & Motivation</span>
                </div>
                <p className="text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800 leading-relaxed">
                  {activeQuestion.context}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Testable Hypothesis</span>
                </div>
                <p className="text-slate-200 font-medium bg-slate-950/60 p-4 rounded-xl border border-slate-800 leading-relaxed">
                  {activeQuestion.hypothesis}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                  <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assigned Overlay365 Pipeline Experiment</span>
                </div>
                <p className="text-slate-300 bg-slate-950/60 p-4 rounded-xl border border-slate-800 font-mono text-xs leading-relaxed">
                  {activeQuestion.experimentDescription}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Expected Referee Outcome</span>
                </div>
                <p className="text-amber-300/90 bg-amber-950/20 p-4 rounded-xl border border-amber-900/40 text-xs leading-relaxed">
                  {activeQuestion.expectedOutcome}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
