/**
 * /api/me/routing-preferences
 *
 * GET  — return the user's current routing_preferences JSONB.
 * PUT  — replace it (validates shape).
 *
 * Auth: requires Bearer JWT (mobile/desktop) OR cookie session (web).
 *       getUserClient(token) is used for both reads and writes so RLS on
 *       profiles is enforced (user can only mutate their own row).
 *
 * Note: lower tiers can set us_only=true but the router ignores it because
 *       TierPolicy.usOnlyRoutingAvailable is false. We still let them store
 *       the preference so flipping to Pro+ doesn't lose the setting.
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClerkAuthUser } from '@/lib/api-auth';
import { createSupabaseServerClient } from '@/services/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';

const RoutingPreferencesSchema = z.object({
  us_only: z.boolean().optional(),
  geo_overlay: z.enum(['auto', 'us', 'in', 'cn']).optional(),
});

type RoutingPreferences = z.infer<typeof RoutingPreferencesSchema>;

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('routing_preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { userId, error: error.message },
      '[routing-preferences] read failed — returning {}',
    );
    return NextResponse.json({});
  }

  const raw = (data as { routing_preferences?: unknown } | null)?.routing_preferences;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({});
  }

  return NextResponse.json(raw);
}

async function handlePut(request: NextRequest): Promise<NextResponse> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const supabase = await createSupabaseServerClient();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw createError.validation('Invalid JSON body');
  }

  const parsed = RoutingPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw createError.validation(`Invalid routing preferences: ${messages}`);
  }

  const next: RoutingPreferences = parsed.data;

  const { error, count } = await supabase
    .from('profiles')
    .update({ routing_preferences: next }, { count: 'exact' })
    .eq('id', userId);

  if (error) {
    logger.error({ userId: userId, error: error.message }, '[routing-preferences] update failed');
    throw createError.internal('Failed to save routing preferences');
  }

  if (count === 0) {
    logger.warn(
      { userId: userId },
      '[routing-preferences] no profile row matched — handle_new_user trigger may have failed',
    );
    throw createError.notFound('Profile not found');
  }

  return NextResponse.json(next);
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);

export async function OPTIONS(request: NextRequest) {
  const preflightResponse = handleCorsPreflightRequest(request);
  return preflightResponse || new NextResponse(null, { status: 204 });
}
