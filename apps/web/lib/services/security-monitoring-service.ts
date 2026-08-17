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

function normalizeSecuritySeverity(severity: StoredSecurityEventSeverity): SecurityEventSeverity {
  if (severity === 'info') return 'low';
  if (severity === 'warning') return 'medium';
  if (severity === 'error') return 'high';
  return severity;
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
        params.push(severity);
        conditions.push(`severity = $${params.length}`);
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
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const events = await db.query<
        Pick<
          StoredSecurityAuditLogRow,
          'event_type' | 'severity' | 'ip_address' | 'user_id' | 'created_at'
        >
      >(
        `select event_type, severity, ip_address, user_id, created_at
         from security_audit_logs
         where created_at >= $1`,
        [sevenDaysAgo],
      );

      const allEvents = events;

      const events24h = allEvents.filter(
        (e) => new Date(e.created_at) >= new Date(twentyFourHoursAgo),
      );
      const events7d = allEvents;

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
      };

      const uniqueIps = new Set<string>();
      const uniqueUsers = new Set<string>();
      let criticalCount = 0;
      let highCount = 0;

      for (const event of events24h) {
        const severity = normalizeSecuritySeverity(event.severity);
        bySeverity[severity]++;

        if (event.event_type in byEventType) {
          byEventType[event.event_type as SecurityEventType]++;
        }

        if (event.ip_address) {
          uniqueIps.add(event.ip_address);
        }
        if (event.user_id) {
          uniqueUsers.add(event.user_id);
        }

        if (severity === 'critical') {
          criticalCount++;
        } else if (severity === 'high') {
          highCount++;
        }
      }

      return {
        total_events_24h: events24h.length,
        total_events_7d: events7d.length,
        by_severity: bySeverity,
        by_event_type: byEventType,
        unique_ips_24h: uniqueIps.size,
        unique_users_24h: uniqueUsers.size,
        critical_events_24h: criticalCount,
        high_severity_events_24h: highCount,
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
          params.push(threshold.severity);
          conditions.push(`severity = $${params.length}`);
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

      const rows = await db.query<Pick<SecurityAuditLogRow, 'ip_address'>>(
        `select ip_address from security_audit_logs
         where created_at >= $1 and ip_address is not null`,
        [windowStart],
      );

      const ipCounts = new Map<string, number>();
      for (const row of rows) {
        if (row.ip_address) {
          ipCounts.set(row.ip_address, (ipCounts.get(row.ip_address) || 0) + 1);
        }
      }

      return Array.from(ipCounts.entries())
        .map(([ip_address, event_count]) => ({ ip_address, event_count }))
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, limit);
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

  static async cleanupOldLogs(): Promise<number> {
    try {
      const db = getNeonDb();
      const [row] = await db.query<{ cleanup_old_security_logs: number }>(
        `select cleanup_old_security_logs() as cleanup_old_security_logs`,
      );

      const deletedCount = row?.cleanup_old_security_logs ?? 0;
      logger.info({ deletedCount }, 'Cleaned up old security logs');
      return deletedCount;
    } catch (error) {
      logger.error({ error }, 'Error in cleanupOldLogs');
      throw error;
    }
  }
}
