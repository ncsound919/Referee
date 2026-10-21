'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Database, Download, AlertTriangle, FileText, CheckCircle2, Search, ExternalLink, RefreshCw } from 'lucide-react';
import { IngestedPaper } from '@/lib/paper-ingestion';

export function IngestionControlView() {
  const [ingesting, setIngesting] = useState(false);
  const [source, setSource] = useState('pubmed');
  const [query, setQuery] = useState('breast cancer metastasis transcriptomics');
  const [papers, setPapers] = useState<IngestedPaper[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const fetchPapers = useCallback(async () => {
    try {
      const res = await fetch('/api/ingestion/papers');
      if (res.ok) {
        const data = await res.json();
        setPapers(data.papers || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchPapers();
    const interval = setInterval(fetchPapers, 5000);
    return () => clearInterval(interval);
  }, [fetchPapers]);

  const handleIngest = async () => {
    setIngesting(true);
    setMessage(`Ingesting papers from ${source.toUpperCase()} for "${query}"...`);
    try {
      const res = await fetch('/api/ingestion/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, query }),
      });
      const data = await res.json();
      if (data.status === 'INGESTED') {
        setMessage(`Ingested paper: "${data.paper?.title}"`);
        await fetchPapers();
      }
    } catch (err) {
      setMessage(`Ingestion failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIngesting(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Box */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-sm font-mono font-bold text-slate-200">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Oncology Paper &amp; Dataset Ingestion Gateway</span>
          </div>
          <button
            onClick={fetchPapers}
            className="flex items-center space-x-1 text-xs font-mono text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="pubmed">PubMed Papers (NCBI E-Utilities)</option>
            <option value="medrxiv">medRxiv &amp; bioRxiv Preprints</option>
            <option value="kaggle">Kaggle Datasets &amp; Kernels</option>
          </select>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            placeholder="Search oncology query..."
          />

          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="flex items-center justify-center space-x-2 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all cursor-pointer disabled:opacity-50 shadow-md"
          >
            <Download className="w-4 h-4" />
            <span>{ingesting ? 'Ingesting Literature...' : 'Ingest & Extract Claim'}</span>
          </button>
        </div>

        {message && (
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{message}</span>
          </div>
        )}

        <div className="flex items-start space-x-2 p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg text-[11px] text-amber-300 font-mono">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            Ingested literature is parsed for ClaimSpec metadata (claimed metric, dataset ID, cohort size, split structure) and passed to the autonomous audit loop. Unconfirmed claims never enter the immutable ledger.
          </p>
        </div>
      </div>

      {/* Ingested Papers Table / List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
            Ingested Literature &amp; Claim Repositories ({papers.length})
          </span>
          <span className="text-[11px] font-mono text-slate-500">Auto-synced with Autonomous Daemon</span>
        </div>

        <div className="space-y-3">
          {papers.map((p) => (
            <div
              key={p.id}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono"
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
                        : 'bg-indigo-950 text-indigo-300 border-indigo-800'
                    }`}
                  >
                    {p.status}
                  </span>
                  <h4 className="text-slate-100 font-bold text-xs">{p.title}</h4>
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                  <span>{p.journal} ({p.year})</span>
                  {p.doi && <span className="text-indigo-400 underline">{p.doi}</span>}
                </div>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed font-sans">{p.abstract}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-900 text-[11px]">
                <div>
                  <span className="text-slate-500">Extracted Claim: </span>
                  <strong className="text-cyan-400">
                    {p.extractedClaim.metricName} = {p.extractedClaim.claimedValue}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Dataset &amp; Cohort: </span>
                  <span className="text-slate-300">
                    {p.extractedClaim.datasetId} (n={p.extractedClaim.sampleSize})
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">Resolution Verdict: </span>
                  <strong
                    className={
                      p.auditResolution?.verdict === 'REPRODUCED'
                        ? 'text-emerald-400'
                        : p.auditResolution?.verdict === 'FAILS_BASELINE'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }
                  >
                    {p.auditResolution?.verdict || 'Awaiting Cycle'}
                  </strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
