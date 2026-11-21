// The mobile release check loads this file with Node directly, which cannot
// resolve the package's extensionless relative imports. Keep it free of them.
export const TERMS_ACCEPTANCE_PATH = '/api/terms/accept';
export const ADULT_ELIGIBILITY_PATH = '/api/eligibility';
