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
} from '@/lib/free-chat-surface-policy';

export type AuthGateSuccess = {
  ok: true;
  userId: string;
  token: string;
  subscription: SubscriptionInfo;
};

type AuthGateFailure = {
  ok: false;
  response: NextResponse | Response;
};

export type AuthGateResult = AuthGateSuccess | AuthGateFailure;

// Narrow helper for route.ts: resolves the union so `if (!authResult.ok) return authResult.response` works
export type AnyResponse = NextResponse | Response;

function enforceManagedCloudSurface(
  request: NextRequest,
  success: AuthGateSuccess,
): AuthGateResult {
  const isApiKey = success.token.startsWith('sk_live_') || success.token.startsWith('sk_test_');
  const surface = isApiKey ? 'api' : resolveCloudChatSurface(request);
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

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return { ok: false, response: csrfError };

  // This route is the LLM chat-completions API · only Bearer-token clients
  // (desktop, mobile, CLI, third-party API consumers) are valid callers; the
  // web UI uses a separate session-cookie path. Reject browser-style cookie
  // requests up front.
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
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'Invalid authentication token',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        },
        { status: 401 },
      ),
    };
  }

  const userRateLimitResponse = await withRateLimit(request, 'llm-completion', `user:${userId}`);
  if (userRateLimitResponse) return { ok: false, response: userRateLimitResponse };

  const subscription = await SubscriptionService.getSubscription(userId);

  if (!subscription) {
    return enforceManagedCloudSurface(request, {
      ok: true,
      userId,
      token,
      subscription: buildFreeWebsiteSubscription(userId),
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

  return enforceManagedCloudSurface(request, { ok: true, userId, token, subscription });
}
