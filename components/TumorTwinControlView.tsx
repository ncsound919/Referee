'use client';

import React, { useState } from 'react';
import { Cpu, Play, Loader2, Database } from 'lucide-react';

export function TumorTwinControlView() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const runSimulation = async () => {
    setRunning(true);
    setLog(['Initiating TumorTwin simulation...']);
    try {
      const res = await fetch('/api/compute/offload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'tumortwin',
          task: {
            engine_name: 'tumortwin',
            snapshot_json: JSON.stringify({ engine: { name: 'tumortwin' } }),
            sha256: '0'.repeat(64), // Simplified for stub
          },
        }),
      });
      const data = await res.json();
      setLog((prev) => [...prev, `Simulation complete: ${JSON.stringify(data.result)}`]);
    } catch (err) {
      setLog((prev) => [...prev, `Error: ${err}`]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-xl">
      <div className="flex items-center space-x-2 text-sm font-mono font-bold text-slate-200 border-b border-slate-800 pb-3">
        <Cpu className="w-4 h-4 text-emerald-400" />
        <span>TumorTwin Simulation Engine</span>
      </div>
      
      <button
        onClick={runSimulation}
        disabled={running}
        className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs font-mono transition-all cursor-pointer disabled:opacity-50"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        <span>{running ? 'Simulating...' : 'Run TumorTwin Simulation'}</span>
      </button>

      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-[10px] text-slate-400 h-32 overflow-y-auto space-y-1">
        {log.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  );
}
