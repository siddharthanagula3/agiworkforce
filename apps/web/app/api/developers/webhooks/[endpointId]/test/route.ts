import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import { readRouteId } from '@/lib/developer-api/webhook-route-schemas';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { sendWebhookTestEvent } from '@/lib/services/developer-webhook-service';

type EndpointContext = { params: Promise<{ endpointId: string }> };

async function handleTest(request: NextRequest, context: EndpointContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const endpointId = readRouteId(
    (await context.params).endpointId,
    'That endpoint does not exist.',
  );
  const { db, userId } = await getUserScopedDb(request);
  const delivery = await sendWebhookTestEvent(db, userId, endpointId);
  return NextResponse.json({ delivery }, { status: 202 });
}

export const POST = withErrorHandler(handleTest);
