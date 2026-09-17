import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { buildWorkspaceFeatureGateResponse } from '@/lib/managed-compute-gate';
import { resolveCloudChatSurface } from '@/lib/free-chat-surface-policy';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { createTrigger, listTriggers, type TriggerInput } from '@/lib/triggers/trigger-service';
import { rethrowTriggerError } from '@/lib/triggers/trigger-errors';
import { triggerWebhookPath } from '@/lib/triggers/trigger-endpoints';

export const runtime = 'nodejs';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function integerQueryValue(value: string | null, fallback: number): number {
  if (value === null || !/^-?\d+$/.test(value)) return fallback;
  return Number(value);
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

async function handleListTriggers(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, integerQueryValue(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE)),
  );
  const offset = Math.max(0, integerQueryValue(url.searchParams.get('offset'), 0));
  const triggers = await listTriggers(db, userId, {
    limit,
    offset,
    taskId: url.searchParams.get('taskId'),
  });
  return NextResponse.json({ triggers, pagination: { limit, offset } });
}

async function handleCreateTrigger(request: NextRequest) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const featureGate = await buildWorkspaceFeatureGateResponse(
    userId,
    request,
    'event_triggers',
    resolveCloudChatSurface(request),
  );
  if (featureGate) return featureGate;

  const body = await requestObject(request);
  try {
    const created = await createTrigger(
      db,
      { userId, organizationId: organizationId ?? null },
      body as unknown as TriggerInput,
    );
    await recordAuditEvent({
      userId,
      organizationId: organizationId ?? null,
      eventType: 'event_trigger_created',
      request,
      detail: {
        resourceType: 'event_trigger',
        resourceId: created.trigger.id,
        resourceName: created.trigger.name,
        source: created.trigger.source,
      },
    });
    return NextResponse.json(
      {
        trigger: created.trigger,
        verificationCode: created.verificationCode,
        signingSecret: created.signingSecret,
        webhookPath: triggerWebhookPath(created.trigger),
      },
      { status: 201 },
    );
  } catch (error) {
    rethrowTriggerError(error);
  }
}

export const GET = withErrorHandler(handleListTriggers);
export const POST = withErrorHandler(handleCreateTrigger);
