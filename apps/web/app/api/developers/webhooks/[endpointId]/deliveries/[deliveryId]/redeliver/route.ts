import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { readRouteId } from '@/lib/developer-api/webhook-route-schemas';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { redeliverWebhook } from '@/lib/services/developer-webhook-service';

type DeliveryContext = { params: Promise<{ endpointId: string; deliveryId: string }> };

async function handleRedeliver(request: NextRequest, context: DeliveryContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const params = await context.params;
  const endpointId = readRouteId(params.endpointId, 'That endpoint does not exist.');
  const deliveryId = readRouteId(params.deliveryId, 'That delivery does not exist.');
  const { db, userId } = await getUserScopedDb(request);
  const delivery = await redeliverWebhook(db, userId, endpointId, deliveryId);
  return NextResponse.json({ delivery }, { status: 202 });
}

export const POST = withErrorHandler(handleRedeliver);
