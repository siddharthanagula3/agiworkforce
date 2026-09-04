import 'server-only';

import { NextResponse } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { logger } from '@/lib/logger';
import { isFreePlanTier } from '@/lib/services/free-trial-service';
import { readOrganizationCollectionState } from '@/lib/services/enterprise-collection-state';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import {
  evaluateActiveWorkspacePolicy,
  type PolicyGateResult,
} from '@/lib/services/organization-policy-gate';
import type { PolicyAsk, PolicySurface } from '@/lib/services/organization-policy-evaluator';
import { evaluateSpendLimit } from '@/lib/services/spend-limit-service';
import {
  resolveSubscriptionAccess,
  type EnterpriseCollectionAccessState,
} from '@/lib/services/subscription-access-policy';
import type { SubscriptionInfo } from '@/lib/services/subscription-service';

const ENTERPRISE_PLAN_TIER = 'enterprise';

interface ScopedRequest {
  headers: { get(name: string): string | null };
}

export type ManagedComputeAccessScope =
  | { request: ScopedRequest }
  | { organizationId: string | null };

export interface ManagedComputeAccessDecision {
  allowed: boolean;
  code: string;
  reason: string;
  organizationId: string | null;
}

const SUBSCRIPTION_ALLOWED: ManagedComputeAccessDecision = Object.freeze({
  allowed: true,
  code: 'allowed',
  reason: 'Subscription is entitled to managed compute.',
  organizationId: null,
});

async function resolveEnterpriseCollectionAccessState(
  db: DatabaseAdapter,
  userId: string,
): Promise<EnterpriseCollectionAccessState> {
  try {
    const organizationId = await resolveEnterpriseFundingOrganizationId(db, userId);
    if (!organizationId) return { readOnly: false };
    const state = await readOrganizationCollectionState(db, organizationId);
    return { readOnly: state.readOnly };
  } catch (error) {
    logger.error(
      { error, userId },
      '[managed-compute-access] enterprise collection state read failed; entitlement decided without it',
    );
    return { readOnly: false };
  }
}

export async function evaluateManagedComputeSubscriptionAccess(
  db: DatabaseAdapter,
  userId: string,
  subscription: SubscriptionInfo | null,
): Promise<ManagedComputeAccessDecision> {
  if (!subscription || isFreePlanTier(subscription.plan_tier)) return SUBSCRIPTION_ALLOWED;

  const enterpriseCollection =
    subscription.plan_tier?.toLowerCase() === ENTERPRISE_PLAN_TIER
      ? await resolveEnterpriseCollectionAccessState(db, userId)
      : undefined;

  const access = resolveSubscriptionAccess(
    subscription.status,
    subscription.plan_tier,
    enterpriseCollection,
  );
  if (access.managedExecution) return SUBSCRIPTION_ALLOWED;

  const billingReadOnly = enterpriseCollection?.readOnly === true;
  return {
    allowed: false,
    code: billingReadOnly ? 'billing_read_only' : 'subscription_inactive',
    reason: billingReadOnly
      ? 'Your workspace is read-only: enterprise billing collection is past the read-only threshold. Ask your billing owner to resolve the outstanding invoice.'
      : `Subscription is ${subscription.status}. Please update your payment method.`,
    organizationId: null,
  };
}

function scopedRequestForOrganization(organizationId: string | null): ScopedRequest {
  const value = organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;
  return {
    headers: {
      get(name: string) {
        return name === MANAGED_CLOUD_ORGANIZATION_HEADER ? value : null;
      },
    },
  };
}

async function withSpendLimit(
  db: DatabaseAdapter,
  policyDecision: PolicyGateResult,
): Promise<ManagedComputeAccessDecision> {
  if (!policyDecision.allowed) return policyDecision;
  const spend = await evaluateSpendLimit(db, policyDecision.organizationId);
  if (spend.allowed) return policyDecision;
  return {
    allowed: false,
    code: spend.code,
    reason: spend.reason,
    organizationId: policyDecision.organizationId,
  };
}

export async function evaluateManagedComputeWorkspaceAccess(
  db: DatabaseAdapter,
  userId: string,
  surface: PolicySurface,
  scope: ManagedComputeAccessScope,
): Promise<ManagedComputeAccessDecision> {
  const ask: PolicyAsk = { resource: 'managed_compute', surface };
  const request =
    'request' in scope ? scope.request : scopedRequestForOrganization(scope.organizationId);
  const policyDecision = await evaluateActiveWorkspacePolicy(db, userId, ask, request);
  return withSpendLimit(db, policyDecision);
}

export async function evaluateManagedComputeAccess(
  db: DatabaseAdapter,
  userId: string,
  subscription: SubscriptionInfo | null,
  surface: PolicySurface,
  scope: ManagedComputeAccessScope,
): Promise<ManagedComputeAccessDecision> {
  const subscriptionDecision = await evaluateManagedComputeSubscriptionAccess(
    db,
    userId,
    subscription,
  );
  if (!subscriptionDecision.allowed) return subscriptionDecision;
  return evaluateManagedComputeWorkspaceAccess(db, userId, surface, scope);
}

export function buildManagedComputeAccessGateResponse(
  decision: ManagedComputeAccessDecision,
  headers?: HeadersInit,
): NextResponse | null {
  if (decision.allowed) return null;
  return NextResponse.json(
    {
      error: {
        message: decision.reason,
        type: 'invalid_request_error',
        code: decision.code,
      },
    },
    { status: 403, headers },
  );
}
