import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { REFUND_REQUEST_REASONS } from '@/lib/billing/refund-requests';
import { isAuthGateRefusal, unauthorizedResponseFor } from '@/lib/api-auth-response';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { BILLING_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { readBillingOwnerRow, resolveBillingCustomerId } from '@/lib/server/billing-owner-row';
import { isStripeConfigured } from '@/lib/server/payments/stripe-provider';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import {
  RefundRequestRefusal,
  fileRefundRequest,
  listRefundRequests,
  listRefundableCharges,
} from '@/lib/services/billing-refund-service';

const RefundRequestSchema = z
  .object({
    chargeId: z
      .string()
      .trim()
      .regex(/^(ch|py)_[A-Za-z0-9]{8,}$/, 'chargeId is not a payment id'),
    reason: z.enum(REFUND_REQUEST_REASONS),
    details: z.string().trim().max(2_000).optional(),
  })
  .strict();

async function authorize(request: NextRequest): Promise<UserScopedDb | NextResponse> {
  try {
    return await getUserScopedDb(request, { resolveOrganization: false });
  } catch (authError) {
    if (isAuthGateRefusal(authError)) {
      return unauthorizedResponseFor(authError);
    }
    throw createError.unauthorized('Authentication required');
  }
}

async function handleGetRefundRequests(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-invoices');
  if (rateLimitResponse) return rateLimitResponse;

  const scoped = await authorize(request);
  if (scoped instanceof NextResponse) return scoped;

  const requests = await listRefundRequests(scoped.db, scoped.userId);
  const row = await readBillingOwnerRow(scoped.db, scoped.userId);
  const customerId = await resolveBillingCustomerId(scoped.db, scoped.userId, row);
  if (!isStripeConfigured() || !customerId) return NextResponse.json({ requests, charges: [] });

  try {
    const charges = await listRefundableCharges(scoped.db, scoped.userId, customerId);
    return NextResponse.json({ requests, charges });
  } catch (error) {
    logger.error({ error, userId: scoped.userId }, 'Refundable payments could not be read');
    throw createError
      .serviceUnavailable('Your payments could not be loaded. Please try again.')
      .asUserSafe();
  }
}

async function handleCreateRefundRequest(request: NextRequest) {
  const scoped = await authorize(request);
  if (scoped instanceof NextResponse) return scoped;

  const csrfError = await requireCsrfToken(request, scoped.userId);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(
    request,
    'billing-refund-request',
    `user:${scoped.userId}`,
  );
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = RefundRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Choose a payment and a reason for the refund.');
  }

  if (!isStripeConfigured()) {
    throw createError
      .serviceUnavailable('Refunds are not available in this deployment.')
      .asUserSafe();
  }

  const row = await readBillingOwnerRow(scoped.db, scoped.userId);
  const customerId = await resolveBillingCustomerId(scoped.db, scoped.userId, row);
  if (!customerId) {
    throw createError.notFound('There are no payments on this account to refund.').asUserSafe();
  }

  let result: Awaited<ReturnType<typeof fileRefundRequest>>;
  try {
    result = await fileRefundRequest({
      db: scoped.db,
      userId: scoped.userId,
      customerId,
      subscriptionId: row?.stripe_subscription_id ?? null,
      chargeId: parsed.data.chargeId,
      reason: parsed.data.reason,
      details: parsed.data.details || null,
    });
  } catch (error) {
    if (error instanceof RefundRequestRefusal) {
      if (error.status === 404) throw createError.notFound(error.message).asUserSafe();
      if (error.status === 409) throw createError.conflict(error.message).asUserSafe();
      throw createError.validation(error.message);
    }
    throw error;
  }

  if (result.created) {
    await recordAuditEvent({
      userId: scoped.userId,
      eventType: 'refund_requested',
      request,
      detail: {
        resourceType: 'refund_request',
        resourceId: result.request.id,
        reason: result.request.reason,
        status: result.request.status,
        variant: result.request.assessment,
        source: 'billing',
      },
    });
  }

  return NextResponse.json({ request: result.request }, { status: result.created ? 201 : 200 });
}

export const GET = withErrorHandler(handleGetRefundRequests);
export const POST = withCorsRoute(
  withErrorHandler(handleCreateRefundRequest, {
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.refund-request',
  }),
);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
