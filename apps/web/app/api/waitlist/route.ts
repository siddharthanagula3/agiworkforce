import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

type WaitlistPlan = 'pro' | 'max';
type BillingInterval = 'monthly' | 'annual';

function isWaitlistPlan(value: unknown): value is WaitlistPlan {
  return value === 'pro' || value === 'max';
}

function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

async function requireAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw createError.unauthorized('Please sign in to join the waitlist');
  }

  return { supabase, user };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const { supabase, user } = await requireAuth();

  const { data, error } = await supabase.from('waitlist').select('plan').eq('user_id', user.id);

  if (error) {
    throw createError.internal('Failed to load waitlist status');
  }

  const joinedPlans = Array.from(new Set((data ?? []).map((row) => row.plan))).filter(
    isWaitlistPlan,
  );

  return NextResponse.json({ joinedPlans });
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const { supabase, user } = await requireAuth();

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  const payload = body as {
    plan?: unknown;
    billingInterval?: unknown;
    source?: unknown;
  };

  if (!isWaitlistPlan(payload.plan)) {
    throw createError.validation('plan must be pro or max');
  }

  const billingInterval = isBillingInterval(payload.billingInterval)
    ? payload.billingInterval
    : ('annual' as const);
  const source = typeof payload.source === 'string' ? payload.source.slice(0, 100) : 'pricing';

  const { error } = await supabase.from('waitlist').upsert(
    {
      user_id: user.id,
      email: user.email ?? null,
      plan: payload.plan,
      billing_interval: billingInterval,
      source,
      joined_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,plan' },
  );

  if (error) {
    throw createError.internal('Failed to join waitlist');
  }

  return NextResponse.json({ ok: true, plan: payload.plan, joined: true });
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
