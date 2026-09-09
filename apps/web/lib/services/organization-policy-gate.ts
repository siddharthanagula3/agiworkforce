import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SECRET_HANDLING_MODE_DEFAULT,
  strictestSecretHandlingMode,
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
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import { resolveGoverningOrganizationIds } from '@/lib/services/governing-organizations';
import {
  getCachedIpAllowList,
  setCachedIpAllowList,
} from '@/lib/services/organization-ip-allow-list-cache';
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

async function evaluateFundingOrganizationBillingHold(
  db: DatabaseAdapter,
  userId: string,
  ask: PolicyAsk,
): Promise<PolicyGateResult | null> {
  let fundingOrganizationId: string | null;
  try {
    fundingOrganizationId = await resolveEnterpriseFundingOrganizationId(db, userId);
  } catch (error) {
    logger.error(
      { error, userId, resource: ask.resource },
      '[org-policy] funding organization lookup failed; billing hold treated as not applicable',
    );
    return null;
  }
  if (!fundingOrganizationId) return null;

  let collectionState = CURRENT_COLLECTION_STATE;
  try {
    collectionState = await readOrganizationCollectionState(db, fundingOrganizationId);
  } catch (error) {
    logger.error(
      { error, userId, organizationId: fundingOrganizationId, resource: ask.resource },
      '[org-policy] collection state read failed; billing hold treated as not applicable',
    );
    return null;
  }

  const billingHold = evaluateBillingHold(ask, collectionState);
  if (!billingHold) return null;

  logger.info(
    {
      userId,
      organizationId: fundingOrganizationId,
      resource: ask.resource,
      code: billingHold.code,
    },
    '[org-policy] personal-scope request denied by funding organization billing hold',
  );
  return { ...billingHold, organizationId: fundingOrganizationId };
}

async function governingOrganizationIds(
  db: DatabaseAdapter,
  userId: string,
): Promise<readonly string[] | null> {
  try {
    return await resolveGoverningOrganizationIds(db, userId);
  } catch (error) {
    logger.warn({ error, userId }, '[org-policy] governing organizations could not be resolved');
    return null;
  }
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
 *
 * Personal scope is unconstrained for policy, but not for an unpaid
 * enterprise contract: before answering `unscoped`, a resolved personal scope
 * is checked against the caller's own funding organization's billing hold, so
 * that scope selection is never the mechanism that decides whether a
 * delinquent enterprise contract still buys managed compute.
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

  if (!organizationId) {
    const fundingBillingHold = await evaluateFundingOrganizationBillingHold(db, userId, ask);
    if (fundingBillingHold) return fundingBillingHold;
    return { ...UNSCOPED_POLICY_DECISION, organizationId: null };
  }

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
): Promise<SecretHandlingPolicyResult> {
  const organizationIds = await governingOrganizationIds(db, userId);
  if (!organizationIds || organizationIds.length === 0) {
    return { mode: SECRET_HANDLING_MODE_DEFAULT.personal, organizationId: null };
  }

  let mode: SecretHandlingMode | null = null;
  let strictestOrganizationId: string | null = null;

  for (const organizationId of organizationIds) {
    let organizationMode: SecretHandlingMode;
    try {
      const policy = await readOrganizationPolicy(db, organizationId);
      organizationMode = policy?.secretHandling ?? SECRET_HANDLING_MODE_DEFAULT.organization;
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[secret-handling] policy read failed; falling back to the organization default',
      );
      organizationMode = SECRET_HANDLING_MODE_DEFAULT.organization;
    }

    if (mode === null || strictestSecretHandlingMode(mode, organizationMode) !== mode) {
      mode = organizationMode;
      strictestOrganizationId = organizationId;
    }
  }

  return {
    mode: mode ?? SECRET_HANDLING_MODE_DEFAULT.personal,
    organizationId: strictestOrganizationId,
  };
}

export interface MfaPolicyResult {
  policy: AdminPolicy | null;
  organizationId: string | null;
}

export async function resolveMfaPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<MfaPolicyResult> {
  const organizationIds = await governingOrganizationIds(db, userId);
  if (!organizationIds) return { policy: null, organizationId: null };

  let firstGoverned: MfaPolicyResult | null = null;

  for (const organizationId of organizationIds) {
    let policy: AdminPolicy | null;
    try {
      policy = await readOrganizationPolicy(db, organizationId);
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[mfa-policy] policy read failed; organization treated as ungoverned',
      );
      continue;
    }

    if (policy?.requireMfa) return { policy, organizationId };
    firstGoverned ??= { policy, organizationId };
  }

  return firstGoverned ?? { policy: null, organizationId: null };
}

export interface ZeroDataRetentionPolicyResult {
  required: boolean;
  organizationId: string | null;
}

export async function resolveZeroDataRetentionPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<ZeroDataRetentionPolicyResult> {
  const organizationIds = await governingOrganizationIds(db, userId);
  if (!organizationIds) return { required: false, organizationId: null };

  let firstGoverned: ZeroDataRetentionPolicyResult | null = null;

  for (const organizationId of organizationIds) {
    let policy: AdminPolicy | null;
    try {
      policy = await readOrganizationPolicy(db, organizationId);
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[zero-data-retention] policy read failed; organization treated as ungoverned',
      );
      continue;
    }

    if (policy?.zeroDataRetentionOnly) return { required: true, organizationId };
    firstGoverned ??= { required: false, organizationId };
  }

  return firstGoverned ?? { required: false, organizationId: null };
}

export interface GovernedIpAllowList {
  organizationId: string;
  cidrs: readonly string[];
}

export interface IpAllowListPolicyResult {
  governed: readonly GovernedIpAllowList[];
}

export async function resolveIpAllowListPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<IpAllowListPolicyResult> {
  const organizationIds = await governingOrganizationIds(db, userId);
  if (!organizationIds) return { governed: [] };

  const governed: GovernedIpAllowList[] = [];

  for (const organizationId of organizationIds) {
    const cached = getCachedIpAllowList(organizationId);
    if (cached !== undefined) {
      governed.push({ organizationId, cidrs: cached });
      continue;
    }

    try {
      const policy = await readOrganizationPolicy(db, organizationId);
      const cidrs = policy?.ipAllowList ?? [];
      setCachedIpAllowList(organizationId, cidrs);
      governed.push({ organizationId, cidrs });
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[ip-allow-list] policy read failed; organization treated as ungoverned',
      );
    }
  }

  return { governed };
}
