'use client';

import React from 'react';
import { ShieldAlert, Database, Cpu, Lock, CheckCircle2, AlertTriangle, Layers, Brain, FlaskConical, Sparkles } from 'lucide-react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  blockCount: number;
}

export function Navbar({ activeTab, setActiveTab, blockCount }: NavbarProps) {
  const tabs = [
    { id: 'audit', label: 'Audit Console', icon: Cpu },
    { id: 'tumortwin', label: 'TumorTwin Sim', icon: Cpu },
    { id: 'hypothesis', label: 'Hypothesis Tournament', icon: Sparkles },
    { id: 'questions', label: 'Research Agenda (10 Qs)', icon: FlaskConical },
    { id: 'ingestion', label: 'Data Ingestion', icon: Database },
    { id: 'ledger', label: `Evidence Ledger (${blockCount})`, icon: Database },
    { id: 'repair', label: 'Recursive Repair (Bounded)', icon: Layers },
    { id: 'learning', label: 'Learning Engine (Reflexion)', icon: Brain },
    { id: 'licenses', label: 'License Passports', icon: Lock },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-lg shadow-[0_0_15px_rgba(16,185,129,0.15)]">
              θ365
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-100 tracking-tight text-lg">
                  Overlay365 <span className="text-emerald-400">Referee Agent</span>
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded bg-emerald-950/70 text-emerald-400 border border-emerald-800/60">
                  Deterministic v2.6
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Tool-Bound Computational Oncology Claim Auditor & Immutable Ledger
              </p>
            </div>
          </div>

          {/* Active Rules & Gates Status */}
          <div className="hidden lg:flex items-center space-x-4 text-xs font-mono">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>License Gate: Armed</span>
            </div>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>No-Math Rule: Active</span>
            </div>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span>Chain Height: #{blockCount}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 border-t border-slate-800/60 pt-1 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' });
                }}
                className={`flex items-center space-x-2 px-4 py-2.5 border-b-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-emerald-400 text-emerald-400 bg-emerald-500/5'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
