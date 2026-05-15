import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { User, SupabaseClient } from '@supabase/supabase-js';
import { withRateLimit } from '@/lib/rate-limit';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

export type AuthGateSuccess = {
  ok: true;
  user: User;
  token: string;
  subscription: Awaited<ReturnType<typeof SubscriptionService.getSubscription>> & object;
  userClient: SupabaseClient;
};

type AuthGateFailure = {
  ok: false;
  response: NextResponse | Response;
};

export type AuthGateResult = AuthGateSuccess | AuthGateFailure;

// Narrow helper for route.ts: resolves the union so `if (!authResult.ok) return authResult.response` works
export type AnyResponse = NextResponse | Response;

export async function runAuthGate(request: NextRequest): Promise<AuthGateResult> {
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return { ok: false, response: preflightResponse };
  }

  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return { ok: false, response: rateLimitResponse };

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return { ok: false, response: csrfError };

  // This route is the LLM chat-completions API — only Bearer-token clients
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

  // getAuthenticatedUserWithClient handles JWT verification via the documented
  // service-role exception and returns an RLS-bound client for all downstream
  // DB access.
  let user: User;
  let userClient: SupabaseClient;
  try {
    const auth = await getAuthenticatedUserWithClient(request);
    user = auth.user;
    userClient = auth.userDb;
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

  const subscription = await SubscriptionService.getSubscription(userClient, user.id);

  if (!subscription) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            message: 'No active subscription found',
            type: 'invalid_request_error',
            code: 'subscription_required',
          },
        },
        { status: 403 },
      ),
    };
  }

  const activeStatuses = ['active', 'trialing'];
  if (!activeStatuses.includes(subscription.status)) {
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

  return { ok: true, user, token, subscription, userClient };
}
