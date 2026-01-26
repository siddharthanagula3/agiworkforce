import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/utils/env';
import { logger } from '@/lib/logger';
import type { SecurityEventType, SecurityEventSeverity } from '@/lib/security-audit';

function getSupabaseClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

export interface SecurityEvent {
  id: string;
  user_id: string | null;
  event_type: SecurityEventType;
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

// Default alert thresholds
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
  /**
   * Get recent security events
   */
  static async getRecentEvents(
    limit: number = 100,
    severity?: SecurityEventSeverity,
    eventType?: SecurityEventType,
  ): Promise<SecurityEvent[]> {
    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from('security_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (severity) {
        query = query.eq('severity', severity);
      }
      if (eventType) {
        query = query.eq('event_type', eventType);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to fetch security events');
        throw error;
      }

      return (data || []) as SecurityEvent[];
    } catch (error) {
      logger.error({ error }, 'Error in getRecentEvents');
      throw error;
    }
  }

  /**
   * Get aggregated security metrics
   */
  static async getMetrics(): Promise<SecurityMetrics> {
    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Fetch events from last 7 days for all metrics
      const { data: events, error } = await supabase
        .from('security_audit_logs')
        .select('event_type, severity, ip_address, user_id, created_at')
        .gte('created_at', sevenDaysAgo);

      if (error) {
        logger.error({ error }, 'Failed to fetch security metrics');
        throw error;
      }

      const allEvents = events || [];

      // Filter for 24h and 7d
      const events24h = allEvents.filter(
        (e) => new Date(e.created_at) >= new Date(twentyFourHoursAgo),
      );
      const events7d = allEvents;

      // Calculate metrics
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
        csrf_validation_failed: 0,
        invalid_signature: 0,
      };

      const uniqueIps = new Set<string>();
      const uniqueUsers = new Set<string>();
      let criticalCount = 0;
      let highCount = 0;

      for (const event of events24h) {
        // Count by severity
        if (event.severity in bySeverity) {
          bySeverity[event.severity as SecurityEventSeverity]++;
        }

        // Count by event type
        if (event.event_type in byEventType) {
          byEventType[event.event_type as SecurityEventType]++;
        }

        // Track unique IPs and users
        if (event.ip_address) {
          uniqueIps.add(event.ip_address);
        }
        if (event.user_id) {
          uniqueUsers.add(event.user_id);
        }

        // Count critical/high severity
        if (event.severity === 'critical') {
          criticalCount++;
        } else if (event.severity === 'high') {
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

  /**
   * Check alert thresholds and return triggered alerts
   */
  static async checkAlerts(): Promise<AlertStatus[]> {
    try {
      const supabase = getSupabaseClient();
      const alerts: AlertStatus[] = [];

      for (const threshold of DEFAULT_THRESHOLDS) {
        const windowStart = new Date(
          Date.now() - threshold.window_minutes * 60 * 1000,
        ).toISOString();

        let query = supabase
          .from('security_audit_logs')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', windowStart);

        if (threshold.event_type) {
          query = query.eq('event_type', threshold.event_type);
        }
        if (threshold.severity) {
          query = query.eq('severity', threshold.severity);
        }

        const { count, error } = await query;

        if (error) {
          logger.error({ error, threshold: threshold.name }, 'Failed to check alert threshold');
          continue;
        }

        const currentCount = count || 0;
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
      }

      return alerts;
    } catch (error) {
      logger.error({ error }, 'Error in checkAlerts');
      throw error;
    }
  }

  /**
   * Get top IP addresses by event count (for abuse detection)
   */
  static async getTopIpAddresses(
    windowHours: number = 24,
    limit: number = 10,
  ): Promise<Array<{ ip_address: string; event_count: number }>> {
    try {
      const supabase = getSupabaseClient();
      const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('ip_address')
        .gte('created_at', windowStart)
        .not('ip_address', 'is', null);

      if (error) {
        logger.error({ error }, 'Failed to fetch top IP addresses');
        throw error;
      }

      // Aggregate by IP
      const ipCounts = new Map<string, number>();
      for (const row of data || []) {
        if (row.ip_address) {
          ipCounts.set(row.ip_address, (ipCounts.get(row.ip_address) || 0) + 1);
        }
      }

      // Sort and return top N
      return Array.from(ipCounts.entries())
        .map(([ip_address, event_count]) => ({ ip_address, event_count }))
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, limit);
    } catch (error) {
      logger.error({ error }, 'Error in getTopIpAddresses');
      throw error;
    }
  }

  /**
   * Get events by user (for investigating specific accounts)
   */
  static async getEventsByUser(userId: string, limit: number = 50): Promise<SecurityEvent[]> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('security_audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error, userId }, 'Failed to fetch user security events');
        throw error;
      }

      return (data || []) as SecurityEvent[];
    } catch (error) {
      logger.error({ error, userId }, 'Error in getEventsByUser');
      throw error;
    }
  }

  /**
   * Get summary for dashboard display
   */
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

  /**
   * Trigger cleanup of old logs (calls the database function)
   */
  static async cleanupOldLogs(): Promise<number> {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc('cleanup_old_security_logs');

      if (error) {
        logger.error({ error }, 'Failed to cleanup old security logs');
        throw error;
      }

      const deletedCount = data || 0;
      logger.info({ deletedCount }, 'Cleaned up old security logs');
      return deletedCount;
    } catch (error) {
      logger.error({ error }, 'Error in cleanupOldLogs');
      throw error;
    }
  }
}
