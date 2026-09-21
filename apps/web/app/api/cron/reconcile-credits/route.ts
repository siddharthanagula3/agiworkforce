import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { CreditService, type CreditSettlementQueueSummary } from '@/lib/services/credit-service';
import { deliverDueVideoIncidentAlerts } from '@/lib/services/video-incident-alert-service';
import {
  reconcileStripeSettlement,
  STRIPE_RECONCILIATION_ALERT_RATIO,
  type StripeReconciliationSummary,
} from '@/lib/services/stripe-settlement-reconciliation-service';
import {
  importStripeCogsAdjustments,
  type StripeCogsImportSummary,
} from '@/lib/services/cogs-ledger-service';
import {
  resolveReconciliationOutcome,
  type AlertDelivery,
  type ReconciliationFailure,
} from '@/lib/services/reconciliation-outcome';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * The SQL ceiling, not the default of 100.
 *
 * `process_credit_settlement_queue` clamps to 500 itself; asking for more
 * would be silently ignored.
 *
 * This route is no longer the only caller of
 * `recover_stale_managed_usage_requests`. It runs once a day, which was far
 * too slow to be a reservation's only path back to the user's quota, so
 * `/api/cron/recover-reservations` now owns that cadence at four times an
 * hour. The drain here is the daily backstop that runs alongside Stripe
 * reconciliation, and both are safe to overlap: rows are taken with
 * `for update skip locked` and settlement is idempotent by key.
 */
const SETTLEMENT_DRAIN_BATCH = 500;

interface ReconcileSummary {
  processed: number;
  succeeded: number;
  pending: number;
  terminal: number;
  alerted: boolean;
  delivery: AlertDelivery;
  reason?: ReconciliationFailure;
  deliveryError?: string;
  stripe?: {
    examined: number;
    diverged: number;
    repaired: number;
    unrepaired: number;
    missingInStripe: number;
    alert: boolean;
  };
  cogs?: {
    examined: number;
    feesRecorded: number;
    adjustmentsRecorded: number;
    discountsRecorded: number;
  };
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

function buildStripeDivergenceAlert(summary: StripeReconciliationSummary): {
  subject: string;
  text: string;
  html: string;
} {
  const environment = environmentLabel();
  const percent = (summary.divergenceRatio * 100).toFixed(1);
  const threshold = (STRIPE_RECONCILIATION_ALERT_RATIO * 100).toFixed(1);
  const text = [
    `Environment: ${environment}`,
    `Observed at: ${new Date().toISOString()}`,
    `Subscriptions compared against Stripe: ${summary.examined}`,
    `Diverged: ${summary.diverged} (${percent}%, threshold ${threshold}%)`,
    `Repaired from Stripe: ${summary.repaired} · could not repair: ${summary.unrepaired}`,
    `Unknown to Stripe: ${summary.missingInStripe}`,
    '',
    'Stripe is the authoritative record of subscription state. Divergence above the',
    'threshold means this deployment is entitling accounts on terms Stripe does not',
    'agree with, in one direction or the other.',
    '',
    'AFFECTED',
    summary.drifts
      .slice(0, 25)
      .map(
        (drift) =>
          `${drift.stripeSubscriptionId} · user ${drift.userId} · ${drift.fields.join(', ')}` +
          (drift.repaired
            ? ' · repaired'
            : ` · NOT repaired${drift.repairError ? `: ${drift.repairError}` : ''}`),
      )
      .join('\n'),
    '',
    'Follow docs/runbooks/incident-response.md.',
  ].join('\n');

  return {
    subject: `[AGI WARNING] ${environment} Stripe subscription divergence · ${summary.diverged}/${summary.examined}`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

async function runStripeReconciliation(): Promise<StripeReconciliationSummary | null> {
  const stripe = getStripeClientOrNull();
  if (!stripe) {
    logger.warn('STRIPE_SECRET_KEY is not set; subscription state was not compared against Stripe');
    return null;
  }

  return reconcileStripeSettlement({
    db: getNeonDb(),
    stripe,
  });
}

const COGS_IMPORT_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

async function runCogsImport(): Promise<StripeCogsImportSummary | null> {
  const stripe = getStripeClientOrNull();
  if (!stripe) return null;

  const until = new Date();
  return importStripeCogsAdjustments({
    stripe,
    since: new Date(until.getTime() - COGS_IMPORT_LOOKBACK_MS),
    until,
    db: getNeonDb(),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized credit settlement cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let summary: CreditSettlementQueueSummary | null = null;
  let creditError: unknown;
  try {
    summary = await CreditService.processPendingSettlements(SETTLEMENT_DRAIN_BATCH, getNeonDb());
  } catch (error) {
    creditError = error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Credit settlement recovery cron failed',
    );
  }

  let videoAlertFailure: ReconciliationFailure | null = null;
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

  let stripeSummary: StripeReconciliationSummary | null = null;
  let stripeFailure: ReconciliationFailure | null = null;
  let stripeDivergenceAlertDelivered: boolean | null = null;
  try {
    stripeSummary = await runStripeReconciliation();
  } catch (error) {
    logger.error(
      {
        event: 'stripe_settlement_reconciliation_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Subscription state could not be compared against Stripe',
    );
    stripeFailure = 'stripe_reconciliation_failed';
  }

  let cogsSummary: StripeCogsImportSummary | null = null;
  try {
    cogsSummary = await runCogsImport();
  } catch (error) {
    logger.error(
      {
        event: 'cogs_stripe_import_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Stripe fees, refunds and chargebacks were not imported into the COGS ledger',
    );
    stripeFailure ??= 'cogs_import_failed';
  }

  if (stripeSummary?.alert) {
    const alert = buildStripeDivergenceAlert(stripeSummary);
    const sent = await sendSupportEmail({
      to: getHandoffConfig().fallbackEmail,
      subject: alert.subject,
      text: alert.text,
      html: alert.html,
    });
    logger.error(
      {
        event: 'stripe_subscription_divergence',
        examined: stripeSummary.examined,
        diverged: stripeSummary.diverged,
        repaired: stripeSummary.repaired,
        unrepaired: stripeSummary.unrepaired,
        missingInStripe: stripeSummary.missingInStripe,
        delivered: sent.delivered,
      },
      sent.delivered
        ? 'Stripe subscription divergence alert dispatched'
        : 'Stripe subscription divergence alert could NOT be delivered · no human has been told',
    );
    stripeDivergenceAlertDelivered = sent.delivered;
  }

  let driftAlertDelivered: boolean | null = null;
  let driftAlertError: string | undefined;
  if (summary && !creditError && summary.terminal > 0) {
    const { subject, text, html } = buildDriftAlert(summary);
    const sent = await sendSupportEmail({
      to: getHandoffConfig().fallbackEmail,
      subject,
      text,
      html,
    });
    driftAlertDelivered = sent.delivered;
    if (!sent.delivered) driftAlertError = sent.reason;
    logger.error(
      {
        event: 'credit_settlement_drift',
        ...summary,
        ...(sent.delivered ? {} : { reason: sent.reason }),
      },
      sent.delivered
        ? 'Credit settlement drift alert dispatched'
        : 'Credit settlement drift alert could NOT be delivered · no human has been told',
    );
  }

  const outcome = resolveReconciliationOutcome({
    settlement: creditError ? null : summary,
    settlementFailed: Boolean(creditError),
    driftAlertDelivered,
    videoAlertFailure,
    stripeFailure,
    stripeDivergenceAlertDelivered,
  });

  if (outcome.settlement === null) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        ...(outcome.reason ? { reason: outcome.reason } : {}),
      },
      { status: outcome.status },
    );
  }

  const responseBody: ReconcileSummary = {
    ...outcome.settlement,
    alerted: outcome.alerted,
    delivery: outcome.delivery,
    ...(outcome.reason ? { reason: outcome.reason } : {}),
    ...(driftAlertError ? { deliveryError: driftAlertError } : {}),
  };

  if (stripeSummary) {
    responseBody.stripe = {
      examined: stripeSummary.examined,
      diverged: stripeSummary.diverged,
      repaired: stripeSummary.repaired,
      unrepaired: stripeSummary.unrepaired,
      missingInStripe: stripeSummary.missingInStripe,
      alert: stripeSummary.alert,
    };
  }

  if (cogsSummary) {
    responseBody.cogs = {
      examined: cogsSummary.examined,
      feesRecorded: cogsSummary.feesRecorded,
      adjustmentsRecorded: cogsSummary.adjustmentsRecorded,
      discountsRecorded: cogsSummary.discountsRecorded,
    };
  }

  return NextResponse.json(responseBody, { status: outcome.status });
}
