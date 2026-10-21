'use client';

import React, { useState } from 'react';
import { VerdictRecord, VerdictType, AuthorResponse } from '@/lib/types';
import {
  Database,
  ShieldCheck,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  MessageSquare,
  Send,
  Hash,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface LedgerExplorerViewProps {
  records: VerdictRecord[];
  onAddAuthorResponse: (
    verdictId: string,
    authorName: string,
    text: string
  ) => Promise<boolean>;
  onVerifyChain: () => Promise<{ isValid: boolean; verifiedBlocks: number }>;
}

export function LedgerExplorerView({
  records,
  onAddAuthorResponse,
  onVerifyChain,
}: LedgerExplorerViewProps) {
  const [filterVerdict, setFilterVerdict] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    verifiedBlocks: number;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  // Author response form state
  const [activeRebuttalVerdictId, setActiveRebuttalVerdictId] = useState<string | null>(null);
  const [authorNameInput, setAuthorNameInput] = useState('');
  const [rebuttalTextInput, setRebuttalTextInput] = useState('');
  const [isSubmittingRebuttal, setIsSubmittingRebuttal] = useState(false);

  const handleVerify = async () => {
    setIsVerifying(true);
    const res = await onVerifyChain();
    setVerificationResult(res);
    setIsVerifying(false);
  };

  const handleSubmitRebuttal = async (verdictId: string) => {
    if (!authorNameInput.trim() || !rebuttalTextInput.trim()) return;
    setIsSubmittingRebuttal(true);
    const ok = await onAddAuthorResponse(verdictId, authorNameInput, rebuttalTextInput);
    if (ok) {
      setAuthorNameInput('');
      setRebuttalTextInput('');
      setActiveRebuttalVerdictId(null);
    }
    setIsSubmittingRebuttal(false);
  };

  const filteredRecords = records.filter((r) => {
    const matchesFilter = filterVerdict === 'ALL' || r.verdict === filterVerdict;
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.claim_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.dataset_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.sha256_hash.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getVerdictBadge = (verdict: VerdictType) => {
    switch (verdict) {
      case 'REPRODUCED':
        return 'bg-emerald-950/70 text-emerald-400 border-emerald-800';
      case 'FAILS_BASELINE':
        return 'bg-amber-950/70 text-amber-400 border-amber-800';
      case 'LEAKAGE_DETECTED':
        return 'bg-rose-950/70 text-rose-400 border-rose-800';
      case 'UNVERIFIABLE':
        return 'bg-purple-950/70 text-purple-400 border-purple-800';
      case 'OUT_OF_SCOPE':
      default:
        return 'bg-slate-900 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Header & Cryptographic Verification */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-semibold text-slate-100">
              Immutable Public Evidence Ledger
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Append-only SHA-256 hash chained records. Rigorous documentation of reproducible models and negative results.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-300 font-mono transition-colors"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isVerifying ? 'Verifying Chain...' : 'Verify Cryptographic Hashes'}</span>
          </button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-3.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
            verificationResult.isValid
              ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {verificationResult.isValid
                ? `Cryptographic proof confirmed: All ${verificationResult.verifiedBlocks} blocks strictly valid and uninterrupted.`
                : 'Warning: Hash chain inconsistency detected.'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">SHA-256 Checksum Intact</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search claims, datasets, hashes..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
          {['ALL', 'REPRODUCED', 'FAILS_BASELINE', 'LEAKAGE_DETECTED', 'OUT_OF_SCOPE'].map(
            (v) => (
              <button
                key={v}
                onClick={() => setFilterVerdict(v)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors border ${
                  filterVerdict === v
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 font-bold'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                }`}
              >
                {v}
              </button>
            )
          )}
        </div>
      </div>

      {/* Ledger Block List */}
      <div className="space-y-3">
        {records.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-xl border border-slate-800 bg-slate-950/40 text-slate-400 font-mono text-xs space-y-2">
            <Database className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="font-semibold text-slate-300">Public Evidence Ledger is Clean & Empty</p>
            <p className="text-slate-500 max-w-md mx-auto">
              No audit records have been committed to the public ledger yet. Only verified COMPUTED verdicts can be permanently committed.
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-8 text-slate-500 font-mono text-xs">
            No ledger records match the current filter criteria.
          </div>
        ) : (
          filteredRecords.map((record) => {
            const isExpanded = expandedRecordId === record.verdict_id;
            const isRebuttalOpen = activeRebuttalVerdictId === record.verdict_id;

          return (
            <div
              key={record.verdict_id}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-3 hover:border-slate-700 transition-colors"
            >
              {/* Block Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2.5">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold">
                    Block #{record.block_height}
                  </span>
                  {(record.synthetic || record.provenance === 'simulated') && (
                    <span className="px-2 py-0.5 rounded border border-amber-600/50 bg-amber-950/40 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                      Demo / Synthetic
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${getVerdictBadge(
                      record.verdict
                    )}`}
                  >
                    {record.verdict}
                  </span>
                  <span className="text-slate-400 text-[11px]">
                    Dataset: <span className="text-emerald-400">{record.dataset_id}</span>
                  </span>
                </div>

                <div className="text-[11px] text-slate-500">
                  {new Date(record.timestamp).toLocaleDateString()} {new Date(record.timestamp).toLocaleTimeString()}
                </div>
              </div>

              {/* Title & Statement */}
              <div>
                <h4 className="text-sm font-semibold text-slate-100 font-sans">{record.title}</h4>
                <p className="text-slate-300 text-[11px] mt-1.5 leading-relaxed line-clamp-2">
                  {record.verdict_statement}
                </p>
              </div>

              {/* Block Hash details */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 bg-slate-900/50 p-2 rounded border border-slate-900">
                <div className="flex items-center space-x-1">
                  <Hash className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-slate-500">SHA-256:</span>
                  <span className="text-slate-300 select-all">{record.sha256_hash.slice(0, 24)}...</span>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() =>
                      setExpandedRecordId(isExpanded ? null : record.verdict_id)
                    }
                    className="flex items-center space-x-1 text-indigo-400 hover:text-indigo-300"
                  >
                    <span>{isExpanded ? 'Collapse' : 'Details'}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() =>
                      setActiveRebuttalVerdictId(isRebuttalOpen ? null : record.verdict_id)
                    }
                    className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Author Response ({record.author_responses?.length || 0})</span>
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="space-y-3 pt-2 border-t border-slate-900 text-[11px]">
                  <div>
                    <span className="text-slate-500 font-bold uppercase">Full Auditor Verdict:</span>
                    <div className="mt-1 p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {record.verdict_statement}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80">
                      <span className="text-emerald-400 font-bold">Scope Tested:</span>
                      <ul className="list-disc list-inside text-slate-300 mt-1 space-y-0.5">
                        {record.scopeTested.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-2.5 bg-slate-900/60 rounded border border-slate-800/80">
                      <span className="text-amber-400 font-bold">Scope Not Tested:</span>
                      <ul className="list-disc list-inside text-slate-300 mt-1 space-y-0.5">
                        {record.scopeNotTested.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500">
                    Previous Block Hash: {record.previous_block_hash}
                  </div>
                </div>
              )}

              {/* Author Responses List */}
              {record.author_responses && record.author_responses.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-900">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Linked Author Responses & Consortium Rebuttals:
                  </span>
                  {record.author_responses.map((resp) => (
                    <div
                      key={resp.response_id}
                      className="p-3 rounded bg-slate-900/70 border border-slate-800 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-semibold text-emerald-400">{resp.author_name}</span>
                        <span>{new Date(resp.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-200">{resp.text}</p>
                      <div className="text-[9px] text-slate-500">
                        Rebuttal Hash: {resp.sha256_hash.slice(0, 20)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Author Response Submission Modal/Drawer */}
              {isRebuttalOpen && (
                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-3 pt-3">
                  <div className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Submit Author Commentary / Rebuttal</span>
                  </div>
                  <input
                    type="text"
                    value={authorNameInput}
                    onChange={(e) => setAuthorNameInput(e.target.value)}
                    placeholder="Author name & institutional affiliation..."
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200"
                  />
                  <textarea
                    rows={3}
                    value={rebuttalTextInput}
                    onChange={(e) => setRebuttalTextInput(e.target.value)}
                    placeholder="Write author response, acknowledge negative result, or submit methodological clarification..."
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
                  />
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setActiveRebuttalVerdictId(null)}
                      className="px-3 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSubmitRebuttal(record.verdict_id)}
                      disabled={isSubmittingRebuttal || !authorNameInput || !rebuttalTextInput}
                      className="flex items-center space-x-1.5 px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSubmittingRebuttal ? 'Hashing...' : 'Attach to Block'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        }))}
      </div>
    </div>
  );
}
