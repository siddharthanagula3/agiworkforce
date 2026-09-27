import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER } from '@agiworkforce/types';
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
import {
  refreshManagedStripeSubscription,
  requireManagedStripeSubscription,
} from '@/lib/server/stripe-upgrade-subscription';
import {
  currentPlanOf,
  readPlanChangeState,
  scheduleDowngrade,
} from '@/lib/server/stripe-plan-change';

const DowngradeRequestSchema = z
  .object({ plan: z.enum(SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER) })
  .strict();

function requireStripe() {
  const stripe = getStripeClientOrNull();
  if (!stripe) {
    throw createError
      .serviceUnavailable('Billing is unavailable right now. Nothing was changed.')
      .asUserSafe();
  }
  return stripe;
}

async function handleGetPreview(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const stripe = requireStripe();
  const managed = await requireManagedStripeSubscription(stripe, db, userId);

  try {
    return NextResponse.json(await readPlanChangeState(stripe, managed));
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error({ error, userId }, 'Reading plan change options failed');
    throw createError
      .serviceUnavailable('Your plan options could not be loaded. Please try again.')
      .asUserSafe();
  }
}

async function handleScheduleDowngrade(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request, { resolveOrganization: false });
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'upgrade');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = DowngradeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.validation('Choose the plan to switch to.');

  const stripe = requireStripe();
  const managed = await requireManagedStripeSubscription(stripe, db, userId);
  const previousPlan = currentPlanOf(managed);
  const idempotencyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? '';

  try {
    await scheduleDowngrade(
      stripe,
      managed,
      parsed.data.plan,
      `downgrade:${userId}:${parsed.data.plan}:${idempotencyKey}`,
    );
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error({ error, userId, plan: parsed.data.plan }, 'Scheduling a downgrade failed');
    throw createError
      .serviceUnavailable(
        'The plan change could not be scheduled. Nothing was changed; please try again.',
      )
      .asUserSafe();
  }

  await recordAuditEvent({
    userId,
    eventType: 'plan_changed',
    request,
    detail: {
      resourceType: 'subscription',
      resourceId: managed.subscriptionId,
      source: 'settings_billing',
      previousPlanTier: previousPlan,
      planTier: parsed.data.plan,
      status: 'scheduled',
    },
  });

  try {
    const refreshed = await refreshManagedStripeSubscription(stripe, managed);
    return NextResponse.json(await readPlanChangeState(stripe, refreshed));
  } catch (error) {
    if (isAppError(error)) throw error;
    logger.error({ error, userId }, 'Reading the scheduled plan change failed');
    throw createError
      .serviceUnavailable(
        'Your plan change is scheduled, but its details could not be loaded. Refresh to see them.',
      )
      .asUserSafe();
  }
}

export const GET = withErrorHandler(handleGetPreview);

export const POST = withCorsRoute(
  withErrorHandler(handleScheduleDowngrade, {
    idempotencyKey: 'required',
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.downgrade',
  }),
);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
