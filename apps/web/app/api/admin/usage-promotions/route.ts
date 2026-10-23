import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { creditsFromMicrousd } from '@agiworkforce/types';
import { z } from 'zod';

import { requirePlatformAdmin } from '@/lib/auth-guards';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  UsageLimitPromotionInputSchema,
  listUsageLimitPromotions,
  promotablePlanTiers,
  upsertUsageLimitPromotion,
  type UsageLimitPromotion,
} from '@/lib/services/usage-limit-promotion-service';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

const PutSchema = z
  .object({
    expectedVersion: z.number().int().min(1).nullable(),
    promotion: UsageLimitPromotionInputSchema,
  })
  .strict();

function present(promotion: UsageLimitPromotion) {
  const { costCeilingMicrousd, committedMicrousd, ...rest } = promotion;
  return {
    ...rest,
    costCeilingCredits: creditsFromMicrousd(costCeilingMicrousd),
    committedCredits: creditsFromMicrousd(committedMicrousd),
  };
}

async function handleList(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  await requirePlatformAdmin(request);

  const promotions = await listUsageLimitPromotions(getNeonDb());
  return NextResponse.json(
    { promotions: promotions.map(present), plans: promotablePlanTiers() },
    { headers: NO_STORE },
  );
}

async function handlePut(request: NextRequest): Promise<Response> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;
  const rateLimitResponse = await withRateLimit(request, 'admin-operator');
  if (rateLimitResponse) return rateLimitResponse;
  const { userId } = await requirePlatformAdmin(request);

  const parsed = PutSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid usage promotion', parsed.error.flatten());
  }
  const { expectedVersion, promotion: input } = parsed.data;
  const saved = await upsertUsageLimitPromotion(getNeonDb(), input, expectedVersion, userId);
  if (!saved) {
    throw createError.conflict(
      expectedVersion === null
        ? `A usage promotion named ${input.id} already exists`
        : 'The promotion changed since it was loaded, or its kind differs. Reload it and try again.',
    );
  }
  await recordAuditEvent({
    userId,
    eventType: 'usage_promotion_changed',
    severity: 'warning',
    request,
    surface: 'operator',
    detail: {
      resourceType: 'usage_promotion',
      resourceId: saved.id,
      status: expectedVersion === null ? 'created' : 'updated',
      enabled: saved.enabled,
      scope: saved.kind,
      version: String(saved.version),
    },
  });
  return NextResponse.json(
    { promotion: present(saved) },
    { status: expectedVersion === null ? 201 : 200, headers: NO_STORE },
  );
}

export const GET = withErrorHandler(handleList);
export const PUT = withErrorHandler(handlePut);
