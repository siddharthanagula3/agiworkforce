/**
 * @file audit-service.ts
 *
 * # Client injection contract (WEB-RLS-BYPASS mitigation)
 *
 * `log()` - SERVICE-CONTEXT. System/admin writes that must succeed even when
 *   the triggering request is unauthenticated (failed-auth logging). Uses
 *   `getNeonDb()` internally.
 *
 * `getOrganizationLogs()` - USER-CONTEXT. Caller passes a DatabaseAdapter.
 *   RT-09 fix: membership verified before any log rows are returned.
 *
 * Never add a private `getDatabase()` here. See lib/services/README.md.
 */
import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import { AuditLog } from '@shared/types/saas';

interface AuditLogRow {
  id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  organization_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor_email: string | null;
}

interface OrgMembershipRow {
  user_id: string;
}

export class AuditService {
  /**
   * Log an action.
   * SERVICE-CONTEXT: audit log writes are inherently admin/system operations.
   * The write must succeed even when the triggering request is unauthenticated
   * (e.g., logging a failed auth attempt). Service-context is appropriate here.
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
    const db = getNeonDb();

    try {
      await db.execute(
        `insert into audit_logs
           (action, resource, resource_id, metadata, user_id, organization_id, ip_address, user_agent)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          action,
          resource,
          resourceId,
          JSON.stringify(metadata),
          context.userId ?? null,
          context.orgId ?? null,
          context.ipAddress ?? null,
          context.userAgent ?? null,
        ],
      );
    } catch (error) {
      // Don't throw to avoid breaking main flow, just log error
      logger.error({ error, action, resource }, 'Failed to write audit log');
    }
  }

  /**
   * Fetch logs for an organization.
   * USER-CONTEXT: caller passes a DatabaseAdapter.
   *
   * RT-09 fix: callerUserId is now required. Membership is verified against
   * organization_members before any log rows are returned. Without this guard,
   * any authenticated user could read any org's audit log by guessing org UUIDs.
   *
   * @param db - DatabaseAdapter (user-scoped via withUser(jwt))
   * @param orgId - Organization UUID
   * @param callerUserId - Authenticated user ID from JWT (required)
   * @param limit - Max rows (default 50)
   * @throws 403-shaped Error if callerUserId is not a member of orgId
   */
  static async getOrganizationLogs(
    db: DatabaseAdapter,
    orgId: string,
    callerUserId: string,
    limit = 50,
  ): Promise<AuditLog[]> {
    // RT-09: Verify caller is a member of the org before returning any logs.
    const [membership] = await db
      .query<OrgMembershipRow>(
        `select user_id from organization_members
       where organization_id = $1 and user_id = $2
       limit 1`,
        [orgId, callerUserId],
      )
      .catch((memberError: unknown) => {
        logger.error({ memberError, orgId, callerUserId }, 'Failed to verify org membership');
        throw memberError;
      });

    if (!membership) {
      logger.warn({ orgId, callerUserId }, 'RT-09: Unauthorized org log access attempt');
      const err = new Error('Forbidden: not a member of this organization');
      (err as Error & { statusCode: number }).statusCode = 403;
      throw err;
    }

    const rows = await db
      .query<AuditLogRow>(
        `select
         al.id,
         al.action,
         al.resource,
         al.resource_id,
         al.metadata,
         al.user_id,
         al.organization_id,
         al.ip_address,
         al.user_agent,
         al.created_at,
         p.email as actor_email
       from audit_logs al
       left join profiles p on p.id = al.user_id
       where al.organization_id = $1
       order by al.created_at desc
       limit $2`,
        [orgId, limit],
      )
      .catch((error: unknown) => {
        logger.error({ error, orgId }, 'Failed to fetch audit logs');
        throw error;
      });

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      resource: row.resource,
      resource_id: row.resource_id ?? undefined,
      metadata: row.metadata ?? {},
      user_id: row.user_id ?? undefined,
      organization_id: row.organization_id ?? undefined,
      ip_address: row.ip_address ?? undefined,
      user_agent: row.user_agent ?? undefined,
      created_at: row.created_at,
      actor_email: row.actor_email ?? undefined,
    })) as AuditLog[];
  }
}
