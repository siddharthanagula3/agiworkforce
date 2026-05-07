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

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireEnv } from '@/utils/env';
import { getUserClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import type { User } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const RoutingPreferencesSchema = z.object({
  us_only: z.boolean().optional(),
  geo_overlay: z.enum(['auto', 'us', 'in', 'cn']).optional(),
});

type RoutingPreferences = z.infer<typeof RoutingPreferencesSchema>;

async function authenticate(
  request: NextRequest,
): Promise<{ user: User; userClient: SupabaseClient }> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, flowType: 'pkce' },
    });
    const { data, error: authError } = await supabase.auth.getUser(token);
    if (authError || !data.user) {
      throw createError.unauthorized('Invalid authentication token');
    }
    return { user: data.user, userClient: getUserClient(token) };
  }

  // Cookie-based auth (web).
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          /* ignore */
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          /* ignore */
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (!user || userError) {
    throw createError.unauthorized('Please sign in to continue');
  }

  // For cookie auth we still need a Bearer-token-based client to enforce RLS
  // correctly on writes. Pull the access token off the session.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw createError.unauthorized('Session expired');
  }

  return { user, userClient: getUserClient(accessToken) };
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'me');
  if (rateLimitResponse) return rateLimitResponse;

  const { user, userClient } = await authenticate(request);

  const { data, error } = await userClient
    .from('profiles')
    .select('routing_preferences')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    logger.warn(
      { userId: user.id, error: error.message },
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

  const { user, userClient } = await authenticate(request);

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

  // `count: 'exact'` lets us detect the rare "no profile row" case so it
  // surfaces as 404 instead of a silent success that loses the preference.
  const { error, count } = await userClient
    .from('profiles')
    .update({ routing_preferences: next }, { count: 'exact' })
    .eq('id', user.id);

  if (error) {
    logger.error({ userId: user.id, error: error.message }, '[routing-preferences] update failed');
    throw createError.internal('Failed to save routing preferences');
  }

  if (count === 0) {
    logger.warn(
      { userId: user.id },
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
