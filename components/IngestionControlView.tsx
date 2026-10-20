'use client';

import React, { useState } from 'react';
import { Database, Download, AlertTriangle } from 'lucide-react';

export function IngestionControlView() {
  const [ingesting, setIngesting] = useState(false);
  const [source, setSource] = useState('kaggle');
  const [query, setQuery] = useState('breast_cancer_transcriptomics');

  const handleIngest = async () => {
    setIngesting(true);
    try {
      if (source === 'pubmed') {
        const res = await fetch('/api/ingestion/pubmed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        console.log('PubMed results:', data);
        // Here you would trigger PaperClaim database updates
      } else {
        // Fallback for Kaggle/Arxiv
        const res = await fetch('/api/ingestion/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, query }),
        });
        const data = await res.json();
        console.log('Ingestion result:', data);
      }
    } catch (err) {
      console.error('Ingestion failed:', err);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
      <div className="flex items-center space-x-2 text-sm font-mono font-bold text-slate-200 border-b border-slate-800 pb-3">
        <Database className="w-4 h-4 text-emerald-400" />
        <span>Data & Paper Ingestion</span>
      </div>
      
      <div className="space-y-3">
        <select 
          value={source} 
          onChange={(e) => setSource(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
        >
          <option value="kaggle">Kaggle Datasets</option>
          <option value="pubmed">PubMed Papers</option>
          <option value="arxiv">arXiv Preprints</option>
        </select>
        
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-200"
          placeholder="Search query..."
        />

        <button
          onClick={handleIngest}
          disabled={ingesting}
          className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs font-mono transition-all cursor-pointer disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{ingesting ? 'Ingesting...' : 'Trigger Ingestion'}</span>
        </button>
      </div>

      <div className="flex items-start space-x-2 p-3 bg-amber-950/20 border border-amber-900/40 rounded-lg text-[10px] text-amber-300 font-mono">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>Ingestion adds metadata to PaperClaim database. Raw data goes to S3 via presigned URLs.</p>
      </div>
    </div>
  );
}
