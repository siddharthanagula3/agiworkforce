import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';
import type { SecurityAuditLogRow } from '@/lib/server/neon-types';
import type { SecurityEventType, SecurityEventSeverity } from '@/lib/security-audit';

export interface SecurityEvent {
  id: string;
  user_id: string | null;
  event_type: string;
  severity: SecurityEventSeverity;
  ip_address: string | null;
  user_agent: string | null;
  endpoint: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface SecurityMetrics {
  total_events_24h: number;
  total_events_7d: number;
  by_severity: Record<SecurityEventSeverity, number>;
  by_event_type: Record<SecurityEventType, number>;
  unique_ips_24h: number;
  unique_users_24h: number;
  critical_events_24h: number;
  high_severity_events_24h: number;
}

export interface AlertThreshold {
  event_type?: SecurityEventType;
  severity?: SecurityEventSeverity;
  count_threshold: number;
  window_minutes: number;
}

export interface AlertStatus {
  alert_name: string;
  triggered: boolean;
  current_count: number;
  threshold: number;
  window_minutes: number;
  severity: 'warning' | 'critical';
}

type StoredSecurityEventSeverity = SecurityAuditLogRow['severity'] | SecurityEventSeverity;
type StoredSecurityAuditLogRow = Omit<SecurityAuditLogRow, 'severity'> & {
  severity: StoredSecurityEventSeverity;
};

/**
 * Two writers share this table. `logSecurityEvent` writes the severity this
 * service reports; `recordAuditEvent` writes the audit vocabulary. Reading
 * normalizes them, so a filter has to widen the other way or it silently drops
 * every audited event at the severity it was asked for.
 */
const AUDIT_SEVERITY_ALIAS: Readonly<Record<string, SecurityEventSeverity>> = Object.freeze({
  info: 'low',
  warning: 'medium',
  error: 'high',
});

function normalizeSecuritySeverity(severity: StoredSecurityEventSeverity): SecurityEventSeverity {
  return AUDIT_SEVERITY_ALIAS[severity] ?? (severity as SecurityEventSeverity);
}

export function storedSeveritiesFor(severity: SecurityEventSeverity): string[] {
  const aliases = Object.entries(AUDIT_SEVERITY_ALIAS)
    .filter(([, normalized]) => normalized === severity)
    .map(([stored]) => stored);
  return [severity, ...aliases];
}

function toSecurityEvent(row: StoredSecurityAuditLogRow): SecurityEvent {
  return {
    ...row,
    severity: normalizeSecuritySeverity(row.severity),
    details: row.details ?? {},
  };
}

const DEFAULT_THRESHOLDS: Array<
  AlertThreshold & { name: string; alert_severity: 'warning' | 'critical' }
> = [
  {
    name: 'Critical Events Spike',
    severity: 'critical',
    count_threshold: 5,
    window_minutes: 60,
    alert_severity: 'critical',
  },
  {
    name: 'High Auth Failures',
    event_type: 'auth_failed',
    count_threshold: 50,
    window_minutes: 15,
    alert_severity: 'warning',
  },
  {
    name: 'Rate Limit Abuse',
    event_type: 'rate_limit_exceeded',
    count_threshold: 100,
    window_minutes: 60,
    alert_severity: 'warning',
  },
  {
    name: 'Invalid Signatures',
    event_type: 'invalid_signature',
    count_threshold: 10,
    window_minutes: 60,
    alert_severity: 'critical',
  },
  {
    name: 'Authorization Failures',
    event_type: 'authorization_failed',
    count_threshold: 20,
    window_minutes: 30,
    alert_severity: 'warning',
  },
  {
    name: 'Suspicious Activity',
    event_type: 'suspicious_activity',
    count_threshold: 5,
    window_minutes: 60,
    alert_severity: 'critical',
  },
];

export class SecurityMonitoringService {
  static async getRecentEvents(
    limit: number = 100,
    severity?: SecurityEventSeverity,
    eventType?: SecurityEventType,
  ): Promise<SecurityEvent[]> {
    try {
      const db = getNeonDb();

      const params: unknown[] = [limit];
      const conditions: string[] = [];

      if (severity) {
        params.push(storedSeveritiesFor(severity));
        conditions.push(`severity = any($${params.length}::text[])`);
      }
      if (eventType) {
        params.push(eventType);
        conditions.push(`event_type = $${params.length}`);
      }

      const where = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
      const sql = `select * from security_audit_logs ${where} order by created_at desc limit $1`;

      const rows = await db.query<StoredSecurityAuditLogRow>(sql, params);
      return rows.map(toSecurityEvent);
    } catch (error) {
      logger.error({ error }, 'Error in getRecentEvents');
      throw error;
    }
  }

  static async getMetrics(): Promise<SecurityMetrics> {
    try {
      const db = getNeonDb();
      const now = Date.now();
      const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [[totals], groups] = await Promise.all([
        db.query<{
          events_24h: number;
          events_7d: number;
          unique_ips_24h: number;
          unique_users_24h: number;
        }>(
          `select count(*) filter (where created_at >= $2)::int as events_24h,
                  count(*)::int as events_7d,
                  count(distinct ip_address) filter (where created_at >= $2)::int as unique_ips_24h,
                  count(distinct user_id) filter (where created_at >= $2)::int as unique_users_24h
             from security_audit_logs
            where created_at >= $1`,
          [sevenDaysAgo, twentyFourHoursAgo],
        ),
        db.query<{ event_type: string; severity: StoredSecurityEventSeverity; count: number }>(
          `select event_type, severity, count(*)::int as count
             from security_audit_logs
            where created_at >= $1
            group by event_type, severity`,
          [twentyFourHoursAgo],
        ),
      ]);

      const bySeverity: Record<SecurityEventSeverity, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };

      const byEventType: Record<SecurityEventType, number> = {
        auth_failed: 0,
        rate_limit_exceeded: 0,
        authorization_failed: 0,
        suspicious_activity: 0,
        admin_action: 0,
        csrf_validation_failed: 0,
        invalid_signature: 0,
        content_notice: 0,
        retention_purge: 0,
      };

      for (const group of groups) {
        bySeverity[normalizeSecuritySeverity(group.severity)] += group.count;
        if (group.event_type in byEventType) {
          byEventType[group.event_type as SecurityEventType] += group.count;
        }
      }

      return {
        total_events_24h: totals?.events_24h ?? 0,
        total_events_7d: totals?.events_7d ?? 0,
        by_severity: bySeverity,
        by_event_type: byEventType,
        unique_ips_24h: totals?.unique_ips_24h ?? 0,
        unique_users_24h: totals?.unique_users_24h ?? 0,
        critical_events_24h: bySeverity.critical,
        high_severity_events_24h: bySeverity.high,
      };
    } catch (error) {
      logger.error({ error }, 'Error in getMetrics');
      throw error;
    }
  }

  static async checkAlerts(): Promise<AlertStatus[]> {
    try {
      const db = getNeonDb();
      const alerts: AlertStatus[] = [];

      for (const threshold of DEFAULT_THRESHOLDS) {
        const windowStart = new Date(
          Date.now() - threshold.window_minutes * 60 * 1000,
        ).toISOString();

        const params: unknown[] = [windowStart];
        const conditions: string[] = ['created_at >= $1'];

        if (threshold.event_type) {
          params.push(threshold.event_type);
          conditions.push(`event_type = $${params.length}`);
        }
        if (threshold.severity) {
          params.push(storedSeveritiesFor(threshold.severity));
          conditions.push(`severity = any($${params.length}::text[])`);
        }

        const where = conditions.join(' and ');

        try {
          const [row] = await db.query<{ count: number }>(
            `select count(*)::int as count from security_audit_logs where ${where}`,
            params,
          );

          const currentCount = row?.count ?? 0;
          const triggered = currentCount >= threshold.count_threshold;

          alerts.push({
            alert_name: threshold.name,
            triggered,
            current_count: currentCount,
            threshold: threshold.count_threshold,
            window_minutes: threshold.window_minutes,
            severity: threshold.alert_severity,
          });

          if (triggered) {
            logger.warn(
              {
                alert: threshold.name,
                count: currentCount,
                threshold: threshold.count_threshold,
                window: threshold.window_minutes,
              },
              'Security alert threshold exceeded',
            );
          }
        } catch (queryError) {
          logger.error(
            { error: queryError, threshold: threshold.name },
            'Failed to check alert threshold',
          );
        }
      }

      return alerts;
    } catch (error) {
      logger.error({ error }, 'Error in checkAlerts');
      throw error;
    }
  }

  static async getTopIpAddresses(
    windowHours: number = 24,
    limit: number = 10,
  ): Promise<Array<{ ip_address: string; event_count: number }>> {
    try {
      const db = getNeonDb();
      const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

      return await db.query<{ ip_address: string; event_count: number }>(
        `select ip_address, count(*)::int as event_count
           from security_audit_logs
          where created_at >= $1 and ip_address is not null
          group by ip_address
          order by event_count desc, ip_address asc
          limit $2`,
        [windowStart, limit],
      );
    } catch (error) {
      logger.error({ error }, 'Error in getTopIpAddresses');
      throw error;
    }
  }

  static async getEventsByUser(userId: string, limit: number = 50): Promise<SecurityEvent[]> {
    try {
      const db = getNeonDb();
      const rows = await db.query<StoredSecurityAuditLogRow>(
        `select * from security_audit_logs
         where user_id = $1
         order by created_at desc
         limit $2`,
        [userId, limit],
      );
      return rows.map(toSecurityEvent);
    } catch (error) {
      logger.error({ error, userId }, 'Error in getEventsByUser');
      throw error;
    }
  }

  static async getDashboardSummary(): Promise<{
    metrics: SecurityMetrics;
    alerts: AlertStatus[];
    recent_critical: SecurityEvent[];
    top_ips: Array<{ ip_address: string; event_count: number }>;
  }> {
    const [metrics, alerts, recentCritical, topIps] = await Promise.all([
      this.getMetrics(),
      this.checkAlerts(),
      this.getRecentEvents(10, 'critical'),
      this.getTopIpAddresses(24, 5),
    ]);

    return {
      metrics,
      alerts,
      recent_critical: recentCritical,
      top_ips: topIps,
    };
  }
}
