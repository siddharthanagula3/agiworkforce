
import { z } from 'zod';

import type { LicenseClaims } from './claims';
import { verifySignedContainer } from './container';

export const POLICY_CONTAINER_FORMAT = 'agipolicy-v1';

export const OrgPolicyByokSchema = z.enum(['allowed', 'forbidden', 'allowlist']);
export type OrgPolicyByok = z.infer<typeof OrgPolicyByokSchema>;

export const OrgPolicyEgressSchema = z
  .object({
    managedCloud: z.boolean(),
    byokDomainsAllowlist: z.array(z.string()),
  })
  .strict();

export const OrgPolicyAuditExportSchema = z
  .object({
    required: z.boolean(),
    path: z.string().optional(),
  })
  .strict();

export const OrgPolicySchema = z
  .object({
    policyId: z.string().min(1),
    orgId: z.string().min(1),
    version: z.number().int().nonnegative(),
    issuedAt: z.number().int(),
    allowedProviders: z.array(z.string()),
    allowedModels: z.array(z.string()),
    byok: OrgPolicyByokSchema,
    egress: OrgPolicyEgressSchema,
    retentionDays: z.number().int().nonnegative().optional(),
    auditExport: OrgPolicyAuditExportSchema,
    updateChannel: z.string().optional(),
  })
  .strict();

export type OrgPolicy = z.infer<typeof OrgPolicySchema>;

export interface PolicyPermissions {
  allowedProviders: string[];
  allowedModels: string[];
  byok: OrgPolicyByok;
  egress: { managedCloud: boolean; byokDomainsAllowlist: string[] };
  retentionDays?: number;
  auditExport: { required: boolean };
}

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

function listViolation(field: string, candidate: string[], baseline: string[]): string | null {
  if (baseline.includes('*')) return null;
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
  violations: string[];
}

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

export type OrgPolicyErrorCode =
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
  violations?: string[];
}

export type OrgPolicyVerifyResult =
  | { ok: true; policy: OrgPolicy }
  | { ok: false; error: OrgPolicyError };

export interface VerifyOrgPolicyOptions {
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
