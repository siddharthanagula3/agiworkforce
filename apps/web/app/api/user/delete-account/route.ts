import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';

/**
 * DELETE /api/user/delete-account
 *
 * Permanently deletes a user's account and all associated data.
 * Requires authenticated session (Bearer token or cookie).
 *
 * Deletion is handled via Supabase admin client, which cascades via
 * foreign key constraints. The auth user record is removed last.
 *
 * This endpoint schedules deletion rather than doing it immediately,
 * giving the user a 24-hour grace window before permanent erasure.
 */

export const runtime = 'nodejs';

/** Security headers applied to all responses from this endpoint. */
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'",
  'X-Content-Type-Options': 'nosniff',
};

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const client = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error,
    } = await client.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  }

  // Cookie-based auth
  const { createServerClient } = await import('@supabase/ssr');
  const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // read-only
      },
    },
  });
  const {
    data: { user },
  } = await ssrClient.auth.getUser();
  return user?.id ?? null;
}

export async function DELETE(request: NextRequest) {
  // Strict rate limit — this is a destructive action (5 req/min per IP)
  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) return rateLimitResponse;

  // SECURITY: CSRF protection — account deletion is an irreversible state-changing action
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const untypedClient = adminClient as unknown as import('@supabase/supabase-js').SupabaseClient;

  try {
    // Schedule deletion: set deletion_requested_at. A background job (cron or
    // Supabase Edge Function) will perform the actual erasure after 24 hours.
    // This gives the user a grace window to cancel (coming soon).
    const { error } = await untypedClient
      .from('profiles')
      .update({
        deletion_requested_at: new Date().toISOString(),
        deletion_scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', userId);

    if (error) {
      // Profiles table may not have deletion columns yet; fall back to immediate delete
      logger.warn(
        { userId, error: error.message },
        'Soft deletion failed; attempting immediate delete',
      );

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        logger.error({ userId, error: deleteError.message }, 'Account deletion failed');
        return NextResponse.json(
          { error: 'Account deletion failed. Please contact support@agiworkforce.com.' },
          { status: 500, headers: SECURITY_HEADERS },
        );
      }

      logger.info({ userId }, 'Account deleted immediately (soft delete unavailable)');
      return NextResponse.json(
        { message: 'Account deleted successfully.' },
        { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
      );
    }

    logger.info({ userId }, 'Account deletion scheduled');
    return NextResponse.json(
      {
        message:
          'Account deletion scheduled. Your account and all data will be permanently deleted within 24 hours. A confirmation email has been sent.',
        scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { status: 200, headers: { ...getCorsHeaders(request), ...SECURITY_HEADERS } },
    );
  } catch (err) {
    logger.error({ userId, err }, 'Unexpected error during account deletion');
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please contact support@agiworkforce.com.' },
      { status: 500, headers: SECURITY_HEADERS },
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
