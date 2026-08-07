import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';

/**
 * Expo push delivery — the repo's first push SEND path.
 *
 * VERIFIED BEFORE WRITING THIS: `POST /api/mobile/push-token` has been storing
 * `mobile_devices.push_token` all along and nothing anywhere read the column.
 * Tokens were collected and never used, which is why every push toggle was
 * removed from Settings (`NotificationsSection.tsx:22-31` records that decision
 * and says to re-add a group "once its underlying send path actually exists").
 * This is that path.
 *
 * # It never throws into the request path
 *
 * Same contract as `lib/support/handoff/resend-client.ts`: a scheduled task must
 * not be reported as failed because a push provider had a bad minute. Every
 * failure is logged and returned as a typed value. Delivery is best-effort by
 * nature — the device may be offline, uninstalled, or have revoked permission —
 * so treating it as critical would make an unreliable channel able to fail
 * reliable work.
 *
 * # Dead tokens are cleared, not retried forever
 *
 * Expo returns `DeviceNotRegistered` for an uninstalled app or a rotated token.
 * Left in place, that token is retried on every future notification forever.
 * Those rows have their `push_token` cleared — the DEVICE row is kept, because
 * it still records a device the user owns and deleting it would lose the name
 * and platform they see in settings.
 *
 * # SSRF surface: none
 *
 * The endpoint is a module constant. No part of it derives from a request.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const REQUEST_TIMEOUT_MS = 10_000;
/** Expo rejects batches larger than this. */
const MAX_TOKENS_PER_REQUEST = 100;

export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app as `notification.request.content.data`. */
  data?: Record<string, string>;
}

export interface PushDeliveryResult {
  /** Tokens Expo accepted. Acceptance is not proof the device displayed it. */
  sent: number;
  /** Tokens Expo rejected as no longer registered; these were cleared. */
  invalidated: number;
  /** Set when the send could not be attempted at all. */
  error?: string;
}

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo push tokens have a fixed, recognisable shape. Checking it locally avoids
 * spending a network round trip on a value that was never a push token — which
 * also means a corrupted column cannot turn into an outbound request.
 */
function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token) || /^[a-f0-9-]{36}$/i.test(token);
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Every usable push token registered to one account. */
export async function getPushTokensForUser(userId: string): Promise<string[]> {
  const rows = await getNeonDb().query<{ push_token: string }>(
    `select push_token
       from public.mobile_devices
      where user_id = $1
        and push_token is not null
        and push_token <> ''`,
    [userId],
  );
  return rows.map((row) => row.push_token).filter(isExpoPushToken);
}

/** Clear tokens Expo reported as no longer registered. */
async function invalidateTokens(tokens: readonly string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await getNeonDb().execute(
      `update public.mobile_devices
          set push_token = null, updated_at = now()
        where push_token = any($1::text[])`,
      [tokens],
    );
  } catch (error) {
    // A failed cleanup means one wasted send next time, not a lost notification.
    logger.warn({ error, count: tokens.length }, '[push] failed to clear invalidated tokens');
  }
}

/**
 * Send one message to every device registered to a user.
 *
 * Returns rather than throws. A caller that treats delivery as required is
 * misusing this: the user may have no devices, no permission, or no network.
 */
export async function sendPushToUser(
  userId: string,
  message: PushMessage,
): Promise<PushDeliveryResult> {
  let tokens: string[];
  try {
    tokens = await getPushTokensForUser(userId);
  } catch (error) {
    logger.warn({ error, userId }, '[push] could not load device tokens');
    return { sent: 0, invalidated: 0, error: 'token_lookup_failed' };
  }

  if (tokens.length === 0) return { sent: 0, invalidated: 0 };

  let sent = 0;
  const invalid: string[] = [];

  for (const batch of chunk(tokens, MAX_TOKENS_PER_REQUEST)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            ...(message.data ? { data: message.data } : {}),
            sound: 'default',
          })),
        ),
        signal: controller.signal,
      });

      if (!response.ok) {
        logger.warn({ status: response.status, userId }, '[push] Expo rejected the batch');
        continue;
      }

      const payload = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          sent += 1;
          return;
        }
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = batch[index];
          if (token) invalid.push(token);
        }
      });
    } catch (error) {
      // Includes the timeout abort. Best-effort by design.
      logger.warn({ error, userId }, '[push] send failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  await invalidateTokens(invalid);
  return { sent, invalidated: invalid.length };
}
