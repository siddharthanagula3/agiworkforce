import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { LocalCodeSessionActivitySchema } from '@agiworkforce/cloud-contracts';
import { requireCsrfToken } from '@/lib/csrf';
import { readRequestingDevice } from '@/lib/device-steps/requesting-device';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { notifyLocalCodeSessionEvent } from '@/lib/services/agent-notification-service';

export const runtime = 'nodejs';

async function handleActivity(request: NextRequest) {
  const { db, userId } = await getUserScopedDb(request);
  const limited = await withRateLimit(request, 'code-session-activity', `user:${userId}`);
  if (limited) return limited;
  const csrfError = await requireCsrfToken(request, userId);
  if (csrfError) return csrfError as NextResponse;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid JSON request body');
  }
  const parsed = LocalCodeSessionActivitySchema.safeParse(body);
  if (!parsed.success) throw createError.validation('Local session activity is not valid');

  const device = await readRequestingDevice(db, request, userId);
  const { pushed } = await notifyLocalCodeSessionEvent(db, {
    userId,
    deviceName: device?.name ?? null,
    activity: parsed.data,
  });
  return NextResponse.json({ pushed });
}

export const POST = withErrorHandler(handleActivity);
