'use client';

import React, { useState } from 'react';
import { ClaimSpec, OncologyDomainTask, IntendedUse, UserRole } from '@/lib/types';
import { SAMPLE_CLAIMS } from '@/lib/sample-claims';
import {
  FileText,
  Code2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  AlertCircle,
  FileCheck,
  CheckCircle,
  HelpCircle,
  Clock,
  Layers,
} from 'lucide-react';

interface ClaimEntrySectionProps {
  onStartAudit: (spec: ClaimSpec) => void;
  isLoading: boolean;
}

export function ClaimEntrySection({ onStartAudit, isLoading }: ClaimEntrySectionProps) {
  const [inputMode, setInputMode] = useState<'benchmarks' | 'text' | 'spec'>('benchmarks');
  const [selectedSampleKey, setSelectedSampleKey] = useState<string>('oct2026_bonemets');

  // Manual text input
  const [claimText, setClaimText] = useState(
    'We demonstrate a 42-gene RNA-Seq signature that predicts 5-year bone-specific metastasis in ER+ primary breast cancer with an internal cross-validated AUC of 0.812 (95% CI 0.774-0.849).'
  );
  const [doiInput, setDoiInput] = useState('10.1038/s41523-026-00892-x');
  const [repoUrlInput, setRepoUrlInput] = useState('https://github.com/oncology-reproducibility-archive/oct2026-bonemets-audit');

  // Structured spec editor
  const [customSpec, setCustomSpec] = useState<ClaimSpec>(SAMPLE_CLAIMS.oct2026_bonemets);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSelectBenchmark = (key: string) => {
    setSelectedSampleKey(key);
    const spec = SAMPLE_CLAIMS[key];
    if (spec) {
      setCustomSpec(JSON.parse(JSON.stringify(spec)));
      setClaimText(spec.raw_claim_text || spec.title);
      setDoiInput(spec.publication_reference.doi || '');
      setRepoUrlInput(spec.repository_url || '');
    }
  };

  const handleTriggerAudit = () => {
    if (inputMode === 'benchmarks') {
      const spec = SAMPLE_CLAIMS[selectedSampleKey];
      if (spec) onStartAudit(spec);
    } else if (inputMode === 'text') {
      // Build spec from text input with domain inference
      const spec: ClaimSpec = {
        claim_id: `claim_${Date.now()}`,
        title: claimText.slice(0, 80) + '...',
        authors: ['Submitted Paper Author(s)'],
        publication_reference: {
          doi: doiInput || undefined,
          year: 2026,
        },
        repository_url: repoUrlInput || 'https://github.com/submitted-claim',
        dataset_id: customSpec.dataset_id || 'METABRIC',
        intended_use: customSpec.intended_use || 'research',
        user_role: customSpec.user_role || 'academic',
        institutional_affiliation: customSpec.institutional_affiliation || 'Verified Academic Center',
        domain_task: customSpec.domain_task || 'breast_transcriptomic_metastasis',
        claimed_metric: {
          name: 'AUC-ROC',
          value: customSpec.claimed_metric?.value || 0.78,
          split_type: customSpec.split_description || 'Unspecified split',
        },
        split_description: customSpec.split_description,
        patient_identifier_field: customSpec.patient_identifier_field,
        sample_identifier_field: customSpec.sample_identifier_field,
        negative_control_tested: customSpec.negative_control_tested,
        missing_fields: customSpec.split_description ? [] : ['split_description'],
        raw_claim_text: claimText,
      };
      onStartAudit(spec);
    } else {
      onStartAudit(customSpec);
    }
  };

  const benchmarkList = [
    {
      key: 'oct2026_bonemets',
      title: 'Oct 2026 Bone Mets (Collapsed Negative Result)',
      task: 'Breast Cancer Transcriptomics',
      dataset: 'METABRIC',
      expected: 'FAILS_BASELINE (CV 0.812 -> Test 0.512)',
      badge: 'Landmark Negative Result',
      badgeColor: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
    },
    {
      key: 'glio_pseudoprog',
      title: 'Glioma Pseudoprogression (Timepoint & Scanner Bias)',
      task: 'Neuro-Oncology 3D MRI',
      dataset: 'TCGA-BRCA',
      expected: 'LEAKAGE_DETECTED (34% timepoint co-occur)',
      badge: 'Critical Leakage',
      badgeColor: 'border-red-500/30 text-red-400 bg-red-500/10',
    },
    {
      key: 'camelyon_lymph',
      title: 'CAMELYON17 Lymph Node (Center Domain Shift)',
      task: 'Breast Pathology Whole-Slide',
      dataset: 'CAMELYON17',
      expected: 'FAILS_BASELINE (Center 5 Held-Out)',
      badge: 'Domain Shift',
      badgeColor: 'border-orange-500/30 text-orange-400 bg-orange-500/10',
    },
    {
      key: 'gse_tnbc_pass',
      title: 'GSE176078 TNBC Chemoresistance (Patient-Stratified)',
      task: 'Breast Single-Cell & Bulk',
      dataset: 'GSE176078',
      expected: 'REPRODUCED (Beats RF baseline by +0.052)',
      badge: 'Passed All Gates',
      badgeColor: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
    },
    {
      key: 'commercial_msk_blocked',
      title: 'Commercial MSK-MET Mutation Screen (Non-Commercial)',
      task: 'Clinical Genomics',
      dataset: 'MSK-MET',
      expected: 'BLOCKED (Rule 2 License Gate)',
      badge: 'License Gate Stop',
      badgeColor: 'border-rose-500/30 text-rose-400 bg-rose-500/10',
    },
    {
      key: 'unverifiable_claim',
      title: 'Unverifiable Claim (Missing Split Description)',
      task: 'Glioma Survival',
      dataset: 'TCGA-BRCA',
      expected: 'UNVERIFIABLE (Rule 3 No-Guess Rule)',
      badge: 'Rule 3 Enforced',
      badgeColor: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
    },
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-xl">
      {/* Scope Boundary Notification */}
      <div className="mb-6 p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-start space-x-3">
        <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-slate-100">Audit Scope Notice:</span> Overlay365 Referee Agent strictly accepts claims for deterministic auditing. It does not generate models, advise clinical therapy, or execute arbitrary training scripts. All claims route through M2 License Gate, M3 Baseline Harness, M4 Leakage Detector, and M5 Statistical Referee.
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex border-b border-slate-800 pb-3 mb-6 space-x-2">
        <button
          onClick={() => setInputMode('benchmarks')}
          className={`flex items-center space-x-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
            inputMode === 'benchmarks'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>1-Click Published Oncology Benchmarks</span>
        </button>

        <button
          onClick={() => setInputMode('text')}
          className={`flex items-center space-x-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
            inputMode === 'text'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>Claim Text + DOI / Repo</span>
        </button>

        <button
          onClick={() => setInputMode('spec')}
          className={`flex items-center space-x-2 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors ${
            inputMode === 'spec'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Code2 className="w-4 h-4 text-indigo-400" />
          <span>Structured ClaimSpec Editor</span>
        </button>
      </div>

      {/* Mode 1: Benchmark Cards */}
      {inputMode === 'benchmarks' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400 mb-2">
            Select a verified computational oncology claim to route through the pipeline:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {benchmarkList.map((b) => {
              const isSelected = selectedSampleKey === b.key;
              return (
                <div
                  key={b.key}
                  onClick={() => handleSelectBenchmark(b.key)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/50'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-medium ${b.badgeColor}`}>
                      {b.badge}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Dataset: {b.dataset}
                    </span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-100 line-clamp-1">{b.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{b.task}</p>
                  <div className="mt-2 text-[11px] font-mono text-slate-300 flex items-center space-x-1">
                    <span className="text-slate-500">Pipeline route:</span>
                    <span className="text-emerald-400">{b.expected}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode 2: Published Claim Text + DOI / Repo */}
      {inputMode === 'text' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Published Claim Statement (Abstract, Results, or Claim Text)
            </label>
            <textarea
              rows={3}
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
              placeholder="e.g. We report an RNA-Seq signature that predicts 5-year metastasis with AUC 0.812..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                DOI or Preprint URL
              </label>
              <input
                type="text"
                value={doiInput}
                onChange={(e) => setDoiInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                placeholder="10.1038/s41523-026-..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Code Repository URL
              </label>
              <input
                type="text"
                value={repoUrlInput}
                onChange={(e) => setRepoUrlInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
                placeholder="https://github.com/..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Dataset ID</label>
              <select
                value={customSpec.dataset_id}
                onChange={(e) => setCustomSpec({ ...customSpec, dataset_id: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
              >
                <option value="METABRIC">METABRIC</option>
                <option value="MSK-MET">MSK-MET</option>
                <option value="GSE176078">GSE176078</option>
                <option value="CAMELYON16">CAMELYON16</option>
                <option value="CAMELYON17">CAMELYON17</option>
                <option value="MAMA-MIA">MAMA-MIA</option>
                <option value="TCGA-BRCA">TCGA-BRCA</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Domain Task</label>
              <select
                value={customSpec.domain_task}
                onChange={(e) =>
                  setCustomSpec({
                    ...customSpec,
                    domain_task: e.target.value as OncologyDomainTask,
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
              >
                <option value="breast_transcriptomic_metastasis">Breast Transcriptomic Metastasis</option>
                <option value="neuro_oncology_pseudoprogression">Neuro-Oncology Pseudoprogression</option>
                <option value="breast_pathology_lymph_node">Breast Pathology Lymph Node</option>
                <option value="glioma_grade_survival">Glioma Grade / Survival</option>
                <option value="other">Other Oncology</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Intended Use</label>
              <select
                value={customSpec.intended_use}
                onChange={(e) =>
                  setCustomSpec({ ...customSpec, intended_use: e.target.value as IntendedUse })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono"
              >
                <option value="research">Academic Research</option>
                <option value="commercial">Commercial Deployment</option>
                <option value="clinical">Direct Clinical Care</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Mode 3: Structured ClaimSpec JSON Editor */}
      {inputMode === 'spec' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">Strict ClaimSpec Schema Editor</span>
            {jsonError && <span className="text-xs text-rose-400 font-mono">{jsonError}</span>}
          </div>
          <textarea
            rows={10}
            value={JSON.stringify(customSpec, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setCustomSpec(parsed);
                setJsonError(null);
              } catch (err: unknown) {
                setJsonError('Invalid JSON format');
              }
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-emerald-400 font-mono focus:border-emerald-500 focus:outline-none"
          />
        </div>
      )}

      {/* Primary Action Button */}
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-slate-800 gap-4">
        <div className="text-xs text-slate-400 font-mono">
          Route: <span className="text-emerald-400">check_license</span> →{' '}
          <span className="text-emerald-400">run_baselines</span> →{' '}
          <span className="text-emerald-400">run_leakage</span> →{' '}
          <span className="text-emerald-400">run_referee</span> →{' '}
          <span className="text-indigo-400">write_ledger</span>
        </div>

        <button
          onClick={handleTriggerAudit}
          disabled={isLoading || Boolean(jsonError)}
          className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all shadow-lg ${
            isLoading
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:scale-[0.98]'
          }`}
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Routing Through Pipeline...</span>
            </>
          ) : (
            <>
              <span>Audit This Claim</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
