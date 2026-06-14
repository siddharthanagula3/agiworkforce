import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getSecurityHeaders, getCorsHeaders, handleCorsPreflightRequest } from '@/lib/cors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

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
    const { userId } = await getClerkAuthUser(request);
    const db = getNeonDb();

    // Log the export request for audit purposes
    logger.info(
      {
        userId,
        action: 'gdpr_data_export_requested',
      },
      'User requested GDPR data export',
    );

    // Try the export_user_data stored procedure first.
    // If the function is defined as SECURITY DEFINER it runs with elevated
    // privileges even through a regular connection.
    let rpcSucceeded = false;
    let rpcData: unknown = null;

    try {
      const rows = await db.query<Record<string, unknown>>('select * from export_user_data($1)', [
        userId,
      ]);
      rpcData = rows[0] ?? null;
      rpcSucceeded = true;
    } catch (err: unknown) {
      logger.warn(
        { error: err, userId },
        'export_user_data RPC failed, using fallback manual export',
      );
    }

    if (rpcSucceeded && rpcData !== null) {
      logger.info({ userId }, 'User data exported successfully via RPC');
      return createExportResponse(request, userId, rpcData);
    }

    // Manual data collection using parameterized SQL.
    const userShell = { id: userId, created_at: new Date().toISOString() };
    return createExportResponse(request, userId, await collectUserData(userShell, db));
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
  db: DatabaseAdapter,
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

  // Profile
  const profileRows = await db
    .query<Record<string, unknown>>('select * from profiles where id = $1', [user.id])
    .catch(() => []);
  if (profileRows.length > 0) exportData['profile'] = profileRows[0];

  // Subscription (redact Stripe IDs)
  const subRows = await db
    .query<
      Record<string, unknown>
    >('select * from subscriptions where user_id = $1 limit 1', [user.id])
    .catch(() => []);
  if (subRows.length > 0) {
    const sub = subRows[0]!;
    exportData['subscription'] = {
      ...sub,
      stripe_customer_id: sub['stripe_customer_id'] ? '[REDACTED]' : null,
      stripe_subscription_id: sub['stripe_subscription_id'] ? '[REDACTED]' : null,
    };
  }

  // Token credits
  const tokenRows = await db
    .query<
      Record<string, unknown>
    >('select * from token_credits where user_id = $1 order by created_at desc', [user.id])
    .catch(() => []);
  if (tokenRows.length > 0) exportData['token_credits'] = tokenRows;

  // Credit transactions (cap at 1000)
  const txRows = await db
    .query<
      Record<string, unknown>
    >('select * from credit_transactions where user_id = $1 order by created_at desc limit 1000', [user.id])
    .catch(() => []);
  if (txRows.length > 0) exportData['credit_transactions'] = txRows;

  // Email preferences (redact sensitive fields)
  const emailRows = await db
    .query<
      Record<string, unknown>
    >('select * from email_preferences where user_id = $1 limit 1', [user.id])
    .catch(() => []);
  if (emailRows.length > 0) {
    const ep = emailRows[0]!;
    exportData['email_preferences'] = {
      ...ep,
      unsubscribe_token: '[REDACTED]',
      consent_ip_address: ep['consent_ip_address'] ? '[PARTIALLY_REDACTED]' : null,
    };
  }

  // Organization memberships · two queries, joined in JS (PostgREST embedding not available)
  const orgMemberRows = await db
    .query<
      Record<string, unknown>
    >('select * from organization_members where user_id = $1', [user.id])
    .catch(() => []);
  if (orgMemberRows.length > 0) {
    const orgIds = orgMemberRows
      .map((r) => r['organization_id'])
      .filter((id): id is string => typeof id === 'string');
    let orgsById: Record<string, Record<string, unknown>> = {};
    if (orgIds.length > 0) {
      const orgRows = await db
        .query<
          Record<string, unknown>
        >('select * from organizations where id = any($1::text[])', [orgIds])
        .catch(() => []);
      orgsById = Object.fromEntries(orgRows.map((o) => [o['id'] as string, o]));
    }
    exportData['organization_memberships'] = orgMemberRows.map((m) => ({
      ...m,
      organizations: orgsById[m['organization_id'] as string] ?? null,
    }));
  }

  // Beta redemptions · two queries, joined in JS
  const betaRows = await db
    .query<Record<string, unknown>>('select * from beta_redemptions where user_id = $1', [user.id])
    .catch(() => []);
  if (betaRows.length > 0) {
    const inviteIds = betaRows
      .map((r) => r['invite_id'])
      .filter((id): id is string => typeof id === 'string');
    let invitesById: Record<string, Record<string, unknown>> = {};
    if (inviteIds.length > 0) {
      const inviteRows = await db
        .query<
          Record<string, unknown>
        >('select id, code, plan_tier, trial_days from beta_invites where id = any($1::text[])', [inviteIds])
        .catch(() => []);
      invitesById = Object.fromEntries(inviteRows.map((i) => [i['id'] as string, i]));
    }
    exportData['beta_redemptions'] = betaRows.map((r) => ({
      ...r,
      beta_invites: invitesById[r['invite_id'] as string] ?? null,
    }));
  }

  // Device authorization codes (redact tokens)
  const deviceAuthRows = await db
    .query<
      Record<string, unknown>
    >('select * from device_authorization_codes where user_id = $1 order by created_at desc', [user.id])
    .catch(() => []);
  if (deviceAuthRows.length > 0) {
    exportData['device_authorizations'] = deviceAuthRows.map((auth) => ({
      ...auth,
      user_code: auth['user_code'] ? '[REDACTED]' : null,
      access_token: auth['access_token'] ? '[REDACTED]' : null,
      refresh_token: auth['refresh_token'] ? '[REDACTED]' : null,
    }));
  }

  // Desktop devices
  const desktopRows = await db
    .query<Record<string, unknown>>('select * from desktop_devices where user_id = $1', [user.id])
    .catch(() => []);
  if (desktopRows.length > 0) exportData['desktop_devices'] = desktopRows;

  // Mobile devices
  const mobileRows = await db
    .query<Record<string, unknown>>('select * from mobile_devices where user_id = $1', [user.id])
    .catch(() => []);
  if (mobileRows.length > 0) exportData['mobile_devices'] = mobileRows;

  // Sync data
  const syncRows = await db
    .query<Record<string, unknown>>('select * from sync_data where user_id = $1', [user.id])
    .catch(() => []);
  if (syncRows.length > 0) exportData['sync_data'] = syncRows;

  logger.info(
    { userId: user.id, dataSections: Object.keys(exportData).length },
    'User data export completed via fallback method',
  );

  return exportData;
}

/**
 * Creates the export response with appropriate headers.
 * Supports both JSON download and API response based on Accept header.
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
 * OPTIONS handler for CORS preflight requests.
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
