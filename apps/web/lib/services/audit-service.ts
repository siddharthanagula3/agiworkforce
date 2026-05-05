import 'server-only';

import { type SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { AuditLog } from '@/types/saas';

export class AuditService {
  /**
   * Log an action.
   * SERVICE-CONTEXT: audit log writes are inherently admin/system operations.
   * The write must succeed even when the triggering request is unauthenticated
   * (e.g., logging a failed auth attempt). Service-role is appropriate here.
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
    // SECURITY: service-role required because audit log writes run in system/admin context
    // and must succeed regardless of whether a user JWT is available.
    const supabase = getServiceClient();

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
   * USER-CONTEXT: caller passes an RLS-bound SupabaseClient so only rows
   * visible to the authenticated user are returned.
   *
   * RT-09 fix: callerUserId is now required. Membership is verified against
   * organization_members before any log rows are returned. Without this guard,
   * any authenticated user could read any org's audit log by guessing org UUIDs.
   *
   * @param client - RLS-bound SupabaseClient from getUserClient(jwt)
   * @param orgId - Organization UUID
   * @param callerUserId - Authenticated user ID from JWT (required)
   * @param limit - Max rows (default 50)
   * @throws 403-shaped Error if callerUserId is not a member of orgId
   */
  static async getOrganizationLogs(
    client: SupabaseClient,
    orgId: string,
    callerUserId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    // RT-09: Verify caller is a member of the org before returning any logs.
    const { data: membership, error: memberError } = await client
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

    const { data, error } = await client
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
