import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getSecurityHeaders, getCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { getAuthenticatedUserWithClient } from '@/lib/api-auth';
import type { SupabaseClient } from '@supabase/supabase-js';

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
    // userDb is RLS-bound: all reads below are scoped to the authenticated user.
    const { user, userDb } = await getAuthenticatedUserWithClient(request);

    // Log the export request for audit purposes
    logger.info(
      {
        userId: user.id,
        email: user.email,
        action: 'gdpr_data_export_requested',
      },
      'User requested GDPR data export',
    );

    // Try RLS-bound RPC first. If the RPC requires elevated privileges (SECURITY DEFINER),
    // it will succeed even through an anon-key client because the function itself elevates.
    const { data: rpcData, error: rpcError } = await userDb.rpc('export_user_data', {
      target_user_id: user.id,
    });

    if (!rpcError && rpcData) {
      logger.info({ userId: user.id }, 'User data exported successfully via RPC');
      return createExportResponse(request, user.id, rpcData);
    }

    if (rpcError) {
      logger.warn(
        { error: rpcError, userId: user.id },
        'export_user_data RPC failed, using fallback manual export',
      );
    }

    // Manual data collection using the RLS-bound client — RLS ensures each
    // query returns only the authenticated user's rows without needing service-role.
    return createExportResponse(request, user.id, await collectUserData(user, userDb));
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

async function collectUserData(
  user: {
    id: string;
    email?: string;
    created_at: string;
    updated_at?: string;
    email_confirmed_at?: string;
    last_sign_in_at?: string;
    app_metadata?: unknown;
    user_metadata?: unknown;
  },
  db: SupabaseClient,
): Promise<Record<string, unknown>> {
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

  const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (profile) exportData['profile'] = profile;

  const { data: subscription } = await db
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (subscription) {
    exportData['subscription'] = {
      ...subscription,
      stripe_customer_id: subscription.stripe_customer_id ? '[REDACTED]' : null,
      stripe_subscription_id: subscription.stripe_subscription_id ? '[REDACTED]' : null,
    };
  }

  const { data: tokenCredits } = await db
    .from('token_credits')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (tokenCredits && tokenCredits.length > 0) exportData['token_credits'] = tokenCredits;

  const { data: creditTransactions } = await db
    .from('credit_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (creditTransactions && creditTransactions.length > 0) {
    exportData['credit_transactions'] = creditTransactions;
  }

  const { data: emailPreferences } = await db
    .from('email_preferences')
    .select('*')
    .eq('user_id', user.id)
    .single();
  if (emailPreferences) {
    exportData['email_preferences'] = {
      ...emailPreferences,
      unsubscribe_token: '[REDACTED]',
      consent_ip_address: emailPreferences.consent_ip_address ? '[PARTIALLY_REDACTED]' : null,
    };
  }

  const { data: orgMemberships } = await db
    .from('organization_members')
    .select('*, organizations(*)')
    .eq('user_id', user.id);
  if (orgMemberships && orgMemberships.length > 0) {
    exportData['organization_memberships'] = orgMemberships;
  }

  const { data: betaRedemptions } = await db
    .from('beta_redemptions')
    .select('*, beta_invites(code, plan_tier, trial_days)')
    .eq('user_id', user.id);
  if (betaRedemptions && betaRedemptions.length > 0) {
    exportData['beta_redemptions'] = betaRedemptions;
  }

  const { data: deviceAuths } = await db
    .from('device_authorization_codes')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (deviceAuths && deviceAuths.length > 0) {
    exportData['device_authorizations'] = deviceAuths.map((auth) => ({
      ...auth,
      user_code: auth.user_code ? '[REDACTED]' : null,
      access_token: auth.access_token ? '[REDACTED]' : null,
      refresh_token: auth.refresh_token ? '[REDACTED]' : null,
    }));
  }

  const { data: desktopDevices } = await db
    .from('desktop_devices')
    .select('*')
    .eq('user_id', user.id);
  if (desktopDevices && desktopDevices.length > 0) exportData['desktop_devices'] = desktopDevices;

  const { data: mobileDevices } = await db
    .from('mobile_devices')
    .select('*')
    .eq('user_id', user.id);
  if (mobileDevices && mobileDevices.length > 0) exportData['mobile_devices'] = mobileDevices;

  const { data: syncData } = await db.from('sync_data').select('*').eq('user_id', user.id);
  if (syncData && syncData.length > 0) exportData['sync_data'] = syncData;

  logger.info(
    { userId: user.id, dataSections: Object.keys(exportData).length },
    'User data export completed via fallback method',
  );

  return exportData;
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
    return new NextResponse(jsonData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="user-data-export-${timestamp}.json"`,
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

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
