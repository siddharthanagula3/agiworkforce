import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getSecurityHeaders, getCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';
import { getServiceClient } from '@/lib/supabase-server';

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
 * Note: Auth user account deletion must be handled separately via Supabase Auth.
 *
 * Authentication: Required (Bearer token or session cookie)
 * Rate Limit: 3 requests per hour (security-sensitive)
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
    const { user } = await getAuthenticatedUserWithClient(request);

    // Log the deletion request for audit purposes
    logger.info(
      {
        userId: user.id,
        email: user.email,
        action: 'gdpr_data_deletion_requested',
      },
      'User requested GDPR data deletion',
    );

    // Service-role client required: delete_user_data RPC runs as a privileged
    // database function that removes data across multiple tables. RLS on the
    // individual tables would block the cascading deletes.
    const adminSupabase = getServiceClient();

    // Call the delete_user_data database function
    const { data, error } = await adminSupabase.rpc('delete_user_data', {
      target_user_id: user.id,
    });

    if (error) {
      logger.error(
        {
          error,
          userId: user.id,
        },
        'Failed to delete user data via RPC',
      );

      // If the function doesn't exist, provide a fallback manual deletion
      if (error.message?.includes('function') || error.code === 'PGRST202') {
        logger.warn({ userId: user.id }, 'delete_user_data function not found, using fallback');

        // Manual deletion in correct order (respecting foreign key constraints)
        const deletionResults: Record<string, { deleted: boolean; error?: string }> = {};

        // Delete in order of dependencies (children first, then parents)
        const tablesToDelete = [
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
        ];

        for (const { table, column } of tablesToDelete) {
          const { error: deleteError } = await adminSupabase
            .from(table)
            .delete()
            .eq(column, user.id);

          if (deleteError && deleteError.code !== 'PGRST116') {
            // Ignore "not found" errors
            deletionResults[table] = { deleted: false, error: deleteError.message };
            logger.warn(
              { table, error: deleteError, userId: user.id },
              `Failed to delete from ${table}`,
            );
          } else {
            deletionResults[table] = { deleted: true };
          }
        }

        logger.info(
          {
            userId: user.id,
            results: deletionResults,
          },
          'Completed fallback data deletion',
        );

        return NextResponse.json(
          {
            success: true,
            message:
              'Your data deletion request has been processed. Some data may require manual review.',
            user_id: user.id,
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
      }

      throw createError.supabase('Failed to delete user data', error.message);
    }

    logger.info(
      {
        userId: user.id,
        result: data,
      },
      'User data deleted successfully via RPC',
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Your data has been successfully deleted.',
        user_id: user.id,
        deletion_timestamp: new Date().toISOString(),
        details: data,
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
