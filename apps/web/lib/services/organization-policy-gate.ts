import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SECRET_HANDLING_MODE_DEFAULT,
  type AdminPolicy,
  type SecretHandlingMode,
} from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import { readOrganizationPolicy } from '@/lib/services/organization-policy-service';
import {
  CURRENT_COLLECTION_STATE,
  readOrganizationCollectionState,
} from '@/lib/services/enterprise-collection-state';
import {
  evaluateBillingHold,
  evaluateOrganizationPolicy,
  UNSCOPED_POLICY_DECISION,
  type PolicyAsk,
  type PolicyDecision,
} from '@/lib/services/organization-policy-evaluator';

interface ScopedRequest {
  headers: { get(name: string): string | null };
}

export interface PolicyGateResult extends PolicyDecision {
  organizationId: string | null;
}

/**
 * Resolves the caller's active workspace and asks the evaluator one question.
 *
 * Two requests are deliberately unconstrained and answered `unscoped`:
 * personal scope (no active organization), and an organization that has never
 * saved a policy. Absence of a policy is absence of governance, not a silent
 * application of the table's restrictive column defaults, inheriting those
 * would switch off managed compute for every existing organization the moment
 * this shipped. Once an admin saves a policy, it binds.
 *
 * A failure to read the policy is logged and answered `unscoped` rather than
 * denied: this gate governs an administrator's product configuration, and a
 * transient database error must not look to a member like a policy decision.
 * Tenant isolation does not depend on this path, that is enforced by RLS.
 */
export async function evaluateActiveWorkspacePolicy(
  db: DatabaseAdapter,
  userId: string,
  ask: PolicyAsk,
  request?: ScopedRequest,
): Promise<PolicyGateResult> {
  let organizationId: string | null = null;

  try {
    organizationId = await resolveActiveOrganizationId(db, userId, request);
  } catch (error) {
    logger.warn({ error, userId }, '[org-policy] active workspace could not be resolved');
    return { ...UNSCOPED_POLICY_DECISION, organizationId: null };
  }

  if (!organizationId) return { ...UNSCOPED_POLICY_DECISION, organizationId: null };

  let collectionState = CURRENT_COLLECTION_STATE;
  try {
    collectionState = await readOrganizationCollectionState(db, organizationId);
  } catch (error) {
    logger.error(
      { error, userId, organizationId, resource: ask.resource },
      '[org-policy] collection state read failed; billing hold treated as not applicable',
    );
  }

  let policy = null;
  try {
    policy = await readOrganizationPolicy(db, organizationId);
  } catch (error) {
    logger.error(
      { error, userId, organizationId, resource: ask.resource },
      '[org-policy] policy read failed; request treated as ungoverned',
    );
    const billingHold = evaluateBillingHold(ask, collectionState);
    if (billingHold) {
      logger.info(
        { userId, organizationId, resource: ask.resource, code: billingHold.code },
        '[org-policy] request denied by billing hold',
      );
      return { ...billingHold, organizationId };
    }
    return { ...UNSCOPED_POLICY_DECISION, organizationId };
  }

  if (!policy) {
    const billingHold = evaluateBillingHold(ask, collectionState);
    if (billingHold) {
      logger.info(
        { userId, organizationId, resource: ask.resource, code: billingHold.code },
        '[org-policy] request denied by billing hold',
      );
      return { ...billingHold, organizationId };
    }
    return { ...UNSCOPED_POLICY_DECISION, organizationId };
  }

  const decision = evaluateOrganizationPolicy(policy, ask, collectionState);

  if (!decision.allowed) {
    logger.info(
      { userId, organizationId, resource: ask.resource, code: decision.code },
      '[org-policy] request denied by workspace policy',
    );
  }

  return { ...decision, organizationId };
}

export interface SecretHandlingPolicyResult {
  mode: SecretHandlingMode;
  organizationId: string | null;
}

export async function resolveSecretHandlingPolicy(
  db: DatabaseAdapter,
  userId: string,
  request?: ScopedRequest,
): Promise<SecretHandlingPolicyResult> {
  let organizationId: string | null = null;

  try {
    organizationId = await resolveActiveOrganizationId(db, userId, request);
  } catch (error) {
    logger.warn({ error, userId }, '[secret-handling] active workspace could not be resolved');
    return { mode: SECRET_HANDLING_MODE_DEFAULT.personal, organizationId: null };
  }

  if (!organizationId) {
    return { mode: SECRET_HANDLING_MODE_DEFAULT.personal, organizationId: null };
  }

  try {
    const policy = await readOrganizationPolicy(db, organizationId);
    return {
      mode: policy?.secretHandling ?? SECRET_HANDLING_MODE_DEFAULT.organization,
      organizationId,
    };
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[secret-handling] policy read failed; falling back to the organization default',
    );
    return { mode: SECRET_HANDLING_MODE_DEFAULT.organization, organizationId };
  }
}

export interface MfaPolicyResult {
  policy: AdminPolicy | null;
  organizationId: string | null;
}

export async function resolveMfaPolicy(
  db: DatabaseAdapter,
  userId: string,
  request?: ScopedRequest,
): Promise<MfaPolicyResult> {
  let organizationId: string | null = null;

  try {
    organizationId = await resolveActiveOrganizationId(db, userId, request);
  } catch (error) {
    logger.warn({ error, userId }, '[mfa-policy] active workspace could not be resolved');
    return { policy: null, organizationId: null };
  }

  if (!organizationId) return { policy: null, organizationId: null };

  try {
    const policy = await readOrganizationPolicy(db, organizationId);
    return { policy, organizationId };
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[mfa-policy] policy read failed; request treated as ungoverned',
    );
    return { policy: null, organizationId };
  }
}

export interface ZeroDataRetentionPolicyResult {
  required: boolean;
  organizationId: string | null;
}

export async function resolveZeroDataRetentionPolicy(
  db: DatabaseAdapter,
  userId: string,
  request?: ScopedRequest,
): Promise<ZeroDataRetentionPolicyResult> {
  let organizationId: string | null = null;

  try {
    organizationId = await resolveActiveOrganizationId(db, userId, request);
  } catch (error) {
    logger.warn({ error, userId }, '[zero-data-retention] active workspace could not be resolved');
    return { required: false, organizationId: null };
  }

  if (!organizationId) return { required: false, organizationId: null };

  try {
    const policy = await readOrganizationPolicy(db, organizationId);
    return { required: policy?.zeroDataRetentionOnly ?? false, organizationId };
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[zero-data-retention] policy read failed; request treated as ungoverned',
    );
    return { required: false, organizationId };
  }
}

export interface IpAllowListPolicyResult {
  cidrs: readonly string[];
  organizationId: string | null;
}

export async function resolveIpAllowListPolicy(
  db: DatabaseAdapter,
  userId: string,
  request?: ScopedRequest,
): Promise<IpAllowListPolicyResult> {
  let organizationId: string | null = null;

  try {
    organizationId = await resolveActiveOrganizationId(db, userId, request);
  } catch (error) {
    logger.warn({ error, userId }, '[ip-allow-list] active workspace could not be resolved');
    return { cidrs: [], organizationId: null };
  }

  if (!organizationId) return { cidrs: [], organizationId: null };

  try {
    const policy = await readOrganizationPolicy(db, organizationId);
    return { cidrs: policy?.ipAllowList ?? [], organizationId };
  } catch (error) {
    logger.error(
      { error, userId, organizationId },
      '[ip-allow-list] policy read failed; request treated as ungoverned',
    );
    return { cidrs: [], organizationId };
  }
}
