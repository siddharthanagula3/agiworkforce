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
  resolveCloudChatSurface,
  type AuthenticatedSurfaceClass,
} from '@/lib/free-chat-surface-policy';
import { isApiKeyScopeError } from '@/lib/api-key-scope-error';

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
  const isApiKey = success.token.startsWith('sk_live_') || success.token.startsWith('sk_test_');
  const surface = isApiKey ? 'api' : resolveCloudChatSurface(request, success.surfaceClass);
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

  const ipRateLimitResponse = await withRateLimit(request, 'llm-completion-ip');
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
    ({ userId, surfaceClass } = await getClerkAuthUser(request, {
      apiKeyScope: 'inference:write',
    }));
  } catch (error) {
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

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return { ok: false, response: csrfError };

  const userRateLimitResponse = await withRateLimit(request, 'llm-completion', `user:${userId}`);
  if (userRateLimitResponse) return { ok: false, response: userRateLimitResponse };

  const subscription = await SubscriptionService.getSubscription(userId);

  if (!subscription) {
    return enforceManagedCloudSurface(request, {
      ok: true,
      userId,
      token,
      subscription: buildFreeWebsiteSubscription(userId),
      ...(surfaceClass ? { surfaceClass } : {}),
    });
  }

  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
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

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: `Subscription is ${subscription.status}. Please update your payment method.`,
            type: 'invalid_request_error',
            code: 'subscription_inactive',
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
