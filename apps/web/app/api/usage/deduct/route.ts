/**
 * POST /api/usage/deduct
 *
 * Deducts credits from the authenticated user's active billing-period wallet.
 * Called by token-enforcement-service after a successful LLM response.
 *
 * Request body (sent by token-enforcement-service):
 *   { amount_cents, description?, metadata?, idempotency_key? }
 *
 * Response:
 *   { success: true, remaining_cents: number }
 *   or structured error via withErrorHandler
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimitHandler } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { CreditService } from '@/lib/services/credit-service';

const DeductRequestSchema = z.object({
  amount_cents: z.number().int().min(0),
  description: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotency_key: z.string().max(255).optional(),
});

async function handler(request: NextRequest): Promise<NextResponse> {
  // CSRF: validate before any state change
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  // Auth: userId comes only from the verified session, never from the body
  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch {
    throw createError.unauthorized('Authentication required');
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw createError.validation('Invalid JSON in request body');
  }

  const parsed = DeductRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }

  const { amount_cents, description, metadata, idempotency_key } = parsed.data;

  try {
    const result = await CreditService.deductCredits(
      userId,
      amount_cents,
      description,
      metadata,
      idempotency_key,
    );

    if (!result.success) {
      const errorCode = result.code;
      const isInsufficient =
        errorCode === 'INSUFFICIENT_CREDITS' ||
        errorCode === 'DAILY_LIMIT_EXCEEDED' ||
        typeof result.available === 'number';

      if (isInsufficient) {
        throw createError.forbidden(result.error ?? 'Insufficient credits');
      }
      throw createError.internal(result.error ?? 'Credit deduction failed');
    }

    logger.info(
      { userId, amount_cents, remaining: result.remaining_cents },
      '[Usage Deduct] Credits deducted successfully',
    );

    return NextResponse.json({
      success: true,
      remaining_cents: result.remaining_cents ?? 0,
    });
  } catch (error) {
    // Re-throw errors created above; wrap unexpected ones
    if (error !== null && typeof error === 'object' && 'statusCode' in error) {
      throw error;
    }
    logger.error({ error, userId, amount_cents }, '[Usage Deduct] Unexpected error');
    throw createError.internal('Credit deduction failed');
  }
}

export const POST = withErrorHandler(withRateLimitHandler(handler, 'usage-deduct'));
