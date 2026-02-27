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
import type { User } from '@supabase/supabase-js';

/**
 * GET /api/user/export
 *
 * GDPR Article 20: Right to Data Portability
 *
 * This endpoint allows authenticated users to export all their personal data
 * in a structured, commonly used, and machine-readable format (JSON).
 *
 * The export includes:
 * - User profile information
 * - Subscription details
 * - Credit balance and transaction history
 * - Email preferences
 * - Device authorizations
 * - Organization memberships
 * - Beta invite redemptions
 *
 * Authentication: Required (Bearer token or session cookie)
 * Rate Limit: 5 requests per hour
 *
 * Response: JSON file download or JSON response based on Accept header
 */
async function handleExportUserData(request: NextRequest) {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(request);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Rate limiting (5 requests per hour)
  const rateLimitResponse = await withRateLimit(request, 'user-data-export');
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
        logger.warn({ error: authError }, 'Bearer token authentication failed for data export');
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
        data: { user: cookieUser },
        error: cookieAuthError,
      } = await supabase.auth.getUser();

      if (cookieAuthError || !cookieUser) {
        throw createError.unauthorized();
      }

      user = cookieUser;
    }

    if (!user) {
      throw createError.unauthorized();
    }

    // Log the export request for audit purposes
    logger.info(
      {
        userId: user.id,
        email: user.email,
        action: 'gdpr_data_export_requested',
      },
      'User requested GDPR data export',
    );

    // Create service role client for database operations
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Try to call the export_user_data database function first
    const { data: rpcData, error: rpcError } = await adminSupabase.rpc('export_user_data', {
      target_user_id: user.id,
    });

    if (!rpcError && rpcData) {
      logger.info(
        {
          userId: user.id,
        },
        'User data exported successfully via RPC',
      );

      return createExportResponse(request, user.id, rpcData);
    }

    // If the function doesn't exist, fall back to manual data collection
    if (rpcError) {
      logger.warn(
        { error: rpcError, userId: user.id },
        'export_user_data RPC failed, using fallback manual export',
      );
    }

    // Manual data collection from each table
    const exportData: Record<string, unknown> = {
      export_metadata: {
        user_id: user.id,
        export_timestamp: new Date().toISOString(),
        gdpr_article: 'Article 20 - Right to Data Portability',
        format_version: '1.0',
      },
      account: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        updated_at: user.updated_at,
        email_confirmed_at: user.email_confirmed_at,
        last_sign_in_at: user.last_sign_in_at,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata,
      },
    };

    // Fetch profile
    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (profile) {
      exportData.profile = profile;
    }

    // Fetch subscription
    const { data: subscription } = await adminSupabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (subscription) {
      // Remove sensitive Stripe IDs from export
      exportData.subscription = {
        ...subscription,
        stripe_customer_id: subscription.stripe_customer_id ? '[REDACTED]' : null,
        stripe_subscription_id: subscription.stripe_subscription_id ? '[REDACTED]' : null,
      };
    }

    // Fetch token credits
    const { data: tokenCredits } = await adminSupabase
      .from('token_credits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (tokenCredits && tokenCredits.length > 0) {
      exportData.token_credits = tokenCredits;
    }

    // Fetch credit transactions (limited to last 1000)
    const { data: creditTransactions } = await adminSupabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (creditTransactions && creditTransactions.length > 0) {
      exportData.credit_transactions = creditTransactions;
    }

    // Fetch email preferences
    const { data: emailPreferences } = await adminSupabase
      .from('email_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (emailPreferences) {
      // Remove sensitive tokens from export
      exportData.email_preferences = {
        ...emailPreferences,
        unsubscribe_token: '[REDACTED]',
        consent_ip_address: emailPreferences.consent_ip_address ? '[PARTIALLY_REDACTED]' : null,
      };
    }

    // Fetch organization memberships
    const { data: orgMemberships } = await adminSupabase
      .from('organization_members')
      .select('*, organizations(*)')
      .eq('user_id', user.id);
    if (orgMemberships && orgMemberships.length > 0) {
      exportData.organization_memberships = orgMemberships;
    }

    // Fetch beta redemptions
    const { data: betaRedemptions } = await adminSupabase
      .from('beta_redemptions')
      .select('*, beta_invites(code, plan_tier, trial_days)')
      .eq('user_id', user.id);
    if (betaRedemptions && betaRedemptions.length > 0) {
      exportData.beta_redemptions = betaRedemptions;
    }

    // Fetch device authorizations
    const { data: deviceAuths } = await adminSupabase
      .from('device_authorization_codes')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (deviceAuths && deviceAuths.length > 0) {
      // Redact sensitive device tokens
      exportData.device_authorizations = deviceAuths.map((auth) => ({
        ...auth,
        user_code: auth.user_code ? '[REDACTED]' : null,
        access_token: auth.access_token ? '[REDACTED]' : null,
        refresh_token: auth.refresh_token ? '[REDACTED]' : null,
      }));
    }

    // Fetch desktop devices
    const { data: desktopDevices } = await adminSupabase
      .from('desktop_devices')
      .select('*')
      .eq('user_id', user.id);
    if (desktopDevices && desktopDevices.length > 0) {
      exportData.desktop_devices = desktopDevices;
    }

    // Fetch mobile devices
    const { data: mobileDevices } = await adminSupabase
      .from('mobile_devices')
      .select('*')
      .eq('user_id', user.id);
    if (mobileDevices && mobileDevices.length > 0) {
      exportData.mobile_devices = mobileDevices;
    }

    // Fetch sync data
    const { data: syncData } = await adminSupabase
      .from('sync_data')
      .select('*')
      .eq('user_id', user.id);
    if (syncData && syncData.length > 0) {
      exportData.sync_data = syncData;
    }

    logger.info(
      {
        userId: user.id,
        dataSections: Object.keys(exportData).length,
      },
      'User data export completed via fallback method',
    );

    return createExportResponse(request, user.id, exportData);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error in GET /api/user/export',
    );
    throw error;
  }
}

/**
 * Creates the export response with appropriate headers
 * Supports both JSON download and API response based on Accept header
 */
function createExportResponse(request: NextRequest, userId: string, data: unknown): NextResponse {
  const acceptHeader = request.headers.get('accept') || '';
  const isDownload =
    acceptHeader.includes('application/octet-stream') ||
    request.nextUrl.searchParams.get('download') === 'true';

  const jsonData = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().split('T')[0];

  if (isDownload) {
    // Return as downloadable file
    return new NextResponse(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="user-data-export-${timestamp}.json"`,
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

  // Return as JSON response
  return NextResponse.json(
    {
      success: true,
      export_timestamp: new Date().toISOString(),
      user_id: userId,
      data,
    },
    {
      headers: {
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    },
  );
}

export const GET = withErrorHandler(handleExportUserData);

/**
 * OPTIONS handler for CORS preflight requests
 * AUDIT-008-001: Fixed - OPTIONS was incorrectly assigned to handleExportUserData
 * which processes GET requests with auth. Now returns proper 204 with CORS headers.
 */
export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    })
  );
}
