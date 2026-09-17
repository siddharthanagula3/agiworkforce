import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getKeyValueStore } from '@/lib/server/key-value';
import {
  detectRolloutAlerts,
  purgeExpiredRoutingTraces,
  readCohortMetrics,
  recordRolloutBenchmarks,
  resolveRolloutEvaluationConfig,
  type RolloutAlert,
} from '@/lib/services/model-rollout/rollout-evaluation-service';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

import { pageOnCall } from '../health-probe/route';

export const runtime = 'nodejs';

export const maxDuration = 60;

const ALERT_DEDUP_PREFIX = 'agi-rollout:alerted';
const ALERT_DEDUP_TTL_SECONDS = 6 * 60 * 60;
const ALERT_SEVERITY = 'warning';

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function describeAlert(alert: RolloutAlert): string {
  const measure =
    alert.kind === 'quality'
      ? `failure rate ${(alert.candidateValue * 100).toFixed(1)}% vs ${(alert.controlValue * 100).toFixed(1)}%`
      : alert.kind === 'latency'
        ? `median latency ${Math.round(alert.candidateValue)} ms vs ${Math.round(alert.controlValue)} ms`
        : `cost per request ${Math.round(alert.candidateValue)} vs ${Math.round(alert.controlValue)} microUSD`;
  return `- ${alert.kind} on slot ${alert.slotId}: ${alert.cohort} ${alert.candidateModelKey} against control ${alert.controlModelKey}, ${measure} over ${alert.samples} requests`;
}

async function claimNewAlerts(alerts: readonly RolloutAlert[]): Promise<RolloutAlert[]> {
  const store = getKeyValueStore();
  if (!store) return [...alerts];
  const fresh: RolloutAlert[] = [];
  for (const alert of alerts) {
    const key = `${ALERT_DEDUP_PREFIX}:${alert.slotId}:${alert.cohort}:${alert.candidateModelKey}:${alert.kind}`;
    try {
      const claimed = await store.set(key, Date.now(), {
        onlyIfAbsent: true,
        ttlSeconds: ALERT_DEDUP_TTL_SECONDS,
      });
      if (claimed) fresh.push(alert);
    } catch (error) {
      logger.warn({ error, key }, '[model-rollout] alert dedup unavailable; paging anyway');
      fresh.push(alert);
    }
  }
  return fresh;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized model rollout cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = resolveRolloutEvaluationConfig();
  const nowMs = Date.now();
  const windowEnd = new Date(Math.floor(nowMs / config.windowMs) * config.windowMs);
  const windowStart = new Date(windowEnd.getTime() - config.windowMs);

  let alerts: RolloutAlert[];
  let benchmarks: number;
  let purged: number;
  try {
    const metrics = await readCohortMetrics(windowStart, windowEnd);
    benchmarks = await recordRolloutBenchmarks(metrics, windowStart, windowEnd);
    alerts = detectRolloutAlerts(metrics, config);
    purged = await purgeExpiredRoutingTraces(config, nowMs);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Model rollout cron could not evaluate cohorts',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const fresh = await claimNewAlerts(alerts);
  if (fresh.length === 0) {
    return NextResponse.json({ benchmarks, purged, alerts: alerts.length, paged: 'not_needed' });
  }

  const environment = environmentLabel();
  const subject = `[AGI WARNING] ${environment} model rollout regression · ${[...new Set(fresh.map((alert) => alert.kind))].join(', ')}`;
  const text = [
    `Environment: ${environment}`,
    `Window: ${windowStart.toISOString()} to ${windowEnd.toISOString()}`,
    '',
    'ROLLOUT COHORT ALERTS',
    ...fresh.map(describeAlert),
    '',
    'A canary is pulled by engaging the kill switch on its routing.canary flag in the operator console; a shadow stops with routing.shadow.',
  ].join('\n');

  const [paged, sent] = await Promise.all([
    pageOnCall(ALERT_SEVERITY, subject, text),
    sendSupportEmail({
      to: getHandoffConfig().fallbackEmail,
      subject,
      text,
      html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    }),
  ]);
  logger.warn(
    { alerts: fresh.length, paged, emailed: sent.delivered },
    'Model rollout cohort alert dispatched',
  );

  return NextResponse.json({
    benchmarks,
    purged,
    alerts: alerts.length,
    paged,
    emailed: sent.delivered,
  });
}
