import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { SecurityMonitoringService } from '@/lib/services/security-monitoring-service';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { isDbUnavailableError } from '@/lib/db-error';
import { createError, isAppError, type AppError } from '@/lib/errors';
import { assertAccountActive } from '@/lib/api-auth';
import { readJsonBody } from '@/lib/read-json-body';

/** Convert an AppError to a NextResponse with structured error body. */
function errorResponse(err: AppError, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    },
    { status: err.statusCode, ...(headers ? { headers } : {}) },
  );
}

/**
 * Security Monitoring API
 *
 * GET /api/admin/security - Get security dashboard summary
 * GET /api/admin/security?action=metrics - Get security metrics only
 * GET /api/admin/security?action=alerts - Check alert thresholds
 * GET /api/admin/security?action=events&severity=critical&limit=50 - Get recent events
 * GET /api/admin/security?action=user&userId=xxx - Get events for specific user
 * GET /api/admin/security?action=ips - Get top IP addresses
 * POST /api/admin/security?action=cleanup - Trigger log cleanup
 *
 * Requires admin authentication via service role or admin user.
 */

type AdminAccess =
  | { isAdmin: true; userId: string }
  | { isAdmin: false; reason: string; appError: AppError };

function adminDenied(reason: string, appError: AppError): AdminAccess {
  return { isAdmin: false, reason, appError };
}

/**
 * CRIT-014: this is the ONLY authenticated entry point on the admin control
 * plane that does not route through `getClerkAuthUser`, so it was also the only
 * one that never read `profiles.account_status`. Every other authenticated
 * route calls `assertAccountActive` inside `getClerkAuthUser` (lib/api-auth.ts);
 * this one verified the Clerk JWT and the `publicMetadata.role` claim and
 * stopped there.
 *
 * That mattered because the suspend action below writes `account_status` and
 * does NOT touch Clerk — only `ban-user` calls `clerk.users.banUser`, which
 * revokes Clerk sessions. So a SUSPENDED admin kept a valid Clerk session, kept
 * `role: 'admin'`, and kept full use of this route: reading the security event
 * feed and suspending, banning, or reactivating other accounts. Suspension was
 * enforced across the entire product except on the surface that issues it.
 *
 * `assertAccountActive` is called with the id proved by the token, and its
 * status distinctions are preserved: 403 for a suspended/banned account, 503
 * when the status lookup itself fails (it fails closed after one retry).
 */
async function verifyAdminAccess(request: NextRequest): Promise<AdminAccess> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return adminDenied('Missing authorization header', createError.unauthorized());
  }

  let adminUserId: string;
  try {
    const { clerkClient, verifyToken } = await import('@clerk/nextjs/server');
    const client = await clerkClient();

    // Verify JWT and get user via Clerk
    const payload = await verifyToken(authHeader.slice(7), {
      secretKey: process.env['CLERK_SECRET_KEY'],
    });
    const userId = payload.sub;

    if (!userId) {
      return adminDenied('Invalid or expired token', createError.unauthorized());
    }

    const user = await client.users.getUser(userId);

    // Verify admin via publicMetadata.role (set by Clerk dashboard or admin API only)
    const meta = user.publicMetadata as Record<string, unknown> | null | undefined;
    const role = meta?.['role'];

    if (role !== 'admin' && role !== 'owner') {
      return adminDenied('User does not have admin privileges', createError.unauthorized());
    }

    adminUserId = userId;
  } catch {
    return adminDenied('Invalid or expired token', createError.unauthorized());
  }

  try {
    await assertAccountActive(adminUserId);
  } catch (error) {
    return adminDenied(
      'Admin account is suspended, banned, or unverifiable',
      isAppError(error) ? error : createError.serviceUnavailable('Unable to verify account status'),
    );
  }

  return { isAdmin: true, userId: adminUserId };
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting: restrict admin security dashboard reads
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    // Verify admin access
    const access = await verifyAdminAccess(request);

    if (!access.isAdmin) {
      logger.warn({ error: access.reason }, 'Unauthorized security dashboard access attempt');
      return errorResponse(access.appError);
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'dashboard';

    switch (action) {
      case 'dashboard': {
        const summary = await SecurityMonitoringService.getDashboardSummary();
        return NextResponse.json(summary);
      }

      case 'metrics': {
        const metrics = await SecurityMonitoringService.getMetrics();
        return NextResponse.json({ metrics });
      }

      case 'alerts': {
        const alerts = await SecurityMonitoringService.checkAlerts();
        return NextResponse.json({ alerts });
      }

      case 'events': {
        const rawSeverity = searchParams.get('severity');
        const validSeverities = ['low', 'medium', 'high', 'critical'] as const;
        const severity = validSeverities.includes(rawSeverity as (typeof validSeverities)[number])
          ? (rawSeverity as 'low' | 'medium' | 'high' | 'critical')
          : null;
        if (rawSeverity && !severity) {
          return errorResponse(
            createError.badRequest(
              `Invalid severity. Must be one of: ${validSeverities.join(', ')}`,
            ),
          );
        }
        const eventType = searchParams.get('eventType') as string | null;
        const limit = parseInt(searchParams.get('limit') || '100', 10);

        const events = await SecurityMonitoringService.getRecentEvents(
          Math.min(limit, 500), // Cap at 500
          severity || undefined,
          eventType as Parameters<typeof SecurityMonitoringService.getRecentEvents>[2],
        );
        return NextResponse.json({ events, count: events.length });
      }

      case 'user': {
        const userId = searchParams.get('userId');
        if (!userId) {
          return errorResponse(createError.badRequest('userId parameter required'));
        }
        const events = await SecurityMonitoringService.getEventsByUser(userId);
        return NextResponse.json({ events, count: events.length });
      }

      case 'ips': {
        const hours = parseInt(searchParams.get('hours') || '24', 10);
        const limit = parseInt(searchParams.get('limit') || '10', 10);
        const topIps = await SecurityMonitoringService.getTopIpAddresses(
          Math.min(hours, 168), // Cap at 7 days
          Math.min(limit, 50), // Cap at 50
        );
        return NextResponse.json({ top_ips: topIps });
      }

      default:
        return errorResponse(
          createError.badRequest(
            'Unknown action. Supported: dashboard, metrics, alerts, events, user, ips',
          ),
        );
    }
  } catch (error) {
    logger.error({ error }, 'Error in security monitoring API');
    if (isDbUnavailableError(error)) {
      return errorResponse(createError.serviceUnavailable('Database temporarily unavailable'), {
        'Retry-After': '30',
      });
    }
    return errorResponse(createError.internal());
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: restrict admin security actions
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    // CSRF protection
    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError;

    // Verify admin access
    const access = await verifyAdminAccess(request);

    if (!access.isAdmin) {
      logger.warn({ error: access.reason }, 'Unauthorized security admin action attempt');
      return errorResponse(access.appError);
    }

    const adminUserId = access.userId;

    // Body size guard: cap admin payloads to prevent memory exhaustion from oversized JSON
    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
    if (contentLength > 8192) {
      return errorResponse(createError.payloadTooLarge());
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'cleanup': {
        const deletedCount = await SecurityMonitoringService.cleanupOldLogs();
        return NextResponse.json({
          success: true,
          message: `Cleaned up ${deletedCount} old security log entries`,
          deleted_count: deletedCount,
        });
      }

      case 'suspend-user': {
        const body = await readJsonBody(request);
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

        // AUDIT-FIX STB-14: these were truthy-only checks behind a TypeScript
        // cast, so a non-string value satisfied them and reached both the SQL
        // parameter and the Clerk SDK. It also defeated the self-modification
        // guard below — an object is never === a string, so an admin could ban
        // their own account by wrapping the id.
        if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
          return errorResponse(createError.badRequest('userId is required and must be a string'));
        }

        if (typeof reason !== 'string' || !reason.trim()) {
          return errorResponse(createError.badRequest('reason is required and must be a string'));
        }

        if (reason.length > 1000) {
          return errorResponse(createError.badRequest('reason exceeds the 1000 character limit'));
        }

        if (targetUserId === adminUserId) {
          return errorResponse(createError.badRequest('Cannot modify your own account'));
        }

        const db = getNeonDb();
        try {
          await db.execute("update profiles set account_status = 'suspended' where id = $1", [
            targetUserId,
          ]);
        } catch (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to suspend user');
          return errorResponse(createError.internal('Failed to update account status'));
        }

        // The Clerk session is intentionally left alive: suspension is enforced
        // on the NEXT request by `assertAccountActive` (lib/api-auth.ts), which
        // every authenticated API route reaches through `getClerkAuthUser` —
        // and, since CRIT-014, which this route reaches through
        // `verifyAdminAccess` above. It is a read of `profiles.account_status`
        // — NOT anything in `proxy.ts`, which only decides which routes require
        // a signed-in session and never reads account status.

        // Log the admin action
        await logSecurityEvent({
          userId: adminUserId,
          eventType: 'admin_action',
          severity: 'high',
          endpoint: '/api/admin/security?action=suspend-user',
          details: { action: 'suspend-user', targetUserId, reason },
        });

        logger.info({ adminUserId, targetUserId, reason }, 'User account suspended by admin');

        return NextResponse.json({
          success: true,
          message: `User ${targetUserId} has been suspended`,
          account_status: 'suspended',
        });
      }

      case 'ban-user': {
        const body = await readJsonBody(request);
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

        // AUDIT-FIX STB-14: these were truthy-only checks behind a TypeScript
        // cast, so a non-string value satisfied them and reached both the SQL
        // parameter and the Clerk SDK. It also defeated the self-modification
        // guard below — an object is never === a string, so an admin could ban
        // their own account by wrapping the id.
        if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
          return errorResponse(createError.badRequest('userId is required and must be a string'));
        }

        if (typeof reason !== 'string' || !reason.trim()) {
          return errorResponse(createError.badRequest('reason is required and must be a string'));
        }

        if (reason.length > 1000) {
          return errorResponse(createError.badRequest('reason exceeds the 1000 character limit'));
        }

        if (targetUserId === adminUserId) {
          return errorResponse(createError.badRequest('Cannot modify your own account'));
        }

        const db = getNeonDb();
        try {
          await db.execute("update profiles set account_status = 'banned' where id = $1", [
            targetUserId,
          ]);
        } catch (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to ban user');
          return errorResponse(createError.internal('Failed to update account status'));
        }

        // Belt-and-suspenders: also disable via Clerk in addition to middleware check
        try {
          const { clerkClient } = await import('@clerk/nextjs/server');
          const clerk = await clerkClient();
          await clerk.users.banUser(targetUserId);
        } catch (banError) {
          logger.warn(
            { error: banError, targetUserId },
            'Failed to set Clerk ban, relying on middleware check',
          );
        }

        // Log the admin action
        await logSecurityEvent({
          userId: adminUserId,
          eventType: 'admin_action',
          severity: 'critical',
          endpoint: '/api/admin/security?action=ban-user',
          details: { action: 'ban-user', targetUserId, reason },
        });

        logger.info({ adminUserId, targetUserId, reason }, 'User account banned by admin');

        return NextResponse.json({
          success: true,
          message: `User ${targetUserId} has been banned`,
          account_status: 'banned',
        });
      }

      case 'reactivate-user': {
        const body = await readJsonBody(request);
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

        // AUDIT-FIX STB-14: these were truthy-only checks behind a TypeScript
        // cast, so a non-string value satisfied them and reached both the SQL
        // parameter and the Clerk SDK. It also defeated the self-modification
        // guard below — an object is never === a string, so an admin could ban
        // their own account by wrapping the id.
        if (typeof targetUserId !== 'string' || !targetUserId.trim()) {
          return errorResponse(createError.badRequest('userId is required and must be a string'));
        }

        if (typeof reason !== 'string' || !reason.trim()) {
          return errorResponse(createError.badRequest('reason is required and must be a string'));
        }

        if (reason.length > 1000) {
          return errorResponse(createError.badRequest('reason exceeds the 1000 character limit'));
        }

        if (targetUserId === adminUserId) {
          return errorResponse(createError.badRequest('Cannot modify your own account'));
        }

        const db = getNeonDb();
        try {
          await db.execute("update profiles set account_status = 'active' where id = $1", [
            targetUserId,
          ]);
        } catch (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to reactivate user');
          return errorResponse(createError.internal('Failed to update account status'));
        }

        // Remove any Clerk-level ban
        try {
          const { clerkClient } = await import('@clerk/nextjs/server');
          const clerk = await clerkClient();
          await clerk.users.unbanUser(targetUserId);
        } catch (unbanError) {
          logger.warn({ error: unbanError, targetUserId }, 'Failed to remove Clerk ban');
        }

        // Log the admin action
        await logSecurityEvent({
          userId: adminUserId,
          eventType: 'admin_action',
          severity: 'high',
          endpoint: '/api/admin/security?action=reactivate-user',
          details: { action: 'reactivate-user', targetUserId, reason },
        });

        logger.info({ adminUserId, targetUserId, reason }, 'User account reactivated by admin');

        return NextResponse.json({
          success: true,
          message: `User ${targetUserId} has been reactivated`,
          account_status: 'active',
        });
      }

      default:
        return errorResponse(
          createError.badRequest(
            'Unknown action. Supported: cleanup, suspend-user, ban-user, reactivate-user',
          ),
        );
    }
  } catch (error) {
    logger.error({ error }, 'Error in security admin action');
    if (isDbUnavailableError(error)) {
      return errorResponse(createError.serviceUnavailable('Database temporarily unavailable'), {
        'Retry-After': '30',
      });
    }
    return errorResponse(createError.internal());
  }
}
