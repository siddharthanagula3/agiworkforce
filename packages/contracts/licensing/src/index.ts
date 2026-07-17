/**
 * @agiworkforce/licensing
 *
 * Pure, offline-verifiable enterprise licensing primitives (design
 * `docs/enterprise/enterprise-local-design.md` §2.1). No I/O, no network, no
 * throwing: `verifyLicense` returns a structured verdict so callers degrade to
 * the free Local tier on any failure and NEVER block data access.
 *
 * This is the verifiable primitive only. It is NOT wired into any app runtime,
 * UI, or enforcement path — that is a later, separately-scoped step. Product
 * feature-flag semantics, editions, pricing, and activation (design §4) are
 * founder-gated and intentionally absent here.
 *
 * The `@agiworkforce/licensing/test-support` subpath (fixture signing) is
 * exported separately and is NOT re-exported here — production code verifies
 * only; issuers sign out of band.
 *
 * @packageDocumentation
 */

// License claims schema + types (design §2.1). `features[]` is an open string
// array by design — no product flags are enumerated here.
export { EditionSchema, LicenseClaimsSchema } from './claims';
export type { Edition, LicenseClaims } from './claims';

// The signed-container format + reusable verification primitive. Org-policy
// verification reuses `verifySignedContainer` with the license's `policyKeys`
// as the authorized key set.
export { verifySignedContainer } from './container';
export type { ContainerError, ContainerErrorCode, VerifiedContainer } from './container';

// The offline license verifier.
export { LICENSE_CONTAINER_FORMAT, verifyLicense } from './verify';
export type { LicenseError, LicenseErrorCode, LicenseVerifyResult } from './verify';

// Signed org-policy schema, offline verifier, and monotonic-tightening rules.
export {
  POLICY_CONTAINER_FORMAT,
  OrgPolicyByokSchema,
  OrgPolicyEgressSchema,
  OrgPolicyAuditExportSchema,
  OrgPolicySchema,
  DEFAULT_POLICY_BASELINE,
  checkPolicyTightening,
  verifyOrgPolicy,
} from './org-policy';
export type {
  OrgPolicyByok,
  OrgPolicy,
  PolicyPermissions,
  TighteningResult,
  OrgPolicyErrorCode,
  OrgPolicyError,
  OrgPolicyVerifyResult,
  VerifyOrgPolicyOptions,
} from './org-policy';
