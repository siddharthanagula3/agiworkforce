import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError, isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { IDEMPOTENCY_KEY_HEADER } from '@/lib/api-gateway-policy';
import { BILLING_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import { requireManagedStripeSubscription } from '@/features/billing/server/billing-account';
import {
  currentPlanOf,
  keepCurrentPlan,
  readPlanChangeState,
} from '@/features/billing/server/plan-change';

function isoFromSeconds(seconds: number | null): string | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null;
}

async function handleResume(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'upgrade');
  if (rateLimitResponse) return rateLimitResponse;

  const stripe = getStripeClientOrNull();
  if (!stripe) {
    throw createError
      .serviceUnavailable('Billing is unavailable right now. Nothing was changed.')
      .asUserSafe();
  }

  const managed = await requireManagedStripeSubscription(stripe, db, userId);
  const plan = currentPlanOf(managed);
  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? '';

  let subscription: Stripe.Subscription;
  try {
    subscription = await keepCurrentPlan(
      stripe,
      managed.subscription,
      `keep-plan:${userId}:${idempotencyKey}`,
    );
  } catch (error) {
    logger.error({ error, userId }, 'Keeping the current plan failed in Stripe');
    throw createError
      .serviceUnavailable('Your plan could not be resumed. Nothing was changed; please try again.')
      .asUserSafe();
  }

  try {
    await db.execute(
      `update public.subscriptions
          set cancel_at_period_end = $2, canceled_at = $3, updated_at = now()
        where user_id = $1 and stripe_subscription_id = $4`,
      [
        userId,
        subscription.cancel_at_period_end,
        isoFromSeconds(subscription.canceled_at),
        subscription.id,
      ],
    );
  } catch (error) {
    logger.warn(
      { error, userId, subscriptionId: subscription.id },
      'Resumed in Stripe; the stored cancellation flag waits for the subscription webhook',
    );
  }

  await recordAuditEvent({
    userId,
    eventType: 'plan_changed',
    request,
    detail: {
      resourceType: 'subscription',
      resourceId: subscription.id,
      source: 'settings_billing',
      planTier: plan,
      status: 'resumed',
    },
  });

  try {
    return NextResponse.json(await readPlanChangeState(stripe, { ...managed, subscription }));
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error({ error, userId }, 'Reading the resumed plan failed');
    throw createError
      .serviceUnavailable(
        'Your plan was resumed, but its details could not be loaded. Refresh to see them.',
      )
      .asUserSafe();
  }
}

export const POST = withCorsRoute(
  withErrorHandler(handleResume, {
    idempotencyKey: 'required',
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.resume-cancellation',
  }),
);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
