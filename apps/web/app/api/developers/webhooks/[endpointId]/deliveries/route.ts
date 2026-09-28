import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { readRouteId } from '@/lib/developer-api/webhook-route-schemas';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { listWebhookDeliveries } from '@/lib/services/developer-webhook-service';

type EndpointContext = { params: Promise<{ endpointId: string }> };

async function handleList(request: NextRequest, context: EndpointContext) {
  const rateLimitResponse = await withRateLimit(request, 'developer-console');
  if (rateLimitResponse) return rateLimitResponse;

  const endpointId = readRouteId(
    (await context.params).endpointId,
    'That endpoint does not exist.',
  );
  const { db, userId } = await getUserScopedDb(request);
  return NextResponse.json({ deliveries: await listWebhookDeliveries(db, userId, endpointId) });
}

export const GET = withErrorHandler(handleList);
