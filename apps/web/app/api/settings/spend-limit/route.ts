import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { creditsFromCents } from '@agiworkforce/types';

import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { SETTINGS_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  deletePersonalSpendLimit,
  readPersonalSpendState,
  upsertPersonalSpendLimit,
  type PersonalSpendState,
} from '@/lib/services/spend-limit-service';

export const runtime = 'nodejs';

const MAX_MONTHLY_CAP_CENTS = 100_000_000;
const PERSONAL_SCOPE = { resolveOrganization: false } as const;

const PutSchema = z
  .object({
    monthlyCapCredits: z.number().int().min(1).max(creditsFromCents(MAX_MONTHLY_CAP_CENTS)),
  })
  .strict();

export interface PersonalSpendLimitResponse {
  state: PersonalSpendState;
}

async function handleGet(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'billing-payment-methods');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, PERSONAL_SCOPE);
  const payload: PersonalSpendLimitResponse = { state: await readPersonalSpendState(db, userId) };
  return NextResponse.json(payload);
}

async function handlePut(request: NextRequest): Promise<NextResponse | Response> {
  const { db, userId } = await getUserScopedDb(request, PERSONAL_SCOPE);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-spend-limit-write');
  if (rateLimitResponse) return rateLimitResponse;

  const body = await readValidatedJsonBody(
    request,
    PutSchema,
    `Enter a whole number of credits up to ${creditsFromCents(MAX_MONTHLY_CAP_CENTS).toLocaleString('en-US')}.`,
  );
  await upsertPersonalSpendLimit(db, userId, body.monthlyCapCredits);
  await recordAuditEvent({
    userId,
    eventType: 'spend_limit_changed',
    request,
    detail: {
      resourceType: 'spend_limit',
      source: 'settings',
      enabled: true,
      count: body.monthlyCapCredits,
    },
  });

  const payload: PersonalSpendLimitResponse = { state: await readPersonalSpendState(db, userId) };
  return NextResponse.json(payload);
}

async function handleDelete(request: NextRequest): Promise<NextResponse | Response> {
  const { db, userId } = await getUserScopedDb(request, PERSONAL_SCOPE);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'settings-spend-limit-write');
  if (rateLimitResponse) return rateLimitResponse;

  await deletePersonalSpendLimit(db, userId);
  await recordAuditEvent({
    userId,
    eventType: 'spend_limit_changed',
    request,
    detail: { resourceType: 'spend_limit', source: 'settings', enabled: false },
  });

  const payload: PersonalSpendLimitResponse = { state: await readPersonalSpendState(db, userId) };
  return NextResponse.json(payload);
}

const GATEWAY_POLICY = {
  deadlineMs: SETTINGS_API_ROUTE_DEADLINE_MS,
  circuit: 'settings.spend-limit',
} as const;

export const GET = withCorsRoute(withErrorHandler(handleGet, GATEWAY_POLICY));
export const PUT = withCorsRoute(
  withErrorHandler(handlePut, { ...GATEWAY_POLICY, idempotencyKey: 'optional' }),
);
export const DELETE = withCorsRoute(withErrorHandler(handleDelete, GATEWAY_POLICY));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
