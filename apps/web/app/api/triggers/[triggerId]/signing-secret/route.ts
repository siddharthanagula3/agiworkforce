import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import type { ManagedCloudEventTriggerSigningSecret } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { rethrowTriggerError } from '@/lib/triggers/trigger-errors';
import { triggerWebhookPath } from '@/lib/triggers/trigger-endpoints';
import { getTrigger, regenerateConnectorTriggerSecret } from '@/lib/triggers/trigger-service';
import { isUuid } from '@/lib/uuid';

export const runtime = 'nodejs';

async function handleRegenerateSigningSecret(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> },
) {
  const { db, userId, organizationId } = await getUserScopedDb(request);
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation', `user:${userId}`);
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const { triggerId } = await context.params;
  if (!isUuid(triggerId)) throw createError.validation('triggerId must be a uuid');

  try {
    const owned = await getTrigger(db, userId, triggerId);
    const { trigger, signingSecret } = await regenerateConnectorTriggerSecret(getNeonDb(), owned);
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
        changedKeys: ['signingSecret'],
      },
    });
    const payload: ManagedCloudEventTriggerSigningSecret = {
      trigger,
      signingSecret,
      webhookPath: triggerWebhookPath(trigger),
    };
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    rethrowTriggerError(error);
  }
}

export const POST = withErrorHandler(handleRegenerateSigningSecret);
