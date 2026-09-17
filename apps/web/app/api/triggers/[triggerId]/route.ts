import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { rethrowTriggerError } from '@/lib/triggers/trigger-errors';
import {
  deleteTrigger,
  getTrigger,
  updateTrigger,
  type TriggerUpdateInput,
} from '@/lib/triggers/trigger-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function triggerIdFrom(value: string): string {
  if (!UUID_RE.test(value)) throw createError.validation('triggerId must be a uuid');
  return value;
}

async function requestObject(request: NextRequest): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw createError.validation('Request body must be an object');
  }
  return value as Record<string, unknown>;
}

async function handleGetTrigger(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const triggerId = triggerIdFrom((await context.params).triggerId);
  try {
    return NextResponse.json({ trigger: await getTrigger(db, userId, triggerId) });
  } catch (error) {
    rethrowTriggerError(error);
  }
}

async function handleUpdateTrigger(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const triggerId = triggerIdFrom((await context.params).triggerId);
  const body = await requestObject(request);
  try {
    const trigger = await updateTrigger(db, userId, triggerId, body as TriggerUpdateInput);
    await recordAuditEvent({
      userId,
      organizationId: organizationId ?? null,
      eventType: 'event_trigger_updated',
      request,
      detail: {
        resourceType: 'event_trigger',
        resourceId: trigger.id,
        resourceName: trigger.name,
        source: trigger.source,
        changedKeys: Object.keys(body),
      },
    });
    return NextResponse.json({ trigger });
  } catch (error) {
    rethrowTriggerError(error);
  }
}

async function handleDeleteTrigger(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const triggerId = triggerIdFrom((await context.params).triggerId);
  try {
    await deleteTrigger(db, userId, triggerId);
    await recordAuditEvent({
      userId,
      organizationId: organizationId ?? null,
      eventType: 'event_trigger_deleted',
      request,
      detail: { resourceType: 'event_trigger', resourceId: triggerId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    rethrowTriggerError(error);
  }
}

export const GET = withErrorHandler(handleGetTrigger);
export const PATCH = withErrorHandler(handleUpdateTrigger);
export const DELETE = withErrorHandler(handleDeleteTrigger);
