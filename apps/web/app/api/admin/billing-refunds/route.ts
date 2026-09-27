import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { OPERATOR_REFUND_STRIPE_REASONS } from '@/lib/billing/refund-requests';
import { IDEMPOTENCY_KEY_HEADER, assertInboundContract } from '@/lib/api-gateway-policy';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getStripeClientOrNull } from '@/lib/server/stripe-client';
import {
  RefundRequestRefusal,
  declineRefundRequest,
  issueOperatorRefund,
  listPendingRefundRequests,
  lookupAccountBilling,
} from '@/lib/services/billing-refund-service';

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const Note = z.string().trim().min(1).max(1_000);

const OperatorRefundActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('refund'),
      chargeId: z
        .string()
        .trim()
        .regex(/^(ch|py)_[A-Za-z0-9]{8,}$/),
      amountCents: z.number().int().positive().nullable(),
      note: Note,
      stripeReason: z.enum(OPERATOR_REFUND_STRIPE_REASONS),
      requestId: z.string().uuid().nullable(),
      endPlan: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('decline'),
      requestId: z.string().uuid(),
      note: Note,
    })
    .strict(),
]);

function requireStripe() {
  const stripe = getStripeClientOrNull();
  if (!stripe) {
    throw createError
      .serviceUnavailable('Stripe is not configured in this deployment.')
      .asUserSafe();
  }
  return stripe;
}

function rethrowRefusal(error: unknown): never {
  if (error instanceof RefundRequestRefusal) {
    if (error.status === 404) throw createError.notFound(error.message).asUserSafe();
    if (error.status === 409) throw createError.conflict(error.message).asUserSafe();
    throw createError.validation(error.message);
  }
  throw error;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const db = getNeonDb();
  if (!query) {
    return NextResponse.json(
      { pending: await listPendingRefundRequests(db) },
      { headers: NO_STORE },
    );
  }
  if (query.length > 320) throw createError.validation('The lookup is too long.');

  try {
    const account = await lookupAccountBilling(db, requireStripe(), query);
    if (!account) throw createError.notFound('No account matches that lookup.').asUserSafe();
    return NextResponse.json({ account }, { headers: NO_STORE });
  } catch (error) {
    rethrowRefusal(error);
  }
}

async function handlePost(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'admin-security');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId: operatorUserId } = await requirePlatformAdmin(request);

  const parsed = OperatorRefundActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid refund action', parsed.error.flatten());
  }
  const action = parsed.data;
  const db = getNeonDb();
  const auditContext = {
    userId: operatorUserId,
    eventType: 'admin_action' as const,
    severity: 'high' as const,
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    endpoint: '/api/admin/billing-refunds',
  };

  if (action.action === 'decline') {
    try {
      const declined = await declineRefundRequest(db, {
        operatorUserId,
        requestId: action.requestId,
        note: action.note,
      });
      await logSecurityEvent({
        ...auditContext,
        details: {
          action: 'refund_request_declined',
          requestId: declined.id,
          targetUserId: declined.userId,
          chargeId: declined.chargeId,
          reason: action.note,
        },
      });
      return NextResponse.json({ request: declined }, { headers: NO_STORE });
    } catch (error) {
      rethrowRefusal(error);
    }
  }

  assertInboundContract(
    { method: request.method, header: (name) => request.headers.get(name) },
    { idempotencyKey: 'required' },
  );
  try {
    const result = await issueOperatorRefund(db, requireStripe(), {
      operatorUserId,
      chargeId: action.chargeId,
      amountCents: action.amountCents,
      note: action.note,
      stripeReason: action.stripeReason,
      requestId: action.requestId,
      endPlan: action.endPlan,
      idempotencyKey: request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? '',
    });
    await logSecurityEvent({
      ...auditContext,
      details: {
        action: 'charge_refunded',
        chargeId: action.chargeId,
        refundId: result.refundId,
        amountCents: result.amountCents,
        currency: result.currency,
        targetUserId: result.userId,
        requestId: action.requestId,
        planEnded: result.planEnded,
        stripeReason: action.stripeReason,
        reason: action.note,
      },
    });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (error) {
    rethrowRefusal(error);
  }
}

export const GET = withErrorHandler(handleGet);
export const POST = withErrorHandler(handlePost);
