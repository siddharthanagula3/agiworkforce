import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { requirePlatformAdmin } from '@/lib/auth-guards';
import { createError } from '@/lib/errors';
import { getHandoffConfig, heartbeatIntervalMs } from '@/lib/support/handoff/config';
import {
  clearAvailabilityCache,
  resolveHumanAvailability,
} from '@/lib/support/handoff/presence-service';
import { upsertAgentPresence } from '@/lib/support/handoff/store';
import type { HandoffPresenceState } from '@/lib/support/handoff/types';

const PresenceSchema = z.object({
  status: z.enum(['online', 'offline']),
  displayName: z.string().trim().min(1).max(60),
  maxConcurrentSessions: z.number().int().min(0).max(50).optional(),
});

async function handleSetPresence(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  const { userId } = await requirePlatformAdmin(request);

  const parsed = PresenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid presence payload', parsed.error.flatten());
  }

  const config = getHandoffConfig();
  const row = await upsertAgentPresence({
    agentUserId: userId,
    displayName: parsed.data.displayName,
    status: parsed.data.status,
    maxConcurrentSessions: parsed.data.maxConcurrentSessions ?? 3,
  });
  if (!row) throw createError.internal('Could not update presence');

  clearAvailabilityCache();

  const heartbeat = heartbeatIntervalMs(config);
  const state: HandoffPresenceState = {
    agentUserId: row.agent_user_id,
    displayName: row.display_name,
    status: row.status,
    maxConcurrentSessions: row.max_concurrent_sessions,
    lastHeartbeatAt: row.last_heartbeat_at,
    expiresAt: row.last_heartbeat_at
      ? new Date(
          new Date(row.last_heartbeat_at).getTime() + config.heartbeatTtlSeconds * 1000,
        ).toISOString()
      : null,
    heartbeatIntervalMs: heartbeat,
  };

  if (!config.liveHandoffEnabled) {
    return NextResponse.json({
      presence: state,
      warning:
        'AGI_SUPPORT_LIVE_HANDOFF_ENABLED is not set, so live handoff stays off and users will not be offered live chat.',
    });
  }

  return NextResponse.json({ presence: state });
}

async function handleReadPresence(request: NextRequest) {
  const limited = await withRateLimit(request, 'support-handoff-agent');
  if (limited) return limited;

  await requirePlatformAdmin(request);
  const availability = await resolveHumanAvailability({ skipCache: true });
  return NextResponse.json({ availability }, { headers: { 'cache-control': 'no-store' } });
}

export const POST = withErrorHandler(handleSetPresence);
export const GET = withErrorHandler(handleReadPresence);
