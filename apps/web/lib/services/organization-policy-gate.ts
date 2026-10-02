import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  SECRET_HANDLING_MODE_DEFAULT,
  resolveWorkspaceCodeControls,
  resolveWorkspaceControls,
  strictestSecretHandlingMode,
  type AdminPolicy,
  type EffectiveWorkspaceCodeControls,
  type EffectiveWorkspacePolicy,
  type SecretHandlingMode,
} from '@agiworkforce/types';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import {
  readLayeredOrganizationPolicy,
  readOrganizationPolicy,
  readWorkspaceCodeControls,
  type LayeredOrganizationPolicy,
} from '@/lib/services/organization-policy-service';
import { readApplicablePolicyOverrides } from '@/lib/services/organization-policy-override-service';
import {
  CURRENT_COLLECTION_STATE,
  readOrganizationCollectionState,
  type CollectionState,
} from '@/lib/services/enterprise-collection-state';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import { resolveGoverningOrganizationIds } from '@/lib/services/governing-organizations';
import {
  getCachedIpAllowList,
  getLastKnownIpAllowList,
  setCachedIpAllowList,
} from '@/lib/services/organization-ip-allow-list-cache';
import {
  evaluateBillingHold,
  evaluateOrganizationPolicy,
  isPurchaseAsk,
  UNSCOPED_POLICY_DECISION,
  WORKSPACE_BILLING_UNAVAILABLE_DECISION,
  WORKSPACE_NOT_ACCESSIBLE_DECISION,
  WORKSPACE_POLICY_UNAVAILABLE_DECISION,
  type PolicyAsk,
  type PolicyDecision,
} from '@/lib/services/organization-policy-evaluator';

const ACCOUNT_CONTROL_READ_ATTEMPTS = 2;
const ACCOUNT_CONTROL_UNAVAILABLE_MESSAGE = WORKSPACE_POLICY_UNAVAILABLE_DECISION.reason;
const SECRET_HANDLING_MODE_WHEN_UNREADABLE: SecretHandlingMode = 'block';
const REQUEST_COUNTRY_HEADER = 'x-vercel-ip-country';

interface ScopedRequest {
  headers: { get(name: string): string | null };
}

export interface PolicyGateResult extends PolicyDecision {
  organizationId: string | null;
}

async function withAccountControlRetry<T>(read: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ACCOUNT_CONTROL_READ_ATTEMPTS; attempt++) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function accountControlUnavailable() {
  return createError.serviceUnavailable(ACCOUNT_CONTROL_UNAVAILABLE_MESSAGE).asUserSafe();
}

async function governingOrganizationIdsOrDeny(
  db: DatabaseAdapter,
  userId: string,
  control: string,
): Promise<readonly string[]> {
  try {
    return await withAccountControlRetry(() => resolveGoverningOrganizationIds(db, userId));
  } catch (error) {
    logger.error(
      { error, userId },
      `[${control}] governing organizations could not be resolved; request denied`,
    );
    throw accountControlUnavailable();
  }
}

function unavailableDecisionFor(ask: PolicyAsk): PolicyDecision {
  return isPurchaseAsk(ask)
    ? WORKSPACE_BILLING_UNAVAILABLE_DECISION
    : WORKSPACE_POLICY_UNAVAILABLE_DECISION;
}

function billingHoldUnreadable(
  error: unknown,
  userId: string,
  organizationId: string | null,
  ask: PolicyAsk,
): PolicyGateResult | null {
  if (!isPurchaseAsk(ask)) {
    logger.error(
      { error, userId, organizationId, resource: ask.resource },
      '[org-policy] billing state unreadable after retry; billing hold treated as not applicable',
    );
    return null;
  }
  logger.error(
    { error, userId, organizationId, resource: ask.resource },
    '[org-policy] billing state unreadable after retry; purchase denied',
  );
  return { ...WORKSPACE_BILLING_UNAVAILABLE_DECISION, organizationId };
}

function billingHoldOrUnscoped(
  userId: string,
  organizationId: string,
  ask: PolicyAsk,
  collectionState: CollectionState,
): PolicyGateResult {
  const billingHold = evaluateBillingHold(ask, collectionState);
  if (!billingHold) return { ...UNSCOPED_POLICY_DECISION, organizationId };
  logger.info(
    { userId, organizationId, resource: ask.resource, code: billingHold.code },
    '[org-policy] request denied by billing hold',
  );
  return { ...billingHold, organizationId };
}

async function evaluateFundingOrganizationBillingHold(
  db: DatabaseAdapter,
  userId: string,
  ask: PolicyAsk,
): Promise<PolicyGateResult | null> {
  let fundingOrganizationId: string | null;
  try {
    fundingOrganizationId = await withAccountControlRetry(() =>
      resolveEnterpriseFundingOrganizationId(db, userId),
    );
  } catch (error) {
    return billingHoldUnreadable(error, userId, null, ask);
  }
  if (!fundingOrganizationId) return null;
  const organizationId = fundingOrganizationId;

  let collectionState = CURRENT_COLLECTION_STATE;
  try {
    collectionState = await withAccountControlRetry(() =>
      readOrganizationCollectionState(db, organizationId),
    );
  } catch (error) {
    return billingHoldUnreadable(error, userId, organizationId, ask);
  }

  const billingHold = evaluateBillingHold(ask, collectionState);
  if (!billingHold) return null;

  logger.info(
    { userId, organizationId, resource: ask.resource, code: billingHold.code },
    '[org-policy] personal-scope request denied by funding organization billing hold',
  );
  return { ...billingHold, organizationId };
}

function withRequestCountry(ask: PolicyAsk, request: ScopedRequest | undefined): PolicyAsk {
  if (ask.resource !== 'managed_compute' && ask.resource !== 'feature') return ask;
  if (ask.country !== undefined) return ask;
  return { ...ask, country: request?.headers.get(REQUEST_COUNTRY_HEADER) ?? null };
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
 * An unreadable workspace or policy is not absence of a policy. Each read is
 * retried once and then denied as `workspace_policy_unavailable`, except that a
 * purchase depends only on the billing hold and so survives an unreadable
 * policy. An unreadable billing hold denies a purchase, and leaves any other
 * request to the policy, because the hold is a contract control rather than a
 * security one.
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
  let activeOrganizationId: string | null;
  try {
    activeOrganizationId = await withAccountControlRetry(() =>
      resolveActiveOrganizationId(db, userId, request),
    );
  } catch (error) {
    if (isAppError(error) && error.statusCode < 500) {
      logger.warn(
        { error, userId, resource: ask.resource },
        '[org-policy] selected workspace is not accessible; request denied',
      );
      return { ...WORKSPACE_NOT_ACCESSIBLE_DECISION, organizationId: null };
    }
    logger.error(
      { error, userId, resource: ask.resource },
      '[org-policy] active workspace could not be resolved after retry; request denied',
    );
    return { ...unavailableDecisionFor(ask), organizationId: null };
  }

  return evaluateWorkspacePolicyFor(db, userId, activeOrganizationId, ask, request);
}

export async function evaluateWorkspacePolicyFor(
  db: DatabaseAdapter,
  userId: string,
  workspaceOrganizationId: string | null,
  ask: PolicyAsk,
  request?: ScopedRequest,
): Promise<PolicyGateResult> {
  if (!workspaceOrganizationId) {
    const fundingBillingHold = await evaluateFundingOrganizationBillingHold(db, userId, ask);
    if (fundingBillingHold) return fundingBillingHold;
    return { ...UNSCOPED_POLICY_DECISION, organizationId: null };
  }
  const organizationId = workspaceOrganizationId;

  let collectionState = CURRENT_COLLECTION_STATE;
  try {
    collectionState = await withAccountControlRetry(() =>
      readOrganizationCollectionState(db, organizationId),
    );
  } catch (error) {
    const unreadable = billingHoldUnreadable(error, userId, organizationId, ask);
    if (unreadable) return unreadable;
  }

  let layered: LayeredOrganizationPolicy | null;
  try {
    layered = await withAccountControlRetry(() =>
      readLayeredOrganizationPolicy(db, organizationId),
    );
  } catch (error) {
    if (!isPurchaseAsk(ask)) {
      logger.error(
        { error, userId, organizationId, resource: ask.resource },
        '[org-policy] policy read failed after retry; request denied',
      );
      return { ...WORKSPACE_POLICY_UNAVAILABLE_DECISION, organizationId };
    }
    logger.warn(
      { error, userId, organizationId, resource: ask.resource },
      '[org-policy] policy read failed after retry; purchase decided on the billing hold',
    );
    return billingHoldOrUnscoped(userId, organizationId, ask, collectionState);
  }

  if (!layered) return billingHoldOrUnscoped(userId, organizationId, ask, collectionState);

  let policy = layered.policy;
  if (layered.hasOverrides && !isPurchaseAsk(ask)) {
    try {
      const overrides = await withAccountControlRetry(() =>
        readApplicablePolicyOverrides(db, organizationId, userId),
      );
      policy = { ...policy, controls: resolveWorkspaceControls(policy.controls, overrides) };
    } catch (error) {
      logger.error(
        { error, userId, organizationId, resource: ask.resource },
        '[org-policy] policy overrides unreadable after retry; request denied',
      );
      return { ...WORKSPACE_POLICY_UNAVAILABLE_DECISION, organizationId };
    }
  }

  const decision = evaluateOrganizationPolicy(
    policy,
    withRequestCountry(ask, request),
    collectionState,
  );

  if (!decision.allowed) {
    logger.info(
      { userId, organizationId, resource: ask.resource, code: decision.code },
      '[org-policy] request denied by workspace policy',
    );
  }

  return { ...decision, organizationId };
}

export interface EffectiveWorkspaceControls {
  organizationId: string;
  revision: number;
  controls: EffectiveWorkspacePolicy;
  code: EffectiveWorkspaceCodeControls;
}

export async function resolveEffectiveWorkspaceControls(
  db: DatabaseAdapter,
  userId: string,
  request?: ScopedRequest,
): Promise<EffectiveWorkspaceControls | null> {
  let organizationId: string | null;
  try {
    organizationId = await withAccountControlRetry(() =>
      resolveActiveOrganizationId(db, userId, request),
    );
  } catch (error) {
    if (isAppError(error) && error.statusCode < 500) throw error;
    logger.error({ error, userId }, '[workspace-controls] active workspace unresolved; denied');
    throw accountControlUnavailable();
  }
  if (!organizationId) return null;
  const scopedOrganizationId = organizationId;

  try {
    return (await readMemberControls(db, scopedOrganizationId, userId))?.effective ?? null;
  } catch (error) {
    logger.error(
      { error, userId, organizationId: scopedOrganizationId },
      '[workspace-controls] policy unreadable after retry; denied',
    );
    throw accountControlUnavailable();
  }
}

async function readMemberControls(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<{ policy: AdminPolicy; effective: EffectiveWorkspaceControls } | null> {
  const layered = await withAccountControlRetry(() =>
    readLayeredOrganizationPolicy(db, organizationId),
  );
  if (!layered) return null;
  const overrides = layered.hasOverrides
    ? await withAccountControlRetry(() => readApplicablePolicyOverrides(db, organizationId, userId))
    : [];
  const revision = layered.policy.revision ?? 0;
  const controls = resolveWorkspaceControls(layered.policy.controls, overrides, revision);
  return {
    policy: { ...layered.policy, controls },
    effective: {
      organizationId,
      revision,
      controls,
      code: resolveWorkspaceCodeControls(
        readWorkspaceCodeControls(layered.policy.metadata),
        overrides,
        revision,
      ),
    },
  };
}

export interface MemberPolicyDiagnosis {
  effective: EffectiveWorkspaceControls | null;
  decision: PolicyDecision | null;
}

export async function diagnoseMemberPolicy(
  db: DatabaseAdapter,
  organizationId: string,
  memberUserId: string,
  ask: PolicyAsk | null,
): Promise<MemberPolicyDiagnosis> {
  const member = await readMemberControls(db, organizationId, memberUserId);
  if (!member) {
    return { effective: null, decision: ask ? UNSCOPED_POLICY_DECISION : null };
  }
  const collectionState = await readOrganizationCollectionState(db, organizationId);
  return {
    effective: member.effective,
    decision: ask ? evaluateOrganizationPolicy(member.policy, ask, collectionState) : null,
  };
}

export interface SecretHandlingPolicyResult {
  mode: SecretHandlingMode;
  organizationId: string | null;
}

export async function resolveSecretHandlingPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<SecretHandlingPolicyResult> {
  let organizationIds: readonly string[];
  try {
    organizationIds = await withAccountControlRetry(() =>
      resolveGoverningOrganizationIds(db, userId),
    );
  } catch (error) {
    logger.error(
      { error, userId },
      '[secret-handling] governing organizations could not be resolved after retry; strictest mode applied',
    );
    return { mode: SECRET_HANDLING_MODE_WHEN_UNREADABLE, organizationId: null };
  }
  if (organizationIds.length === 0) {
    return { mode: SECRET_HANDLING_MODE_DEFAULT.personal, organizationId: null };
  }

  let mode: SecretHandlingMode | null = null;
  let strictestOrganizationId: string | null = null;

  for (const organizationId of organizationIds) {
    let organizationMode: SecretHandlingMode;
    try {
      const policy = await withAccountControlRetry(() =>
        readOrganizationPolicy(db, organizationId),
      );
      organizationMode = policy?.secretHandling ?? SECRET_HANDLING_MODE_DEFAULT.organization;
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[secret-handling] policy read failed after retry; strictest mode applied',
      );
      organizationMode = SECRET_HANDLING_MODE_WHEN_UNREADABLE;
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
  const organizationIds = await governingOrganizationIdsOrDeny(db, userId, 'mfa-policy');

  let firstGoverned: MfaPolicyResult | null = null;
  let unreadableOrganizationId: string | null = null;

  for (const organizationId of organizationIds) {
    let policy: AdminPolicy | null;
    try {
      policy = await withAccountControlRetry(() => readOrganizationPolicy(db, organizationId));
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[mfa-policy] policy read failed after retry',
      );
      unreadableOrganizationId ??= organizationId;
      continue;
    }

    if (policy?.requireMfa) return { policy, organizationId };
    firstGoverned ??= { policy, organizationId };
  }

  if (unreadableOrganizationId) {
    logger.error(
      { userId, organizationId: unreadableOrganizationId },
      '[mfa-policy] mfa requirement unknown; request denied',
    );
    throw accountControlUnavailable();
  }

  return firstGoverned ?? { policy: null, organizationId: null };
}

export async function workspacesPermitProductAnalytics(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  const organizationIds = await withAccountControlRetry(() =>
    resolveGoverningOrganizationIds(db, userId),
  );
  for (const organizationId of organizationIds) {
    const policy = await withAccountControlRetry(() => readOrganizationPolicy(db, organizationId));
    if (policy && !policy.allowProductAnalytics) return false;
  }
  return true;
}

export interface ZeroDataRetentionPolicyResult {
  required: boolean;
  organizationId: string | null;
}

export async function resolveZeroDataRetentionPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<ZeroDataRetentionPolicyResult> {
  const organizationIds = await governingOrganizationIdsOrDeny(db, userId, 'zero-data-retention');

  let firstGoverned: ZeroDataRetentionPolicyResult | null = null;
  let unreadableOrganizationId: string | null = null;

  for (const organizationId of organizationIds) {
    let policy: AdminPolicy | null;
    try {
      policy = await withAccountControlRetry(() => readOrganizationPolicy(db, organizationId));
    } catch (error) {
      logger.error(
        { error, userId, organizationId },
        '[zero-data-retention] policy read failed after retry',
      );
      unreadableOrganizationId ??= organizationId;
      continue;
    }

    if (policy?.zeroDataRetentionOnly) return { required: true, organizationId };
    firstGoverned ??= { required: false, organizationId };
  }

  if (unreadableOrganizationId) {
    logger.error(
      { userId, organizationId: unreadableOrganizationId },
      '[zero-data-retention] retention requirement unknown; request denied',
    );
    throw accountControlUnavailable();
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

export async function readOrganizationIpAllowList(
  db: DatabaseAdapter,
  organizationId: string,
  userId: string,
): Promise<GovernedIpAllowList> {
  const cached = getCachedIpAllowList(organizationId);
  if (cached !== undefined) return { organizationId, cidrs: cached };

  let policy: AdminPolicy | null;
  try {
    policy = await withAccountControlRetry(() => readOrganizationPolicy(db, organizationId));
  } catch (error) {
    const lastKnown = getLastKnownIpAllowList(organizationId);
    if (lastKnown === undefined) {
      logger.error(
        { error, userId, organizationId },
        '[ip-allow-list] policy read failed after retry and no allow list is known; request denied',
      );
      throw accountControlUnavailable();
    }
    logger.warn(
      { error, userId, organizationId },
      '[ip-allow-list] policy read failed after retry; enforcing the last known allow list',
    );
    return { organizationId, cidrs: lastKnown };
  }

  const cidrs = policy?.ipAllowList ?? [];
  setCachedIpAllowList(organizationId, cidrs);
  return { organizationId, cidrs };
}

export async function resolveIpAllowListPolicy(
  db: DatabaseAdapter,
  userId: string,
): Promise<IpAllowListPolicyResult> {
  const organizationIds = await governingOrganizationIdsOrDeny(db, userId, 'ip-allow-list');

  const governed: GovernedIpAllowList[] = [];
  for (const organizationId of organizationIds) {
    governed.push(await readOrganizationIpAllowList(db, organizationId, userId));
  }

  return { governed };
}
