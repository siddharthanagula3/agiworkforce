import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { deploymentEnvironment } from '@/lib/config/runtime-environment';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { lowPowerCronSkip } from '@/lib/server/cron-low-power';
import {
  clearIncident,
  notifyIncident,
  type IncidentDispatchResult,
} from '@/lib/server/incident/dispatch';
import type { AlertSeverity } from '@/lib/server/incident/pager';
import {
  ANOMALY_SERIES,
  describeAnomaly,
  evaluateAnomalies,
  type AnomalyAlert,
  type AnomalyEvaluation,
} from '@/lib/server/slo/anomaly';
import { evaluateBurnRates, type BurnRateAlert } from '@/lib/server/slo/attainment';

export const runtime = 'nodejs';

export const maxDuration = 60;

const BURN_RATE_DECIMALS = 1;
const ATTAINMENT_PERCENT = 100;
const ATTAINMENT_DECIMALS = 3;

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
  const environment = deploymentEnvironment();
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
  const environment = deploymentEnvironment();
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

interface AnomalyReport {
  evaluation: 'completed' | 'incomplete';
  detected: number;
  severity?: AlertSeverity;
  paged?: string;
  delivery?: IncidentDispatchResult['delivery'];
  escalationLevel?: number;
  series?: string[];
  failedSeries?: string[];
}

const INCIDENT_SEVERITIES: readonly AlertSeverity[] = ['critical', 'warning'];

async function retireRecoveredIncidents(
  family: 'slo-burn' | 'slo-anomaly',
  active: AlertSeverity | null,
): Promise<void> {
  for (const severity of INCIDENT_SEVERITIES) {
    if (severity !== active) await clearIncident(`${family}:${severity}`);
  }
}

function anomalyReportFailed(report: AnomalyReport): boolean {
  return report.evaluation !== 'completed' || report.delivery === 'undeliverable';
}

/**
 * A deviation from the recent normal never reaches an error budget: every
 * request succeeded, so no objective burns. It is reported as its own incident
 * rather than folded into the burn page, because what an operator does about
 * doubled spend is not what they do about a failing objective.
 */
async function reportAnomalies(): Promise<AnomalyReport> {
  let evaluation: AnomalyEvaluation;
  try {
    evaluation = await evaluateAnomalies();
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Cost and latency anomaly evaluation failed',
    );
    return {
      evaluation: 'incomplete',
      detected: 0,
      failedSeries: ANOMALY_SERIES.map((series) => series.id),
    };
  }

  const { alerts: anomalies, failed } = evaluation;
  const completeness: Pick<AnomalyReport, 'evaluation' | 'failedSeries'> =
    failed.length === 0
      ? { evaluation: 'completed' }
      : { evaluation: 'incomplete', failedSeries: failed.map((entry) => entry.id) };
  if (failed.length > 0) {
    logger.error({ failed }, 'Cost and latency anomaly evaluation could not read every series');
  }

  const severity: AlertSeverity | null =
    anomalies.length === 0
      ? null
      : anomalies.some((anomaly) => anomaly.severity === 'critical')
        ? 'critical'
        : 'warning';
  if (failed.length === 0) await retireRecoveredIncidents('slo-anomaly', severity);
  if (severity === null) return { ...completeness, detected: 0 };

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
    ...completeness,
    detected: anomalies.length,
    severity,
    paged: dispatched.paged,
    delivery: dispatched.delivery,
    escalationLevel: dispatched.level,
    series: anomalies.map((anomaly) => anomaly.id),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized SLO burn-rate cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const lowPower = lowPowerCronSkip();
  if (lowPower) return lowPower;

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
  const anomaliesFailed = anomalyReportFailed(anomalies);

  const severity = alerts.length === 0 ? null : worstSeverity(alerts);
  await retireRecoveredIncidents('slo-burn', severity);
  if (severity === null) {
    return NextResponse.json(
      { burning: 0, paged: 'not_needed', anomalies },
      { status: anomaliesFailed ? 500 : 200 },
    );
  }

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
    { status: dispatched.delivery === 'delivered' && !anomaliesFailed ? 200 : 500 },
  );
}
