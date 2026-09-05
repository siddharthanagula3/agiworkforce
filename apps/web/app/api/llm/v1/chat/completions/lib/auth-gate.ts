import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';
import { SubscriptionService, type SubscriptionInfo } from '@/lib/services/subscription-service';
import { buildFreeWebsiteSubscription, isFreePlanTier } from '@/lib/services/free-trial-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import {
  canUseManagedCloudChatSurface,
  getCloudChatSurfaceCapability,
  type AuthenticatedSurfaceClass,
} from '@/lib/free-chat-surface-policy';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { readOrganizationCollectionState } from '@/lib/services/enterprise-collection-state';
import { resolveEnterpriseFundingOrganizationId } from '@/lib/services/enterprise-funding-organization';
import {
  resolveSubscriptionAccess,
  type EnterpriseCollectionAccessState,
} from '@/lib/services/subscription-access-policy';
import { timePhase } from '@/lib/observability/phase-timer';
import { resolveAuthenticatedSurface } from './request-surface';
import { CHAT_TURN_PHASE } from './turn-phases';

const ENTERPRISE_PLAN_TIER = 'enterprise';

async function resolveEnterpriseCollectionAccessState(
  userId: string,
): Promise<EnterpriseCollectionAccessState> {
  try {
    const db = getNeonDb();
    const organizationId = await resolveEnterpriseFundingOrganizationId(db, userId);
    if (!organizationId) return { readOnly: false };
    const state = await readOrganizationCollectionState(db, organizationId);
    return { readOnly: state.readOnly };
  } catch (error) {
    logger.error(
      { error, userId },
      '[auth-gate] enterprise collection state read failed; entitlement decided without it',
    );
    return { readOnly: false };
  }
}

export type AuthGateSuccess = {
  ok: true;
  userId: string;
  token: string;
  subscription: SubscriptionInfo;
  surfaceClass?: AuthenticatedSurfaceClass;
};

type AuthGateFailure = {
  ok: false;
  response: NextResponse | Response;
};

export type AuthGateResult = AuthGateSuccess | AuthGateFailure;

export type AnyResponse = NextResponse | Response;

function enforceManagedCloudSurface(
  request: NextRequest,
  success: AuthGateSuccess,
): AuthGateResult {
  const surface = resolveAuthenticatedSurface(request, success);
  if (canUseManagedCloudChatSurface(success.subscription.plan_tier, surface)) return success;

  const capability = getCloudChatSurfaceCapability(surface);
  const error =
    capability === null
      ? {
          message: 'Managed Cloud requests must identify a supported client surface.',
          code: 'managed_cloud_surface_unknown',
        }
      : capability === 'developer_surfaces'
        ? {
            message: 'Managed Cloud CLI, browser extension, and IDE access require Pro or higher.',
            code: 'developer_surface_plan_required',
            requiredTier: 'pro',
          }
        : capability === 'managed_api'
          ? {
              message: 'Managed API access requires Pro or higher.',
              code: 'managed_api_plan_required',
              requiredTier: 'pro',
            }
          : {
              message: 'Managed Cloud chat is not available on this plan.',
              code: 'managed_chat_plan_required',
            };

  return {
    ok: false,
    response: NextResponse.json(
      {
        error: {
          ...error,
          type: 'invalid_request_error',
        },
      },
      { status: 403 },
    ),
  };
}

export async function runAuthGate(request: NextRequest): Promise<AuthGateResult> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return { ok: false, response: preflightResponse };
  }

  const ipRateLimitResponse = await timePhase(CHAT_TURN_PHASE.rateLimitIp, () =>
    withRateLimit(request, 'llm-completion-ip'),
  );
  if (ipRateLimitResponse) return { ok: false, response: ipRateLimitResponse };

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'Missing or invalid authorization header',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        },
        { status: 401 },
      ),
    };
  }

  const token = authHeader.substring(7);

  let userId: string;
  let surfaceClass: AuthenticatedSurfaceClass | undefined;
  try {
    ({ userId, surfaceClass } = await timePhase(CHAT_TURN_PHASE.identityVerify, () =>
      getClerkAuthUser(request, { apiKeyScope: 'inference:write' }),
    ));
  } catch (error) {
    if (isMfaRequiredError(error)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: { message: error.message, type: 'invalid_request_error', code: 'mfa_required' },
          },
          { status: 403 },
        ),
      };
    }
    if (isIpNotAllowedError(error)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: {
              message: error.message,
              type: 'invalid_request_error',
              code: 'ip_not_allowed',
            },
          },
          { status: 403 },
        ),
      };
    }
    const insufficientScope = isApiKeyScopeError(error);
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: insufficientScope
              ? 'API key does not have the required scope'
              : 'Invalid authentication token',
            type: 'invalid_request_error',
            code: insufficientScope ? 'insufficient_scope' : 'invalid_api_key',
          },
        },
        { status: insufficientScope ? 403 : 401 },
      ),
    };
  }

  const subscriptionPromise = SubscriptionService.getSubscription(
    createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null }),
    userId,
  );
  subscriptionPromise.catch(() => undefined);

  const csrfError = await timePhase(CHAT_TURN_PHASE.csrfCheck, () => requireCsrfToken(request));
  if (csrfError) return { ok: false, response: csrfError };

  const userRateLimitResponse = await timePhase(CHAT_TURN_PHASE.rateLimitUser, () =>
    withRateLimit(request, 'llm-completion', `user:${userId}`),
  );
  if (userRateLimitResponse) return { ok: false, response: userRateLimitResponse };

  const subscription = await timePhase(
    CHAT_TURN_PHASE.subscriptionLookup,
    () => subscriptionPromise,
  );

  if (!subscription) {
    return enforceManagedCloudSurface(request, {
      ok: true,
      userId,
      token,
      subscription: buildFreeWebsiteSubscription(userId),
      ...(surfaceClass ? { surfaceClass } : {}),
    });
  }

  const enterpriseCollection =
    subscription.plan_tier?.toLowerCase() === ENTERPRISE_PLAN_TIER
      ? await resolveEnterpriseCollectionAccessState(userId)
      : undefined;

  const access = resolveSubscriptionAccess(
    subscription.status,
    subscription.plan_tier,
    enterpriseCollection,
  );

  if (!access.managedExecution) {
    if (isFreePlanTier(subscription.plan_tier)) {
      return enforceManagedCloudSurface(request, {
        ok: true,
        userId,
        token,
        subscription: {
          ...subscription,
          status: 'active',
        },
        ...(surfaceClass ? { surfaceClass } : {}),
      });
    }

    const billingReadOnly = enterpriseCollection?.readOnly === true;

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: billingReadOnly
              ? 'Your workspace is read-only: enterprise billing collection is past the read-only threshold. Ask your billing owner to resolve the outstanding invoice.'
              : `Subscription is ${subscription.status}. Please update your payment method.`,
            type: 'invalid_request_error',
            code: billingReadOnly ? 'billing_read_only' : 'subscription_inactive',
          },
        },
        { status: 403 },
      ),
    };
  }

  return enforceManagedCloudSurface(request, {
    ok: true,
    userId,
    token,
    subscription,
    ...(surfaceClass ? { surfaceClass } : {}),
  });
}
