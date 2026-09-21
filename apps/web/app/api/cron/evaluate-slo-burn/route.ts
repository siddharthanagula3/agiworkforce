import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { notifyIncident } from '@/lib/server/incident/dispatch';
import type { AlertSeverity } from '@/lib/server/incident/pager';
import { describeAnomaly, evaluateAnomalies, type AnomalyAlert } from '@/lib/server/slo/anomaly';
import { evaluateBurnRates, type BurnRateAlert } from '@/lib/server/slo/attainment';

export const runtime = 'nodejs';

export const maxDuration = 60;

const BURN_RATE_DECIMALS = 1;
const ATTAINMENT_PERCENT = 100;
const ATTAINMENT_DECIMALS = 3;

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function worstSeverity(alerts: readonly BurnRateAlert[]): AlertSeverity {
  return alerts.some((alert) => alert.severity === 'critical') ? 'critical' : 'warning';
}

function describe(alert: BurnRateAlert): string {
  const attainment = (alert.attainment * ATTAINMENT_PERCENT).toFixed(ATTAINMENT_DECIMALS);
  const burn = alert.burnRate.toFixed(BURN_RATE_DECIMALS);
  return `- ${alert.domain} (${alert.id}): ${attainment}% over ${alert.hours}h on ${alert.samples} samples, burning ${burn}x the monthly budget (${alert.window} window, threshold ${alert.threshold}x)`;
}

function buildPage(
  severity: AlertSeverity,
  alerts: readonly BurnRateAlert[],
): { subject: string; text: string } {
  const environment = environmentLabel();
  const domains = [...new Set(alerts.map((alert) => alert.domain))].join(', ');
  return {
    subject: `[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}] ${environment} error budget burning · ${domains}`,
    text: [
      `Environment: ${environment}`,
      '',
      'BURNING SERVICE LEVELS',
      ...alerts.map(describe),
      '',
      'The objectives and how each one is measured are in apps/web/lib/server/slo/catalogue.ts.',
      'Follow docs/runbooks/incident-response.md.',
    ].join('\n'),
  };
}

function buildAnomalyPage(
  severity: AlertSeverity,
  anomalies: readonly AnomalyAlert[],
): { subject: string; text: string } {
  const environment = environmentLabel();
  const series = anomalies.map((anomaly) => anomaly.id).join(', ');
  return {
    subject: `[AGI ${severity === 'critical' ? 'CRITICAL' : 'WARNING'}] ${environment} cost or latency left its baseline · ${series}`,
    text: [
      `Environment: ${environment}`,
      '',
      'SERIES OFF BASELINE',
      ...anomalies.map(describeAnomaly),
      '',
      ...anomalies.map((anomaly) => `${anomaly.id}: ${anomaly.statement}`),
      '',
      'The baselines and thresholds are in apps/web/lib/server/slo/anomaly.ts.',
      'Follow docs/runbooks/incident-response.md.',
    ].join('\n'),
  };
}

/**
 * A deviation from the recent normal never reaches an error budget: every
 * request succeeded, so no objective burns. It is reported as its own incident
 * rather than folded into the burn page, because what an operator does about
 * doubled spend is not what they do about a failing objective.
 */
async function reportAnomalies(): Promise<{
  detected: number;
  severity?: AlertSeverity;
  paged?: string;
  series?: string[];
}> {
  let anomalies: AnomalyAlert[];
  try {
    anomalies = await evaluateAnomalies();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Cost and latency anomaly evaluation failed',
    );
    return { detected: 0 };
  }
  if (anomalies.length === 0) return { detected: 0 };

  const severity: AlertSeverity = anomalies.some((anomaly) => anomaly.severity === 'critical')
    ? 'critical'
    : 'warning';
  const { subject, text } = buildAnomalyPage(severity, anomalies);
  const dispatched = await notifyIncident({
    key: `slo-anomaly:${severity}`,
    severity,
    subject,
    text,
    source: 'slo-anomaly',
  });
  logger.error(
    {
      severity,
      series: anomalies.map((anomaly) => anomaly.id),
      owners: anomalies.map((anomaly) => anomaly.owner?.runbook ?? null),
      paged: dispatched.paged,
      delivery: dispatched.delivery,
    },
    'Cost or latency anomaly alert dispatched',
  );
  return {
    detected: anomalies.length,
    severity,
    paged: dispatched.paged,
    series: anomalies.map((anomaly) => anomaly.id),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized SLO burn-rate cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let alerts: BurnRateAlert[];
  try {
    alerts = await evaluateBurnRates();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'SLO burn-rate evaluation failed',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const anomalies = await reportAnomalies();

  if (alerts.length === 0) {
    return NextResponse.json({ burning: 0, paged: 'not_needed', anomalies });
  }

  const severity = worstSeverity(alerts);
  const { subject, text } = buildPage(severity, alerts);
  const dispatched = await notifyIncident({
    key: `slo-burn:${severity}`,
    severity,
    subject,
    text,
    source: 'slo-burn',
  });

  logger.error(
    {
      severity,
      burning: alerts.map((alert) => alert.id),
      paged: dispatched.paged,
      channel: dispatched.channel,
      escalationLevel: dispatched.level,
      delivery: dispatched.delivery,
    },
    'Error budget burn alert dispatched',
  );

  return NextResponse.json(
    {
      burning: alerts.length,
      anomalies,
      severity,
      paged: dispatched.paged,
      delivery: dispatched.delivery,
      escalationLevel: dispatched.level,
      alerts: alerts.map((alert) => ({
        id: alert.id,
        window: alert.window,
        burnRate: alert.burnRate,
        samples: alert.samples,
      })),
    },
    { status: dispatched.delivery === 'delivered' || dispatched.paged === 'paged' ? 200 : 500 },
  );
}
