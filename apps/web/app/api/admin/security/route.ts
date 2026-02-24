import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SecurityMonitoringService } from '@/lib/services/security-monitoring-service';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { isAdmin: false, error: 'Server configuration error' };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isAdmin: false, error: 'Missing authorization header' };
  }

  const token = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify the JWT and check if user has admin role
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { isAdmin: false, error: 'Invalid or expired token' };
  }

  // AUDIT-008-013: Verify admin via app_metadata (set by service role only, not user-editable)
  // app_metadata is secure because it can only be modified via service role key or admin API
  // user_metadata is NOT secure as users can modify it themselves
  const isAdminFromAppMetadata = user.app_metadata?.role === 'admin';

  if (isAdminFromAppMetadata) {
    return { isAdmin: true, userId: user.id };
  }

  return { isAdmin: false, error: 'User does not have admin privileges' };
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin access
    const { isAdmin, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized security dashboard access attempt');
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
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
        const severity = searchParams.get('severity') as
          | 'low'
          | 'medium'
          | 'high'
          | 'critical'
          | null;
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
          return NextResponse.json({ error: 'userId parameter required' }, { status: 400 });
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
        return NextResponse.json(
          { error: 'Unknown action. Supported: dashboard, metrics, alerts, events, user, ips' },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error({ error }, 'Error in security monitoring API');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting: restrict admin security actions
    const rateLimitResponse = await withRateLimit(request, 'admin-security');
    if (rateLimitResponse) return rateLimitResponse;

    // Verify admin access
    const { isAdmin, userId: adminUserId, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized security admin action attempt');
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
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
          return NextResponse.json({ error: 'userId and reason are required' }, { status: 400 });
        }

        const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        });

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ account_status: 'suspended' })
          .eq('id', targetUserId);

        if (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to suspend user');
          return NextResponse.json({ error: 'Failed to update account status' }, { status: 500 });
        }

        // Session invalidation is handled at the middleware level:
        // auth middleware checks account_status on every request and rejects suspended users.

        // Log the admin action
        await logSecurityEvent({
          userId: adminUserId,
          eventType: 'suspicious_activity',
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
          return NextResponse.json({ error: 'userId and reason are required' }, { status: 400 });
        }

        const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        });

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ account_status: 'banned' })
          .eq('id', targetUserId);

        if (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to ban user');
          return NextResponse.json({ error: 'Failed to update account status' }, { status: 500 });
        }

        // Belt-and-suspenders: also set Supabase-level ban in addition to middleware check
        try {
          await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            ban_duration: '876600h', // ~100 years
          });
        } catch (banError) {
          logger.warn(
            { error: banError, targetUserId },
            'Failed to set Supabase ban, relying on middleware check',
          );
        }

        // Log the admin action
        await logSecurityEvent({
          userId: adminUserId,
          eventType: 'suspicious_activity',
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
          return NextResponse.json({ error: 'userId and reason are required' }, { status: 400 });
        }

        const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        });

        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ account_status: 'active' })
          .eq('id', targetUserId);

        if (updateError) {
          logger.error({ error: updateError, targetUserId }, 'Failed to reactivate user');
          return NextResponse.json({ error: 'Failed to update account status' }, { status: 500 });
        }

        // Remove any Supabase-level ban
        try {
          await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            ban_duration: 'none',
          });
        } catch (unbanError) {
          logger.warn({ error: unbanError, targetUserId }, 'Failed to remove Supabase ban');
        }

        // Log the admin action
        await logSecurityEvent({
          userId: adminUserId,
          eventType: 'suspicious_activity',
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
        return NextResponse.json(
          {
            error: 'Unknown action. Supported: cleanup, suspend-user, ban-user, reactivate-user',
          },
          { status: 400 },
        );
    }
  } catch (error) {
    logger.error({ error }, 'Error in security admin action');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
