import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { requireCsrfToken } from '@/lib/csrf';
import {
  UpdateWebhookSchema,
  WEBHOOK_BODY_MESSAGE,
  readRouteId,
} from '@/lib/developer-api/webhook-route-schemas';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { readValidatedJsonBody } from '@/lib/read-json-body';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import {
  deleteWebhookEndpoint,
  updateWebhookEndpoint,
} from '@/lib/services/developer-webhook-service';

type EndpointContext = { params: Promise<{ endpointId: string }> };

const NOT_FOUND = 'That endpoint does not exist.';

async function handleUpdate(request: NextRequest, context: EndpointContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const endpointId = readRouteId((await context.params).endpointId, NOT_FOUND);
  const { db, userId } = await getUserScopedDb(request);
  const patch = await readValidatedJsonBody(request, UpdateWebhookSchema, WEBHOOK_BODY_MESSAGE);
  const endpoint = await updateWebhookEndpoint(db, userId, endpointId, {
    ...(patch.url === undefined ? {} : { url: patch.url }),
    ...(patch.description === undefined ? {} : { description: patch.description || null }),
    ...(patch.eventTypes === undefined ? {} : { eventTypes: patch.eventTypes }),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
  });

  await recordAuditEvent({
    userId,
    eventType: 'developer_webhook_configured',
    request,
    detail: {
      resourceType: 'developer_webhook',
      resourceId: endpoint.id,
      resourceName: new URL(endpoint.url).host,
      changedKeys: Object.keys(patch).filter(
        (key) => patch[key as keyof typeof patch] !== undefined,
      ),
      enabled: endpoint.enabled,
    },
  });

  return NextResponse.json({ endpoint });
}

async function handleDelete(request: NextRequest, context: EndpointContext) {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const rateLimitResponse = await withRateLimit(request, 'developer-console-write');
  if (rateLimitResponse) return rateLimitResponse;

  const endpointId = readRouteId((await context.params).endpointId, NOT_FOUND);
  const { db, userId } = await getUserScopedDb(request);
  await deleteWebhookEndpoint(db, userId, endpointId);

  await recordAuditEvent({
    userId,
    eventType: 'developer_webhook_deleted',
    request,
    detail: { resourceType: 'developer_webhook', resourceId: endpointId },
  });

  return NextResponse.json({ deleted: true });
}

export const PATCH = withErrorHandler(handleUpdate);
export const DELETE = withErrorHandler(handleDelete);
