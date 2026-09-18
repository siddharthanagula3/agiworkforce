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
import { withErrorHandler } from '@/lib/error-handler';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { readJsonBody } from '@/lib/read-json-body';
import { setCachedAccountStatus } from '@/lib/server/request-context-cache';
import { getIdentityProvider } from '@/lib/server/identity';
import {
  liftTenantLockdown,
  listLockedDownTenants,
  lockdownTenant,
  type TenantLockdownInput,
} from '@/lib/feature-flags/tenant-lockdown';
import { validateOrganizationKeySetup } from '@/lib/server/organization-encryption-keys';
import { CMEK_PROVIDER_IDS, type CmekKeyDescriptor, type CmekProviderId } from '@/lib/crypto/cmek';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 1000;

function parseLockdownBody(body: unknown): TenantLockdownInput | AppError {
  const { organizationId, reason, secondApproverUserId } = (body ?? {}) as {
    organizationId?: string;
    reason?: string;
    secondApproverUserId?: string;
  };
  if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) {
    return createError.badRequest('organizationId is required and must be a workspace id');
  }
  if (typeof reason !== 'string' || !reason.trim() || reason.length > MAX_REASON_LENGTH) {
    return createError.badRequest(
      `reason is required and must be at most ${MAX_REASON_LENGTH} characters`,
    );
  }
  if (typeof secondApproverUserId !== 'string' || !secondApproverUserId.trim()) {
    return createError.badRequest('secondApproverUserId is required');
  }
  return {
    organizationId,
    reason: reason.trim(),
    secondApproverUserId: secondApproverUserId.trim(),
  };
}

const MAX_KEY_URI_LENGTH = 2048;

function parseKeySetupBody(
  body: unknown,
): { organizationId: string; descriptor: CmekKeyDescriptor } | AppError {
  const { organizationId, provider, keyUri, region } = (body ?? {}) as {
    organizationId?: string;
    provider?: string;
    keyUri?: string;
    region?: string;
  };
  if (typeof organizationId !== 'string' || !UUID_PATTERN.test(organizationId)) {
    return createError.badRequest('organizationId is required and must be a workspace id');
  }
  if (
    typeof provider !== 'string' ||
    !(CMEK_PROVIDER_IDS as readonly string[]).includes(provider)
  ) {
    return createError.badRequest(`provider must be one of ${CMEK_PROVIDER_IDS.join(', ')}`);
  }
  if (typeof keyUri !== 'string' || !keyUri.trim() || keyUri.length > MAX_KEY_URI_LENGTH) {
    return createError.badRequest(
      `keyUri is required and must be at most ${MAX_KEY_URI_LENGTH} characters`,
    );
  }
  if (typeof region !== 'string' || !region.trim() || region.length > 64) {
    return createError.badRequest('region is required');
  }
  return {
    organizationId,
    descriptor: {
      provider: provider as CmekProviderId,
      keyUri: keyUri.trim(),
      region: region.trim(),
    },
  };
}

/**
 * The one answer the gateway cannot shape: a 503 carrying Retry-After, which
 * tells an operator's tooling to come back rather than to escalate.
 */
function withDatabaseAvailability(
  handler: (request: NextRequest) => Promise<NextResponse | Response>,
) {
  return async (request: NextRequest): Promise<NextResponse | Response> => {
    try {
      return await handler(request);
    } catch (error) {
      if (!isDbUnavailableError(error)) throw error;
      logger.error({ error }, 'Security monitoring API: database unavailable');
      return NextResponse.json(
        {
          error: {
            code: createError.serviceUnavailable().code,
            message: 'Database temporarily unavailable',
          },
        },
        { status: 503, headers: { 'Retry-After': '30' } },
      );
    }
  };
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

async function handleGet(request: NextRequest): Promise<NextResponse | Response> {
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
        throw createError
          .badRequest(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`)
          .asUserSafe();
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
        throw createError.badRequest('userId parameter required').asUserSafe();
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

    case 'lockdowns': {
      const tenants = await listLockedDownTenants();
      return NextResponse.json({ locked_down_tenants: tenants, count: tenants.length });
    }

    default:
      throw createError
        .badRequest(
          'Unknown action. Supported: dashboard, metrics, alerts, events, user, ips, lockdowns',
        )
        .asUserSafe();
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const { userId: adminUserId } = await requirePlatformAdmin(request);

  const contentLength = parseInt(request.headers.get('content-length') ?? '0', 10);
  if (contentLength > 8192) {
    throw createError.payloadTooLarge().asUserSafe();
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
        throw createError.badRequest('userId is required and must be a string').asUserSafe();
      }

      if (typeof reason !== 'string' || !reason.trim()) {
        throw createError.badRequest('reason is required and must be a string').asUserSafe();
      }

      if (reason.length > 1000) {
        throw createError.badRequest('reason exceeds the 1000 character limit').asUserSafe();
      }

      if (targetUserId === adminUserId) {
        throw createError.badRequest('Cannot modify your own account').asUserSafe();
      }

      const db = getNeonDb();
      try {
        await db.execute("update profiles set account_status = 'suspended' where id = $1", [
          targetUserId,
        ]);
        await setCachedAccountStatus(targetUserId, 'suspended');
      } catch (updateError) {
        logger.error({ error: updateError, targetUserId }, 'Failed to suspend user');
        throw createError.internal('Failed to update account status').asUserSafe();
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
        throw createError.badRequest('userId is required and must be a string').asUserSafe();
      }

      if (typeof reason !== 'string' || !reason.trim()) {
        throw createError.badRequest('reason is required and must be a string').asUserSafe();
      }

      if (reason.length > 1000) {
        throw createError.badRequest('reason exceeds the 1000 character limit').asUserSafe();
      }

      if (targetUserId === adminUserId) {
        throw createError.badRequest('Cannot modify your own account').asUserSafe();
      }

      const db = getNeonDb();
      try {
        await db.execute("update profiles set account_status = 'banned' where id = $1", [
          targetUserId,
        ]);
        await setCachedAccountStatus(targetUserId, 'banned');
      } catch (updateError) {
        logger.error({ error: updateError, targetUserId }, 'Failed to ban user');
        throw createError.internal('Failed to update account status').asUserSafe();
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
        throw createError.badRequest('userId is required and must be a string').asUserSafe();
      }

      if (typeof reason !== 'string' || !reason.trim()) {
        throw createError.badRequest('reason is required and must be a string').asUserSafe();
      }

      if (reason.length > 1000) {
        throw createError.badRequest('reason exceeds the 1000 character limit').asUserSafe();
      }

      if (targetUserId === adminUserId) {
        throw createError.badRequest('Cannot modify your own account').asUserSafe();
      }

      const db = getNeonDb();
      try {
        await db.execute("update profiles set account_status = 'active' where id = $1", [
          targetUserId,
        ]);
        await setCachedAccountStatus(targetUserId, 'active');
      } catch (updateError) {
        logger.error({ error: updateError, targetUserId }, 'Failed to reactivate user');
        throw createError.internal('Failed to update account status').asUserSafe();
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

    case 'lockdown-tenant':
    case 'lift-tenant-lockdown': {
      const input = parseLockdownBody(await readJsonBody(request));
      if (isAppError(input)) throw input.asUserSafe();

      const actor = { userId: adminUserId, request };
      if (action === 'lockdown-tenant') {
        await lockdownTenant(actor, input);
      } else {
        await liftTenantLockdown(actor, input);
      }

      await logSecurityEvent({
        userId: adminUserId,
        eventType: 'admin_action',
        severity: 'critical',
        endpoint: `/api/admin/security?action=${action}`,
        details: {
          action,
          organizationId: input.organizationId,
          secondApproverUserId: input.secondApproverUserId,
          reason: input.reason,
        },
      });

      return NextResponse.json({
        success: true,
        organization_id: input.organizationId,
        locked_down: action === 'lockdown-tenant',
        message:
          action === 'lockdown-tenant'
            ? `Workspace ${input.organizationId} is locked out of every route, agent and model`
            : `Workspace ${input.organizationId} has its access back`,
      });
    }

    case 'validate-encryption-key': {
      const input = parseKeySetupBody(await readJsonBody(request));
      if (isAppError(input)) throw input.asUserSafe();

      // Read-only on purpose: a workspace can fix its grant and try again
      // without a half-provisioned association left in the table.
      const validation = await validateOrganizationKeySetup(
        getNeonDb(),
        input.organizationId,
        input.descriptor,
      );

      await logSecurityEvent({
        userId: adminUserId,
        eventType: 'admin_action',
        severity: validation.ok ? 'low' : 'medium',
        endpoint: '/api/admin/security?action=validate-encryption-key',
        details: {
          action,
          organizationId: input.organizationId,
          keyProvider: input.descriptor.provider,
          region: input.descriptor.region,
          outcome: validation.ok ? 'usable' : 'not usable',
        },
      });

      return NextResponse.json({
        success: true,
        organization_id: input.organizationId,
        usable: validation.ok,
        checks: validation.checks,
      });
    }

    default:
      throw createError
        .badRequest(
          'Unknown action. Supported: cleanup, suspend-user, ban-user, reactivate-user, lockdown-tenant, lift-tenant-lockdown, validate-encryption-key',
        )
        .asUserSafe();
  }
}

export const GET = withErrorHandler(withDatabaseAvailability(handleGet));
export const POST = withErrorHandler(withDatabaseAvailability(handlePost));
