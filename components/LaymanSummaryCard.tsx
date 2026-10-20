'use client';

import React from 'react';
import { VerdictRecord } from '@/lib/types';
import { BookOpen, Sparkles, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

interface LaymanSummaryCardProps {
  record: VerdictRecord;
}

export function LaymanSummaryCard({ record }: LaymanSummaryCardProps) {
  // Generate layman interpretation based on verdict and raw results
  const getLaymanExplanation = () => {
    const verdict = record.verdict;
    const raw = record.raw_audit_results;

    let headline = '';
    let whatWeTested = '';
    let whatWeFound = '';
    let bottomLine = '';

    if (verdict === 'REPRODUCED') {
      headline = 'The study checked out cleanly. No data leakage or shortcuts were found.';
      whatWeTested = 'We verified whether patient records were strictly separated between training and testing, tested if batch artifacts caused false signals, and compared the model against standard clinical baselines.';
      whatWeFound = `The model achieved a verified score that beats the best standard baseline by a comfortable margin. It also passed our rigorous negative-control test (proving it learned real biological signals rather than random noise).`;
      bottomLine = 'You can trust this result for further research, as it meets strict reproducibility standards.';
    } else if (verdict === 'FAILS_BASELINE') {
      headline = 'The study makes claims that are matched or beaten by simpler standard models.';
      whatWeTested = 'We ran standard locked baselines (like regularized logistic regression and random forests) on the exact same patient data partition.';
      whatWeFound = `The complex model claimed high performance, but simple baseline models performed just as well or better without needing complex neural networks.`;
      bottomLine = 'The model does not provide a meaningful performance advantage over existing standard methods.';
    } else if (verdict === 'LEAKAGE_DETECTED') {
      headline = 'The study has a critical data sharing flaw: training and testing data mixed together.';
      whatWeTested = 'We checked if data from the same patient (or overlapping tissue scans) appeared in both the training set and the test set.';
      whatWeFound = `We detected data leakage: the model "saw" the test patients during training, giving it an unfair advantage that inflated its score from realistic performance to an illusion.`;
      bottomLine = 'The reported high performance is unreliable and would collapse on genuinely new patients.';
    } else if (verdict === 'UNVERIFIABLE') {
      headline = 'We could not audit this study because essential details were left out.';
      whatWeTested = 'We searched for patient split descriptions, data partition rules, and unique patient identifiers in the claim and repository.';
      whatWeFound = `Crucial methodological information (such as how data was split) was missing. Following our core rule ("missing fields are unverifiable, not guessed"), we stopped rather than assuming missing details.`;
      bottomLine = 'The authors need to publish their exact data split rules before this study can be verified.';
    } else {
      headline = 'The study was blocked by dataset usage rights or licensing rules.';
      whatWeTested = 'We checked whether the dataset usage license permits commercial or academic auditing under institutional constraints.';
      whatWeFound = `The requested usage or user role violated the data provider license terms (e.g., commercial use of a non-commercial dataset).`;
      bottomLine = 'The audit was stopped immediately to respect data governance rules.';
    }

    return { headline, whatWeTested, whatWeFound, bottomLine };
  };

  const layman = getLaymanExplanation();

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 p-6 space-y-5 shadow-xl">
      <div className="flex items-center space-x-3 border-b border-indigo-500/20 pb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-mono">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono uppercase tracking-wider text-indigo-400 font-bold">
              Plain English Summary
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800">
              For Researchers & Auditors
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-100 tracking-tight">
            {layman.headline}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-semibold text-slate-300 flex items-center space-x-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>1. What We Tested</span>
          </div>
          <p className="text-slate-400 leading-relaxed font-sans">
            {layman.whatWeTested}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-semibold text-slate-300 flex items-center space-x-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>2. What We Found</span>
          </div>
          <p className="text-slate-400 leading-relaxed font-sans">
            {layman.whatWeFound}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
          <div className="font-semibold text-slate-300 flex items-center space-x-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>3. The Bottom Line</span>
          </div>
          <p className="text-slate-200 font-medium leading-relaxed font-sans">
            {layman.bottomLine}
          </p>
        </div>
      </div>
    </div>
  );
}
