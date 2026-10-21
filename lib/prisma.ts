import { ExperienceCase } from './types';

export const INITIAL_EXPERIENCE_CASES: ExperienceCase[] = [
  {
    id: 'exp_001',
    domain: 'breast_pathology_lymph_node',
    failureMode: 'patient_overlap',
    lesson: 'Slide-level random splits leak patient morphology. Enforce split_by_patient_level.',
    expectedUplift: 0.84, // 84% probability of valid scientific resolution
    pipelineHash: '4a6b8c9d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
    sourceAudit: 'audit_2104',
    utility: 0.88,
    createdAt: '2026-10-16',
  },
  {
    id: 'exp_002',
    domain: 'neuro_oncology_pseudoprogression',
    failureMode: 'patient_timepoint_overlap',
    lesson: 'Serial longitudinal scans co-occur in train/test. Use split_longitudinal_timepoint_held_out and check_scanner_nuisance_kernel.',
    expectedUplift: 0.78,
    pipelineHash: '8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b',
    sourceAudit: 'audit_4421',
    utility: 0.85,
    createdAt: '2026-10-15',
  },
  {
    id: 'exp_003',
    domain: 'breast_transcriptomic_metastasis',
    failureMode: 'batch_confound_and_cv_collapse',
    lesson: 'Cross-validation to external holdout collapse on METABRIC/GSE2034. Apply combat batch harmonization and run_clinical_cox_baseline first.',
    expectedUplift: 0.74,
    pipelineHash: '1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d',
    sourceAudit: 'claim_oct2026_bonemets',
    utility: 0.92,
    createdAt: '2026-10-14',
  },
  {
    id: 'exp_004',
    domain: 'glioma_grade_survival',
    failureMode: 'acquisition_site_bias',
    lesson: 'Scanner vendor nuisance classifier AUC > 0.70. Restrict features or apply multi-scanner harmonization.',
    expectedUplift: 0.76,
    pipelineHash: '3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f',
    sourceAudit: 'audit_1192',
    utility: 0.78,
    createdAt: '2026-10-17',
  },
  {
    id: 'exp_005',
    domain: 'general',
    failureMode: 'uncalibrated_overfitting',
    lesson: 'High nominal AUC with near-zero calibration slope. Regularize via GLMNET and evaluate Brier score.',
    expectedUplift: 0.65,
    pipelineHash: '5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b',
    sourceAudit: 'audit_5510',
    utility: 0.75,
    createdAt: '2026-10-18',
  },
];

let experienceStore: ExperienceCase[] = [...INITIAL_EXPERIENCE_CASES];

/**
 * Prisma Client representation for Overlay365 Digital Wetlab
 * Stores and queries the immutable ExperienceBase cases for the MEV model.
 */
export const prisma = {
  experienceCase: {
    findMany: async (args?: {
      where?: {
        domain?: string | { in?: string[] };
        failureMode?: string;
      };
      orderBy?: { utility?: 'asc' | 'desc' };
    }): Promise<ExperienceCase[]> => {
      let filtered = [...experienceStore];

      if (args?.where?.domain) {
        const dom = args.where.domain;
        if (typeof dom === 'string') {
          filtered = filtered.filter(
            (c) => c.domain === dom || c.domain === 'general'
          );
        } else if (typeof dom === 'object' && dom.in) {
          filtered = filtered.filter(
            (c) => dom.in?.includes(c.domain) || c.domain === 'general'
          );
        }
      }

      if (args?.where?.failureMode) {
        filtered = filtered.filter((c) => c.failureMode === args.where?.failureMode);
      }

      if (args?.orderBy?.utility === 'desc') {
        filtered.sort((a, b) => (b.utility || 0) - (a.utility || 0));
      }

      return filtered;
    },

    create: async ({
      data,
    }: {
      data: Omit<ExperienceCase, 'id'> & { id?: string };
    }): Promise<ExperienceCase> => {
      const record: ExperienceCase = {
        id: data.id || `exp_${Date.now()}_${experienceStore.length + 1}`,
        ...data,
      };
      experienceStore.push(record);
      return record;
    },

    count: async (): Promise<number> => {
      return experienceStore.length;
    },
  },
};
