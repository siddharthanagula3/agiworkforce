import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { UsageLimitResetRequest, UsageLimitResetResponse } from '@agiworkforce/types';
import { z } from 'zod';

import { IDEMPOTENCY_KEY_HEADER } from '@/lib/api-gateway-policy';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { SETTINGS_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  applyUsageLimitReset,
  isApplyKey,
  readAccountLimitCaps,
  type ApplyResetRefusal,
} from '@/lib/services/usage-limit-promotion-service';

export const runtime = 'nodejs';

const PERSONAL_SCOPE = { resolveOrganization: false } as const;

const ApplySchema = z.object({ grantId: z.string().uuid().nullable().default(null) }).strict();

const REFUSAL_MESSAGES: Readonly<Record<ApplyResetRefusal, string>> = {
  promotions_off: 'You have no reset to use.',
  no_reset: 'You have no reset to use.',
  not_near_limit: 'A reset can be used once you are close to a limit.',
  ceiling_reached: 'Resets are not available right now. Try again later.',
  uncapped: 'Your plan has no 5-hour or weekly limit to reset.',
};

async function handlePost(request: NextRequest): Promise<NextResponse | Response> {
  const { db, userId } = await getUserScopedDb(request, PERSONAL_SCOPE);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'usage-limit-reset-apply');
  if (rateLimitResponse) return rateLimitResponse;

  const applyKey = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim() ?? null;
  if (!isApplyKey(applyKey)) {
    throw createError.validation(`Send an ${IDEMPOTENCY_KEY_HEADER} header to use a reset.`);
  }
  const body: UsageLimitResetRequest = await readValidatedJsonBody(
    request,
    ApplySchema,
    'Choose a reset to use.',
  );
  const { planTier, caps } = await readAccountLimitCaps(db, userId);
  const outcome = await applyUsageLimitReset(getNeonDb(), {
    userId,
    planTier,
    applyKey,
    grantId: body.grantId,
    caps,
  });

  if (outcome.status === 'refused') {
    throw createError.conflict(REFUSAL_MESSAGES[outcome.reason]);
  }
  if (outcome.status === 'applied') {
    await recordAuditEvent({
      userId,
      eventType: 'usage_limit_reset_applied',
      request,
      detail: {
        resourceType: 'usage_limit_reset',
        resourceId: outcome.grantId,
        source: outcome.promotionId,
        planTier,
        count: Math.round(outcome.refreshedCredits),
      },
    });
  }

  const payload: UsageLimitResetResponse = {
    status: outcome.status,
    grant_id: outcome.grantId,
    applied_at: outcome.appliedAt,
  };
  return NextResponse.json(payload);
}

export const POST = withCorsRoute(
  withErrorHandler(handlePost, {
    deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
    circuit: 'usage.limit-resets',
    idempotencyKey: 'required',
  }),
);

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
