import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserClient } from '@/lib/supabase-server';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

export type AuthGateSuccess = {
  ok: true;
  user: User;
  token: string;
  subscription: Awaited<ReturnType<typeof SubscriptionService.getSubscription>> & object;
  userClient: ReturnType<typeof getUserClient>;
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

  // SECURITY (WEB-RLS-BYPASS mitigation): service-role client used ONLY for JWT
  // verification. All downstream DB access goes through userClient (RLS-bound).
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
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

  const userClient = getUserClient(token);
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
