import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getSecurityHeaders, getCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import type { User } from '@supabase/supabase-js';

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
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    let user: User | null = null;

    // Check for Bearer token in Authorization header (desktop/mobile app)
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Create a regular Supabase client to verify the JWT token
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          flowType: 'pkce',
        },
      });

      const { data, error: authError } = await supabase.auth.getUser(token);

      if (authError || !data.user) {
        logger.warn({ error: authError }, 'Bearer token authentication failed for data deletion');
        throw createError.unauthorized('Invalid authentication token');
      }

      user = data.user;
    } else {
      // Fall back to cookie-based authentication (web app)
      const cookieStore = await cookies();

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          flowType: 'pkce',
        },
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },

          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
            } catch {
              // ignore cookie setting errors
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options });
            } catch {
              // ignore cookie removal errors
            }
          },
        },
      });

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw createError.unauthorized();
      }

      user = session.user;
    }

    if (!user) {
      throw createError.unauthorized();
    }

    // Log the deletion request for audit purposes
    logger.info(
      {
        userId: user.id,
        email: user.email,
        action: 'gdpr_data_deletion_requested',
      },
      'User requested GDPR data deletion',
    );

    // Create service role client for database operations
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

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
