/**
 * Signed **org policy** (enterprise Local, design
 * `docs/enterprise/enterprise-local-design.md` §2.2).
 *
 * An org policy is a signed data document that admins distribute (file drop,
 * MDM, or self-hosted gateway) and every all-mode surface enforces locally. It
 * lives with the offline licensing boundary because its root of trust is an org
 * license. It is NOT a cloud endpoint — it is a signed file, verified fully
 * offline.
 *
 * Root of trust: the org LICENSE. The policy signature must verify against a key
 * listed in the (already-verified) license's `policyKeys[]`, so a forged policy
 * cannot loosen anything the license did not authorize.
 *
 * Monotonic tightening: a policy may only RESTRICT relative to product defaults
 * (or a prior policy), never GRANT. See `checkPolicyTightening` for the exact
 * lattice and `DEFAULT_POLICY_BASELINE` for the product-default baseline it
 * tightens against.
 *
 * Scope note: this pass ships the schema + verifier + fixtures only. It is not
 * wired into any surface's enforcement path (design §2.2 enforcement points are
 * a later, per-surface step). The `packages/contracts/types/src/suite-contracts.ts`
 * mirror named in the design remains intentionally deferred.
 */

import { z } from 'zod';

import type { LicenseClaims } from './claims';
import { verifySignedContainer } from './container';

/** The `format` discriminator for signed org-policy containers. */
export const POLICY_CONTAINER_FORMAT = 'agipolicy-v1';

/** BYOK posture. Permissiveness order: `allowed` > `allowlist` > `forbidden`. */
export const OrgPolicyByokSchema = z.enum(['allowed', 'forbidden', 'allowlist']);
export type OrgPolicyByok = z.infer<typeof OrgPolicyByokSchema>;

export const OrgPolicyEgressSchema = z
  .object({
    /** Whether managed-cloud egress is permitted at all. */
    managedCloud: z.boolean(),
    /**
     * BYOK provider domains the org permits. `['*']` means unrestricted (all
     * domains). A concrete list restricts to those domains.
     */
    byokDomainsAllowlist: z.array(z.string()),
  })
  .strict();

export const OrgPolicyAuditExportSchema = z
  .object({
    /** Whether the org requires audit export (a compliance OBLIGATION). */
    required: z.boolean(),
    /** Optional export destination path. */
    path: z.string().optional(),
  })
  .strict();

/**
 * `OrgPolicy` — the exact schema from design §2.2.
 *
 * `allowedProviders` / `allowedModels` use `'*'` to mean "unrestricted"; a
 * concrete list restricts to those ids (`allowedModels` accepts models.json ids
 * or `'local:*'`). Values are validated for SHAPE only — this contract does not
 * assert any particular provider/model id exists.
 */
export const OrgPolicySchema = z
  .object({
    policyId: z.string().min(1),
    orgId: z.string().min(1),
    /** Monotonic version counter for this org's policy series. */
    version: z.number().int().nonnegative(),
    /** Unix epoch milliseconds when the policy was issued. */
    issuedAt: z.number().int(),
    allowedProviders: z.array(z.string()),
    allowedModels: z.array(z.string()),
    byok: OrgPolicyByokSchema,
    egress: OrgPolicyEgressSchema,
    /** Max local retention in days; absent = unbounded (product default). */
    retentionDays: z.number().int().nonnegative().optional(),
    auditExport: OrgPolicyAuditExportSchema,
    updateChannel: z.string().optional(),
  })
  .strict();

export type OrgPolicy = z.infer<typeof OrgPolicySchema>;

// ---------------------------------------------------------------------------
// Monotonic tightening
// ---------------------------------------------------------------------------

/**
 * The permission fields that participate in the monotonic-tightening lattice.
 * Non-permission metadata (`policyId`, `orgId`, `version`, `issuedAt`,
 * `updateChannel`, `auditExport.path`) is deliberately excluded — it does not
 * grant or restrict a capability.
 */
export interface PolicyPermissions {
  allowedProviders: string[];
  allowedModels: string[];
  byok: OrgPolicyByok;
  egress: { managedCloud: boolean; byokDomainsAllowlist: string[] };
  /** `undefined` = unbounded retention (most permissive). */
  retentionDays?: number;
  auditExport: { required: boolean };
}

/**
 * The product-default baseline every first policy tightens against — the
 * maximally-permissive point of the lattice:
 *   - all providers and models allowed (`['*']`),
 *   - BYOK allowed,
 *   - managed-cloud egress allowed, all BYOK domains allowed (`['*']`),
 *   - unbounded retention,
 *   - audit export not required.
 *
 * A first policy can only pare this down. To enforce version-to-version
 * monotonicity ("a policy cannot re-enable what a prior policy forbade"), pass
 * the prior policy's permissions as the baseline instead.
 */
export const DEFAULT_POLICY_BASELINE: PolicyPermissions = {
  allowedProviders: ['*'],
  allowedModels: ['*'],
  byok: 'allowed',
  egress: { managedCloud: true, byokDomainsAllowlist: ['*'] },
  retentionDays: undefined,
  auditExport: { required: false },
};

const BYOK_RANK: Record<OrgPolicyByok, number> = {
  forbidden: 0,
  allowlist: 1,
  allowed: 2,
};

function extractPermissions(policy: OrgPolicy): PolicyPermissions {
  return {
    allowedProviders: policy.allowedProviders,
    allowedModels: policy.allowedModels,
    byok: policy.byok,
    egress: {
      managedCloud: policy.egress.managedCloud,
      byokDomainsAllowlist: policy.egress.byokDomainsAllowlist,
    },
    retentionDays: policy.retentionDays,
    auditExport: { required: policy.auditExport.required },
  };
}

/**
 * Report a violation if `candidate`'s allowlist is broader than `baseline`'s.
 * `'*'` means unrestricted (broadest). Returns a message, or `null` if the
 * candidate list is a tightening (subset) of the baseline.
 */
function listViolation(field: string, candidate: string[], baseline: string[]): string | null {
  if (baseline.includes('*')) return null; // baseline unrestricted → anything is ⊑
  if (candidate.includes('*')) {
    return `${field}: policy re-grants all ("*") but the baseline restricts to [${baseline.join(', ')}]`;
  }
  const extra = candidate.filter((value) => !baseline.includes(value));
  if (extra.length > 0) {
    return `${field}: policy grants [${extra.join(', ')}] not permitted by the baseline`;
  }
  return null;
}

export interface TighteningResult {
  ok: boolean;
  /** Human-readable reasons the candidate is more permissive than the baseline. */
  violations: string[];
}

/**
 * Pure monotonic-tightening check: is `candidate` no more permissive than
 * `baseline` on every lattice field? A policy may only restrict, never grant.
 *
 * Lattice (candidate must be ⊑ baseline):
 *   - allowedProviders / allowedModels / egress.byokDomainsAllowlist: subset,
 *     with `'*'` as the unrestricted top.
 *   - byok: `allowed` > `allowlist` > `forbidden`.
 *   - egress.managedCloud: `true` (permit) > `false` (deny).
 *   - retentionDays: shorter is tighter; `undefined` = unbounded (top). A policy
 *     may not retain LONGER than the baseline.
 *   - auditExport.required: `true` (required) is tighter than `false`. A policy
 *     may not DROP a required audit the baseline mandated.
 */
export function checkPolicyTightening(
  candidate: OrgPolicy | PolicyPermissions,
  baseline: PolicyPermissions = DEFAULT_POLICY_BASELINE,
): TighteningResult {
  const permissions = 'policyId' in candidate ? extractPermissions(candidate) : candidate;
  const violations: string[] = [];

  const providerViolation = listViolation(
    'allowedProviders',
    permissions.allowedProviders,
    baseline.allowedProviders,
  );
  if (providerViolation) violations.push(providerViolation);

  const modelViolation = listViolation(
    'allowedModels',
    permissions.allowedModels,
    baseline.allowedModels,
  );
  if (modelViolation) violations.push(modelViolation);

  const domainViolation = listViolation(
    'egress.byokDomainsAllowlist',
    permissions.egress.byokDomainsAllowlist,
    baseline.egress.byokDomainsAllowlist,
  );
  if (domainViolation) violations.push(domainViolation);

  if (BYOK_RANK[permissions.byok] > BYOK_RANK[baseline.byok]) {
    return {
      ok: false,
      violations: [
        ...violations,
        `byok: "${permissions.byok}" is more permissive than baseline "${baseline.byok}"`,
      ],
    };
  }

  if (permissions.egress.managedCloud && !baseline.egress.managedCloud) {
    violations.push(
      'egress.managedCloud: policy re-enables managed-cloud egress the baseline forbids',
    );
  }

  const candidateRetention = permissions.retentionDays ?? Number.POSITIVE_INFINITY;
  const baselineRetention = baseline.retentionDays ?? Number.POSITIVE_INFINITY;
  if (candidateRetention > baselineRetention) {
    violations.push(
      `retentionDays: policy retains ${permissions.retentionDays ?? 'unbounded'} days, longer than the baseline ${baseline.retentionDays ?? 'unbounded'}`,
    );
  }

  if (baseline.auditExport.required && !permissions.auditExport.required) {
    violations.push('auditExport.required: policy drops an audit export the baseline requires');
  }

  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type OrgPolicyErrorCode =
  /** Not a well-formed container, or policy JSON/schema invalid. */
  | 'malformed'
  /** Well-formed, but no key in the license's `policyKeys[]` verifies it. */
  | 'bad_signature'
  /** Policy `orgId` does not match the license's `orgId`. */
  | 'org_mismatch'
  /** Policy `issuedAt` is in the future relative to the local clock. */
  | 'not_yet_valid'
  /** Policy grants beyond the baseline (violates monotonic tightening). */
  | 'not_tightening';

export interface OrgPolicyError {
  code: OrgPolicyErrorCode;
  message: string;
  /** Populated for `not_tightening`: each lattice field that was loosened. */
  violations?: string[];
}

export type OrgPolicyVerifyResult =
  | { ok: true; policy: OrgPolicy }
  | { ok: false; error: OrgPolicyError };

export interface VerifyOrgPolicyOptions {
  /**
   * The baseline the policy must tighten against. Defaults to
   * `DEFAULT_POLICY_BASELINE`. Pass a prior policy's permissions to enforce
   * version-to-version monotonicity.
   */
  baseline?: PolicyPermissions;
}

/**
 * Verify a signed org-policy file offline. Pure, no I/O, never throws.
 *
 * Precondition: `licenseClaims` MUST already be verified via
 * `verifyLicense` — this function trusts `licenseClaims.policyKeys` as the
 * authorized signer set and `licenseClaims.orgId` as the binding org.
 *
 * @param fileBytes  raw bytes of the signed policy file.
 * @param licenseClaims  the verified license claims (root of trust).
 * @param nowMs  local clock in Unix epoch milliseconds.
 */
export function verifyOrgPolicy(
  fileBytes: Uint8Array,
  licenseClaims: LicenseClaims,
  nowMs: number,
  options: VerifyOrgPolicyOptions = {},
): OrgPolicyVerifyResult {
  const container = verifySignedContainer(
    fileBytes,
    licenseClaims.policyKeys,
    POLICY_CONTAINER_FORMAT,
  );
  if (!container.ok) {
    return { ok: false, error: { code: container.error.code, message: container.error.message } };
  }

  let policyText: string;
  try {
    policyText = new TextDecoder('utf-8', { fatal: true }).decode(container.payload);
  } catch {
    return { ok: false, error: { code: 'malformed', message: 'org policy is not valid UTF-8' } };
  }

  let policyJson: unknown;
  try {
    policyJson = JSON.parse(policyText);
  } catch {
    return { ok: false, error: { code: 'malformed', message: 'org policy is not valid JSON' } };
  }

  const parsed = OrgPolicySchema.safeParse(policyJson);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'malformed', message: `org policy failed schema: ${parsed.error.message}` },
    };
  }

  const policy = parsed.data;

  if (policy.orgId !== licenseClaims.orgId) {
    return {
      ok: false,
      error: { code: 'org_mismatch', message: 'org policy orgId does not match the license orgId' },
    };
  }

  if (policy.issuedAt > nowMs) {
    return {
      ok: false,
      error: {
        code: 'not_yet_valid',
        message: 'org policy is not yet valid (issuedAt is in the future)',
      },
    };
  }

  const tightening = checkPolicyTightening(policy, options.baseline ?? DEFAULT_POLICY_BASELINE);
  if (!tightening.ok) {
    return {
      ok: false,
      error: {
        code: 'not_tightening',
        message: 'org policy grants beyond the baseline (monotonic tightening violated)',
        violations: tightening.violations,
      },
    };
  }

  return { ok: true, policy };
}
