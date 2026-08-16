import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { CreditService, type CreditSettlementQueueSummary } from '@/lib/services/credit-service';
import { deliverDueVideoIncidentAlerts } from '@/lib/services/video-incident-alert-service';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

interface ReconcileSummary {
  processed: number;
  succeeded: number;
  pending: number;
  terminal: number;
  alerted: boolean;
  delivery: 'not_needed' | 'delivered' | 'undeliverable';
  reason?: string;
}

function environmentLabel(): string {
  return process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

function buildDriftAlert(summary: {
  processed: number;
  succeeded: number;
  pending: number;
  terminal: number;
}): { subject: string; text: string; html: string } {
  const environment = environmentLabel();
  const text = [
    `Environment: ${environment}`,
    `Observed at: ${new Date().toISOString()}`,
    `Terminal settlements this run: ${summary.terminal}`,
    `Processed: ${summary.processed} · succeeded: ${summary.succeeded} · still pending: ${summary.pending}`,
    '',
    'A terminal credit settlement is usage that was served and will never be',
    'debited. Balances are now higher than consumption for the affected accounts.',
    '',
    'NEXT STEP',
    "select id, user_id, amount_cents, last_error_code, last_error, completed_at\n  from credit_settlement_jobs\n where status = 'terminal'\n order by completed_at desc limit 50;",
    '',
    'Follow docs/runbooks/incident-response.md.',
  ].join('\n');

  return {
    subject: `[AGI WARNING] ${environment} credit settlement drift · ${summary.terminal} terminal`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized credit settlement cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let summary: CreditSettlementQueueSummary | null = null;
  let creditError: unknown;
  try {
    summary = await CreditService.processPendingSettlements(100);
  } catch (error) {
    creditError = error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Credit settlement recovery cron failed',
    );
  }

  let videoAlertFailure:
    | 'video_incident_alert_pending'
    | 'video_incident_alert_exhausted'
    | 'video_incident_alert_recovery_failed'
    | null = null;
  try {
    const videoAlerts = await deliverDueVideoIncidentAlerts(getNeonDb(), 20);
    if (videoAlerts.pending > 0 || videoAlerts.exhausted > 0) {
      logger.error(
        { event: 'video_billing_incident_alerts_pending', ...videoAlerts },
        'One or more video billing incident alerts remain undelivered',
      );
      videoAlertFailure =
        videoAlerts.exhausted > 0
          ? 'video_incident_alert_exhausted'
          : 'video_incident_alert_pending';
    }
  } catch (error) {
    logger.error(
      {
        event: 'video_billing_incident_alert_recovery_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Video billing incident alert recovery failed',
    );
    videoAlertFailure = 'video_incident_alert_recovery_failed';
  }

  if (creditError || !summary) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(videoAlertFailure ? { reason: videoAlertFailure } : {}),
      },
      { status: 500 },
    );
  }

  let responseBody: ReconcileSummary;
  let responseStatus = 200;

  if (summary.terminal === 0) {
    responseBody = {
      ...summary,
      alerted: false,
      delivery: 'not_needed',
    };
  } else {
    const { subject, text, html } = buildDriftAlert(summary);
    const sent = await sendSupportEmail({
      to: getHandoffConfig().fallbackEmail,
      subject,
      text,
      html,
    });

    if (sent.delivered) {
      logger.error(
        { event: 'credit_settlement_drift', ...summary },
        'Credit settlement drift alert dispatched',
      );
      responseBody = {
        ...summary,
        alerted: true,
        delivery: 'delivered',
      };
    } else {
      logger.error(
        { event: 'credit_settlement_drift', ...summary, reason: sent.reason },
        'Credit settlement drift alert could NOT be delivered · no human has been told',
      );
      responseBody = {
        ...summary,
        alerted: true,
        delivery: 'undeliverable',
        reason: sent.reason,
      };
      responseStatus = 500;
    }
  }

  if (videoAlertFailure) {
    responseBody.reason ??= videoAlertFailure;
    responseStatus = 500;
  }

  return NextResponse.json(responseBody, { status: responseStatus });
}
