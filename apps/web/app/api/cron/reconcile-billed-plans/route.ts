import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { reconcileBilledPlans } from '@/lib/services/billing-reconciliation';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

export const runtime = 'nodejs';
export const maxDuration = 300;

const REPORTED_DRIFTS = 25;

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

function buildReport(report: Awaited<ReturnType<typeof reconcileBilledPlans>>): {
  subject: string;
  text: string;
  html: string;
} {
  const environment = environmentLabel();
  const percent = (report.divergenceRatio * 100).toFixed(1);
  const text = [
    `Environment: ${environment}`,
    `Observed at: ${report.generatedAt}`,
    `Subscriptions compared: ${report.examined}`,
    `Priced differently from this deployment: ${report.diverged} (${percent}%)`,
    `Could not be read from Stripe: ${report.uncomparable}`,
    '',
    'A plan or amount that differs means an account is entitled on terms the',
    'payment provider is not charging, in one direction or the other. Nothing was',
    'repaired automatically: a price change is a decision, not a fault to heal.',
    '',
    'AFFECTED',
    report.drifts
      .slice(0, REPORTED_DRIFTS)
      .map(
        (drift) =>
          `${drift.stripeSubscriptionId} · user ${drift.userId} · ${drift.fields.join(', ')}` +
          ` · stored ${drift.storedPlanTier ?? 'none'} vs price ${drift.stripePlanTier ?? 'unregistered'}` +
          ` · charged ${drift.stripeUnitAmount ?? 'unknown'} vs listed ${drift.expectedUnitAmount ?? 'unpublished'}`,
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
        fields: report.drifts.flatMap((drift) => drift.fields),
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
      drifts: report.drifts.slice(0, REPORTED_DRIFTS),
    },
    { status: delivery === 'undeliverable' ? 500 : 200 },
  );
}
