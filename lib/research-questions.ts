import { OncologyDomainTask } from '@/lib/types';

export interface ResearchQuestion {
  id: number;
  phase: 1 | 2;
  title: string;
  domain: OncologyDomainTask;
  context: string;
  hypothesis: string;
  experimentDescription: string;
  defaultClaimId: string;
  expectedOutcome: string;
}

export const AUTONOMOUS_RESEARCH_QUESTIONS: ResearchQuestion[] = [
  {
    id: 1,
    phase: 1,
    title: 'CV-to-Test Collapse in Breast Cancer Transcriptomics',
    domain: 'breast_transcriptomic_metastasis',
    context: 'The October 2026 negative result showed AUC collapsing from 0.7-0.8 in cross-validation to 0.47-0.57 on held-out data. Is this overfitting to noise or batch effects?',
    hypothesis: 'If you stratify training data by batch/plate/center before cross-validation, the CV-to-test gap shrinks, proving unstratified cross-validation is the root flaw.',
    experimentDescription: 'Train model with vs without batch-stratified CV on METABRIC/GSE2034 and compare held-out test AUC delta.',
    defaultClaimId: 'claim_oct2026_bonemets',
    expectedOutcome: 'Batch-stratified CV reduces optimistic bias and eliminates false positive AUC inflation.',
  },
  {
    id: 2,
    phase: 1,
    title: 'Neuro-Oncology Imaging Value in Pseudoprogression',
    domain: 'neuro_oncology_pseudoprogression',
    context: 'Nature Scientific Reports study reported external test AUC 0.753 for imaging, but clinical data alone outperformed imaging on most metrics.',
    hypothesis: 'If clinical+imaging does not outperform clinical-only by a meaningful margin (delta AUC > 0.05 with non-overlapping CIs), the imaging claim is a confound.',
    experimentDescription: 'Build three models (clinical-only, imaging-only, clinical+imaging) on identical patient cohort with timepoint-aware splits.',
    defaultClaimId: 'claim_glio_mri_deepnet',
    expectedOutcome: 'Imaging provides negligible independent uplift over clinical baseline; imaging claim flagged as confounding.',
  },
  {
    id: 3,
    phase: 1,
    title: 'Patient-Level vs. Slide-Level Leakage in Pathology AI',
    domain: 'breast_pathology_lymph_node',
    context: 'CAMELYON16/17 benchmarks lack systematic quantification of performance drops when enforcing patient-level splits versus slide-level splits.',
    hypothesis: 'If the AUC degradation from random slide split to patient-level split is larger than from patient split to center-held-out split, patient leakage dominates pathology AI.',
    experimentDescription: 'Evaluate patch-level CNN under (a) slide-level random, (b) patient-level group split, and (c) center held-out split (CAMELYON17).',
    defaultClaimId: 'claim_camelyon17_patchnet',
    expectedOutcome: 'Substantial AUC drop (>0.15) under patient-level grouping, confirming widespread slide-level data leakage.',
  },
  {
    id: 4,
    phase: 1,
    title: 'Single-Cell Foundation Model Corpus Overlap',
    domain: 'breast_transcriptomic_metastasis',
    context: 'Foundation models (scGPT, Geneformer) are claimed to achieve superior zero-shot performance in single-cell genomics.',
    hypothesis: 'When foundation models outperform classical methods (Harmony, scVI), it is driven by pretraining corpus overlap with the test set rather than representational power.',
    experimentDescription: 'Cross-reference test dataset cell accession identifiers with scGPT/Geneformer pretraining metadata.',
    defaultClaimId: 'claim_gse176078_tnbc_pass',
    expectedOutcome: 'Zero-shot advantage vanishes when restricting evaluation strictly to novel patients absent from pretraining corpora.',
  },
  {
    id: 5,
    phase: 2,
    title: 'Cross-Cancer Transferability of Genomic Biomarkers',
    domain: 'breast_transcriptomic_metastasis',
    context: 'Can a biomarker trained on breast cancer metastasis predict outcomes in ovarian and lung adenocarcinoma?',
    hypothesis: 'Genomic signatures optimized for organ-specific microenvironments fail to transfer across tumor types unless restricted to core oncogenic pathways.',
    experimentDescription: 'Test breast-trained 42-gene signature on TCGA-OV and TCGA-LUAD prediction tables.',
    defaultClaimId: 'claim_oct2026_bonemets',
    expectedOutcome: 'Cross-cancer AUC drops to random (0.50), demonstrating microenvironment specificity.',
  },
  {
    id: 6,
    phase: 1,
    title: 'Negative Control Gate Severity & False Rejection Calibration',
    domain: 'breast_transcriptomic_metastasis',
    context: 'Initial negative-control gate (95% interval excludes 0.5) rejected 1 in 8 clean pipelines. We tightened it to 99% interval + 0.05 margin.',
    hypothesis: 'A 99% interval with 0.05 margin achieves <3% false positive rate on pure-noise controls while retaining 100% detection of spurious shortcuts.',
    experimentDescription: 'Run 100 synthetic pure-noise prediction tables through Referee negative control gate.',
    defaultClaimId: 'claim_gse176078_tnbc_pass',
    expectedOutcome: 'False rejection rate verified below 3.0%, satisfying calibration safety standards.',
  },
  {
    id: 7,
    phase: 1,
    title: 'Jevons MEV Circuit Breaker Efficacy under Runaway Loops',
    domain: 'neuro_oncology_pseudoprogression',
    context: 'Autonomous agents can get trapped in zero-entropy repair loops trying redundant parameter tweaks.',
    hypothesis: 'The Jevons Marginal Evidence Value (MEV) model successfully halts runaway iterations when redundancy risk R_risk approaches 1.0 or MEV drops below 0.15.',
    experimentDescription: 'Simulate 5 consecutive identical repair proposals and monitor MEV circuit breaker response.',
    defaultClaimId: 'claim_missing_split_unverifiable',
    expectedOutcome: 'System halts deterministically at iteration 2 or 3 with verdict IRREPARABLE_WITHIN_BUDGET.',
  },
  {
    id: 8,
    phase: 2,
    title: 'Metastatic Microenvironment Spatial Transcriptomic Confounders',
    domain: 'breast_pathology_lymph_node',
    context: 'Spatial transcriptomics claimed to predict lymph node micrometastasis prior to morphological visibility.',
    hypothesis: 'High predictive AUC in spatial capture spots reflects tissue section thickness and capture-frame density rather than early molecular transformation.',
    experimentDescription: 'Control for spatial spot barcode density and batch slide wash in spatial gene expression classifiers.',
    defaultClaimId: 'claim_camelyon17_patchnet',
    expectedOutcome: 'AUC degrades to baseline when controlling for capture density artifacts.',
  },
  {
    id: 9,
    phase: 2,
    title: 'Meta-Audit Consensus Across Multi-Center Oncology Consortia',
    domain: 'breast_transcriptomic_metastasis',
    context: 'Aggregating audit outcomes across 500 published studies to measure systematic reproducibility bias.',
    hypothesis: 'Academic publications with industry co-authorship exhibit a 2.4x higher rate of uncorrected patient overlap than purely academic studies.',
    experimentDescription: 'Analyze aggregate Ledger VerdictRecords grouped by author affiliation type.',
    defaultClaimId: 'claim_oct2026_bonemets',
    expectedOutcome: 'Statistically significant association between industry funding and leak-prone validation splits.',
  },
  {
    id: 10,
    phase: 1,
    title: 'Radiomics Feature Robustness Across CT/MRI Scanner Vendors',
    domain: 'neuro_oncology_pseudoprogression',
    context: 'Radiomic texture features (Haralick, wavelet) are highly sensitive to scanner reconstruction algorithms.',
    hypothesis: 'ComBat harmonization and image resampling restore radiomic feature stability across Siemens and GE scanners, elevating test AUC from 0.58 to 0.72.',
    experimentDescription: 'Evaluate radiomic model with and without ComBat scanner harmonization on multi-vendor MRI test sets.',
    defaultClaimId: 'claim_glio_mri_deepnet',
    expectedOutcome: 'Harmonized models demonstrate robust cross-vendor generalization.',
  },
];
