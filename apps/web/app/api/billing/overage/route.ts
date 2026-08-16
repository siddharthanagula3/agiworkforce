import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { recordAuditEvent } from '@/lib/security-audit';

const OverageRequestSchema = z.object({ enabled: z.boolean() }).strict();

interface OverageRow {
  overage_enabled: boolean;
  available_cents: number | string | null;
}

const SELECT_OVERAGE = `
  select
    subscription.overage_enabled,
    coalesce((
      select greatest(least(
               credits.credits_allocated_cents - credits.credits_used_cents,
               credits.top_up_allocated_cents
             ), 0)::integer
        from public.token_credits credits
       where credits.user_id = subscription.user_id
         and credits.period_end > now()
       order by credits.period_end desc
       limit 1
    ), 0) as available_cents
  from public.subscriptions subscription
  where subscription.user_id = $1
  limit 1`;

function toResponse(row: OverageRow | undefined) {
  const available = Number(row?.available_cents ?? 0);
  return NextResponse.json({
    enabled: row?.overage_enabled === true,
    available_cents: Number.isFinite(available) && available > 0 ? Math.floor(available) : 0,
  });
}

async function handleGetOverage(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'billing-payment-methods');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const rows = await getNeonDb().query<OverageRow>(SELECT_OVERAGE, [userId]);
  return toResponse(rows[0]);
}

async function handlePutOverage(request: NextRequest) {
  const { userId } = await getClerkAuthUser(request);
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'billing-payment-methods');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = OverageRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Send { "enabled": true } or { "enabled": false }.');
  }

  const db = getNeonDb();
  const updated = await db.query<OverageRow>(
    `update public.subscriptions
        set overage_enabled = $2, updated_at = now()
      where user_id = $1
      returning overage_enabled, 0 as available_cents`,
    [userId, parsed.data.enabled],
  );
  if (updated.length === 0) {
    throw createError.validation(
      'Overage applies to an active plan. Start a plan before enabling it.',
    );
  }

  await recordAuditEvent({
    userId,
    eventType: 'plan_changed',
    request,
    detail: {
      resourceType: 'billing_overage',
      resourceName: parsed.data.enabled ? 'enabled' : 'disabled',
    },
  });
  logger.info({ userId, enabled: parsed.data.enabled }, 'Overage preference updated');

  const rows = await db.query<OverageRow>(SELECT_OVERAGE, [userId]);
  return toResponse(rows[0]);
}

export const GET = withErrorHandler(handleGetOverage);
export const PUT = withErrorHandler(handlePutOverage);

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) || new NextResponse(null, { status: 204 });
}
