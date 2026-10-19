import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import {
  USAGE_RESET_REMINDER_MAX_AHEAD_MS,
  UsageResetReminderRequestSchema,
  type UsageResetReminderResponse,
} from '@agiworkforce/cloud-contracts';
import { handleCorsPreflightRequest, withCorsRoute } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getKeyValueStore } from '@/lib/server/key-value';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { usageResetReminderWorkflow } from '@/lib/workflows/usage-reset-reminder-workflow';

function reminderKey(userId: string, resetAt: string): string {
  return `usage-reset-reminder:${userId}:${resetAt}`;
}

async function claimReminder(
  userId: string,
  resetAt: string,
  ttlSeconds: number,
): Promise<boolean> {
  const store = getKeyValueStore();
  if (!store) return true;
  return store.set(reminderKey(userId, resetAt), 1, { ttlSeconds, onlyIfAbsent: true });
}

async function releaseReminder(userId: string, resetAt: string): Promise<void> {
  await getKeyValueStore()?.delete(reminderKey(userId, resetAt));
}

async function handleRemind(request: NextRequest): Promise<NextResponse> {
  const { userId } = await getUserScopedDb(request);

  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'usage-reset-reminder');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = UsageResetReminderRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw createError.validation('A reset time is required.');
  const resetAt = new Date(parsed.data.resetAt).toISOString();
  const aheadMs = Date.parse(resetAt) - Date.now();
  if (aheadMs <= 0 || aheadMs > USAGE_RESET_REMINDER_MAX_AHEAD_MS) {
    throw createError.validation(
      'That reset time has passed or is too far away to remind you about.',
    );
  }

  const ttlSeconds = Math.ceil(aheadMs / 1000) + 60;
  if (await claimReminder(userId, resetAt, ttlSeconds)) {
    try {
      await start(usageResetReminderWorkflow, [{ userId, resetAt }]);
    } catch (error) {
      await releaseReminder(userId, resetAt);
      logger.error({ error, userId }, '[usage-reset-reminder] the reminder could not be scheduled');
      throw createError
        .serviceUnavailable('The reminder could not be set right now. Try again in a minute.')
        .asUserSafe();
    }
  }

  return NextResponse.json({ remindAt: resetAt } satisfies UsageResetReminderResponse);
}

export const POST = withCorsRoute(withErrorHandler(handleRemind));

export function OPTIONS(request: NextRequest): NextResponse {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
