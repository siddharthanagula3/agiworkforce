import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { BILLING_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  cancelTrialFromLink,
  type TrialCancelOutcome,
} from '@/lib/services/trial-reminder-service';

const CancelTrialBody = z.object({ token: z.string().min(1).max(2048) }).strict();

async function handleCancelTrial(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'upgrade');
  if (rateLimitResponse) return rateLimitResponse;

  const body = CancelTrialBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    throw createError.validation('This cancel link is not valid.');
  }

  const stripe = getStripeClientOrNull();
  if (!stripe) {
    throw createError
      .serviceUnavailable('Billing is unavailable right now. Nothing was changed.')
      .asUserSafe();
  }

  let outcome: TrialCancelOutcome;
  try {
    outcome = await cancelTrialFromLink(getNeonDb(), stripe, body.data.token);
  } catch (error) {
    logger.error({ error }, 'Cancelling a trial from its reminder link failed');
    throw createError
      .serviceUnavailable('Your trial could not be cancelled right now. Please try again.')
      .asUserSafe();
  }

  if (outcome.state === 'invalid') {
    throw createError.validation(
      'This cancel link has expired or is not valid. Sign in and cancel from Settings > Billing.',
    );
  }
  if (outcome.state === 'ended') {
    throw createError.conflict(
      'This trial has already ended, so this link can no longer cancel it. Manage your plan in Settings > Billing.',
    );
  }

  if (outcome.changed) {
    await recordAuditEvent({
      userId: outcome.userId,
      eventType: 'plan_changed',
      request,
      detail: {
        resourceType: 'subscription',
        resourceId: outcome.subscriptionId,
        source: 'trial_reminder_link',
        planTier: outcome.planTier,
        status: 'cancel_scheduled',
      },
    });
  }
  return NextResponse.json({ state: outcome.state, plan: outcome.plan, endsAt: outcome.endsAt });
}

export const POST = withErrorHandler(handleCancelTrial, {
  deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
  circuit: 'billing.trial-cancel',
});
