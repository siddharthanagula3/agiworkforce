import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { SecurityMonitoringService } from '@/lib/services/security-monitoring-service';
import { logSecurityEvent } from '@/lib/security-audit';
import { purgeExpiredSecurityAuditLogs } from '@/lib/server/security-log-retention';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { isDbUnavailableError } from '@/lib/db-error';
import { createError, isAppError, type AppError } from '@/lib/errors';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { readJsonBody } from '@/lib/read-json-body';
import { setCachedAccountStatus } from '@/lib/server/request-context-cache';
import { getIdentityProvider } from '@/lib/server/identity';

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
 * This surface reads and writes across every tenant, so it requires a platform
 * operator on the AGI_PLATFORM_ADMIN_USER_IDS allowlist, not the self-service
 * organisation admin/owner role.
 */

export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    await requirePlatformAdmin(request);

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
    if (isAppError(error)) {
      logger.warn({ code: error.code }, 'Security dashboard request denied');
      return errorResponse(error);
    }
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
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    const csrfError = await requireCsrfToken(request);
    if (csrfError) return csrfError;

    const { userId: adminUserId } = await requirePlatformAdmin(request);

    const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
    if (contentLength > 8192) {
      return errorResponse(createError.payloadTooLarge());
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'cleanup': {
        const run = await purgeExpiredSecurityAuditLogs('admin');
        return NextResponse.json({
          success: true,
          message: `Cleaned up ${run.deleted} old security log entries`,
          deleted_count: run.deleted,
          retention_days: run.retentionDays,
          oldest_remaining_age_days: run.oldestRemainingAgeDays,
          retention_holds: run.retentionHolds,
        });
      }

      case 'suspend-user': {
        const body = await readJsonBody(request);
        const { userId: targetUserId, reason } = body as {
          userId?: string;
          reason?: string;
        };

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
          await setCachedAccountStatus(targetUserId, 'suspended');
        } catch (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to suspend user');
          return errorResponse(createError.internal('Failed to update account status'));
        }

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
          await setCachedAccountStatus(targetUserId, 'banned');
        } catch (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to ban user');
          return errorResponse(createError.internal('Failed to update account status'));
        }

        try {
          await getIdentityProvider().setUserSuspended(targetUserId, true);
        } catch (banError) {
          logger.warn(
            { error: banError, targetUserId },
            'Failed to set Clerk ban, relying on middleware check',
          );
        }

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
          await setCachedAccountStatus(targetUserId, 'active');
        } catch (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to reactivate user');
          return errorResponse(createError.internal('Failed to update account status'));
        }

        try {
          await getIdentityProvider().setUserSuspended(targetUserId, false);
        } catch (unbanError) {
          logger.warn({ error: unbanError, targetUserId }, 'Failed to remove Clerk ban');
        }

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
    if (isAppError(error)) {
      logger.warn({ code: error.code }, 'Security admin action denied');
      return errorResponse(error);
    }
    logger.error({ error }, 'Error in security admin action');
    if (isDbUnavailableError(error)) {
      return errorResponse(createError.serviceUnavailable('Database temporarily unavailable'), {
        'Retry-After': '30',
      });
    }
    return errorResponse(createError.internal());
  }
}
