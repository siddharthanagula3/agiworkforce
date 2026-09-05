import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { runHealthChecks, type HealthCheckResult } from '@/lib/server/health-check';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

export const runtime = 'nodejs';

export const maxDuration = 30;

const HEALTH_CHECK_TIMEOUT_MS = 8_000;
const PAGER_TIMEOUT_MS = 5_000;
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

export type AlertSeverity = 'critical' | 'warning';

interface ProbeSummary {
  status: HealthCheckResult['status'] | 'probe_failed';
  alerted: boolean;
  delivery: 'not_needed' | 'delivered' | 'undeliverable';
  severity?: AlertSeverity;
  reason?: string;
  paged?: 'paged' | 'unconfigured' | 'failed';
}

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function failingChecks(result: HealthCheckResult): string[] {
  return Object.entries(result.checks)
    .filter(([, check]) => check.status !== 'healthy')
    .map(([name]) => name);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
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
): { subject: string; text: string; html: string } {
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
  const text = lines.join('\n');

  return {
    subject,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

/**
 * Posts the alert to a pager webhook when one is configured. Email alone waits
 * for someone to read it; a health probe firing at 06:15 needs to wake a
 * person. Best-effort by design, a pager that is down must not stop the email
 * from going out, so this never throws.
 */
export async function pageOnCall(
  severity: AlertSeverity,
  subject: string,
  text: string,
): Promise<'paged' | 'unconfigured' | 'failed'> {
  const webhook = process.env['PAGER_WEBHOOK_URL'];
  if (!webhook) return 'unconfigured';

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ severity, subject, text, source: 'health-probe' }),
      signal: AbortSignal.timeout(PAGER_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.error({ severity, status: response.status }, 'Pager webhook rejected the alert');
      return 'failed';
    }
    return 'paged';
  } catch (error) {
    logger.error({ severity, error }, 'Pager webhook could not be reached');
    return 'failed';
  }
}

async function dispatchAlert(
  severity: AlertSeverity,
  result: HealthCheckResult,
  failed: string[],
): Promise<ProbeSummary> {
  const { subject, text, html } = buildAlert(severity, result, failed);
  const [sent, paged] = await Promise.all([
    sendSupportEmail({
      to: getHandoffConfig().fallbackEmail,
      subject,
      text,
      html,
    }),
    pageOnCall(severity, subject, text),
  ]);

  if (paged === 'unconfigured') {
    logger.warn(
      { severity },
      'PAGER_WEBHOOK_URL is unset · this alert reached an inbox and nothing else',
    );
  }

  if (sent.delivered) {
    logger.error(
      { severity, status: result.status, failed, paged },
      'Health probe alert dispatched',
    );
    return { status: result.status, alerted: true, delivery: 'delivered', severity, paged };
  }

  logger.error(
    { severity, status: result.status, failed, reason: sent.reason, paged },
    paged === 'paged'
      ? 'Health probe alert email failed · the pager was reached'
      : 'Health probe alert could NOT be delivered · no human has been told',
  );
  return {
    status: result.status,
    alerted: true,
    delivery: 'undeliverable',
    severity,
    reason: sent.reason,
    paged,
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
