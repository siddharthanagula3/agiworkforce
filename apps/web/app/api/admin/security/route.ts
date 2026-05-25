import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { SecurityMonitoringService } from '@/lib/services/security-monitoring-service';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { isDbUnavailableError } from '@/lib/db-error';
import { createError, type AppError } from '@/lib/errors';

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

async function verifyAdminAccess(
  request: NextRequest,
): Promise<{ isAdmin: boolean; userId?: string; error?: string }> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isAdmin: false, error: 'Missing authorization header' };
  }

  try {
    const { clerkClient, verifyToken } = await import('@clerk/nextjs/server');
    const client = await clerkClient();

    // Verify JWT and get user via Clerk
    const payload = await verifyToken(authHeader.slice(7), {
      secretKey: process.env['CLERK_SECRET_KEY'],
    });
    const userId = payload.sub;

    if (!userId) {
      return { isAdmin: false, error: 'Invalid or expired token' };
    }

    const user = await client.users.getUser(userId);

    // Verify admin via publicMetadata.role (set by Clerk dashboard or admin API only)
    const meta = user.publicMetadata as Record<string, unknown> | null | undefined;
    const role = meta?.['role'];
    const isAdmin = role === 'admin' || role === 'owner';

    if (isAdmin) {
      return { isAdmin: true, userId };
    }

    return { isAdmin: false, error: 'User does not have admin privileges' };
  } catch {
    return { isAdmin: false, error: 'Invalid or expired token' };
  }
}

export async function GET(request: NextRequest) {
  try {
    // Rate limiting: restrict admin security dashboard reads
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    // Verify admin access
    const { isAdmin, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized security dashboard access attempt');
      return errorResponse(createError.unauthorized());
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
    const { isAdmin, userId: adminUserId, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized security admin action attempt');
      return errorResponse(createError.unauthorized());
    }

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
        const body = await request.json();
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

        if (!targetUserId || !reason) {
          return errorResponse(createError.badRequest('userId and reason are required'));
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

        // Session invalidation is handled at the middleware level:
        // auth middleware checks account_status on every request and rejects suspended users.

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
        const body = await request.json();
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

        if (!targetUserId || !reason) {
          return errorResponse(createError.badRequest('userId and reason are required'));
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
        const body = await request.json();
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

        if (!targetUserId || !reason) {
          return errorResponse(createError.badRequest('userId and reason are required'));
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
