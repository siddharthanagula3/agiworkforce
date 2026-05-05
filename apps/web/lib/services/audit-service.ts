import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import { AuditLog } from '@/types/saas';

// SECURITY (WEB-RLS-BYPASS defense-in-depth per docs/plans/UNIFIED_LAUNCH_PLAN.md task #18):
// Service-role bypasses RLS. Audit-log writes are inherently admin operations; service-role
// is appropriate. Audit-log reads should use `getUserClient(jwt)` from
// `@/lib/supabase-server` so users only see their own org's audit entries.
function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export class AuditService {
  /**
   * Log an action
   */
  static async log(
    action: string,
    resource: string,
    resourceId: string,
    metadata: Record<string, unknown> = {},
    context: {
      userId?: string;
      orgId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<void> {
    const supabase = getSupabaseClient();

    const { error } = await supabase.from('audit_logs').insert({
      action,
      resource,
      resource_id: resourceId,
      metadata,
      user_id: context.userId,
      organization_id: context.orgId,
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
    });

    if (error) {
      // Don't throw to avoid breaking main flow, just log error
      logger.error({ error, action, resource }, 'Failed to write audit log');
    }
  }

  /**
   * Fetch logs for an organization.
   *
   * RT-09 fix: callerUserId is now required. Membership is verified against
   * organization_members before any log rows are returned. Without this guard,
   * any authenticated user could read any org's audit log by guessing org UUIDs.
   *
   * @param orgId - Organization UUID
   * @param callerUserId - Authenticated user ID from JWT (required)
   * @param limit - Max rows (default 50)
   * @throws 403-shaped Error if callerUserId is not a member of orgId
   */
  static async getOrganizationLogs(
    orgId: string,
    callerUserId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    const supabase = getSupabaseClient();

    // RT-09: Verify caller is a member of the org before returning any logs.
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', callerUserId)
      .maybeSingle();

    if (memberError) {
      logger.error({ memberError, orgId, callerUserId }, 'Failed to verify org membership');
      throw memberError;
    }

    if (!membership) {
      logger.warn({ orgId, callerUserId }, 'RT-09: Unauthorized org log access attempt');
      const err = new Error('Forbidden: not a member of this organization');
      (err as Error & { statusCode: number }).statusCode = 403;
      throw err;
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select(
        `
        *,
        actor:profiles(email)
      `,
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, orgId }, 'Failed to fetch audit logs');
      throw error;
    }

    // Type for the Supabase query result with joined actor
    interface AuditLogWithActor {
      id: string;
      action: string;
      resource: string;
      resource_id: string;
      metadata: Record<string, unknown>;
      user_id: string | null;
      organization_id: string | null;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
      actor: { email: string } | null;
    }
    return (data as AuditLogWithActor[]).map((log) => ({
      ...log,
      actor_email: log.actor?.email,
    })) as AuditLog[];
  }
}
