import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb } from '@/lib/server/rls-db';

const PUSH_TOKEN_SCOPE = { resolveOrganization: false } as const;

const PushTokenSchema = z.object({
  deviceId: z.string().uuid(),
  pushToken: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android']).optional(),
  name: z.string().max(120).optional(),
});

async function handlePushToken(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'mobile-push-token');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, PUSH_TOKEN_SCOPE);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse;

  const body = await request.json().catch(() => null);
  const parsed = PushTokenSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid push-token payload', parsed.error.flatten());
  }
  const { deviceId, pushToken, platform, name } = parsed.data;

  // The device id comes from the client and the row that holds it may belong to
  // another account, which the caller's own scope cannot see. Reading it over
  // the schema owner is what turns a takeover into a 403 instead of a
  // unique-violation 500 on the upsert below.
  const existing = await getNeonDb().query<{ user_id: string }>(
    `select user_id from public.mobile_devices where id = $1 limit 1`,
    [deviceId],
  );
  if (existing[0] && existing[0].user_id !== userId) {
    throw createError.forbidden('Device registered to another user');
  }

  try {
    await db.query(
      `
        insert into public.mobile_devices (id, user_id, platform, name, push_token, updated_at)
        values ($1, $2, $3, $4, $5, now())
        on conflict (id) do update set
          push_token = excluded.push_token,
          platform   = coalesce(excluded.platform, public.mobile_devices.platform),
          name       = coalesce(excluded.name, public.mobile_devices.name),
          updated_at = now()
        where public.mobile_devices.user_id = excluded.user_id
      `,
      [deviceId, userId, platform ?? null, name ?? null, pushToken],
    );
  } catch (error) {
    logger.error({ error, userId, deviceId }, 'Failed to upsert mobile push token');
    throw createError.internal('Failed to register push token');
  }

  return NextResponse.json({ success: true });
}

const DeleteTokenSchema = z.object({
  deviceId: z.string().uuid(),
});

async function handleDeletePushToken(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'mobile-push-token');
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, PUSH_TOKEN_SCOPE);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse;

  const deviceId = new URL(request.url).searchParams.get('deviceId');
  const parsed = DeleteTokenSchema.safeParse({ deviceId });
  if (!parsed.success) {
    throw createError.badRequest('Invalid deviceId', parsed.error.flatten());
  }

  try {
    await db.query(
      `update public.mobile_devices
         set push_token = null, updated_at = now()
       where id = $1 and user_id = $2`,
      [parsed.data.deviceId, userId],
    );
  } catch (error) {
    logger.error({ error, userId, deviceId: parsed.data.deviceId }, 'Failed to clear push token');
    throw createError.internal('Failed to clear push token');
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler(handlePushToken);
export const DELETE = withErrorHandler(handleDeletePushToken);
