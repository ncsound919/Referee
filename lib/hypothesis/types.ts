export interface PaperClaimSource {
  id: string;
  doi: string;
  domain: string;
  claimText: string;
  methodology: string;
  result: string;
}

export interface HypothesisRecord {
  id: string;
  domain: string;
  claimText: string;
  groundingSources: string[];
  testablePipeline: string[];
  expectedOutcome: {
    metric: string;
    direction: 'increase' | 'decrease';
    magnitude: number;
  };
  falsification: string;
  noveltyScore: number;
  status: 'PENDING_SKEPTIC' | 'PRE_CHECK_FAILED' | 'QUEUED' | 'TESTING' | 'COMPLETED' | 'REJECTED';
  skepticCritique?: string;
  mevScore?: number;
  createdAt: string;
}

export const MOCK_PAPER_CLAIMS: PaperClaimSource[] = [
  {
    id: 'paper_01',
    doi: '10.1038/s41523-026-00892-x',
    domain: 'breast_cancer',
    claimText: 'Batch-stratified cross-validation reduces optimistic AUC inflation in transcriptomic metastasis models.',
    methodology: 'batch_stratified_cv',
    result: 'reduced_cv_test_gap',
  },
  {
    id: 'paper_02',
    doi: '10.1038/s41598-026-78102-1',
    domain: 'neuro_oncology',
    claimText: 'Multimodal MRI radiomic features require multi-vendor ComBat harmonization to prevent site confounding.',
    methodology: 'combat_batch_harmonization',
    result: 'eliminated_scanner_shortcut',
  },
  {
    id: 'paper_03',
    doi: '10.1016/j.media.2026.102844',
    domain: 'pathology',
    claimText: 'Patient-level GroupKFold splitting eliminates over-optimistic slide patch accuracy in CAMELYON.',
    methodology: 'split_by_patient_level',
    result: 'true_generalization_verified',
  },
  {
    id: 'paper_04',
    doi: '10.1158/0008-5472.CAN-26-1102',
    domain: 'metastasis',
    claimText: 'Multimodal clinical covariate fusion enhances predictive stability for neoadjuvant chemotherapy response.',
    methodology: 'multimodal_clinical_fusion',
    result: 'improved_calibration_slope',
  },
  {
    id: 'paper_05',
    doi: '10.1101/2026.10.12.589104',
    domain: 'breast_cancer',
    claimText: 'Negative control permutation gates catch 98% of spurious non-specific genomic signatures.',
    methodology: 'run_statistical_referee',
    result: 'spurious_signals_flagged',
  },
];

export const VALID_SKILLS_LIST = [
  'split_by_patient_level',
  'run_glmnet_baseline',
  'run_statistical_referee',
  'check_batch_confound',
  'combat_batch_harmonization',
  'run_clinical_cox_baseline',
  'multimodal_clinical_fusion',
  'check_scanner_nuisance_kernel',
  'split_longitudinal_timepoint_held_out',
];
