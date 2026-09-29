import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudEventTriggerResponse } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { registerGmailWatch } from '@/lib/triggers/gmail-watch';
import { rethrowTriggerError } from '@/lib/triggers/trigger-errors';
import { getTrigger } from '@/lib/triggers/trigger-service';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handleRegisterWatch(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const { triggerId } = await context.params;
  if (!UUID_RE.test(triggerId)) throw createError.validation('triggerId must be a uuid');

  try {
    const current = await getTrigger(db, userId, triggerId);
    if (current.source !== 'gmail') {
      throw createError.validation('Only Gmail triggers are backed by a mailbox watch');
    }
    if (!current.isEnabled) throw createError.validation('Turn this trigger on first');

    const trigger = await registerGmailWatch(getNeonDb(), current, { restart: true });
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
        changedKeys: ['watch'],
      },
    });
    const payload: ManagedCloudEventTriggerResponse = { trigger };
    return NextResponse.json(payload);
  } catch (error) {
    rethrowTriggerError(error);
  }
}

export const POST = withErrorHandler(handleRegisterWatch);
