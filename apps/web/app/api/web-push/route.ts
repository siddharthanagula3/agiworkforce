import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { requireCurrentUserId } from '@/lib/server/neon-chat';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { getWebPushPublicKey, isDeliverableSubscription } from '@/lib/services/web-push-service';

export const runtime = 'nodejs';

const RATE_LIMIT_BUCKET = 'web-push';

const PUSH_SCOPE = { resolveOrganization: false } as const;

const MAX_ENDPOINT_CHARS = 2048;
const MAX_P256DH_CHARS = 200;
const MAX_AUTH_CHARS = 100;
const MAX_USER_AGENT_CHARS = 256;

const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(MAX_ENDPOINT_CHARS),
  keys: z.object({
    p256dh: z.string().min(1).max(MAX_P256DH_CHARS),
    auth: z.string().min(1).max(MAX_AUTH_CHARS),
  }),
});

const UnsubscribeSchema = z.object({
  endpoint: z.string().url().max(MAX_ENDPOINT_CHARS),
});

async function readSubscription(request: NextRequest) {
  const parsed = SubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid push subscription', parsed.error.flatten());
  }
  const subscription = {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  };
  if (!isDeliverableSubscription(subscription)) {
    throw createError.badRequest('Push subscription is not a usable Web Push registration');
  }
  return subscription;
}

async function handleReadConfiguration(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  await requireCurrentUserId(request);

  return NextResponse.json({ publicKey: getWebPushPublicKey() });
}

async function handleSubscribe(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, PUSH_SCOPE);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const subscription = await readSubscription(request);
  const userAgent = request.headers.get('user-agent')?.slice(0, MAX_USER_AGENT_CHARS) ?? null;

  // The endpoint is a globally unique key the browser mints, and the row that
  // holds it may belong to another account, which the caller's own scope cannot
  // see. Reading it over the schema owner is what turns a takeover into a 403
  // instead of a unique-violation 500 on the upsert below.
  const existing = await getNeonDb().query<{ user_id: string }>(
    `select user_id
       from public.web_push_subscriptions
      where endpoint = $1
      limit 1`,
    [subscription.endpoint],
  );
  if (existing[0] && existing[0].user_id !== userId) {
    throw createError.forbidden('Push subscription registered to another user');
  }

  try {
    await db.execute(
      `insert into public.web_push_subscriptions
         (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (endpoint) do update set
         p256dh       = excluded.p256dh,
         auth         = excluded.auth,
         user_agent   = excluded.user_agent,
         last_seen_at = now()
       where public.web_push_subscriptions.user_id = excluded.user_id`,
      [userId, subscription.endpoint, subscription.p256dh, subscription.auth, userAgent],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to store web push subscription');
    throw createError.internal('Failed to register for notifications');
  }

  return NextResponse.json({ success: true });
}

async function handleUnsubscribe(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, RATE_LIMIT_BUCKET);
  if (rateLimitResponse) return rateLimitResponse;

  const { db, userId } = await getUserScopedDb(request, PUSH_SCOPE);

  const csrfResponse = await requireCsrfToken(request, userId);
  if (csrfResponse) return csrfResponse as NextResponse;

  const parsed = UnsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.badRequest('Invalid endpoint', parsed.error.flatten());
  }

  try {
    await db.execute(
      `delete from public.web_push_subscriptions
        where endpoint = $1 and user_id = $2`,
      [parsed.data.endpoint, userId],
    );
  } catch (error) {
    logger.error({ error, userId }, 'Failed to remove web push subscription');
    throw createError.internal('Failed to turn off notifications');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleReadConfiguration);
export const POST = withErrorHandler(handleSubscribe);
export const DELETE = withErrorHandler(handleUnsubscribe);
