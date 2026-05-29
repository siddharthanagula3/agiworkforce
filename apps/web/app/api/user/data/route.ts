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

// Hardcoded deletion order — children first to respect FK constraints.
// NEVER interpolate user-supplied values into SQL; these names are constants.
const TABLES_TO_DELETE = [
  { table: 'credit_transactions', column: 'user_id' },
  { table: 'token_credits', column: 'user_id' },
  { table: 'beta_redemptions', column: 'user_id' },
  { table: 'email_preferences', column: 'user_id' },
  { table: 'device_authorizations', column: 'user_id' },
  { table: 'desktop_devices', column: 'user_id' },
  { table: 'mobile_devices', column: 'user_id' },
  { table: 'sync_data', column: 'user_id' },
  { table: 'organization_members', column: 'user_id' },
  { table: 'subscriptions', column: 'user_id' },
  { table: 'profiles', column: 'id' },
] as const;

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
      logger.info({ userId, result: rpcData }, 'User data deleted successfully via RPC');

      return NextResponse.json(
        {
          success: true,
          message: 'Your data has been successfully deleted.',
          user_id: userId,
          deletion_timestamp: new Date().toISOString(),
          details: rpcData,
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

    // Fallback: manual deletion in FK-safe order using parameterized SQL.
    // Table names come from the hardcoded TABLES_TO_DELETE constant — no user input.
    const deletionResults: Record<string, { deleted: boolean; error?: string }> = {};

    for (const { table, column } of TABLES_TO_DELETE) {
      try {
        await db.execute(`delete from ${table} where ${column} = $1`, [userId]);
        deletionResults[table] = { deleted: true };
      } catch (deleteErr: unknown) {
        const pgErr = deleteErr as { message?: string };
        deletionResults[table] = { deleted: false, error: pgErr.message };
        logger.warn({ table, deleteErr, userId }, `Failed to delete from ${table}`);
      }
    }

    logger.info({ userId, results: deletionResults }, 'Completed fallback data deletion');

    return NextResponse.json(
      {
        success: true,
        message:
          'Your data deletion request has been processed. Some data may require manual review.',
        user_id: userId,
        deletion_timestamp: new Date().toISOString(),
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
