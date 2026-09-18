import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import {
  runHealthChecks,
  type CapabilityCheck,
  type HealthCheckResult,
} from '@/lib/server/health-check';
import { clearIncident, notifyIncident } from '@/lib/server/incident/dispatch';
import type { AlertSeverity, PageOutcome } from '@/lib/server/incident/pager';

export const runtime = 'nodejs';

export const maxDuration = 30;

const HEALTH_CHECK_TIMEOUT_MS = 8_000;
const INCIDENT_KEY = 'health-probe';
const FAILURE_STREAK_REDIS_KEY = 'agi-health-probe:consecutive-failures';
const FAILURE_STREAK_TTL_SECONDS = 1_800;
const CONSECUTIVE_FAILURES_BEFORE_PAGE = 2;
const HEALTHY_FAILURE_STREAK = 0;

async function recordFailureStreak(healthy: boolean): Promise<number | null> {
  const store = getKeyValueStore();
  if (!store) return null;
  try {
    if (healthy) {
      await store.delete(FAILURE_STREAK_REDIS_KEY);
      return HEALTHY_FAILURE_STREAK;
    }
    const streak = await store.increment(FAILURE_STREAK_REDIS_KEY);
    await store.expire(FAILURE_STREAK_REDIS_KEY, FAILURE_STREAK_TTL_SECONDS);
    return streak;
  } catch (error) {
    logger.error({ error }, 'Health probe failure-streak tracking failed');
    return null;
  }
}

const TIMED_OUT = Symbol('health-check-timeout');

const NOT_MEASURED: CapabilityCheck = { status: 'unhealthy', message: 'not measured' };

export type { AlertSeverity };

interface ProbeSummary {
  status: HealthCheckResult['status'] | 'probe_failed';
  alerted: boolean;
  delivery: 'not_needed' | 'delivered' | 'undeliverable';
  severity?: AlertSeverity;
  reason?: string;
  paged?: PageOutcome;
  escalationLevel?: number;
}

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function failingChecks(result: HealthCheckResult): string[] {
  return Object.entries(result.checks)
    .filter(([, check]) => check.status !== 'healthy')
    .map(([name]) => name);
}

function checkDetail(
  check: HealthCheckResult['checks'][keyof HealthCheckResult['checks']],
): string {
  if ('message' in check && check.message) {
    return ` (${check.message})`;
  }
  if ('missingCount' in check && check.missingCount) {
    return ` (${check.missingCount} required environment variable(s) missing)`;
  }
  return '';
}

function buildAlert(
  severity: AlertSeverity,
  result: HealthCheckResult,
  failed: string[],
): { subject: string; text: string } {
  const environment = environmentLabel();
  const subject = `[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}] ${environment} health ${result.status} · ${failed.join(', ')}`;

  const lines = [
    `Environment: ${environment}`,
    `Overall status: ${result.status}`,
    `Observed at: ${result.timestamp}`,
    `Failing checks: ${failed.join(', ')}`,
    '',
    'CHECKS',
    ...Object.entries(result.checks).map(
      ([name, check]) => `- ${name}: ${check.status}${checkDetail(check)}`,
    ),
    '',
    severity === 'critical'
      ? 'CRITICAL means the platform cannot serve requests. Follow docs/runbooks/incident-response.md.'
      : 'WARNING means billing is degraded while chat keeps working. Follow docs/runbooks/incident-response.md.',
  ];
  return { subject, text: lines.join('\n') };
}

async function dispatchAlert(
  severity: AlertSeverity,
  result: HealthCheckResult,
  failed: string[],
): Promise<ProbeSummary> {
  const { subject, text } = buildAlert(severity, result, failed);
  const dispatched = await notifyIncident({ key: INCIDENT_KEY, severity, subject, text });

  if (dispatched.paged === 'unconfigured') {
    logger.warn(
      { severity },
      'PAGER_WEBHOOK_URL is unset · this alert reached an inbox and nothing else',
    );
  }

  logger.error(
    {
      severity,
      status: result.status,
      failed,
      paged: dispatched.paged,
      channel: dispatched.channel,
      escalationLevel: dispatched.level,
      notified: dispatched.notified,
    },
    dispatched.delivery === 'delivered'
      ? 'Health probe alert dispatched'
      : 'Health probe alert email failed',
  );

  return {
    status: result.status,
    alerted: true,
    delivery: dispatched.delivery,
    severity,
    paged: dispatched.paged,
    escalationLevel: dispatched.level,
    ...(dispatched.reason ? { reason: dispatched.reason } : {}),
  };
}

async function runHealthChecksWithTimeout(): Promise<HealthCheckResult | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runHealthChecks(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), HEALTH_CHECK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function pageProbeFailure(cause: string): Promise<NextResponse> {
  const summary = await dispatchAlert(
    'critical',
    {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'unhealthy', message: 'not measured' },
        stripe: { status: 'unhealthy', message: 'not measured' },
        environment: { status: 'unhealthy' },
        chat: NOT_MEASURED,
        work: NOT_MEASURED,
        voice: NOT_MEASURED,
        search: NOT_MEASURED,
      },
    },
    [`health-probe (${cause})`],
  );
  return NextResponse.json(
    { ...summary, status: 'probe_failed' satisfies ProbeSummary['status'] },
    { status: 500 },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized health probe cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let result: HealthCheckResult;
  try {
    const raced = await runHealthChecksWithTimeout();
    if (raced === TIMED_OUT) {
      logger.error(
        { timeoutMs: HEALTH_CHECK_TIMEOUT_MS },
        'Health probe timed out running the health checks · a dependency is hanging',
      );
      return await pageProbeFailure(`timed out after ${HEALTH_CHECK_TIMEOUT_MS}ms`);
    }
    result = raced;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Health probe could not run the health checks',
    );
    return await pageProbeFailure('checks threw');
  }

  if (result.status === 'healthy') {
    await recordFailureStreak(true);
    await clearIncident(INCIDENT_KEY);
    return NextResponse.json({
      status: result.status,
      alerted: false,
      delivery: 'not_needed',
    } satisfies ProbeSummary);
  }

  const streak = await recordFailureStreak(false);
  if (streak !== null && streak < CONSECUTIVE_FAILURES_BEFORE_PAGE) {
    logger.warn(
      { status: result.status, streak },
      'Health probe miss did not repeat on the next run yet; holding the page',
    );
    return NextResponse.json({
      status: result.status,
      alerted: false,
      delivery: 'not_needed',
    } satisfies ProbeSummary);
  }

  const severity: AlertSeverity = result.status === 'unhealthy' ? 'critical' : 'warning';
  const summary = await dispatchAlert(severity, result, failingChecks(result));

  return NextResponse.json(summary, { status: summary.delivery === 'delivered' ? 200 : 500 });
}
