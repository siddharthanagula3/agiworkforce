import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { consumePendingSecurityAnomalyCheck } from '@/lib/security-audit';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import {
  SecurityMonitoringService,
  type AlertStatus,
} from '@/lib/services/security-monitoring-service';
import { pageOnCall, type AlertSeverity } from '../health-probe/route';

export const runtime = 'nodejs';

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function worstSeverity(triggered: AlertStatus[]): AlertSeverity {
  return triggered.some((alert) => alert.severity === 'critical') ? 'critical' : 'warning';
}

function buildPage(
  severity: AlertSeverity,
  triggered: AlertStatus[],
): { subject: string; text: string } {
  const environment = environmentLabel();
  const names = triggered.map((alert) => alert.alert_name).join(', ');
  const subject = `[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}] ${environment} security anomaly · ${names}`;
  const text = [
    `Environment: ${environment}`,
    '',
    'TRIGGERED ALERTS',
    ...triggered.map(
      (alert) =>
        `- ${alert.alert_name}: ${alert.current_count}/${alert.threshold} in ${alert.window_minutes}m (${alert.severity})`,
    ),
  ].join('\n');
  return { subject, text };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized security anomaly cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pendingActivity = await consumePendingSecurityAnomalyCheck();
  if (pendingActivity === false) {
    return NextResponse.json({ triggered: 0, paged: 'not_needed' });
  }

  let alerts: AlertStatus[];
  try {
    alerts = await SecurityMonitoringService.checkAlerts();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Security anomaly cron could not evaluate alert thresholds',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const triggered = alerts.filter((alert) => alert.triggered);
  if (triggered.length === 0) {
    return NextResponse.json({ triggered: 0, paged: 'not_needed' });
  }

  const severity = worstSeverity(triggered);
  const { subject, text } = buildPage(severity, triggered);
  const paged = await pageOnCall(severity, subject, text);

  if (paged === 'unconfigured') {
    logger.warn(
      { severity, triggered: triggered.length },
      'PAGER_WEBHOOK_URL is unset · a triggered security alert reached no one',
    );
  } else if (paged === 'failed') {
    logger.error(
      { severity, triggered: triggered.length },
      'Security anomaly page could not be delivered',
    );
  } else {
    logger.warn({ severity, triggered: triggered.length }, 'Security anomaly page dispatched');
  }

  return NextResponse.json({
    triggered: triggered.length,
    severity,
    paged,
    alerts: triggered,
  });
}
