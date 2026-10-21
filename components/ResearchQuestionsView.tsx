'use client';

import React, { useState } from 'react';
import { AUTONOMOUS_RESEARCH_QUESTIONS, ResearchQuestion } from '@/lib/research-questions';
import { COMMUNITY_BOUNTIES, CommunityBounty } from '@/lib/bounties';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import { ClaimSpec } from '@/lib/types';
import {
  Sparkles,
  FlaskConical,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  Layers,
  Award,
  Calendar,
  ShieldAlert,
  Database,
  Search,
  Filter,
} from 'lucide-react';

interface ResearchQuestionsViewProps {
  onRunAuditForQuestion: (claim: ClaimSpec) => void;
}

export function ResearchQuestionsView({ onRunAuditForQuestion }: ResearchQuestionsViewProps) {
  const [mainView, setMainView] = useState<'questions' | 'bounties' | 'timeline'>('questions');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeQuestion, setActiveQuestion] = useState<ResearchQuestion>(AUTONOMOUS_RESEARCH_QUESTIONS[0]);
  const [bountySearch, setBountySearch] = useState<string>('');
  const [bountyDifficulty, setBountyDifficulty] = useState<string>('all');

  const filteredQuestions = AUTONOMOUS_RESEARCH_QUESTIONS.filter(
    (q) => selectedCategory === 'all' || q.category === selectedCategory
  );

  const filteredBounties = COMMUNITY_BOUNTIES.filter((b) => {
    const matchesDiff = bountyDifficulty === 'all' || b.difficulty.toLowerCase() === bountyDifficulty.toLowerCase();
    const matchesSearch =
      b.title.toLowerCase().includes(bountySearch.toLowerCase()) ||
      b.objective.toLowerCase().includes(bountySearch.toLowerCase()) ||
      b.datasetsAndTools.toLowerCase().includes(bountySearch.toLowerCase());
    return matchesDiff && matchesSearch;
  });

  const handleLaunchExperiment = (q: ResearchQuestion) => {
    const claim = SAMPLE_CLAIMS[q.defaultClaimId] || SAMPLE_CLAIMS.oct2026_bonemets;
    const customizedClaim: ClaimSpec = {
      ...claim,
      domain_task: q.domain,
      title: `[Research ${q.code}]: ${q.title}`,
      raw_claim_text: `Testable Hypothesis: ${q.hypothesis}\nStudy Design: ${q.studyDesign}`,
    };
    onRunAuditForQuestion(customizedClaim);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Translational Oncology Research Plan &amp; Open Bounties</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              15 Prioritized Oncology Questions &amp; 50 Community Bounties
            </h2>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              Synthesizing breakthroughs across breast cancer, spatial tumor atlases (HTAN), liquid biopsy (ctDNA), functional precision medicine, and neuro-oncology—enforced by the deterministic Referee and Jevons MEV gatekeeper.
            </p>
          </div>

          {/* Top Main Mode Toggle */}
          <div className="flex items-center space-x-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start">
            <button
              onClick={() => setMainView('questions')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                mainView === 'questions'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span>15 Research Questions</span>
            </button>
            <button
              onClick={() => setMainView('bounties')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                mainView === 'bounties'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>50 Bounties</span>
            </button>
            <button
              onClick={() => setMainView('timeline')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                mainView === 'timeline'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Timeline / Gantt</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: 15 Prioritized Research Questions */}
      {mainView === 'questions' && (
        <div className="space-y-6">
          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono text-slate-500 mr-1">Category:</span>
            {['all', 'Breast Cancer', 'Tumor Genomics', 'Metastasis Biology', 'Neuro-Oncology'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {cat === 'all' ? `All (15)` : cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Questions List */}
            <div className="lg:col-span-1 space-y-3">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider px-1">
                Prioritized Questions ({filteredQuestions.length})
              </div>
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-2">
                {filteredQuestions.map((q) => {
                  const isSelected = activeQuestion.id === q.id;
                  return (
                    <button
                      key={q.id}
                      onClick={() => setActiveQuestion(q)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-950/30 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-emerald-400 font-bold">
                          {q.code}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {q.category}
                        </span>
                      </div>
                      <h3 className="text-xs font-semibold text-slate-200 line-clamp-2">
                        {q.title}
                      </h3>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Column: Detailed Hypothesis & Experiment Launcher */}
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-sm shrink-0">
                      {activeQuestion.code}
                    </div>
                    <div>
                      <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider">
                        {activeQuestion.category} • Task: {activeQuestion.domain}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-slate-100">{activeQuestion.title}</h3>
                    </div>
                  </div>
                  <button
                    onClick={() => handleLaunchExperiment(activeQuestion)}
                    className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all shadow-md cursor-pointer self-start sm:self-auto shrink-0"
                  >
                    <FlaskConical className="w-4 h-4" />
                    <span>Run In Wetlab</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4 font-sans text-xs">
                  {/* Context & Rationale */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-1.5 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Context &amp; Rationale</span>
                    </div>
                    <p className="text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
                      {activeQuestion.context}
                    </p>
                  </div>

                  {/* Testable Hypothesis */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-1.5 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Testable Hypothesis</span>
                    </div>
                    <p className="text-slate-100 font-medium bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
                      {activeQuestion.hypothesis}
                    </p>
                  </div>

                  {/* Study Design */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-1.5 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Study Design &amp; Endpoints</span>
                    </div>
                    <p className="text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 leading-relaxed">
                      {activeQuestion.studyDesign}
                    </p>
                  </div>

                  {/* Data Sources & Ethical/Regulatory Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-1.5 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                        <Database className="w-3.5 h-3.5 text-purple-400" />
                        <span>Data Sources &amp; Cohorts</span>
                      </div>
                      <p className="text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800 leading-relaxed text-[11px]">
                        {activeQuestion.dataSources}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center space-x-1.5 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        <span>Ethical &amp; Regulatory Issues</span>
                      </div>
                      <p className="text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800 leading-relaxed text-[11px]">
                        {activeQuestion.ethicalIssues}
                      </p>
                    </div>
                  </div>

                  {/* Expected Outcome */}
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-1.5 font-mono text-slate-400 uppercase tracking-wider text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Expected Referee Verification</span>
                    </div>
                    <p className="text-amber-300/90 bg-amber-950/20 p-3 rounded-xl border border-amber-900/40 leading-relaxed font-mono text-[11px]">
                      {activeQuestion.expectedOutcome}
                    </p>
                  </div>

                  {/* Related Bounties */}
                  {activeQuestion.relatedBountyIds && activeQuestion.relatedBountyIds.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 flex items-center space-x-2">
                      <span className="text-[11px] font-mono text-slate-400">Related Open Bounties:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeQuestion.relatedBountyIds.map((bId) => (
                          <span
                            key={bId}
                            className="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-700/60 text-indigo-300 text-[10px] font-mono cursor-pointer hover:bg-indigo-900"
                            onClick={() => {
                              setMainView('bounties');
                              setBountySearch(`bounty ${bId}`);
                            }}
                          >
                            Bounty #{bId}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: 50 Community Bounties */}
      {mainView === 'bounties' && (
        <div className="space-y-5">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search 50 bounties by title, tools, datasets..."
                value={bountySearch}
                onChange={(e) => setBountySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <span className="text-xs font-mono text-slate-500">Difficulty:</span>
              {['all', 'Low', 'Medium', 'High'].map((diff) => (
                <button
                  key={diff}
                  onClick={() => setBountyDifficulty(diff)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                    bountyDifficulty === diff
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>

          {/* Bounties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBounties.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition-colors space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 border border-slate-800 text-indigo-400">
                      Bounty #{b.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                        b.difficulty === 'Low'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : b.difficulty === 'Medium'
                          ? 'bg-cyan-950 text-cyan-400 border-cyan-800'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      {b.difficulty}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-100 line-clamp-2">{b.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{b.objective}</p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-900 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500">Deliverables: </span>
                    <span className="text-slate-300">{b.deliverables}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Datasets/Tools: </span>
                    <span className="text-slate-300">{b.datasetsAndTools}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Acceptance: </span>
                    <span className="text-emerald-400">{b.acceptanceCriteria}</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-slate-500 block mb-1">Milestones:</span>
                    <div className="space-y-0.5">
                      {b.milestones.map((m, mIdx) => (
                        <div key={mIdx} className="text-[10px] text-slate-400 bg-slate-900/60 p-1 rounded">
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 3: Implementation Timeline (Gantt Chart) */}
      {mainView === 'timeline' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-100">Translational Oncology Implementation Roadmap</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Prioritized milestones across planning, pipeline development, community bounty piloting, and consortia integration.
              </p>
            </div>
            <span className="px-3 py-1 rounded bg-slate-950 text-emerald-400 font-mono text-xs border border-slate-800">
              TRIPOD / PROBAST Enforced
            </span>
          </div>

          <div className="space-y-4 font-mono text-xs">
            {/* Phase 1 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-400 uppercase tracking-wider">
                  Phase 1: Planning &amp; Design (Months 1–2)
                </span>
                <span className="text-slate-500 text-[11px]">Literature mining &amp; protocol registration</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-xs">
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Literature review &amp; gap identification (AACR 2025, NCI Human Tumor Atlas, liquid biopsy benchmarks)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Prioritize 15 core research questions and formalize testable hypotheses</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Define data &amp; tool pipelines (GDC API, cBioPortal, SEER, BraTS, TCIA)</span>
                </li>
              </ul>
            </div>

            {/* Phase 2 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 uppercase tracking-wider">
                  Phase 2: Pilot Development (Months 3–5)
                </span>
                <span className="text-slate-500 text-[11px]">Core engines &amp; initial bounties</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-xs">
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Build deterministic baseline harness and leakage detection tools</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Pilot selected community bounties 1–10 (prognostic gene signatures, WSI CNNs, endocrine resistance)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Establish cryptographic ledger persistence and tamper-evident SHA-256 chain</span>
                </li>
              </ul>
            </div>

            {/* Phase 3 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-400 uppercase tracking-wider">
                  Phase 3: Scale-up &amp; Execution (Months 6–9)
                </span>
                <span className="text-slate-500 text-[11px]">Bounties 11–40 &amp; offload clusters</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-xs">
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Launch remaining bounties 11–40 across neuro-oncology, metastasis, and multi-omics</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Deploy compute offloading via Cloudflare Workers and Kaggle multi-account cluster</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Community engagement: open-source containerized pipelines, tutorials, and unit tests</span>
                </li>
              </ul>
            </div>

            {/* Phase 4 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-400 uppercase tracking-wider">
                  Phase 4: Integration &amp; Evaluation (Months 10–12)
                </span>
                <span className="text-slate-500 text-[11px]">Synthesis, publication, &amp; consensus</span>
              </div>
              <ul className="space-y-1.5 text-slate-300 text-xs">
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Aggregate audit results across multi-center cohorts; calibrate PROBAST risk-of-bias scores</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Prepare reproducible publications, model cards, and open datasets per FAIR standards</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
