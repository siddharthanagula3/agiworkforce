import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getSecurityHeaders, getCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { eraseUserAccountData, eraseUserMedia } from '@/lib/server/account-erasure';
import { GET as exportUserDataGet } from '@/app/api/user/export/route';

/**
 * GET /api/user/data
 *
 * GDPR Article 20: Right to Data Portability
 *
 * Settings → Privacy → "Export data" calls this endpoint expecting a
 * downloadable JSON file. It delegates to the canonical export handler at
 * /api/user/export (same GDPR export logic, same rate limiting) so there is
 * a single source of truth for what gets exported.
 *
 * Authentication: Required (Bearer token or session cookie)
 * Rate Limit: 5 requests per hour (see /api/user/export)
 */
export const GET = exportUserDataGet;

/**
 * DELETE /api/user/data
 *
 * GDPR Article 17: Right to Erasure (Right to be Forgotten)
 *
 * This endpoint allows authenticated users to request deletion of all their
 * personal data from the system. This is a destructive, irreversible operation.
 *
 * The operation calls the `delete_user_data` database function which:
 * - Deletes user profile data
 * - Removes subscription records
 * - Clears credit transactions
 * - Removes device authorizations
 * - Deletes email preferences
 * - Removes beta redemptions
 * - Clears organization memberships
 *
 * Note: Auth user account deletion must be handled separately via the auth provider.
 *
 * Authentication: Required (Bearer token or session cookie)
 * Rate Limit: 3 requests per hour (security-sensitive)
 */

// Hardcoded deletion order · children first to respect FK constraints.
// NEVER interpolate user-supplied values into SQL; these names are constants.
/**
 * PER-24: the hardcoded eleven-table list that used to live here covered
 * neither the user's conversations, artifacts, memories and settings nor any
 * stored media, named a table that does not exist (`device_authorizations`;
 * the real one is `device_authorization_codes`) and swallowed that as a warn.
 * The verified inventory now lives in `lib/server/account-erasure.ts` and is
 * shared with the scheduled purge cron, so the two paths cannot disagree about
 * what "delete my data" means.
 */

async function handleDeleteUserData(request: NextRequest) {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // AUDIT-008-006: Enforce CSRF protection for state-changing endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) {
    return csrfError as NextResponse;
  }

  // Rate limiting - strict for this sensitive operation (3 requests per hour)
  const rateLimitResponse = await withRateLimit(request, 'user-data-delete');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { userId } = await getClerkAuthUser(request);
    const db = getNeonDb();

    // Log the deletion request for audit purposes
    logger.info(
      {
        userId,
        action: 'gdpr_data_deletion_requested',
      },
      'User requested GDPR data deletion',
    );

    // Attempt the delete_user_data stored procedure first
    let rpcSucceeded = false;
    let rpcData: unknown = null;

    try {
      const rows = await db.query<Record<string, unknown>>('select * from delete_user_data($1)', [
        userId,
      ]);
      rpcData = rows[0] ?? null;
      rpcSucceeded = true;
    } catch (err: unknown) {
      const pgErr = err as { code?: string; message?: string };
      // 42883 = undefined_function in native Postgres
      const isMissingFn =
        pgErr.code === '42883' ||
        pgErr.message?.includes('function') ||
        pgErr.message?.includes('does not exist');

      if (!isMissingFn) {
        logger.error({ err, userId }, 'Failed to delete user data via RPC');
        throw createError.internal('Failed to delete user data', pgErr.message ?? String(err));
      }

      logger.warn({ userId }, 'delete_user_data function not found, using fallback');
    }

    if (rpcSucceeded) {
      // PER-24: the stored procedure is SQL-only — it cannot reach object
      // storage, so every generated image and chat attachment survived a
      // "successful" GDPR deletion. Remove the bytes here.
      const mediaErasure = await eraseUserMedia(userId);
      if (mediaErasure.mediaObjectsFailed > 0) {
        logger.error(
          { userId, mediaErasure },
          'Stored media could not be fully deleted during GDPR erasure',
        );
        throw createError.internal(
          'Your database records were deleted but some stored files could not be removed. Please contact support@agiworkforce.com.',
        );
      }

      logger.info({ userId, result: rpcData }, 'User data deleted successfully via RPC');

      return NextResponse.json(
        {
          success: true,
          message: 'Your data has been successfully deleted.',
          user_id: userId,
          deletion_timestamp: new Date().toISOString(),
          details: { rpc: rpcData, media: mediaErasure },
          note: 'To complete account deletion, please also delete your authentication account through account settings.',
        },
        {
          headers: {
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    // Fallback: manual deletion in FK-safe order using parameterized SQL,
    // including the stored media BYTES (PER-24/PER-25).
    const erasure = await eraseUserAccountData(userId);

    logger.info({ userId, erasure }, 'Completed fallback data deletion');

    if (!erasure.complete) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Your data deletion request was only partially completed. Please contact support@agiworkforce.com so the remainder can be erased.',
          user_id: userId,
          deletion_timestamp: new Date().toISOString(),
          details: erasure,
        },
        {
          status: 500,
          headers: {
            ...getCorsHeaders(request),
            ...getSecurityHeaders(),
          },
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Your data deletion request has been processed and your data has been deleted.',
        user_id: userId,
        deletion_timestamp: new Date().toISOString(),
        details: erasure,
        note: 'To complete account deletion, please also delete your authentication account through account settings.',
      },
      {
        headers: {
          ...getCorsHeaders(request),
          ...getSecurityHeaders(),
        },
      },
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in DELETE /api/user/data',
    );
    throw error;
  }
}

export const DELETE = withErrorHandler(handleDeleteUserData);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
