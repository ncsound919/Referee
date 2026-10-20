import {
  LicensePassport,
  LicenseCheckResult,
  IntendedUse,
  UserRole,
} from './types';

export const LICENSE_REGISTRY: Record<string, LicensePassport> = {
  'MSK-MET': {
    dataset_id: 'MSK-MET',
    dataset_name: 'Memorial Sloan Kettering Metastatic Cohort (MSK-MET)',
    permitted_use_types: ['research'],
    required_user_roles: ['academic'],
    institutional_constraint: 'any_academic',
    registration_required: true,
    derivatives_allowed: false,
    derived_tables_public: false,
    description:
      'Genomic and clinical data for 25,000+ metastatic cancer patients. Non-commercial, academic research only. Derivatives and redistribution strictly restricted via cBioPortal institutional access agreement.',
    access_portal: 'cBioPortal for Cancer Genomics / MSK Data Agreement',
    license_clause:
      'Data may only be utilized for non-commercial, non-clinical academic research. Direct commercial exploitation, redistribution of patient-level tables, and clinical decision support integration are prohibited without an executed MSK commercial license.',
  },
  METABRIC: {
    dataset_id: 'METABRIC',
    dataset_name: 'Molecular Taxonomy of Breast Cancer International Consortium (METABRIC)',
    permitted_use_types: ['research'],
    required_user_roles: ['academic'],
    institutional_constraint: 'any_academic',
    registration_required: true,
    derivatives_allowed: true,
    derived_tables_public: false,
    description:
      'Controlled access genomic and transcriptomic profiling of 2,000+ primary breast tumours. Access regulated by EGA (European Genome-phenome Archive) Data Access Committee.',
    access_portal: 'EGA accession EGAS00000000083 / METABRIC DAC',
    license_clause:
      'Controlled access. Authorised research use only under approved Data Transfer Agreement. Commercial deployment and patient re-identification prohibited. User must hold verifiable academic institution standing.',
  },
  GSE176078: {
    dataset_id: 'GSE176078',
    dataset_name: 'GEO GSE176078 Single-Cell and Bulk RNA-Seq Breast Cancer',
    permitted_use_types: ['research', 'commercial'],
    required_user_roles: ['academic', 'industry'],
    institutional_constraint: 'none',
    registration_required: false,
    derivatives_allowed: true,
    derived_tables_public: true,
    description:
      'Open GEO access repository containing gene expression profiles for human primary breast cancers and treatment response signatures.',
    access_portal: 'NCBI Gene Expression Omnibus (GEO)',
    license_clause:
      'Public domain / NIH GEO Data Sharing Policy. Open for non-exclusive research and computational modeling provided original citation is retained.',
  },
  CAMELYON16: {
    dataset_id: 'CAMELYON16',
    dataset_name: 'Cancer Metastases in Lymph Nodes Challenge 2016 (CAMELYON16)',
    permitted_use_types: ['research', 'commercial', 'redistribution'],
    required_user_roles: ['academic', 'industry', 'patient'],
    institutional_constraint: 'none',
    registration_required: false,
    derivatives_allowed: true,
    derived_tables_public: true,
    description:
      '399 whole-slide images of sentinel lymph node biopsies from Radboud University Medical Center and University Medical Center Utrecht.',
    access_portal: 'Grand Challenge / GigaScience Database',
    license_clause: 'Creative Commons CC0 1.0 Universal Public Domain Dedication.',
  },
  CAMELYON17: {
    dataset_id: 'CAMELYON17',
    dataset_name: 'Cancer Metastases in Lymph Nodes Challenge 2017 (CAMELYON17)',
    permitted_use_types: ['research', 'commercial', 'redistribution'],
    required_user_roles: ['academic', 'industry', 'patient'],
    institutional_constraint: 'none',
    registration_required: false,
    derivatives_allowed: true,
    derived_tables_public: true,
    description:
      '1,000 whole-slide images across 5 medical centers in the Netherlands for center-held-out pN-stage evaluation.',
    access_portal: 'Grand Challenge / CAMELYON Consortium',
    license_clause: 'Creative Commons CC0 1.0 Universal Public Domain Dedication.',
  },
  'MAMA-MIA': {
    dataset_id: 'MAMA-MIA',
    dataset_name: 'Multi-Center Breast Cancer Imaging & Pathology Archive (MAMA-MIA)',
    permitted_use_types: ['research'],
    required_user_roles: ['academic', 'industry'],
    institutional_constraint: 'partner_only',
    registration_required: true,
    derivatives_allowed: true,
    derived_tables_public: false,
    description:
      'TCIA constituent licenses with public training cohort and private sequestered evaluation/test splits. Clinical diagnostic deployment restricted.',
    access_portal: 'The Cancer Imaging Archive (TCIA)',
    license_clause:
      'TCIA Data Usage Policy. Authorized for scientific research. Commercial clinical diagnostic use is blocked without separate institutional review and clear multi-center clearance.',
  },
  'TCGA-BRCA': {
    dataset_id: 'TCGA-BRCA',
    dataset_name: 'The Cancer Genome Atlas - Breast Invasive Carcinoma (TCGA-BRCA)',
    permitted_use_types: ['research', 'commercial'],
    required_user_roles: ['academic', 'industry'],
    institutional_constraint: 'none',
    registration_required: false,
    derivatives_allowed: true,
    derived_tables_public: true,
    description:
      'Open-access molecular profiling and clinical data from NCI Genomic Data Commons for 1,000+ breast cancer cases.',
    access_portal: 'NCI Genomic Data Commons (GDC)',
    license_clause:
      'Open Access Data Tier under NIH GDC Data Transfer Agreement guidelines. Attribution required; re-identification prohibited.',
  },
};

/**
 * Deterministic M2: License Passport Tool
 * Rule 2: License is a Hard Gate.
 * If checkLicenseTool returns BLOCKED, the agent stops.
 * It does not ask the user to override. It returns:
 * "Audit cannot proceed: dataset X is non-commercial."
 */
export function checkLicenseTool(
  dataset_id: string,
  intended_use: IntendedUse = 'research',
  user_role: UserRole = 'academic',
  institutional_affiliation?: string
): LicenseCheckResult {
  const normId = dataset_id.trim();
  const passport = LICENSE_REGISTRY[normId];
  const timestamp = new Date().toISOString();

  if (!passport) {
    return {
      status: 'BLOCKED',
      dataset_id: normId,
      reason: `Audit cannot proceed: dataset ${normId} is unrecognized in the Verified License Registry. Unaudited data provenance cannot clear the license gate.`,
      violations: [
        `Dataset '${normId}' not found in Overlay365 License Registry (MSK-MET, METABRIC, GSE176078, CAMELYON16, CAMELYON17, MAMA-MIA, TCGA-BRCA).`,
      ],
      timestamp,
    };
  }

  const violations: string[] = [];

  // Check permitted intended use
  if (!passport.permitted_use_types.includes(intended_use)) {
    violations.push(
      `Intended use '${intended_use}' is not permitted by dataset '${normId}' terms (Permitted: ${passport.permitted_use_types.join(', ')}).`
    );
  }

  // Check user role
  if (!passport.required_user_roles.includes(user_role)) {
    violations.push(
      `User role '${user_role}' does not meet credential constraints for '${normId}' (Required: ${passport.required_user_roles.join(', ')}).`
    );
  }

  // Check institutional constraints
  if (passport.institutional_constraint === 'partner_only') {
    if (!institutional_affiliation || institutional_affiliation.toLowerCase().includes('unknown')) {
      violations.push(
        `Dataset '${normId}' enforces a 'partner_only' institutional constraint; valid verified partner credentials must be supplied.`
      );
    }
  }

  if (violations.length > 0) {
    // Exact non-negotiable failure phrasing as required by Rule 2
    const reason =
      intended_use === 'commercial' && !passport.permitted_use_types.includes('commercial')
        ? `Audit cannot proceed: dataset ${normId} is non-commercial.`
        : `Audit cannot proceed: license contract restrictions for ${normId} violated (${violations.join('; ')}).`;

    return {
      status: 'BLOCKED',
      dataset_id: normId,
      reason,
      violations,
      passport,
      timestamp,
    };
  }

  return {
    status: 'PASSED',
    dataset_id: normId,
    reason: `License passport cleared for ${normId}. Intended use '${intended_use}' and role '${user_role}' comply with data usage terms.`,
    violations: [],
    passport,
    timestamp,
  };
}
