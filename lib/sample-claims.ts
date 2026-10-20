import { ClaimSpec } from './types';

export const SAMPLE_CLAIMS: Record<string, ClaimSpec> = {
  oct2026_bonemets: {
    claim_id: 'claim_oct2026_bonemets',
    title: 'Multi-Center 42-Gene Transcriptomic Bone Metastasis Risk Signature in ER+ Breast Cancer',
    authors: ['H. Lindqvist et al.', 'Breast Oncology Genomics Working Group'],
    publication_reference: {
      doi: '10.1038/s41523-026-00892-x',
      preprint_url: 'https://doi.org/10.1101/2026.10.12.589104',
      year: 2026,
      journal: 'Nature Breast Cancer / MedRxiv',
    },
    repository_url: 'https://github.com/oncology-reproducibility-archive/oct2026-bonemets-audit',
    dataset_id: 'METABRIC',
    intended_use: 'research',
    user_role: 'academic',
    institutional_affiliation: 'Karolinska Institute & Dana-Farber Cancer Institute',
    domain_task: 'breast_transcriptomic_metastasis',
    claimed_metric: {
      name: 'AUC-ROC',
      value: 0.812,
      confidence_interval: [0.774, 0.849],
      split_type: '5-fold cross-validation random split',
    },
    split_description:
      'Standard 5-fold cross-validation on normalized RNA-Seq log2 FPKM expression data from METABRIC and GSE2034 cohorts without batch-balancing across sequencing runs.',
    patient_identifier_field: 'METABRIC_PATIENT_ID',
    sample_identifier_field: 'SAMPLE_BARCODE',
    batch_or_center_field: 'SEQUENCING_PLATE_BATCH',
    negative_control_tested: false,
    missing_fields: [],
    raw_claim_text:
      'We demonstrate a 42-gene RNA-Seq signature that predicts 5-year bone-specific metastasis in ER+ primary breast cancer with an internal cross-validated AUC of 0.812 (95% CI 0.774-0.849).',
  },

  glio_pseudoprog: {
    claim_id: 'claim_glio_mri_deepnet',
    title: 'Multimodal 3D ResNet for Differentiating Glioblastoma Pseudoprogression from True Early Progression',
    authors: ['J. K. Vance et al.', 'Consortium for Advanced Neuro-Oncology Imaging'],
    publication_reference: {
      doi: '10.1038/s41598-026-78102-1',
      preprint_url: 'https://doi.org/10.1101/2026.04.14.532101',
      year: 2026,
      journal: 'Nature Scientific Reports',
    },
    repository_url: 'https://github.com/neuro-imaging-lab/pseudo-prog-resnet3d',
    dataset_id: 'TCGA-BRCA',
    intended_use: 'research',
    user_role: 'academic',
    institutional_affiliation: 'UCSF Medical Center & MD Anderson Cancer Center',
    domain_task: 'neuro_oncology_pseudoprogression',
    claimed_metric: {
      name: 'AUC-ROC',
      value: 0.874,
      confidence_interval: [0.831, 0.916],
      split_type: 'Random scan-level longitudinal partition',
    },
    split_description:
      'Scans were pooled across baseline pre-treatment MRI and follow-up post-chemoradiotherapy sessions, then randomly partitioned 80/20 train/test at scan-level.',
    patient_identifier_field: 'SUBJECT_CASE_ID',
    sample_identifier_field: 'SCAN_SERIES_UID',
    imaging_metadata: {
      scanner_vendor: 'Single-Site Siemens Magnetom Skyra 3.0T',
      slice_thickness_mm: 1.0,
      reconstruction_kernel: 'H40s brain kernel (site-specific)',
    },
    negative_control_tested: true,
    missing_fields: [],
    raw_claim_text:
      'Our deep 3D multimodal convolutional architecture trained on post-chemoradiotherapy MRI differentiates pseudoprogression from true tumor recurrence with an AUC of 0.874, substantially exceeding existing clinical nomograms.',
  },

  camelyon_lymph: {
    claim_id: 'claim_camelyon17_patchnet',
    title: 'Center-Invariant Patch-Level Deep Neural Network for CAMELYON17 Lymph Node Metastasis Detection',
    authors: ['M. Chen et al.', 'European Pathology AI Alliance'],
    publication_reference: {
      doi: '10.1016/j.media.2026.102844',
      year: 2026,
      journal: 'Medical Image Analysis',
    },
    repository_url: 'https://github.com/computational-pathology/vit-camelyon17',
    dataset_id: 'CAMELYON17',
    intended_use: 'research',
    user_role: 'academic',
    institutional_affiliation: 'Radboud University Medical Center & Charité Berlin',
    domain_task: 'breast_pathology_lymph_node',
    claimed_metric: {
      name: 'AUC-ROC',
      value: 0.772,
      confidence_interval: [0.738, 0.806],
      split_type: 'Slide-level random 80/20 split on CAMELYON17',
    },
    split_description:
      'Slide-level random 80/20 train/test partitioning across whole-slide images without grouping multiple lymph node sections from the same patient or isolating center 5.',
    patient_identifier_field: 'PATIENT_ID',
    sample_identifier_field: 'WSI_SLIDE_ID',
    negative_control_tested: false,
    missing_fields: [],
    raw_claim_text:
      'We report an attention-based patch classifier evaluated on CAMELYON17 achieving AUC 0.772 across multi-center whole-slide images.',
  },

  gse_tnbc_pass: {
    claim_id: 'claim_gse176078_tnbc_pass',
    title: 'Patient-Stratified Single-Cell and Bulk RNA Signature of Neoadjuvant Chemotherapy Response in TNBC',
    authors: ['A. R. Dupont et al.', 'Translational Breast Cancer Consortium'],
    publication_reference: {
      doi: '10.1158/0008-5472.CAN-26-1102',
      year: 2026,
      journal: 'Cancer Research',
    },
    repository_url: 'https://github.com/tnbc-translational-group/chemo-resistance-sig',
    dataset_id: 'GSE176078',
    intended_use: 'research',
    user_role: 'academic',
    institutional_affiliation: 'Institut Curie & Cambridge University',
    domain_task: 'breast_transcriptomic_metastasis',
    claimed_metric: {
      name: 'AUC-ROC',
      value: 0.742,
      confidence_interval: [0.698, 0.785],
      split_type: 'Patient-stratified center-held-out split',
    },
    split_description:
      'Patient-stratified held-out test split with ComBat batch correction. Zero patient overlap between train and test. Negative control sample permutations evaluated.',
    patient_identifier_field: 'PATIENT_ID',
    sample_identifier_field: 'SAMPLE_GSM_ID',
    batch_or_center_field: 'HOSPITAL_COHORT',
    negative_control_tested: true,
    missing_fields: [],
    raw_claim_text:
      'Using strictly patient-stratified test splits and batch harmonization on GSE176078, our model predicts pathologic complete response (pCR) with AUC 0.742, outperforming Random Forest (AUC 0.690) with confirmed calibration.',
  },

  commercial_msk_blocked: {
    claim_id: 'claim_commercial_msk_blocked',
    title: 'Commercial Targeted Drug Sensitivity Deep Genomic Classifier on MSK-MET Cohort',
    authors: ['Biopharma Analytics AI Team'],
    publication_reference: {
      preprint_url: 'https://biopharma-internal.corp/whitepaper/msk-drug-response-2026',
      year: 2026,
      journal: 'Corporate Technical Report',
    },
    repository_url: 'https://github.com/biopharma-corp/msk-met-commercial-pipeline',
    dataset_id: 'MSK-MET',
    intended_use: 'commercial', // Violates non-commercial license!
    user_role: 'industry',
    institutional_affiliation: 'OmniPharma Therapeutics Inc.',
    domain_task: 'breast_transcriptomic_metastasis',
    claimed_metric: {
      name: 'AUC-ROC',
      value: 0.845,
      confidence_interval: [0.812, 0.878],
      split_type: 'Patient-held-out test split',
    },
    split_description: 'Patient-held-out evaluation across 4,500 metastatic breast and solid tumor cases.',
    patient_identifier_field: 'MSK_PATIENT_ID',
    negative_control_tested: true,
    missing_fields: [],
    raw_claim_text:
      'We deploy a commercial deep neural network predicting tyrosine kinase inhibitor response trained directly on MSK-MET metastatic patient records for commercial companion diagnostic development.',
  },

  unverifiable_claim: {
    claim_id: 'claim_missing_split_unverifiable',
    title: 'Deep Learning Radiomic Classifier for Glioma Survival Risk Stratification',
    authors: ['Anonymous Machine Learning Team'],
    publication_reference: {
      preprint_url: 'https://arxiv.org/abs/2610.99999',
      year: 2026,
      journal: 'arXiv preprint',
    },
    repository_url: 'https://github.com/anonymous/glioma-deep-risk',
    dataset_id: 'TCGA-BRCA',
    intended_use: 'research',
    user_role: 'academic',
    institutional_affiliation: 'Academic Department of Computing',
    domain_task: 'glioma_grade_survival',
    claimed_metric: {
      name: 'C-index / AUC',
      value: 0.88,
      split_type: 'Unspecified',
    },
    split_description: '', // Missing!
    missing_fields: ['split_description', 'patient_identifier_field'],
    raw_claim_text:
      'We achieved a high C-index of 0.88 on brain MRI survival prediction using a convolutional neural network. Training details and split partitions are omitted.',
  },
};
