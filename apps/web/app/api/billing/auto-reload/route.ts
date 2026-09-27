import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import {
  AUTO_RELOAD_MAX_THRESHOLD_CREDITS,
  AUTO_RELOAD_MIN_THRESHOLD_CREDITS,
  MAX_TOP_UP_AMOUNT_USD,
  MIN_TOP_UP_AMOUNT_USD,
  formatCredits,
  isValidAutoReloadSettingsUpdate,
  type AutoReloadSettingsUpdate,
} from '@agiworkforce/types';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { BILLING_API_ROUTE_DEADLINE_MS } from '@/lib/deadline-policy';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { readAutoReloadSettings, saveAutoReloadSettings } from '@/lib/services/auto-reload-service';

const AUTO_RELOAD_SCOPE = { resolveOrganization: false } as const;
const PAYMENT_METHOD_REQUIRED_CODE = 'payment_method_required';

async function handleGetAutoReload(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request, AUTO_RELOAD_SCOPE);

  const rateLimitResponse = await withRateLimit(request, 'billing-payment-methods');
  if (rateLimitResponse) return rateLimitResponse;

  return NextResponse.json(await readAutoReloadSettings(db, userId));
}

async function handlePutAutoReload(request: NextRequest): Promise<NextResponse> {
  const { db, userId } = await getUserScopedDb(request, AUTO_RELOAD_SCOPE);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'checkout');
  if (rateLimitResponse) return rateLimitResponse;

  const body: unknown = await request.json().catch(() => null);
  if (!isValidAutoReloadSettingsUpdate(body)) {
    throw createError.validation(
      `Choose a threshold from ${formatCredits(AUTO_RELOAD_MIN_THRESHOLD_CREDITS)} to ` +
        `${formatCredits(AUTO_RELOAD_MAX_THRESHOLD_CREDITS)} and a whole-dollar amount from ` +
        `$${MIN_TOP_UP_AMOUNT_USD.toLocaleString('en-US')} to $${MAX_TOP_UP_AMOUNT_USD.toLocaleString('en-US')}.`,
    );
  }
  const update: AutoReloadSettingsUpdate = {
    enabled: body.enabled,
    thresholdCredits: body.thresholdCredits,
    amountUsd: body.amountUsd,
  };

  const result = await saveAutoReloadSettings(db, userId, update);
  if (result.status === 'payment_method_required') {
    return NextResponse.json(
      {
        error: {
          code: PAYMENT_METHOD_REQUIRED_CODE,
          message: 'Add a card in Settings > Billing before turning on auto-reload.',
        },
      },
      { status: 409 },
    );
  }

  await recordAuditEvent({
    userId,
    eventType: 'auto_reload_changed',
    request,
    detail: {
      resourceType: 'auto_reload',
      source: 'settings',
      enabled: update.enabled,
      count: update.thresholdCredits,
      resourceName: `$${update.amountUsd}`,
    },
  });

  return NextResponse.json(result.settings);
}

export const GET = withCorsRoute(
  withErrorHandler(handleGetAutoReload, {
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.auto-reload',
  }),
);

export const PUT = withCorsRoute(
  withErrorHandler(handlePutAutoReload, {
    idempotencyKey: 'optional',
    deadlineMs: BILLING_API_ROUTE_DEADLINE_MS,
    circuit: 'billing.auto-reload',
  }),
);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
