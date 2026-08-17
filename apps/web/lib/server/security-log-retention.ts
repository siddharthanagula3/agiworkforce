import 'server-only';

import { logSecurityEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';

export const SECURITY_AUDIT_LOG_RETENTION_DAYS = 90;

export const SECURITY_LOG_RETENTION_CRON_PATH = '/api/cron/purge-security-audit-logs';

export type SecurityLogRetentionTrigger = 'cron' | 'admin';

const TRIGGER_ENDPOINTS: Record<SecurityLogRetentionTrigger, string> = {
  cron: SECURITY_LOG_RETENTION_CRON_PATH,
  admin: '/api/admin/security?action=cleanup',
};

export interface SecurityLogRetentionRun {
  retentionDays: number;
  deleted: number;
  oldestRemainingAgeDays: number | null;
  retentionHolds: boolean;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function purgeExpiredSecurityAuditLogs(
  trigger: SecurityLogRetentionTrigger,
): Promise<SecurityLogRetentionRun> {
  const db = getNeonDb();

  const [purged] = await db.query<{ deleted: number | string | null }>(
    `select public.cleanup_old_security_logs() as deleted`,
  );
  const deleted = toNumber(purged?.deleted) ?? 0;

  const [oldest] = await db.query<{ age_days: number | string | null }>(
    `select extract(epoch from (now() - min(created_at))) / 86400 as age_days
       from public.security_audit_logs`,
  );
  const oldestRemainingAgeDays = toNumber(oldest?.age_days);

  const retentionHolds =
    oldestRemainingAgeDays === null || oldestRemainingAgeDays <= SECURITY_AUDIT_LOG_RETENTION_DAYS;

  await logSecurityEvent({
    eventType: 'retention_purge',
    severity: retentionHolds ? 'low' : 'high',
    endpoint: TRIGGER_ENDPOINTS[trigger],
    details: {
      trigger,
      table: 'security_audit_logs',
      retentionDays: SECURITY_AUDIT_LOG_RETENTION_DAYS,
      deleted,
      oldestRemainingAgeDays,
      retentionHolds,
    },
  });

  return {
    retentionDays: SECURITY_AUDIT_LOG_RETENTION_DAYS,
    deleted,
    oldestRemainingAgeDays,
    retentionHolds,
  };
}
