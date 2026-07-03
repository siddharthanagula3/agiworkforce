/**
 * Mobile Push Token API
 *
 * POST /api/mobile/push-token — register/update the Expo push token for a
 * mobile device.
 * DELETE /api/mobile/push-token?deviceId=... — clear the push token for a
 * device on sign-out, so a subsequent different account on the same physical
 * device does not receive push notifications addressed to the prior account.
 *
 * Why this lives on the web app (not only the api-gateway): the mobile client
 * (`apps/mobile/services/notifications.ts`) posts to `${API_URL}/api/mobile/...`
 * where `API_URL` defaults to the web origin (`agiworkforce.com`) and is
 * authenticated with a Clerk **Bearer** token via the shared `api` client. The
 * api-gateway exposes the same path but under **JWT** auth on a different host,
 * so a token sent from the app never reached a handler — server-originated push
 * was undeliverable. This route accepts the existing Clerk-Bearer request and
 * upserts/clears the device row in the same Neon `public.mobile_devices` table
 * the gateway uses, so the push-sender path is unchanged. (The gateway's own
 * `DELETE /mobile/:deviceId` fully removes the device row for explicit device
 * management — unreachable from the mobile app for the same auth-mismatch
 * reason described above; this DELETE only clears push_token, matching the
 * softer "sign out" intent rather than "forget this device.")
 *
 * Unlike the gateway's `/push-token` (which requires a prior `/mobile/register`
 * and 404s otherwise), this route UPSERTs because the mobile app never registers
 * a device separately — it only ever sends `{ deviceId, pushToken }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';

const PushTokenSchema = z.object({
  /** Stable per-install device id (UUIDv4) from `apps/mobile/lib/deviceId.ts`. */
  deviceId: z.string().uuid(),
  /** Expo push token, e.g. `ExponentPushToken[...]`. */
  pushToken: z.string().min(1).max(512),
  platform: z.enum(['ios', 'android']).optional(),
  name: z.string().max(120).optional(),
});

async function handlePushToken(request: NextRequest) {
  // Bearer-authenticated requests (the mobile app) are bypassed inside
  // requireCsrfToken; cookie-auth callers still need a valid token.
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'mobile-push-token');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  const body = await request.json().catch(() => null);
  const parsed = PushTokenSchema.safeParse(body);
  if (!parsed.success) {
    throw createError.badRequest('Invalid push-token payload', parsed.error.flatten());
  }
  const { deviceId, pushToken, platform, name } = parsed.data;

  const db = getNeonDb();

  // Ownership guard: a device id may only ever belong to one user. Mirrors the
  // gateway's select-then-write check so a device can't be hijacked by id.
  const existing = await db.query<{ user_id: string }>(
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
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'mobile-push-token');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await requireCurrentUserId();

  const deviceId = new URL(request.url).searchParams.get('deviceId');
  const parsed = DeleteTokenSchema.safeParse({ deviceId });
  if (!parsed.success) {
    throw createError.badRequest('Invalid deviceId', parsed.error.flatten());
  }

  const db = getNeonDb();

  try {
    // Scoped to (id, user_id) — a device row belonging to a different user is
    // silently a no-op rather than an error, matching the fire-and-forget
    // "best effort" contract the mobile client already uses for this endpoint.
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
