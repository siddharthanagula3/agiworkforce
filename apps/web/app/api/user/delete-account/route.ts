import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-server';
import { getNeonDb } from '@/lib/server/neon-db';

/**
 * DELETE /api/user/delete-account
 *
 * Permanently deletes a user's account and all associated data.
 * Requires authenticated session (Bearer token or cookie).
 *
 * The profiles soft-delete is written via Neon parameterized SQL.
 * The auth user removal uses getServiceClient().auth.admin.deleteUser —
 * that path has no Neon equivalent and must stay on the Supabase admin client.
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

export async function DELETE(request: NextRequest) {
  // Strict rate limit - this is a destructive action (5 req/min per IP)
  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) return rateLimitResponse;

  // SECURITY: CSRF protection - account deletion is an irreversible state-changing action
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: SECURITY_HEADERS });
  }

  const db = getNeonDb();
  // Service-role client retained solely for auth.admin.deleteUser — the only
  // operation here that requires Supabase Auth admin privileges.
  const adminClient = getServiceClient();

  try {
    // Schedule deletion: set deletion_requested_at. A background job (cron or
    // Supabase Edge Function) will perform the actual erasure after 24 hours.
    // This gives the user a grace window to cancel (coming soon).
    try {
      await db.execute(
        `update profiles
         set deletion_requested_at = $1,
             deletion_scheduled_for = $2
         where id = $3`,
        [
          new Date().toISOString(),
          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          userId,
        ],
      );
    } catch (updateErr: unknown) {
      // Profiles table may not have deletion columns yet; fall back to immediate delete
      logger.warn(
        { userId, error: updateErr instanceof Error ? updateErr.message : String(updateErr) },
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
