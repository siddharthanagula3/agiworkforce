import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import {
  CreateWebhookSchema,
  WEBHOOK_BODY_MESSAGE,
} from '@/lib/developer-api/webhook-route-schemas';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
} from '@/lib/services/developer-webhook-service';

async function handleList(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'developer-console');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  return NextResponse.json({ endpoints: await listWebhookEndpoints(db, userId) });
}

async function handleCreate(request: NextRequest) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request);
  const body = await readValidatedJsonBody(request, CreateWebhookSchema, WEBHOOK_BODY_MESSAGE);
  const { endpoint, secret } = await createWebhookEndpoint(db, userId, {
    url: body.url,
    description: body.description || null,
    eventTypes: body.eventTypes,
  });

  await recordAuditEvent({
    userId,
    eventType: 'developer_webhook_configured',
    request,
    detail: {
      resourceType: 'developer_webhook',
      resourceId: endpoint.id,
      resourceName: new URL(endpoint.url).host,
      changedKeys: ['url', 'eventTypes'],
    },
  });

  return NextResponse.json({ endpoint, secret }, { status: 201 });
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
