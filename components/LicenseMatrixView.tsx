'use client';

import React from 'react';
import { LICENSE_REGISTRY } from '@/lib/licenses';
import { Lock, ShieldAlert, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

export function LicenseMatrixView() {
  const datasets = Object.values(LICENSE_REGISTRY);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Lock className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100">
              M2 License Passport Matrix (Hard Gate)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic data usage rights engine. Real matrix encoded to prevent illicit commercialization or unlicensed clinical deployment.
          </p>
        </div>

        <span className="px-3 py-1 rounded bg-rose-950 text-rose-400 border border-rose-800 text-xs font-mono font-bold">
          Rule 2: Hard Gate Active
        </span>
      </div>

      <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono flex items-start space-x-2.5">
        <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-100">Hard Gate Guarantee:</span> If checkLicenseTool returns BLOCKED, the agent terminates unconditionally. The orchestrator returns: &ldquo;Audit cannot proceed: dataset X is non-commercial.&rdquo; Prompt injection or user override requests cannot bypass this gate.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {datasets.map((d) => (
          <div
            key={d.dataset_id}
            className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-sm font-bold text-slate-100 font-sans">{d.dataset_id}</span>
              <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {d.access_portal}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 font-sans">{d.description}</p>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-900/50 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Permitted Uses:</span>
                <div className="flex flex-wrap gap-1">
                  {d.permitted_use_types.map((u) => (
                    <span
                      key={u}
                      className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                        u === 'commercial'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {u}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/50 p-2 rounded border border-slate-800/80">
                <span className="text-slate-500 block mb-1">Required User Roles:</span>
                <div className="flex flex-wrap gap-1">
                  {d.required_user_roles.map((r) => (
                    <span
                      key={r}
                      className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-slate-800 text-slate-300"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 bg-slate-900/30 p-2 rounded border border-slate-900">
              <span className="text-slate-500 font-semibold">License Clause:</span> {d.license_clause}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
