'use client';

import React, { useState } from 'react';
import { VerdictRecord, VerdictType } from '@/lib/types';
import { LaymanSummaryCard } from './LaymanSummaryCard';
import { NextExperimentSetupCard } from './NextExperimentSetupCard';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  FileLock2,
  Share2,
  Download,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Hash,
} from 'lucide-react';

interface VerdictDisplayProps {
  record: VerdictRecord;
  onNavigateToLedger?: () => void;
}

export function VerdictDisplay({ record, onNavigateToLedger }: VerdictDisplayProps) {
  const [copiedHash, setCopiedHash] = useState(false);

  const getVerdictTheme = (verdict: VerdictType) => {
    switch (verdict) {
      case 'REPRODUCED':
        return {
          title: 'REPRODUCED',
          badge: 'Passed All Deterministic Gates',
          border: 'border-emerald-500/50',
          bg: 'bg-emerald-950/20',
          glow: 'shadow-[0_0_25px_rgba(16,185,129,0.15)]',
          text: 'text-emerald-400',
          icon: CheckCircle2,
        };
      case 'FAILS_BASELINE':
        return {
          title: 'FAILS BASELINE',
          badge: 'Matched / Exceeded by Fixed Baselines',
          border: 'border-amber-500/50',
          bg: 'bg-amber-950/20',
          glow: 'shadow-[0_0_25px_rgba(245,158,11,0.15)]',
          text: 'text-amber-400',
          icon: XCircle,
        };
      case 'LEAKAGE_DETECTED':
        return {
          title: 'LEAKAGE DETECTED',
          badge: 'Methodological Partition Failure',
          border: 'border-rose-500/50',
          bg: 'bg-rose-950/20',
          glow: 'shadow-[0_0_25px_rgba(244,63,94,0.15)]',
          text: 'text-rose-400',
          icon: AlertTriangle,
        };
      case 'UNVERIFIABLE':
        return {
          title: 'UNVERIFIABLE',
          badge: 'Rule 3: Missing Fields Never Guessed',
          border: 'border-purple-500/50',
          bg: 'bg-purple-950/20',
          glow: 'shadow-[0_0_25px_rgba(168,85,247,0.15)]',
          text: 'text-purple-400',
          icon: AlertTriangle,
        };
      case 'OUT_OF_SCOPE':
      default:
        return {
          title: 'OUT OF SCOPE / BLOCKED',
          badge: 'License Gate Hard Stop',
          border: 'border-slate-600/50',
          bg: 'bg-slate-900/60',
          glow: 'shadow-[0_0_25px_rgba(148,163,184,0.1)]',
          text: 'text-slate-300',
          icon: ShieldAlert,
        };
    }
  };

  const theme = getVerdictTheme(record.verdict);
  const Icon = theme.icon;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(record.sha256_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(record, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `overlay365_verdict_${record.verdict_id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className={`rounded-xl border ${theme.border} ${theme.bg} ${theme.glow} p-6 space-y-6`}>
      {/* Top Banner & Verdict Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center space-x-3.5">
          <div className={`p-2.5 rounded-lg border ${theme.border} bg-slate-950`}>
            <Icon className={`w-8 h-8 ${theme.text}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-2xl font-black tracking-tight font-mono ${theme.text}`}>
                {theme.title}
              </span>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider font-mono bg-slate-950 border border-slate-800 text-slate-300">
                {theme.badge}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ledger Block #{record.block_height} • Claim ID: {record.claim_id} • {new Date(record.timestamp).toUTCString()}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportJson}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 font-mono transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export JSON</span>
          </button>
          {onNavigateToLedger && (
            <button
              onClick={onNavigateToLedger}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs text-emerald-300 font-mono transition-colors"
            >
              <FileLock2 className="w-3.5 h-3.5" />
              <span>Inspect in Ledger</span>
            </button>
          )}
        </div>
      </div>

      {/* Claim Title & Auditor Verdict Statement */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-100">{record.title}</h3>
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">
            Auditor Statement (Paranoid Referee Interpretation)
          </div>
          {record.verdict_statement}
        </div>
      </div>

      {/* Layman's Terms Final Analysis for Research & Auditing */}
      <LaymanSummaryCard record={record} />

      {/* Next Experiment Setup System Driven by Self-Learning */}
      <NextExperimentSetupCard record={record} />

      {/* Scope Tested vs Scope Not Tested Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800">
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-400 mb-2 font-mono">
            <CheckCircle2 className="w-4 h-4" />
            <span>SCOPE TESTED BY AGENT</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {record.scopeTested.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-emerald-500 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800">
          <div className="flex items-center space-x-2 text-xs font-semibold text-amber-400 mb-2 font-mono">
            <AlertTriangle className="w-4 h-4" />
            <span>SCOPE NOT TESTED (EXPLICIT BOUNDARY)</span>
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {record.scopeNotTested.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-amber-500 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Non-Dismissible Universal Claim Limit Notice */}
      <div className="p-3.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-[11px] text-rose-200/90 font-mono flex items-start space-x-2.5">
        <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-rose-300">UNIVERSAL CLAIM LIMIT:</span>{' '}
          {record.universalClaimLimit}
        </div>
      </div>

      {/* Cryptographic Evidence & Hash Proofs */}
      <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Hash className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ledger Block SHA-256 Hash:</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-slate-300 select-all">{record.sha256_hash}</span>
            <button
              onClick={handleCopyHash}
              className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Copy hash"
            >
              {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-900 text-[11px] text-slate-400">
          <div>
            <span className="text-slate-500">ClaimSpec Hash:</span>{' '}
            <span className="text-slate-300">{record.evidenceLinks.claimSpecHash.slice(0, 16)}...</span>
          </div>
          <div>
            <span className="text-slate-500">AuditResults Hash:</span>{' '}
            <span className="text-slate-300">{record.evidenceLinks.auditResultsHash.slice(0, 16)}...</span>
          </div>
          <div>
            <span className="text-slate-500">Dataset Anchor:</span>{' '}
            <span className="text-emerald-400">{record.dataset_id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
