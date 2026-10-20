import {
  OncologyDomainTask,
  BaselineHarnessResult,
  BaselineModelResult,
  ClaimSpec,
} from './types';

export interface FixedBaselineConfig {
  task: OncologyDomainTask;
  title: string;
  why_fixed: string;
  clinical_reference: string;
  getBaselines: (claimSpec: ClaimSpec) => BaselineModelResult[];
}

export const DOMAIN_BASELINES: Record<OncologyDomainTask, FixedBaselineConfig> = {
  breast_transcriptomic_metastasis: {
    task: 'breast_transcriptomic_metastasis',
    title: 'Breast Cancer Transcriptomic Metastasis Prediction',
    why_fixed:
      'The landmark October 2026 bone metastasis study showed cross-validated AUCs of 0.697–0.795 collapsing to external test AUC 0.467–0.574. The baseline must include the exact standard architectures (GLMNET, RF, XGBoost, Clinical Cox) to verify if a new claim survives where conventional transcriptomic signatures collapse.',
    clinical_reference:
      'Oct 2026 Bone Metastasis Multi-Center Study (Nature/MedRxiv Cohorts; CV AUC 0.795 -> Test AUC 0.512)',
    getBaselines: () => [
      {
        model_name: 'Penalized Logistic Regression (GLMNET / ElasticNet)',
        model_type: 'Regularized Linear',
        cv_auc: 0.732,
        test_auc: 0.548,
        f1_score: 0.52,
        brier_score: 0.231,
        description: 'L1/L2 penalized transcriptomic feature selection on normalized RNA-Seq counts.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Random Forest (500 Trees, Gini Impurity)',
        model_type: 'Tree Ensemble',
        cv_auc: 0.748,
        test_auc: 0.534,
        f1_score: 0.51,
        brier_score: 0.242,
        description: 'Random Forest baseline with 500 trees and square-root feature subsampling.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Gradient Boosted Trees (XGBoost / HistGradient)',
        model_type: 'Gradient Boosted Decision Trees',
        cv_auc: 0.765,
        test_auc: 0.562,
        f1_score: 0.54,
        brier_score: 0.228,
        description: 'XGBoost with early stopping on validation split and max depth 4.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Clinical-Only Cox Proportional Hazards Model',
        model_type: 'Clinical Covariate Baseline',
        cv_auc: 0.695,
        test_auc: 0.641,
        f1_score: 0.62,
        brier_score: 0.198,
        description: 'Age, tumour stage (T1-T4), nodal status (N0-N3), ER/PR/HER2 status without gene expression.',
        beaten_by_claim: false,
      },
    ],
  },

  neuro_oncology_pseudoprogression: {
    task: 'neuro_oncology_pseudoprogression',
    title: 'Neuro-Oncology Pseudoprogression vs. True Progression',
    why_fixed:
      'The Nature Scientific Reports benchmark demonstrated external test AUC 0.753, but clinical variables alone outperformed complex imaging signatures on multiple calibration criteria. The baseline verifies whether claimed MRI features add genuine incremental discriminatory value over clinical factors.',
    clinical_reference:
      'Nature Scientific Reports: Diagnostic differentiation of pseudoprogression vs true progression in glioblastoma post-chemoradiotherapy.',
    getBaselines: () => [
      {
        model_name: 'Clinical-Features-Only Logistic Regression',
        model_type: 'Clinical Benchmark',
        cv_auc: 0.761,
        test_auc: 0.738,
        f1_score: 0.71,
        brier_score: 0.174,
        description: 'Time from RT completion, steroid dosage (dexamethasone mg/day), KPS score, MGMT promoter status.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Single-Modality Imaging Model (T1ce Radiomics)',
        model_type: 'Classical Radiomics',
        cv_auc: 0.724,
        test_auc: 0.672,
        f1_score: 0.65,
        brier_score: 0.215,
        description: 'PyRadiomics GLCM/GLRLM texture and shape features on enhancing lesion segmentations.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Multimodal Baseline (Without Self-Supervised Pretraining)',
        model_type: 'Multimodal Deep Learning',
        cv_auc: 0.759,
        test_auc: 0.718,
        f1_score: 0.69,
        brier_score: 0.189,
        description: 'Combined 3D ResNet on MRI volumes + clinical MLP trained end-to-end without SSL contrastive pretraining.',
        beaten_by_claim: false,
      },
    ],
  },

  breast_pathology_lymph_node: {
    task: 'breast_pathology_lymph_node',
    title: 'Breast Cancer Pathology Lymph Node Metastasis Detection',
    why_fixed:
      'PathoROB multi-center evaluations demonstrated acute out-of-domain performance degradation across hospital centers due to stainer variations and slide scanners. The baseline tests center-held-out generalizability (trained on CAMELYON16, evaluated on CAMELYON17).',
    clinical_reference:
      'PathoROB Consortium & CAMELYON16/17 benchmark: Center-held-out sentinel lymph node metastasis evaluation.',
    getBaselines: () => [
      {
        model_name: 'Patch-Level CNN Baseline (CAMELYON16 Train -> CAMELYON17 Test)',
        model_type: 'ResNet50 / Color-Augmented',
        cv_auc: 0.884,
        test_auc: 0.762,
        f1_score: 0.74,
        brier_score: 0.165,
        description: 'ResNet50 tile classifier with Macenko stain normalisation, evaluated on external Center-5 slides.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Whole-Slide Attention-MIL (CLAM Baseline)',
        model_type: 'Multiple Instance Learning',
        cv_auc: 0.912,
        test_auc: 0.798,
        f1_score: 0.77,
        brier_score: 0.148,
        description: 'Clustering-constrained Attention Multiple Instance Learning on frozen UNI patch embeddings.',
        beaten_by_claim: false,
      },
    ],
  },

  glioma_grade_survival: {
    task: 'glioma_grade_survival',
    title: 'Glioma Grade & Survival Prediction',
    why_fixed:
      'External testing of brain MRI classifiers demonstrated that severe domain shift across scanner vendors degrades glioma classification. The baseline tests whether the model survives external calibration against a rigorous clinical covariate Cox model.',
    clinical_reference:
      'External calibration of brain MRI classifiers across scanner manufacturers and hospital networks.',
    getBaselines: () => [
      {
        model_name: 'Clinical Covariate Cox Model (Age + IDH + MGMT + KPS)',
        model_type: 'Covariate Baseline',
        cv_auc: 0.784,
        test_auc: 0.769,
        f1_score: 0.75,
        brier_score: 0.158,
        description: 'Standard clinical prognostication incorporating IDH1/2 mutation and MGMT promoter methylation.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Imaging-Only 3D DenseNet Radiomic Model',
        model_type: 'Volumetric CNN',
        cv_auc: 0.812,
        test_auc: 0.715,
        f1_score: 0.69,
        brier_score: 0.192,
        description: 'T1, T1ce, T2, FLAIR multimodal volumetric feature extractor without scanner batch correction.',
        beaten_by_claim: false,
      },
    ],
  },

  other: {
    task: 'other',
    title: 'General Oncology Classifier Baseline',
    why_fixed: 'Standard fixed machine learning baselines for tabular clinical and molecular predictors.',
    clinical_reference: 'Standard Oncology Benchmark Suite',
    getBaselines: () => [
      {
        model_name: 'Regularized ElasticNet Logistic Regression',
        model_type: 'Linear Baseline',
        cv_auc: 0.71,
        test_auc: 0.68,
        f1_score: 0.65,
        brier_score: 0.21,
        description: 'Cross-validated L1/L2 penalized regression.',
        beaten_by_claim: false,
      },
      {
        model_name: 'Standard Random Forest',
        model_type: 'Ensemble Baseline',
        cv_auc: 0.73,
        test_auc: 0.69,
        f1_score: 0.67,
        brier_score: 0.2,
        description: 'Random Forest with default hyperparameters.',
        beaten_by_claim: false,
      },
    ],
  },
};

/**
 * Deterministic M3: Domain-Aware Baseline Harness Tool
 * Cannot be modified by the LLM. Compares claimed test AUC against the locked baselines.
 */
export function runBaselineHarnessTool(claimSpec: ClaimSpec): BaselineHarnessResult {
  const task = claimSpec.domain_task || 'other';
  const config = DOMAIN_BASELINES[task] || DOMAIN_BASELINES['other'];

  const baselines = config.getBaselines(claimSpec);
  const claimMetric = claimSpec.claimed_metric?.value ?? 0.5;

  let bestBaseline = baselines[0];
  for (const b of baselines) {
    if (b.test_auc > bestBaseline.test_auc) {
      bestBaseline = b;
    }
  }

  // Update beaten_by_claim flags
  for (const b of baselines) {
    b.beaten_by_claim = claimMetric > b.test_auc;
  }

  // Claim beats baselines only if strictly greater than the best baseline
  const claimBeats = claimMetric > bestBaseline.test_auc;
  const margin = Number((claimMetric - bestBaseline.test_auc).toFixed(4));

  return {
    domain_task: task,
    claim_test_auc: claimMetric,
    best_baseline_name: bestBaseline.model_name,
    best_baseline_auc: bestBaseline.test_auc,
    claim_beats_baselines: claimBeats,
    margin,
    baselines,
    clinical_reference: config.clinical_reference,
    why_fixed: config.why_fixed,
  };
}
