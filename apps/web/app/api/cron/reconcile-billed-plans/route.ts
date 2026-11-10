import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { deploymentEnvironment } from '@/lib/config/runtime-environment';
import { escapeHtml } from '@/lib/html-escape';
import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  reconcileBilledPlans,
  requeueSubscriptionsForReview,
} from '@/lib/services/billing-reconciliation';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

function buildReport(report: Awaited<ReturnType<typeof reconcileBilledPlans>>): {
  subject: string;
  text: string;
  html: string;
} {
  const environment = deploymentEnvironment();
  const percent = (report.divergenceRatio * 100).toFixed(1);
  const text = [
    `Environment: ${environment}`,
    `Observed at: ${report.generatedAt}`,
    `Subscriptions compared: ${report.examined}`,
    `Priced differently from this deployment: ${report.diverged} (${percent}%)`,
    `Could not be read from Stripe: ${report.uncomparable}`,
    `Compared only in part: ${report.incomplete.length}`,
    '',
    'A plan or amount that differs means an account is entitled on terms the',
    'payment provider is not charging, in one direction or the other. Nothing was',
    'repaired automatically: a price change is a decision, not a fault to heal.',
    '',
    'AFFECTED',
    report.drifts
      .flatMap((drift) =>
        drift.lines.map(
          (line) =>
            `${drift.stripeSubscriptionId} · user ${drift.userId} · ${line.fields.join(', ')}` +
            ` · price ${line.priceId ?? 'none'}` +
            ` · stored ${drift.storedPlanTier ?? 'none'} vs price ${line.stripePlanTier ?? 'unregistered'}` +
            ` · charged ${line.stripeUnitAmount ?? 'unknown'} vs listed ${line.expectedUnitAmount ?? 'unpublished'}`,
        ),
      )
      .join('\n'),
    '',
    'COMPARED ONLY IN PART',
    report.incomplete
      .map(
        (entry) =>
          `${entry.stripeSubscriptionId} · user ${entry.userId} · not compared: ${entry.gaps.join(', ')}`,
      )
      .join('\n'),
    '',
    'Follow docs/runbooks/incident-response.md.',
  ].join('\n');

  return {
    subject: `[AGI WARNING] ${environment} billed plan divergence · ${report.diverged}/${report.examined}`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized billed plan reconciliation request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripeClientOrNull();
  if (!stripe) {
    logger.warn('STRIPE_SECRET_KEY is not set; billed plans were not compared against Stripe');
    return NextResponse.json({ examined: 0, diverged: 0, reason: 'stripe_not_configured' });
  }

  let report: Awaited<ReturnType<typeof reconcileBilledPlans>>;
  try {
    report = await reconcileBilledPlans({ db: getNeonDb(), stripe });
  } catch (error) {
    logger.error(
      {
        event: 'billed_plan_reconciliation_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Billed plans could not be compared against Stripe',
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  if (report.diverged > 0) {
    logger.error(
      {
        event: 'billed_plan_divergence',
        examined: report.examined,
        diverged: report.diverged,
        incomplete: report.incomplete.length,
        fields: report.drifts.flatMap((drift) => drift.fields),
        drifts: report.drifts.map((drift) => ({
          stripeSubscriptionId: drift.stripeSubscriptionId,
          userId: drift.userId,
          lines: drift.lines,
        })),
      },
      'Billed plan divergence detected',
    );
  }

  let delivery: 'not_needed' | 'delivered' | 'undeliverable' = 'not_needed';
  if (report.alert) {
    const { subject, text, html } = buildReport(report);
    const sent = await sendSupportEmail({
      to: getHandoffConfig().fallbackEmail,
      subject,
      text,
      html,
    });
    delivery = sent.delivered ? 'delivered' : 'undeliverable';
    if (!sent.delivered) {
      logger.error(
        { event: 'billed_plan_divergence', reason: sent.reason },
        'Billed plan divergence report could NOT be delivered · no human has been told',
      );
      try {
        await requeueSubscriptionsForReview(
          getNeonDb(),
          report.drifts.map((drift) => drift.stripeSubscriptionId),
        );
      } catch (error) {
        logger.error(
          {
            event: 'billed_plan_requeue_failed',
            error: error instanceof Error ? error.message : String(error),
          },
          'Subscriptions in an undelivered billed plan report could not be queued for review again',
        );
      }
    }
  }

  return NextResponse.json(
    {
      generatedAt: report.generatedAt,
      examined: report.examined,
      diverged: report.diverged,
      uncomparable: report.uncomparable,
      alert: report.alert,
      delivery,
      drifts: report.drifts,
      incomplete: report.incomplete,
    },
    { status: delivery === 'undeliverable' ? 500 : 200 },
  );
}
